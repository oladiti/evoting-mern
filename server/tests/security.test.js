import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The settings lookup is stubbed so the captcha state machine can be tested
// without a database. The whole point of this file is that the misconfigured
// state is distinguishable from "disabled", and that is a pure function of the
// setting plus the presence of env keys.
vi.mock('../src/services/settings.js', () => ({
  getSetting: vi.fn(),
}));

const { publicUrl } = await import('../src/utils/index.js');
const { recaptchaStatus, verifyRecaptcha, CaptchaMisconfiguredError } = await import('../src/services/captcha.js');
const { env } = await import('../src/config/env.js');
const { getSetting } = await import('../src/services/settings.js');

// ---------------------------------------------------------------------------
// publicUrl - the account-takeover fix
// ---------------------------------------------------------------------------

describe('publicUrl', () => {
  it('builds a URL from server config alone', () => {
    expect(publicUrl('/reset-password', { token: 'abc123' })).toBe(`${env.CLIENT_URL}/reset-password?token=abc123`);
  });

  // The actual vulnerability. forgotPassword used to prefer a request-supplied
  // x-client-url header, so any non-browser client could ask for a reset on a
  // victim's address and get a genuine email, from the real SMTP server,
  // containing a valid token on an attacker-chosen origin. publicUrl reads
  // server config only, which is the structural fix.
  it('ignores a request object passed in any argument position', () => {
    const req = {
      headers: { 'x-client-url': 'https://evil.example', host: 'evil.example' },
      protocol: 'https',
      get: () => 'evil.example',
    };
    // Even handed a request, in the first position and in both, it must not
    // change where the link points.
    for (const args of [[req], ['/reset-password', { token: 'tok' }, req]]) {
      const built = publicUrl(...args);
      expect(built).not.toContain('evil.example');
      expect(built.startsWith(`${env.CLIENT_URL}/`)).toBe(true);
    }
  });

  it('percent-encodes parameter values', () => {
    const out = publicUrl('/reset-password', { token: 'a b&c=d' });
    expect(out).toContain('token=a+b%26c%3Dd');
    expect(out).not.toContain('&c=d');
  });

  it('omits null and undefined parameters', () => {
    expect(publicUrl('/x', { a: 1, b: null, c: undefined })).toBe(`${env.CLIENT_URL}/x?a=1`);
  });

  it('appends with & when the path already carries a query', () => {
    expect(publicUrl('/x?keep=1', { a: '2' })).toBe(`${env.CLIENT_URL}/x?keep=1&a=2`);
  });

  it('normalises a missing leading slash and a trailing slash on the base', () => {
    expect(publicUrl('reset-password')).toBe(`${env.CLIENT_URL}/reset-password`);
  });

  it('defaults to the site root', () => {
    expect(publicUrl()).toBe(`${env.CLIENT_URL}/`);
  });
});

// ---------------------------------------------------------------------------
// reCAPTCHA - the silent-disable fix
// ---------------------------------------------------------------------------

describe('recaptchaStatus', () => {
  beforeEach(() => {
    env.RECAPTCHA.siteKey = 'site-key';
    env.RECAPTCHA.secretKey = 'secret-key';
    env.RECAPTCHA.failOpen = false;
    getSetting.mockReset();
  });

  it('state 1: admin turned it off', async () => {
    getSetting.mockResolvedValue(false);
    const s = await recaptchaStatus();
    expect(s).toEqual({ enabled: false, configured: true, enforced: false, misconfigured: false });
  });

  it('state 2: admin turned it on and the keys are present', async () => {
    getSetting.mockResolvedValue(true);
    const s = await recaptchaStatus();
    expect(s).toEqual({ enabled: true, configured: true, enforced: true, misconfigured: false });
  });

  // This is the bug. The old isRecaptchaEnabled() returned
  // `enabled && keysPresent`, so a missing key reported "not enforced" and
  // verifyRecaptcha returned true - removing the captcha from register, login,
  // reset and voting while the settings screen still showed it as enabled.
  it('state 3: admin turned it on but a key is missing, and says so', async () => {
    getSetting.mockResolvedValue(true);
    env.RECAPTCHA.secretKey = '';
    const s = await recaptchaStatus();
    expect(s).toEqual({ enabled: true, configured: false, enforced: false, misconfigured: true });
  });

  it('treats an empty string and a missing key identically', async () => {
    getSetting.mockResolvedValue(true);
    env.RECAPTCHA.siteKey = '';
    env.RECAPTCHA.secretKey = '';
    expect((await recaptchaStatus()).misconfigured).toBe(true);
  });
});

describe('verifyRecaptcha', () => {
  beforeEach(() => {
    env.RECAPTCHA.siteKey = 'site-key';
    env.RECAPTCHA.secretKey = 'secret-key';
    env.RECAPTCHA.failOpen = false;
    getSetting.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes when the admin has disabled it', async () => {
    getSetting.mockResolvedValue(false);
    await expect(verifyRecaptcha(undefined)).resolves.toBe(true);
  });

  it('fails when it is enabled and no token was supplied', async () => {
    getSetting.mockResolvedValue(true);
    await expect(verifyRecaptcha(undefined)).resolves.toBe(false);
  });

  it('fails on an empty-string token', async () => {
    getSetting.mockResolvedValue(true);
    await expect(verifyRecaptcha('')).resolves.toBe(false);
  });

  // Fail closed. Silently passing is what created the bug; refusing and saying
  // why is recoverable, and the 503 keeps it off the client retry path.
  it('throws a 503 when enabled but unconfigured, rather than passing the request', async () => {
    getSetting.mockResolvedValue(true);
    env.RECAPTCHA.secretKey = '';
    const err = await verifyRecaptcha('some-token').then(
      () => null,
      (e) => e
    );
    expect(err).toBeInstanceOf(CaptchaMisconfiguredError);
    expect(err.status).toBe(503);
    expect(err.expose).toBe(true);
    expect(err.message).toMatch(/not configured/i);
  });

  it('the documented escape hatch inverts the failure, but the default is closed', async () => {
    getSetting.mockResolvedValue(true);
    env.RECAPTCHA.secretKey = '';
    env.RECAPTCHA.failOpen = true;
    await expect(verifyRecaptcha(undefined)).resolves.toBe(true);
  });

  it('fails closed when Google itself is unreachable, rather than erroring through to a 500', async () => {
    getSetting.mockResolvedValue(true);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(verifyRecaptcha('token')).resolves.toBe(false);
  });

  it('fails when Google reports the token as invalid', async () => {
    getSetting.mockResolvedValue(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }) }));
    await expect(verifyRecaptcha('token')).resolves.toBe(false);
  });

  it('passes when Google reports success', async () => {
    getSetting.mockResolvedValue(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ success: true }) }));
    await expect(verifyRecaptcha('token')).resolves.toBe(true);
  });
});
