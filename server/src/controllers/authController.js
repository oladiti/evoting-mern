import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import EmailVerification from '../models/EmailVerification.js';
import PasswordReset from '../models/PasswordReset.js';
import { validators, randomCode, randomHex, escapeRegExp, publicUrl } from '../utils/index.js';
import { getSetting } from '../services/settings.js';
import {
  createRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
  RefreshReuseError,
  signAccessToken,
  verifyAccessToken,
  accessCookieOptions,
  refreshCookieOptions,
  sessionRefreshCookieOptions,
  clearAuthCookies,
} from '../services/tokens.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/email.js';
import { verifyRecaptcha, isRecaptchaEnabled } from '../services/captcha.js';
import { recordFailedLogin, resetLoginAttempts, getLoginLockout } from '../services/rateLimit.login.js';
import { logActivity } from '../services/activityLog.js';
import { setFreshCsrf } from '../middleware/csrf.js';

function publicUser(u) {
  return {
    user_id: u._id,
    username: u.username,
    email: u.email,
    full_name: u.full_name,
    matric_no: u.matric_no,
    is_admin: u.is_admin,
    email_verified: u.email_verified,
    has_voted: u.has_voted,
    face_enrolled: u.face_enrolled,
    face_verified: u.face_verified,
    created_at: u.created_at,
  };
}

