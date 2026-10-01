// Read a cookie by name (non-httpOnly cookies only)
export function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

export function getCsrfToken() {
  return getCookie('ev_csrf');
}

export class ApiError extends Error {
  constructor(status, message, data = null) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

let refreshInFlight = null;
let lastExpiryEvent = 0;

// The Vite dev proxy answers 503 (and used to answer 500) while the API is still
// booting or has lost its database. Retrying idempotent reads smooths that window
// over; non-idempotent methods are never retried, because replaying a POST would
// double-count a failed login against the lockout and could create duplicates.
const TRANSIENT_STATUS = new Set([500, 502, 503, 504]);
const RETRY_DELAYS = [600, 1800, 3600];

// A dev-server respawn under `node --watch` closes port 5000 for a moment, and the
// proxy reports it as 503. That is survivable for a POST, but only because the
// proxy's own 503 is proof of non-delivery: the request never reached Express, so
// no partial write can exist and replaying it cannot duplicate anything. A
// transient status from the application itself proves no such thing in general,
// and a thrown fetch proves even less, because the server may have committed the
// write before the connection dropped. So only a 503 with a known never-wrote
// signature earns a second attempt, and register is the one call that has no
// other way to recover.
const PROXY_RETRIES = 2;

// The body the server sends when it is up but has no usable database. The server
// emits this from two places that both run before any write is attempted: the
// awaitDatabase gate in app.js, and the transient-error branch of the error
// handler. For login specifically that matters more than the usual POST concern -
// the handler only calls recordFailedLogin() after the database reads have
// already succeeded, so a 503 of this kind is answered before any LoginAttempt
// row exists. A retry therefore cannot inflate the failed-attempt counter that
// drives the lockout, which is the one thing that would make retrying a sign-in
// POST actively harmful rather than merely wasteful.
const DB_UNAVAILABLE_MESSAGE = 'Database unavailable, please retry shortly';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Reads a clone so the caller still finds an unread body on the original response.
async function isTransientlyUnavailable(res) {
  if (res.status !== 503) return false;
  try {
    const body = await res.clone().json();
    if (body?.error === 'API unavailable') return !!body?.detail;
    return body?.error === DB_UNAVAILABLE_MESSAGE;
  } catch {
    return false;
  }
}

async function fetchWithRetry(path, opts, method) {
  const idempotent = method === 'GET';
  const attempts = idempotent ? RETRY_DELAYS.length + 1 : PROXY_RETRIES + 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await sleep(RETRY_DELAYS[attempt - 1]);
    try {
      const res = await fetch(path, opts);
      const retryable = attempt < attempts - 1 && TRANSIENT_STATUS.has(res.status) && (idempotent || (await isTransientlyUnavailable(res)));
      if (!retryable) return res;
    } catch (err) {
      // No response at all. Retrying a POST here could replay a write the server
      // already committed, so only GET waits out a dead dev server; a POST needs
      // the proxy's explicit 503 before it is allowed to try again.
      if (!idempotent || attempt === attempts - 1) throw err;
    }
  }
  throw new ApiError(503, 'Service unavailable');
}

function notifySessionExpired() {
  const now = Date.now();
  if (now - lastExpiryEvent > 3000) {
    lastExpiryEvent = now;
    window.dispatchEvent(new Event('app:session-expired'));
  }
}

async function rawRequest(path, { method = 'GET', body, headers = {}, formData = false, allowRefresh = true } = {}) {
  const opts = {
    method,
    credentials: 'include',
    headers: { ...headers },
    body: undefined,
  };

  if (body) {
    if (formData) {
      opts.body = body;
    } else {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
  }

  const token = getCsrfToken();
  if (token) opts.headers['X-CSRF-Token'] = token;
  opts.headers['X-Requested-With'] = 'XMLHttpRequest';

  const res = await fetchWithRetry(path, opts, method);
  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();

  if (res.status === 401 && path !== '/api/auth/login' && path !== '/api/auth/refresh' && allowRefresh) {
    refreshInFlight = refreshInFlight || refreshSession();
    const ok = await refreshInFlight;
    refreshInFlight = null;
    if (ok) {
      return rawRequest(path, { method, body, headers, formData, allowRefresh: false });
    }
    notifySessionExpired();
    throw new ApiError(401, 'Not authenticated', data);
  }

  if (!res.ok) {
    throw new ApiError(res.status, data?.error || data?.message || `Request failed (${res.status})`, data);
  }
  return data;
}

async function refreshSession() {
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'X-CSRF-Token': getCsrfToken() || '',
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/json',
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const api = {
  get: (path, headers = {}) => rawRequest(path, { headers }),
  post: (path, body, headers = {}) => rawRequest(path, { method: 'POST', body, headers }),
  put: (path, body, headers = {}) => rawRequest(path, { method: 'PUT', body, headers }),
  del: (path, headers = {}) => rawRequest(path, { method: 'DELETE', headers }),
  upload: (path, formData) => rawRequest(path, { method: 'POST', body: formData, formData: true }),
  uploadPut: (path, formData) => rawRequest(path, { method: 'PUT', body: formData, formData: true }),
};
