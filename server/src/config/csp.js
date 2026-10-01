/**
 * The one Content-Security-Policy for this app.
 *
 * This module is the single source of truth because the policy has to be emitted
 * in two places that used to carry hand-maintained copies of the same list:
 * helmet in server/src/app.js for production, and the Vite dev server in
 * client/vite.config.js. The copies matched, but nothing tested that, so the
 * likeliest future failure was the two quietly drifting - a directive added to
 * one and enforced nowhere.
 *
 * Both consumers now import from here, which makes drift impossible rather than
 * merely detectable. Neither consumer is coupled to the other at runtime: the
 * client bundle never contains this file, it is read when Vite loads its config.
 *
 * Two rules for anyone editing this:
 *
 *   1. Import NOTHING. In particular do not import ./env.js. client/vite.config.js
 *      imports this file, and pulling env.js in would run dotenv and the JWT
 *      secret validation while Vite is still loading its config - which would make
 *      `vite build` fail on a server secret it has no business reading. Take
 *      `dev` and `reportUri` as arguments instead of reading process.env.
 *
 *   2. Keep it dependency-free and side-effect-free so it stays loadable from a
 *      config file in a different workspace.
 */

// reCAPTCHA v2 is the only third-party origin involved: the widget script, the
// anchor/challenge iframes, and the XHRs it makes. Everything else is
// first-party - the bundle, the CSS, the uploads, and the face-api.js model
// weights under /models - so 'self' plus those two Google hosts is the whole
// allowlist.
//
// 'unsafe-inline' survives in style-src because React writes style attributes
// (Recaptcha.jsx scales the widget with style={{ transform }}) and their values
// are computed at runtime, so no hash can cover them. It is not a script
// permission and does not weaken script-src.
export const CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  baseUri: ["'self'"],
  objectSrc: ["'none'"],
  scriptSrc: ["'self'", 'https://www.google.com', 'https://www.gstatic.com'],
  scriptSrcAttr: ["'none'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", 'data:', 'blob:', 'https://www.gstatic.com'],
  fontSrc: ["'self'", 'data:'],
  connectSrc: ["'self'", 'https://www.google.com', 'https://www.gstatic.com'],
  frameSrc: ['https://www.google.com', 'https://www.gstatic.com'],
  workerSrc: ["'self'", 'blob:'],
  formAction: ["'self'"],
  frameAncestors: ["'self'"],
  // helmet turns upgrade-insecure-requests on by default. It rewrites http://
  // subresource requests to https://, so serving this build over plain http (a
  // local `npm start` check on http://localhost:5000, for instance) would
  // rewrite every asset URL to a port with no TLS on it and the page would load
  // blank. The deployment is already https, so dropping the directive costs
  // nothing there.
  //
  // null is not "no value" to helmet: it deletes the default directive outright
  // (verified against helmet 8.3.0, index.cjs `parseDirectives`, which throws
  // only for default-src and otherwise calls result.delete). Anything else -
  // omitting the key, or an empty array - would leave the default in place.
  upgradeInsecureRequests: null,
};

// The two dev-server extras, and they are dev-only tooling that never ships:
// Vite's react-refresh preamble and HMR client are injected as inline scripts
// ('unsafe-inline'), react-refresh re-evaluates modules ('unsafe-eval'), and the
// HMR socket needs ws:/wss: in connect-src. Production keeps script-src clean
// of all three because the built HTML has no inline script - the theme bootstrap
// lives in public/theme-init.js precisely so this stays true.
const DEV_SCRIPT_SRC = ["'unsafe-inline'", "'unsafe-eval'"];
const DEV_CONNECT_SRC = ['ws:', 'wss:'];

// Where violations are POSTed. Exported so the API route and the two Vite
// headers all name the same path - a report-uri pointing at a route that is not
// mounted is a policy that silently reports nowhere, which looks identical to a
// clean rollout.
export const REPORT_URI = '/api/csp-report';

/**
 * helmet wants an object keyed by camelCase directive names; a raw header wants
 * one kebab-case string. Both are derived from CSP_DIRECTIVES so neither can
 * drift from the other.
 */
export function directivesFor({ dev = false, reportUri } = {}) {
  const out = {};
  for (const [name, value] of Object.entries(CSP_DIRECTIVES)) {
    if (value === null) {
      // Copied through as null so helmet deletes its default, which is the
      // documented way to remove a default directive.
      out[name] = null;
      continue;
    }
    out[name] = [...value];
  }
  if (dev) {
    out.scriptSrc = [...out.scriptSrc, ...DEV_SCRIPT_SRC];
    out.connectSrc = [...out.connectSrc, ...DEV_CONNECT_SRC];
  }
  // report-uri is valid in an enforcing policy and a report-only one alike: in
  // report-only it is the only evidence the rollout produced anything, and in
  // enforce it is the record of what the policy actually blocked. A
  // report-only policy with no report-uri is very nearly a no-op - violations
  // reach a human only if they happen to have devtools open on the right page,
  // which is a worse outcome than no policy at all, because it reads as a safety
  // net that is not there.
  if (reportUri) out.reportUri = [reportUri];
  return out;
}

const kebab = (name) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

export function serialize(directives) {
  return Object.entries(directives)
    .filter(([, value]) => value !== null)
    .map(([name, value]) => `${kebab(name)} ${[].concat(value).join(' ')}`)
    .join('; ');
}

export function policyHeaderValue(options) {
  return serialize(directivesFor(options));
}

/**
 * The value to hand helmet for `contentSecurityPolicy`.
 *
 * Lives here rather than inline in app.js for one reason: the mode-to-header
 * mapping is the part of this that is easiest to get subtly wrong and hardest to
 * notice. reportOnly: true and reportOnly: false are one boolean apart, and
 * getting it backwards means either a policy that blocks nothing while looking
 * like it is deployed, or one that blocks the reCAPTCHA widget on the login
 * page. Keeping it a pure function of the mode is what lets it be tested without
 * booting the app and a database.
 *
 * Returns false for 'off' because that is how helmet is told to send no policy
 * at all - the only way to disable the middleware.
 */
export function helmetCspOptions(mode) {
  if (mode === 'off') return false;
  return {
    useDefaults: true,
    directives: directivesFor({ reportUri: REPORT_URI }),
    reportOnly: mode === 'report-only',
  };
}
