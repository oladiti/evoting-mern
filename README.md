# OGITECH E-Voting System

A student-body electronic voting platform: voter registration and email
verification, admin accreditation, biometric (face) enrolment, a geofenced
ballot, and live results. React + Vite front end, Express + MongoDB back end,
deployed as a single origin with npm workspaces.

This is a migration of a legacy PHP/MySQL application. Behaviour that mattered
to the original - the biometric thresholds, the geofence, the lockout
escalation - was ported deliberately and is documented in the code next to the
logic it constrains.

---

## Quick start

```bash
npm install

cp server/.env.example server/.env    # then fill it in - see "Environment" below
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # -> JWT_SECRET

npm run setup:admin                    # create the first admin account
npm run dev                            # server :5000 + client https://localhost:5173
```

The dev server is **HTTPS-only** (`basicSsl` in `vite.config.js`) because the
face camera and geolocation APIs are unavailable over plain HTTP on anything
other than `localhost`. The certificate is self-signed, so the first load will
warn.

Then open <https://localhost:5173>.

---

## Requirements

- Node.js **>= 20.11** (declared in `engines`; the server uses native ESM and
  `fetch`)
- MongoDB 7 (local or Atlas)
- MySQL only if you are running the migration

---

## Environment

Everything is read from `server/.env`. `server/.env.example` is the annotated
template; the entries that will bite you if you get them wrong:

| Variable | Required | Notes |
|---|---|---|
| `JWT_SECRET` | **yes, in production** | >= 32 chars. The server **refuses to boot** without it in production, and warns in development. The old fallback was a string published in this repository, which would have let anyone forge an admin session. |
| `ALLOWED_ORIGINS` | yes | Must include the exact dev origin (`https://localhost:5173`). CSRF rejects any mutating request whose `Origin` is not on this list, so omitting it makes every POST - register included - fail with "Origin not allowed". |
| `CLIENT_URL` | yes | Used to build every link in outbound email. Never derived from a request. |
| `CSP_MODE` | no | `report-only` (default) \| `enforce` \| `off`. Start on report-only: it logs violations without blocking anything, so a wrong directive cannot break reCAPTCHA or the face camera. Move to `enforce` once the console is clean. |
| `DB_URI` | yes | Falls back to `mongodb://127.0.0.1:27017/evoting`. Must name the database explicitly (`/evoting`) - a pathless URI silently connects to `test`. |
| `UPLOADS_DIR` | in any deployment | Where candidate and face photos are written. Unset locally, so they stay in `server/uploads`. **Set it to a mounted persistent disk when deployed**, or every deploy deletes every enrolled face. See `render.yaml`. |
| `RECAPTCHA_SITE_KEY` / `RECAPTCHA_SECRET_KEY` | if reCAPTCHA is on | See the failure mode below. |
| `RECAPTCHA_FAIL_OPEN` | no | Default `false`. |
| `MAIL_*` | for email | DB settings in Admin > Settings override these, except the password, which is never seeded from `.env`. |

### reCAPTCHA has three states, not two

1. **Disabled by an admin** - not enforced. This is the intended off switch.
2. **Enabled, keys present** - enforced.
3. **Enabled, keys missing** - *misconfigured*.

State 3 used to be reported as "not enforced", so a missing
`RECAPTCHA_SECRET_KEY` silently removed the captcha from registration, login,
password reset and voting while the settings screen still showed it as on. It
now **refuses the request with a 503** and logs a warning, because on an
election system an invisible security control is worse than a visible outage.
`RECAPTCHA_FAIL_OPEN=true` inverts this during an incident, at the cost of
running unprotected, and logs loudly on every use.

---

## Scripts

### Root

| Command | What it does |
|---|---|
| `npm run dev` | Server and client together, with live reload. |
| `npm run build` | Production client build into `client/dist`. |
| `npm start` | Server only. In production it also serves `client/dist`. |
| `npm run verify` | **lint + format check + tests.** Run this before committing. |
| `npm run lint` / `lint:fix` | ESLint 9, flat config, both workspaces. |
| `npm run format` / `format:check` | Prettier. |
| `npm test` / `test:watch` | Vitest. |
| `npm run migrate` | MySQL to MongoDB (see below). |
| `npm run setup:admin` | Create the first admin. |

