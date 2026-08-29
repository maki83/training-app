const request = require('supertest');
const { app, _store } = require('../src/app');

beforeEach(() => {
  _store.reset();
});

describe('GET /workouts', () => {
  test('returns empty list initially', async () => {
    const res = await request(app).get('/workouts');

    expect(res.status).toBe(200);
    expect(res.body.workouts).toEqual([]);
  });
});

describe('POST /workouts', () => {
  const validPayload = {
    name: 'Leg day',
    date: '2024-01-01T00:00:00.000Z',
    exercises: [
      {
        name: 'Squat',
        sets: [
          { reps: 5, weight: 100 },
        ],
      },
    ],
  };

  test('creates a workout with valid payload', async () => {
    const res = await request(app).post('/workouts').send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body.workout).toBeDefined();
    expect(res.body.workout.id).toBe(1);
    expect(res.body.workout.name).toBe(validPayload.name);
    expect(res.body.workout.date).toBe(validPayload.date);
    expect(res.body.workout.exercises).toEqual(validPayload.exercises);
  });

  test('returns 400 when body is missing', async () => {
    const res = await request(app).post('/workouts');

    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  test('returns validation errors for invalid payload', async () => {
    const invalidPayload = {
      ...validPayload,
      name: '',
      date: '2024-01-01',
      exercises: [],
    };

    const res = await request(app).post('/workouts').send(invalidPayload);

    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        'name is required and must be a non-empty string',
        'date is required and must be a valid ISO 8601 date string',
        'exercises is required and must be a non-empty array',
      ]),
    );
  });
});
