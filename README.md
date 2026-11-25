# training-app

Workout tracking MVP with an Express API and a static HTML/CSS/JavaScript
frontend. You can create workouts with exercises and sets, list saved workouts,
and select a workout to view its details. The interactive dashboard summarizes
your training with statistics, exercise records and daily charts. Data is kept
in backend process memory only; this is not a production-ready persistence or security setup.

## Local development

### Prerequisites and installation

- Node.js and npm. CI uses Node.js 22; the Dockerfiles use Node.js 20 Alpine.
  `package.json` does not declare a minimum Node.js version (`engines`). Use
  Node.js 22 to match CI when developing locally.
- Git for cloning the repository.
- Optional: Docker with the Compose plugin for the container workflows below.
- The command examples use a POSIX shell (such as Bash). The smoke test also
  requires Bash and `curl`.

For a new checkout:

```bash
git clone https://github.com/maki83/training-app.git
cd training-app
npm ci
```

For an existing checkout, change to its project root (the directory containing
`package.json` and `package-lock.json`) and run `npm ci`. It installs both runtime
and development dependencies from the lockfile. Run all commands below from
that same project root.

### Start the backend and frontend

Use **two separate terminals**, both in the project root.

Terminal 1 — backend:

```bash
PORT=8080 npm start
```

Terminal 2 — frontend and API proxy:

```bash
PORT=3000 BACKEND_URL=http://localhost:8080 node src/frontend-server.js
```

Open <http://localhost:3000> for the UI. Check the backend directly at
<http://localhost:8080/health>, or through the frontend proxy at
<http://localhost:3000/api/health>. Both should return `{"status":"ok"}`.

`npm start` runs **only the backend**. Without `PORT=8080`, it defaults to port
`3000`, which conflicts with the frontend's default port. There is no frontend
npm script or build step; start its Node.js server explicitly as above. Stop each
process with Ctrl+C. Restarting the backend clears all workouts.

## Training dashboard

The **Dashboard** is the default view. Use **Workout history** or **Log a workout**
to browse all saved sessions, select their details, or register a session. Saving
refreshes the history and dashboard from the same API response without reloading
the page. Repeated initialization and double submissions do not register duplicate
listeners or send duplicate saves. A failed refresh after a successful save is
shown separately: retry loading rather than submitting the saved workout again.

The responsive layout includes:

- Cards for all-time workouts, this week's workouts, this month's workouts,
  total repetitions, and total training volume in **kg·reps**.
- The five most frequent exercises, counted by distinct workouts.
- Independent single-set weight and repetition records for **all** exercises.
- A daily activity chart for the last **30 local calendar days**, including today.
- A daily volume chart with a keyboard-accessible **30 / 90 day** selector.
  Both charts include dates with no workouts and expandable daily data tables
  as text alternatives. Bar titles provide individual values on hover.
- Separate loading, empty-data and load-error states with a retry control.
  No completed sessions (including a history containing only future sessions)
  shows guidance and zero-filled charts rather than an error.

### Calculation rules

`public/statistics.js` contains pure calculations shared by the browser and Jest.
`calculateStatistics(workouts, reference, volumeDays)` takes an explicit reference
time and supports volume periods of 30 (default) or 90 days.

- Every saved session with a valid date **at or before the reference instant**
  counts as completed. There is no completed/status field. Later sessions,
  including later today, stay visible in history but do not affect any statistic
  or record. The dashboard recalculates on data load, view navigation and period
  changes; it does not have a background clock or live API polling.
- Dates and periods use the browser's **local timezone**. Weeks start Monday at
  00:00; months start on the first at 00:00. Chart days are advanced with local
  calendar arithmetic, not fixed 24-hour increments, to handle daylight saving.
  The form accepts local date/time and converts it to the API's UTC format.
- Repetitions are summed across all sets; volume is the sum of `weight * reps`
  across those sets. Zero-weight sets count toward repetitions and records,
  but add zero volume. Decimal weights and reps are supported, as in the API.
