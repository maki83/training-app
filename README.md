# training-app

Workout tracking API MVP

## Local development

Install dependencies:

```bash
npm install
```

Run the application locally:

```bash
npm start
```

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

## Configuration

The API currently does not require any mandatory environment variables.
The following variables are recognized and can be overridden for production:

- `PORT` (default: `3000`) – HTTP port the server listens on.
- `NODE_ENV` (default: `development` locally, `production` in the container) – Node environment flag.

If you introduce new configuration in the future (e.g., database URLs, API keys),
ensure they are documented here and validated at startup.

## Containerized deployment

This project includes a production-ready Docker setup using Node.js 20 Alpine.

### Build and run with Docker Compose

From the project root:

```bash
# Build the image and start the service in the background
docker compose up -d --build
```

The API will be available on:

- http://localhost:3000

To view logs:

```bash
docker compose logs -f training-app
```

To stop the container:

```bash
docker compose down
```

The service definition does **not** use a fixed `container_name`, so Docker is
free to generate unique container names. This makes it easier to run multiple
instances (e.g., in CI or on different projects) without name collisions.

The container exposes port `3000` and sets `NODE_ENV=production` by default.

A basic HTTP healthcheck is configured in `docker-compose.yml` against
`http://localhost:3000/health`. The `/health` endpoint is part of the public
API surface for operations and is covered by automated tests. If you change the
path or semantics of this endpoint in the future, be sure to update the
`healthcheck` configuration in `docker-compose.yml` accordingly so that
container health reporting remains accurate.

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