// User.username carries lowercase/trim setters, but those only apply on write.
// Records inserted by the MySQL migrator or the native driver kept their
// original casing, so an exact match on the lowercased input could never find
// them: matric "K102966" is stored as "K102966" while the login query asks for
// "k102966". Try the indexed exact match first, then fall back to a
// case-insensitive one so those legacy rows stay reachable.
function normalizeUsername(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

async function findUserByUsername(value) {
  const normalized = normalizeUsername(value);
  if (!normalized) return null;
  const exact = await User.findOne({ username: normalized });
  if (exact) return exact;
  return User.findOne({ username: new RegExp(`^${escapeRegExp(normalized)}$`, 'i') });
}

// bcrypt.compare rejects (rather than resolving false) when the stored hash is
// not a string, so a malformed record would surface as a 500 crash. Treat it as
// a failed comparison instead and log loudly.
async function verifyPassword(plain, hash) {
  if (typeof hash !== 'string' || hash.length !== 60) {
    console.error('[auth] stored password is not a bcrypt hash; rejecting sign-in');
    return false;
  }
  try {
    return await bcrypt.compare(String(plain), hash);
  } catch {
    return false;
  }
}

function setAuth(req, res, user, remember) {
  // Always issue a refresh token so the session can rotate past the short access
  // token lifetime. "Remember me" decides persistence: a 30-day cookie vs a
  // browser-session cookie that is dropped when the browser closes.
  return Promise.all([signAccessToken(user, remember), createRefreshToken(user, { session: !remember })]).then(([access, refresh]) => {
    res.cookie('ev_access', access, accessCookieOptions(remember));
    res.cookie('ev_refresh', refresh, remember ? refreshCookieOptions : sessionRefreshCookieOptions);
  });
}

export async function register(req, res, next) {
  try {
    const enabled = await getSetting('voter_registration_enabled', true);
    if (!enabled) {
      return res.status(403).json({ error: 'Voter registration is currently disabled.' });
    }

    const { username, email, password, full_name = '', matric_no = null, 'g-recaptcha-response': captcha } = req.body || {};
    const v = validators();

    if (!v.username(username)) return res.status(400).json({ error: 'Username must be 3-30 chars (letters, numbers, underscore).' });
    if (!v.email(email)) return res.status(400).json({ error: 'A valid email is required.' });
    if (!v.password(password)) return res.status(400).json({ error: 'Password must be at least 8 characters with upper, lower and a number.' });
    if (matric_no && !v.matric(matric_no)) return res.status(400).json({ error: 'Invalid matric number format.' });

    const captchaRequired = await isRecaptchaEnabled();
    if (captchaRequired && !(await verifyRecaptcha(captcha))) {
      return res.status(400).json({ error: 'reCAPTCHA verification failed. Please try again.' });
    }

    // Case-insensitive so a differently-cased legacy row (see findUserByUsername)
    // still blocks the registration instead of letting a second account be created
    // under a variant spelling, which the byte-exact unique index would allow.
    const existingUser = await User.findOne({
      $or: [{ email: new RegExp(`^${escapeRegExp(email.trim().toLowerCase())}$`, 'i') }, { username: new RegExp(`^${escapeRegExp(normalizeUsername(username))}$`, 'i') }],
    });

    if (existingUser) {
      if (normalizeUsername(existingUser.username) === normalizeUsername(username)) {
        return res.status(409).json({ error: 'Username already taken.' });
      }
      if (normalizeUsername(existingUser.email) === normalizeUsername(email) && existingUser.email_verified) {
        return res.status(409).json({ error: 'An account with this email already exists.' });
      }
      if (normalizeUsername(existingUser.email) === normalizeUsername(email)) {
        // Re-registering from unverified account -> resend OTP. This is the path
        // a user lands on after a first attempt whose email silently failed to
        // send, so it reports the real outcome instead of claiming a resend.
        const mail = await issueVerificationCode(existingUser);
        if (!mail.ok) await logMailFailure(req, existingUser, 'EMAIL_SEND_FAILED', mail);
        setFreshCsrf(req, res, () => {});
        if (!mail.ok) {
          return res.status(502).json({
            error: 'This account is not verified yet and the new code could not be emailed.',
            resend: true,
            email: existingUser.email,
            emailSent: false,
            mailReason: mail.reason || 'send_failed',
            mailError: mail.error || 'SMTP send failed.',
          });
        }
        return res.json({ message: 'Verification code re-sent.', resend: true, email, emailSent: true });
      }
    }

    if (matric_no) {
      const matricTaken = await User.findOne({ matric_no });
      if (matricTaken) return res.status(409).json({ error: 'Matric number already registered.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({
      username: normalizeUsername(username),
      email: email.toLowerCase(),
      password: hash,
      full_name,
      matric_no: matric_no || null,
      email_verified: false,
    });

    const mail = await issueVerificationCode(user);
    if (!mail.ok) await logMailFailure(req, user, 'EMAIL_SEND_FAILED', mail);

    await logActivity({ user, username: user.username, action: 'REGISTER', description: 'New voter registration', entity_type: 'User', entity_id: user._id, req });

    setFreshCsrf(req, res, () => {});
    // The account genuinely exists, so this stays a 201. Reporting a failed
    // registration instead would push the user into a retry that collides with
    // the "email already registered" check on the next attempt.
    if (!mail.ok) {
      return res.status(201).json({
        message: 'Account created, but the verification code could not be emailed.',
        email: user.email,
        emailSent: false,
        mailReason: mail.reason || 'send_failed',
        mailError: mail.error || 'SMTP send failed.',
      });
    }
    return res.status(201).json({ message: 'Registration successful. Check your email for a verification code.', email: user.email, emailSent: true });
  } catch (err) {
    next(err);
  }
}

async function issueVerificationCode(user) {
  const code = randomCode(6);
  await EmailVerification.deleteMany({ user: user._id });
  await EmailVerification.create({
    user: user._id,
    verification_code: code,
    expires_at: new Date(Date.now() + 10 * 60000),
  });
  // The delivery result is returned rather than discarded. Callers used to
  // report "check your email" whether the code was sent, skipped, or rejected,
  // which left a wrong SMTP password invisible to both user and admin.
  const result = await sendVerificationEmail(user.email, code, user.full_name);
  return { code, ...result };
}

// Records a failed delivery on the admin activity log. Without this the only
// trace of a broken mail server was a line in the server console.
async function logMailFailure(req, user, action, result) {
  try {
    await logActivity({
      user,
      username: user?.username,
      action,
      description: `Mail not sent (${result.reason || 'unknown'}): ${result.error || 'unknown error'}`,
      entity_type: 'User',
      entity_id: user?._id,
      req,
    });
  } catch {
    // Never let logging turn a successful registration into a 500.
  }
}

export async function resendVerification(req, res, next) {
  try {
    const { email } = req.body || {};
    const v = validators();
    if (!email || !v.email(email)) return res.status(400).json({ error: 'Valid email required.' });
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ error: 'No account found with this email.' });
    if (user.email_verified) return res.status(400).json({ error: 'Email already verified.' });
    const mail = await issueVerificationCode(user);
    if (!mail.ok) {
      await logMailFailure(req, user, 'EMAIL_RESEND_FAILED', mail);
      // 502: the request was valid and the code was regenerated, but the mail
      // server rejected it. Reporting 200 here is what made this look like an
      // unreceived email rather than a configuration fault.
      return res.status(502).json({
        error: 'Your code was regenerated but could not be emailed. Please try again shortly.',
        emailSent: false,
        mailReason: mail.reason || 'send_failed',
        mailError: mail.error || 'SMTP send failed.',
      });
    }
    await logActivity({ user, username: user.username, action: 'EMAIL_RESEND', description: 'Verification code resent', entity_type: 'User', entity_id: user._id, req });
    return res.json({ message: 'Verification code sent.', emailSent: true });
  } catch (err) {
    next(err);
  }
}

