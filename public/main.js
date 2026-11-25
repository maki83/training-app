const trainingStatistics = typeof module !== 'undefined' && module.exports
  ? require('./statistics') : window.TrainingStatistics;
const initializedApps = new WeakMap();
const numberFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });
const byId = id => document.getElementById(id);
const formatNumber = value => Number.isFinite(value) ? numberFormat.format(value) : 'Too large';

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

async function fetchJSON(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`Request failed with ${response.status}`);
  return response.json();
}

function renderChart(container, series, key, label, unit) {
  container.replaceChildren();
  const maximum = Math.max(...series.map(day => day[key] ?? 0)) || 1;
  container.appendChild(element('p', `Scale: 0–${formatNumber(maximum)} ${unit}`, 'chart-scale muted'));
  const svgNode = (tag, attributes) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, value));
    return node;
  };
  const svg = svgNode('svg', {
    viewBox: '0 0 720 200', role: 'img',
    'aria-label': `${label}, ${series.length} days. Exact daily values are available in the table below.`,
    class: `chart chart-${key}`,
  });
  [0, 100, 198].forEach(y => svg.appendChild(svgNode('line', { x1: 0, x2: 720, y1: y, y2: y, class: 'chart-gridline' })));
  const width = 720 / series.length;
  series.forEach((day, index) => {
    const value = day[key];
    const height = value === null ? 198 : Math.max(2, value / maximum * 198);
    const bar = svgNode('rect', {
      x: index * width + 1, y: 200 - height, width: Math.max(1, width - 2), height,
      rx: 2, class: value === null ? 'chart-overflow' : value === 0 ? 'chart-zero' : 'chart-bar',
    });
    const title = svgNode('title', {});
    title.textContent = `${day.date}: ${formatNumber(value)} ${unit}`;
    bar.appendChild(title);
    svg.appendChild(bar);
  });
  container.appendChild(svg);
  const axis = element('div', undefined, 'chart-axis muted');
  axis.append(element('span', series[0].date), element('span', series.at(-1).date));
  container.appendChild(axis);
  const details = element('details', undefined, 'chart-data');
  details.appendChild(element('summary', `View daily data (${series.length} days)`));
  const scroll = element('div', undefined, 'table-scroll daily-data');
  scroll.tabIndex = 0;
  scroll.setAttribute('role', 'region');
  scroll.setAttribute('aria-label', `${label} daily values, scroll to see all dates`);
  const table = element('table');
  table.appendChild(element('caption', `${label} · ${unit}`));
  const head = element('thead');
  const header = element('tr');
  ['Local date', unit].forEach(text => {
    const cell = element('th', text);
    cell.scope = 'col';
    header.appendChild(cell);
  });
  head.appendChild(header);
  const body = element('tbody');
  series.forEach(day => {
    const row = element('tr');
    const dateCell = element('th', day.date);
    dateCell.scope = 'row';
    row.append(dateCell, element('td', formatNumber(day[key])));
    body.appendChild(row);
  });
  table.append(head, body);
  scroll.appendChild(table);
  details.appendChild(scroll);
  container.appendChild(details);
}

function renderDashboard(workouts, volumeDays) {
  const result = trainingStatistics.calculateStatistics(workouts, new Date(), volumeDays);
  Object.entries(result.totals).forEach(([key, value]) => { byId(`stat-${key}`).textContent = formatNumber(value); });
  byId('dashboard-empty').hidden = result.totals.workouts !== 0;
  byId('statistics-warning').hidden = !result.hasOverflow;
  byId('top-empty').hidden = result.topExercises.length !== 0;
  byId('records-empty').hidden = result.records.length !== 0;
  const top = byId('top-exercises');
  top.replaceChildren();
  result.topExercises.forEach(exercise => {
    const item = element('li');
    item.append(element('span', exercise.name), element('strong', `${formatNumber(exercise.workouts)} ${exercise.workouts === 1 ? 'workout' : 'workouts'}`));
    top.appendChild(item);
  });
  const records = byId('exercise-records');
  records.replaceChildren();
  result.records.forEach(record => {
    const row = element('tr');
    const name = element('th', record.name);
    name.scope = 'row';
    row.append(name, element('td', formatNumber(record.weight)), element('td', formatNumber(record.reps)));
    records.appendChild(row);
  });
  renderChart(byId('activity-chart'), result.activity, 'workouts', 'Training activity', 'workouts');
  renderChart(byId('volume-chart'), result.volume, 'volume', 'Daily training volume', 'kg·reps');
}

