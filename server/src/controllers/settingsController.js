import mongoose from 'mongoose';
import { listSettings, getSettingsMap, setSetting, ensureDefaultSettings, SETTINGS_DEFAULTS, SECRET_KEYS } from '../services/settings.js';
import { logActivity } from '../services/activityLog.js';
import { resolveSmtpConfig, verifySmtpTransport, sendTestEmail } from '../services/email.js';

// Sentinel an admin can submit to blank a stored credential on purpose. Any
// other empty value means "keep what's there", because the real value is never
// sent to the browser in the first place.
const CLEAR_SECRET = '__clear__';

// Never expose the password, but do show which server is in use and whether it
// came from this form or from server/.env, so an admin can tell why a change
// appears to have had no effect.
function publicSmtpInfo(cfg) {
  return {
    smtp_configured: cfg.configured,
    smtp_source: cfg.source,
    smtp_active: { host: cfg.host, port: cfg.port, secure: cfg.secure, user: cfg.user, from: cfg.from },
  };
}

export async function getSettings(req, res, next) {
  try {
    const settings = await listSettings();
    const categories = [...new Set(settings.map((s) => s.category))];
    const settings_map = await getSettingsMap();
    const smtp = await resolveSmtpConfig();
    return res.json({
      settings,
      settings_map,
      categories,
      recaptcha_configured: Boolean(process.env.RECAPTCHA_SITE_KEY && process.env.RECAPTCHA_SECRET_KEY),
      ...publicSmtpInfo(smtp),
    });
  } catch (err) {
    next(err);
  }
}

export async function updateSettings(req, res, next) {
  try {
    const { updates = [] } = req.body || {};
    if (!Array.isArray(updates)) return res.status(400).json({ error: 'Invalid payload.' });
    const allowed = new Set(SETTINGS_DEFAULTS.map((d) => d.key));
    let changed = 0;
    for (const u of updates) {
      if (!u || !u.key || !allowed.has(u.key)) continue;
      const def = SETTINGS_DEFAULTS.find((d) => d.key === u.key);
      const value = u.value === undefined || u.value === null ? '' : u.value;

      // Secrets are never sent to the client, so the form submits an empty
      // string for them. Treating that as a write would blank the SMTP password
      // and the reCAPTCHA secret every time an admin saved an unrelated field,
      // so an empty value on a secret key is a no-op: the admin has to type a
      // new value to replace one. To clear a secret deliberately, send the
      // literal string below.
      if (SECRET_KEYS.has(u.key) && String(value).trim() === '') {
        if (u.value === CLEAR_SECRET) {
          await setSetting(u.key, '');
          changed++;
        }
        continue;
      }

      await setSetting(u.key, def?.type === 'boolean' ? (value ? '1' : '0') : value);
      changed++;
    }
    await logActivity({ user: req.user, username: req.user.username, action: 'SETTINGS_UPDATED', description: `Updated ${changed} setting(s)`, entity_type: 'Setting', entity_id: null, req });
    return res.json({ message: `${changed} setting(s) updated.` });
  } catch (err) {
    next(err);
  }
}

// Lets an admin confirm outbound mail from the settings screen instead of
// discovering a broken SMTP server through a failed voter registration.
export async function sendTestEmailToAdmin(req, res, next) {
  try {
    const to = req.user?.email;
    if (!to) return res.status(400).json({ error: 'Your admin account has no email address.' });

    // Check the connection and credentials first: a verify() failure names the
    // real problem (bad password, blocked port, wrong host) far more clearly
    // than a relay rejection does.
    const verified = await verifySmtpTransport();
    if (!verified.ok) {
      await logActivity({
        user: req.user,
        username: req.user.username,
        action: 'SMTP_TEST_FAILED',
        description: `Test email failed (${verified.reason || 'unknown'}): ${verified.error || 'unknown error'}`,
        entity_type: 'Setting',
        entity_id: null,
        req,
      });
      return res.status(502).json({
        error: 'SMTP connection test failed.',
        mailError: verified.error,
        mailReason: verified.reason,
      });
    }

    const sent = await sendTestEmail(to);
    if (!sent.ok) {
      await logActivity({
        user: req.user,
        username: req.user.username,
        action: 'SMTP_TEST_FAILED',
        description: `Test email rejected (${sent.reason || 'unknown'}): ${sent.error || 'unknown error'}`,
        entity_type: 'Setting',
        entity_id: null,
        req,
      });
      return res.status(502).json({ error: 'SMTP connected but the test message was not accepted.', mailError: sent.error, mailReason: sent.reason });
    }

    await logActivity({
      user: req.user,
      username: req.user.username,
      action: 'SMTP_TEST_SENT',
      description: `Test email sent to ${to} via ${verified.host}:${verified.port}`,
      entity_type: 'Setting',
      entity_id: null,
      req,
    });
    return res.json({ message: `Test email sent to ${to}.`, sentTo: to, server: { host: verified.host, port: verified.port, secure: verified.secure, source: verified.source } });
  } catch (err) {
    next(err);
  }
}

