import LoginAttempt from '../models/LoginAttempt.js';
import { getClientIp } from '../utils/index.js';
import { IP_MAX_ATTEMPTS } from '../config/constants.js';

// Per-account escalation: sustained failures extend the lock from 15min up to 2h.
const USER_LOCKOUT_SCHEDULE = [
  { threshold: 5, minutes: 15 },
  { threshold: 10, minutes: 30 },
  { threshold: 15, minutes: 60 },
  { threshold: 20, minutes: 120 },
];

// Shared-IP fallback needs far more failures before it bites, otherwise one
// mistyped account locks out every user behind the same IP (e.g. a NAT or the
// local dev machine seen as a single ::1 client).
const IP_LOCKOUT_SCHEDULE = [
  { threshold: IP_MAX_ATTEMPTS, minutes: 15 },
  { threshold: IP_MAX_ATTEMPTS * 2, minutes: 30 },
  { threshold: IP_MAX_ATTEMPTS * 5, minutes: 60 },
];

// A failure streak older than this is discarded, so a legitimate user who
// mistypes now-and-then never accumulates a permanent multi-hour lock. Only
// genuine brute forcing (many attempts within this window) escalates.
const ATTEMPT_WINDOW_MS = 30 * 60 * 1000;

function lockoutMinutesFor(schedule, attempts) {
  let minutes = 0;
  for (const l of schedule) {
    if (attempts >= l.threshold) minutes = l.minutes;
  }
  return minutes;
}

export function getLoginLockoutMinutes(attempts) {
  return lockoutMinutesFor(USER_LOCKOUT_SCHEDULE, attempts);
}

function firstAttemptAt(doc) {
  if (doc?.first_attempt_at) return +doc.first_attempt_at;
  if (doc?.created_at) return +doc.created_at;
  if (doc?.last_attempt) return +doc.last_attempt;
  return Date.now();
}

export async function recordFailedLogin({ username, req }) {
  const keys = [
    `username:${String(username || '')
      .toLowerCase()
      .trim()}`,
    `ip:${getClientIp(req)}`,
  ];
  const now = new Date();
  await Promise.all(
    keys.map(async (key) => {
      const existing = await LoginAttempt.findOne({ key });
      const stale = !existing || now - firstAttemptAt(existing) > ATTEMPT_WINDOW_MS;
      if (stale) {
        // Fresh streak (or an old one that has decayed) — start counting again.
        await LoginAttempt.findOneAndUpdate({ key }, { $set: { attempts: 1, first_attempt_at: now, last_attempt: now } }, { upsert: true, new: true });
      } else {
        await LoginAttempt.findOneAndUpdate({ key }, { $inc: { attempts: 1 }, $set: { last_attempt: now } }, { upsert: true, new: true });
      }
    })
  );
}

export async function resetLoginAttempts(username) {
  const keys = [
    `username:${String(username || '')
      .toLowerCase()
      .trim()}`,
  ];
  await Promise.all(keys.map((key) => LoginAttempt.deleteOne({ key })));
}

export async function getLoginLockout({ username, req }) {
  const usernameKey = `username:${String(username || '')
    .toLowerCase()
    .trim()}`;
  const ipKey = `ip:${getClientIp(req)}`;
  const [u, ip] = await Promise.all([LoginAttempt.findOne({ key: usernameKey }), LoginAttempt.findOne({ key: ipKey })]);
  const minutes = Math.max(lockoutMinutesFor(USER_LOCKOUT_SCHEDULE, u?.attempts || 0), lockoutMinutesFor(IP_LOCKOUT_SCHEDULE, ip?.attempts || 0));
  if (!minutes) return { locked: false };
  const last = Math.max(u ? +u.last_attempt : 0, ip ? +ip.last_attempt : 0);
  const lockUntil = last + minutes * 60000;
  if (lockUntil > Date.now()) {
    return { locked: true, minutes, unlockAt: new Date(lockUntil) };
  }
  return { locked: false };
}
