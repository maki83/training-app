const { once } = require('events');
const request = require('supertest');
const { app, _store } = require('../src/app');

const validPayload = {
  name: 'Leg day',
  date: '2024-01-01T00:00:00.000Z',
  exercises: [
    {
      name: 'Squat',
      sets: [{ reps: 5, weight: 100 }],
    },
  ],
};

describe('frontend API proxy with a real backend', () => {
  let backend;
  let frontend;

  beforeAll(async () => {
    backend = app.listen(0, '127.0.0.1');
    await once(backend, 'listening');

    const originalBackendUrl = process.env.BACKEND_URL;
    process.env.BACKEND_URL = `http://127.0.0.1:${backend.address().port}`;
    try {
      // The frontend reads BACKEND_URL when its module is loaded.
      frontend = require('../src/frontend-server');
    } finally {
      if (originalBackendUrl === undefined) {
        delete process.env.BACKEND_URL;
      } else {
        process.env.BACKEND_URL = originalBackendUrl;
      }
    }
  });

  beforeEach(() => {
    _store.reset();
  });

  afterAll(async () => {
    if (backend && backend.listening) {
      await new Promise((resolve, reject) => {
        backend.close(error => (error ? reject(error) : resolve()));
      });
    }
  });

  test.each([
    ['/', 'text/html', 'Training overview'],
    ['/statistics.js', 'javascript', 'calculateStatistics'],
    ['/main.js', 'javascript', 'initFrontend'],
    ['/styles.css', 'text/css', '.stats-grid'],
  ])('serves dashboard resource %s without a server change', async (url, contentType, expected) => {
    const res = await request(frontend).get(url).timeout(2000);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain(contentType);
    expect(res.text).toContain(expected);
  });

  test('GET /api/health reaches the backend with the /api prefix removed', async () => {
    const res = await request(frontend).get('/api/health').timeout(2000);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  test('GET /api/workouts returns the backend workout list', async () => {
    const res = await request(frontend).get('/api/workouts').timeout(2000);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ workouts: [] });
  });

  test('POST /api/workouts forwards JSON and persists a valid workout', async () => {
    const created = await request(frontend)
      .post('/api/workouts')
      .send(validPayload)
      .timeout(2000);

    expect(created.status).toBe(201);
    expect(created.body).toEqual({ workout: { id: 1, ...validPayload } });

    const listed = await request(frontend).get('/api/workouts').timeout(2000);
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual({ workouts: [created.body.workout] });
  });

  test('POST /api/workouts preserves validation errors without storing invalid data', async () => {
    const res = await request(frontend)
      .post('/api/workouts')
      .send({ ...validPayload, name: '', date: '2024-01-01', exercises: [] })
      .timeout(2000);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      errors: [
        'name is required and must be a non-empty string',
        'date is required and must be a valid ISO 8601 date string',
        'exercises is required and must be a non-empty array',
      ],
    });

    const listed = await request(frontend).get('/api/workouts').timeout(2000);
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual({ workouts: [] });
  });
});
