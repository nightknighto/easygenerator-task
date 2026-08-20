import request from 'supertest';
import { createTestApp, type E2eTestApp } from './helpers/test-app';

describe('AppController (e2e)', () => {
  let testApp: E2eTestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('GET /api serves the health route under the global prefix', async () => {
    const res = await request(testApp.app.getHttpServer())
      .get('/api')
      .expect(200)
      .expect('Hello World!');
    // The unprefixed root is intentionally not routed.
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });
});
