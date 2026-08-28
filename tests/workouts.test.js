const request = require('supertest');
const { app, _store } = require('../src/app');

function validWorkoutPayload(overrides = {}) {
  return {
    name: 'Leg Day',
    date: '2024-01-01T10:00:00.000Z',
    exercises: [
      {
        name: 'Squat',
        sets: [
          { reps: 5, weight: 100 },
          { reps: 5, weight: 110 }
        ]
      }
    ],
    ...overrides
  };
}

beforeEach(() => {
  _store.reset();
});

describe('GET /workouts', () => {
  test('returns empty array when no workouts exist', async () => {
    const res = await request(app).get('/workouts');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('returns existing workouts', async () => {
    await request(app).post('/workouts').send(validWorkoutPayload());

    const res = await request(app).get('/workouts');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0]).toMatchObject({
      id: 1,
      name: 'Leg Day'
    });
  });
});

describe('POST /workouts', () => {
  test('creates a workout with valid payload', async () => {
    const payload = validWorkoutPayload();

    const res = await request(app).post('/workouts').send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: 1,
      name: payload.name,
      date: payload.date
    });
    expect(res.body.exercises).toHaveLength(1);
    expect(res.body.exercises[0]).toMatchObject({
      name: 'Squat'
    });
    expect(res.body.exercises[0].sets).toHaveLength(2);
  });

  test('trims workout and exercise names', async () => {
    const payload = validWorkoutPayload({
      name: '  Leg Day  ',
      exercises: [
        {
          name: '  Squat  ',
          sets: [{ reps: 5, weight: 100 }]
        }
      ]
    });

    const res = await request(app).post('/workouts').send(payload);

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Leg Day');
    expect(res.body.exercises[0].name).toBe('Squat');
  });

  test('returns 400 when body is missing', async () => {
    const res = await request(app).post('/workouts');

    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  test('returns 400 for invalid name', async () => {
    const payload = validWorkoutPayload({ name: '   ' });

    const res = await request(app).post('/workouts').send(payload);

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        'name is required and must be a non-empty string'
      ])
    );
  });

  test('returns 400 for invalid date', async () => {
    const payload = validWorkoutPayload({ date: 'not-a-date' });

    const res = await request(app).post('/workouts').send(payload);

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        'date is required and must be a valid ISO 8601 date string'
      ])
    );
  });

  test('returns 400 when exercises is empty', async () => {
    const payload = validWorkoutPayload({ exercises: [] });

    const res = await request(app).post('/workouts').send(payload);

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        'exercises is required and must be a non-empty array'
      ])
    );
  });

  test('returns 400 when exercise name is invalid', async () => {
    const payload = validWorkoutPayload({
      exercises: [
        {
          name: '   ',
          sets: [{ reps: 5, weight: 100 }]
        }
      ]
    });

    const res = await request(app).post('/workouts').send(payload);

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        'exercises[0].name is required and must be a non-empty string'
      ])
    );
  });

  test('returns 400 when sets is empty', async () => {
    const payload = validWorkoutPayload({
      exercises: [
        {
          name: 'Squat',
          sets: []
        }
      ]
    });

    const res = await request(app).post('/workouts').send(payload);

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        'exercises[0].sets is required and must be a non-empty array'
      ])
    );
  });

  test('returns 400 when reps is not a positive integer', async () => {
    const payload = validWorkoutPayload({
      exercises: [
        {
          name: 'Squat',
          sets: [{ reps: 0, weight: 100 }]
        }
      ]
    });

    const res = await request(app).post('/workouts').send(payload);

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        'exercises[0].sets[0].reps must be a positive integer'
      ])
    );
  });

  test('returns 400 when weight is negative', async () => {
    const payload = validWorkoutPayload({
      exercises: [
        {
          name: 'Squat',
          sets: [{ reps: 5, weight: -10 }]
        }
      ]
    });

    const res = await request(app).post('/workouts').send(payload);

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        'exercises[0].sets[0].weight must be a non-negative number'
      ])
    );
  });

  test('assigns incremental ids to workouts', async () => {
    const payload = validWorkoutPayload();

    const res1 = await request(app).post('/workouts').send(payload);
    const res2 = await request(app).post('/workouts').send(payload);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(res1.body.id).toBe(1);
    expect(res2.body.id).toBe(2);
  });
});
