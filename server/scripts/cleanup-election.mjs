/**
 * One-time data cleanup for an election whose candidates are out of sync with
 * its votes and elections collection:
 *   - Removes votes that do not reference a candidate in the election's
 *     current candidate set (kept via `Candidate.find({ election })`).
 *   - Removes stale candidate documents whose `election` reference is stored
 *     as a hex string (migration artifact) instead of an ObjectId, so they are
 *     invisible to every mongoose ObjectId lookup.
 *
 * The election document, its current candidates, and its accreditations are
 * left untouched. Deleting votes also resets `has_voted` for those voters
 * (the flag is derived from the votes collection).
 *
 * Idempotent and safe to re-run. Usage (from server/):
 *   node scripts/cleanup-election.mjs --election 6ab1b181c23cbec59591ec5a --dry
 *   node scripts/cleanup-election.mjs --election 6ab1b181c23cbec59591ec5a
 */
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

try {
  const text = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
  }
} catch {
  /* .env missing */
}

function argValue(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const DRY = process.argv.includes('--dry');
const electionId = argValue('election');
if (!electionId || !mongoose.Types.ObjectId.isValid(electionId)) {
  console.error('Usage: node scripts/cleanup-election.mjs --election <ObjectId> [--dry]');
  process.exit(1);
}

async function main() {
  const uri = process.env.DB_URI || 'mongodb://127.0.0.1:27017/evoting';
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  const electionOid = new mongoose.Types.ObjectId(electionId);
  console.log(`Connected: ${db.databaseName} (mode: ${DRY ? 'DRY RUN' : 'LIVE'})`);
  console.log(`Election : ${electionId}`);

  // --- Current, app-visible candidate set (ObjectId refs) ---
  const currentCandidates = await db.collection('candidates').find({ election: electionOid }).toArray();
  const currentIds = currentCandidates.map((c) => c._id);
  console.log(`\nCurrent candidates (keep): ${currentCandidates.length}${currentCandidates.length ? ' — ' + currentCandidates.map((c) => `${c.name} (${c.position})`).join(', ') : ''}`);

  // --- Stale candidates: election ref stored as a string ---
  const staleCandidates = await db.collection('candidates').find({ election: electionId }).toArray();
  console.log(`Stale candidates (delete): ${staleCandidates.length}`);
  if (staleCandidates.length) console.log('  ' + staleCandidates.map((c) => `${c.name} (${c.position})`).join('\n  '));

  // --- Votes referencing a candidate outside the current set ---
  const currentIdList = currentIds.map((id) => id);
  const orphanVotes = await db
    .collection('votes')
    .find({
      election: electionOid,
      candidate: { $nin: currentIdList },
    })
    .toArray();
  const validVotes = await db.collection('votes').countDocuments({ election: electionOid, candidate: { $in: currentIdList } });
  console.log(`\nVotes referencing stale candidates (delete): ${orphanVotes.length}`);
  console.log(`Votes referencing current candidates (keep)   : ${validVotes}`);

  // Sanity: a stale candidate must not actually be part of the visible set
  const overlap = staleCandidates.filter((c) => currentIds.some((id) => String(id) === String(c._id)));
  if (overlap.length) {
    console.error(`\nABORT: ${overlap.length} candidate(s) are both "current" and "stale" — refusing to run.`);
    await mongoose.disconnect();
    process.exit(1);
  }
  if (!currentIds.length && orphanVotes.length) {
    console.warn('\nWARN: election has votes but no current candidates — votes will be removed, nothing to keep.');
  }

  console.log(`\nAccreditations for election (kept): ${await db.collection('accreditations').countDocuments({ election: electionOid })}`);

  if (DRY) {
    console.log('\nDRY RUN - nothing written. Re-run without --dry to apply.');
    await mongoose.disconnect();
    return;
  }

  let deletedVotes = 0;
  let deletedCandidates = 0;
  if (orphanVotes.length) {
    const res = await db.collection('votes').deleteMany({ _id: { $in: orphanVotes.map((v) => v._id) } });
    deletedVotes = res.deletedCount;
  }
  if (staleCandidates.length) {
    const res = await db.collection('candidates').deleteMany({ _id: { $in: staleCandidates.map((c) => c._id) } });
    deletedCandidates = res.deletedCount;
  }

  console.log('\n--- Deleted ---');
  console.log(`votes      : ${deletedVotes}`);
  console.log(`candidates : ${deletedCandidates}`);

  const remainingVotes = await db.collection('votes').countDocuments({ election: electionOid });
  const remainingCands = await db.collection('candidates').countDocuments({ election: electionOid });
  console.log('\n--- After ---');
  console.log(`votes      : ${remainingVotes}`);
  console.log(`candidates : ${remainingCands}`);
  console.log('Done.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('\nCleanup failed:', err.message);
  process.exit(1);
});