### Maintenance (`server/scripts/`)

These are one-time or emergency repairs, not part of the run path. They are
deliberately **not** all wired into `package.json`, because running the wrong
one against a live database is destructive.

| Script | Purpose |
|---|---|
| `migrate-mysql-to-mongo.mjs` | MySQL (XAMPP `evoting`) to MongoDB. `--dry` to preview. |
| `repair-object-ids.mjs` | The migration stored ObjectId hex as `_id`/reference strings, which breaks every `findById`/`populate` and therefore all sessions. |
| `fix-matric-index.mjs` | Replace the `matric_no_1` unique+sparse index with a partial index. The old one could not express "any number of voters may leave this blank". |
| `backfill-slugs.mjs` | Elections created before slugs existed are unreachable by their public URL. |
| `reset-face-enrollment.mjs` | `-- --yes` required. Clears enrolled faces so voters re-enrol under the current rules. |
| `cleanup-demo-users.mjs` | Remove demo accounts and their dependent rows. |
| `cleanup-election.mjs` | Drop votes that reference candidates not in the election. |
| `setup-admin.mjs` | `--username --password --email`. Idempotent per username. |

Run them with `node server/scripts/<name>` from `server/`.

---

## Architecture

```
client/                     React 18 + Vite 5 + Tailwind 3
  src/lib/api.js            fetch wrapper: CSRF header, single-flight 401 refresh
  src/lib/slugify.js        dependency-free; parity-tested against the server copy
  src/components/face/      FaceCamera (quality gates) + FaceGate
  public/models/            face-api.js weights, fetched at runtime, not bundled
server/                     Express 4 + Mongoose 8, native ESM
  src/config/env.js         typed env, boots or fails loudly
  .env.example              annotated template
  src/services/             settings, tokens, email, captcha, geofence, faceMatch
  src/middleware/           auth, csrf, upload, error
render.yaml                 Render Blueprint: one service, disk, env var keys
  src/controllers/          request handlers
  src/routes/               public, auth, admin
  tests/                    Vitest suites
```

State management is three React contexts (`Auth`, `Theme`, `Toast`) plus local
`useState`. There is no Redux/Zustand and no data-fetching cache; each page
loads what it needs.

---

## The security model

The voting path is a chain of gates. A ballot is only recorded if **all** of
these pass, in order (`server/src/controllers/voteController.js`):

1. **Authenticated** - a valid, non-expired access token in an `httpOnly` cookie,
   re-checked against the database on every request, so revocation is immediate.
2. **Election open** - `now` is inside the election's start/end window.
3. **Registration open** and **voting enabled** (admin settings).
4. **Accredited** - if the election requires it, an `Accreditation` row must
   exist for this user and election.
5. **Geofence** - haversine distance from the configured centre, if enabled.
6. **Face verified** - a one-time biometric check, if enabled, which cannot be
   reused for a second ballot.
7. **reCAPTCHA** - if enabled and correctly configured.
8. **Double voting** - blocked by a unique compound index on
   `{user, election, position_voted}` *and* a transaction. The index is the
   backstop: if the application logic were wrong, the write would still fail.

### Sessions

- Access token: JWT in an `httpOnly`, `sameSite=lax`, `secure`-in-production
  cookie. Lifetime is the admin-configurable `session_timeout_minutes`.
- Refresh token: an opaque 48-byte random value, **rotated on every use**, in a
  TTL-indexed collection that self-deletes on expiry.
- **Token families.** Every token issued from one login shares a family id.
  Presenting a token that was already rotated means the caller is replaying a
  stolen token or a session was cloned, so the whole family is destroyed and
  the user must sign in again. A 10-second grace window re-issues the successor
  idempotently, so two open tabs do not log each other out.
- A password reset revokes **all** sessions for that account. So does
  `POST /api/auth/logout-all`.
- The `session` flag survives rotation, so a non-"remember me" login can never
  be silently promoted to a 30-day token.

### Other controls