export async function verifyEmail(req, res, next) {
  try {
    const { email, code } = req.body || {};
    const v = validators();
    if (!email || !v.email(email) || !code) return res.status(400).json({ error: 'Email and code are required.' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ error: 'Account not found.' });
    if (user.email_verified) return res.json({ message: 'Email already verified.' });

    const rec = await EmailVerification.findOne({ user: user._id, verification_code: String(code), verified: false });
    if (!rec) return res.status(400).json({ error: 'Invalid verification code.' });
    if (rec.expires_at < new Date()) {
      await EmailVerification.deleteOne({ _id: rec._id });
      return res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
    }

    rec.verified = true;
    await rec.save();
    user.email_verified = true;
    await user.save();

    await logActivity({ user, username: user.username, action: 'EMAIL_VERIFY', description: 'Email verified', entity_type: 'User', entity_id: user._id, req });

    return res.json({ message: 'Email verified. You can now log in.' });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { username, password, remember = false, 'g-recaptcha-response': captcha } = req.body || {};

    if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });

    const recaptchaRequired = await isRecaptchaEnabled();
    if (recaptchaRequired && !(await verifyRecaptcha(captcha))) {
      return res.status(400).json({ error: 'reCAPTCHA verification failed. Please try again.' });
    }

    const lockout = await getLoginLockout({ username, req });
    if (lockout.locked) {
      const mins = Math.ceil((+lockout.unlockAt - Date.now()) / 60000);
      return res.status(429).json({ error: `Too many failed sign-in attempts. Please try again in ${Math.max(1, mins)} minute(s).` });
    }

    const user = await findUserByUsername(username);
    const okPassword = user ? await verifyPassword(password, user.password) : false;

    if (!user || !okPassword) {
      await recordFailedLogin({ username, req });
      await logActivity({ username: normalizeUsername(username), action: 'LOGIN_FAILED', description: 'Failed login attempt', entity_type: null, entity_id: null, req });
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    if (!user.email_verified) {
      return res.status(403).json({ error: 'Please verify your email before logging in.', needsVerification: true, email: user.email });
    }

    await resetLoginAttempts(username);
    await setAuth(req, res, user, Boolean(remember));
    setFreshCsrf(req, res, () => {});

    await logActivity({ user, username: user.username, action: 'LOGIN', description: 'User logged in', entity_type: 'User', entity_id: user._id, req });

    return res.json({ user: publicUser(user), message: 'Logged in.' });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req, res, next) {
  try {
    const refreshToken = req.cookies?.ev_refresh;
    const accessToken = req.cookies?.ev_access;
    if (refreshToken) {
      const rotated = await rotateRefreshToken(refreshToken);
      if (rotated) {
        // Preserve the token's scope: session tokens stay session-scoped, so a
        // non-"remember me" login never becomes a persistent one via rotation.
        res.cookie('ev_refresh', rotated.token, rotated.session ? sessionRefreshCookieOptions : refreshCookieOptions);
        const access = await signAccessToken(rotated.user, !rotated.session);
        res.cookie('ev_access', access, accessCookieOptions(!rotated.session));
        return res.json({ user: publicUser(rotated.user) });
      }
    } else if (accessToken) {
      const user = await verifyAccessToken(accessToken);
      if (user) return res.json({ user: publicUser(user) });
    }
    return res.status(401).json({ error: 'Not authenticated' });
  } catch (err) {
    if (err instanceof RefreshReuseError) {
      // A token that was already exchanged came back. rotateRefreshToken has
      // already destroyed the family, so nobody holding a copy of this session
      // can mint another one - but the client still has a cookie pointing at a
      // dead token and would retry in a loop, so clear it and tell the client
      // this was a forced sign-out rather than an expiry.
      clearAuthCookies(res);
      console.error(`[auth] refresh token reuse for user ${err.user?.username || err.user?._id} - family revoked`);
      await logActivity({
        user: err.user,
        username: err.user?.username,
        action: 'REFRESH_TOKEN_REUSE',
        description: 'A used refresh token was replayed; all sessions for this account were revoked',
        entity_type: 'User',
        entity_id: err.user?._id,
        req,
      });
      return res.status(401).json({ error: 'Your session was ended for security reasons. Please sign in again.', reason: 'token_reuse' });
    }
    next(err);
  }
}

