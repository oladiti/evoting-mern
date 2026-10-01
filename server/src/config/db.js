import mongoose from 'mongoose';
import { env } from './env.js';

function maskUri(uri) {
  return String(uri).replace(/\/\/[^@]*(@)/, '//***$1');
}

// A pathless mongodb+srv URI (mongodb+srv://u:p@host.net/?appName=x) resolves to
// the driver default database, "test", not to anything appName implies. That is
// silent and has already pointed this app at the wrong database, so say it out
// loud at boot rather than letting it surface later as "Invalid username or
// password".
function warnIfDatabaseUnspecified(uri) {
  let path = '';
  try {
    path = new URL(String(uri).replace(/^mongodb(\+srv)?:\/\//, 'http://')).pathname;
  } catch {
    return; // unparseable URI; mongoose will report the real problem
  }
  if (path === '/' || path === '') {
    console.warn('[db] WARNING: DB_URI has no database name, so the driver defaults to "test".' + ' Append the intended name (e.g. /evoting) to make the target explicit.');
  }
}

export async function connectDB() {
  mongoose.set('strictQuery', true);
  // Fail a request quickly while the DB is down instead of letting mongoose
  // buffer every query for the 10s default, which turned one slow connect into
  // a long queue of hanging requests.
  mongoose.set('bufferTimeoutMS', 5000);

  warnIfDatabaseUnspecified(env.DB_URI);

  try {
    await mongoose.connect(env.DB_URI, { serverSelectionTimeoutMS: 10000 });
    console.log(`[db] connected: ${maskUri(env.DB_URI)} (database: ${mongoose.connection.name}, ` + `${mongoose.connection.readyState === 1 ? 'ready' : 'unknown'})`);
    return mongoose.connection;
  } catch (err) {
    console.error(`[db] connection failed: ${err.message}`);
    console.error('[db]  -> check DB_URI in server/.env and that your Atlas IP allowlist includes your current IP');
    throw err;
  }
}

export function isDBReady() {
  return mongoose.connection.readyState === 1;
}

// One wording for "the database is not reachable", emitted from both the boot
// gate and the error handler. The client matches on this exact string to decide
// whether a 503 is worth retrying, so the two sites have to agree; a reword here
// has to be made there too.
export const DB_UNAVAILABLE_MESSAGE = 'Database unavailable, please retry shortly';

// The listener is opened before connectDB() finishes (see server.js), so for the
// first few seconds of every start - long enough to be several seconds against a
// remote Atlas cluster - readyState is not yet 1. Requests arriving in that window
// used to be buffered by mongoose for bufferTimeoutMS and then rejected, so a
// user who submitted the login form the instant the server came up was shown a
// 503 and no amount of waiting on their part would have helped: the failure was
// decided before the database had finished connecting.
//
// Polling is strictly better than both of the alternatives. Buffering is what
// produces the 503 in the first place, and refusing fast (503 immediately) just
// moves the same error earlier. The bound is generous enough to cover the 10s
// serverSelectionTimeoutMS plus a retry, but finite, because if the database is
// genuinely gone the request has to be answered eventually rather than held open
// indefinitely.
export async function waitUntilReady(timeoutMs = 20000) {
  if (isDBReady()) return true;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (isDBReady()) return true;
  }
  return isDBReady();
}

export function isObjectId(v) {
  return mongoose.Types.ObjectId.isValid(String(v));
}

export function toObjectId(v) {
  return new mongoose.Types.ObjectId(String(v));
}
