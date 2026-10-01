/**
 * Clear every enrolled face so each voter re-enrols under the current rules.
 * Usage: npm run reset:faces -- --yes
 *
 * Why this is needed rather than optional: descriptors enrolled before the
 * capture gates were tightened may have come from frames the camera should never
 * have accepted - too small, too dark, or the wrong person in a two-person shot.
 * On this deployment the match distance between three different voters measured
 * 0.45-0.51 against a 0.6 ceiling, so those templates cannot be trusted to be
 * separable. There is no way to repair them after the fact; the only sound
 * options are re-enrolment or deletion, and deletion is what this does.
 *
 * Runs as a dry run unless --yes is passed, so it cannot be triggered by a stray
 * npm invocation.
 */
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { deleteUploadedFile } from '../src/middleware/upload.js';

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

function has(name) {
  return process.argv.includes(`--${name}`);
}

const FIELDS = {
  face_descriptor: undefined,
  face_photo: null,
  face_enrolled: false,
  face_verified: false,
  face_fail_count: 0,
  face_locked_until: null,
};

async function main() {
  const uri = process.env.DB_URI || 'mongodb://127.0.0.1:27017/evoting';
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  const User = (await import('../src/models/User.js')).default;

  const enrolled = await User.find({ $or: [{ face_enrolled: true }, { face_photo: { $ne: null } }] })
    .select('username face_photo face_verified')
    .lean();

  if (!enrolled.length) {
    console.log('No enrolled faces found. Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ${enrolled.length} account(s) with face data:\n`);
  for (const u of enrolled) {
    const photo = u.face_photo ? `  photo=${u.face_photo}` : '  photo=(missing on disk)';
    console.log(`  ${u.username.padEnd(20)} verified=${Boolean(u.face_verified)}${photo}`);
  }

  if (!has('yes')) {
    console.log('\nDry run. Re-run with --yes to clear the above and delete their face photos.');
    await mongoose.disconnect();
    return;
  }

  const ids = enrolled.map((u) => u._id);
  const { deletedCount } = await User.updateMany({ _id: { $in: ids } }, { $set: FIELDS });
  console.log(`\nCleared face data on ${deletedCount} account(s).`);

  // Only files the database still pointed at are removed, so a run cannot take
  // out an unrelated upload that happens to sit in the same directory.
  let removed = 0;
  for (const u of enrolled) {
    if (!u.face_photo) continue;
    deleteUploadedFile(u.face_photo);
    removed++;
  }
  console.log(`Removed ${removed} stored face photo(s) from ${path.resolve(__dirname, '../uploads')}.`);
  console.log('Every affected voter now has to enrol again from the face enrollment page.');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
