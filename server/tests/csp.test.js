import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { CSP_DIRECTIVES, directivesFor, serialize, policyHeaderValue, helmetCspOptions, REPORT_URI } from '../src/config/csp.js';

// ---------------------------------------------------------------------------
// The policy itself
// ---------------------------------------------------------------------------

describe('csp policy shape', () => {
  it('serialises to kebab-case directive names', () => {
    const value = policyHeaderValue({});
    expect(value).toContain("default-src 'self'");
    expect(value).toContain("script-src-attr 'none'");
    expect(value).toContain("frame-ancestors 'self'");
    expect(value).not.toContain('scriptSrc');
  });

  // helmet enables upgrade-insecure-requests by default. Left on, it rewrites
  // http:// subresource URLs to https://, so serving this build over plain http
  // points every asset at a port with no TLS on it and the page loads blank.
  // The fix is the key being present with a null value, which is what makes
  // helmet delete its default - omitting the key or passing [] would not.
  it('removes upgrade-insecure-requests rather than emptying it', () => {
    const directives = directivesFor({});
    expect(directives).toHaveProperty('upgradeInsecureRequests', null);
    expect(policyHeaderValue({})).not.toContain('upgrade-insecure-requests');
  });

  it('keeps script-src free of unsafe-inline in production', () => {
    // The whole point of the strict policy. If this ever passes with
    // 'unsafe-inline' present, the policy has stopped being a defence against
    // injected script and is decoration.
    const scriptSrc = policyHeaderValue({}).match(/script-src ([^;]*)/)[1];
    expect(scriptSrc).not.toContain('unsafe-inline');
    expect(scriptSrc).not.toContain('unsafe-eval');
  });

  it('allows unsafe-inline only in style-src, which React style attributes require', () => {
    // Recaptcha.jsx scales the widget with a computed style={{ transform }}, so
    // the value is not knowable at build time and no hash can cover it. This is
    // not a script permission.
    const value = policyHeaderValue({});
    expect(value).toContain("style-src 'self' 'unsafe-inline'");
    const scriptSrc = value.match(/script-src ([^;]*)/)[1];
    expect(scriptSrc).not.toContain('unsafe-inline');
  });

  it('allowlists the reCAPTCHA origins the widget actually needs', () => {
    const value = policyHeaderValue({});
    // The widget script, the challenge iframes, and the XHRs it makes - all
    // three, or reCAPTCHA fails on the login and register pages.
    expect(value).toMatch(/script-src[^;]*https:\/\/www\.google\.com/);
    expect(value).toMatch(/script-src[^;]*https:\/\/www\.gstatic\.com/);
    expect(value).toMatch(/frame-src[^;]*https:\/\/www\.google\.com/);
    expect(value).toMatch(/connect-src[^;]*https:\/\/www\.google\.com/);
  });

  it('allows blob: workers and data: images for the face-api pipeline', () => {
    // face-api.js runs its math in a worker and the camera preview is drawn to a
    // canvas. Denying either breaks face enrolment and verification outright.
    const value = policyHeaderValue({});
    expect(value).toMatch(/worker-src[^;]*blob:/);
    expect(value).toMatch(/img-src[^;]*blob:/);
  });

  it('does not mutate the shared CSP_DIRECTIVES when dev extras are applied', () => {
    directivesFor({ dev: true });
    // The base object is module state. If directivesFor appended to it in place,
    // one call to build the dev policy would silently loosen the production one
    // for the rest of the process - which is the sort of bug that only shows up
    // in production, having been caused by development.
    expect(CSP_DIRECTIVES.scriptSrc).not.toContain('unsafe-eval');
    expect(CSP_DIRECTIVES.connectSrc).not.toContain('ws:');
  });

  it('gives each caller its own arrays', () => {
    const a = directivesFor({});
    const b = directivesFor({});
    a.scriptSrc.push('https://attacker.example');
    expect(b.scriptSrc).not.toContain('https://attacker.example');
  });
});