function createApp() {
  const state = { status: 'loading', workouts: [], volumeDays: 30, selectedId: null, view: 'dashboard' };
  let requestVersion = 0;

  function renderHistory() {
    const list = byId('workouts-list');
    list.replaceChildren();
    const details = byId('workout-details');
    details.replaceChildren(element('p', 'Select a workout to see details.', 'muted'));
    if (state.status !== 'ready') {
      list.appendChild(element('li', state.status === 'loading' ? 'Loading workouts…' : 'Unable to load history. Try again above.'));
      return;
    }
    if (!state.workouts.length) list.appendChild(element('li', 'No workouts yet', 'muted'));
    [...state.workouts].sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(workout => {
      const item = element('li');
      const button = element('button', `${workout.name} (${new Date(workout.date).toLocaleString()})`);
      button.type = 'button';
      button.dataset.id = workout.id;
      button.setAttribute('aria-pressed', String(workout.id === state.selectedId));
      button.addEventListener('click', () => {
        state.selectedId = workout.id;
        list.querySelectorAll('button').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
        renderWorkoutDetails(workout, details);
      });
      item.appendChild(button);
      list.appendChild(item);
      if (workout.id === state.selectedId) renderWorkoutDetails(workout, details);
    });
  }

  function render() {
    const ready = state.status === 'ready';
    const status = byId('data-status');
    status.hidden = ready;
    status.setAttribute('role', state.status === 'error' ? 'alert' : 'status');
    byId('data-message').textContent = state.status === 'loading' ? 'Loading workouts…' : 'Could not load workouts. Check your connection and try again.';
    byId('retry-load').hidden = state.status !== 'error';
    byId('dashboard-content').hidden = !ready;
    byId('dashboard-view').setAttribute('aria-busy', String(state.status === 'loading'));
    if (ready) renderDashboard(state.workouts, state.volumeDays);
    renderHistory();
  }

  async function loadWorkouts() {
    const version = ++requestVersion;
    const retryFocused = document.activeElement === byId('retry-load');
    state.status = 'loading';
    render();
    try {
      const data = await fetchJSON('/api/workouts');
      if (!Array.isArray(data.workouts)) throw new Error('Invalid workout response');
      if (version !== requestVersion) return;
      state.workouts = data.workouts;
      state.status = 'ready';
    } catch (error) {
      if (version !== requestVersion) return;
      state.status = 'error';
    }
    render();
    if (retryFocused && [document.body, byId('retry-load')].includes(document.activeElement)) {
      byId(state.status === 'ready' ? `${state.view}-heading` : 'retry-load').focus();
    }
  }

  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    state.view = button.dataset.view;
    ['dashboard', 'history'].forEach(view => { byId(`${view}-view`).hidden = view !== state.view; });
    document.querySelectorAll('.view-nav [data-view]').forEach(tab => tab.setAttribute('aria-pressed', String(tab.dataset.view === state.view)));
    document.title = `Training App · ${state.view === 'dashboard' ? 'Dashboard' : 'Workout history'}`;
    if (state.status === 'ready') renderDashboard(state.workouts, state.volumeDays);
    byId(`${state.view}-heading`).focus();
  }));
  byId('volume-period').addEventListener('change', event => {
    state.volumeDays = Number(event.target.value);
    if (state.status === 'ready') renderDashboard(state.workouts, state.volumeDays);
  });
  byId('retry-load').addEventListener('click', loadWorkouts);
  setupForm(loadWorkouts);
  return { loadWorkouts };
}

