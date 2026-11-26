/** @jest-environment jsdom */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { once } = require('events');
const { app, _store } = require('../src/app');

// jsdom has no fetch. This transport sends real HTTP requests through the proxy.
function httpFetch(origin, log) {
  return (url, options = {}) => new Promise((resolve, reject) => {
    log.push({ url, ...options });
    const req = http.request(new URL(url, origin), {
      method: options.method || 'GET', headers: options.headers,
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({
        ok: res.statusCode >= 200 && res.statusCode < 300,
        status: res.statusCode,
        json: async () => JSON.parse(body),
        text: async () => body,
      }));
    });
    req.on('error', reject);
    req.end(options.body);
  });
}

async function waitFor(check) {
  const deadline = Date.now() + 3000;
  while (true) {
    try { check(); return; } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
}

const el = id => document.getElementById(id);
const monthLabel = date => date.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' });

function fillForm(date) {
  el('workout-name').value = 'Nysparat pass';
  el('workout-date').value = date;
  document.querySelector('[name="exercise-name"]').value = 'Knäböj';
  document.querySelector('.exercise button').click();
  document.querySelector('[name="set-reps"]').value = '5';
  document.querySelector('[name="set-weight"]').value = '12.5';
}

function submit() {
  el('workout-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

describe('frontend DOM integration with real API and proxy', () => {
  let backend;
  let frontend;
  let origin;
  let initFrontend;
  let toLocalDateKey;
  let loadWorkouts;
  let originalFetch;
  let log;
  let today;
  let currentMonth;

  beforeAll(async () => {
    originalFetch = global.fetch;
    backend = app.listen(0, '127.0.0.1');
    await once(backend, 'listening');
    const oldUrl = process.env.BACKEND_URL;
    process.env.BACKEND_URL = `http://127.0.0.1:${backend.address().port}`;
    try {
      frontend = require('../src/frontend-server').listen(0, '127.0.0.1');
      await once(frontend, 'listening');
      origin = `http://127.0.0.1:${frontend.address().port}`;
    } finally {
      if (oldUrl === undefined) delete process.env.BACKEND_URL;
      else process.env.BACKEND_URL = oldUrl;
    }
  });

  beforeEach(() => {
    _store.reset();
    document.documentElement.innerHTML = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    const style = document.createElement('style');
    style.textContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
    document.head.appendChild(style);
    log = [];
    global.fetch = httpFetch(origin, log);
    jest.isolateModules(() => {
      ({ initFrontend, toLocalDateKey, loadWorkouts } = require('../public/main'));
    });
    today = new Date();
    currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  });

  afterAll(async () => {
    global.fetch = originalFetch;
    await new Promise(resolve => frontend.close(resolve));
    await new Promise(resolve => backend.close(resolve));
  });

  async function create(name, date, weight = 100) {
    const response = await global.fetch('/api/workouts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, date: date.toISOString(), exercises: [
        { name: 'Squat <img src=x onerror=alert(1)>', sets: [{ reps: 5, weight }] },
      ] }),
    });
    expect(response.status).toBe(201);
  }

  test('renders the existing list and details, with keyboard-operable workout buttons', async () => {
    await create('Test workout', today);
    await initFrontend();
    const items = el('workouts-list').querySelectorAll('li');
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain('Test workout');
    items[0].querySelector('button').click();
    expect(el('workout-details').textContent).toContain('5 reps @ 100 kg');
  });

  test('distinguishes loading from empty history and initializes only once', async () => {
    expect(log).toHaveLength(0);
    const ready = initFrontend();
    expect(el('calendar-status').textContent).toContain('Laddar');
    expect(el('month-count').textContent).toBe('—');
    await Promise.all([ready, initFrontend()]);
    expect(log.filter(item => item.url === '/api/workouts')).toHaveLength(1);
    expect(document.querySelectorAll('.exercise')).toHaveLength(1);
    el('add-exercise').click();
    expect(document.querySelectorAll('.exercise')).toHaveLength(2);
    expect(el('month-count').textContent).toBe('0');
    expect(el('month-volume').textContent).toBe('0');
    expect(el('calendar-status').textContent).toContain('Inga träningspass denna månad');
  });

  test('shows multiple workouts for today, independent markings, safe text and month totals', async () => {
    await create('<img src=x onerror=alert(1)>', today, 12.5);
    await create('Kvällspass', today, 0);
    await create('Förra året', new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()));
    await initFrontend();
    const button = document.querySelector(`[data-date="${toLocalDateKey(today)}"]`);
    expect(button.classList.contains('has-workouts')).toBe(true);
    expect(button.getAttribute('aria-current')).toBe('date');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.textContent).toContain('2 pass');
    expect(button.getAttribute('aria-label')).toContain('idag');
    expect(el('month-count').textContent).toBe('2');
    expect(el('month-volume').textContent).toBe('62,5');
    expect(el('day-workouts').children).toHaveLength(2);
    expect(el('day-workouts').textContent).toContain('Kvällspass');
    expect(el('day-workouts').textContent).toContain('5 reps @ 12.5 kg');
    expect(el('day-workouts').textContent).toContain(today.toLocaleString('sv-SE'));
    expect(el('day-workouts').textContent).toContain('<img src=x onerror=alert(1)>');
    expect(document.querySelectorAll('img')).toHaveLength(0);
    const empty = Array.from(document.querySelectorAll('.calendar-day')).find(day => !day.classList.contains('has-workouts'));
    empty.click();
    expect(el('day-workouts').textContent).toContain('Inga träningspass denna dag');
    expect(document.querySelectorAll('.calendar-day[aria-pressed="true"]')).toHaveLength(1);
    expect(document.querySelector('[aria-current="date"]').classList.contains('has-workouts')).toBe(true);
    expect(document.activeElement).not.toBe(document.body);
  });

  test('month navigation resets selection and statistics consistently across a year boundary', async () => {
    const next = new Date(today.getFullYear(), today.getMonth() + 1, 1, 12);
    await create('Nästa månad', next);
    await initFrontend();
    el('next-month').click();
    expect(el('calendar-title').textContent).toBe(monthLabel(next));
    expect(el('month-count').textContent).toBe('1');
    expect(el('month-volume').textContent).toBe('500');
    expect(el('day-workouts').textContent).toContain('Nästa månad');
    expect(document.querySelector('.calendar-day[aria-pressed="true"]').dataset.date).toBe(toLocalDateKey(next));
    expect(document.querySelector('[aria-current="date"]')).toBeNull();
    el('previous-month').click();
    expect(el('calendar-title').textContent).toBe(monthLabel(currentMonth));
    expect(el('month-count').textContent).toBe('0');
    expect(el('month-volume').textContent).toBe('0');
    expect(el('day-workouts').textContent).toContain('Inga träningspass denna dag');
    for (let i = 0; i < 12; i += 1) el('next-month').click();
    expect(el('calendar-title').textContent).toBe(monthLabel(new Date(today.getFullYear() + 1, today.getMonth(), 1)));
    expect(el('month-count').textContent).toBe('0');
    expect(el('month-volume').textContent).toBe('0');
    expect(log.filter(item => !item.method)).toHaveLength(1);
  });

  test('navigation preserves the selected month and workout form', async () => {
    await initFrontend();
    el('workout-name').value = 'Pågående utkast';
    el('nav-calendar').click();
    expect(el('calendar-view').hidden).toBe(false);
    expect(el('workouts-view').hidden).toBe(true);
    expect(window.getComputedStyle(el('workouts-view')).display).toBe('none');
    expect(el('nav-calendar').getAttribute('aria-current')).toBe('page');
    el('next-month').click();
    const title = el('calendar-title').textContent;
    el('nav-workouts').click();
    expect(el('workouts-view').hidden).toBe(false);
    expect(el('calendar-view').hidden).toBe(true);
    expect(window.getComputedStyle(el('calendar-view')).display).toBe('none');
    expect(el('workout-name').value).toBe('Pågående utkast');
    el('nav-calendar').click();
    expect(el('calendar-title').textContent).toBe(title);
  });

  test('saving through the form updates list, calendar and statistics without a page reload', async () => {
    await initFrontend();
    const localDate = `${toLocalDateKey(today)}T12:30`;
    fillForm(localDate);
    submit();
    await waitFor(() => expect(el('month-count').textContent).toBe('1'));
    expect(el('month-volume').textContent).toBe('62,5');
    expect(el('workouts-list').textContent).toContain('Nysparat pass');
    expect(el('day-workouts').textContent).toContain('Knäböj');
    expect(el('workout-name').value).toBe('');
    expect(log.filter(item => item.method === 'POST')).toHaveLength(1);
    const submitted = JSON.parse(log.find(item => item.method === 'POST').body);
    expect(submitted.date).toBe(new Date(localDate).toISOString());
    expect(_store.workouts).toHaveLength(1);
  });

  test('saving a workout outside the selected month preserves zero statistics until navigating', async () => {
    await initFrontend();
    el('nav-calendar').click();
    el('next-month').click();
    el('nav-workouts').click();
    fillForm(`${toLocalDateKey(today)}T12:30`);
    submit();
    await waitFor(() => expect(el('workouts-list').textContent).toContain('Nysparat pass'));
    expect(el('month-count').textContent).toBe('0');
    expect(el('month-volume').textContent).toBe('0');
    el('previous-month').click();
    expect(el('month-count').textContent).toBe('1');
  });

  test('shows actual API validation errors without losing history or form input', async () => {
    await create('Befintligt pass', today);
    await initFrontend();
    fillForm(`${toLocalDateKey(today)}T12:30`);
    el('workout-name').value = ' ';
    submit();
    await waitFor(() => expect(el('form-errors').textContent).toContain('name is required'));
    expect(el('month-count').textContent).toBe('1');
    expect(el('workout-name').value).toBe(' ');
    expect(_store.workouts).toHaveLength(1);
  });

  test('a failed reload clears stale data, shows an error rather than empty history and can retry', async () => {
    await create('Befintligt pass', today);
    await initFrontend();
    // Port 0 cannot be a listening destination: exercise a real network failure.
    global.fetch = httpFetch('http://127.0.0.1:0', log);
    await loadWorkouts();
    expect(el('calendar-status').textContent).toContain('Kunde inte ladda');
    expect(el('month-count').textContent).toBe('—');
    expect(el('month-volume').textContent).toBe('—');
    expect(el('day-workouts').textContent).not.toContain('Befintligt pass');
    expect(document.querySelectorAll('.has-workouts')).toHaveLength(0);
    expect(el('calendar-retry').hidden).toBe(false);
    el('next-month').click();
    expect(el('calendar-status').textContent).toContain('Kunde inte ladda');
    global.fetch = httpFetch(origin, log);
    el('calendar-retry').click();
    await waitFor(() => expect(el('month-count').textContent).toBe('0'));
    expect(el('calendar-retry').hidden).toBe(true);
    el('previous-month').click();
    expect(el('month-count').textContent).toBe('1');
  });

  test('an unavailable backend produces a real proxy HTTP error and recovers without stale history', async () => {
    await create('Återhämtat pass', today);
    await initFrontend();
    const port = backend.address().port;
    await new Promise(resolve => backend.close(resolve));
    try {
      const response = await global.fetch('/api/workouts');
      expect(response.status).toBe(504);
      await loadWorkouts();
      expect(el('calendar-status').textContent).toContain('Kunde inte ladda');
      expect(el('month-count').textContent).toBe('—');
      expect(el('month-volume').textContent).toBe('—');
      expect(el('day-workouts').textContent).not.toContain('Återhämtat pass');
    } finally {
      backend.listen(port, '127.0.0.1');
      await once(backend, 'listening');
    }
    await loadWorkouts();
    expect(el('month-count').textContent).toBe('1');
    expect(el('day-workouts').textContent).toContain('Återhämtat pass');
  });
});
