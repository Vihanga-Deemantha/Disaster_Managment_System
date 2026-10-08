import request from 'supertest';
import { createModuleHarness } from '@shared/testing/moduleHarness';
import { createAnalyticsModule } from '../composition';
import { MemoryAnalyticsStore } from '../testing/MemoryAnalyticsStore';
import { event, input, alert, occupancy, dispatch } from '../testing/fixtures';
import { Sha256ChecksumCalculator } from '../infrastructure/ReportExporters';
import { WarningIssuedHandler, AllocationDeployedHandler } from '../infrastructure/EventHandlers';
import type { WarningIssued, AllocationDeployed } from '@shared/contracts/events';

function harness() {
  const store = new MemoryAnalyticsStore();
  store.events.set(event.eventId, event);
  store.alerts.set(alert.id, alert);
  store.occupancy.set(occupancy.id, occupancy);
  store.dispatches.set(dispatch.id, dispatch);
  return { ...createModuleHarness((ctx) => createAnalyticsModule(ctx, store)), store };
}
const options = {
  format: 'CSV',
  audience: 'EXTERNAL',
  datasets: ['alerts', 'occupancy', 'distribution'],
};
describe('UC-4 API', () => {
  it('UC-4 routes: authenticated events, summary, query, logs and history', async () => {
    const h = harness();
    expect((await h.as().get('/api/analytics/events')).body.events[0]).toEqual(event);
    expect((await h.as().get('/api/analytics/summary')).body.metrics.recordCount).toBe(3);
    expect(
      (await h.as().post('/api/analytics/query').send(input)).body.metrics.totals.reachPct,
    ).toBe(80);
    expect(
      (
        await h
          .as()
          .get(
            `/api/analytics/event-log?${new URLSearchParams(input as unknown as Record<string, string>)}`,
          )
      ).body.total,
    ).toBe(3);
    expect((await h.as().get('/api/analytics/reports')).body.reports).toEqual([]);
  });
  it.each(['events', 'summary', 'event-log', 'reports'])(
    'UC-4 API: GET %s requires auth and an analytics role',
    async (route) => {
      const h = harness();
      expect((await request(h.app).get(`/api/analytics/${route}`)).status).toBe(401);
      expect((await h.as({ role: 'CITIZEN' }).get(`/api/analytics/${route}`)).status).toBe(403);
    },
  );
  it.each(['query', 'reports'])('UC-4 API: POST %s requires auth and role', async (route) => {
    const h = harness();
    expect(
      (
        await request(h.app)
          .post(`/api/analytics/${route}`)
          .set('X-Requested-With', 'SafeZone')
          .send({})
      ).status,
    ).toBe(401);
    expect((await h.as({ role: 'CITIZEN' }).post(`/api/analytics/${route}`).send({})).status).toBe(
      403,
    );
  });
  it('UC-4 E1: malformed and invalid filters return field lists', async () => {
    const h = harness();
    for (const invalid of [{}, { ...input, from: 'bad' }, { ...input, district: 'BAD' }]) {
      const result = await h.as().post('/api/analytics/query').send(invalid);
      expect(result.status).toBe(400);
      expect(result.body.error.fields.length).toBeGreaterThan(0);
    }
    expect(
      (
        await h
          .as()
          .get(
            '/api/analytics/event-log?district=ALL&hazardType=ALL&from=2026-09-01&to=2026-09-30&page=0',
          )
      ).status,
    ).toBe(400);
    expect(
      (
        await h
          .as()
          .get(
            '/api/analytics/event-log?district=ALL&hazardType=ALL&from=2026-09-01&to=2026-09-30&dataset=bad',
          )
      ).status,
    ).toBe(400);
  });
  it.each(['NGO_MANAGER', 'DONOR'] as const)(
    'UC-4 E4: %s denied and audited across query/export/logs',
    async (role) => {
      const h = harness();
      const user = h.as({ role, organizationId: 'own' });
      const filter = { ...input, organizationId: 'other' };
      expect((await user.post('/api/analytics/query').send(filter)).status).toBe(403);
      expect((await user.post('/api/analytics/reports').send({ filter, ...options })).status).toBe(
        403,
      );
      expect(
        (await user.get(`/api/analytics/event-log?${new URLSearchParams(filter)}`)).status,
      ).toBe(403);
      expect(h.audit.entries.filter((e) => e.action === 'analytics.scope.denied')).toHaveLength(3);
    },
  );
  it('UC-4 E2: query with no data succeeds, export refuses without history', async () => {
    const h = harness();
    const filter = { ...input, eventId: undefined, district: 'JAFFNA' };
    const query = await h.as().post('/api/analytics/query').send(filter);
    expect(query.status).toBe(200);
    expect(query.body.metrics.recordCount).toBe(0);
    expect(
      (
        await h
          .as()
          .post('/api/analytics/reports')
          .send({ filter, ...options })
      ).status,
    ).toBe(409);
    expect(h.store.history).toHaveLength(0);
  });
  it('UC-4 A2 / BR4: CSV download headers and actual bytes agree with saved hash', async () => {
    const h = harness();
    const response = await h
      .as()
      .post('/api/analytics/reports')
      .send({ filter: input, ...options });
    expect(response.status).toBe(200);
    expect(response.headers['content-disposition']).toContain('.csv');
    expect(response.headers['x-report-checksum']).toBe(
      new Sha256ChecksumCalculator().calculate(Buffer.from(response.text)),
    );
    expect(response.text).not.toContain('private-citizen');
    expect(h.store.history[0]?.checksum).toBe(response.headers['x-report-checksum']);
  });
  it('UC-4 E3: dev toggle demonstrates retry and CSV fallback', async () => {
    const h = harness();
    expect((await h.as().put('/api/dev/pdf-exporter').send({ mode: 'bad' })).status).toBe(400);
    await h.as().put('/api/dev/pdf-exporter').send({ mode: 'FAIL_ONCE' });
    const retry = await h
      .as()
      .post('/api/analytics/reports')
      .send({ filter: input, ...options, format: 'PDF' });
    expect(retry.status).toBe(200);
    expect(retry.headers['x-report-attempts']).toBe('2');
    await h.as().put('/api/dev/pdf-exporter').send({ mode: 'FAIL_ALWAYS' });
    const failed = await h
      .as()
      .post('/api/analytics/reports')
      .send({ filter: input, ...options, format: 'PDF' });
    expect(failed.status).toBe(503);
    expect(failed.body.error.details.csvAvailable).toBe(true);
    expect(
      (
        await h
          .as()
          .post('/api/analytics/reports')
          .send({ filter: input, ...options })
      ).status,
    ).toBe(200);
  });
  it('UC-4 dev route is absent in production', async () => {
    const store = new MemoryAnalyticsStore();
    const h = createModuleHarness((ctx) =>
      createAnalyticsModule({ ...ctx, config: { env: 'production', isProduction: true } }, store),
    );
    expect((await h.as().put('/api/dev/pdf-exporter').send({ mode: 'OK' })).status).toBe(404);
  });
});
describe('UC-4 Observer projection handlers', () => {
  const warning: WarningIssued = {
    type: 'WarningIssued',
    warningId: 'warning',
    hazardType: 'FLOOD',
    severity: 'HIGH',
    targetArea: { type: 'DISTRICT', id: 'RATNAPURA', district: 'RATNAPURA', name: 'Ratnapura' },
    issuedAt: alert.at,
    targetedCitizens: alert.targeted,
    reached: alert.reached,
    pendingRetry: alert.pendingRetry,
    failed: alert.failed,
    byChannel: alert.byChannel,
  };
  const allocation: AllocationDeployed = {
    type: 'AllocationDeployed',
    allocationId: 'allocation',
    district: 'RATNAPURA',
    affectedAreaId: 'area',
    organizationId: dispatch.organizationId,
    organizationName: dispatch.organizationName,
    organizationType: 'NGO',
    supplyCategory: dispatch.supplyCategory,
    quantity: dispatch.quantity,
    unit: dispatch.unit,
    deployedAt: dispatch.at,
  };
  it('UC-4 WarningIssued: new catalog entry, counts, idempotence and bus integration', async () => {
    const h = harness();
    h.store.events.clear();
    await h.events.publish(warning);
    await h.events.publish(warning);
    expect(h.store.alerts.size).toBe(2);
    expect(h.store.alerts.get('warning')).toMatchObject({
      reached: 80,
      pendingRetry: 10,
      failed: 10,
    });
    expect(h.store.events.size).toBe(1);
    expect(h.events.handlerErrors).toEqual([]);
    await new WarningIssuedHandler(h.store).handle({
      ...warning,
      warningId: 'second',
      hazardType: 'LANDSLIDE',
    });
    expect(h.store.events.size).toBe(2);
  });
  it('UC-4 AllocationDeployed: window association, unknown hazard and idempotence', async () => {
    const h = harness();
    await h.events.publish(allocation);
    await h.events.publish(allocation);
    expect(h.store.dispatches.get('allocation')).toMatchObject({
      eventId: 'flood',
      hazardType: 'FLOOD',
    });
    expect(h.store.dispatches.size).toBe(2);
    await new AllocationDeployedHandler(h.store).handle({
      ...allocation,
      allocationId: 'unmatched',
      district: 'JAFFNA',
    });
    expect(h.store.dispatches.get('unmatched')).toMatchObject({ hazardType: 'UNKNOWN' });
    await new WarningIssuedHandler(h.store).handle({
      ...warning,
      warningId: 'otherdate',
      issuedAt: '2026-10-01',
    });
    expect(h.store.events.size).toBe(2);
    h.store.events.set('overlap', { ...event, eventId: 'overlap' });
    await new AllocationDeployedHandler(h.store).handle({
      ...allocation,
      allocationId: 'ambiguous',
    });
    expect(h.store.dispatches.get('ambiguous')?.eventId).toBeUndefined();
  });
});
