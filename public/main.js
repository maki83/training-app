let workouts = [];
let workoutStatus = 'loading';
let currentMonth;
let selectedDay;
let initialization;

function toLocalDateKey(value) {
  const date = new Date(value);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')].join('-');
}

function shiftMonth(month, offset) {
  return new Date(month.getFullYear(), month.getMonth() + offset, 1);
}

function getMonthDays(month) {
  const first = shiftMonth(month, 0);
  const days = Array((first.getDay() + 6) % 7).fill(null);
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  for (let day = 1; day <= count; day += 1) {
    days.push(new Date(month.getFullYear(), month.getMonth(), day));
  }
  while (days.length % 7) days.push(null);
  return days;
}

function getMonthSummary(history, month) {
  const days = new Map();
  let count = 0;
  let volume = 0;
  history.forEach(workout => {
    const date = new Date(workout.date);
    if (date.getFullYear() !== month.getFullYear() || date.getMonth() !== month.getMonth()) return;
    const key = toLocalDateKey(date);
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(workout);
    count += 1;
    workout.exercises.forEach(exercise => {
      exercise.sets.forEach(set => { volume += set.reps * set.weight; });
    });
  });
  days.forEach(day => day.sort((a, b) => new Date(a.date) - new Date(b.date)));
  return { days, count, volume };
}

function renderDayWorkouts(summary) {
  const container = document.getElementById('day-workouts');
  const date = selectedDay.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('selected-day-title').textContent = `Träningspass ${date}`;
  container.replaceChildren();
  if (workoutStatus !== 'ready') {
    container.textContent = workoutStatus === 'loading' ? 'Laddar träningspass…' : 'Historiken kunde inte laddas.';
    return;
  }
  const dayWorkouts = summary.days.get(toLocalDateKey(selectedDay)) || [];
  if (dayWorkouts.length === 0) {
    container.textContent = 'Inga träningspass denna dag.';
    return;
  }
  dayWorkouts.forEach(workout => {
    const card = document.createElement('article');
    card.className = 'workout-card';
    renderWorkoutDetails(workout, card);
    container.appendChild(card);
  });
}