describe('csp dev vs production', () => {
  const scriptSrcOf = (v) => v.match(/script-src ([^;]*)/)[1];
  const connectSrcOf = (v) => v.match(/connect-src ([^;]*)/)[1];

  it('adds unsafe-inline and unsafe-eval for Vite HMR only in dev', () => {
    // Vite injects the react-refresh preamble inline and react-refresh
    // re-evaluates modules, so the dev server cannot run the strict policy.
    const dev = scriptSrcOf(policyHeaderValue({ dev: true }));
    expect(dev).toContain('unsafe-inline');
    expect(dev).toContain('unsafe-eval');
    expect(scriptSrcOf(policyHeaderValue({}))).not.toContain('unsafe-eval');
  });

  it('adds ws:/wss: for the HMR socket only in dev', () => {
    expect(connectSrcOf(policyHeaderValue({ dev: true }))).toMatch(/ws:/);
    expect(connectSrcOf(policyHeaderValue({}))).not.toMatch(/ws:/);
  });

  it('changes nothing else between dev and production', () => {
    // The dev policy must be the production one plus the three HMR entries, or
    // "it works in dev" stops meaning anything about production. Compared
    // directive by directive after normalising each one's whitespace, so this
    // asserts on content rather than on how the entries happen to be spaced.
    const normalise = (value) =>
      value
        .split(';')
        .map((d) =>
          d
            .replace(/'unsafe-inline' 'unsafe-eval'/g, '')
            .replace(/ws: wss:/g, '')
            .split(/\s+/)
            .filter(Boolean)
            .sort()
            .join(' ')
        )
        .filter(Boolean)
        .sort();

    expect(normalise(policyHeaderValue({ dev: true }))).toEqual(normalise(policyHeaderValue({})));
  });
});

describe('report-uri', () => {
  it('is present when a report endpoint is supplied', () => {
    expect(policyHeaderValue({ reportUri: REPORT_URI })).toContain(`report-uri ${REPORT_URI}`);
  });

  // A report-only policy with no report-uri is very nearly a no-op: the browser
  // tells the console and nothing else, so the evidence that a rollout is safe
  // exists only while someone has devtools open. That is worse than no report-only
  // phase, because it reads like a safety net that is not there.
  it('is absent when no endpoint is supplied, rather than empty', () => {
    const value = policyHeaderValue({});
    expect(value).not.toContain('report-uri');
  });

  it('is the same path the route is mounted on', () => {
    expect(REPORT_URI).toBe('/api/csp-report');
  });
});

describe('helmetCspOptions', () => {
  it('sends the enforcing header in enforce mode', () => {
    expect(helmetCspOptions('enforce').reportOnly).toBe(false);
  });

  it('sends the report-only header in report-only mode', () => {
    expect(helmetCspOptions('report-only').reportOnly).toBe(true);
  });

  // false, not an empty options object: that is the only way to tell helmet to
  // send no policy at all.
  it('disables the middleware entirely in off mode', () => {
    expect(helmetCspOptions('off')).toBe(false);
  });

  it('keeps helmet defaults on so a directive is never silently unlisted', () => {
    expect(helmetCspOptions('enforce').useDefaults).toBe(true);
  });
});

describe('serialize', () => {
  it('drops null directives rather than emitting them with no value', () => {
    expect(serialize({ defaultSrc: ["'self'"], objectSrc: null })).toBe("default-src 'self'");
  });

  it('accepts a bare string as well as an array', () => {
    expect(serialize({ reportUri: '/r' })).toBe('report-uri /r');
  });
});

// ---------------------------------------------------------------------------
// The report endpoint
// ---------------------------------------------------------------------------

// Re-imported per test because the throttle is module state, and a test that
// inherited a drained bucket from the previous one would be testing nothing.
async function freshHandler() {
  vi.resetModules();
  return import('../src/middleware/cspReport.js');
}

function fakeRes() {
  const res = {
    statusCode: null,
    headers: {},
    body: undefined,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    end(body) {
      this.body = body;
    },
  };
  return res;
}

