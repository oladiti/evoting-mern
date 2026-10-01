import { app, ensureDefaultSettings } from './app.js';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';

const DB_RETRY_DELAY_MS = 5000;

// The listener is opened before the database is touched, and deliberately kept
// open if the database never arrives. Gating listen() on connectDB() meant that
// during the ~10s of serverSelectionTimeoutMS spent reaching a remote Atlas
// cluster there was no upstream at all, so the Vite dev proxy answered the
// browser with a bare 500 (ECONNREFUSED) that looked like an application crash.
// A live listener that can report its own degraded state via /api/health is
// strictly more debuggable than a dead port.
app.listen(env.PORT, () => {
  console.log(`[server] listening on http://localhost:${env.PORT}`);
});

let attempt = 0;

async function startDatabase() {
  try {
    await connectDB();
    attempt = 0;
    // getSetting() already falls back to the in-code defaults, so this can run
    // after the listener is up without any route depending on it.
    ensureDefaultSettings()
      .then(() => console.log('[settings] defaults ensured'))
      .catch((err) => console.error('[settings] failed to ensure defaults:', err.message));
  } catch (err) {
    attempt += 1;
    const wait = DB_RETRY_DELAY_MS * Math.min(attempt, 6);
    console.error(`[db] retrying in ${wait / 1000}s (attempt ${attempt}) - server stays up meanwhile`);
    setTimeout(startDatabase, wait);
  }
}

startDatabase();
