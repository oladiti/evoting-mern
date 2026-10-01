// The pure biometric math, extracted from faceController so it can be tested
// without a database, a model layer, or a camera. Everything here is a total
// function of its arguments: no I/O, no settings lookup, no clock other than
// where explicitly passed in.
//
// This file holds the most load-bearing numbers in the system. The threshold is
// not a tuning knob picked by feel - it sits below a measured separation, and
// the tests in server/tests/faceMatch.test.js are what keep it honest.

// Both operands are scaled to unit length first, so the result measures the angle
// between the two faces rather than the difference in their magnitudes. Descriptor
// norm tracks how much usable detail the capture had, which is a property of the
// lighting and the face size, not of who the person is. Without this step a
// well-lit capture of one person and a dim capture of a different person end up
// closer together than two captures of the *same* person under different lighting.
export function unitLength(vec) {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  const norm = Math.sqrt(sum);
  if (!norm) return vec.slice();
  return vec.map((v) => v / norm);
}

export function euclidean(a, b) {
  const ua = unitLength(a);
  const ub = unitLength(b);
  let sum = 0;
  for (let i = 0; i < ua.length; i++) {
    const d = ua[i] - ub[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

export function round4(n) {
  return Math.round(n * 10000) / 10000;
}

export function remainingMinutes(lockedUntil, now = Date.now()) {
  const ms = new Date(lockedUntil).getTime() - now;
  return Math.max(1, Math.ceil(ms / 60000));
}

// The closest pair of *different* voters ever measured on this deployment was
// 0.327. A threshold at or above that stops telling people apart, so the
// ceiling has to sit below it - not at the "keep it under 0.6" that 0.6 would
// suggest, since 0.6 was the old raw un-normalised value and accepted every
// pair of different people here. The floor stops an admin tightening it into a
// wall that rejects its owner.
//
// Both bounds are asserted in server/tests/faceMatch.test.js, so this constant
// cannot drift above the measured separation without a failing test.
export const MIN_THRESHOLD = 0.15;
export const MAX_THRESHOLD = 0.32;

// A stored value outside a sane band is ignored rather than clamped: a typo in
// the admin panel should not silently turn the matcher into an open door or a
// wall. `fallback` is the compiled-in default, `raw` is the hundredths value
// read from settings.
export function resolveThreshold(raw, fallback) {
  const value = Number(raw) / 100;
  if (!Number.isFinite(value)) return fallback;
  if (value < MIN_THRESHOLD || value > MAX_THRESHOLD) return fallback;
  return value;
}
