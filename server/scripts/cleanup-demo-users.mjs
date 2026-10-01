// Remove the leftover demo accounts that are inflating the admin overview stats.
//
//   node scripts/cleanup-demo-users.mjs              # dry run (default, safe)
//   node scripts/cleanup-demo-users.mjs --apply      # actually delete
//   node scripts/cleanup-demo-users.mjs --pattern '^voter\d+@example\.com$'
//
// Demo accounts are matched by email pattern, never by name, and admin accounts
// are always excluded. Every collection that references a user is cleaned so no
// orphaned documents are left behind.
import mongoose from 'mongoose';
import fs from 'node:fs';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const patternArg = argv.indexOf('--pattern');
const PATTERN = patternArg !== -1 && argv[patternArg + 1] ? new RegExp(argv[patternArg + 1]) : /@example\.com$/;

const env = Object.fromEntries(
  fs
    .readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

await mongoose.connect(env.DB_URI, { serverSelectionTimeoutMS: 15000 });
const db = mongoose.connection.db;

const users = db.collection('users');
const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));

const demo = await users
  .find({ email: PATTERN, is_admin: { $ne: true } })
  .project({ username: 1, email: 1, is_admin: 1 })
  .toArray();

if (!demo.length) {
  console.log(`No accounts match ${PATTERN}. Nothing to do.`);
  await mongoose.disconnect();
  process.exit(0);
}

const ids = demo.map((d) => d._id);
console.log(`${APPLY ? 'DELETING' : 'DRY RUN — would delete'} ${demo.length} account(s) matching ${PATTERN}\n`);
for (const d of demo) console.log(`  ${d.username} <${d.email}>`);

// Anything an admin did to these accounts is audit history; keep it but report.
const KEEP = ['activitylogs'];
const plan = [];
for (const name of ['accreditations', 'votes', 'ballots', 'refreshtokens', 'emailverifications', 'passwordresets', 'loginattempts']) {
  if (!existing.has(name)) continue;
  const n = await db.collection(name).countDocuments({ user: { $in: ids } });
  if (n) plan.push({ name, n, keep: KEEP.includes(name) });
}

console.log('\nreferenced documents:');
if (!plan.length) console.log('  (none)');
for (const p of plan) {
  console.log(`  ${p.name}: ${p.n}${p.keep ? '  (audit history — kept)' : ''}`);
}

// Refuse to touch anything if a real election result depends on these users.
const voteCount = plan.find((p) => p.name === 'votes')?.n ?? 0;
if (voteCount > 0) {
  console.log(`\nABORT: these accounts own ${voteCount} vote document(s). Deleting them would`);
  console.log('change election results. Remove the votes deliberately first, or narrow --pattern.');
  await mongoose.disconnect();
  process.exit(3);
}

if (!APPLY) {
  const total = demo.length + plan.filter((p) => !p.keep).reduce((a, p) => a + p.n, 0);
  console.log(`\nNo changes made. Re-run with --apply to delete ${total} document(s).`);
  await mongoose.disconnect();
  process.exit(0);
}

for (const p of plan.filter((x) => !x.keep)) {
  const r = await db.collection(p.name).deleteMany({ user: { $in: ids } });
  console.log(`  deleted ${r.deletedCount} from ${p.name}`);
}
const res = await users.deleteMany({ _id: { $in: ids } });
console.log(`  deleted ${res.deletedCount} users`);

const after = {
  total: await users.countDocuments(),
  voters: await users.countDocuments({ is_admin: false }),
  faces: await users.countDocuments({ is_admin: false, face_enrolled: true }),
};
console.log(`\nremaining: total=${after.total} voters=${after.voters} faces_enrolled=${after.faces}`);

await mongoose.disconnect();
process.exit(0);