function renderWorkoutDetails(workout, container) {
  if (!container) return;
  const div = document.createElement('div');
  const title = document.createElement('h4');
  title.textContent = workout.name;
  div.appendChild(title);

  const dateP = document.createElement('p');
  dateP.textContent = new Date(workout.date).toLocaleString();
  div.appendChild(dateP);

  workout.exercises.forEach((exercise) => {
    const exDiv = document.createElement('div');
    const exTitle = document.createElement('h5');
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

function setupForm(onSaved) {
  const form = document.getElementById('workout-form');
  if (!form) return;

  const exercisesContainer = document.getElementById('exercises-container');
  const addExerciseBtn = document.getElementById('add-exercise');
  const errorContainer = document.getElementById('form-errors');

  function renderErrors(errors) {
    if (!errorContainer) return;
    if (!errors || errors.length === 0) {
      errorContainer.textContent = '';
      errorContainer.hidden = true;
      return;
    }
    errorContainer.hidden = false;
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
    nameInput.placeholder = 'Exercise name';
    nameInput.setAttribute('aria-label', 'Exercise name');
    nameInput.required = true;
    exDiv.appendChild(nameInput);

    const setsContainer = document.createElement('div');
    setsContainer.className = 'sets-container';
    exDiv.appendChild(setsContainer);

    const addSetBtn = document.createElement('button');
    addSetBtn.type = 'button';
    addSetBtn.textContent = 'Add set';
    addSetBtn.addEventListener('click', () => {
      const setDiv = document.createElement('div');
      setDiv.className = 'set';

      const repsInput = document.createElement('input');
      repsInput.type = 'number';
      repsInput.name = 'set-reps';
      repsInput.placeholder = 'Reps';
      repsInput.setAttribute('aria-label', 'Repetitions');
      repsInput.min = '0';
      repsInput.step = 'any';
      repsInput.required = true;

      const weightInput = document.createElement('input');
      weightInput.type = 'number';
      weightInput.name = 'set-weight';
      weightInput.placeholder = 'Weight (kg)';
      weightInput.setAttribute('aria-label', 'Weight in kilograms');
      weightInput.min = '0';
      weightInput.step = 'any';
      weightInput.required = true;

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

  let submitting = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitting) return;
    renderErrors([]);
    document.getElementById('form-success').textContent = '';

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

    const date = new Date(dateInput.value);
    if (!Number.isFinite(date.getTime())) {
      renderErrors(['Enter a valid local date and time']);
      return;
    }
    const payload = {
      name: nameInput.value,
      date: date.toISOString(),
      exercises,
    };

    const submitButton = form.querySelector('button[type="submit"]');
    submitting = true;
    submitButton.disabled = true;
    try {
      const res = await fetch('/api/workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.status === 400) {
        const data = await res.json();
        renderErrors(data.errors || ['Validation failed']);
        return;
      }

      if (!res.ok) {
        renderErrors([`Request failed with status ${res.status}`]);
        return;
      }

      form.reset();
      exercisesContainer.replaceChildren();
      addExercise();
      document.getElementById('form-success').textContent = 'Workout saved.';
      await onSaved();
    } catch (err) {
      renderErrors(['Failed to submit workout']);
    } finally {
      submitting = false;
      submitButton.disabled = false;
    }
  });

  addExercise();
}

function initFrontend() {
  if (typeof document === 'undefined') return;
  const root = byId('app');
  if (!root) {
    document.addEventListener('DOMContentLoaded', initFrontend, { once: true });
    return;
  }
  if (initializedApps.has(root)) return initializedApps.get(root);
  const app = createApp();
  const ready = app.loadWorkouts();
  initializedApps.set(root, ready);
  return ready;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initFrontend };
} else {
  window.__trainingApp = { initFrontend };
  initFrontend();
}