function renderCalendar() {
  const body = document.getElementById('calendar-days');
  if (!body || !currentMonth) return;
  const summary = getMonthSummary(workouts, currentMonth);
  const ready = workoutStatus === 'ready';
  document.getElementById('calendar-title').textContent = currentMonth.toLocaleDateString('sv-SE', {
    month: 'long', year: 'numeric',
  });
  document.getElementById('month-count').textContent = ready ? String(summary.count) : '—';
  document.getElementById('month-volume').textContent = ready
    ? summary.volume.toLocaleString('sv-SE', { maximumFractionDigits: 2 }) : '—';
  const status = document.getElementById('calendar-status');
  status.classList.toggle('error', workoutStatus === 'error');
  status.textContent = workoutStatus === 'loading' ? 'Laddar träningshistorik…'
    : workoutStatus === 'error' ? 'Kunde inte ladda träningshistoriken. Försök igen.'
      : summary.count === 0 ? 'Inga träningspass denna månad.' : `${summary.count} träningspass denna månad.`;
  document.getElementById('calendar-retry').hidden = workoutStatus !== 'error';
  document.getElementById('calendar-table').setAttribute('aria-busy', String(workoutStatus === 'loading'));

  const today = toLocalDateKey(new Date());
  body.replaceChildren();
  let row;
  getMonthDays(currentMonth).forEach((date, index) => {
    if (index % 7 === 0) {
      row = document.createElement('tr');
      body.appendChild(row);
    }
    const cell = document.createElement('td');
    row.appendChild(cell);
    if (!date) return;
    const key = toLocalDateKey(date);
    const count = (summary.days.get(key) || []).length;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'calendar-day';
    button.dataset.date = key;
    button.classList.toggle('has-workouts', count > 0);
    button.setAttribute('aria-pressed', String(key === toLocalDateKey(selectedDay)));
    if (key === today) button.setAttribute('aria-current', 'date');
    const label = date.toLocaleDateString('sv-SE', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    button.setAttribute('aria-label', `${label}${key === today ? ', idag' : ''}${ready ? `, ${count} pass` : ''}`);
    const number = document.createElement('span');
    number.textContent = date.getDate();
    button.appendChild(number);
    const marker = document.createElement('span');
    marker.className = 'day-marker';
    marker.textContent = count ? `${count} pass` : '\u00a0';
    button.appendChild(marker);
    button.addEventListener('click', () => {
      selectedDay = date;
      renderCalendar();
      document.querySelector(`[data-date="${key}"]`).focus();
    });
    cell.appendChild(button);
  });
  renderDayWorkouts(summary);
}

function setupCalendar() {
  [['previous-month', -1], ['next-month', 1]].forEach(([id, offset]) => {
    document.getElementById(id).addEventListener('click', () => {
      currentMonth = shiftMonth(currentMonth, offset);
      selectedDay = new Date(currentMonth);
      renderCalendar();
    });
  });
  document.getElementById('calendar-retry').addEventListener('click', loadWorkouts);
}

function setupNavigation() {
  ['workouts', 'calendar'].forEach(view => {
    document.getElementById(`nav-${view}`).addEventListener('click', () => {
      ['workouts', 'calendar'].forEach(name => {
        document.getElementById(`${name}-view`).hidden = name !== view;
        const button = document.getElementById(`nav-${name}`);
        if (name === view) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
      });
    });
  });
}

async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Request failed with ${res.status}: ${text}`);
  }
  return res.json();
}

async function loadWorkouts() {
  const listEl = document.getElementById('workouts-list');
  const detailsEl = document.getElementById('workout-details');
  if (!listEl) return;
  workoutStatus = 'loading';
  workouts = [];
  listEl.textContent = 'Laddar…';
  detailsEl.textContent = 'Välj ett träningspass för att se detaljer.';
  renderCalendar();
  try {
    const data = await fetchJSON('/api/workouts');
    workouts = data.workouts || [];
    workoutStatus = 'ready';
    listEl.replaceChildren();
    if (workouts.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'Inga träningspass ännu.';
      listEl.appendChild(li);
    }
    workouts.forEach(workout => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${workout.name} (${new Date(workout.date).toLocaleDateString('sv-SE')})`;
      li.dataset.id = workout.id;
      button.addEventListener('click', () => renderWorkoutDetails(workout, detailsEl));
      li.appendChild(button);
      listEl.appendChild(li);
    });
  } catch (err) {
    workouts = [];
    workoutStatus = 'error';
    listEl.innerHTML = '<li class="error">Kunde inte ladda träningspassen.</li>';
  }
  renderCalendar();
}

function renderWorkoutDetails(workout, container) {
  if (!container) return;
  const div = document.createElement('div');
  const title = document.createElement('h3');
  title.textContent = workout.name;
  div.appendChild(title);

  const dateP = document.createElement('p');
  dateP.textContent = new Date(workout.date).toLocaleString('sv-SE');
  div.appendChild(dateP);

  workout.exercises.forEach((exercise) => {
    const exDiv = document.createElement('div');
    const exTitle = document.createElement('h4');
    exTitle.textContent = exercise.name;
    exDiv.appendChild(exTitle);

    const ul = document.createElement('ul');
    exercise.sets.forEach((set) => {
      const li = document.createElement('li');
      li.textContent = `${set.reps} reps @ ${set.weight} kg`;
      ul.appendChild(li);
    });
    exDiv.appendChild(ul);
    div.appendChild(exDiv);
  });

  container.innerHTML = '';
  container.appendChild(div);
}

