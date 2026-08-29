/** @jest-environment jsdom */

const fs = require('fs');
const path = require('path');

describe('frontend DOM integration', () => {
  let initFrontend;
  let originalFetch;

  beforeAll(() => {
    originalFetch = global.fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  beforeEach(() => {
    // Load HTML into jsdom
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    document.documentElement.innerHTML = html;

    // Mock fetch before loading main.js
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        workouts: [
          {
            id: 1,
            name: 'Test workout',
            date: '2024-01-01T00:00:00.000Z',
            exercises: [
              {
                name: 'Squat',
                sets: [{ reps: 5, weight: 100 }],
              },
            ],
          },
        ],
      }),
    });

    // Require main.js after fetch is mocked
    // eslint-disable-next-line global-require
    ({ initFrontend } = require('../public/main.js'));
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('renders workouts list after initialization', async () => {
    initFrontend();

    // Wait for microtasks and timers
    await Promise.resolve();

    const list = document.getElementById('workouts-list');
    expect(list).not.toBeNull();

    // Allow any pending promises from loadWorkouts to resolve
    await new Promise(resolve => setTimeout(resolve, 0));

    const items = list.querySelectorAll('li');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('Test workout');
  });
});