export async function logout(req, res, next) {
  try {
    const refreshToken = req.cookies?.ev_refresh;
    await revokeRefreshToken(refreshToken);
    if (req.user) {
      await logActivity({ user: req.user, username: req.user.username, action: 'LOGOUT', description: 'User logged out', entity_type: 'User', entity_id: req.user._id, req });
    }
    clearAuthCookies(res);
    setFreshCsrf(req, res, () => {});
    return res.json({ message: 'Logged out.' });
  } catch (err) {
    next(err);
  }
}

// Signs the user out of every device, including this one. A user who suspects
// a phone or a shared computer still has their session does not otherwise have
// a way to end it: the access token is stateless and the refresh token rotates
// invisibly, so "log out" elsewhere never happened.
export async function logoutEverywhere(req, res, next) {
  try {
    const revoked = await revokeAllRefreshTokens(req.user._id);
    clearAuthCookies(res);
    setFreshCsrf(req, res, () => {});
    await logActivity({
      user: req.user,
      username: req.user.username,
      action: 'LOGOUT_ALL',
      description: `Signed out of all devices; revoked ${revoked} active session(s)`,
      entity_type: 'User',
      entity_id: req.user._id,
      req,
    });
    return res.json({ message: 'Signed out of all devices.', sessionsRevoked: revoked });
  } catch (err) {
    next(err);
  }
}

