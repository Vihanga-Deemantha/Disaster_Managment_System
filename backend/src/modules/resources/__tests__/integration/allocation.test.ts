import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createResourcesModule } from '../../composition';
import { createModuleHarness } from '@shared/testing/moduleHarness';
import {
  MongoResourceStore,
  MongoResourceUnitOfWork,
} from '../../infrastructure/MongoResourceStore';
import { seedResources } from '../../seed';
import { AllocationService } from '../../application/AllocationService';

const store = new MongoResourceStore();
let h: ReturnType<typeof createModuleHarness>;
let replicaSet: MongoMemoryReplSet | undefined;
const district = { role: 'DISTRICT_OFFICER' as const, district: 'GAMPAHA' as const };
const owner = { role: 'NGO_MANAGER' as const, organizationId: 'org-red-cross' };
const needId = 'gampaha-flood-area-WATER';
const itemId = 'red-cross-WATER';
const base = '/api/resources';
const body = { requirementId: needId, resourceId: itemId, quantity: 100 };
function allocate(quantity = 100, key = 'request') {
  return h
    .as(district)
    .post(`${base}/allocation-requests`)
    .set('Idempotency-Key', 'uc2-test-' + key)
    .send({ ...body, quantity });
}
function answer(id: string, data: object, key = 'response') {
  return h
    .as(owner)
    .post(`${base}/allocation-requests/${id}/respond`)
    .set('Idempotency-Key', 'uc2-test-' + key)
    .send(data);
}
beforeAll(async () => {
  // CI uses a throwaway replica set; local Docker runs opt in to an isolated database.
  let uri = process.env.UC2_TEST_MONGODB_URI;
  if (uri && new URL(uri).pathname !== '/safezone_uc2_test')
    throw new Error('Use the isolated safezone_uc2_test database.');
  if (!uri) {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    uri = replicaSet.getUri('safezone_uc2_test');
  }
  await mongoose.connect(uri);
});
beforeEach(async () => {
  h = createModuleHarness(createResourcesModule);
  for (const name of ['areas', 'needs', 'inventory', 'requests', 'dispatches']) {
    await mongoose.connection.collection(`resource_${name}`).deleteMany({});
  }
  await mongoose.connection.collection('audit_logs').deleteMany({});
  await seedResources({ clock: h.clock });
});
afterAll(async () => {
  await mongoose.disconnect();
  await replicaSet?.stop();
});

