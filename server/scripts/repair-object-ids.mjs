/**
 * One-time data repair: the MySQL -> MongoDB migration stored ObjectId hex
 * strings as _id / reference fields, which breaks every mongoose ObjectId
 * lookup (findById, populate) and therefore all authenticated sessions.
 *
 *   - Converts _id in users, elections, candidates from string -> ObjectId.
 *   - Converts refs in votes, accreditations, activitylogs to ObjectId.
 *   - Optionally disables reCAPTCHA (default) so local/dev logins are unblocked.
 *
 * Idempotent: fields already stored as ObjectId (or null) are left untouched.
 * Usage (from server/):
 *   npm run repair:ids                 # repair ids + disable recaptcha
 *   npm run repair:ids -- --keep-captcha   # repair ids, leave recaptcha as-is
 *   npm run repair:ids -- --dry   # report only, don't write
 */
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// load .env
try {
  const text = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
  }
} catch {
  /* .env missing */
}

const DRY = process.argv.includes('--dry');
const KEEP_CAPTCHA = process.argv.includes('--keep-captcha');

const ObjectId = mongoose.Types.ObjectId;

function oid(v) {
  if (v == null) return null;
  if (typeof v !== 'string') return v; // already ObjectId or other type
  return ObjectId.isValid(v) ? new ObjectId(v) : v;
}

function countFieldTypes(col, field) {
  return col
    .aggregate([
      {
        $group: {
          _id: { $type: `$${field}` },
          n: { $sum: 1 },
        },
      },
    ])
    .toArray();
}

async function main() {
  const uri = process.env.DB_URI || 'mongodb://127.0.0.1:27017/evoting';
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  console.log(`Connected: ${db.databaseName} (mode: ${DRY ? 'DRY RUN' : 'LIVE'})`);

  const collections = ['users', 'elections', 'candidates', 'votes', 'accreditations', 'activitylogs'];

  // --- Report current types first ---
  console.log('\n--- Before ---');
  for (const name of collections) {
    const col = db.collection(name);
    const ids = await col.aggregate([{ $group: { _id: { $type: '$_id' }, n: { $sum: 1 } } }]).toArray();
    const types = ids.map((x) => `${x._id}:${x.n}`).join(', ');
    console.log(`${name.padEnd(16)} _id: ${types}`);
  }

  // --- Convert _id fields on the "entity" collections ---
  // MongoDB treats _id as immutable, so rewrite each document with the same
  // hex value as a real ObjectId: insert a corrected copy, then delete the old.
  const convertEntityIds = async (name) => {
    const col = db.collection(name);
    const docs = await col.find({ _id: { $type: 'string' } }).toArray();
    if (!docs.length) return 0;
    for (const d of docs) {
      const corrected = { ...d, _id: oid(d._id) };
      if (DRY) continue;
      // Remove the string-_id doc first (unique indexes on other fields would
      // otherwise reject the corrected copy), then insert the ObjectId copy.
      await col.deleteOne({ _id: d._id });
      await col.insertOne(corrected);
    }
    return docs.length;
  };

  // --- Convert reference fields ---
  const convertRefs = async (name, fields) => {
    const col = db.collection(name);
    for (const field of fields) {
      const docs = await col.find({ [field]: { $type: 'string' } }).toArray();
      if (!docs.length) continue;
      const ops = docs.map((d) => ({
        updateOne: { filter: { _id: d._id }, update: { $set: { [field]: oid(d[field]) } } },
      }));
      if (!DRY) {
        await col.bulkWrite(ops);
      }
    }
  };

  const affected = {
    users: 0,
    elections: 0,
    candidates: 0,
    votes: 0,
    accreditations: 0,
    activitylogs: 0,
  };

  affected.users = await convertEntityIds('users');
  affected.elections = await convertEntityIds('elections');
  affected.candidates = await convertEntityIds('candidates');

  const votesBefore = await countFieldTypes(db.collection('votes'), 'user');
  await convertRefs('votes', ['user', 'election', 'candidate']);
  const votesAfter = await countFieldTypes(db.collection('votes'), 'user');
  affected.votes = votesAfter.reduce((s, x) => s + x.n, 0);

  const accBefore = await countFieldTypes(db.collection('accreditations'), 'user');
  await convertRefs('accreditations', ['user', 'election', 'accredited_by']);
  const accAfter = await countFieldTypes(db.collection('accreditations'), 'user');
  affected.accreditations = accAfter.reduce((s, x) => s + x.n, 0);

  const logBefore = await countFieldTypes(db.collection('activitylogs'), 'user');
  await convertRefs('activitylogs', ['user']);
  const logAfter = await countFieldTypes(db.collection('activitylogs'), 'user');
  affected.activitylogs = logAfter.reduce((s, x) => s + x.n, 0);

  console.log('\n--- Converted ---');
  for (const [name, n] of Object.entries(affected)) {
    console.log(`${name.padEnd(16)} ${n} document(s) updated`);
  }
  if (votesBefore.length) console.log('votes.user types before:', votesBefore.map((x) => `${x._id}:${x.n}`).join(', '));
  if (accBefore.length) console.log('accreditations.user types before:', accBefore.map((x) => `${x._id}:${x.n}`).join(', '));
  if (logBefore.length) console.log('activitylogs.user types before:', logBefore.map((x) => `${x._id}:${x.n}`).join(', '));

  // --- Optionally disable reCAPTCHA ---
  if (!KEEP_CAPTCHA) {
    const settings = db.collection('settings');
    const recaptcha = await settings.findOne({ setting_key: 'recaptcha_enabled' });
    const current = recaptcha ? String(recaptcha.setting_value) : '1';
    if (!DRY) {
      await settings.updateOne(
        { setting_key: 'recaptcha_enabled' },
        {
          $set: { setting_value: '0', setting_type: 'boolean', category: 'security', updated_at: new Date() },
          $setOnInsert: {
            description: 'Require Google reCAPTCHA on sensitive forms',
            _id: new ObjectId(),
          },
        },
        { upsert: true }
      );
    }
    console.log(`\nrecaptcha_enabled: ${current} -> ${DRY ? '0 (dry)' : '0'}`);
  } else {
    console.log('\nrecaptcha_enabled: left unchanged (--keep-captcha)');
  }

  console.log('\n--- After ---');
  for (const name of collections) {
    const col = db.collection(name);
    const ids = await col.aggregate([{ $group: { _id: { $type: '$_id' }, n: { $sum: 1 } } }]).toArray();
    const types = ids.map((x) => `${x._id}:${x.n}`).join(', ');
    console.log(`${name.padEnd(16)} _id: ${types}`);
  }

  console.log(DRY ? '\nDRY RUN - nothing written.' : '\nDone.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('\nRepair failed:', err.message);
  process.exit(1);
});
