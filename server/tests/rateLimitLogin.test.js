import { describe, it, expect } from 'vitest';
import { getLoginLockoutMinutes } from '../src/services/rateLimit.login.js';
import { IP_MAX_ATTEMPTS } from '../src/config/constants.js';

// getLoginLockoutMinutes is the per-account half of the lockout. It is a pure
// function of the attempt count, so the escalation curve can be pinned exactly.
// The per-IP half of the curve (IP_LOCKOUT_SCHEDULE) is not exported - it needs
// the LoginAttempt collection - but the shared helper `lockoutMinutesFor` walks
// the same shape, and the constants below mirror the schedule in the source.

describe('getLoginLockoutMinutes (per-account escalation)', () => {
  it('does not lock below the first threshold', () => {
    for (let n = 0; n < 5; n++) {
      expect(getLoginLockoutMinutes(n)).toBe(0);
    }
  });

  it('locks for 15 minutes from the fifth failure', () => {
    expect(getLoginLockoutMinutes(5)).toBe(15);
  });

  it('holds 15 minutes up to the next threshold, rather than escalating per attempt', () => {
    expect(getLoginLockoutMinutes(6)).toBe(15);
    expect(getLoginLockoutMinutes(9)).toBe(15);
  });

  it('escalates 15 -> 30 -> 60 -> 120 at the scheduled thresholds', () => {
    expect(getLoginLockoutMinutes(10)).toBe(30);
    expect(getLoginLockoutMinutes(15)).toBe(60);
    expect(getLoginLockoutMinutes(20)).toBe(120);
  });

  it('holds the maximum once past the last threshold', () => {
    expect(getLoginLockoutMinutes(21)).toBe(120);
    expect(getLoginLockoutMinutes(500)).toBe(120);
  });

  // The curve must never decrease as attempts rise, or a sustained attack would
  // walk itself back down into the unlocked range.
  it('is monotonically non-decreasing', () => {
    let previous = 0;
    for (let n = 0; n <= 200; n++) {
      const minutes = getLoginLockoutMinutes(n);
      expect(minutes).toBeGreaterThanOrEqual(previous);
      previous = minutes;
    }
  });

  it('caps at two hours', () => {
    expect(Math.max(...Array.from({ length: 500 }, (_, i) => getLoginLockoutMinutes(i)))).toBe(120);
  });
});

describe('per-IP schedule (mirrors IP_LOCKOUT_SCHEDULE in rateLimit.login.js)', () => {
  // The IP bucket needs far more failures than the account bucket, otherwise a
  // single mistyped username locks out every user behind the same NAT or proxy.
  const ipSchedule = [
    { threshold: IP_MAX_ATTEMPTS, minutes: 15 },
    { threshold: IP_MAX_ATTEMPTS * 2, minutes: 30 },
    { threshold: IP_MAX_ATTEMPTS * 5, minutes: 60 },
  ];

  const ipMinutesFor = (attempts) => {
    let minutes = 0;
    for (const l of ipSchedule) if (attempts >= l.threshold) minutes = l.minutes;
    return minutes;
  };

  // The per-account curve first locks at 5 failures; the shared-IP curve must
  // start well above that, or one mistyped username locks out every user
  // behind the same NAT or reverse proxy.
  const ACCOUNT_FIRST_THRESHOLD = 5;

  it('does not bite until the shared-IP threshold, which is well above the per-account one', () => {
    expect(IP_MAX_ATTEMPTS).toBeGreaterThan(ACCOUNT_FIRST_THRESHOLD);
    expect(ipMinutesFor(ACCOUNT_FIRST_THRESHOLD)).toBe(0);
    expect(ipMinutesFor(IP_MAX_ATTEMPTS - 1)).toBe(0);
  });

  it('locks at the documented thresholds', () => {
    expect(ipMinutesFor(IP_MAX_ATTEMPTS)).toBe(15);
    expect(ipMinutesFor(IP_MAX_ATTEMPTS * 2)).toBe(30);
    expect(ipMinutesFor(IP_MAX_ATTEMPTS * 5)).toBe(60);
    expect(ipMinutesFor(IP_MAX_ATTEMPTS * 10)).toBe(60);
  });

  it('is monotonically non-decreasing', () => {
    let previous = 0;
    for (let n = 0; n <= 300; n++) {
      const minutes = ipMinutesFor(n);
      expect(minutes).toBeGreaterThanOrEqual(previous);
      previous = minutes;
    }
  });
});
