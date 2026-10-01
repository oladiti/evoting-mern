/**
 * Copy the active database to a new name on the same cluster, then hand you the
 * one-line .env change to switch the app over.
 *
 * Why this exists: the app was pointed at an Atlas database named `test`. That is
 * not a style complaint - src/config/db.js warns at boot that a pathless
 * mongodb+srv:// URI silently resolves to `test` instead of anything the
 * appName suggests, and that this has already caused a wrong-database connection
 * once. This database holds real voter records, so a name that reads like scratch
 * space is a standing invitation to reset or drop it.
 *
 * This is a COPY, never a move. The source is left untouched so it stays available
 * as a rollback, which is the only reason this is safe to run against live data.
 * Nothing in src/ is modified: the switch is a single env var, and this script
 * does not make it for you.
 *
 * Guardrails, in the order they matter:
 *
 *   1. Refuses to run when the target already holds documents. Merging a fresh
 *      copy into a populated database would silently produce two records for one
 *      voter, and the unique indexes would abort only on the duplicate it happened
 *      to reach first.
 *   2. Refuses when source and target are the same name, so a re-run cannot copy a
 *      database onto itself.
 *   3. Validates the target name as a Mongo identifier, because the name is
 *      interpolated into a connection URI.
 *   4. Copies indexes explicitly. insertMany does not carry them across, and
 *      dropping them would lose the unique constraints that protect voter
 *      identity - User.js declares a unique partial index on matric_no for
 *      exactly that reason.
 *
 * Sessions are carried over, so nobody is logged out by the switch. Be aware of
 * the flip side: the refresh tokens in the source remain valid until the source
 * is dropped, so retire `test` promptly once the new database is verified.
 *
 * Usage (from server/):
 *   npm run rename:database -- --to=evoting           # dry run, writes nothing
 *   npm run rename:database -- --to=evoting -- --yes  # perform the copy
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

const APPLY = process.argv.includes('--yes');

// A database name lands in a URI path segment and in db.collection() calls, so
// keep it to what Mongo actually allows rather than trusting the flag.
const NAME_RE = /^[A-Za-z0-9_-]{1,63}$/;

function targetName() {
  const arg = process.argv.find((a) => a.startsWith('--to='));
  const name = arg ? arg.slice('--to='.length).trim() : '';
  if (!name) {
    throw new Error('Missing --to=<name>. Example: --to=evoting');
  }
  if (!NAME_RE.test(name)) {
    throw new Error(`"${name}" is not a valid database name. Use letters, digits, underscore or dash (max 63).`);
  }
  return name;
}

// Rewrites only the database path segment, leaving scheme, credentials, host and
// query options untouched. A DB_URI that already ends in the target name is a
// no-op rather than an error, so the script is safe to run twice.
function withDatabase(uri, name) {
  const m = String(uri).match(/^(mongodb(?:\+srv)?:\/\/[^/?]+)(?:\/[^?]*)?(\?.*)?$/i);
  if (!m) throw new Error('Could not parse DB_URI. Expected mongodb:// or mongodb+srv://.');
  return `${m[1]}/${name}${m[2] || ''}`;
}

// Rebuilds the arguments for createIndex from what indexes() reported.
//
// `key` is already the key-pattern object ({ user: 1 }), so it is passed through
// as-is. An earlier version wrapped it a second time as { key: { key: ... } },
// which Mongo rejects with "Values in v:2 index key pattern cannot be of type
// object" - so the shape matters and is asserted below rather than assumed.
function indexSpec(i) {
  const { name, key, unique, sparse, expireAfterSeconds, partialFilterExpression, collation, weights, ...rest } = i;

  if (!key || typeof key !== 'object' || Array.isArray(key)) {
    throw new Error(`Index "${name}" has an unexpected key pattern: ${JSON.stringify(key)}`);
  }
  for (const [field, direction] of Object.entries(key)) {
    if (typeof direction !== 'number') {
      throw new Error(`Index "${name}" has a non-scalar key for field "${field}" (${typeof direction}). Cannot copy it faithfully.`);
    }
  }

  // createIndex(spec, options) - key pattern first, options separately. Passing
  // { key: ... } as the pattern is the bug this guards against.
  const spec = { ...key };
  const options = { name };
  if (unique) options.unique = true;
  if (sparse) options.sparse = true;
  if (expireAfterSeconds !== undefined) options.expireAfterSeconds = expireAfterSeconds;
  if (partialFilterExpression) options.partialFilterExpression = partialFilterExpression;
  if (collation) options.collation = collation;
  if (weights) options.weights = weights;

  return { name, spec, options, rest };
}

async function main() {
  const to = targetName();
  const sourceUri = process.env.DB_URI || 'mongodb://127.0.0.1:27017/test';
  // The copy runs over a single connection, switching databases with client.db(),
  // so this only validates that DB_URI is a shape we can derive a sibling name
  // from. Throwing here beats failing later on an unparseable URI.
  withDatabase(sourceUri, to);

  await mongoose.connect(sourceUri, { serverSelectionTimeoutMS: 15000 });
  const source = mongoose.connection.getClient();

  const from = mongoose.connection.name;
  if (from === to) {
    console.log(`DB_URI already points at "${to}". Nothing to do.`);
    await mongoose.disconnect();
    return;
  }

  console.log(`source : ${from}`);
  console.log(`target : ${to}`);
  console.log(`mode   : ${APPLY ? 'LIVE' : 'DRY RUN'}`);

  const srcDb = source.db(from);
  const collections = (await srcDb.listCollections({}, { nameOnly: true }).toArray()).sort((a, b) => a.name.localeCompare(b.name));
  if (!collections.length) {
    console.log(`\nSource database "${from}" has no collections. Nothing to copy.`);
    await mongoose.disconnect();
    return;
  }

  // Guardrail 1, checked before any write. Existence alone is not the problem -
  // an empty collection is harmless - but a populated one means this is a merge
  // and a merge is never what was intended.
  const targetDb = source.db(to);
  const existing = await targetDb.listCollections({}, { nameOnly: true }).toArray();
  const populated = [];
  for (const c of existing) {
    const n = await targetDb.collection(c.name).countDocuments();
    if (n > 0) populated.push(`${c.name} (${n} docs)`);
  }
  if (populated.length) {
    console.error(`\nABORT: target database "${to}" is not empty:`);
    for (const p of populated) console.error(`  ${p}`);
    console.error('\nCopying into it would merge two datasets and risk duplicate voter records.');
    console.error(`Drop or rename "${to}" first, or choose a different --to name.`);
    console.error('\nIf this is a half-finished copy from an interrupted earlier run, it is safe to drop:');
    console.error('every document it holds was read from the source, and the source is untouched.');
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`\ncopying ${collections.length} collection(s):`);
  let copiedDocs = 0;
  let copiedIndexes = 0;

  for (const c of collections) {
    const name = c.name;
    const fromCol = srcDb.collection(name);
    const toCol = targetDb.collection(name);

    const count = await fromCol.countDocuments();
    const sourceIndexes = (await fromCol.indexes()).map(indexSpec);
    // The _id index is recreated by the first insert, and createIndexes rejects
    // an attempt to redefine it.
    const custom = sourceIndexes.filter((i) => i.name !== '_id_');

    if (!APPLY) {
      const note = count === 0 ? '(empty - indexes only)' : `${custom.length} index(es)`;
      console.log(`  ${name.padEnd(20)} ${String(count).padStart(6)} docs   ${note}  (dry run)`);
      continue;
    }

    // Empty collections still get their indexes, because a unique index on a
    // collection that has no documents yet is exactly the state a fresh
    // database should be in.
    let written = 0;
    if (count > 0) {
      // Batched so a larger collection does not build one unbounded document
      // array in memory. ordered:false would let a bad document skip ahead, so
      // a failure here must stop the run rather than half-copy a collection.
      const cursor = fromCol.find({});
      let batch = [];
      for await (const doc of cursor) {
        batch.push(doc);
        if (batch.length >= 200) {
          await toCol.insertMany(batch, { ordered: true });
          written += batch.length;
          batch = [];
        }
      }
      if (batch.length) {
        await toCol.insertMany(batch, { ordered: true });
        written += batch.length;
      }
    }

    for (const i of custom) {
      // i.options carries unique/sparse/expireAfterSeconds/etc. Passing only
      // { name } here would create the index with the right name and key but
      // silently drop the unique constraint - losing the duplicate-voter
      // protection the source database relies on.
      await toCol.createIndex(i.spec, i.options);
      copiedIndexes += 1;
    }
    copiedDocs += written;
    console.log(`  ${name.padEnd(20)} ${String(written).padStart(6)} docs   ${custom.length} index(es) created`);
  }

  if (!APPLY) {
    // A dry run has not written anything, so comparing target counts against
    // source here would report every collection as a mismatch and read like a
    // failure. Restate the plan instead: what would be copied, and what the
    // target holds right now.
    console.log(`\nDRY RUN - nothing written. Would copy:`);
    let total = 0;
    for (const c of collections) {
      const a = await srcDb.collection(c.name).countDocuments();
      total += a;
      const b = await targetDb.collection(c.name).countDocuments();
      console.log(`  ${c.name.padEnd(20)} ${String(a).padStart(6)} docs into ${to}  (target currently has ${b})`);
    }
    console.log(`\n${total} document(s) in total. Re-run with --yes to copy.`);
    await mongoose.disconnect();
    return;
  }

  // Verification. Counts are compared per collection rather than in aggregate,
  // because a total that happens to match while one collection is short is
  // exactly the silent failure worth catching.
  // Counts alone are not a sufficient check. A copy can match every document
  // count and still have lost the unique constraints, sparse flags or TTL
  // settings - which on this schema is the difference between "one vote per
  // user per position" and "however many rows arrive". Compare the definitions.
  const indexSignature = async (db, name) => {
    const list = (await db.collection(name).indexes())
      .filter((i) => i.name !== '_id_')
      .map((i) => ({
        name: i.name,
        key: i.key,
        unique: !!i.unique,
        sparse: !!i.sparse,
        expireAfterSeconds: i.expireAfterSeconds ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return JSON.stringify(list);
  };

  console.log('\nverifying:');
  let mismatches = 0;
  for (const c of collections) {
    const a = await srcDb.collection(c.name).countDocuments();
    const b = await targetDb.collection(c.name).countDocuments();
    const srcIdx = await indexSignature(srcDb, c.name);
    const dstIdx = await indexSignature(targetDb, c.name);
    const countsOk = a === b;
    const idxOk = srcIdx === dstIdx;
    if (!countsOk || !idxOk) mismatches += 1;

    const detail = [];
    if (!countsOk) detail.push(`count source=${a} target=${b}`);
    if (!idxOk) detail.push('index definitions differ');
    console.log(`  ${countsOk && idxOk ? 'ok      ' : 'MISMATCH'} ${c.name.padEnd(20)} docs=${String(a).padStart(5)}${detail.length ? '  <- ' + detail.join('; ') : ''}`);

    if (!idxOk) {
      const expected = JSON.parse(srcIdx);
      const actual = JSON.parse(dstIdx);
      for (const e of expected) {
        const found = actual.find((x) => x.name === e.name);
        if (!found) {
          console.error(`    missing index "${e.name}" on ${c.name}`);
        } else {
          const lost = Object.keys(e).filter((k) => JSON.stringify(found[k]) !== JSON.stringify(e[k]));
          if (lost.length) console.error(`    index "${e.name}" on ${c.name} lost: ${lost.map((k) => `${k} (expected ${JSON.stringify(e[k])}, got ${JSON.stringify(found[k])})`).join(', ')}`);
        }
      }
      for (const a2 of actual) {
        if (!expected.find((x) => x.name === a2.name)) console.error(`    unexpected index "${a2.name}" on ${c.name}`);
      }
    }
  }

  if (mismatches) {
    console.error(`\nFAILED: ${mismatches} collection(s) did not match. Treat "${to}" as untrusted until re-run.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`\ncopied ${copiedDocs} document(s) and ${copiedIndexes} index(es) into "${to}".`);
  console.log(`\nNext steps:`);
  console.log(`  1. Update DB_URI in server/.env to end in /${to}`);
  console.log(`  2. Restart the app and confirm the boot log names "${to}"`);
  console.log(`  3. Check that users, votes and settings are all present`);
  console.log(`  4. Keep "${from}" until you are satisfied, then drop it`);
  console.log(`\nThis script did not change DB_URI - that edit is yours to make.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('\nRename failed:', err.message);
  process.exit(1);
});
