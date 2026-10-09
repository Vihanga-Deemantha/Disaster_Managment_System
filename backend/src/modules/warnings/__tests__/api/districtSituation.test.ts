import request from 'supertest';
import { createWarningsApi } from '../../testing/apiHarness';
import { anIssuedWarning, aTargetArea, aWarning, HOUR, NOW } from '../../testing/builders';

const url = '/api/warnings/district/situation';
const district = { role: 'DISTRICT_OFFICER' as const, district: 'GAMPAHA' as const };
it('shows only currently valid issued warnings and strips other district targets', async () => {
  const api = createWarningsApi();
  const other = aTargetArea({ areaId: 'COLOMBO', district: 'COLOMBO', name: 'Colombo' });
  await api.add(anIssuedWarning({ targetAreas: [aTargetArea(), other] }));
  await api.add(anIssuedWarning({ warningId: 'other', targetAreas: [other] }));
  await api.add(anIssuedWarning({ warningId: 'expired', validTo: NOW }));
  await api.add(
    anIssuedWarning({ warningId: 'future', validFrom: new Date(NOW.getTime() + HOUR) }),
  );
  await api.add(aWarning({ warningId: 'draft' }));
  const res = await api.as(district).get(url);
  expect(res.status).toBe(200);
  expect(res.body).toHaveLength(1);
  expect(res.body[0].targetAreas).toHaveLength(1);
  expect(res.body[0].targetAreas[0].district).toBe('GAMPAHA');
  expect(res.body[0]).not.toHaveProperty('submittedBy');
  expect((await api.as(district).get('/api/warnings')).status).toBe(403);
});
it('requires a signed in assigned district officer', async () => {
  const api = createWarningsApi();
  expect((await request(api.app).get(url)).status).toBe(401);
  expect((await api.as({ role: 'NGO_MANAGER' }).get(url)).status).toBe(403);
  expect((await api.as({ role: 'DISTRICT_OFFICER' }).get(url)).status).toBe(403);
});
