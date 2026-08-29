// Frontend logic for the training app
// This file is used both in the browser and under Jest/jsdom tests.
// To keep tests deterministic, we avoid side effects on import and instead
// expose an explicit initFrontend() function.

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

  if (!listEl) return; // allow tests to control DOM

  listEl.innerHTML = 'Loading...';
  detailsEl.innerHTML = '';

  try {
    const data = await fetchJSON('/api/workouts');
    const workouts = data.workouts || [];

    if (workouts.length === 0) {
      listEl.innerHTML = '<li>No workouts yet</li>';
      return;
    }

    listEl.innerHTML = '';
    workouts.forEach((workout) => {
      const li = document.createElement('li');
      li.textContent = `${workout.name} (${new Date(workout.date).toLocaleDateString()})`;
      li.dataset.id = workout.id;
      li.addEventListener('click', () => {
        renderWorkoutDetails(workout, detailsEl);
      });
      listEl.appendChild(li);
    });
  } catch (err) {
    listEl.innerHTML = '<li class="error">Failed to load workouts</li>';
  }
}

function renderWorkoutDetails(workout, container) {
  if (!container) return;
  const div = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = workout.name;
  div.appendChild(title);

  const dateP = document.createElement('p');
  dateP.textContent = new Date(workout.date).toLocaleString();
  div.appendChild(dateP);

  workout.exercises.forEach((exercise) => {
    const exDiv = document.createElement('div');
    const exTitle = document.createElement('h3');
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
    nameInput.placeholder = 'Exercise name';
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

      const weightInput = document.createElement('input');
      weightInput.type = 'number';
      weightInput.name = 'set-weight';
      weightInput.placeholder = 'Weight';

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

    const payload = {
      name: nameInput.value,
      date: new Date(dateInput.value).toISOString(),
      exercises,
    };

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

      // Success: reload workouts list
      await loadWorkouts();
      form.reset();
      exercisesContainer.innerHTML = '';
    } catch (err) {
      renderErrors(['Failed to submit workout']);
    }
  });

  // Start with one empty exercise by default
  addExercise();
}

function initFrontend() {
  if (typeof document === 'undefined') return;

  const run = () => {
    loadWorkouts();
    setupForm();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
}

// In the real browser, initialize immediately.
if (typeof window !== 'undefined') {
  initFrontend();
  // Expose a tiny hook for tests if they need it.
  window.__trainingApp = window.__trainingApp || {};
  window.__trainingApp.initFrontend = initFrontend;
}

// CommonJS export for Jest/jsdom tests
if (typeof module !== 'undefined') {
  module.exports = {
    initFrontend,
  };
}
