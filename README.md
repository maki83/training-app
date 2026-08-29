# training-app

Workout tracking API MVP with a simple frontend.

## Local development

Install dependencies:

```bash
npm install
```

Run the backend API locally (default port 8080):

```bash
npm start
```

The API will be available at:

- http://localhost:8080

Run the test suite:

```bash
npm test
```

## API overview

### Health

- `GET /health` → `{ "status": "ok" }`

### Workouts

#### Create workout

- `POST /workouts`
- Request body (JSON):

```json
{
  "name": "Leg day",
  "date": "2024-01-01T00:00:00.000Z",
  "exercises": [
    {
      "name": "Squat",
      "sets": [
        { "reps": 5, "weight": 100 }
      ]
    }
  ]
}
```

Constraints:

- `name`: required, non-empty string.
- `date`: required, must be a valid ISO 8601 UTC datetime string with `T` and `Z`,
  e.g. `2024-01-01T00:00:00.000Z`.
- `exercises`: required, non-empty array.
  - Each exercise must be an object with:
    - `name`: required, non-empty string.
    - `sets`: required, non-empty array.
      - Each set must be an object with:
        - `reps`: required, positive number.
        - `weight`: required, non-negative number.

On success:

- `201 Created` with `{ "workout": { ... } }`.

On validation error:

- `400 Bad Request` with:

```json
{
  "errors": [
    "name is required and must be a non-empty string",
    "date is required and must be a valid ISO 8601 date string"
  ]
}
```

## Frontend overview

A minimal responsive frontend is provided under `public/` and is served as a
separate service in Docker Compose. It allows you to:

- View the list of workouts.
- View details for a selected workout (exercises and sets).
- Create a new workout.
- Add exercises and sets (reps and weight) before submitting.

The frontend talks to the backend API via a simple `/api` proxy configured in
`docker-compose.yml`.

## Configuration

The API currently does not require any mandatory environment variables.
The following variables are recognized and can be overridden for production:

- `PORT` (default: `8080`) – HTTP port the backend server listens on.
- `NODE_ENV` (default: `development` locally, `production` in the container) –
  Node environment flag.

The frontend server also recognizes:

- `PORT` (default: `3000` inside the container) – HTTP port the frontend
  server listens on.
- `BACKEND_URL` (default: `http://localhost:8080`) – URL of the backend API
  used by the proxy for `/api/*` requests.

If you introduce new configuration in the future (e.g., database URLs, API
keys), ensure they are documented here and validated at startup.

## Containerized deployment

This project includes a production-ready Docker setup using Node.js 20 Alpine.
The backend and frontend run as separate services.

### Build and run with Docker Compose

From the project root:

```bash
# Build the images and start the services in the background
docker compose up -d --build
```

Services:

- `backend` – Express API, internal to the Docker network, listening on port
  `8080` inside the container.
- `frontend` – Static file + proxy server, listening on port `3000` inside the
  container and exposed on host port `3100`.

Once started, access the application via the frontend:

- Frontend: http://localhost:3100

The backend is not published on a host port by default; it is only reachable
from other services in the Docker network. The frontend proxies API requests
from `/api/*` to the backend.

To view logs:

```bash
# Backend logs
docker compose logs -f backend

# Frontend logs
docker compose logs -f frontend
```

To stop the containers and remove resources:

```bash
docker compose down
```

The service definitions do **not** use fixed `container_name` values, so Docker
is free to generate unique container names. This makes it easier to run
multiple instances (e.g., in CI or on different projects) without name
collisions.

The backend container exposes port `8080` internally and sets
`NODE_ENV=production` by default. The frontend container exposes port `3000`
internally and is mapped to host port `3100`.

A basic HTTP healthcheck is configured for the backend service in
`docker-compose.yml` against `http://localhost:8080/health`. The `/health`
endpoint is part of the public API surface for operations and is covered by
automated tests. If you change the path or semantics of this endpoint in the
future, be sure to update the `healthcheck` configuration in
`docker-compose.yml` accordingly so that container health reporting remains
accurate.

### Run tests in a container (optional)

The provided `Dockerfile` is optimized for production and installs only
production dependencies.

For a containerized test workflow, a separate `Dockerfile.test` is provided.
It installs devDependencies and runs the Jest test suite.

Build the test image:

```bash
docker build -f Dockerfile.test -t training-app-test .
```

Run the tests inside a container:

```bash
docker run --rm training-app-test
```

You can also override the command if needed, for example to run a single test
file:

```bash
docker run --rm training-app-test npm test -- tests/workouts.test.js
```

> Note: Using `Dockerfile.test` is optional and may not be wired into all CI
> environments. If you change the Jest test commands in `package.json`, ensure
> any Docker-based test workflows are updated accordingly.

For most local development workflows, running tests on the host machine is
still the simplest option:

```bash
npm test
```

### Docker build context

The `.dockerignore` file intentionally excludes development-only artifacts such
as `node_modules`, VCS metadata, coverage output, environment files, and also
`README.md` and `jest.config.cjs`.

Excluding `README.md` keeps the production image small and focused on runtime
concerns rather than documentation. Excluding `jest.config.cjs` reflects that
Jest and the test configuration are not needed in the production container.

If you need to run tests or inspect documentation inside a container, prefer
building with `Dockerfile.test` (which includes devDependencies and Jest) or
mount the repository into a throwaway container instead of relying on the
production image.
