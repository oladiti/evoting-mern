import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { helmetCspOptions, REPORT_URI } from './config/csp.js';
import { cspReportHandler, cspReportParser } from './middleware/cspReport.js';
import { isDBReady, waitUntilReady, DB_UNAVAILABLE_MESSAGE } from './config/db.js';
import { csrfProtect, ensureCsrfCookie } from './middleware/csrf.js';
import { maintenanceGate, notFound, errorHandler } from './middleware/error.js';
import authRoutes from './routes/auth.js';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';
import { uploadsDir } from './middleware/upload.js';
import { ensureDefaultSettings } from './services/settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.set('trust proxy', 1);

const allowedOrigins = env.ALLOWED_ORIGINS.length ? env.ALLOWED_ORIGINS : [env.CLIENT_URL];

// Content-Security-Policy. The app used to run with the CSP switched off
// entirely, which meant any injected <script> was free to run and exfiltrate.
//
// The directives live in ./config/csp.js because the dev server needs the same
// list and the two used to be hand-maintained copies of each other. See the
// module for the reasoning behind each entry.

// camera and geolocation are the only two features this app actually exercises:
// FaceCamera.jsx calls getUserMedia for enrolment and verification, and
// useGeolocation.js backs the geofence on the vote page. Everything else is
// denied outright, so a malicious or compromised dependency cannot reach the
// microphone, payment, USB, or the advertising topics API.
//
// helmet 8 ships no Permissions-Policy middleware (verified against 8.3.0 - the
// header name appears nowhere in it), so this has to be set by hand.
const PERMISSIONS_POLICY = ['camera=(self)', 'geolocation=(self)', 'microphone=()', 'payment=()', 'usb=()', 'browsing-topics=()', 'interest-cohort=()'].join(', ');

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Requested-With'],
  })
);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: helmetCspOptions(env.CSP_MODE),
  })
);

app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
  next();
});

// The one route that legitimately carries a whole database export, so it gets
// its own generous parser. It has to be registered *before* the global 256kb
// parser below: body-parser marks a body as consumed, so whichever limit runs
// first wins and the later one skips. Mounting it here means only this exact
// path gets the large allowance - the rest of the admin API keeps the tight one.
app.use('/api/admin/restore', express.json({ limit: '50mb' }));

// The largest legitimate payload in this app is a 128-float face descriptor
// wrapped in a form - a few kilobytes. The previous 50mb ceiling was inherited
// from the PHP migration and made every endpoint a memory-pressure lever: a
// handful of concurrent 50mb bodies is enough to exhaust a small instance.
// 256kb covers the largest normal request with room to spare.
//
// The one exception is POST /api/admin/restore, which legitimately carries a
// whole database export. It is mounted with its own limit just above, so
// lifting the ceiling for it does not hand 50mb to every other route.
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb' }));
app.use(cookieParser());

// Scope-limiting /api, generous global limiter
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 1000,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Static uploads (candidate photos + face photos) — no execution, flat files only
app.use(
  '/uploads',
  express.static(uploadsDir, {
    fallthrough: false,
    setHeaders(res) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  })
);

// Registered ahead of the /api maintenance gate on purpose: the gate hits the
// settings collection, so leaving health behind it would make the one endpoint
// that can describe a database outage depend on the database being up.
// ok is false while the database is unreachable, which is the honest answer and
// is what distinguishes "degraded" from "healthy".
app.get('/api/health', (req, res) => {
  ensureCsrfCookie(req, res);
  const dbReady = isDBReady();
  res.status(dbReady ? 200 : 503).json({
    ok: dbReady,
    db: dbReady ? 'connected' : 'disconnected',
    dbState: mongoose.connection.readyState,
    uptime: process.uptime(),
  });
});

// Lets a client obtain a CSRF token without depending on a route that may be
// gated, blocked by maintenance mode, or slow because of the database.
app.get('/api/csrf', (req, res) => {
  res.json({ csrfToken: ensureCsrfCookie(req, res) });
});

// Where the CSP's report-uri points. Registered here, with /api/health and
// /api/csrf, rather than with the routes below, and the placement is the whole
// point:
//
//   - Ahead of csrfProtect. A browser posts a CSP report with no custom headers,
//     so it cannot carry X-CSRF-Token and csrfProtect would reject every report
//     with 403. The reports would silently never arrive.
//   - Ahead of the rate limiter, for the same reason it must not be queued
//     behind 1000 requests per 15 minutes shared with the whole API.
//   - Ahead of the maintenance gate and awaitDatabase. A report has to be
//     accepted when the site is broken, which is precisely when a violation is
//     most likely and most worth having. A report that depends on a healthy
//     database cannot tell you the site is unhealthy.
//
// Being unauthenticated is correct and is not a hole: the handler only ever
// writes to the console, only ever redacts what it writes, and answers 204
// either way.
if (env.CSP_MODE !== 'off') {
  app.post(REPORT_URI, cspReportParser, cspReportHandler);
}

// Mounted ahead of every database-backed route, and behind /api/health and
// /api/csrf above on purpose: the connection is still being established for the
// first seconds after the process starts, and the old arrangement let a request
// arriving in that window be buffered by mongoose until bufferTimeoutMS expired
// and then rejected as 503. The listener is deliberately opened before the
// database is touched (see server.js), so without this gate the start-up cost
// shows up to users as a failed sign-in rather than as a slow one.
//
// In steady state this is one boolean check and returns on the next tick, so it
// adds no measurable latency. Only a request that arrives before the first
// connection completes waits, and the wait is bounded - if the database really is
// unreachable the request is still answered, with the same 503 body the error
// handler emits so the client can tell a recoverable database outage apart from
// a genuine server fault.
const DB_WAIT_TIMEOUT_MS = 20000;

async function awaitDatabase(_req, res, next) {
  if (isDBReady()) return next();
  if (await waitUntilReady(DB_WAIT_TIMEOUT_MS)) return next();
  res.setHeader('Retry-After', '5');
  return res.status(503).json({ error: DB_UNAVAILABLE_MESSAGE });
}

app.use('/api', awaitDatabase, maintenanceGate, csrfProtect);
app.use('/api/auth', authRoutes);
app.use('/api', publicRoutes);
app.use('/api/admin', adminRoutes);

// Optional: serve built React client in production
if (env.isProduction) {
  const dist = path.resolve(__dirname, '../../client/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^(?!\/api|\/uploads).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
}

app.use(notFound);
app.use(errorHandler);

export { app, ensureDefaultSettings };