- Exercise names are normalized using Unicode NFC, trimmed, internal whitespace
  collapsed to one space, and lowercased. These canonical lowercase names are
  displayed in rankings and records; stored names and workout details are not
  modified. Accents and punctuation remain significant; aliases are not merged.
- An exercise counts once per workout even if listed repeatedly. Ranking uses
  workout count descending, then normalized name in JavaScript code-unit order
  for deterministic ties. Records are sorted by the same name ordering. Weight
  and repetition maxima are independent and can come from different sets.
- Calculations use JavaScript numbers; displayed values are rounded to at most
  two decimal places. Invalid dates/sets are ignored defensively, not coerced.
  An unrepresentable product or sum is marked **Too large**, with a warning and
  a dashed outline for affected chart days; it is never presented as zero,
  `NaN`, or `Infinity`. Other representable values remain visible.

Statistics describe the **entire shared, in-memory dataset**, not a private user
account. Reloading or retrying fetches all sessions without pagination. Restarting
the backend loses both history and statistics. No chart library, build step,
new dependency, API change or server configuration is required.

## Ports and configuration

| Component / mode | Listening port | Host access |
| --- | --- | --- |
| Local backend, unchanged default | `3000` | `http://localhost:3000` (conflicts with the default frontend) |
| Local backend, recommended command above | `8080` | `http://localhost:8080` |
| Local frontend | `3000` | `http://localhost:3000` |
| Compose backend | `8080` inside the container | No published host port; frontend uses `http://backend:8080` |
| Compose frontend | `3000` inside the container | `3100:3000`, UI at `http://localhost:3100` |
| Standalone backend image (`Dockerfile` defaults, without Compose) | `3000` inside the container | No host port unless explicitly published when running it |

No environment variables are mandatory. These settings are read from the process
environment; the application does not automatically load a `.env` file.

| Variable | Scope | Local default | Compose value |
| --- | --- | --- | --- |
| `PORT` | Backend process | `3000` | `8080` |
| `PORT` | Frontend process | `3000` | `3000` (host mapping remains `3100:3000`) |
| `BACKEND_URL` | Frontend proxy's backend target | `http://localhost:8080` | `http://backend:8080` |
| `NODE_ENV` | Node/Express environment | Not set by the app; Express defaults to `development` | `production` for both services |

Set `PORT` independently for each process. If you change the local backend port,
update the frontend's `BACKEND_URL` to match. The backend Dockerfile itself sets
`PORT=3000` and `NODE_ENV=production`; Compose overrides its port to `8080`.
`NODE_ENV=production` does not add authentication or persistent storage.

## Architecture

```text
Browser
  -> frontend Express server (src/frontend-server.js)
       /              -> static files in public/
       /api/health    -> backend /health
       /api/workouts  -> backend /workouts
                           -> Express API (src/app.js, started by src/server.js)
                           -> process-local in-memory workout array and ID counter
```

- `public/index.html`, `public/styles.css`, `public/statistics.js` and
  `public/main.js` implement the UI
  without a frontend framework or bundler. Details are rendered from the list
  response; selecting a workout does not call a separate detail endpoint.
- `src/frontend-server.js` serves the static files and uses
  `http-proxy-middleware` to forward `/api/*` to `BACKEND_URL`, stripping `/api`.
  Browser requests use the frontend's origin, so the browser does not need direct
  access to the backend container or a cross-origin API URL.
- `src/server.js` starts the backend HTTP server. `src/app.js` defines JSON body
  parsing, validation, the three API routes and the in-memory store.
- There is no database or shared store. Each backend process has its own workouts
  and sequential IDs, starting at `1` in a new process.

## API

The following URLs assume the recommended local setup. In Compose, replace the
frontend origin `http://localhost:3000` with `http://localhost:3100`; the backend
is not published directly to the host.

