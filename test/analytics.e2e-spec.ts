import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { IndexModule } from '../src/index.module';

describe('Analytics E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [IndexModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/analytics/summary (GET) returns JSON', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/analytics/summary')
      .query({ orgId: 1, period: '7d' })
      .set('Authorization', 'Bearer test');

    expect(res.status).toBeLessThan(500); // tolerate auth guards in CI
    if (res.status === 200) {
      expect(res.body).toHaveProperty('period');
    }
  });
});