- **CSRF** - double-submit cookie *plus* an Origin/Referer allowlist.
- **CSP** - no `unsafe-inline` in `script-src`, and `script-src-attr 'none'`.
  The dev and preview servers get a mirrored policy so violations are actually
  visible while developing. Theme bootstrap is a real file (`theme-init.js`)
  specifically to avoid needing an inline script.
- **Passwords** - bcrypt, cost 10, minimum 8 chars with upper, lower and digit.
- **Login lockout** - escalating per-username *and* per-IP, with a 30-minute
  decay window so an occasional typo never accumulates a permanent lock.
- **Uploads** - MIME allowlist, 2 MB cap, random filenames, separate `faces/`
  directory, served with `nosniff` and no execution.
- **Activity log** - every significant action, readable by admins only.
- **Secrets at rest** - `smtp_pass` and `recaptcha_secret_key` are never sent to
  a browser. The admin form shows whether a value is set and treats a blank
  submission as "leave it alone", so saving an unrelated field cannot blank a
  password. Clear one deliberately by submitting the literal `__clear__`.

### Known limits, stated plainly

- The in-memory rate limiters (`forgotThrottle`, the settings cache) are
  per-process. They reset on restart and diverge between instances. Use a shared
  store if you run more than one.
- `POST /api/admin/restore` is the most destructive endpoint. It empties twelve
  collections and refills them from a JSON body. It is admin-gated and now
  validates shape, per-document size and per-collection count *before* touching
  the database, and drops all refresh tokens. It is still a full wipe by design.
- `ActivityLog` has no retention policy and grows without bound; `backupDatabase`
  caps at 100k documents per collection, so a backup of a larger database is
  silently truncated.
- The geofence and client IP both come from the client. The geofence is a
  deterrent, not an authentication factor.

---

## Face verification

`face-api.js` produces a 128-float descriptor. Matching (`server/src/services/faceMatch.js`):

- Both descriptors are **scaled to unit length** before the Euclidean distance,
  so the result measures the angle between faces rather than their magnitudes.
  Descriptor norm tracks capture quality - lighting and face size - not identity.
  Without this, a well-lit capture of one person can land *closer* to a dim
  capture of a different person than two captures of the same person.
- The threshold is **0.30** by default, admin-configurable in hundredths, and
  clamped to `[0.15, 0.32]`. The closest pair of *different* voters ever measured
  on this deployment was **0.327**, so the ceiling is held below it. Out-of-range
  values are **ignored, not clamped**, so a typo cannot turn the matcher into an
  open door or a wall. The bounds are asserted in `server/tests/faceMatch.test.js`.
- Capture quality gates in `FaceCamera.jsx`: face width 25-60% of frame, mean
  luminance 35-235, exactly one dominant face, and a 1.5s frame-staleness check
  that refuses a descriptor computed from a stale feed. A frame that fails any
  gate is not capturable, so a too-dark or too-small capture cannot be enrolled.
- Enrolment is refused if the new descriptor already matches another account,
  and the orphaned upload is deleted.

The 6.7 MB of model weights live in `client/public/models/` and are fetched at
runtime by the face routes only. They are never in the JS bundle.

---

## Frontend performance

Every page is `React.lazy` code-split behind a single `Suspense` boundary;
layouts stay eager because they are on the critical path for every route.

| | Before | After |
|---|---|---|
| Landing page (`/`) | ~1419 kB | **~472 kB** (67% smaller) |
| `face-api.js` | on every page | face routes only (~649 kB) |
| Chart.js | on every page | results/admin only (~155 kB) |

---

## Testing

```bash
npm test
```

67 tests across five suites, concentrated where a silent regression is both easy
and expensive:

| Suite | Covers |
|---|---|
| `faceMatch.test.js` | Unit-length normalisation, distance symmetry and magnitude-invariance, the threshold band, and the 0.327 separation ceiling. |
| `security.test.js` | `publicUrl` cannot be influenced by a request (the reset-link takeover fix), and the three reCAPTCHA states including fail-closed behaviour. |
| `rateLimitLogin.test.js` | The escalation curve, monotonicity, and that the per-IP bucket starts well above the per-account one. |
| `slugify.test.js` | The client and server implementations produce identical output across a hostile corpus, and that a slug is always a single safe path segment. |
| `env.test.js` | The JWT secret refusal, and the `CSP_MODE` / `ALLOWED_ORIGINS` coercions. |

