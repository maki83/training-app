const express = require('express');

const app = express();
app.use(express.json());

// In-memory store for workouts (simple training implementation)
const _store = {
  workouts: [],
  nextId: 1,
  reset() {
    this.workouts = [];
    this.nextId = 1;
  },
};

/**
 * Strict ISO 8601 date validation.
 *
 * NOTE: This intentionally requires a full timestamp with milliseconds and a trailing 'Z',
 * e.g. "2024-01-01T10:00:00.000Z". Other ISO 8601 variants (no milliseconds, different
 * timezone offsets, etc.) are rejected to keep behavior deterministic for this training app.
 */
function isValidISODate(value) {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.toISOString().startsWith(value);
}

/**
 * Validate a workout payload.
 *
 * Returns an array of error messages. The API currently returns only the first
 * error (as { error: string }), but we keep the array here to preserve the
 * previous contract shape and make future multi-error responses possible.
 *
 * Validation/precedence order is:
 *   1. name
 *   2. date
 *   3. exercises
 */
function validateWorkoutPayload(payload) {
  const errors = [];

  const { name, date, exercises } = payload || {};

  if (typeof name !== 'string' || name.trim() === '') {
    errors.push('Workout name is required and must be a non-empty string.');
  }

  if (!isValidISODate(date)) {
    errors.push('Workout date is required and must be a valid ISO 8601 date string.');
  }

  if (!Array.isArray(exercises) || exercises.length === 0) {
    errors.push('Exercises must be a non-empty array.');
  }

  return errors;
}

// GET /workouts - list all workouts
app.get('/workouts', (req, res) => {
  res.json(_store.workouts);
});

// GET /workouts/:id - retrieve a single workout by id
//
// NOTE: For this training API, any non-integer or non-positive id is treated as
// "not found" and returns 404 (rather than 400). This is intentional and
// codified by tests.
app.get('/workouts/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(404).json({ error: 'Workout not found.' });
  }

  const workout = _store.workouts.find((w) => w.id === id);

  if (!workout) {
    return res.status(404).json({ error: 'Workout not found.' });
  }

  return res.json(workout);
});

// POST /workouts - create a new workout
app.post('/workouts', (req, res) => {
  const errors = validateWorkoutPayload(req.body);

  if (errors.length > 0) {
    // Preserve previous single-error response shape while using the
    // centralized validator for consistency and potential multi-error use.
    return res.status(400).json({ error: errors[0] });
  }

  const { name, date, exercises } = req.body;

  const newWorkout = {
    id: _store.nextId++,
    name: name.trim(),
    date,
    exercises,
  };

  _store.workouts.push(newWorkout);

  return res.status(201).json(newWorkout);
});

// Expose store for tests without changing the original public API shape.
// External code can import { app, _store } as before.
module.exports = { app, _store };
