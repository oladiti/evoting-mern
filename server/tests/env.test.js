import { describe, it, expect, afterEach, vi } from 'vitest';

// env.js runs dotenv and calls resolveJwtSecret() at module scope, so each case
// has to re-import the module with the process environment stubbed. vi.resetModules
// plus a dynamic import is the way to do that.
//
// The old line was `process.env.JWT_SECRET || 'insecure-dev-secret'`, which did
// not crash when the variable was missing - it signed every access token with a
// string published in the repository, so anyone could mint a token for any user
// id including an admin.

const ORIGINAL_ENV = { ...process.env };

async function loadEnvWith(stubs) {
  vi.resetModules();
  for (const [k, v] of Object.entries(stubs)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import('../src/config/env.js');
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('JWT_SECRET resolution', () => {
  it('refuses to boot in production when JWT_SECRET is absent', async () => {
    // Isolate from server/.env, which supplies a real secret on this machine.
    vi.doMock('dotenv', () => ({ default: { config: vi.fn() } }));
    await expect(loadEnvWith({ NODE_ENV: 'production', JWT_SECRET: undefined })).rejects.toThrow(/JWT_SECRET is not set/i);
    vi.doUnmock('dotenv');
  });

  it('rejects a secret shorter than 32 characters in production', async () => {
    vi.doMock('dotenv', () => ({ default: { config: vi.fn() } }));
    await expect(loadEnvWith({ NODE_ENV: 'production', JWT_SECRET: 'too-short' })).rejects.toThrow(/at least 32 characters/i);
    vi.doUnmock('dotenv');
  });

  it('accepts a 32-character secret in production', async () => {
    vi.doMock('dotenv', () => ({ default: { config: vi.fn() } }));
    const { env } = await loadEnvWith({ NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(32) });
    expect(env.JWT_SECRET).toHaveLength(32);
    expect(env.isProduction).toBe(true);
    vi.doUnmock('dotenv');
  });

  it('accepts a longer secret in production', async () => {
    vi.doMock('dotenv', () => ({ default: { config: vi.fn() } }));
    const { env } = await loadEnvWith({ NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(48) });
    expect(env.JWT_SECRET).toHaveLength(48);
    vi.doUnmock('dotenv');
  });

  it('does not enforce the length rule outside production, so a quick dev run still starts', async () => {
    vi.doMock('dotenv', () => ({ default: { config: vi.fn() } }));
    const { env } = await loadEnvWith({ NODE_ENV: 'development', JWT_SECRET: 'short' });
    expect(env.JWT_SECRET).toBe('short');
    expect(env.isProduction).toBe(false);
    vi.doUnmock('dotenv');
  });

  it('falls back to the development secret when nothing is set, and warns', async () => {
    vi.doMock('dotenv', () => ({ default: { config: vi.fn() } }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { env } = await loadEnvWith({ NODE_ENV: 'development', JWT_SECRET: undefined });
    expect(env.JWT_SECRET).toBe('insecure-dev-secret');
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/JWT_SECRET is not set/i));
    vi.doUnmock('dotenv');
  });

  it('treats a whitespace-only secret as absent', async () => {
    vi.doMock('dotenv', () => ({ default: { config: vi.fn() } }));
    await expect(loadEnvWith({ NODE_ENV: 'production', JWT_SECRET: '   ' })).rejects.toThrow(/JWT_SECRET is not set/i);
    vi.doUnmock('dotenv');
  });
});

describe('env coercions', () => {
  it('parses booleans from the usual spellings and defaults to false', async () => {
    vi.doMock('dotenv', () => ({ default: { config: vi.fn() } }));
    const { env } = await loadEnvWith({
      NODE_ENV: 'development',
      JWT_SECRET: 'x'.repeat(32),
      RECAPTCHA_FAIL_OPEN: 'yes',
    });
    expect(env.RECAPTCHA.failOpen).toBe(true);
    vi.doUnmock('dotenv');
  });

  it('clamps CSP_MODE to the allowed set rather than trusting the file', async () => {
    vi.doMock('dotenv', () => ({ default: { config: vi.fn() } }));
    const { env } = await loadEnvWith({ NODE_ENV: 'development', JWT_SECRET: 'x'.repeat(32), CSP_MODE: 'nonsense' });
    expect(env.CSP_MODE).toBe('report-only');
    vi.doUnmock('dotenv');
  });

  it('splits ALLOWED_ORIGINS and drops blanks', async () => {
    vi.doMock('dotenv', () => ({ default: { config: vi.fn() } }));
    const { env } = await loadEnvWith({
      NODE_ENV: 'development',
      JWT_SECRET: 'x'.repeat(32),
      ALLOWED_ORIGINS: 'https://a.test, ,https://b.test,',
    });
    expect(env.ALLOWED_ORIGINS).toEqual(['https://a.test', 'https://b.test']);
    vi.doUnmock('dotenv');
  });
});
