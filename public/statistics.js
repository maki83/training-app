(function () {
  function localDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function normalizeExerciseName(name) {
    return typeof name === 'string' ? name.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase() : '';
  }

  function calculateStatistics(workouts, reference, volumeDays = 30) {
    const now = new Date(reference);
    if (!Number.isFinite(now.getTime()) || ![30, 90].includes(volumeDays)) {
      throw new RangeError('A valid reference date and a 30- or 90-day period are required');
    }
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - (today.getDay() + 6) % 7);
    const monthStart = new Date(today);
    monthStart.setDate(1);

    const daily = new Map();
    for (let offset = volumeDays - 1; offset >= 0; offset -= 1) {
      const day = new Date(today);
      // Calendar arithmetic preserves local dates across 23- and 25-hour DST days.
      day.setDate(today.getDate() - offset);
      daily.set(localDateKey(day), { date: localDateKey(day), workouts: 0, volume: 0 });
    }
    const totals = { workouts: 0, week: 0, month: 0, reps: 0, volume: 0 };
    const exercises = new Map();
    let hasOverflow = false;
    function finite(value) {
      if (Number.isFinite(value)) return value;
      hasOverflow = true;
      return null;
    }
    function add(left, right) {
      // null propagates an unrepresentable sum instead of turning it into a plausible zero.
      return left === null || right === null ? null : finite(left + right);
    }

    for (const workout of Array.isArray(workouts) ? workouts : []) {
      if (!workout || typeof workout.date !== 'string') continue;
      const time = new Date(workout.date);
      if (!Number.isFinite(time.getTime()) || time > now) continue;
      totals.workouts += 1;
      if (time >= weekStart) totals.week += 1;
      if (time >= monthStart) totals.month += 1;
      const day = daily.get(localDateKey(time));
      if (day) day.workouts += 1;
      const seen = new Set();
      for (const exercise of Array.isArray(workout.exercises) ? workout.exercises : []) {
        if (!exercise) continue;
        const name = normalizeExerciseName(exercise.name);
        if (!name) continue;
        if (!exercises.has(name)) exercises.set(name, { name, workouts: 0, weight: 0, reps: 0 });
        const record = exercises.get(name);
        if (!seen.has(name)) {
          record.workouts += 1;
          seen.add(name);
        }
        for (const set of Array.isArray(exercise.sets) ? exercise.sets : []) {
          if (!set || !Number.isFinite(set.reps) || set.reps <= 0 || !Number.isFinite(set.weight) || set.weight < 0) continue;
          const volume = finite(set.weight * set.reps);
          totals.reps = add(totals.reps, set.reps);
          totals.volume = add(totals.volume, volume);
          if (day) day.volume = add(day.volume, volume);
          record.weight = Math.max(record.weight, set.weight);
          record.reps = Math.max(record.reps, set.reps);
        }
      }
    }
    const compareNames = (a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    const allExercises = [...exercises.values()];
    return {
      totals,
      topExercises: [...allExercises].sort((a, b) => b.workouts - a.workouts || compareNames(a, b))
        .slice(0, 5).map(({ name, workouts }) => ({ name, workouts })),
      records: allExercises.sort(compareNames).map(({ name, weight, reps }) => ({ name, weight, reps })),
      activity: [...daily.values()].slice(-30).map(({ date, workouts }) => ({ date, workouts })),
      volume: [...daily.values()].map(({ date, volume }) => ({ date, volume })),
      hasOverflow,
    };
  }

  const statistics = { calculateStatistics, normalizeExerciseName, localDateKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = statistics;
  else window.TrainingStatistics = statistics;
}());
