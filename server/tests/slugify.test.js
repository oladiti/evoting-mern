import { describe, it, expect } from 'vitest';
import { slugify as serverSlugify } from '../src/utils/index.js';
import { slugify as clientSlugify } from '../../client/src/lib/slugify.js';

// The admin form previews the URL it is about to produce, then the server
// re-runs the same transform on save. If the two implementations ever diverge
// the preview lies, and a slug the admin did not intend is what lands in the
// database - which then breaks the /results/:idOrSlug link, because that is a
// single path segment and these values are interpolated into it without
// encodeURIComponent.
//
// The duplication exists because the client and server are separate Vite and
// Node build roots and cannot import each other's modules. This file is the
// guard that makes the duplication safe.

const CORPUS = [
  'Student Union 2026',
  'Nacion',
  'Nación',
  'SUG President',
  '  Multiple   spaces  ',
  'Trailing---',
  '---Leading',
  'ALL CAPS',
  'Mixed_Case-And.Dots',
  'slash/in/slug',
  'question?mark',
  'hash#tag',
  'amp&sand',
  'emoji \u{1F1EC}\u{1F1F9}',
  'a'.repeat(200),
  'a-'.repeat(60),
  'Ünïcödé Ströng',
  'ñandú',
  '2026',
  '!!!',
  '',
  '   ',
  '...',
  null,
  undefined,
  123,
  {},
];

describe('slugify (server implementation)', () => {
  it('lowercases and hyphenates', () => {
    expect(serverSlugify('Student Union 2026')).toBe('student-union-2026');
  });

  it('strips diacritics by decomposition rather than transliterating, so Nacion and Nación collapse together', () => {
    expect(serverSlugify('Nacion')).toBe('nacion');
    expect(serverSlugify('Nación')).toBe('nacion');
  });

  it('collapses runs of separators into a single hyphen', () => {
    expect(serverSlugify('a   b')).toBe('a-b');
    expect(serverSlugify('a///b')).toBe('a-b');
    expect(serverSlugify('a---b')).toBe('a-b');
  });

  it('trims leading and trailing hyphens', () => {
    expect(serverSlugify('---Leading')).toBe('leading');
    expect(serverSlugify('Trailing---')).toBe('trailing');
  });

  // /results/:idOrSlug is a single path segment and is interpolated without
  // encodeURIComponent, so a slash or question mark in a slug would corrupt
  // the route. Restricting to [a-z0-9-] is what prevents that.
  it('never emits a character outside [a-z0-9-]', () => {
    for (const input of CORPUS) {
      expect(serverSlugify(input)).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('never emits a leading or trailing hyphen, even after truncation', () => {
    expect(serverSlugify('a-'.repeat(60))).not.toMatch(/-$/);
    expect(serverSlugify('a-'.repeat(60))).not.toMatch(/^-/);
  });

  it('respects maxLength and still does not end on a hyphen', () => {
    const out = serverSlugify('a'.repeat(200));
    expect(out.length).toBeLessThanOrEqual(80);
    const short = serverSlugify('word '.repeat(40), { maxLength: 10 });
    expect(short.length).toBeLessThanOrEqual(10);
    expect(short).not.toMatch(/-$/);
  });

  it('falls back when nothing survives normalisation', () => {
    expect(serverSlugify('')).toBe('election');
    expect(serverSlugify('   ')).toBe('election');
    expect(serverSlugify('!!!')).toBe('election');
    expect(serverSlugify('\u{1F1EC}\u{1F1F9}')).toBe('election');
    expect(serverSlugify('', { fallback: 'nope' })).toBe('nope');
  });

  // Note the coercion: String(null) is "null" and String({}) is "[object
  // Object]", so those produce a (valid, if odd) slug rather than the fallback.
  // Harmless in practice - the only caller passes an election title, and
  // Election.slug is normalised in a pre-validate hook - but pinned here so a
  // change to the coercion is a deliberate one.
  it('tolerates non-string input by coercing it', () => {
    expect(serverSlugify(undefined)).toBe('election');
    expect(serverSlugify(null)).toBe('null');
    expect(serverSlugify(123)).toBe('123');
    expect(serverSlugify({})).toBe('object-object');
  });
});

describe('slugify (server/client parity)', () => {
  // The actual point of this file: the two implementations must never diverge.
  it('produces identical output for every corpus entry', () => {
    for (const input of CORPUS) {
      expect(clientSlugify(input)).toBe(serverSlugify(input));
    }
  });

  it('produces identical output for the same options', () => {
    const optionSets = [
      { maxLength: 80, fallback: 'election' },
      { maxLength: 20, fallback: 'x' },
      { maxLength: 5, fallback: '' },
      { maxLength: 200, fallback: 'default' },
    ];
    for (const input of CORPUS) {
      for (const opts of optionSets) {
        expect(clientSlugify(input, opts)).toBe(serverSlugify(input, opts));
      }
    }
  });

  it('is idempotent - slugifying a slug changes nothing', () => {
    for (const input of CORPUS) {
      const once = serverSlugify(input);
      expect(serverSlugify(once)).toBe(once);
    }
  });
});