it('reserves stock, accepts a partial confirmation, and publishes only on arrival', async () => {
  const created = await allocate();
  expect(created.status).toBe(201);
  expect(await store.get('inventory', itemId)).toMatchObject({
    availableQty: 400,
    reservedQty: 100,
  });
  const confirmed = await answer(created.body.requestId, { quantity: 60 });
  expect(confirmed.status).toBe(200);
  expect(await store.get('inventory', itemId)).toMatchObject({ availableQty: 440, reservedQty: 0 });
  expect(await store.get('needs', needId)).toMatchObject({ fulfilledQty: 60, pendingQty: 0 });
  expect(h.events.published).toHaveLength(0);
  const url = `${base}/dispatches/${confirmed.body.dispatchId}/deploy`;
  expect(
    (
      await h
        .as(district)
        .post(url)
        .set('Idempotency-Key', 'uc2-test-' + 'arrival')
        .send({})
    ).status,
  ).toBe(200);
  expect(
    (
      await h
        .as(district)
        .post(url)
        .set('Idempotency-Key', 'uc2-test-' + 'arrival')
        .send({})
    ).status,
  ).toBe(200);
  expect(h.events.ofType('AllocationDeployed')).toHaveLength(1);
  expect(
    (
      await h
        .as(district)
        .post(url)
        .set('Idempotency-Key', 'uc2-test-' + 'second-arrival')
        .send({})
    ).status,
  ).toBe(409);
  expect(await mongoose.connection.collection('audit_logs').countDocuments()).toBe(3);
});
it('releases all held stock and need when the owner declines', async () => {
  const created = await allocate();
  expect((await answer(created.body.requestId, { reason: 'Vehicle unavailable' })).status).toBe(
    200,
  );
  expect(await store.get('inventory', itemId)).toMatchObject({ availableQty: 500, reservedQty: 0 });
  expect(await store.get('needs', needId)).toMatchObject({ fulfilledQty: 0, pendingQty: 0 });
  expect(await store.list('dispatches')).toHaveLength(0);
});
it('expires unanswered reservations at the 30 minute boundary without double releasing', async () => {
  const created = await allocate();
  h.clock.advance(30 * 60_000);
  expect((await h.as(district).get(`${base}/board`)).status).toBe(200);
  await h.as(district).get(`${base}/board`);
  expect(await store.get('requests', created.body.requestId)).toMatchObject({
    status: 'NO_RESPONSE',
  });
  expect(await store.get('inventory', itemId)).toMatchObject({ availableQty: 500, reservedQty: 0 });
});
it('cannot overbook one requirement with concurrent requests', async () => {
  const results = await Promise.all([allocate(150, 'first'), allocate(150, 'second')]);
  expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  expect(await store.get('needs', needId)).toMatchObject({ pendingQty: 150 });
  expect(await store.list('requests')).toHaveLength(1);
});
it('cannot overbook shared stock across different districts', async () => {
  const item = await store.get('inventory', itemId);
  await store.save('inventory', itemId, { ...item, availableQty: 150 });
  const other = h
    .as({ ...district, district: 'COLOMBO' })
    .post(`${base}/allocation-requests`)
    .set('Idempotency-Key', 'uc2-test-' + 'colombo')
    .send({ ...body, requirementId: 'colombo-flood-area-WATER' });
  const results = await Promise.all([allocate(), other]);
  expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  expect(await store.get('inventory', itemId)).toMatchObject({
    availableQty: 50,
    reservedQty: 100,
  });
});
it('rolls back stock and request writes when the transactional audit fails', async () => {
  const spy = jest
    .spyOn(MongoResourceStore.prototype, 'audit')
    .mockRejectedValueOnce(new Error('audit unavailable'));
  const failed = await allocate();
  spy.mockRestore();
  expect(failed.status).toBe(500);
  expect(await store.get('inventory', itemId)).toMatchObject({ availableQty: 500, reservedQty: 0 });
  expect(await store.get('needs', needId)).toMatchObject({ pendingQty: 0 });
  expect(await store.list('requests')).toHaveLength(0);
});
it('replays requests without reserving stock twice', async () => {
  const first = await allocate();
  const second = await allocate();
  expect(second.body.requestId).toBe(first.body.requestId);
  expect(await store.get('inventory', itemId)).toMatchObject({
    availableQty: 400,
    reservedQty: 100,
  });
});
it.each([0, -1, 201, '100', null])('rejects invalid or excessive quantity %s', async (quantity) => {
  const response = await h
    .as(district)
    .post(`${base}/allocation-requests`)
    .set('Idempotency-Key', 'uc2-test-' + 'invalid')
    .send({ ...body, quantity });
  expect([400, 409]).toContain(response.status);
  expect(await store.list('requests')).toHaveLength(0);
});
it('rejects a different district, unauthorized owner and national officer writes', async () => {
  const wrongDistrict = await h
    .as({ ...district, district: 'COLOMBO' })
    .post(`${base}/allocation-requests`)
    .set('Idempotency-Key', 'uc2-test-' + 'wrong-district')
    .send(body);
  expect(wrongDistrict.status).toBe(403);
  const created = await allocate();
  const wrongOwner = await h
    .as({ ...owner, organizationId: 'org-sl-army' })
    .post(`${base}/allocation-requests/${created.body.requestId}/respond`)
    .set('Idempotency-Key', 'uc2-test-' + 'wrong-owner')
    .send({ quantity: 100 });
  expect(wrongOwner.status).toBe(403);
  expect((await h.as().post(`${base}/allocation-requests`).send(body)).status).toBe(403);
  expect((await request(h.app).get(`${base}/board`)).status).toBe(401);
});
it('validates response bodies and leaves the reservation intact on invalid confirmation', async () => {
  const created = await allocate();
  expect((await answer(created.body.requestId, { quantity: 101 }, 'too-many')).status).toBe(409);
  expect((await answer(created.body.requestId, { reason: ' ' }, 'blank')).status).toBe(400);
  expect(
    (await answer(created.body.requestId, { quantity: 50, reason: 'both' }, 'ambiguous')).status,
  ).toBe(400);
  expect(await store.get('inventory', itemId)).toMatchObject({ reservedQty: 100 });
});
it('returns district and organization scoped boards and matching search results', async () => {
  await allocate();
  expect((await h.as(district).get(`${base}/board`)).body.areas).toHaveLength(1);
  expect((await h.as().get(`${base}/board`)).body.areas).toHaveLength(3);
  expect((await h.as(owner).get(`${base}/board`)).body.requests).toHaveLength(1);
  expect(
    (await h.as({ ...owner, organizationId: 'org-sl-army' }).get(`${base}/board`)).body.requests,
  ).toHaveLength(0);
  expect(
    (await h.as(district).get(`${base}/requirements/${needId}/resources`)).body.resources,
  ).toHaveLength(3);
  expect(
    (
      await h
        .as({ ...district, district: 'COLOMBO' })
        .get(`${base}/requirements/${needId}/resources`)
    ).status,
  ).toBe(403);
  expect((await h.as(district).get(`${base}/requirements/missing/resources`)).status).toBe(404);
});
it('keeps modified stock and fulfilled needs when demo data is seeded again', async () => {
  const created = await allocate();
  await answer(created.body.requestId, { quantity: 100 });
  await seedResources({ clock: h.clock });
  expect(await store.get('inventory', itemId)).toMatchObject({ availableQty: 400, reservedQty: 0 });
  expect(await store.get('needs', needId)).toMatchObject({ fulfilledQty: 100 });
});
it('uses a transaction even when domain authorization is called outside HTTP', async () => {
  const service = new AllocationService({
    uow: new MongoResourceUnitOfWork(),
    clock: h.clock,
    ids: h.ids,
    events: h.events,
  });
  await expect(
    service.request(
      { userId: 'citizen', sessionId: 's', authenticatedAt: h.clock.now(), role: 'CITIZEN' },
      needId,
      itemId,
      10,
    ),
  ).rejects.toMatchObject({ code: 'FORBIDDEN_SCOPE' });
});
it('rejects mismatched supplies before making a reservation', async () => {
  const response = await h
    .as(district)
    .post(`${base}/allocation-requests`)
    .set('Idempotency-Key', 'uc2-mismatched-supply')
    .send({ ...body, resourceId: 'red-cross-MEDICAL' });
  expect(response.status).toBe(409);
  expect(response.body.error.code).toBe('RESOURCE_MISMATCH');
  expect(await store.list('requests')).toHaveLength(0);
});
it('rejects a direct owner response without a quantity or reason', async () => {
  const created = await allocate();
  const service = new AllocationService({
    uow: new MongoResourceUnitOfWork(),
    clock: h.clock,
    ids: h.ids,
    events: h.events,
  });
  await expect(
    service.respond(
      { ...owner, userId: 'owner', sessionId: 's', authenticatedAt: h.clock.now() },
      created.body.requestId,
      {},
    ),
  ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  expect(await store.get('inventory', itemId)).toMatchObject({ reservedQty: 100 });
});
it('includes confirmed dispatches on the officer board and redacts audit secrets', async () => {
  const created = await allocate();
  const confirmed = await answer(created.body.requestId, { quantity: 100 });
  const board = await h.as(district).get(`${base}/board`);
  expect(board.body.dispatches).toEqual([
    expect.objectContaining({ dispatchId: confirmed.body.dispatchId }),
  ]);
  await store.audit({
    action: 'resources.test',
    occurredAt: h.clock.now(),
    details: { password: 'must not persist', quantity: 100 },
  });
  const audit = await mongoose.connection
    .collection('audit_logs')
    .findOne({ action: 'resources.test' });
  expect(audit?.details).toEqual({ password: '[redacted]', quantity: 100 });
});
it('rolls back confirmation and deployment together with their audit records', async () => {
  const created = await allocate();
  const confirmFailure = jest
    .spyOn(MongoResourceStore.prototype, 'audit')
    .mockRejectedValueOnce(new Error('audit unavailable'));
  expect((await answer(created.body.requestId, { quantity: 100 })).status).toBe(500);
  confirmFailure.mockRestore();
  expect(await store.get('requests', created.body.requestId)).toMatchObject({ status: 'PENDING' });
  expect(await store.get('inventory', itemId)).toMatchObject({ reservedQty: 100 });
  expect(await store.list('dispatches')).toHaveLength(0);
  const confirmed = await answer(created.body.requestId, { quantity: 100 });
  const deployFailure = jest
    .spyOn(MongoResourceStore.prototype, 'audit')
    .mockRejectedValueOnce(new Error('audit unavailable'));
  const response = await h
    .as(district)
    .post(`${base}/dispatches/${confirmed.body.dispatchId}/deploy`)
    .set('Idempotency-Key', 'uc2-failed-deploy')
    .send({});
  deployFailure.mockRestore();
  expect(response.status).toBe(500);
  expect(await store.get('dispatches', confirmed.body.dispatchId)).toMatchObject({
    status: 'DISPATCHED',
  });
  expect(h.events.published).toHaveLength(0);
});
it.each([
  ['army-WATER', 'ARMED_FORCES_LIAISON', 'org-sl-army'],
  ['irrigation-WATER', 'GOVERNMENT_AGENCY_OFFICER', 'org-irrigation-dept'],
] as const)('lets the owning agency confirm %s', async (resourceId, role, organizationId) => {
  const created = await h
    .as(district)
    .post(`${base}/allocation-requests`)
    .set('Idempotency-Key', 'uc2-other-agency-request')
    .send({ ...body, resourceId });
  const response = await h
    .as({ role, organizationId })
    .post(`${base}/allocation-requests/${created.body.requestId}/respond`)
    .set('Idempotency-Key', 'uc2-other-agency-confirm')
    .send({ quantity: 100 });
  expect(response.status).toBe(200);
  expect(await store.get('inventory', resourceId)).toMatchObject({
    availableQty: 400,
    reservedQty: 0,
  });
});
