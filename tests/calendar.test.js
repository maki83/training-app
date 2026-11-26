const { execFileSync } = require('child_process');
const {
  toLocalDateKey,
  shiftMonth,
  getMonthDays,
  getMonthSummary,
} = require('../public/main');

const workout = (date, exercises = []) => ({ date: date.toISOString(), exercises });

describe('calendar calculations', () => {
  test('uses local date components rather than the UTC date', () => {
    const local = new Date(2024, 1, 29, 23, 45);
    expect(toLocalDateKey(local)).toBe('2024-02-29');
    expect(toLocalDateKey(local.toISOString())).toBe('2024-02-29');
  });

  test.each([
    [2024, 1, 29, 3],
    [2023, 1, 28, 2],
    [2024, 8, 30, 6],
    [2024, 0, 31, 0],
  ])('builds Monday-first complete weeks for %i/%i', (year, month, count, padding) => {
    const days = getMonthDays(new Date(year, month, 1));
    expect(days.length % 7).toBe(0);
    expect(days.slice(0, padding)).toEqual(Array(padding).fill(null));
    const dates = days.filter(Boolean);
    expect(dates).toHaveLength(count);
    expect(dates[0].getDate()).toBe(1);
    expect(dates[count - 1].getDate()).toBe(count);
    expect(dates.every(day => day.getMonth() === month)).toBe(true);
  });

  test('moves by calendar months across year and short-month boundaries without mutating input', () => {
    const december = new Date(2024, 11, 31);
    expect(toLocalDateKey(shiftMonth(december, 1))).toBe('2025-01-01');
    expect(toLocalDateKey(shiftMonth(new Date(2025, 0, 31), -1))).toBe('2024-12-01');
    expect(toLocalDateKey(shiftMonth(new Date(2024, 0, 31), 1))).toBe('2024-02-01');
    expect(december.getDate()).toBe(31);
  });

  test('counts workouts, groups multiple workouts chronologically and sums all sets only in the month', () => {
    const morning = workout(new Date(2024, 1, 29, 8), [
      { sets: [{ reps: 5, weight: 100 }, { reps: 2.5, weight: 12.5 }] },
      { sets: [{ reps: 8, weight: 0 }, { reps: 3, weight: 20 }] },
    ]);
    const evening = workout(new Date(2024, 1, 29, 18), [{ sets: [{ reps: 10, weight: 0.1 }] }]);
    const otherDay = workout(new Date(2024, 1, 1, 12));
    const outside = workout(new Date(2024, 2, 1), [{ sets: [{ reps: 100, weight: 100 }] }]);
    const summary = getMonthSummary([evening, outside, morning, otherDay], new Date(2024, 1, 1));
    expect(summary.count).toBe(3);
    expect(summary.volume).toBeCloseTo(592.25);
    expect(summary.days.size).toBe(2);
    expect(summary.days.get('2024-02-29')).toEqual([morning, evening]);
    expect(getMonthSummary([morning], new Date(2025, 1, 1))).toEqual({
      count: 0, volume: 0, days: new Map(),
    });
    expect(getMonthSummary([], new Date(2024, 1, 1))).toEqual({
      count: 0, volume: 0, days: new Map(),
    });
  });
});

describe.each([
  ['UTC', ['2024-03-31', '2024-03-01', '2024-03-10', '2024-03-10', '2024-10-27', '2024-10-27', '2024-11-03', '2024-11-03'], 4],
  ['Europe/Stockholm', ['2024-04-01', '2024-03-01', '2024-03-10', '2024-03-10', '2024-10-27', '2024-10-27', '2024-11-03', '2024-11-03'], 3],
  ['America/Los_Angeles', ['2024-03-31', '2024-02-29', '2024-03-10', '2024-03-10', '2024-10-26', '2024-10-26', '2024-11-03', '2024-11-03'], 3],
])('local calendar dates in %s', (timezone, keys, marchCount) => {
  test('handles UTC midnight, month boundaries and both DST transitions using the actual timezone', () => {
    const script = `
      const { toLocalDateKey, getMonthSummary } = require('./public/main');
      const dates = [
        '2024-03-31T23:30:00.000Z', '2024-03-01T00:30:00.000Z',
        '2024-03-10T09:30:00.000Z', '2024-03-10T10:30:00.000Z',
        '2024-10-27T00:30:00.000Z', '2024-10-27T01:30:00.000Z',
        '2024-11-03T08:30:00.000Z', '2024-11-03T09:30:00.000Z',
      ];
      const workouts = dates.map(date => ({ date, exercises: [{ sets: [{ reps: 2, weight: 12.5 }] }] }));
      const summary = getMonthSummary(workouts, new Date(2024, 2, 1));
      console.log(JSON.stringify({ keys: dates.map(toLocalDateKey), count: summary.count, volume: summary.volume }));
    `;
    const actual = JSON.parse(execFileSync(process.execPath, ['-e', script], {
      cwd: require('path').join(__dirname, '..'),
      env: { ...process.env, TZ: timezone },
      encoding: 'utf8',
    }));
    expect(actual).toEqual({ keys, count: marchCount, volume: marchCount * 25 });
  });
});
