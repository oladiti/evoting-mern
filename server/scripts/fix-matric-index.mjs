/**
 * One-time index repair: replace the `matric_no_1` unique+sparse index on `users`
 * with a unique *partial* index that only covers real matric numbers.
 *
 * The old definition could not express "any number of voters may leave this blank".
 * `sparse` skips documents that omit the field, but not documents that store null,
 * and the register path writes `matric_no: matric_no || null`. Every voter who left
 * the matric box empty was therefore indexed under null, the unique index accepted
 * exactly one of them, and every subsequent blank-matric registration failed with a
 * bare E11000 that reached the user as "A record with that value already exists".
 *
 * The partial filter `{ matric_no: { $type: 'string' } }` excludes null and missing
 * values from the index while still rejecting two voters who claim the same number.
 *
 * Only `matric_no_1` is touched. Model.syncIndexes() is deliberately avoided: it
 * drops every index the schema does not declare, and the database is the last place
 * to lose an index that some other deployment still relies on.
 *
 * Idempotent: re-running detects the partial index and exits without writing.
 * Usage (from server/):
 *   npm run fix:matric-index            # apply
 *   npm run fix:matric-index -- --dry   # report only, don't write
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
const INDEX = 'matric_no_1';
const EXPECTED = { $type: 'string' };

const User = (await import('../src/models/User.js')).default;
const { env } = await import('../src/config/env.js');

const describe = (i) => ({
  name: i.name,
  key: i.key,
  unique: !!i.unique,
  sparse: !!i.sparse,
  partialFilterExpression: i.partialFilterExpression,
});

const isCurrent = (i) => !!i && !!i.unique && JSON.stringify(i.partialFilterExpression) === JSON.stringify({ matric_no: EXPECTED });

try {
  await mongoose.connect(env.DB_URI);
  const col = mongoose.connection.collection('users');

  const before = (await col.indexes()).find((i) => i.name === INDEX);
  console.log('current index:', before ? JSON.stringify(describe(before)) : '(absent)');

  if (isCurrent(before)) {
    console.log('\nalready a unique partial index over string matric numbers - nothing to do.');
    process.exit(0);
  }

  const total = await col.countDocuments({});
  const nulls = await col.countDocuments({ matric_no: null });
  const missing = await col.countDocuments({ matric_no: { $exists: false } });
  const strings = await col.countDocuments({ matric_no: { $type: 'string' } });
  console.log(`documents: total=${total} matric_string=${strings} matric_null=${nulls} matric_absent=${missing}`);

  // A unique index cannot be built over duplicate keys. The old index was also
  // unique, so every string was already covered and duplicates are impossible -
  // but this reports rather than assumes, because a hand-edited or partially
  // applied database is exactly the case where the create would fail obscurely.
  const dupes = await col
    .aggregate([{ $match: { matric_no: { $type: 'string' } } }, { $group: { _id: '$matric_no', n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }, { $project: { _id: 1, n: 1 } }])
    .toArray();

  if (dupes.length) {
    console.error(`\nABORT: ${dupes.length} matric number(s) are shared by more than one voter:`);
    for (const d of dupes) console.error(`  ${d._id} (${d.n} voters)`);
    console.error('Resolve these before running, or the unique index cannot be created.');
    process.exit(1);
  }
  console.log('duplicate string matric numbers: none');

  if (DRY) {
    console.log('\n--dry: would drop the old index and build the unique partial index. No changes written.');
    process.exit(0);
  }

  if (before) {
    await col.dropIndex(INDEX);
    console.log(`dropped old index ${INDEX}`);
  }

  await User.createIndexes();
  const after = (await col.indexes()).find((i) => i.name === INDEX);
  console.log('new index:', JSON.stringify(describe(after)));

  if (!isCurrent(after)) {
    console.error('\nFAILED: the rebuilt index does not match the expected definition.');
    process.exit(1);
  }
  console.log('\ndone. Blank matric numbers can now be reused by any number of voters.');
  process.exit(0);
} catch (err) {
  console.error('failed:', err.message);
  process.exit(1);
} finally {
  await mongoose.disconnect().catch(() => {});
}