function setupForm() {
  const form = document.getElementById('workout-form');
  if (!form) return;

  const exercisesContainer = document.getElementById('exercises-container');
  const addExerciseBtn = document.getElementById('add-exercise');
  const errorContainer = document.getElementById('form-errors');

  function renderErrors(errors) {
    if (!errorContainer) return;
    if (!errors || errors.length === 0) {
      errorContainer.textContent = '';
      errorContainer.classList.add('hidden');
      return;
    }
    errorContainer.classList.remove('hidden');
    errorContainer.innerHTML = '';
    const ul = document.createElement('ul');
    errors.forEach((err) => {
      const li = document.createElement('li');
      li.textContent = err;
      ul.appendChild(li);
    });
    errorContainer.appendChild(ul);
  }

  function addExercise() {
    const exDiv = document.createElement('div');
    exDiv.className = 'exercise';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.name = 'exercise-name';
    nameInput.placeholder = 'Övningens namn';
    nameInput.setAttribute('aria-label', 'Övningens namn');
    exDiv.appendChild(nameInput);

    const setsContainer = document.createElement('div');
    setsContainer.className = 'sets-container';
    exDiv.appendChild(setsContainer);

    const addSetBtn = document.createElement('button');
    addSetBtn.type = 'button';
    addSetBtn.textContent = 'Lägg till set';
    addSetBtn.addEventListener('click', () => {
      const setDiv = document.createElement('div');
      setDiv.className = 'set';

      const repsInput = document.createElement('input');
      repsInput.type = 'number';
      repsInput.name = 'set-reps';
      repsInput.placeholder = 'Repetitioner';
      repsInput.setAttribute('aria-label', 'Repetitioner');
      repsInput.min = '0';
      repsInput.step = 'any';

      const weightInput = document.createElement('input');
      weightInput.type = 'number';
      weightInput.name = 'set-weight';
      weightInput.placeholder = 'Vikt (kg)';
      weightInput.setAttribute('aria-label', 'Vikt (kg)');
      weightInput.min = '0';
      weightInput.step = 'any';

      setDiv.appendChild(repsInput);
      setDiv.appendChild(weightInput);
      setsContainer.appendChild(setDiv);
    });

    exDiv.appendChild(addSetBtn);
    exercisesContainer.appendChild(exDiv);
  }

  if (addExerciseBtn) {
    addExerciseBtn.addEventListener('click', () => {
      addExercise();
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    renderErrors([]);

    const nameInput = document.getElementById('workout-name');
    const dateInput = document.getElementById('workout-date');

    const exercises = [];
    const exerciseEls = exercisesContainer.querySelectorAll('.exercise');
    exerciseEls.forEach((exEl) => {
      const exNameInput = exEl.querySelector('input[name="exercise-name"]');
      const sets = [];
      const setEls = exEl.querySelectorAll('.set');
      setEls.forEach((setEl) => {
        const repsInput = setEl.querySelector('input[name="set-reps"]');
        const weightInput = setEl.querySelector('input[name="set-weight"]');
        sets.push({
          reps: Number(repsInput.value),
          weight: Number(weightInput.value),
        });
      });
      exercises.push({
        name: exNameInput.value,
        sets,
      });
    });

    try {
      const payload = {
        name: nameInput.value,
        date: new Date(dateInput.value).toISOString(),
        exercises,
      };
      const res = await fetch('/api/workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.status === 400) {
        const data = await res.json();
        renderErrors(data.errors || ['Valideringen misslyckades']);
        return;
      }

      if (!res.ok) {
        renderErrors([`Anropet misslyckades med status ${res.status}`]);
        return;
      }

      await loadWorkouts();
      form.reset();
      exercisesContainer.innerHTML = '';
    } catch (err) {
      renderErrors(['Kunde inte spara träningspasset']);
    }
  });

  // Start with one empty exercise by default
  addExercise();
}

function initFrontend() {
  if (typeof document === 'undefined') return Promise.resolve();
  if (initialization) return initialization;
  const today = new Date();
  currentMonth = shiftMonth(today, 0);
  selectedDay = today;
  setupNavigation();
  setupCalendar();
  setupForm();
  initialization = loadWorkouts();
  return initialization;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initFrontend, loadWorkouts, toLocalDateKey, shiftMonth, getMonthDays, getMonthSummary,
  };
} else {
  initFrontend();
}
