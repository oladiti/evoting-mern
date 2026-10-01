/**
 * One-time data repair: elections created before slugs existed have no slug, so
 * they are unreachable by their public URL (/results/<slug>). This derives one
 * from each title.
 *
 *   - Sets slug for every election missing one, from its title.
 *   - Appends -2, -3, ... when two titles slugify identically.
 *   - Ensures the unique+sparse index on slug exists.
 *
 * Idempotent: elections that already have a slug are left untouched, so re-running
 * never renumbers an election whose URL has already been shared. Elections are
 * processed in ascending _id order so the numbering is stable across runs.
 *
 * Safe to run before or after the app is updated: the app resolves an id-or-slug,
 * so old ObjectId links keep working either way.
 *
 * Usage (from server/):
 *   npm run slugs:backfill            # backfill missing slugs + build the index
 *   npm run slugs:backfill -- --dry   # report only, don't write
 *   npm run slugs:backfill -- --index # only ensure the index, skip backfill
 */
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { slugify } from '../src/utils/index.js';

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
const INDEX_ONLY = process.argv.includes('--index');

async function main() {
  const uri = process.env.DB_URI || 'mongodb://127.0.0.1:27017/evoting';
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  console.log(`Connected: ${db.databaseName} (mode: ${DRY ? 'DRY RUN' : 'LIVE'})`);

  const elections = db.collection('elections');
  const total = await elections.countDocuments();
  console.log(`Elections: ${total}`);

  if (!INDEX_ONLY) {
    // Ascending _id so the -2/-3 numbering a given title receives is repeatable.
    const missing = await elections
      .find({ $or: [{ slug: { $exists: false } }, { slug: null }, { slug: '' }] })
      .sort({ _id: 1 })
      .toArray();

    if (!missing.length) {
      console.log('\nEvery election already has a slug — nothing to backfill.');
    } else {
      console.log(`\nBackfilling ${missing.length} election(s)...`);
      const taken = new Set((await elections.find({ slug: { $exists: true, $ne: null } }, { projection: { slug: 1 } }).toArray()).map((d) => d.slug));

      for (const doc of missing) {
        const base = slugify(doc.title);
        let candidate = base;
        let n = 2;
        while (taken.has(candidate)) {
          candidate = `${base}-${n}`;
          n += 1;
        }
        taken.add(candidate);
        if (!DRY) await elections.updateOne({ _id: doc._id }, { $set: { slug: candidate } });
        console.log(`  ${String(doc._id)}  ${JSON.stringify(doc.title)} -> ${candidate}`);
      }
    }
  }

  // The app-level check in services/elections.js is the real uniqueness guard;
  // this index is the backstop. mongoose autoIndex is often disabled in
  // production, so build it explicitly rather than assume it happened at boot.
  console.log('\n--- Index ---');
  const existing = await elections.indexes();
  if (existing.some((i) => i.key && i.key.slug === 1 && i.unique)) {
    console.log('unique index on slug already present.');
  } else if (DRY) {
    console.log('unique index on slug MISSING (would be created on a live run).');
  } else {
    // Duplicates would abort the build, so report them rather than failing opaquely.
    const dupes = await elections.aggregate([{ $match: { slug: { $exists: true, $ne: null } } }, { $group: { _id: '$slug', n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }]).toArray();
    if (dupes.length) {
      console.error('Duplicate slugs present, cannot build the unique index:');
      for (const d of dupes) console.error(`  ${d._id} x${d.n}`);
      throw new Error('Resolve duplicate slugs, then re-run.');
    }
    await elections.createIndex({ slug: 1 }, { unique: true, sparse: true });
    console.log('created unique+sparse index on slug.');
  }

  console.log(DRY ? '\nDRY RUN - nothing written.' : '\nDone.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('\nBackfill failed:', err.message);
  process.exit(1);
});