export async function forgotPassword(req, res, next) {
  try {
    const { email, 'g-recaptcha-response': captcha } = req.body || {};
    const v = validators();
    if (!email || !v.email(email)) return res.status(400).json({ error: 'Valid email required.' });

    const recaptchaRequired = await isRecaptchaEnabled();
    if (recaptchaRequired && !(await verifyRecaptcha(captcha))) {
      return res.status(400).json({ error: 'reCAPTCHA verification failed.' });
    }

    const key = `forgot:${email.toLowerCase()}`;
    const now = Date.now();
    if (req.app.locals.forgotThrottle?.[key] && now - req.app.locals.forgotThrottle[key] < 60000) {
      return res.status(429).json({ error: 'Please wait a minute before requesting another reset.' });
    }
    req.app.locals.forgotThrottle = req.app.locals.forgotThrottle || {};
    req.app.locals.forgotThrottle[key] = now;

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.json({ message: 'If that email exists, a reset link has been sent.' });

    const token = randomHex(32);
    await PasswordReset.deleteMany({ user: user._id });
    await PasswordReset.create({ user: user._id, token, expires_at: new Date(Date.now() + 3600000) });

    const resetUrl = publicUrl('/reset-password', { token });
    const mail = await sendPasswordResetEmail(user.email, user.full_name, resetUrl);
    // The generic reply below is deliberate anti-enumeration and stays as-is,
    // but a failed send must still be traceable by an admin.
    if (!mail.ok) await logMailFailure(req, user, 'PASSWORD_RESET_EMAIL_FAILED', mail);

    await logActivity({ user, username: user.username, action: 'PASSWORD_RESET_REQUEST', description: 'Password reset requested', entity_type: 'User', entity_id: user._id, req });

    return res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req, res, next) {
  try {
    const { token, password } = req.body || {};
    const v = validators();
    if (!token || !password) return res.status(400).json({ error: 'Token and new password are required.' });
    if (!v.password(password)) return res.status(400).json({ error: 'Password must be at least 8 characters with upper, lower and a number.' });

    const rec = await PasswordReset.findOne({ token }).populate('user');
    if (!rec) return res.status(400).json({ error: 'Invalid or expired reset link.' });
    if (rec.expires_at < new Date()) {
      await PasswordReset.deleteOne({ _id: rec._id });
      return res.status(400).json({ error: 'Reset link has expired. Please request a new one.' });
    }

    const user = rec.user;
    user.password = await bcrypt.hash(password, 10);
    await user.save();
    await PasswordReset.deleteOne({ _id: rec._id });

    // A reset is the user's statement that every existing session is
    // compromised. Swapping the password while leaving the old refresh tokens
    // alive would let whoever prompted the reset keep their access, which is
    // the entire point of doing it.
    const revoked = await revokeAllRefreshTokens(user._id);

    await logActivity({
      user,
      username: user.username,
      action: 'PASSWORD_RESET_COMPLETED',
      description: `Password reset completed; revoked ${revoked} active session(s)`,
      entity_type: 'User',
      entity_id: user._id,
      req,
    });

    return res.json({ message: 'Password updated. You can now log in.', sessionsRevoked: revoked });
  } catch (err) {
    next(err);
  }
}

export async function me(req, res, next) {
  try {
    if (req.user) {
      const user = await User.findById(req.user._id);
      if (user) return res.json({ user: publicUser(user) });
      return res.json({ user: null });
    }

    // Access token missing/expired — try to restore the session from the refresh cookie.
    const refreshToken = req.cookies?.ev_refresh;
    if (refreshToken) {
      const rotated = await rotateRefreshToken(refreshToken);
      if (rotated) {
        res.cookie('ev_refresh', rotated.token, rotated.session ? sessionRefreshCookieOptions : refreshCookieOptions);
        res.cookie('ev_access', await signAccessToken(rotated.user, !rotated.session), accessCookieOptions(!rotated.session));
        return res.json({ user: publicUser(rotated.user) });
      }
    }
    return res.json({ user: null });
  } catch (err) {
    // `me` is called on every page load, so it hits the same replay path as
    // refresh(). Report "no user" and drop the dead cookie rather than letting
    // the reuse error become a 500 on the app's first request.
    if (err instanceof RefreshReuseError) {
      console.error(`[auth] refresh token reuse for user ${err.user?.username || err.user?._id} - family revoked`);
      clearAuthCookies(res);
      return res.json({ user: null, reason: 'token_reuse' });
    }
    next(err);
  }
}

export async function publicBootstrap(req, res, next) {
  try {
    setFreshCsrf(req, res, () => {});
    return res.json({
      site_name: await getSetting('site_name', 'E-Voting System'),
      voter_registration_enabled: await getSetting('voter_registration_enabled', true),
      recaptcha_enabled: await isRecaptchaEnabled(),
      recaptcha_site_key: (await import('../config/env.js')).env.RECAPTCHA.siteKey || null,
      face_verification_enabled: await getSetting('face_verification_enabled', true),
      results_visible: await getSetting('results_visible', true),
      maintenance_mode_enabled: await getSetting('maintenance_mode_enabled', false),
      // Only the on/off flag is public. The fence centre and radius are never
      // exposed to unauthenticated visitors, and the ballot page has no use for
      // them beyond knowing whether to ask the browser for a location.
      geofence_enabled: await getSetting('geofence_enabled', true),
    });
  } catch (err) {
    next(err);
  }
}