| Method | Direct backend URL | Frontend proxy URL | Success status |
| --- | --- | --- | --- |
| `GET` | `http://localhost:8080/health` | `http://localhost:3000/api/health` | `200 OK` |
| `GET` | `http://localhost:8080/workouts` | `http://localhost:3000/api/workouts` | `200 OK` |
| `POST` | `http://localhost:8080/workouts` | `http://localhost:3000/api/workouts` | `201 Created` |

### Health: `GET /health`

```bash
curl -i http://localhost:8080/health
# Same endpoint through the frontend:
curl -i http://localhost:3000/api/health
```

Response (`200 OK`):

```json
{ "status": "ok" }
```

This is a basic HTTP health endpoint, not a database or external-service check.

### List workouts: `GET /workouts`

```bash
curl -i http://localhost:3000/api/workouts
```

Response for a fresh backend (`200 OK`):

```json
{ "workouts": [] }
```

After creation, `workouts` contains the saved workout objects (including their
IDs, as shown below), in insertion order. There are no filters or pagination.

### Create a workout: `POST /workouts`

Send JSON with `Content-Type: application/json`. This example uses the proxy;
use `http://localhost:8080/workouts` for direct backend access.

```bash
curl -i http://localhost:3000/api/workouts \
  -H 'Content-Type: application/json' \
  -d '{"name":"Leg day","date":"2024-01-01T00:00:00.000Z","exercises":[{"name":"Squat","sets":[{"reps":5,"weight":100}]}]}'
```

Response (`201 Created`, ID shown for the first workout in a fresh backend):

```json
{
  "workout": {
    "id": 1,
    "name": "Leg day",
    "date": "2024-01-01T00:00:00.000Z",
    "exercises": [
      {
        "name": "Squat",
        "sets": [{ "reps": 5, "weight": 100 }]
      }
    ]
  }
}
```

Validation rules:

- The payload must be an object, not `null` or an array.
- `name`: required string containing at least one non-whitespace character.
- `date`: required, valid UTC timestamp in the exact form
  `YYYY-MM-DDTHH:mm:ss.sssZ`. It must include **exactly three millisecond digits**
  and a trailing `Z`, and represent a real date/time. For example,
  `2024-01-01T00:00:00.000Z` is valid; `2024-01-01`,
  `2024-01-01T00:00:00Z`, timezone offsets such as `+00:00`, and impossible dates
  such as `2024-02-30T00:00:00.000Z` are invalid.
- `exercises`: required, non-empty array of objects. Each exercise requires:
  - `name`: string containing at least one non-whitespace character.
  - `sets`: non-empty array of objects. Each set requires:
    - `reps`: finite JSON number greater than `0`.
    - `weight`: finite JSON number greater than or equal to `0`.
- Numeric strings are not accepted. Decimal numbers are accepted; the API does
  not enforce integer reps. Names are checked with `trim()` but stored unchanged.

Workout validation failures return `400 Bad Request` with an `errors` array.
For example, this invalid request:

```bash
curl -i http://localhost:3000/api/workouts \
  -H 'Content-Type: application/json' \
  -d '{"name":"","date":"2024-01-01","exercises":[]}'
```

returns:

```json
{
  "errors": [
    "name is required and must be a non-empty string",
    "date is required and must be a valid ISO 8601 date string",
    "exercises is required and must be a non-empty array"
  ]
}
```

Nested validation errors identify the relevant array indexes, for example
`exercises[0].sets[0].reps is required and must be a positive number`. Malformed
JSON is rejected by Express with `400 Bad Request` before workout validation;
its response is not the workout validator's `errors` JSON format.

## Docker Compose

From the project root, build and start the separate backend and frontend
services:

```bash
docker compose up -d --build
```

Open <http://localhost:3100>. The API is reachable through that same origin,
for example:

```bash
curl -i http://localhost:3100/api/health
curl -i http://localhost:3100/api/workouts
```