The API client deliberately does **not** retry POSTs on a generic 503: a 503
from the application does not prove the write did not commit, and retrying a
ballot is worse than showing an error. It retries only on the exact proxy
signature. That reasoning is in `client/src/lib/api.js` and is load-bearing.

---

## Deployment

The server and the client deploy as **one** Render web service. Express serves
`client/dist` from the same origin it serves the API from, so there is no CORS
configuration to get wrong and no second service to keep in step.

`render.yaml` at the repo root carries the build command, start command, health
check, disk mount and the non-secret environment variables. Point Render at it
with **New > Blueprint**.

### Why one service, and not a static site plus an API

Worth stating because "deploy them separately" looks like the obvious split, and
it cannot work with this client:

- The client calls the API with **relative** paths only
  (`client/src/lib/api.js` issues `fetch('/api/...')`; there is no API base URL
  and no `VITE_*` variable anywhere). On a separate host those requests go to the
  static site, which serves no API. CORS cannot help, because the request never
  reaches Express to negotiate anything.
- The CSRF token is read from `document.cookie` (`ev_csrf`), and the cookie is
  set by the server's domain. Cross-origin, the page cannot read it, so every
  mutating request fails `Invalid CSRF token` even once CORS is correct.
- `/uploads` and the 6.7 MB of face-api weights under `/models` are also
  referenced relatively.

A split deployment would need a `VITE_API_URL`, the CSRF token moved out of the
cookie and into memory, the server origin added to CSP `connect-src`, and
`SameSite=None` on the session cookies. Same-origin needs none of that.

### Steps

1. Create the Atlas cluster, and **widen the IP allowlist** to `0.0.0.0/0`.
   Render egresses from a shifting range of addresses, so a locked-down
   allowlist fails to connect at random.
2. Rotate any Atlas password that has ever been committed, and check
   `server/.env.example` for it. The repository history is permanent.
3. **Delete any static site currently holding the hostname.** The Blueprint is
   named `evoting-mern` to take over an existing hostname, and Render will not
   release the name while another service holds it. There is a window where the
   app is not served at all, which is fine except mid-election.
4. Create the Blueprint from `render.yaml`.
5. Set the `sync: false` variables in the dashboard. `CLIENT_URL` and
   `ALLOWED_ORIGINS` cannot be set before the service exists, because they need
   the hostname Render assigns. Both default to `https://localhost:5173`, which
   is wrong in production: `CLIENT_URL` builds every email link, so password
   resets would point at a laptop, and `ALLOWED_ORIGINS` is the CSRF allowlist,
   so without the real origin every POST fails `Origin not allowed`.
6. Create the first admin from a local checkout pointed at the same `DB_URI`:

   ```bash
   npm install
   DB_URI=<the same one Render has> node server/scripts/setup-admin.mjs \
     --username admin --password '<a real one>' --email you@example.com
   ```

   This cannot run at deploy time; it is a one-off.
7. Confirm `https://evoting-mern.onrender.com/api/health` returns
   `{"ok":true,"db":"connected"}`. `ok` is `false` while the database is
   unreachable, so this distinguishes a working app from a booting one.
8. Watch the logs for `[csp]` lines, then set `CSP_MODE=enforce`.

### Notes

- **`plan: starter` is required.** Render does not attach persistent disks to
  free instances. Without the disk, `server/uploads/` is discarded on every
  deploy, which deletes every enrolled face photo; each affected voter has to
  re-enrol by hand. `UPLOADS_DIR` is what makes the mount take effect.
- **The first request after a deploy is slow.** Free instances sleep after
  inactivity and cold-start on the next request; a paid instance does not.
- **Rate limiters are per-process** (see "Known limits"), so they reset on every
  restart. Render will also spin up more than one instance for a paid plan, and
  the buckets will diverge between them. Use a shared store if you run more than
  one.
- `trust proxy` is set to `1`; Render puts exactly one proxy in front, which is
  what that value assumes. Cookies are `secure` in production, so the app must
  be reached over HTTPS.
- To deploy by hand instead of by Blueprint: `npm ci && npm run build`, then
  `npm start` with `NODE_ENV=production`.
