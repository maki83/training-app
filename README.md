# training-app

Workout tracking MVP with an Express API and a static HTML/CSS/JavaScript
frontend. You can create workouts with exercises and sets, list saved workouts,
and select a workout to view its details. An interactive monthly calendar shows
training history, daily details and monthly statistics. Data is kept in backend
process memory only; this is not a production-ready persistence or security setup.

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

## Workout history and calendar

The Swedish UI has two navigation options: **Träningspass** (the existing list,
workout details and creation form) and **Kalender**. Switching views preserves
form input and the selected calendar month. No extra runtime dependencies or API
endpoints are needed.

- The calendar starts on the current month with today selected. Weeks begin on
  Monday. Previous/next buttons cross month and year boundaries; changing months
  selects the first day of the new month. Selecting any day shows **all** its
  workouts, ordered by time, including names, local dates/times, exercises, reps
  and weights. Days without workouts have an explicit empty state.
- Training days are green and display a workout count. Today has a yellow inset
  outline; the selected day has a blue border. These markings can coexist.
- Monthly **Antal pass** counts workouts, not distinct training days.
  **Träningsvolym** is the sum of `reps × weight` over every set of every exercise
  in the selected month's workouts, in kg. Zero-weight sets contribute zero.
  Displayed volume is rounded to at most two decimal places; calculation uses
  the unrounded values. Empty months show zero workouts and zero volume.
- There is no completed/planned status in the data model: **every saved workout**
  is treated as history, including a saved workout dated in the future.
- The form accepts **local time**, converts it to a UTC ISO timestamp for the
  existing API, and displays and groups history in the **browser's local
  timezone**. A UTC timestamp near midnight may belong to another local day or
  month; the UTC string's date prefix is not used for grouping. Viewing the same
  history in another timezone can therefore change its calendar placement.
- Saving a workout reloads the shared history and updates both views and monthly
  statistics without a page reload, retaining the selected month and day.
  Loading and failed requests are distinct from an empty month: statistics show
  `—` until history is available, and failed loads offer **Försök igen** (retry).
- Native buttons support Tab, Enter and Space, with visible focus and accessible
  date, selection and today labels. The dark layout stacks on smaller screens.

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

- `public/index.html`, `public/styles.css` and `public/main.js` implement the UI
  without a frontend framework or bundler. Details are rendered from the list
  response; selecting a workout or calendar day does not call a separate detail
  endpoint. Both views use the history loaded by `loadWorkouts()` in `public/main.js`.
  Its exported pure date/summary helpers are also used directly in tests; browser
  initialization runs once, while CommonJS imports have no DOM side effects.
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
# Full Jest suite
npm test

# Same test command used by .github/workflows/ci.yml (CI uses Node.js 22)
npm test -- --ci --runInBand

# Single test file
npm test -- tests/workouts.test.js --runInBand

# Optional coverage report (written to coverage/)
npm test -- --coverage --runInBand
```

`jest.config.cjs` splits tests into `node` and `jsdom` projects. The suite covers
health/server startup, workout creation/listing, payload/date validation, calendar
geometry, leap years, year boundaries, multiple workouts per day and monthly
counts/volume. `tests/calendar.test.js` also starts real Node subprocesses in
`UTC`, `Europe/Stockholm` and `America/Los_Angeles` to check local grouping and
month membership near UTC midnight and daylight-saving transitions.

`tests/frontend.proxy.test.js` checks static calendar assets, health, listing and
valid/invalid creation through the real proxy. `tests/frontend.dom.test.js` uses
the actual HTML, CSS and UI logic with a real backend/proxy on ephemeral localhost
ports. Because jsdom has no native `fetch`, a small HTTP transport supplies it;
API responses and calendar logic are **not mocked**. These tests cover navigation,
day details, text safety, CSS-hidden views, single initialization, empty/loading/
error/retry states, validation, and form submission through to refreshed calendar
statistics. Network failure is exercised against an unavailable local port;
shutting down and restarting the real backend verifies proxy HTTP errors and
recovery as well.

For focused calendar/DOM checks:

```bash
npm test -- tests/calendar.test.js tests/frontend.dom.test.js --runInBand
```

These automated DOM tests are not a full browser or Compose networking test.
For a browser check, start the app as above and check both views at mobile and
desktop widths, Tab/Enter/Space navigation, today/selected/training markings,
empty months and saving multiple workouts on the same day.

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
- **Local date UI:** the form uses `datetime-local` and JavaScript converts the
  entered local time to UTC with `toISOString()` before submission. It does not
  offer a timezone selector. Displayed dates and calendar membership use the
  browser's local timezone, not a fixed training location's timezone.
- **Limited verification:** the DOM integration suite is not an end-to-end browser
  test, and a successful health response alone does not verify the whole UI/API
  flow or provide production readiness guarantees.
