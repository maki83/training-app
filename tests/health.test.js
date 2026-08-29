const request = require('supertest');
const { app } = require('../src/app');
const { server } = require('../src/server');

describe('Health endpoint', () => {
  test('GET /health responds with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('Server entrypoint', () => {
  let runningServer;

  afterEach((done) => {
    if (runningServer && runningServer.close) {
      runningServer.close(() => done());
    } else {
      done();
    }
  });

  test('server listens on configured port', (done) => {
    runningServer = server.listen(0, () => {
      const address = runningServer.address();
      expect(address).toBeDefined();
      expect(address.port).toBeGreaterThan(0);
      done();
    });
  });
});
