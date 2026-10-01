import { env } from '../config/env.js';
import { getSetting } from './settings.js';

// reCAPTCHA has three distinct states, and conflating the middle two is how the
// old implementation turned a security control off without telling anyone:
//
//   1. admin disabled it          -> not enforced, admin's explicit choice
//   2. admin enabled it, keys set -> enforced
//   3. admin enabled it, no keys  -> MISCONFIGURED
//
// State 3 used to be reported as "not enforced", so a missing RECAPTCHA_SECRET_KEY
// silently removed the captcha from register, login, password reset and voting
// while the settings screen still showed reCAPTCHA as on. On an election system
// that is the worst possible failure mode: invisible, and it opens registration
// and voting to automated abuse.
export async function recaptchaStatus() {
  const enabled = Boolean(await getSetting('recaptcha_enabled', true));
  const configured = Boolean(env.RECAPTCHA.siteKey && env.RECAPTCHA.secretKey);
  return {
    enabled,
    configured,
    enforced: enabled && configured,
    misconfigured: enabled && !configured,
  };
}

// Kept as the "should I render the widget / demand a token" predicate, which
// is genuinely false in states 1 and 3 - there is no key to render a working
// widget with. State 3 is handled by verifyRecaptcha, not by pretending here
// that everything is fine.
export async function isRecaptchaEnabled() {
  return (await recaptchaStatus()).enforced;
}

// One warning per process rather than one per request: these run on every
// registration, login, reset and vote, and a log line per attempt would bury
// the message in exactly the traffic an operator would be reading.
let warned = false;
function warnMisconfigured() {
  if (warned) return;
  warned = true;
  console.error(
    '[captcha] SECURITY: recaptcha_enabled is ON but RECAPTCHA_SITE_KEY / RECAPTCHA_SECRET_KEY are missing.\n' +
      '[captcha] The captcha cannot be verified, so protected forms are being REJECTED until this is fixed.\n' +
      '[captcha] Set both keys in server/.env, or turn the setting off in Admin > Settings > Security.'
  );
}

export async function verifyRecaptcha(token) {
  const status = await recaptchaStatus();

  if (!status.enabled) return true;

  if (status.misconfigured) {
    // Fail closed. Silently passing the request is what created this bug; the
    // honest options are "deny and say why" or "deny and stay quiet", and the
    // first is recoverable. Set RECAPTCHA_FAIL_OPEN=true to invert during an
    // incident, at the cost of running unprotected - loudly.
    warnMisconfigured();
    if (env.RECAPTCHA.failOpen) {
      console.error('[captcha] RECAPTCHA_FAIL_OPEN is set - protected forms are being allowed through WITHOUT verification.');
      return true;
    }
    throw new CaptchaMisconfiguredError();
  }

  if (!token) return false;
  try {
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: env.RECAPTCHA.secretKey,
        response: token,
      }),
    });
    const data = await res.json();
    return Boolean(data.success);
  } catch (err) {
    console.error('[captcha] verify error:', err.message);
    return false;
  }
}

export class CaptchaMisconfiguredError extends Error {
  constructor() {
    // status 503 rather than 400: nothing about the requester's input is wrong,
    // the server is. The generic error middleware passes err.status through.
    super('reCAPTCHA is enabled on this server but not configured. This is a server-side misconfiguration, not a problem with your input.');
    this.name = 'CaptchaMisconfiguredError';
    this.status = 503;
    this.expose = true;
  }
}