const BACKUP_COLLECTIONS = [
  'users',
  'elections',
  'candidates',
  'votes',
  'accreditations',
  'emailverifications',
  'loginattempts',
  'passwordresets',
  'refreshtokens',
  'activitylogs',
  'settings',
  'contacts',
];

export async function backupDatabase(req, res, next) {
  try {
    const db = mongoose.connection.db;
    const dump = {};
    for (const name of BACKUP_COLLECTIONS) {
      const coll = db.collection(name);
      dump[name] = await coll.find({}).limit(100000).toArray();
    }
    dump.__meta = { db: 'evoting', exported_at: new Date().toISOString(), version: 1 };
    const body = JSON.stringify(dump);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="evoting_backup_${new Date().toISOString().slice(0, 10)}.json"`);
    await logActivity({ user: req.user, username: req.user.username, action: 'BACKUP', description: 'Database backup downloaded', entity_type: null, entity_id: null, req });
    return res.send(body);
  } catch (err) {
    next(err);
  }
}

// Restore is the most destructive thing this API can do: it empties every
// collection and refills them from a JSON body, with no schema validation. A
// malformed or hostile document is inserted verbatim. It is admin-gated, so
// this is a blast-radius and robustness problem rather than an open hole, but
// three cheap guards are worth having before anyone points it at a real
// production database:
//
//   1. every element must be a plain object (an array or a string in a
//      collection position reaches insertMany as a shape it will not validate)
//   2. a per-document size and per-collection count ceiling, so a single
//      pathological upload cannot exceed what a legitimate backup produces
//      (backupDatabase itself caps at 100k docs per collection, so this only
//      rejects exports that could not have come from our own backup endpoint)
//   3. restored refresh tokens are dropped. A backup taken before an incident
//      and replayed afterwards must not hand the restorer's old sessions - and
//      the access tokens minted from them - back to whoever saved the file.
const RESTORE_MAX_DOCS_PER_COLLECTION = 100000;
const RESTORE_MAX_BYTES_PER_DOC = 64 * 1024;

export async function restoreDatabase(req, res, next) {
  try {
    const json = req.body?.backup;
    if (!json) return res.status(400).json({ error: 'No backup data provided.' });
    let dump;
    try {
      dump = typeof json === 'string' ? JSON.parse(json) : json;
    } catch {
      return res.status(400).json({ error: 'Invalid backup JSON.' });
    }
    if (!dump || typeof dump !== 'object' || Array.isArray(dump)) {
      return res.status(400).json({ error: 'Invalid backup structure.' });
    }

    // Validate the entire payload before touching the database. Checking
    // everything up front means a bad document on the last collection does not
    // leave the first eleven wiped and replaced.
    for (const name of BACKUP_COLLECTIONS) {
      const docs = dump[name];
      if (docs === undefined) continue;
      if (!Array.isArray(docs)) {
        return res.status(400).json({ error: `Collection "${name}" must be an array.` });
      }
      if (docs.length > RESTORE_MAX_DOCS_PER_COLLECTION) {
        return res.status(413).json({ error: `Collection "${name}" has ${docs.length} documents, above the ${RESTORE_MAX_DOCS_PER_COLLECTION} limit.` });
      }
      for (let i = 0; i < docs.length; i++) {
        const d = docs[i];
        if (!d || typeof d !== 'object' || Array.isArray(d)) {
          return res.status(400).json({ error: `Collection "${name}" document ${i} is not an object.` });
        }
        if (Buffer.byteLength(JSON.stringify(d), 'utf8') > RESTORE_MAX_BYTES_PER_DOC) {
          return res.status(413).json({ error: `Collection "${name}" document ${i} exceeds the ${RESTORE_MAX_BYTES_PER_DOC} byte limit.` });
        }
      }
    }

    const db = mongoose.connection.db;
    const restored = {};
    for (const name of BACKUP_COLLECTIONS) {
      let docs = Array.isArray(dump[name]) ? dump[name] : [];
      // Refreshing a backup must not resurrect old sessions. Any token in the
      // payload is dropped, which forces every restored user to sign in again.
      if (name === 'refreshtokens') docs = [];
      const coll = db.collection(name);
      await coll.deleteMany({});
      if (docs.length) {
        // Keep original _id values so cross-collection references stay intact.
        await coll.insertMany(docs.map((d) => JSON.parse(JSON.stringify(d))));
      }
      restored[name] = docs.length;
    }
    await ensureDefaultSettings();

    await logActivity({
      user: req.user,
      username: req.user.username,
      action: 'RESTORE',
      description: 'Database restored from backup; all refresh tokens invalidated',
      entity_type: null,
      entity_id: null,
      req,
    });
    return res.json({ message: 'Database restored successfully. All sessions were invalidated.', restored });
  } catch (err) {
    next(err);
  }
}
