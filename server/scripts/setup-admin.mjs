/**
 * Create the initial admin account (parity with the old setup.php).
 * Usage: npm run setup:admin -- --username admin --password XXXX --email you@mail.com
 * If existing admins exist, printing their count. Idempotent per username.
 *
 * --reset re-hashes the password onto an existing account instead of creating a
 * new one, for when the original admin password came from the old MySQL system
 * and is unrecoverable (bcrypt is one-way).
 */
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

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

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const value = process.argv[i + 1];
  // A value flag followed by another flag (or nothing) has no value; report
  // undefined rather than swallowing the next flag as this flag's value.
  return value && !value.startsWith('--') ? value : undefined;
}

// Boolean flags carry no value, so they cannot go through arg() above.
function has(name) {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const uri = process.env.DB_URI || 'mongodb://127.0.0.1:27017/evoting';
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  const User = (await import('../src/models/User.js')).default;

  const existingAdmins = await User.countDocuments({ is_admin: true });
  console.log(`Existing admins: ${existingAdmins}`);

  const username = (arg('username') || 'admin').toLowerCase();
  const password = arg('password');
  const email = (arg('email') || `${username}@evoting.local`).toLowerCase();

  if (!password) {
    console.error('Usage: npm run setup:admin -- --username admin --password SECRET --email a@b.c');
    process.exit(1);
  }

  if (has('reset')) {
    const target = await User.findOne({ username });
    if (!target) {
      console.error(`No user '${username}' to reset.`);
      await mongoose.disconnect();
      process.exit(1);
    }
    target.password = await bcrypt.hash(password, 10);
    await target.save();
    // A reset is also the way out of a failed-login lockout, so clear the
    // per-account streak. The per-IP streak is left alone: it may be shared.
    const LoginAttempt = (await import('../src/models/LoginAttempt.js')).default;
    await LoginAttempt.deleteOne({ key: `username:${username}` });
    console.log(`Password reset for '${username}' (admin: ${Boolean(target.is_admin)}). Login lockout cleared for this account.`);
    await mongoose.disconnect();
    return;
  }

  if (existingAdmins > 0 && !has('force')) {
    console.log('An admin already exists. Add --force to create another one anyway.');
    await mongoose.disconnect();
    return;
  }

  const existing = await User.findOne({ username });
  if (existing) {
    console.error(`User '${username}' already exists.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);
  await User.create({
    username,
    email,
    password: hash,
    full_name: 'Administrator',
    is_admin: true,
    email_verified: true,
  });

  console.log(`Admin '${username}' created successfully.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
