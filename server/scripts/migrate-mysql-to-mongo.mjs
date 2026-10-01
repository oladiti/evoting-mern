/**
 * Migration script: MySQL (XAMPP `evoting` DB) -> MongoDB Atlas `evoting` DB.
 *
 * Usage (from server/):
 *   npm run migrate            # migrate, replace target collections first
 *   npm run migrate -- --dry   # report what would be migrated, don't write
 *
 * Requires:
 *   - MySQL running locally (C:\xampp) with the `evoting` database (source).
 *   - DB_URI set in server/.env pointing at Atlas (or localhost).
 *   - Your Atlas IP allowlist includes your current IP.
 *   - Optional SRC_UPLOADS env var: path to PHP uploads dir (defaults to ../../evoting/uploads
 *     relative to server/, i.e. C:\xampp\htdocs\evoting\uploads).
 */
import mysql from 'mysql2/promise';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function dotenvLoad() {
  const p = path.resolve(__dirname, '../.env');
  if (!fs.existsSync(p)) return;
  const text = fs.readFileSync(p, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
    }
  }
}
dotenvLoad();

const DRY = process.argv.includes('--dry');
const MYSQL = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASS || '',
  database: process.env.MYSQL_DB || 'evoting',
};
const MONGO_URI = process.env.DB_URI || 'mongodb://127.0.0.1:27017/evoting';

const TABLES = [
  'users',
  'elections',
  'candidates',
  'votes',
  'accreditations',
  'email_verifications',
  'login_attempts',
  'ip_attempts',
  'password_resets',
  'remember_tokens',
  'activity_logs',
  'settings',
  'contacts',
];

