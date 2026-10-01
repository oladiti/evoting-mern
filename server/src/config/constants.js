// Ported constants from the PHP app (config.php / face-auth.js)

// Distance ceiling for a face match, and the default for the admin-tunable
// `face_match_threshold` setting.
//
// This is measured on unit-normalised descriptors, not on the raw 128-d vector.
// The raw comparison was quietly measuring two things at once: identity and how
// well-lit the capture was. Descriptor norm drifts with exposure, so a dark
// capture gets a smaller norm and a bigger raw distance to the same person
// while landing *closer* to a different person. Measured on this deployment's
// own enrolled users, raw distance between three different people was 0.45-0.51
// - comfortably under the old 0.6 ceiling, so every enrolled user matched every
// other. On unit-norm vectors the same three pairs come out at 0.33-0.36, a
// band that is actually separable. See faceController.js for the normalisation.
export const FACE_THRESHOLD = 0.3;
export const FACE_MAX_ATTEMPTS = 3;
export const FACE_LOCKOUT_SECONDS = 5 * 60; // 5 minutes
export const FACE_DESCRIPTOR_LENGTH = 128;

export const GEOFENCE_EARTH_RADIUS = 6371000; // metres
export const GEOFENCE_LAT_DEFAULT = 6.5438;
export const GEOFENCE_LNG_DEFAULT = 3.1183;
export const GEOFENCE_RADIUS_DEFAULT = 1500;

export const VERIFICATION_CODE_EXPIRY_HOURS = 1;
export const PASSWORD_RESET_EXPIRY_HOURS = 1;
export const REMEMBER_ME_DAYS = 30;
export const DEFAULT_SESSION_TIMEOUT_MINUTES = 30;

export const RESEND_VERIFY_THROTTLE_SECONDS = 60;
export const RESET_REQUEST_THROTTLE_SECONDS = 60;

// Password policy (mirror of register.php)
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_RULE = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{8,}$/;
export const USERNAME_RULE = /^[a-zA-Z0-9_]{3,30}$/;
export const MATRIC_RULE = /^[A-Za-z0-9/]{1,50}$/;

// Rate limiting escalation curve (config.php getLoginLockoutDuration)
export function lockoutDurationForAttempts(attempts) {
  if (attempts >= 20) return 120;
  if (attempts >= 15) return 60;
  if (attempts >= 10) return 30;
  return 15;
}

export const LOGIN_MAX_ATTEMPTS = 5;
export const IP_MAX_ATTEMPTS = 20;
