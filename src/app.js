const express = require('express');

const app = express();

app.use(express.json());

// In-memory data store
const workouts = [];
let nextWorkoutId = 1;

function isValidISODate(value) {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.toISOString().startsWith(value);
}

function validateWorkoutPayload(body) {
  const errors = [];

  if (!body || typeof body !== 'object') {
    errors.push('Body must be a JSON object');
    return errors;
  }

  if (typeof body.name !== 'string' || body.name.trim() === '') {
    errors.push('name is required and must be a non-empty string');
  }

  if (typeof body.date !== 'string' || !isValidISODate(body.date)) {
    errors.push('date is required and must be a valid ISO 8601 date string');
  }

  if (!Array.isArray(body.exercises) || body.exercises.length === 0) {
    errors.push('exercises is required and must be a non-empty array');
  } else {
    body.exercises.forEach((exercise, exerciseIndex) => {
      if (!exercise || typeof exercise !== 'object') {
        errors.push(`exercises[${exerciseIndex}] must be an object`);
        return;
      }

      if (typeof exercise.name !== 'string' || exercise.name.trim() === '') {
        errors.push(`exercises[${exerciseIndex}].name is required and must be a non-empty string`);
      }

      if (!Array.isArray(exercise.sets) || exercise.sets.length === 0) {
        errors.push(`exercises[${exerciseIndex}].sets is required and must be a non-empty array`);
      } else {
        exercise.sets.forEach((set, setIndex) => {
          if (!set || typeof set !== 'object') {
            errors.push(`exercises[${exerciseIndex}].sets[${setIndex}] must be an object`);
            return;
          }

          if (!Number.isInteger(set.reps) || set.reps <= 0) {
            errors.push(`exercises[${exerciseIndex}].sets[${setIndex}].reps must be a positive integer`);
          }

          if (typeof set.weight !== 'number' || !Number.isFinite(set.weight) || set.weight < 0) {
            errors.push(`exercises[${exerciseIndex}].sets[${setIndex}].weight must be a non-negative number`);
          }
        });
      }
    });
  }

  return errors;
}

app.get('/workouts', (req, res) => {
  res.json(workouts);
});

app.post('/workouts', (req, res) => {
  const errors = validateWorkoutPayload(req.body);

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  const workout = {
    id: nextWorkoutId++,
    name: req.body.name.trim(),
    date: req.body.date,
    exercises: req.body.exercises.map((exercise) => ({
      name: exercise.name.trim(),
      sets: exercise.sets.map((set) => ({
        reps: set.reps,
        weight: set.weight
      }))
    }))
  };

  workouts.push(workout);

  return res.status(201).json(workout);
});

// Export app and store for testing
module.exports = {
  app,
  _store: {
    workouts,
    reset() {
      workouts.length = 0;
      nextWorkoutId = 1;
    }
  }
};
