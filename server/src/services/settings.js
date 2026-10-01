import Setting from '../models/Setting.js';
import { env } from '../config/env.js';

const DEFAULTS = [
  { key: 'maintenance_mode_enabled', value: 'false', type: 'boolean', category: 'general', description: 'Put the site into maintenance mode' },
  {
    key: 'maintenance_message',
    value: 'We are currently performing scheduled maintenance. Please try again later.',
    type: 'string',
    category: 'general',
    description: 'Message shown during maintenance',
  },
  { key: 'session_timeout_minutes', value: '30', type: 'integer', category: 'security', description: 'Session idle timeout in minutes' },
  { key: 'site_name', value: 'E-Voting System', type: 'string', category: 'general', description: 'Site name shown across the app' },
  { key: 'site_about', value: '', type: 'string', category: 'general', description: 'Short description of the site' },
  { key: 'contact_email', value: '', type: 'string', category: 'general', description: 'Public contact email address' },
  { key: 'voter_registration_enabled', value: '1', type: 'boolean', category: 'registration_voting', description: 'Allow new voter registration' },
  { key: 'voting_enabled', value: '1', type: 'boolean', category: 'registration_voting', description: 'Allow voting to take place' },
  { key: 'results_visible', value: '1', type: 'boolean', category: 'registration_voting', description: 'Show election results to voters' },
  { key: 'face_verification_enabled', value: '1', type: 'boolean', category: 'registration_voting', description: 'Require one-time face verification before voting' },
  {
    key: 'face_match_threshold',
    value: '30',
    type: 'integer',
    category: 'registration_voting',
    description:
      'Face match distance ceiling in hundredths (30 = 0.30), measured on unit-length descriptors. Lower is stricter. Accepted range is 15-32: the closest pair of different voters measured 0.327, so anything at or above that stops telling people apart. Values outside the range are ignored and the default is used.',
  },
  { key: 'accreditation_required_global', value: '0', type: 'boolean', category: 'registration_voting', description: 'Require admin accreditation before voting' },
  { key: 'single_election_at_a_time', value: '1', type: 'boolean', category: 'registration_voting', description: 'Restrict voting to a single active election' },
  { key: 'send_vote_confirmation_email', value: '0', type: 'boolean', category: 'notifications', description: 'Email voters a vote confirmation' },
  { key: 'send_welcome_email', value: '0', type: 'boolean', category: 'notifications', description: 'Email new voters on registration' },
  { key: 'recaptcha_enabled', value: '1', type: 'boolean', category: 'security', description: 'Require Google reCAPTCHA on sensitive forms' },
  { key: 'recaptcha_site_key', value: '', type: 'string', category: 'security', description: 'Google reCAPTCHA v2 site key' },
  { key: 'recaptcha_secret_key', value: '', type: 'string', category: 'security', description: 'Google reCAPTCHA v2 secret key' },
  { key: 'email_notifications_enabled', value: '1', type: 'boolean', category: 'notifications', description: 'Send transaction emails (OTP, reset, accreditation)' },
  { key: 'smtp_host', value: '', type: 'string', category: 'email', description: 'SMTP host' },
  { key: 'smtp_port', value: '587', type: 'integer', category: 'email', description: 'SMTP port' },
  { key: 'smtp_user', value: '', type: 'string', category: 'email', description: 'SMTP username' },
  { key: 'smtp_pass', value: '', type: 'string', category: 'email', description: 'SMTP password / app password' },
  { key: 'smtp_from_email', value: '', type: 'string', category: 'email', description: 'Sender email address' },
  { key: 'smtp_secure', value: '0', type: 'boolean', category: 'email', description: 'Use TLS for SMTP' },
  { key: 'geofence_enabled', value: '1', type: 'boolean', category: 'general', description: 'Restrict voting to a geographic area. When off, voters can register, log in and vote from anywhere.' },
  { key: 'geofence_lat', value: String(env.GEOFENCE.lat), type: 'string', category: 'general', description: 'Geofence center latitude' },
  { key: 'geofence_lng', value: String(env.GEOFENCE.lng), type: 'string', category: 'general', description: 'Geofence center longitude' },
  { key: 'geofence_radius', value: String(env.GEOFENCE.radius), type: 'string', category: 'general', description: 'Geofence radius in meters' },
];

export const SETTINGS_DEFAULTS = DEFAULTS;

// Settings whose values are credentials. They are stored in the database and
// read internally by services/email.js and services/captcha.js, but they must
// never cross the wire to a browser - a GET of the admin settings page used to
// hand the SMTP password and the reCAPTCHA secret to the client in plaintext,
// where they sit in DevTools and are readable by any XSS on the page.
//
// The admin form still needs to show that a value is present, so these keys are
// redacted to an empty string and carry `secret: true` / `has_value: <bool>`
// instead. A blank submitted value means "leave the stored secret alone", which
// is enforced in updateSettings, so saving the form cannot blank a password.
export const SECRET_KEYS = new Set(['smtp_pass', 'recaptcha_secret_key']);

const isSecret = (key) => SECRET_KEYS.has(key);

let cache = null;
let cacheAt = 0;
const TTL = 5000;

function coerce(value, type) {
  switch (type) {
    case 'boolean':
      return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
    case 'integer': {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    }
    default:
      return String(value ?? '');
  }
}

export async function getAllSettings(force = false) {
  if (cache && !force && Date.now() - cacheAt < TTL) return cache;
  const docs = await Setting.find({});
  const map = { ...cache };
  docs.forEach((d) => {
    map[d.setting_key] = coerce(d.setting_value, d.setting_type);
  });
  cache = map;
  cacheAt = Date.now();
  return map;
}

export async function getSetting(key, fallback = undefined) {
  const all = await getAllSettings();
  if (key in all) return all[key];
  const def = DEFAULTS.find((d) => d.key === key);
  if (def) return coerce(def.value, def.type);
  return fallback;
}

// One bulk round-trip instead of a findOne+create pair per setting: on a remote
// Atlas connection the per-key loop added several seconds to server start-up,
// during which the Vite proxy returned 500s to the browser.
export async function ensureDefaultSettings() {
  await Setting.bulkWrite(
    DEFAULTS.map((d) => ({
      updateOne: {
        filter: { setting_key: d.key },
        update: {
          $setOnInsert: {
            setting_key: d.key,
            setting_value: String(d.value ?? ''),
            setting_type: d.type ?? 'string',
            category: d.category ?? 'general',
            description: d.description ?? '',
          },
        },
        upsert: true,
      },
    })),
    { ordered: false }
  );
  cache = null;
}

export async function setSetting(key, value) {
  const doc = await Setting.findOneAndUpdate({ setting_key: key }, { setting_value: String(value), updated_at: new Date() }, { upsert: true, new: true });
  cache = null;
  return doc;
}

// Shapes rows for the admin settings screen. Redacts credentials in both
// `value` and `raw`; the unredacted values are only ever read internally via
// getAllSettings().
export async function listSettings() {
  const docs = await Setting.find({}).sort({ category: 1, setting_key: 1 });
  return docs.map((d) => {
    const secret = isSecret(d.setting_key);
    return {
      key: d.setting_key,
      value: secret ? '' : coerce(d.setting_value, d.setting_type),
      raw: secret ? '' : d.setting_value,
      secret,
      has_value: secret ? Boolean(d.setting_value) : undefined,
      type: d.setting_type,
      category: d.category,
      description: d.description,
    };
  });
}

export async function getSettingsMap() {
  const list = await listSettings();
  const map = {};
  list.forEach((s) => {
    map[s.key] = s.value;
  });
  return map;
}
