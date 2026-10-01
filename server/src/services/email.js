import nodemailer from 'nodemailer';
import { createHash } from 'node:crypto';
import { env } from '../config/env.js';
import { getSetting, getAllSettings } from './settings.js';

// Precedence rule: the SMTP block in /admin/settings only takes effect once an
// admin has supplied a complete credential set there (host + user + pass).
// Until then server/.env is used wholesale.
//
// This matters because ensureDefaultSettings() seeds every SMTP key at start-up,
// so the collection always contains smtp_port='587' and smtp_secure='0' even
// when nobody has ever opened the settings page. Letting those placeholders
// win per-field would silently downgrade a working .env of port 465/secure=true
// to 587/STARTTLS. Gating on a complete credential set keeps the placeholders
// inert while still letting an admin override every field once they mean it.
//
// The password is deliberately never seeded from .env into the database.
export async function resolveSmtpConfig() {
  const all = await getAllSettings();
  const str = (key) => {
    const v = all[key];
    return v === undefined || v === null ? '' : String(v).trim();
  };

  const dbHost = str('smtp_host');
  const dbUser = str('smtp_user');
  const dbPass = str('smtp_pass');
  const adminOverride = Boolean(dbHost && dbUser && dbPass);

  const host = adminOverride ? dbHost : env.MAIL.host || dbHost;
  const user = adminOverride ? dbUser : env.MAIL.user || dbUser;
  const pass = adminOverride ? dbPass : env.MAIL.pass || dbPass;
  const from = (adminOverride ? str('smtp_from_email') || user : env.MAIL.from || user) || user;
  const port = Number(adminOverride ? str('smtp_port') || 587 : env.MAIL.port || 587) || 587;

  // 465 is implicit TLS and cannot be negotiated as STARTTLS, so it wins over a
  // stale toggle. Otherwise an explicit admin choice is honoured, falling back
  // to the .env value and finally to a port-based inference.
  const secure = port === 465 ? true : adminOverride ? Boolean(all.smtp_secure) : env.MAIL.secure !== undefined ? Boolean(env.MAIL.secure) : port === 465;

  return {
    host,
    port,
    secure,
    user,
    pass,
    from,
    source: adminOverride ? 'settings' : 'env',
    configured: Boolean(host && user && pass),
  };
}

// Cache is keyed by a signature of the resolved config so that saving new
// credentials in /admin/settings takes effect without a server restart. The
// previous unconditional `if (transporter) return transporter` could never
// invalidate, which would have made the admin form appear broken after a save.
let transporter = null;
let transporterSig = null;

function signatureOf(cfg) {
  const pass = createHash('sha256')
    .update(cfg.pass || '')
    .digest('hex')
    .slice(0, 12);
  return [cfg.host, cfg.port, cfg.secure, cfg.user, pass].join('|');
}

export async function getTransporter() {
  const cfg = await resolveSmtpConfig();
  if (!cfg.configured) return null;
  const sig = signatureOf(cfg);
  if (transporter && transporterSig === sig) return transporter;
  transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  transporterSig = sig;
  return transporter;
}

export function resetTransporterCache() {
  transporter = null;
  transporterSig = null;
}

// Declared async so the intent is explicit. It was already returning the promise
// from getSetting, but every call site interpolated it into a template string,
// which stringifies a Promise to "[object Promise]". That put the literal text
// "[object Promise] - You Are Accredited" in the subject of every outbound mail,
// and the same in the From display name and the footer of every HTML body.
async function siteName() {
  return getSetting('site_name', env.SITE_NAME);
}

