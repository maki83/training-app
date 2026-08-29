const express = require('express');

const app = express();

app.use(express.json());

// In-memory store for workouts
const _store = {
  workouts: [],
  nextWorkoutId: 1,
  reset() {
    this.workouts = [];
    this.nextWorkoutId = 1;
  },
};

// Helper to validate ISO 8601 date-time strings strictly (e.g., 2024-01-01T00:00:00.000Z)
function _isValidISODateString(value) {
  if (typeof value !== 'string') {
    return false;
  }

  // Require full ISO 8601 UTC timestamp with milliseconds and trailing Z
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  if (!isoRegex.test(value)) {
    return false;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return date.toISOString() === value;
}

// Internal validator: returns an array of error messages. Empty array means valid.
function _validateWorkoutPayload(payload) {
  const errors = [];

  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    errors.push('payload must be an object');
    return errors;
  }

  const { name, date, exercises } = payload;

  if (typeof name !== 'string' || name.trim().length === 0) {
    errors.push('name is required and must be a non-empty string');
  }

  if (!_isValidISODateString(date)) {
    errors.push('date is required and must be a valid ISO 8601 date string');
  }

  if (!Array.isArray(exercises) || exercises.length === 0) {
    errors.push('exercises is required and must be a non-empty array');
  } else {
    exercises.forEach((exercise, exerciseIndex) => {
      if (typeof exercise !== 'object' || exercise === null || Array.isArray(exercise)) {
        errors.push(`exercises[${exerciseIndex}] must be an object`);
        return;
      }

      const { name: exerciseName, sets } = exercise;

      if (typeof exerciseName !== 'string' || exerciseName.trim().length === 0) {
        errors.push(`exercises[${exerciseIndex}].name is required and must be a non-empty string`);
      }

      if (!Array.isArray(sets) || sets.length === 0) {
        errors.push(`exercises[${exerciseIndex}].sets is required and must be a non-empty array`);
      } else {
        sets.forEach((set, setIndex) => {
          if (typeof set !== 'object' || set === null || Array.isArray(set)) {
            errors.push(`exercises[${exerciseIndex}].sets[${setIndex}] must be an object`);
            return;
          }

          const { reps, weight } = set;

          if (typeof reps !== 'number' || !Number.isFinite(reps) || reps <= 0) {
            errors.push(`exercises[${exerciseIndex}].sets[${setIndex}].reps is required and must be a positive number`);
          }

          if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0) {
            errors.push(`exercises[${exerciseIndex}].sets[${setIndex}].weight is required and must be a non-negative number`);
          }
        });
      }
    });
  }

  return errors;
}

// Middleware to validate workout payloads for POST /workouts
function validateWorkout(req, res, next) {
  const errors = _validateWorkoutPayload(req.body);

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  return next();
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// List workouts
app.get('/workouts', (req, res) => {
  res.json({ workouts: _store.workouts });
});

// Create workout
app.post('/workouts', validateWorkout, (req, res) => {
  const { name, date, exercises } = req.body;

  const workout = {
    id: _store.nextWorkoutId++,
    name,
    date,
    exercises,
  };

  _store.workouts.push(workout);

  res.status(201).json({ workout });
});

module.exports = { app, _store, _validateWorkoutPayload, _isValidISODateString };
