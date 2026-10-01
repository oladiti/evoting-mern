import { env } from '../config/env.js';
import { getSetting } from '../services/settings.js';
import { DB_UNAVAILABLE_MESSAGE } from '../config/db.js';

const MAINTENANCE_EXEMPT = new Set(['/api/health', '/api/auth/login', '/api/csrf']);

export async function maintenanceGate(req, res, next) {
  try {
    const maintenance = await getSetting('maintenance_mode_enabled', false);
    // Compared without the query string. req.originalUrl carries it, so an
    // exempt path that happened to be called with one - /api/auth/login?next=/x -
    // missed the set and got the maintenance page instead of signing the user in,
    // which is the one outcome maintenance mode must never produce.
    const pathname = String(req.originalUrl || req.url).split('?')[0];
    if (maintenance && !MAINTENANCE_EXEMPT.has(pathname)) {
      const message = (await getSetting('maintenance_message', 'Under maintenance')) || 'Under maintenance';
      return res.status(503).json({ error: message });
    }
    next();
  } catch {
    next();
  }
}

export function notFound(req, res, next) {
  res.status(404).json({ error: 'Not found' });
}

// A database outage is not an application fault and must not read as one: 500
// says "this request is broken", 503 says "come back shortly", and the client
// only retries the latter.
const TRANSIENT_DB_ERRORS = new Set(['MongoNetworkError', 'MongoNetworkTimeoutError', 'MongoServerSelectionError', 'MongoNotConnectedError', 'MongoTopologyClosedError']);

function isTransientDBError(err) {
  if (!err) return false;
  if (TRANSIENT_DB_ERRORS.has(err.name)) return true;
  return err.name === 'MongooseError' && /buffering timed out|Client must be connected/i.test(err.message || '');
}

export function errorHandler(err, req, res, next) {
  if (err?.name === 'MulterError') {
    return res.status(400).json({ error: err.message });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ error: 'A record with that value already exists' });
  }
  if (err?.name === 'CastError') {
    return res.status(404).json({ error: 'Not found' });
  }
  if (isTransientDBError(err)) {
    console.error(`[error] ${req.method} ${req.originalUrl} -> 503 (database unavailable)`, err?.message || err);
    return res.status(503).json({ error: DB_UNAVAILABLE_MESSAGE });
  }

  const status = err?.status || 500;
  // The full error always goes to the log. In production the raw message is not
  // echoed back, because it leaks driver internals and stack detail to the
  // browser; outside production it is kept, since that message is often the only
  // clue when developing against a local database.
  console.error(`[error] ${req.method} ${req.originalUrl} -> ${status}`, err);

  // `expose: true` is the http-errors convention for "this message was written
  // for the client and contains no internals". Server misconfigurations use it
  // deliberately, so a broken captcha key reports itself instead of the useless
  // blanket "Internal server error".
  const safeToExpose = env.isProduction ? Boolean(err?.expose) : true;
  const message = safeToExpose ? err?.message || 'Internal server error' : 'Internal server error';
  res.status(status).json({ error: message });
}
