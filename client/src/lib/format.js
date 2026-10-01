import { api } from './api';

export { slugify } from './slugify';

export function photoUrl(p) {
  if (!p) return null;
  if (/^https?:\/\//.test(p)) return p;
  if (p.startsWith('/uploads')) return p;
  return `/uploads/${p.replace(/^uploads\//, '')}`;
}

export function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDateShort(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// slugify now lives in ./slugify so it can be imported without dragging in the
// api client; it is re-exported above so existing `from '../lib/format'` call
// sites keep working.

export async function loadPublicBootstrap() {
  return api.get('/api/auth/bootstrap').catch(() => ({}));
}