async function main() {
  console.log('--- EVoting MySQL -> MongoDB migration ---');
  console.log(`Source : mysql://${MYSQL.host}:${MYSQL.port}/${MYSQL.database}`);
  console.log(`Target : ${MONGO_URI.replace(/\/\/[^@]*(@)/, '//***$1')}`);
  console.log(`Mode   : ${DRY ? 'DRY RUN (no writes)' : 'LIVE (replaces target collections)'}\n`);
  if (!process.env.DB_URI) {
    console.warn('WARNING: DB_URI not set in server/.env; defaulting to mongodb://127.0.0.1:27017/evoting.');
  }

  // --- Connect MySQL ---
  const cn = await mysql.createConnection(MYSQL);
  console.log('[mysql] connected. Reading source tables...');
  const schema = {};
  for (const table of TABLES) {
    try {
      const [rows] = await cn.query(`SELECT * FROM \`${table}\``);
      schema[table] = rows;
      console.log(`  ${table.padEnd(22)} ${rows.length} rows`);
    } catch {
      schema[table] = [];
      console.log(`  ${table.padEnd(22)} <not found, skipped>`);
    }
  }
  await cn.end();

  if (DRY) {
    console.log(
      '\n[dry] No changes written. Target collections: users, elections, candidates, votes, ' +
        'accreditations, emailverifications, loginattempts, passwordresets, refreshtokens, activitylogs, settings, contacts'
    );
    console.log('[dry] uploads/ would be copied into server/uploads.');
    return;
  }

  // --- Connect Mongo ---
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  console.log('\n[mongo] connected.');

  const TARGETS = ['contacts', 'users', 'elections', 'candidates', 'votes', 'accreditations', 'emailverifications', 'loginattempts', 'passwordresets', 'refreshtokens', 'activitylogs', 'settings'];
  for (const c of TARGETS) {
    try {
      await db.collection(c).drop();
      console.log(`[mongo] dropped ${c}`);
    } catch {
      /* may not exist */
    }
  }

  // --- id maps (mysql int id -> fresh ObjectId) ---
  // Store real ObjectId instances (NOT hex strings): mongoose `_id` and ref
  // fields are ObjectId-typed, and findById/populate rely on matching ObjectId.
  const newOid = () => new mongoose.Types.ObjectId();
  const makeMap = (rows, idCol) => {
    const m = new Map();
    rows.forEach((r) => m.set(Number(r[idCol]), newOid()));
    return m;
  };

  const userMap = makeMap(schema.users, 'user_id');
  const electionMap = makeMap(schema.elections, 'election_id');
  const candidateMap = makeMap(schema.candidates, 'candidate_id');

  const uid = (v) => (v == null || v === 0 || v === '' ? null : userMap.get(Number(v)) || null);
  const eid = (v) => (v == null || v === '' ? null : electionMap.get(Number(v)) || null);
  const cid = (v) => (v == null || v === '' ? null : candidateMap.get(Number(v)) || null);
  const dt = (v) => (v && !isNaN(new Date(v).getTime()) ? new Date(v) : null);

  const parseDescriptor = (text) => {
    if (!text) return undefined;
    try {
      const arr = JSON.parse(text);
      return Array.isArray(arr) && arr.length === 128 ? arr : undefined;
    } catch {
      return undefined;
    }
  };

  // --- Build documents ---
  const users = schema.users.map((r) => ({
    _id: userMap.get(Number(r.user_id)),
    username: String(r.username),
    password: String(r.password),
    email: String(r.email),
    full_name: r.full_name || '',
    matric_no: r.matric_no || null,
    is_admin: Boolean(Number(r.is_admin)),
    email_verified: Boolean(Number(r.email_verified)),
    has_voted: Boolean(Number(r.has_voted)),
    face_descriptor: parseDescriptor(r.face_descriptor),
    face_photo: r.face_photo || null,
    face_enrolled: Boolean(Number(r.face_enrolled)),
    face_verified: Boolean(Number(r.face_verified)),
    created_at: dt(r.created_at) || new Date(),
  }));

  const elections = schema.elections.map((r) => ({
    _id: electionMap.get(Number(r.election_id)),
    title: String(r.title),
    description: r.description || '',
    position: r.position || 'General Election',
    start_date: dt(r.start_date),
    end_date: dt(r.end_date),
    accreditation_start_date: dt(r.accreditation_start_date),
    accreditation_end_date: dt(r.accreditation_end_date),
    requires_accreditation: Boolean(Number(r.requires_accreditation)),
    created_at: dt(r.created_at) || new Date(),
  }));

  const candidates = schema.candidates.map((r) => ({
    _id: candidateMap.get(Number(r.candidate_id)),
    election: eid(r.election_id),
    position: String(r.position),
    name: String(r.name),
    bio: r.bio || '',
    photo: r.photo || null,
    created_at: dt(r.created_at) || new Date(),
  }));

  const votes = schema.votes.map((r) => ({
    user: uid(r.user_id),
    election: eid(r.election_id),
    candidate: cid(r.candidate_id),
    position_voted: String(r.position_voted),
    ip_address: r.ip_address || null,
    vote_time: dt(r.vote_time) || new Date(),
  }));

  const accreditations = schema.accreditations.map((r) => ({
    user: uid(r.user_id),
    election: eid(r.election_id),
    accredited_by: r.accredited_by != null ? uid(r.accredited_by) : null,
    accredited_at: dt(r.accredited_at) || new Date(),
  }));

  const emailverifications = schema.email_verifications.map((r) => ({
    user: uid(r.user_id),
    verification_code: String(r.verification_code),
    expires_at: dt(r.expires_at),
    verified: Boolean(Number(r.verified)),
    created_at: dt(r.created_at) || new Date(),
  }));

  const loginAttemptMap = new Map();
  schema.login_attempts.forEach((r) => {
    loginAttemptMap.set(
      `username:${String(r.username || '')
        .toLowerCase()
        .trim()}`,
      {
        key: `username:${String(r.username || '')
          .toLowerCase()
          .trim()}`,
        attempts: Number(r.attempts || 0),
        last_attempt: dt(r.last_attempt) || new Date(),
      }
    );
  });
  schema.ip_attempts.forEach((r) => {
    loginAttemptMap.set(`ip:${String(r.ip_address)}`, { key: `ip:${String(r.ip_address)}`, attempts: Number(r.attempts || 0), last_attempt: dt(r.last_attempt) || new Date() });
  });

  const passwordresets = schema.password_resets.map((r) => ({
    user: uid(r.user_id),
    token: String(r.token),
    expires_at: dt(r.expires_at),
    created_at: dt(r.created_at) || new Date(),
  }));

  const refreshtokens = schema.remember_tokens.map((r) => ({
    user: uid(r.user_id),
    token: String(r.token),
    expires_at: dt(r.expires_at),
    created_at: dt(r.created_at) || new Date(),
  }));

  const activitylogs = schema.activity_logs.map((r) => ({
    user: r.user_id != null ? uid(r.user_id) : null,
    username: r.username || null,
    action: String(r.action || ''),
    description: r.description || '',
    entity_type: r.entity_type || null,
    entity_id: r.entity_id != null ? String(r.entity_id) : null,
    ip_address: r.ip_address || null,
    user_agent: r.user_agent || null,
    created_at: dt(r.created_at) || new Date(),
  }));

  const settings = schema.settings.map((r) => ({
    setting_key: String(r.setting_key),
    setting_value: String(r.setting_value ?? ''),
    setting_type: r.setting_type || 'string',
    category: r.category || 'general',
    description: r.description || '',
    updated_at: dt(r.updated_at) || new Date(),
  }));

  const contacts = schema.contacts.map((r) => ({
    name: r.name || '',
    email: r.email || '',
    subject: r.subject || '',
    message: r.message || '',
    is_read: Boolean(Number(r.is_read)),
    ip_address: r.ip_address || null,
    created_at: dt(r.created_at) || new Date(),
  }));

  // --- Write ---
  const insert = async (name, docs) => {
    if (!docs.length) {
      console.log(`[mongo] ${name.padEnd(20)} 0 (no rows)`);
      return;
    }
    try {
      await db.collection(name).insertMany(docs);
      console.log(`[mongo] ${name.padEnd(20)} ${docs.length}`);
    } catch (err) {
      console.error(`[mongo] ${name} FAILED:`, err.message);
    }
  };

  await insert('users', users);
  await insert('elections', elections);
  await insert('candidates', candidates);
  await insert('votes', votes);
  await insert('accreditations', accreditations);
  await insert('emailverifications', emailverifications);
  await insert('loginattempts', [...loginAttemptMap.values()]);
  await insert('passwordresets', passwordresets);
  await insert('refreshtokens', refreshtokens);
  await insert('activitylogs', activitylogs);
  await insert('settings', settings);
  await insert('contacts', contacts);

  // --- Unique indexes (mirror the MySQL constraints) ---
  const cVotes = db.collection('votes');
  await cVotes.createIndex({ user: 1, election: 1, position_voted: 1 }, { unique: true });
  const cUsers = db.collection('users');
  await cUsers.createIndex({ username: 1 }, { unique: true });
  await cUsers.createIndex({ email: 1 }, { unique: true });
  await cUsers.createIndex({ matric_no: 1 }, { unique: true, sparse: true });
  const cLogin = db.collection('loginattempts');
  await cLogin.createIndex({ key: 1 }, { unique: true });
  await db.collection('passwordresets').createIndex({ token: 1 }, { unique: true });
  await db.collection('refreshtokens').createIndex({ token: 1 }, { unique: true });
  console.log('\n[mongo] unique indexes created.');

  // --- Copy uploads ---
  const srcUploads = process.env.SRC_UPLOADS || path.resolve(__dirname, '../../../../evoting/uploads');
  const dstUploads = path.resolve(__dirname, '../uploads');
  console.log(`\n[uploads] source: ${srcUploads}`);
  if (!fs.existsSync(srcUploads)) {
    console.warn('[uploads] source not found; skipping file copy.');
  } else {
    fs.mkdirSync(dstUploads, { recursive: true });
    fs.mkdirSync(path.join(dstUploads, 'faces'), { recursive: true });
    let n = 0;
    const walk = (dir, dest) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const s = path.join(dir, entry.name);
        const d = path.join(dest, entry.name);
        if (entry.isDirectory()) {
          fs.mkdirSync(d, { recursive: true });
          walk(s, d);
        } else {
          fs.copyFileSync(s, d);
          n++;
        }
      }
    };
    walk(srcUploads, dstUploads);
    console.log(`[uploads] copied ${n} file(s).`);
  }

  console.log('\nMigration complete. Verify counts above.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('\nMigration failed:', err);
  process.exit(1);
});
