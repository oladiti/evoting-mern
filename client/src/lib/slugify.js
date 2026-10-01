// Kept in its own dependency-free module so server/tests/slugify.test.js can
// import it directly and assert parity with the server implementation. It used
// to live in lib/format.js, which imports lib/api.js - pulling the whole fetch
// wrapper in just to compare a string function.
//
// The server copy in server/src/utils/index.js is the authority: it re-runs
// this on save and appends -2/-3 if the slug is taken, so a stale preview in
// the admin form can never persist a duplicate.
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
