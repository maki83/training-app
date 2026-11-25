const { calculateStatistics, normalizeExerciseName, localDateKey } = require('../public/statistics');
const { execFileSync } = require('child_process');
const path = require('path');

const date = (year, month, day, hour = 12) => new Date(year, month - 1, day, hour);
const exercise = (name = 'Squat', sets = [{ reps: 5, weight: 100 }]) => ({ name, sets });
const workout = (time, exercises = [exercise()]) => ({ date: time.toISOString(), exercises });
const calculate = (workouts, now = date(2024, 3, 6), days = 30) => calculateStatistics(workouts, now, days);

function freeze(value) {
  Object.freeze(value);
  Object.values(value).forEach(child => {
    if (child && typeof child === 'object') freeze(child);
  });
  return value;
}

describe('workout statistics', () => {
  test('empty input returns zero totals and exactly 30 chronological local days', () => {
    const result = calculate([]);
    expect(result.totals).toEqual({ workouts: 0, week: 0, month: 0, reps: 0, volume: 0 });
    expect(result.topExercises).toEqual([]);
    expect(result.records).toEqual([]);
    expect(result.activity).toHaveLength(30);
    expect(result.volume).toHaveLength(30);
    expect(result.activity[0]).toEqual({ date: '2024-02-06', workouts: 0 });
    expect(result.activity[29]).toEqual({ date: '2024-03-06', workouts: 0 });
    expect(result.volume.every(day => day.volume === 0)).toBe(true);
    expect(result.hasOverflow).toBe(false);
  });

  test('counts sessions, decimal reps, zero weight and weight times reps across sets', () => {
    const result = calculate([
      workout(date(2024, 3, 4), [exercise('Squat', [{ reps: 2.5, weight: 12.5 }, { reps: 3, weight: 0 }])]),
      workout(date(2024, 3, 6), [exercise(), exercise('Row', [{ reps: 10, weight: 20 }])]),
    ]);
    expect(result.totals).toEqual({ workouts: 2, week: 2, month: 2, reps: 20.5, volume: 731.25 });
    expect(result.activity.at(-1).workouts).toBe(1);
    expect(result.volume.at(-1).volume).toBe(700);
  });

  test('includes reference instant but excludes even later today, future dates and invalid dates', () => {
    const now = date(2024, 3, 6);
    const result = calculate([
      workout(now), workout(new Date(now.getTime() + 1)), workout(date(2024, 4, 1)),
      { date: 'invalid', exercises: [] }, { date: null }, null,
    ], now);
    expect(result.totals.workouts).toBe(1);
    expect(result.totals.volume).toBe(500);
  });

  test('week starts Monday at local midnight, while month starts on the first', () => {
    const result = calculate([
      workout(date(2024, 3, 3, 23)), workout(date(2024, 3, 4, 0)),
      workout(date(2024, 3, 1, 0)), workout(date(2024, 2, 29, 23)),
    ]);
    expect(result.totals).toMatchObject({ workouts: 4, week: 1, month: 3 });
    const sunday = calculate([workout(date(2024, 3, 4, 0))], date(2024, 3, 10));
    expect(sunday.totals.week).toBe(1);
  });

  test('week can span year and month boundaries; leap day is retained', () => {
    expect(calculate([workout(date(2024, 12, 30)), workout(date(2024, 12, 29))], date(2025, 1, 1)).totals)
      .toMatchObject({ workouts: 2, week: 1, month: 0 });
    const result = calculate([], date(2024, 3, 1));
    expect(result.activity.at(-2).date).toBe('2024-02-29');
  });

  test.each([30, 90])('volume period %i includes its first day, excludes the day before, and fills gaps', days => {
    const now = date(2024, 5, 1);
    const first = new Date(now);
    first.setDate(first.getDate() - days + 1);
    first.setHours(0, 0, 0, 0);
    const result = calculate([workout(first), workout(new Date(first.getTime() - 1)), workout(now)], now, days);
    expect(result.volume).toHaveLength(days);
    expect(result.volume[0]).toEqual({ date: localDateKey(first), volume: 500 });
    expect(result.volume.at(-1)).toEqual({ date: '2024-05-01', volume: 500 });
    expect(result.volume.slice(1, -1).every(day => day.volume === 0)).toBe(true);
    expect(result.activity).toHaveLength(30);
    expect(new Set(result.volume.map(day => day.date)).size).toBe(days);
  });

  test('normalizes Unicode, whitespace and case but preserves punctuation and diacritics', () => {
    expect(normalizeExerciseName('  BÄNK\t PRESS  ')).toBe('bänk press');
    expect(normalizeExerciseName('A\u030A')).toBe('å');
    expect(normalizeExerciseName('A-B')).not.toBe(normalizeExerciseName('A B'));
  });

  test('ranks top five by distinct sessions, not occurrences or sets, with deterministic ties', () => {
    const result = calculate([
      workout(date(2024, 3, 1), ['Squat', ' SQUAT ', 'Row', 'Beta', 'Alpha', 'Gamma', 'Delta', '__proto__', 'constructor'].map(name => exercise(name))),
      workout(date(2024, 3, 2), [exercise('row')]),
    ]);
    expect(result.topExercises).toEqual([
      { name: 'row', workouts: 2 }, { name: '__proto__', workouts: 1 },
      { name: 'alpha', workouts: 1 }, { name: 'beta', workouts: 1 }, { name: 'constructor', workouts: 1 },
    ]);
    expect(result.records).toHaveLength(8);
    expect(result.records.find(record => record.name === 'squat')).toMatchObject({ weight: 100, reps: 5 });
  });

  test('weight and repetition records are independent single-set maxima for every exercise', () => {
    const result = calculate([workout(date(2024, 3, 1), [exercise('Squat', [
      { reps: 2, weight: 150 }, { reps: 20, weight: 40 }, { reps: 10, weight: 70 },
    ]), exercise('Push up', [{ reps: 30, weight: 0 }])])]);
    expect(result.records).toEqual([
      { name: 'push up', weight: 0, reps: 30 }, { name: 'squat', weight: 150, reps: 20 },
    ]);
  });

  test('does not mutate frozen input or the reference date', () => {
    const input = freeze([workout(date(2024, 3, 1))]);
    const now = date(2024, 3, 6);
    const before = now.getTime();
    expect(calculate(input, now)).toEqual(calculate(input, now));
    expect(now.getTime()).toBe(before);
  });

  test('ignores invalid sets rather than coercing strings or leaking non-finite values', () => {
    const result = calculate([workout(date(2024, 3, 1), [exercise('X', [
      null, { reps: '5', weight: 10 }, { reps: -1, weight: 10 }, { reps: 2, weight: -1 },
      { reps: Infinity, weight: 1 }, { reps: 1, weight: NaN }, { reps: 1, weight: 0 },
    ])])]);
    expect(result.totals).toMatchObject({ reps: 1, volume: 0 });
  });

  test.each([
    { sets: [{ reps: 2, weight: Number.MAX_VALUE }] },
    { sets: [{ reps: 1, weight: Number.MAX_VALUE }, { reps: 1, weight: Number.MAX_VALUE }] },
  ])('represents product and sum overflow explicitly as null, not a misleading number', ({ sets }) => {
    const result = calculate([workout(date(2024, 3, 6), [exercise('X', sets)])]);
    expect(result.totals.volume).toBeNull();
    expect(result.volume.at(-1).volume).toBeNull();
    expect(result.hasOverflow).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity/);
  });

  test('repetition overflow is reported independently of zero volume', () => {
    const result = calculate([workout(date(2024, 3, 6), [exercise('X', [
      { reps: Number.MAX_VALUE, weight: 0 }, { reps: Number.MAX_VALUE, weight: 0 },
    ])])]);
    expect(result.totals.reps).toBeNull();
    expect(result.totals.volume).toBe(0);
    expect(result.hasOverflow).toBe(true);
  });

  test('overflow in an all-time sum does not hide representable daily values or records', () => {
    const result = calculate([
      workout(date(2024, 3, 5), [exercise('X', [{ reps: 1, weight: Number.MAX_VALUE }])]),
      workout(date(2024, 3, 6), [exercise('X', [{ reps: 1, weight: Number.MAX_VALUE }])]),
    ]);
    expect(result.totals.volume).toBeNull();
    expect(result.volume.at(-2).volume).toBe(Number.MAX_VALUE);
    expect(result.volume.at(-1).volume).toBe(Number.MAX_VALUE);
    expect(result.records).toEqual([{ name: 'x', weight: Number.MAX_VALUE, reps: 1 }]);
  });

  test.each([
    ['Europe/Stockholm', '2024-03-31T22:00:00.000Z'],
    ['America/New_York', '2024-04-01T04:00:00.000Z'],
  ])('week, month and day boundaries use local midnight, not UTC, in %s', (TZ, midnightISO) => {
    const output = execFileSync(process.execPath, ['-e', `
      const { calculateStatistics } = require('./public/statistics');
      const midnight = new Date('${midnightISO}');
      const reference = new Date(midnight.getTime() + 30 * 60 * 1000);
      const workouts = [midnight, new Date(midnight.getTime() - 1)].map(date => ({ date: date.toISOString(), exercises: [] }));
      process.stdout.write(JSON.stringify(calculateStatistics(workouts, reference)));
    `], { cwd: path.join(__dirname, '..'), env: { ...process.env, TZ } });
    const result = JSON.parse(output);
    expect(result.totals).toMatchObject({ workouts: 2, week: 1, month: 1 });
    expect(result.activity.at(-1)).toEqual({ date: '2024-04-01', workouts: 1 });
    expect(result.activity.at(-2)).toEqual({ date: '2024-03-31', workouts: 1 });
  });

  test('rejects invalid reference dates and unsupported periods', () => {
    expect(() => calculate([], new Date(NaN))).toThrow(RangeError);
    expect(() => calculate([], date(2024, 3, 6), 31)).toThrow(RangeError);
  });

  test.each(['Europe/Stockholm', 'America/New_York'])('local calendar survives DST transitions in %s', TZ => {
    // A subprocess is necessary: changing TZ in an active Jest VM does not reliably reset Date's timezone.
    const output = execFileSync(process.execPath, ['-e', `
      const { calculateStatistics } = require('./public/statistics');
      const results = [new Date(2024, 3, 2, 12), new Date(2024, 10, 5, 12)].map(now => {
        const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
        const yesterday = new Date(midnight); yesterday.setDate(yesterday.getDate() - 1);
        return calculateStatistics([{ date: yesterday.toISOString(), exercises: [] }], now, 90);
      });
      process.stdout.write(JSON.stringify(results));
    `], { cwd: path.join(__dirname, '..'), env: { ...process.env, TZ } });
    JSON.parse(output).forEach(result => {
      expect(result.volume).toHaveLength(90);
      expect(new Set(result.volume.map(day => day.date)).size).toBe(90);
      expect(result.activity.at(-2).workouts).toBe(1);
      expect(result.activity.at(-1).workouts).toBe(0);
    });
  });
});
