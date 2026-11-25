/** @jest-environment jsdom */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { once } = require('events');
const { app, _store } = require('../src/app');
const { initFrontend } = require('../public/main');

const byId = id => document.getElementById(id);
const sampleWorkout = {
  name: 'Test workout', date: '2024-01-01T00:00:00.000Z',
  exercises: [{ name: 'Squat', sets: [{ reps: 5, weight: 100 }] }],
};

async function waitFor(assertion) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { assertion(); return; } catch (error) {
      if (attempt === 99) throw error;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  }
}

function fillForm({ reps = '2.5', weight = '12.5', date = '2024-03-04T10:30' } = {}) {
  byId('workout-name').value = 'New workout';
  byId('workout-date').value = date;
  document.querySelector('input[name="exercise-name"]').value = ' Row ';
  document.querySelector('.exercise button').click();
  document.querySelector('input[name="set-reps"]').value = reps;
  document.querySelector('input[name="set-weight"]').value = weight;
}

function submit() {
  byId('workout-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

describe('frontend DOM integration with the real API', () => {
  let backend;
  let originalFetch;
  let calls;

  // jsdom has no native fetch. This transport adapter uses real HTTP and the real
  // Express routes/validator/store; it does not substitute API or rendering logic.
  function httpFetch(url, options = {}) {
    calls.push({ url, ...options });
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1', port: backend.address().port,
        path: url.replace(/^\/api/, ''), method: options.method || 'GET', headers: options.headers,
      }, response => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', chunk => { body += chunk; });
        response.on('end', () => resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode, json: async () => JSON.parse(body),
        }));
      });
      req.on('error', reject);
      req.end(options.body);
    });
  }

  beforeAll(async () => {
    originalFetch = global.fetch;
    backend = app.listen(0, '127.0.0.1');
    await once(backend, 'listening');
  });

  afterAll(async () => {
    global.fetch = originalFetch;
    await new Promise((resolve, reject) => backend.close(error => error ? reject(error) : resolve()));
  });

  beforeEach(() => {
    document.documentElement.innerHTML = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    _store.reset();
    _store.workouts.push({ id: 1, ...JSON.parse(JSON.stringify(sampleWorkout)) });
    _store.nextWorkoutId = 2;
    calls = [];
    global.fetch = httpFetch;
  });

  test('renders workouts list after initialization', async () => {
    await initFrontend();
    const list = byId('workouts-list');
    expect(list).not.toBeNull();
    expect(list.querySelectorAll('li')).toHaveLength(1);
    expect(list.textContent).toContain('Test workout');
    expect(byId('stat-workouts').textContent).toBe('1');
    expect(byId('stat-reps').textContent).toBe('5');
    expect(byId('stat-volume').textContent).toBe('500');
    expect(byId('exercise-records').textContent).toContain('squat');
  });

  test('initialization is idempotent, including concurrent calls', async () => {
    await Promise.all([initFrontend(), initFrontend(), initFrontend()]);
    expect(calls).toHaveLength(1);
    expect(document.querySelectorAll('.exercise')).toHaveLength(1);
    byId('add-exercise').click();
    expect(document.querySelectorAll('.exercise')).toHaveLength(2);
  });

  test('loading and empty states are separate and charts are zero-filled', async () => {
    _store.reset();
    const ready = initFrontend();
    expect(byId('data-status').hidden).toBe(false);
    expect(byId('data-message').textContent).toMatch(/Loading/);
    expect(byId('dashboard-content').hidden).toBe(true);
    await ready;
    expect(byId('data-status').hidden).toBe(true);
    expect(byId('dashboard-empty').hidden).toBe(false);
    expect(byId('stat-volume').textContent).toBe('0');
    expect(byId('top-empty').hidden).toBe(false);
    expect(byId('records-empty').hidden).toBe(false);
    expect(document.querySelectorAll('#activity-chart .chart-zero')).toHaveLength(30);
    expect(document.querySelectorAll('#activity-chart tbody tr')).toHaveLength(30);
    expect(byId('workouts-list').textContent).toContain('No workouts yet');
  });

  test.each(['network', 'http', 'malformed'])('shows %s failures, then retries real API successfully', async failure => {
    // Only failure injection is stubbed: network failures and malformed responses
    // cannot be produced by a healthy local API. Retry uses the real HTTP path.
    global.fetch = () => failure === 'network' ? Promise.reject(new Error('offline')) : Promise.resolve({
      ok: failure !== 'http', status: 503, json: async () => ({ unexpected: [] }),
    });
    await initFrontend();
    expect(byId('data-status').getAttribute('role')).toBe('alert');
    expect(byId('data-message').textContent).toContain('Could not load');
    expect(byId('dashboard-content').hidden).toBe(true);
    expect(byId('retry-load').hidden).toBe(false);
    global.fetch = httpFetch;
    byId('retry-load').focus();
    byId('retry-load').click();
    // Browsers blur a focused button when loading hides it; jsdom does not.
    byId('retry-load').blur();
    await waitFor(() => expect(byId('data-status').hidden).toBe(true));
    expect(byId('stat-workouts').textContent).toBe('1');
    expect(document.activeElement.id).toBe('dashboard-heading');
  });

  test('navigation updates visible view and focus; workout details use buttons', async () => {
    await initFrontend();
    document.querySelector('.view-nav [data-view="history"]').click();
    expect(byId('dashboard-view').hidden).toBe(true);
    expect(byId('history-view').hidden).toBe(false);
    expect(document.activeElement.id).toBe('history-heading');
    const button = document.querySelector('#workouts-list button');
    button.click();
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(byId('workout-details').textContent).toContain('5 reps @ 100 kg');
    document.querySelector('.view-nav [data-view="dashboard"]').click();
    expect(byId('history-view').hidden).toBe(true);
    expect(document.activeElement.id).toBe('dashboard-heading');
    expect(calls).toHaveLength(1);
  });

  test('volume period changes to 90 days without another request and has a text alternative', async () => {
    await initFrontend();
    const select = byId('volume-period');
    select.value = '90';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(document.querySelectorAll('#volume-chart rect')).toHaveLength(90);
    expect(document.querySelectorAll('#volume-chart tbody tr')).toHaveLength(90);
    expect(document.querySelectorAll('#activity-chart rect')).toHaveLength(30);
    expect(document.querySelector('#volume-chart svg').getAttribute('aria-label')).toContain('90 days');
    expect(document.querySelector('#volume-chart summary').textContent).toContain('90 days');
    expect(calls).toHaveLength(1);
    select.value = '30';
    select.dispatchEvent(new Event('change'));
    expect(document.querySelectorAll('#volume-chart tbody tr')).toHaveLength(30);
  });

  test('future workouts remain selectable in history but have no statistics', async () => {
    _store.workouts[0].date = '2099-01-01T00:00:00.000Z';
    await initFrontend();
    expect(byId('stat-workouts').textContent).toBe('0');
    expect(byId('stat-reps').textContent).toBe('0');
    expect(byId('dashboard-empty').hidden).toBe(false);
    expect(document.querySelectorAll('#workouts-list button')).toHaveLength(1);
    document.querySelector('#workouts-list button').click();
    expect(byId('workout-details').textContent).toContain('Squat');
    expect(byId('exercise-records').children).toHaveLength(0);
  });

  test('saving decimal sets persists through API, refreshes both views, and prevents duplicate submit', async () => {
    await initFrontend();
    document.querySelector('#workouts-list button').click();
    fillForm();
    submit();
    submit();
    expect(document.querySelector('button[type="submit"]').disabled).toBe(true);
    await waitFor(() => expect(document.querySelector('button[type="submit"]').disabled).toBe(false));
    expect(calls.map(call => call.method || 'GET')).toEqual(['GET', 'POST', 'GET']);
    expect(_store.workouts).toHaveLength(2);
    expect(_store.workouts[1].date).toBe(new Date('2024-03-04T10:30').toISOString());
    expect(_store.workouts[1].exercises[0].sets[0]).toEqual({ reps: 2.5, weight: 12.5 });
    expect(document.querySelectorAll('#workouts-list button')).toHaveLength(2);
    expect(byId('stat-workouts').textContent).toBe('2');
    expect(byId('stat-volume').textContent).toBe('531.25');
    expect(byId('stat-reps').textContent).toBe('7.5');
    expect(byId('exercise-records').children).toHaveLength(2);
    expect(byId('workout-details').textContent).toContain('Test workout');
    expect(byId('form-success').textContent).toContain('Workout saved');
    expect(byId('workout-name').value).toBe('');
    expect(document.querySelectorAll('.exercise')).toHaveLength(1);
  });

  test('validation failures preserve inputs and show real backend errors', async () => {
    await initFrontend();
    fillForm({ reps: '0' });
    submit();
    await waitFor(() => expect(byId('form-errors').hidden).toBe(false));
    expect(byId('form-errors').textContent).toContain('must be a positive number');
    expect(_store.workouts).toHaveLength(1);
    expect(byId('workout-name').value).toBe('New workout');
    expect(byId('stat-workouts').textContent).toBe('1');
  });

  test('submission transport failure preserves input and permits retry without a false success', async () => {
    await initFrontend();
    fillForm();
    // Failure injection is limited to the transport boundary; the successful retry is real HTTP.
    global.fetch = () => Promise.reject(new Error('offline'));
    submit();
    await waitFor(() => expect(document.querySelector('button[type="submit"]').disabled).toBe(false));
    expect(byId('form-errors').textContent).toContain('Failed to submit workout');
    expect(byId('form-success').textContent).toBe('');
    expect(byId('workout-name').value).toBe('New workout');
    expect(_store.workouts).toHaveLength(1);
    global.fetch = httpFetch;
    submit();
    await waitFor(() => expect(byId('stat-workouts').textContent).toBe('2'));
  });

  test('a failed refresh after saving is retried as GET, not a duplicate POST', async () => {
    await initFrontend();
    fillForm();
    // The save goes to the real backend; only its subsequent refresh is interrupted.
    global.fetch = (url, options) => options?.method === 'POST'
      ? httpFetch(url, options) : Promise.reject(new Error('offline'));
    submit();
    await waitFor(() => expect(byId('retry-load').hidden).toBe(false));
    expect(_store.workouts).toHaveLength(2);
    expect(byId('form-success').textContent).toContain('Workout saved');
    expect(byId('form-errors').hidden).toBe(true);
    expect(byId('dashboard-content').hidden).toBe(true);
    global.fetch = httpFetch;
    byId('retry-load').click();
    await waitFor(() => expect(byId('data-status').hidden).toBe(true));
    expect(byId('stat-workouts').textContent).toBe('2');
    expect(_store.workouts).toHaveLength(2);
    expect(calls.filter(call => call.method === 'POST')).toHaveLength(1);
  });

  test('a late initial response cannot overwrite the refresh after a save', async () => {
    let releaseInitial;
    const initialResponse = await httpFetch('/api/workouts');
    global.fetch = () => new Promise(resolve => { releaseInitial = () => resolve(initialResponse); });
    const initial = initFrontend();
    global.fetch = httpFetch;
    fillForm();
    submit();
    await waitFor(() => expect(byId('stat-workouts').textContent).toBe('2'));
    releaseInitial();
    await initial;
    expect(byId('stat-workouts').textContent).toBe('2');
    expect(document.querySelectorAll('#workouts-list button')).toHaveLength(2);
  });

  test('invalid local dates are handled before request construction', async () => {
    await initFrontend();
    fillForm({ date: '' });
    submit();
    expect(byId('form-errors').textContent).toContain('Enter a valid local date');
    expect(calls).toHaveLength(1);
  });

  test('unrepresentable volume is explicit and never creates invalid SVG coordinates', async () => {
    _store.workouts[0].date = new Date(Date.now() - 1000).toISOString();
    _store.workouts[0].exercises = [{ name: 'Huge', sets: [{ reps: 2, weight: Number.MAX_VALUE }] }];
    await initFrontend();
    expect(byId('stat-volume').textContent).toBe('Too large');
    expect(byId('statistics-warning').hidden).toBe(false);
    expect(document.querySelectorAll('#volume-chart .chart-overflow')).toHaveLength(1);
    expect(byId('volume-chart').innerHTML).not.toMatch(/NaN|Infinity/);
  });

  test('untrusted workout and exercise names are displayed only as text', async () => {
    _store.workouts[0].name = '<img src=x onerror=alert(1)>';
    _store.workouts[0].exercises[0].name = '<svg onload=alert(1)>';
    await initFrontend();
    document.querySelector('#workouts-list button').click();
    expect(byId('workout-details').textContent).toContain('<img');
    expect(byId('top-exercises').textContent).toContain('<svg');
    expect(byId('exercise-records').textContent).toContain('<svg');
    expect(document.querySelectorAll('img, [onerror], [onload]')).toHaveLength(0);
  });
});
