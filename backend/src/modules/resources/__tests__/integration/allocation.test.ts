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
import { DispatchService } from '../../application/DispatchService';
import { seedScenarios } from '../../seed/scenarios';

const store = new MongoResourceStore();
let h: ReturnType<typeof createModuleHarness>;
let replicaSet: MongoMemoryReplSet | undefined;
const district = { role: 'DISTRICT_OFFICER' as const, district: 'GAMPAHA' as const };
const owner = { role: 'NGO_MANAGER' as const, organizationId: 'org-red-cross' };
const needId = 'gampaha-flood-area-WATER';
const itemId = 'red-cross-WATER';
const base = '/api/resources';
const body = { requirementId: needId, resourceId: itemId, quantity: 100 };
it('UC-2 steps 9–14/E1: sends scoped in-app notifications for requests, responses, arrivals and expiry', async () => {
  const created = await allocate();
  expect((await h.as(owner).get(`${base}/notifications`)).body[0].message).toMatch(/requested/);
  expect((await h.as(district).get(`${base}/notifications`)).body).toHaveLength(0);
  const accepted = await answer(created.body.requestId, { quantity: 60 });
  expect((await h.as(district).get(`${base}/notifications`)).body[0].message).toMatch(/confirmed/);
  h.clock.advance(1000);
  await h
    .as(district)
    .post(`${base}/dispatches/${accepted.body.dispatchId}/deploy`)
    .set('Idempotency-Key', 'notification-arrival-1')
    .send({});
  expect((await h.as(owner).get(`${base}/notifications`)).body[0].message).toMatch(/arrived/);
  await allocate(20, 'expiry-notice');
  h.clock.advance(30 * 60_000);
  expect((await h.as().get(`${base}/notifications`)).body[0].message).toMatch(/did not respond/);
  expect((await h.as(district).get(`${base}/notifications`)).body).toHaveLength(2);
  expect(
    (await h.as({ role: 'DISTRICT_OFFICER', district: 'COLOMBO' }).get(`${base}/notifications`))
      .body,
  ).toHaveLength(0);
  expect(
    (
      await h
        .as({ role: 'NGO_MANAGER', organizationId: 'other-owner' })
        .get(`${base}/notifications`)
    ).body,
  ).toHaveLength(0);
});
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
  for (const name of [
    'areas',
    'needs',
    'inventory',
    'requests',
    'dispatches',
    'occupancyLogs',
    'notifications',
    'partners',
  ]) {
    await mongoose.connection.collection(`resource_${name}`).deleteMany({});
  }
  await mongoose.connection.collection('audit_logs').deleteMany({});
  await seedResources({ clock: h.clock });
});

