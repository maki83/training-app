const { _validateWorkoutPayload, _isValidISODateString } = require('../src/app');

const basePayload = {
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

describe('_isValidISODateString', () => {
  test('returns true for a valid ISO 8601 date-time string', () => {
    expect(_isValidISODateString('2024-01-01T00:00:00.000Z')).toBe(true);
  });

  test('returns false for a date-only string', () => {
    expect(_isValidISODateString('2024-01-01')).toBe(false);
  });

  test('returns false for a non-date string', () => {
    expect(_isValidISODateString('not-a-date')).toBe(false);
  });
});

describe('_validateWorkoutPayload', () => {
  test('returns empty array for a valid payload', () => {
    const errors = _validateWorkoutPayload(basePayload);
    expect(errors).toEqual([]);
  });

  test('returns error when payload is not an object', () => {
    const errors = _validateWorkoutPayload(null);
    expect(errors).toContain('payload must be an object');
  });

  test('returns error when name is missing', () => {
    const errors = _validateWorkoutPayload({ ...basePayload, name: '' });
    expect(errors).toContain('name is required and must be a non-empty string');
  });

  test('returns error when date is not ISO 8601', () => {
    const errors = _validateWorkoutPayload({ ...basePayload, date: '2024-01-01' });
    expect(errors).toContain('date is required and must be a valid ISO 8601 date string');
  });

  test('returns error when exercises is empty', () => {
    const errors = _validateWorkoutPayload({ ...basePayload, exercises: [] });
    expect(errors).toContain('exercises is required and must be a non-empty array');
  });

  test('returns error when exercise name is empty', () => {
    const payload = {
      ...basePayload,
      exercises: [
        {
          name: '',
          sets: [
            { reps: 5, weight: 100 },
          ],
        },
      ],
    };

    const errors = _validateWorkoutPayload(payload);
    expect(errors).toContain('exercises[0].name is required and must be a non-empty string');
  });

  test('returns error when sets is empty', () => {
    const payload = {
      ...basePayload,
      exercises: [
        {
          name: 'Squat',
          sets: [],
        },
      ],
    };

    const errors = _validateWorkoutPayload(payload);
    expect(errors).toContain('exercises[0].sets is required and must be a non-empty array');
  });

  test('returns error when reps is invalid', () => {
    const payload = {
      ...basePayload,
      exercises: [
        {
          name: 'Squat',
          sets: [
            { reps: 0, weight: 100 },
          ],
        },
      ],
    };

    const errors = _validateWorkoutPayload(payload);
    expect(errors).toContain('exercises[0].sets[0].reps is required and must be a positive number');
  });

  test('returns error when weight is invalid', () => {
    const payload = {
      ...basePayload,
      exercises: [
        {
          name: 'Squat',
          sets: [
            { reps: 5, weight: -1 },
          ],
        },
      ],
    };

    const errors = _validateWorkoutPayload(payload);
    expect(errors).toContain('exercises[0].sets[0].weight is required and must be a non-negative number');
  });
});