// Plain-text alternative for the HTML body. These messages were previously sent
// as HTML with no text part, which is a strong spam signal to Gmail and a common
// reason a mail the SMTP server happily accepted never reaches the inbox.
function htmlToText(html) {
  return (
    String(html)
      // Anchors are expanded before tags are stripped, otherwise the href is lost
      // and a password-reset link is unusable in a text-only mail client.
      .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, inner) => {
        const label = String(inner)
          .replace(/<[^>]+>/g, '')
          .trim();
        return label && label !== href ? `${label} (${href})` : href;
      })
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\s*\/\s*(p|div|tr|h[1-6]|li)\s*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .split('\n')
      .map((l) => l.trim())
      .filter((l, i, arr) => l !== '' || (i > 0 && arr[i - 1] !== ''))
      .join('\n')
      .trim()
  );
}

// Async because the footer names the site, which lives in settings rather than in
// .env. Every caller already had to await the surrounding send, so making this
// async costs nothing and removes the last un-awaited interpolation.
async function brandHtml(title, bodyHtml, cta = null, ctaUrl = null) {
  const site = await siteName();
  const button = cta
    ? `<div style="text-align:center;margin:28px 0;">
        <a href="${ctaUrl}" style="background:linear-gradient(135deg,#0891b2,#06b6d4);color:#fff;text-decoration:none;
        padding:14px 32px;border-radius:8px;font-weight:600;display:inline-block;">${cta}</a>
      </div>`
    : '';
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f8fafc;font-family:Segoe UI,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:28px 16px;">
    <div style="background:linear-gradient(135deg,#0891b2,#06b6d4);border-radius:12px 12px 0 0;padding:22px;text-align:center;">
      <h2 style="margin:0;color:#ffffff;">${title}</h2>
    </div>
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:28px;">
      ${bodyHtml}
      ${button}
      <p style="color:#64748b;font-size:12px;margin-top:28px;">This is an automated message from ${site}. Please do not reply.</p>
    </div>
  </div></body></html>`;
}

// Distinguishes the three ways sending can fail to produce a delivered mail:
// notifications switched off, SMTP unconfigured, and SMTP rejecting us. Callers
// must be able to tell the user which happened instead of assuming success.
export async function sendEmail({ to, subject, html }) {
  const enabled = await getSetting('email_notifications_enabled', true);
  if (!enabled) {
    console.log(`[mail] disabled, skipped -> ${to} (${subject})`);
    return { ok: false, skipped: true, reason: 'disabled', error: 'Email notifications are switched off in Settings > Notifications.' };
  }

  const cfg = await resolveSmtpConfig();
  if (!cfg.configured) {
    console.log('[mail] SMTP not configured, email not sent:', subject);
    return { ok: false, skipped: true, reason: 'not_configured', error: 'SMTP is not configured. Set it in Settings > Email (SMTP) or in server/.env.' };
  }

  const tr = await getTransporter();
  const site = await siteName();
  try {
    const info = await tr.sendMail({
      from: `"${site}" <${cfg.from}>`,
      to,
      subject,
      text: htmlToText(html),
      html,
    });
    return { ok: true, messageId: info?.messageId, from: cfg.from };
  } catch (err) {
    // A wrong Gmail app password lands here as
    // "535 5.7.8 Username and Password not accepted" and used to vanish into
    // console.error while the API still told the user to check their inbox.
    console.error(`[mail] send failed (${cfg.host}:${cfg.port} as ${cfg.user}):`, err.message);
    return { ok: false, reason: 'send_failed', error: err.message, code: err.code || null };
  }
}

// Live connection + credentials check for the "Send test email" button, so a
// misconfigured mail server is discovered here instead of on the next
// registration.
export async function verifySmtpTransport() {
  const cfg = await resolveSmtpConfig();
  if (!cfg.configured) {
    return { ok: false, reason: 'not_configured', error: 'SMTP is not configured. Set it in Settings > Email (SMTP) or in server/.env.' };
  }
  const tr = await getTransporter();
  try {
    await tr.verify();
    return { ok: true, host: cfg.host, port: cfg.port, secure: cfg.secure, user: cfg.user, source: cfg.source };
  } catch (err) {
    console.error(`[mail] verify failed (${cfg.host}:${cfg.port} as ${cfg.user}):`, err.message);
    return { ok: false, reason: 'verify_failed', error: err.message, code: err.code || null };
  }
}

export async function sendVerificationEmail(to, code, fullName) {
  const site = await siteName();
  return sendEmail({
    to,
    subject: `${site} - Email Verification Code`,
    html: await brandHtml(
      'Verify Your Email',
      `<p style="color:#334155;font-size:15px;">Hi ${fullName || 'there'},</p>
       <p style="color:#334155;font-size:15px;">Your verification code is:</p>
       <div style="text-align:center;margin:24px 0;">
         <span style="font-size:34px;font-weight:800;letter-spacing:8px;color:#0e7490;">${code}</span>
       </div>
       <p style="color:#475569;">This code expires in 10 minutes. Do not share it with anyone.</p>`
    ),
  });
}

export async function sendPasswordResetEmail(to, fullName, resetUrl) {
  const site = await siteName();
  return sendEmail({
    to,
    subject: `${site} - Password Reset`,
    html: await brandHtml(
      'Reset Your Password',
      `<p style="color:#334155;font-size:15px;">Hi ${fullName || 'there'},</p>
       <p style="color:#334155;font-size:15px;">We received a request to reset your password. Click the button below to set a new one.</p>
       <p style="color:#94a3b8;font-size:13px;">This link expires in 1 hour.</p>`,
      'Reset Password',
      resetUrl
    ),
  });
}

export async function sendAccreditationEmail(to, fullName, electionTitle, voteUrl) {
  const site = await siteName();
  return sendEmail({
    to,
    subject: `${site} - You Are Accredited`,
    html: await brandHtml(
      'Accreditation Confirmed',
      `<p style="color:#334155;font-size:15px;">Hi ${fullName || 'there'},</p>
       <p style="color:#334155;font-size:15px;">You have been accredited to vote in the election: <strong>${electionTitle}</strong>.</p>
       <p style="color:#475569;">Click the button below to cast your vote before the election ends.</p>`,
      'Click Here to Vote',
      voteUrl
    ),
  });
}

export async function sendContactReply(to, name, subject, replyText) {
  return sendEmail({
    to,
    subject: `Re: ${subject}`,
    html: await brandHtml(
      'Reply to Your Message',
      `<p style="color:#334155;font-size:15px;">Hi ${name || 'there'},</p>
       <p style="color:#334155;font-size:15px;">Thank you for contacting us. Here is our reply:</p>
       <div style="background:#f1f5f9;padding:16px;border-radius:8px;color:#334155;white-space:pre-line;">${String(replyText).replace(/\n/g, '<br/>')}</div>`
    ),
  });
}

export async function sendContactNotification(fromEmail, name, subject, message) {
  return sendEmail({
    to: env.MAIL.to || env.MAIL.user,
    subject: `New Contact Message: ${subject}`,
    html: await brandHtml(
      'New Contact Message',
      `<p style="color:#334155;"><strong>Name:</strong> ${name}</p>
       <p style="color:#334155;"><strong>Email:</strong> ${fromEmail}</p>
       <p style="color:#334155;"><strong>Subject:</strong> ${subject}</p>
       <p style="color:#334155;"><strong>Message:</strong></p>
       <div style="background:#f1f5f9;padding:16px;border-radius:8px;color:#334155;">${message.replace(/\n/g, '<br/>')}</div>`
    ),
  });
}

// Proves the full path (auth + relay + acceptance), not just that credentials
// parse. Sent to the signed-in admin so it cannot be used to mail arbitrary
// addresses.
export async function sendTestEmail(to) {
  const site = await siteName();
  return sendEmail({
    to,
    subject: `${site} - Test Email`,
    html: await brandHtml(
      'SMTP Test Email',
      `<p style="color:#334155;font-size:15px;">This is a test message from your ${site} admin panel.</p>
       <p style="color:#475569;">If you can read this, outbound email is working and verification codes will be delivered.</p>`
    ),
  });
}
