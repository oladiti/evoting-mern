import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import path from 'path';
// Shared with the API so the directive set cannot drift between the two places
// that emit it. Config-time only - this never reaches the client bundle.
import { policyHeaderValue, REPORT_URI } from '../server/src/config/csp.js';

// Without this, http-proxy lets an upstream connection failure surface to the
// browser as a bare 500 with an empty body, which is indistinguishable from an
// application crash and sent us hunting through the auth code for a bug that
// was never there. Answering 503 with a JSON body makes the real cause legible
// in the Network tab, and matches the 503 the API itself now returns while the
// database is still connecting.
const upstreamErrorHandler = (err, _req, res) => {
  if (res.headersSent || res.writableEnded) return;
  const hint = err?.code === 'ECONNREFUSED' ? 'API is not listening on http://localhost:5000' : err?.code === 'ECONNRESET' ? 'API closed the connection' : err?.message || 'upstream unavailable';
  console.error(`[proxy] ${hint}`);
  res.writeHead(503, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'API unavailable', detail: hint }));
};

const proxyTarget = (target) => ({
  target,
  changeOrigin: true,
  configure(proxy) {
    proxy.on('error', upstreamErrorHandler);
  },
});

// The Content-Security-Policy the API serves in production, mirrored onto the
// dev server. Without this the policy would only exist once the app is deployed,
// because in development the page is served by Vite and never reaches the Express
// middleware in server/src/app.js - so every directive would go untested until
// the day it mattered.
//
// Both this file and the API build their policy from server/src/config/csp.js
// rather than each carrying a copy. They used to be hand-maintained duplicates
// that happened to match, and nothing tested that, so the likeliest way this
// could have rotted was the two lists drifting apart with no signal.
const DEV_CSP = policyHeaderValue({ dev: true, reportUri: REPORT_URI });
const PROD_CSP = policyHeaderValue({ reportUri: REPORT_URI });

// camera and geolocation stay allowed because FaceCamera.jsx calls getUserMedia
// and useGeolocation.js backs the vote geofence. Identical to the policy the API
// sends - see the comment on PERMISSIONS_POLICY in server/src/app.js.
const PERMISSIONS_POLICY = ['camera=(self)', 'geolocation=(self)', 'microphone=()', 'payment=()', 'usb=()', 'browsing-topics=()', 'interest-cohort=()'].join(', ');

export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    headers: {
      'Content-Security-Policy': DEV_CSP,
      'Permissions-Policy': PERMISSIONS_POLICY,
    },
    port: 5173,
    // Vite's default is host: 'localhost', which Node resolves to a single family
    // - on Windows that is ::1, leaving 127.0.0.1:5173 actively refused. Browsers
    // disagree about which family localhost means, so the app was reachable or not
    // depending on the client. '::' is dual-stack on Windows (ipv6Only is false),
    // so ::1 and 127.0.0.1 both answer. This does expose the dev server on the LAN,
    // which is acceptable here only because the API rejects unknown origins:
    // ALLOWED_ORIGINS gates every mutating request, so another device can load the
    // shell but cannot post to it.
    host: '::',
    https: true,
    proxy: {
      '/api': proxyTarget('http://localhost:5000'),
      '/uploads': proxyTarget('http://localhost:5000'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Vite injects an inline <script> for the modulepreload polyfill by default,
    // which a CSP with script-src free of 'unsafe-inline' blocks outright - the
    // page would boot to a blank screen. The current build happens to come out
    // with no inline script, but that is a property of which plugins got used
    // rather than anything guaranteed, and it would change silently on a
    // dependency bump. Turning the polyfill off makes "no inline script in
    // dist/index.html" a property of the build instead of a coincidence to be
    // re-checked before every deploy.
    modulePreload: { polyfill: false },
  },
  // `vite preview` serves the real production build with no HMR client, so it gets
  // the strict production directives. Serving them here means the shipped policy can
  // be smoke-tested against a real build before it is deployed, rather than
  // discovered to be wrong by a blocked reCAPTCHA widget in production.
  preview: {
    headers: {
      'Content-Security-Policy': PROD_CSP,
      'Permissions-Policy': PERMISSIONS_POLICY,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