it('UC-2 A1: requests partial stock only with consent, leaves the shortfall open and rechecks freshness', async () => {
  const item = await store.get('inventory', itemId);
  await store.save('inventory', itemId, { ...item, availableQty: 15 });
  const rejected = await allocate(100);
  expect(rejected.status).toBe(409);
  expect(rejected.body.error.details).toEqual({ available: 15, shortfall: 85 });
  expect((await store.get('needs', needId)).pendingQty).toBe(0);
  const accepted = await h
    .as(district)
    .post(`${base}/allocation-requests`)
    .set('Idempotency-Key', 'partial-yes')
    .send({ ...body, acceptPartial: true });
  expect(accepted.status).toBe(201);
  expect(accepted.body.requestedQty).toBe(15);
  expect((await store.get('inventory', itemId)).reservedQty).toBe(15);
  expect((await store.get('needs', needId)).pendingQty).toBe(15);
  expect((await allocate(1, 'empty-stock')).status).toBe(409);
});
async function priorityDestination() {
  const source = await store.get('areas', 'gampaha-flood-area');
  await store.save('areas', source.areaId, { ...source, priority: 3 });
  await store.save('areas', 'urgent-area', {
    ...source,
    areaId: 'urgent-area',
    name: 'Urgent evacuation point',
    priority: 1,
    location: { lat: 7.1, lng: 80 },
  });
  const need = await store.get('needs', needId);
  await store.save('needs', 'urgent-water', {
    ...need,
    requirementId: 'urgent-water',
    areaId: 'urgent-area',
  });
}
function changeDelivery(id: string, action: string, data: object = {}, key = action) {
  return h
    .as(district)
    .post(`${base}/dispatches/${id}/${action}`)
    .set('Idempotency-Key', `change-${key}`)
    .send(data);
}
it('UC-2 A3/A5: retains stock through failure, reschedules, reassigns atomically and deploys only the replacement', async () => {
  await priorityDestination();
  const request = await allocate(100);
  const confirmed = await answer(request.body.requestId, { quantity: 100 });
  const id = confirmed.body.dispatchId;
  expect(
    (await changeDelivery(id, 'distribution-failed', { reason: 'Access road flooded' })).body
      .status,
  ).toBe('DISTRIBUTION_PENDING');
  expect((await changeDelivery(id, 'deploy')).status).toBe(409);
  expect((await changeDelivery(id, 'reschedule')).body.status).toBe('DISPATCHED');
  expect((await changeDelivery(id, 'reschedule', {}, 'repeat-reschedule')).status).toBe(409);
  const reassigned = await changeDelivery(id, 'reassign', {
    targetAreaId: 'urgent-area',
    reason: 'Higher priority evacuation',
  });
  expect(reassigned.status).toBe(200);
  expect((await store.get('needs', needId)).fulfilledQty).toBe(0);
  expect((await store.get('needs', 'urgent-water')).fulfilledQty).toBe(100);
  expect(await store.get('inventory', itemId)).toMatchObject({ availableQty: 400, reservedQty: 0 });
  expect(await store.get('dispatches', id)).toMatchObject({
    status: 'REASSIGNED',
    replacementDispatchId: reassigned.body.dispatchId,
  });
  expect(reassigned.body.history[0].action).toBe('reassigned-from');
  expect((await changeDelivery(id, 'deploy', {}, 'old-arrival')).status).toBe(409);
  expect(
    (await changeDelivery(reassigned.body.dispatchId, 'deploy', {}, 'new-arrival')).status,
  ).toBe(200);
  expect(h.events.ofType('AllocationDeployed')[0].affectedAreaId).toBe('urgent-area');
  expect(
    (
      await changeDelivery(
        reassigned.body.dispatchId,
        'distribution-failed',
        { reason: 'Late failure' },
        'late',
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await changeDelivery(
        id,
        'reassign',
        { targetAreaId: 'urgent-area', reason: 'Again' },
        'repeat-reassign',
      )
    ).status,
  ).toBe(409);
  expect(
    (await h.as(owner).get(`${base}/notifications`)).body.some((n: { message: string }) =>
      n.message.includes('reassigned'),
    ),
  ).toBe(true);
  expect(
    (await changeDelivery(id, 'distribution-failed', { reason: ' ' }, 'empty-reason')).status,
  ).toBe(400);
});
it('UC-2 A3/BR1: refuses wrong district, event, priority or matching need without moving fulfilment', async () => {
  await priorityDestination();
  const created = await allocate(100);
  const confirmed = await answer(created.body.requestId, { quantity: 100 });
  const id = confirmed.body.dispatchId;
  const target = await store.get('areas', 'urgent-area');
  const attempt = (key: string) =>
    changeDelivery(id, 'reassign', { targetAreaId: 'urgent-area', reason: 'Priority' }, key);
  await store.save('areas', target.areaId, { ...target, priority: 3 });
  expect((await attempt('equal')).body.error.code).toBe('REASSIGN_NOT_HIGHER_PRIORITY');
  await store.save('areas', target.areaId, { ...target, district: 'COLOMBO' });
  expect((await attempt('other-district')).status).toBe(403);
  await store.save('areas', target.areaId, { ...target, disasterEventId: 'other-event' });
  expect((await attempt('other-event')).status).toBe(409);
  await store.save('areas', target.areaId, target);
  const need = await store.get('needs', 'urgent-water');
  await store.save('needs', need.requirementId, { ...need, pendingQty: 150 });
  expect((await attempt('reserved-need')).status).toBe(409);
  await store.save('needs', need.requirementId, { ...need, category: 'MEDICAL' });
  expect((await attempt('no-matching-need')).status).toBe(409);
  expect((await store.get('needs', needId)).fulfilledQty).toBe(100);
  expect(
    (
      await h
        .as(owner)
        .post(`${base}/dispatches/${id}/reschedule`)
        .set('Idempotency-Key', 'owner-change')
        .send({})
    ).status,
  ).toBe(403);
  expect(
    (
      await request(h.app)
        .post(`${base}/dispatches/${id}/reassign`)
        .set('X-Requested-With', 'SafeZone')
        .send({})
    ).status,
  ).toBe(401);
  expect((await changeDelivery(id, 'reschedule', { reason: 'extra' }, 'extra')).status).toBe(400);
  expect((await changeDelivery('absent', 'reschedule', {}, 'not-found')).status).toBe(404);
});
it('UC-2 E3: simulates stale/down partner feeds, blocks direct requests, restores data and estimates distance', async () => {
  await priorityDestination();
  const path = `${base}/dev/partners/org-red-cross/mode`;
  const mode = (value: string) =>
    h.as().put(path).set('Idempotency-Key', `uc2-feed-${value}`).send({ mode: value });
  expect((await mode('STALE')).status).toBe(200);
  expect((await allocate()).body.error.code).toBe('AVAILABILITY_UNKNOWN');
  expect(
    (await h.as(district).get(`${base}/requirements/${needId}/resources`)).body.resources[0].status,
  ).toBe('UNKNOWN');
  expect((await mode('DOWN')).status).toBe(200);
  expect((await allocate(10, 'down')).status).toBe(409);
  expect((await mode('OK')).status).toBe(200);
  expect((await allocate(10, 'restored')).status).toBe(201);
  const search = await h.as(district).get(`${base}/requirements/urgent-water/resources`);
  expect(search.body.resources[0].distanceKm).toEqual(expect.any(Number));
  expect(
    (await h.as().get(`${base}/notifications`)).body.some((n: { message: string }) =>
      n.message.includes('partner feed'),
    ),
  ).toBe(true);
  const item = await store.get('inventory', itemId);
  await store.save('inventory', itemId, {
    ...item,
    lastSyncedAt: new Date(h.clock.now().getTime() - 24 * 60 * 60_000),
  });
  expect((await allocate(10, 'naturally-stale')).body.error.code).toBe('AVAILABILITY_UNKNOWN');
  expect(
    (await h.as(district).put(path).set('Idempotency-Key', 'district-feed').send({ mode: 'OK' }))
      .status,
  ).toBe(403);
  expect((await mode('INVALID')).status).toBe(400);
  expect(
    (
      await h
        .as()
        .put(`${base}/dev/partners/missing/mode`)
        .set('Idempotency-Key', 'missing-partner')
        .send({ mode: 'OK' })
    ).status,
  ).toBe(404);
  const production = createModuleHarness(createResourcesModule, {
    config: { env: 'production', isProduction: true },
  });
  expect((await production.as().put(path).send({ mode: 'OK' })).status).toBe(404);
});
it('UC-2 E1: demo expiry is scoped, releases pending stock and is absent in production', async () => {
  const created = await allocate(100);
  const path = `${base}/dev/requests/${created.body.requestId}/expire`;
  expect(
    (
      await h
        .as({ role: 'DISTRICT_OFFICER', district: 'COLOMBO' })
        .post(path)
        .set('Idempotency-Key', 'wrong-expiry')
        .send({})
    ).status,
  ).toBe(403);
  expect(
    (await h.as(district).post(path).set('Idempotency-Key', 'demo-expiry').send({})).status,
  ).toBe(200);
  expect(await store.get('inventory', itemId)).toMatchObject({ availableQty: 500, reservedQty: 0 });
  expect(
    (await h.as(district).post(path).set('Idempotency-Key', 'repeat-expiry').send({})).status,
  ).toBe(409);
  const production = createModuleHarness(createResourcesModule, {
    config: { env: 'production', isProduction: true },
  });
  expect((await production.as(district).post(path).send({})).status).toBe(404);
});
it('UC-2 simulations: seeds all variant states once and preserves existing inventory and allocations', async () => {
  const existing = await allocate(25);
  const stock = await store.get('inventory', itemId);
  await seedScenarios(new MongoResourceUnitOfWork(), h.clock.now());
  await seedScenarios(new MongoResourceUnitOfWork(), h.clock.now());
  expect(await store.get('inventory', itemId)).toEqual(stock);
  expect((await store.get('requests', existing.body.requestId)).status).toBe('PENDING');
  const board = await h.as(district).get(`${base}/board`);
  expect(board.body.requests).toHaveLength(8);
  expect(board.body.dispatches).toHaveLength(5);
  expect(board.body.dispatches.map((d: { status: string }) => d.status)).toEqual(
    expect.arrayContaining(['DISTRIBUTION_PENDING', 'REASSIGNED', 'DISPATCHED']),
  );
  const need = await store.get('needs', 'uc2-demo-gampaha-local-WATER');
  expect(need).toMatchObject({ fulfilledQty: 50, pendingQty: 20 });
  expect((await store.get('needs', 'uc2-demo-gampaha-priority-WATER')).fulfilledQty).toBe(20);
  const query = await h.as(district).get(`${base}/requirements/${need.requirementId}/resources`);
  expect(
    query.body.resources.find(
      (i: { resourceId: string }) => i.resourceId === 'uc2-demo-gampaha-stale',
    ).status,
  ).toBe('UNKNOWN');
  expect((await store.get('inventory', 'uc2-demo-gampaha-partial')).availableQty).toBe(15);
});
it('UC-2 A3/BR5: a persistence failure rolls back both destination quantities and dispatch records', async () => {
  await priorityDestination();
  const created = await allocate(100);
  const confirmed = await answer(created.body.requestId, { quantity: 100 });
  const service = new DispatchService({
    clock: h.clock,
    ids: h.ids,
    uow: {
      run: (work) =>
        new MongoResourceUnitOfWork().run((transaction) =>
          work({
            get: transaction.get.bind(transaction),
            list: transaction.list.bind(transaction),
            audit: transaction.audit.bind(transaction),
            save: async (kind, id, value) => {
              if (id === 'urgent-water') throw new Error('Injected persistence failure');
              await transaction.save(kind, id, value);
            },
          }),
        ),
    },
  });
  await expect(
    service.reassign(
      { ...district, userId: 'officer', sessionId: 'session', authenticatedAt: h.clock.now() },
      confirmed.body.dispatchId,
      'urgent-area',
      'Emergency',
    ),
  ).rejects.toThrow('Injected persistence failure');
  expect((await store.get('needs', needId)).fulfilledQty).toBe(100);
  expect((await store.get('needs', 'urgent-water')).fulfilledQty).toBe(0);
  expect((await store.get('dispatches', confirmed.body.dispatchId)).status).toBe('DISPATCHED');
  expect(await store.list('dispatches')).toHaveLength(1);
});

it('UC-2 A4: allocates an army team through its liaison and restores availability after its assignment', async () => {
  const id = 'army-rescue-team-1';
  const created = await h
    .as(district)
    .post(`${base}/allocation-requests`)
    .set('Idempotency-Key', 'team-request-1')
    .send({ requirementId: 'gampaha-flood-area-ARMY', resourceId: id, quantity: 1 });
  expect(created.status).toBe(201);
  const army = h.as({ role: 'ARMED_FORCES_LIAISON', organizationId: 'org-sl-army' });
  const update = () =>
    army
      .post(`${base}/inventory/${id}/team-status`)
      .set('Idempotency-Key', 'team-status-1')
      .send({ status: 'AVAILABLE', location: { lat: 7.1, lng: 80 } });
  expect((await update()).status).toBe(409);
  expect((await answer(created.body.requestId, { quantity: 1 })).status).toBe(403);
  const response = await army
    .post(`${base}/allocation-requests/${created.body.requestId}/respond`)
    .set('Idempotency-Key', 'team-confirm-1')
    .send({ quantity: 1 });
  expect(response.status).toBe(200);
  expect((await update()).status).toBe(409);
  expect(
    (
      await h
        .as(district)
        .post(`${base}/dispatches/${response.body.dispatchId}/deploy`)
        .set('Idempotency-Key', 'team-arrival-1')
        .send({})
    ).status,
  ).toBe(200);
  expect(await store.get('inventory', id)).toMatchObject({ status: 'DEPLOYED', availableQty: 0 });
  expect(
    (
      await army
        .post(`${base}/inventory/${id}/team-status`)
        .set('Idempotency-Key', 'team-return-1')
        .send({ status: 'AVAILABLE', location: { lat: 7.1, lng: 80 } })
    ).status,
  ).toBe(200);
  expect(await store.get('inventory', id)).toMatchObject({
    availableQty: 1,
    status: 'AVAILABLE',
    location: { lat: 7.1, lng: 80 },
  });
  expect(
    (
      await army
        .post(`${base}/inventory/${id}/team-status`)
        .set('Idempotency-Key', 'team-unavailable-1')
        .send({ status: 'UNAVAILABLE', location: { lat: 7.1, lng: 80 } })
    ).status,
  ).toBe(200);
  expect(await store.get('inventory', id)).toMatchObject({
    availableQty: 0,
    status: 'UNAVAILABLE',
  });
});
it('UC-2 UCD-12b: keeps shelter places held until arrival and records occupancy without double counting', async () => {
  expect(
    (
      await h
        .as(district)
        .get(`${base}/requirements/gampaha-flood-area-EVACUATION_SHELTER/resources`)
    ).body.resources,
  ).toHaveLength(1);
  const id = 'gampaha-shelter-1';
  const created = await h
    .as(district)
    .post(`${base}/allocation-requests`)
    .set('Idempotency-Key', 'shelter-request-1')
    .send({
      requirementId: 'gampaha-flood-area-EVACUATION_SHELTER',
      resourceId: id,
      quantity: 100,
    });
  expect(created.status).toBe(201);
  const occupancy = (value: number, key: string) =>
    h
      .as(owner)
      .post(`${base}/inventory/${id}/occupancy`)
      .set('Idempotency-Key', key)
      .send({ occupancy: value });
  expect((await occupancy(250, 'occupancy-block-1')).status).toBe(409);
  const response = await answer(created.body.requestId, { quantity: 60 });
  expect(await store.get('inventory', id)).toMatchObject({
    availableQty: 200,
    currentOccupancy: 40,
    committedQty: 60,
    reservedQty: 0,
  });
  expect((await occupancy(250, 'occupancy-block-2')).status).toBe(409);
  expect(
    (
      await h
        .as(district)
        .post(`${base}/dispatches/${response.body.dispatchId}/deploy`)
        .set('Idempotency-Key', 'shelter-arrival-1')
        .send({})
    ).status,
  ).toBe(200);
  expect(await store.get('inventory', id)).toMatchObject({
    availableQty: 200,
    currentOccupancy: 100,
    committedQty: 0,
  });
  expect((await occupancy(50, 'occupancy-depart-1')).status).toBe(200);
  expect(await store.get('inventory', id)).toMatchObject({
    currentOccupancy: 50,
    availableQty: 250,
  });
  expect(await store.list('occupancyLogs')).toHaveLength(2);
});
it('UC-2 BR1/BR2: scopes inventory and rejects fractional teams, cross district shelters and unauthorized updates', async () => {
  const all = await h.as().get(`${base}/inventory`);
  expect(all.body).toHaveLength(14);
  const own = await h.as(owner).get(`${base}/inventory`);
  expect(
    own.body.every((item: { organizationId: string }) => item.organizationId === 'org-red-cross'),
  ).toBe(true);
  const scoped = await h.as(district).get(`${base}/inventory`);
  expect(scoped.body).toHaveLength(3);
  const create = (resourceId: string, category: string, quantity: number) =>
    h
      .as(district)
      .post(`${base}/allocation-requests`)
      .set('Idempotency-Key', `request-${resourceId}-${quantity}`)
      .send({ resourceId, requirementId: `gampaha-flood-area-${category}`, quantity });
  expect((await create('army-rescue-team-1', 'ARMY', 0.5)).status).toBe(400);
  expect((await create('colombo-shelter-1', 'EVACUATION_SHELTER', 1)).status).toBe(409);
  expect(
    (await h.as(district).post(`${base}/inventory/army-rescue-team-1/team-status`).send({})).status,
  ).toBe(403);
  expect(
    (
      await h
        .as(owner)
        .post(`${base}/inventory/army-rescue-team-1/team-status`)
        .set('Idempotency-Key', 'wrong-owner-1')
        .send({ status: 'AVAILABLE', location: { lat: 7, lng: 80 } })
    ).status,
  ).toBe(403);
  expect(
    (
      await h
        .as(owner)
        .post(`${base}/inventory/${itemId}/team-status`)
        .set('Idempotency-Key', 'wrong-team-1')
        .send({ status: 'AVAILABLE', location: { lat: 7, lng: 80 } })
    ).status,
  ).toBe(409);
  expect(
    (
      await h
        .as(owner)
        .post(`${base}/inventory/${itemId}/occupancy`)
        .set('Idempotency-Key', 'wrong-shelter-1')
        .send({ occupancy: 0 })
    ).status,
  ).toBe(409);
  expect(
    (
      await h
        .as(owner)
        .post(`${base}/inventory/gampaha-shelter-1/occupancy`)
        .set('Idempotency-Key', 'negative-occupancy')
        .send({ occupancy: -1 })
    ).status,
  ).toBe(400);
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