The frontend proxies to `http://backend:8080`. The backend has no published host
port: `expose: 8080` is not a host port mapping. Compose checks the backend at
`http://localhost:8080/health` **inside its container**, and starts the frontend
only once the backend is healthy.

```bash
# Service status and logs
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend

# Stop and remove the Compose containers/network
docker compose down
```

Images use Node.js 20 Alpine. Runtime images install production dependencies
only; use local development dependencies or the test image for Jest. There are
no data volumes, and workouts are lost whenever the backend process restarts,
including when its container is recreated.

## Tests

Install dependencies with `npm ci` first. No running backend or frontend is
needed for Jest:

```bash
# Full existing Jest suite
npm test

# Same test command used by .github/workflows/ci.yml (CI uses Node.js 22)
npm test -- --ci --runInBand

# Single test file
npm test -- tests/workouts.test.js --runInBand

# Optional coverage report (written to coverage/)
npm test -- --coverage --runInBand
```

`jest.config.cjs` splits tests into `node` and `jsdom` projects. The suite covers
health/server startup, workout creation/listing, payload/date validation, pure
statistics (including calendar boundaries, DST in Stockholm/New York, name
normalization and overflow), and real DOM rendering/navigation/form submissions.
`tests/frontend.proxy.test.js` also checks health,
listing, and valid/invalid creation through the real frontend proxy against a
local backend on an ephemeral port, without mocks, plus static delivery of all
dashboard assets. DOM tests use a small HTTP-to-fetch adapter against the real
API/validator/store because jsdom has no native fetch; only transport-error,
malformed-response and delayed-response injection is used to test recovery and
request ordering deterministically. They
exercise loading, empty/error/retry, 30/90-day selection, safe text rendering and
creation updating both views. Jest does not verify browser layout or Compose
networking.

### Docker tests

Build and run the dedicated test image (its default command is
`npm test -- --runInBand`):

```bash
docker build -f Dockerfile.test -t training-app-test .
docker run --rm training-app-test

# Run one test file instead
docker run --rm training-app-test npm test -- tests/workouts.test.js --runInBand
```

**Configuration difference:** `.dockerignore` excludes both `README.md` and
`jest.config.cjs` from the build context, including for `Dockerfile.test`.
The test image installs devDependencies and copies the tests, but it does not
contain those two files. Without the configuration, Jest uses its default
single-project discovery; the DOM test still selects jsdom via its per-file
annotation. This is not the same project configuration as local/CI runs.

To run with the repository's Jest project configuration without changing the
image, mount that file read-only from the project root:

```bash
docker run --rm \
  --mount "type=bind,source=$(pwd)/jest.config.cjs,target=/usr/src/app/jest.config.cjs,readonly" \
  training-app-test npm test -- --ci --runInBand
```

The existing Compose smoke test builds/starts the stack, waits for the frontend
on host port `3100`, and cleans up its Compose resources on exit:

```bash
bash tests/container.smoke.test.sh
```

It requires Docker Compose, Bash, `curl` and a free host port `3100`. It relies on
Compose's backend health dependency but only explicitly checks frontend HTTP
reachability; verify `/api/health`, workout listing and creation separately for
a real proxy check. The current CI workflow runs Jest, not these Docker commands.

## Dependency security review (issue #13)

The 2026-11-25 baseline audit reported **two high-severity package findings**,
covering six advisories (five high and one moderate), not just two individual CVEs:

- Production: `http-proxy-middleware@2.0.10 > http-proxy@1.18.1 >
  follow-redirects@1.16.0`, patched to **1.16.2** within `^1.0.0`.
- Development: `jest@29.7.0 > @jest/core@29.7.0 > @jest/reporters@29.7.0 >
  glob@7.2.3 > minimatch@3.1.5 > brace-expansion@1.1.18`, patched to
  **1.1.21** within `^1.1.7`. Other Jest paths share this same installed copy.

