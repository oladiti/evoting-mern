import crypto from 'crypto';
import { env } from '../config/env.js';

export function sanitize(str = '') {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export function randomHex(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

export function randomCode(length = 6) {
  const max = Math.pow(10, length);
  return String(Math.floor(crypto.randomInt(0, max))).padStart(length, '0');
}

export function sha256(str = '') {
  return crypto.createHash('sha256').update(str).digest('hex');
}

export function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || req.connection?.remoteAddress || '';
}

export function validators() {
  return {
    username(v) {
      return /^[a-zA-Z0-9_]{3,30}$/.test(v || '');
    },
    matric(v) {
      return /^[A-Za-z0-9/]+$/.test(v || '');
    },
    email(v) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || '');
    },
    password(v) {
      return v && v.length >= 8 && /[a-z]/.test(v) && /[A-Z]/.test(v) && /[0-9]/.test(v);
    },
    is128Descriptor(v) {
      return Array.isArray(v) && v.length === 128 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
    },
  };
}

export function escapeRegExp(s = '') {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Builds the public URL segment for an election ("Student Union 2026" ->
// "student-union-2026"). Diacritics are stripped rather than transliterated so
// "Nacion" and "Nación" collapse to the same slug. The charset is restricted to
// [a-z0-9-] on purpose: these values are interpolated into request paths without
// encodeURIComponent (see lib/api.js), and /results/:idOrSlug is a single
// segment, so a slash or question mark would corrupt the route.
export function slugify(str = '', { maxLength = 80, fallback = 'election' } = {}) {
  const base = String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
  return base || fallback;
}

export function apify(doc) {
  if (!doc) return null;
  if (Array.isArray(doc)) return doc.map((d) => (d?.toJSON ? d.toJSON() : d));
  return typeof doc.toJSON === 'function' ? doc.toJSON() : doc;
}

// The single source of truth for links we put in outbound email. It reads
// server config only and never touches the request.
//
// This is deliberately NOT derived from a request header. The previous
// implementation preferred `x-client-url` over CLIENT_URL, which let any
// non-browser client (CORS constrains browsers only) request a reset for a
// victim's address with x-client-url pointing at an attacker domain. The
// victim then received a genuine email from the real SMTP server holding a
// valid token, on the attacker's origin - a full account takeover. Every
// outbound link must go through here so that class of bug has exactly one
// place to live.
export function publicUrl(pathname = '/', params = {}) {
  const base = env.CLIENT_URL.replace(/\/+$/, '');
  const suffix = String(pathname).startsWith('/') ? pathname : `/${pathname}`;
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  if (!entries.length) return `${base}${suffix}`;
  const search = new URLSearchParams(entries).toString();
  return `${base}${suffix}${suffix.includes('?') ? '&' : '?'}${search}`;
}
