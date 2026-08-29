const request = require('supertest');
const { app, _store } = require('../src/app');

// Helper to reset the in-memory store between tests
function resetStore() {
  _store.reset();
}

// NOTE: Tests intentionally codify the current API behavior, including:
// - Strict ISO 8601 date validation (full timestamp with milliseconds and 'Z').
// - 404 responses for any non-integer or non-positive id on GET /workouts/:id.
// - POST /workouts returning only the first validation error, with precedence
//   name -> date -> exercises.

describe('Workouts API', () => {
  beforeEach(() => {
    resetStore();
  });

  describe('GET /workouts', () => {
    it('returns an empty array when there are no workouts', async () => {
      const res = await request(app).get('/workouts');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns all existing workouts', async () => {
      // Seed some workouts directly into the store
      _store.workouts.push(
        {
          id: 1,
          name: 'Morning Routine',
          date: '2024-01-01T07:00:00.000Z',
          exercises: ['Push-ups', 'Sit-ups'],
        },
        {
          id: 2,
          name: 'Evening Cardio',
          date: '2024-01-02T18:30:00.000Z',
          exercises: ['Running'],
        }
      );
      _store.nextId = 3;

      const res = await request(app).get('/workouts');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        {
          id: 1,
          name: 'Morning Routine',
          date: '2024-01-01T07:00:00.000Z',
          exercises: ['Push-ups', 'Sit-ups'],
        },
        {
          id: 2,
          name: 'Evening Cardio',
          date: '2024-01-02T18:30:00.000Z',
          exercises: ['Running'],
        },
      ]);
    });
  });

  describe('GET /workouts/:id', () => {
    it('returns 404 when the id is not a positive integer', async () => {
      const invalidIds = ['abc', '1.5', '0', '-1'];

      for (const id of invalidIds) {
        const res = await request(app).get(`/workouts/${id}`);
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'Workout not found.' });
      }
    });

    it('returns 404 when the workout does not exist', async () => {
      const res = await request(app).get('/workouts/999');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Workout not found.' });
    });

    it('returns the workout when it exists', async () => {
      _store.workouts.push({
        id: 1,
        name: 'Test Workout',
        date: '2024-01-01T10:00:00.000Z',
        exercises: ['Squats'],
      });
      _store.nextId = 2;

      const res = await request(app).get('/workouts/1');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: 1,
        name: 'Test Workout',
        date: '2024-01-01T10:00:00.000Z',
        exercises: ['Squats'],
      });
    });
  });

  describe('POST /workouts', () => {
    it('creates a workout with valid payload', async () => {
      const payload = {
        name: 'Leg Day',
        date: '2024-01-03T09:00:00.000Z',
        exercises: ['Squats', 'Lunges'],
      };

      const res = await request(app).post('/workouts').send(payload);

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: 1,
        ...payload,
      });

      // Ensure it was actually stored
      expect(_store.workouts).toHaveLength(1);
      expect(_store.workouts[0]).toEqual({ id: 1, ...payload });
    });

    it('rejects when name is missing', async () => {
      const payload = {
        date: '2024-01-03T09:00:00.000Z',
        exercises: ['Squats', 'Lunges'],
      };

      const res = await request(app).post('/workouts').send(payload);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Workout name is required and must be a non-empty string.',
      });
    });

    it('rejects when name is empty', async () => {
      const payload = {
        name: '   ',
        date: '2024-01-03T09:00:00.000Z',
        exercises: ['Squats', 'Lunges'],
      };

      const res = await request(app).post('/workouts').send(payload);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Workout name is required and must be a non-empty string.',
      });
    });

    it('rejects when date is missing', async () => {
      const payload = {
        name: 'Leg Day',
        exercises: ['Squats', 'Lunges'],
      };

      const res = await request(app).post('/workouts').send(payload);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Workout date is required and must be a valid ISO 8601 date string.',
      });
    });

    it('rejects when date is invalid', async () => {
      const payload = {
        name: 'Leg Day',
        date: 'not-a-date',
        exercises: ['Squats', 'Lunges'],
      };

      const res = await request(app).post('/workouts').send(payload);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Workout date is required and must be a valid ISO 8601 date string.',
      });
    });

    it('rejects when exercises is missing', async () => {
      const payload = {
        name: 'Leg Day',
        date: '2024-01-03T09:00:00.000Z',
      };

      const res = await request(app).post('/workouts').send(payload);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Exercises must be a non-empty array.',
      });
    });

    it('rejects when exercises is empty', async () => {
      const payload = {
        name: 'Leg Day',
        date: '2024-01-03T09:00:00.000Z',
        exercises: [],
      };

      const res = await request(app).post('/workouts').send(payload);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Exercises must be a non-empty array.',
      });
    });

    it('rejects with date error when both date and exercises are invalid', async () => {
      const payload = {
        name: 'Leg Day',
        date: 'not-a-date',
        // exercises missing
      };

      const res = await request(app).post('/workouts').send(payload);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Workout date is required and must be a valid ISO 8601 date string.',
      });
    });

    it('rejects with exercises error when both name and exercises are invalid', async () => {
      const payload = {
        name: '   ',
        date: '2024-01-03T09:00:00.000Z',
        exercises: [],
      };

      const res = await request(app).post('/workouts').send(payload);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Workout name is required and must be a non-empty string.',
      });
    });
  });
});