| Package | Advisory / CVE | Impact in the vulnerable library |
| --- | --- | --- |
| follow-redirects | [GHSA-q3jh-wrc6-jgq8](https://github.com/advisories/GHSA-q3jh-wrc6-jgq8) / CVE-2026-111756 | Array-form headers bypass cross-origin credential stripping |
| follow-redirects | [GHSA-8r9p-f939-6h3c](https://github.com/advisories/GHSA-8r9p-f939-6h3c) / CVE-2026-111755 | Incomplete regex escaping can leak custom sensitive headers |
| follow-redirects | [GHSA-mrwp-f3q8-3g9p](https://github.com/advisories/GHSA-mrwp-f3q8-3g9p) / CVE-2026-116689 | Cross-realm sensitive-header arrays are discarded, allowing credential leakage |
| brace-expansion | [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) / CVE-2026-102276 | Comma parsing recursion can exhaust the stack (high) |
| brace-expansion | [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) / CVE-2026-102278 | Nested brace recursion can exhaust the stack (high) |
| brace-expansion | [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) / CVE-2026-102277 | Quadratic expansion can exhaust CPU (moderate) |

**Exposure:** the frontend uses a configured backend target and does not enable
`followRedirects`; `http-proxy` therefore uses Node's native HTTP(S) client instead
of the vulnerable redirect handling. The app does not configure `sensitiveHeaders`.
The vulnerable production package was present, but an exploitable credential-leak
path through the current application has not been demonstrated. Reassess if proxy
options or targets change. `brace-expansion` processes test-tooling glob patterns;
no API-input path to it was identified, and production-only installs omit it.
Untrusted patterns in development/CI could still have triggered the old DoS bugs.
Version 1.1.20 alone would leave the moderate CPU issue; 1.16.1 would leave the
cross-realm credential issue, hence the selected minimal patch versions.

**Verification:** clean installs and all 23 Jest tests (19 existing plus four
proxy tests) passed on Node 20.20.2 and 22.23.5 with npm 10.9.11, and Node 24.22.2
with npm 12.2.2. `npm audit`, `npm audit --json`, and `npm audit --omit=dev`
reported **zero vulnerabilities** after the update; `npm ls follow-redirects
brace-expansion` showed only the patched copies.

**Remaining risks:** an audit is a point-in-time dependency advisory check, not
proof of application security or a container/OS scan. Deprecated development
packages (`inflight`, `glob`, `abab`, `domexception`, `whatwg-encoding`) remain
maintenance debt; Node 22/24 also report `http-proxy`'s deprecated `util._extend`.
The unchanged Dockerfiles use [Node 20, now end-of-life](https://nodejs.org/en/about/previous-releases),
which needs a separately scoped runtime update. Docker build/Compose smoke
verification was blocked by the unavailable Docker daemon; local Node 20 tests
are not container verification. Hosted PR CI must still run after publication.
The authentication and other application limitations below remain unchanged.

## Limitations

- **No persistence:** all workouts and the ID counter live in backend process
  memory and are reset on restart. There is no database, backup or recovery.
- **No shared state:** multiple backend processes/replicas hold independent data
  and can issue the same IDs; this is not a shared multi-instance store.
- **No authentication or authorization:** any client that can reach the API
  (including through the frontend proxy) can list and create workouts. There is
  no user/account separation. Do not expose it as a secured production service.
- **Limited API:** only health, list and create are implemented. There are no
  update/delete routes, single-workout detail route, filtering or pagination.
  The UI displays details from its downloaded list.
- **Basic date UI:** the form uses `datetime-local` and JavaScript converts the
  entered local time to UTC with `toISOString()` before submission. Displayed
  dates use the browser's local timezone.
- **Limited verification:** the DOM integration tests are not end-to-end browser
  tests, and a successful health response alone does not verify the whole UI/API
  flow or provide production readiness guarantees.
