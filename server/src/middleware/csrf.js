import crypto from 'crypto';
import { env } from '../config/env.js';

const CSRF_COOKIE = 'ev_csrf';
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isAllowedOrigin(origin) {
  if (!origin) return false;
  const urls = env.ALLOWED_ORIGINS.length ? env.ALLOWED_ORIGINS : [env.CLIENT_URL];
  return urls.some((u) => {
    if (!u) return false;
    const host = u.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return origin === `https://${host}` || origin === `http://${host}` || origin === u;
  });
}

function csrfCookieOptions() {
  return {
    httpOnly: false,
    sameSite: 'lax',
    secure: env.isProduction,
    path: '/',
  };
}

// Returns the current token, minting one if the request does not already carry
// it. Split out of csrfProtect so that routes which run ahead of the /api
// middleware chain - /api/health and /api/csrf - can still hand a client the
// cookie it needs before its first POST.
export function ensureCsrfCookie(req, res) {
  let csrf = req.cookies?.[CSRF_COOKIE];
  if (!csrf) {
    csrf = crypto.randomBytes(24).toString('hex');
    res.cookie(CSRF_COOKIE, csrf, csrfCookieOptions());
  }
  return csrf;
}

export function csrfProtect(req, res, next) {
  const csrf = ensureCsrfCookie(req, res);

  if (MUTATING.has(req.method)) {
    const origin = req.headers.origin || req.headers.referer;
    const headerToken = req.headers['x-csrf-token'];
    if (!isAllowedOrigin(origin)) {
      return res.status(403).json({ error: 'Origin not allowed' });
    }
    if (!headerToken || headerToken !== csrf) {
      return res.status(403).json({ error: 'Invalid CSRF token' });
    }
  }

  next();
}

export function setFreshCsrf(req, res, next) {
  try {
    const csrf = crypto.randomBytes(24).toString('hex');
    res.cookie(CSRF_COOKIE, csrf, csrfCookieOptions());
    req.freshCsrf = csrf;
  } catch {
    /* ignore */
  }
  next();
}
