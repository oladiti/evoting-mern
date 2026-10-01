/**
 * Receives Content-Security-Policy violation reports from the browser.
 *
 * This exists because a report-only policy with no reporting endpoint is very
 * nearly a no-op. The browser tells the page's console and nothing else, so the
 * evidence that a rollout is safe exists only while a human is watching devtools
 * on the right page - which is worse than having no report-only phase at all,
 * because it reads like a safety net that is not there. Once a report-uri is set
 * the violations arrive here whether or not anyone is looking, and the enforce
 * flip becomes a decision made on evidence.
 *
 * Two things this deliberately does NOT do:
 *
 *   - It does not write to the database. The body is attacker-controlled and
 *     unauthenticated by nature; a flood of reports must not be able to insert
 *     rows into a collection that holds voter records. Console only.
 *   - It does not echo the report back, and it never reveals that it throttled.
 *     Both would turn this into a free oracle for probing the policy.
 */
import express from 'express';

// Browsers send the legacy single-object format as application/csp-report, and
// the newer Reporting API as application/reports+json carrying an array. Support
// both: Safari sends neither, which is most of the audience this app has.
//
// Mounted scoped to this path rather than leaning on the global express.json,
// because that one is typed to application/json and would leave this body
// unparsed. It does not need to be registered before the global parser for the
// same reason - the content types do not overlap, so the global parser passes
// this request straight through untouched.
export const cspReportParser = express.json({
  type: ['application/csp-report', 'application/reports+json'],
  limit: '8kb',
});

// A single report is a few hundred bytes. Ten is far more than any real page
// load produces, and the cap exists so a crafted request cannot make this loop
// over an arbitrary array.
const MAX_REPORTS_PER_REQUEST = 10;

// Token bucket, per process. Chosen over the shared rate limiter because this
// endpoint sits outside it deliberately, and because the thing worth limiting is
// log volume, not request rate.
const BUCKET_CAPACITY = 20;
const REFILL_PER_MS = BUCKET_CAPACITY / 60_000;

let tokens = BUCKET_CAPACITY;
let lastRefill = Date.now();
let droppedSinceSummary = 0;

function takeToken() {
  const now = Date.now();
  tokens = Math.min(BUCKET_CAPACITY, tokens + (now - lastRefill) * REFILL_PER_MS);
  lastRefill = now;
  if (tokens < 1) return false;
  tokens -= 1;
  return true;
}

const MAX_FIELD = 200;

/**
 * Drops the query string and fragment from a URL before it is logged.
 *
 * Not defensive theatre. `blocked-uri` and `document-uri` routinely carry
 * query strings, and this app has password resets, email verification tokens and
 * an admin restore endpoint - any of which would put a live credential in a log
 * line that is then shipped somewhere central.
 */
function redactUrl(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;

  // Root-relative: just drop the query.
  if (raw.startsWith('/')) return raw.split(/[?#]/)[0].slice(0, MAX_FIELD);

  // No scheme means a bare keyword - 'self', 'inline', 'eval', 'data', 'blob',
  // 'unsafe-inline'. Those carry no data and are the most useful thing to see.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw.slice(0, MAX_FIELD);

  try {
    const url = new URL(raw);
    // data: and blob: have an opaque origin; printing it would produce the
    // useless string "null" and hide which of the two actually fired.
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return `${url.protocol}//`;
    return `${url.origin}${url.pathname}`;
  } catch {
    return raw.split(/[?#]/)[0].slice(0, MAX_FIELD);
  }
}

function describe(report) {
  const parts = [
    `violated=${report['violated-directive'] || report.effectiveDirective || '?'}`,
    `blocked=${redactUrl(report['blocked-uri']) || '?'}`,
    `page=${redactUrl(report['document-uri']) || '?'}`,
  ];
  if (report.disposition) parts.push(`disposition=${report.disposition}`);
  if (report['status-code']) parts.push(`status=${report['status-code']}`);
  return parts.join(' ');
}

export function cspReportHandler(req, res) {
  const body = req.body;
  const reports = Array.isArray(body) ? body : body ? [body] : [];

  for (const report of reports.slice(0, MAX_REPORTS_PER_REQUEST)) {
    if (!report || typeof report !== 'object' || Array.isArray(report)) continue;
    if (!takeToken()) {
      // Counted, not logged per-report, so a flood costs one line per hundred
      // rather than filling the disk.
      droppedSinceSummary += 1;
      if (droppedSinceSummary % 100 === 1) {
        console.warn(`[csp] report bucket empty, ${droppedSinceSummary} report(s) dropped since last summary`);
      }
      continue;
    }
    console.warn(`[csp] ${describe(report)}`);
  }

  // 204 for everything, valid or not. The sender is a browser acting on our own
  // policy and gets nothing useful from a status code either way.
  res.setHeader('Cache-Control', 'no-store');
  res.status(204).end();
}
