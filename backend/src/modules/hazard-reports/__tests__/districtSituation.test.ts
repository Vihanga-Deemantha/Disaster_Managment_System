import request from 'supertest';
import { createModuleHarness } from '@shared/testing/moduleHarness';
import { createHttpFixture } from '../testing/httpFixture';
import { aCluster } from '../testing/builders';

const url = '/api/hazard-reports/district/situation';
it('exposes only district incident summaries without granting review access', async () => {
  const fixture = createHttpFixture();
  const h = createModuleHarness(fixture.factory);
  await fixture.seedCluster({ verified: 2 });
  await fixture.clusters.save(aCluster({ id: 'other', district: 'GAMPAHA', reportIds: [] }));
  await fixture.clusters.save(aCluster({ id: 'closed', status: 'CLOSED', reportIds: [] }));
  const officer = h.as({ role: 'DISTRICT_OFFICER', district: 'KALUTARA' });
  const res = await officer.get(url);
  expect(res.status).toBe(200);
  expect(res.body).toHaveLength(1);
  expect(res.body[0]).toMatchObject({ district: 'KALUTARA', counts: { verified: 2, pending: 8 } });
  expect(res.body[0]).not.toHaveProperty('reports');
  expect((await officer.get('/api/hazard-reports/clusters')).status).toBe(403);
  expect((await officer.post('/api/hazard-reports/r-1/verify')).status).toBe(403);
});
it('requires a district assignment and authenticated officer role', async () => {
  const fixture = createHttpFixture();
  const h = createModuleHarness(fixture.factory);
  expect((await request(h.app).get(url)).status).toBe(401);
  expect((await h.as({ role: 'CITIZEN' }).get(url)).status).toBe(403);
  expect((await h.as({ role: 'DISTRICT_OFFICER' }).get(url)).status).toBe(403);
});
