import { describe, it, expect } from 'vitest';
import { unitLength, euclidean, round4, remainingMinutes, resolveThreshold, MIN_THRESHOLD, MAX_THRESHOLD } from '../src/services/faceMatch.js';

// face-api.js emits 128-dimensional descriptors, one float per element.
const D = 128;

// A deterministic pseudo-random unit-ish vector. Seeded rather than random so a
// failure is always reproducible, which matters for the numbers below: these
// tests assert on exact distances, and a random generator would make them flaky.
function descriptor(seed) {
  const v = [];
  let x = seed;
  for (let i = 0; i < D; i++) {
    // xorshift32, so consecutive "people" are unrelated but reproducible
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    v.push((x >>> 0) / 0xffffffff - 0.5);
  }
  return v;
}

// Same person, different capture: a real descriptor is never bit-identical
// between two exposures, so "identical" has to be modelled as near-identical.
function perturb(vec, amount) {
  return vec.map((v) => v + Math.sin(v * 12.9898) * amount);
}

describe('unitLength', () => {
  it('produces a vector of magnitude 1', () => {
    const out = unitLength(descriptor(12345));
    const mag = Math.sqrt(out.reduce((s, v) => s + v * v, 0));
    expect(mag).toBeCloseTo(1, 10);
  });

  it('returns a copy of the input unchanged for an all-zero vector', () => {
    const zeros = new Array(D).fill(0);
    const out = unitLength(zeros);
    expect(out).toEqual(zeros);
    expect(out).not.toBe(zeros); // must not alias the caller's array
  });

  it('preserves direction: scaling an input does not change the unit result', () => {
    const v = descriptor(999);
    const a = unitLength(v);
    const b = unitLength(v.map((x) => x * 17));
    a.forEach((x, i) => expect(x).toBeCloseTo(b[i], 12));
  });
});

describe('euclidean', () => {
  it('is 0 for a vector against itself', () => {
    const v = descriptor(777);
    expect(euclidean(v, v)).toBe(0);
  });

  it('is symmetric', () => {
    const a = descriptor(11);
    const b = descriptor(22);
    expect(euclidean(a, b)).toBeCloseTo(euclidean(b, a), 12);
  });

  it('is bounded by 2 on unit-length vectors', () => {
    const a = descriptor(1);
    const b = descriptor(2);
    expect(euclidean(a, b)).toBeLessThanOrEqual(2);
  });

  // This is the property the whole design rests on. Without normalising, a
  // dim capture of one person can land closer to a bright capture of a
  // *different* person than two captures of the same person.
  it('is invariant to the magnitude of the descriptors', () => {
    const base = descriptor(4242);
    const same = perturb(base, 0.02);

    const sameDistance = euclidean(base, same);
    const scaledDistance = euclidean(
      base.map((v) => v * 3),
      same.map((v) => v * 0.4)
    );

    expect(scaledDistance).toBeCloseTo(sameDistance, 10);
  });

  it('separates two different people further than it separates one person from themselves', () => {
    const a = descriptor(2024);
    const aAgain = perturb(a, 0.01);
    const b = descriptor(8080);

    const samePerson = euclidean(a, aAgain);
    const differentPeople = euclidean(a, b);

    expect(samePerson).toBeLessThan(differentPeople);
  });
});

describe('round4', () => {
  it('rounds to four decimal places', () => {
    expect(round4(0.327156)).toBe(0.3272);
    expect(round4(0.1)).toBe(0.1);
    expect(round4(0)).toBe(0);
  });
});

describe('remainingMinutes', () => {
  it('rounds up, so a lock is never reported as already expired', () => {
    const now = 1_000_000;
    expect(remainingMinutes(new Date(now + 61_000), now)).toBe(2);
    expect(remainingMinutes(new Date(now + 59_000), now)).toBe(1);
  });

  it('never returns less than 1, even for a lock in the past', () => {
    const now = 1_000_000;
    expect(remainingMinutes(new Date(now - 10 * 60_000), now)).toBe(1);
    expect(remainingMinutes(new Date(now), now)).toBe(1);
  });
});

describe('resolveThreshold', () => {
  // The setting is stored in hundredths so the settings screen can use an
  // integer input: 30 means 0.30.
  it('converts hundredths to a fraction', () => {
    expect(resolveThreshold(30, 0.3)).toBeCloseTo(0.3, 10);
    expect(resolveThreshold(15, 0.3)).toBeCloseTo(0.15, 10);
  });

  it('accepts values inside the permitted band', () => {
    expect(resolveThreshold(MIN_THRESHOLD * 100, 0.3)).toBeCloseTo(MIN_THRESHOLD, 10);
    expect(resolveThreshold(MAX_THRESHOLD * 100, 0.3)).toBeCloseTo(MAX_THRESHOLD, 10);
  });

  // Rejecting rather than clamping is the point: clamping a 0 to 0.15 would
  // silently turn a typo into a wall, and clamping 0.6 to 0.5 into a looser
  // door than the admin asked for. Either way the stored value is a mistake.
  it('falls back rather than clamping a value outside the band', () => {
    expect(resolveThreshold(60, 0.3)).toBe(0.3); // 0.60 - the old unsafe default
    expect(resolveThreshold(5, 0.3)).toBe(0.3); //  0.05 - a wall
    expect(resolveThreshold(0, 0.3)).toBe(0.3);
    expect(resolveThreshold(-10, 0.3)).toBe(0.3);
  });

  it('falls back on values that are not numbers at all', () => {
    expect(resolveThreshold('abc', 0.3)).toBe(0.3);
    expect(resolveThreshold(null, 0.3)).toBe(0.3);
    expect(resolveThreshold(undefined, 0.3)).toBe(0.3);
    expect(resolveThreshold('', 0.3)).toBe(0.3);
  });

  // The single most important guard in the file: the closest pair of different
  // voters measured 0.327, so the ceiling has to stay under that or the system
  // cannot tell two people apart.
  it('keeps the ceiling below the measured same/different separation', () => {
    const MEASURED_DIFFERENT_PAIR = 0.327;
    expect(MAX_THRESHOLD).toBeLessThan(MEASURED_DIFFERENT_PAIR);
    expect(MIN_THRESHOLD).toBeLessThan(MAX_THRESHOLD);
  });
});
