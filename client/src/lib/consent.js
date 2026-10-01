export const CONSENT_STORAGE_KEY = 'evoting_cookie_consent';

// Cookies considered non-essential. Kept explicit so Reject can actually
// remove them. Currently empty — this site only sets strictly-necessary
// cookies (ev_csrf, ev_access, ev_refresh).
const NON_ESSENTIAL_COOKIES = [];

function normalize(raw) {
  if (raw && (raw.decision === 'accepted' || raw.decision === 'rejected')) {
    return { decision: raw.decision, at: raw.at || new Date().toISOString() };
  }
  return null;
}

export function getCookieConsent() {
  let raw;
  try {
    raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let record;
  try {
    if (raw === 'accepted' || raw === 'rejected') {
      // Migrate the older plain-string format recorded before consent records
      // carried a timestamp.
      record = { decision: raw, at: new Date().toISOString() };
    } else {
      record = JSON.parse(raw);
    }
  } catch {
    return null;
  }

  const normalized = normalize(record);
  if (!normalized) return null;

  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    /* ignore */
  }
  return normalized;
}

export function recordCookieConsent(decision) {
  if (decision !== 'accepted' && decision !== 'rejected') return null;
  const record = { decision, at: new Date().toISOString() };
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record));
  } catch {
    /* ignore */
  }
  return record;
}

export function canUseNonEssential() {
  return getCookieConsent()?.decision === 'accepted';
}

export function clearNonEssentialCookies() {
  NON_ESSENTIAL_COOKIES.forEach((name) => {
    document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax; Secure`;
  });
}