describe('csp report handler', () => {
  let warn;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('answers 204 for a well-formed report', async () => {
    const { cspReportHandler } = await freshHandler();
    const res = fakeRes();
    cspReportHandler({ body: { 'violated-directive': 'script-src', 'blocked-uri': 'https://evil.example/x.js' } }, res);
    expect(res.statusCode).toBe(204);
  });

  it('accepts the array form the Reporting API sends', async () => {
    const { cspReportHandler } = await freshHandler();
    const res = fakeRes();
    cspReportHandler(
      {
        body: [
          { 'violated-directive': 'script-src', 'blocked-uri': 'https://a.example/1.js' },
          { 'violated-directive': 'img-src', 'blocked-uri': 'https://b.example/2.png' },
        ],
      },
      res
    );
    expect(res.statusCode).toBe(204);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  // The reason the handler exists. These arrive whether or not anyone is
  // watching, which is what makes the enforce flip a decision made on evidence
  // rather than on optimism.
  it('logs the violated directive, the blocked origin and the page', async () => {
    const { cspReportHandler } = await freshHandler();
    cspReportHandler(
      {
        body: {
          'violated-directive': 'script-src-elem',
          'blocked-uri': 'https://cdn.attacker.example/payload.js',
          'document-uri': 'https://ejournal.ogitech.edu.ng/login',
        },
      },
      fakeRes()
    );
    const line = warn.mock.calls[0][0];
    expect(line).toContain('script-src-elem');
    expect(line).toContain('cdn.attacker.example');
    expect(line).toContain('/login');
  });

  it('strips query strings so a token cannot reach the log', async () => {
    // Not defensive theatre. This app has password resets, email verification
    // and an admin restore endpoint, and blocked-uri routinely carries a query
    // string. A reset token in a central log is a live credential.
    const { cspReportHandler } = await freshHandler();
    cspReportHandler(
      {
        body: {
          'violated-directive': 'connect-src',
          'blocked-uri': 'https://evil.example/track?token=SUPERSECRETRESETTOKEN',
          'document-uri': 'https://ejournal.ogitech.edu.ng/reset-password?token=ALSOASECRET#frag',
        },
      },
      fakeRes()
    );
    const line = warn.mock.calls[0][0];
    expect(line).not.toContain('SUPERSECRETRESETTOKEN');
    expect(line).not.toContain('ALSOASECRET');
    expect(line).not.toContain('frag');
    expect(line).toContain('https://evil.example/track');
    expect(line).toContain('/reset-password');
  });

  it('keeps bare CSP keywords readable, since they are the useful signal', async () => {
    const { cspReportHandler } = await freshHandler();
    cspReportHandler({ body: { 'violated-directive': 'script-src', 'blocked-uri': 'inline' } }, fakeRes());
    expect(warn.mock.calls[0][0]).toContain('blocked=inline');
  });

  it('does not collapse a data: URL to the useless string "null"', async () => {
    const { cspReportHandler } = await freshHandler();
    cspReportHandler({ body: { 'violated-directive': 'img-src', 'blocked-uri': 'data:image/png;base64,AAAA' } }, fakeRes());
    const line = warn.mock.calls[0][0];
    expect(line).toContain('data://');
    expect(line).not.toContain('blocked=null');
  });

  it('survives a body that is not a report at all', async () => {
    const { cspReportHandler } = await freshHandler();
    for (const body of [undefined, null, 'string', 42, [], [null], [[['nested']]]]) {
      const res = fakeRes();
      expect(() => cspReportHandler({ body }, res)).not.toThrow();
      expect(res.statusCode).toBe(204);
    }
  });

  it('always answers 204, so it cannot be used to probe the policy', async () => {
    const { cspReportHandler } = await freshHandler();
    // Valid, malformed and empty all get the same answer. A status code that
    // varied would be a free oracle for working out what the policy allows.
    for (const body of [{}, { 'violated-directive': 'x' }, null]) {
      const res = fakeRes();
      cspReportHandler({ body }, res);
      expect(res.statusCode).toBe(204);
    }
  });

  it('marks the response uncacheable', async () => {
    const { cspReportHandler } = await freshHandler();
    const res = fakeRes();
    cspReportHandler({ body: {} }, res);
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('caps how many reports one request can make it log', async () => {
    const { cspReportHandler } = await freshHandler();
    const many = Array.from({ length: 500 }, () => ({ 'violated-directive': 'script-src', 'blocked-uri': 'https://x.example/a' }));
    cspReportHandler({ body: many }, fakeRes());
    // Ten is far more than any real page load produces. Without the cap a
    // crafted request makes this loop over an arbitrary array.
    expect(warn.mock.calls.length).toBeLessThanOrEqual(10);
  });

  it('stops logging once the bucket is empty, without changing the answer', async () => {
    const { cspReportHandler } = await freshHandler();
    const one = () => ({ 'violated-directive': 'script-src', 'blocked-uri': 'https://x.example/a' });
    for (let i = 0; i < 40; i++) cspReportHandler({ body: [one()] }, fakeRes());
    // 20 is the bucket capacity. The rest are dropped, and the caller cannot
    // tell - that is what stops this being a log-flooding amplifier.
    expect(warn.mock.calls.length).toBe(21);
    const res = fakeRes();
    cspReportHandler({ body: [one()] }, res);
    expect(res.statusCode).toBe(204);
  });
});
