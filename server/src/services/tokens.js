import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env.js';
import RefreshToken from '../models/RefreshToken.js';
import User from '../models/User.js';
import { getSetting } from './settings.js';

export async function signAccessToken(user, remember = false) {
  let expiresIn;
  if (remember) {
    expiresIn = env.REMEMBER_EXPIRES;
  } else {
    const minutes = await getSetting('session_timeout_minutes', 30);
    const m = Number(minutes);
    expiresIn = `${Number.isFinite(m) && m > 0 ? m : 30}m`;
  }
  return jwt.sign({ sub: String(user._id), role: user.is_admin ? 'admin' : 'voter' }, env.JWT_SECRET, {
    expiresIn,
  });
}

export async function verifyAccessToken(token) {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    return await User.findById(payload.sub);
  } catch {
    return null;
  }
}

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// A token that was already rotated is normally a replay. But two browser tabs
// opening the same app, or a retry from a mobile network that duplicated the
// request, can present the same token twice within a second of each other. Those
// are not attacks, and treating them as one logs a legitimate voter out at
// random, so a short window re-issues the successor idempotently instead. The
// window has to stay small: it is the only thing standing between "user gets
// logged out" and "stolen token stays usable for its full 30 days".
const ROTATION_GRACE_MS = 10 * 1000;

const newFamilyId = () => crypto.randomBytes(16).toString('hex');
const newTokenValue = () => crypto.randomBytes(48).toString('hex');

export async function createRefreshToken(user, { session = false, family = null } = {}) {
  const token = newTokenValue();
  const expires_at = new Date(Date.now() + REFRESH_TTL_MS);
  await RefreshToken.create({ user: user._id, token, expires_at, session, family: family || newFamilyId() });
  return token;
}

// Returns { token, user, session } on success.
//
// Throws RefreshReuseError when a token that was already exchanged is presented
// outside the grace window. By then either an attacker has a copy of a stolen
// token or a real session has been cloned, and the only safe move is to kill
// the whole family so whoever holds the tokens has to log in again.
export async function rotateRefreshToken(token) {
  const doc = await RefreshToken.findOne({ token }).populate('user');
  if (!doc) return null;
  if (doc.expires_at < new Date() || !doc.user) {
    await RefreshToken.deleteOne({ _id: doc._id });
    return null;
  }

  if (doc.used_at) {
    const sinceRotation = Date.now() - new Date(doc.used_at).getTime();
    if (sinceRotation <= ROTATION_GRACE_MS && doc.replaced_by) {
      // Concurrent request for the same token: hand back the successor we
      // already issued rather than rotating again, which would make the other
      // caller look like a replay.
      return { token: doc.replaced_by, user: doc.user, session: !!doc.session };
    }
    await revokeTokenFamily(doc.family);
    throw new RefreshReuseError(doc.user);
  }

  const newToken = newTokenValue();
  doc.token = newToken;
  doc.used_at = new Date();
  doc.replaced_by = newToken;
  doc.expires_at = new Date(Date.now() + REFRESH_TTL_MS);
  // Tokens issued before families existed have no family id. Backfill one on
  // their first rotation so they gain reuse detection instead of silently
  // opting out of it forever.
  if (!doc.family) doc.family = newFamilyId();
  await doc.save();
  return { token: newToken, user: doc.user, session: !!doc.session };
}

export class RefreshReuseError extends Error {
  constructor(user) {
    super('Refresh token reuse detected - all sessions for this account have been revoked.');
    this.name = 'RefreshReuseError';
    this.status = 401;
    this.expose = true;
    this.user = user;
  }
}

export async function revokeRefreshToken(token) {
  if (token) await RefreshToken.deleteOne({ token });
}

export async function revokeTokenFamily(family) {
  if (!family) return 0;
  const res = await RefreshToken.deleteMany({ family });
  return res?.deletedCount || 0;
}

// Ends every session for a user across all devices. Called on password reset
// and password change: previously the password was swapped and the existing
// refresh tokens kept working, so a session opened with the old credentials
// survived the very event that is supposed to end it.
export async function revokeAllRefreshTokens(userId) {
  if (!userId) return 0;
  const res = await RefreshToken.deleteMany({ user: userId });
  return res?.deletedCount || 0;
}

export function accessCookieOptions(remember = false) {
  const opts = {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProduction,
    path: '/',
  };
  if (remember) opts.maxAge = 30 * 24 * 60 * 60 * 1000;
  return opts;
}

export const refreshCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.isProduction,
  path: '/',
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

// For non-"remember me" sessions: same security, but no maxAge so the refresh
// cookie is a browser-session cookie that disappears when the browser closes.
export const sessionRefreshCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.isProduction,
  path: '/',
};

export function clearAuthCookies(res) {
  res.clearCookie('ev_access', { path: '/' });
  res.clearCookie('ev_refresh', { path: '/' });
}
