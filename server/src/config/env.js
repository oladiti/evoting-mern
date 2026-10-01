import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const bool = (v, d = false) => {
  if (v === undefined || v === '') return d;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
};
const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const oneOf = (v, allowed, d) => {
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  return allowed.includes(s) ? s : d;
};

const isProd = process.env.NODE_ENV === 'production';

// Refuse to boot on a weak or absent JWT secret. The previous fallback,
// `process.env.JWT_SECRET || 'insecure-dev-secret'`, did not crash when the
// variable was missing - it quietly signed every access token with a string
// that is published in this repository, so anyone could mint a token for any
// user id, including an admin. A development convenience is not worth a
// production account-takeover path, and the failure is loud and immediate in
// the case that actually matters.
//
// The dev secret survives for `npm run dev` only, and is still replaced by
// anything the developer sets in server/.env.
const DEV_JWT_SECRET = 'insecure-dev-secret';
function resolveJwtSecret() {
  const secret = (process.env.JWT_SECRET || '').trim();
  if (secret) {
    if (isProd && secret.length < 32) {
      throw new Error("JWT_SECRET must be at least 32 characters in production. Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"");
    }
    return secret;
  }
  if (isProd) {
    throw new Error(
      'JWT_SECRET is not set. The server refuses to start in production without it, because the fallback ' +
        'development secret is public and would let anyone forge an admin session. ' +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\" and add it to server/.env."
    );
  }
  console.warn('[env] JWT_SECRET is not set - using the well-known development secret. Never do this in production.');
  return DEV_JWT_SECRET;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  PORT: num(process.env.PORT, 5000),
  CLIENT_URL: process.env.CLIENT_URL || 'https://localhost:5173',
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  JWT_SECRET: resolveJwtSecret(),
  JWT_EXPIRES: process.env.JWT_EXPIRES || '30m',
  REMEMBER_EXPIRES: process.env.REMEMBER_EXPIRES || '30d',
  SITE_NAME: process.env.SITE_NAME || 'E-Voting System',
  // Content-Security-Policy rollout switch. 'report-only' sends the policy as
  // Content-Security-Policy-Report-Only, so violations are logged by the browser
  // but nothing is blocked - that is the safe default because a wrong directive
  // would otherwise break the reCAPTCHA widget or the face camera outright.
  // Flip to 'enforce' once the console is clean. 'off' sends no policy at all.
  CSP_MODE: oneOf(process.env.CSP_MODE, ['off', 'report-only', 'enforce'], 'report-only'),
  DB_URI: process.env.DB_URI || 'mongodb://127.0.0.1:27017/evoting',
  // Where candidate and face photos are written. Left empty in development, which
  // is what keeps uploads/ inside the repo where it has always lived.
  //
  // It has to be overridable because the directory is local disk, and the disk a
  // container gets is ephemeral: on Render every deploy and every restart throws
  // it away, taking enrolled face descriptors' photos with it. Face enrolment is
  // not recoverable automatically - a voter whose photo is gone has to re-enrol
  // by hand. Point this at a mounted persistent disk in any deployed
  // environment. See render.yaml.
  UPLOADS_DIR: process.env.UPLOADS_DIR || '',
  MYSQL: {
    host: process.env.MYSQL_HOST || 'localhost',
    port: num(process.env.MYSQL_PORT, 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASS || '',
    database: process.env.MYSQL_DB || 'evoting',
  },
  MAIL: {
    host: process.env.MAIL_HOST || '',
    port: num(process.env.MAIL_PORT, 465),
    secure: bool(process.env.MAIL_SECURE, true),
    user: process.env.MAIL_USERNAME || '',
    pass: process.env.MAIL_PASSWORD || '',
    from: process.env.MAIL_FROM || process.env.MAIL_USERNAME || '',
    to: process.env.MAIL_TO || '',
  },
  RECAPTCHA: {
    siteKey: process.env.RECAPTCHA_SITE_KEY || '',
    secretKey: process.env.RECAPTCHA_SECRET_KEY || '',
    // Escape hatch for when reCAPTCHA is enabled but the keys are missing or
    // Google is unreachable. Off by default: the correct behaviour for a
    // misconfigured captcha on an election system is to refuse the request and
    // say so, not to let it through unverified. See services/captcha.js.
    failOpen: bool(process.env.RECAPTCHA_FAIL_OPEN, false),
  },
  GEOFENCE: {
    lat: num(process.env.GEOFENCE_LAT, 6.5438),
    lng: num(process.env.GEOFENCE_LNG, 3.1183),
    radius: num(process.env.GEOFENCE_RADIUS, 1500),
  },
};
