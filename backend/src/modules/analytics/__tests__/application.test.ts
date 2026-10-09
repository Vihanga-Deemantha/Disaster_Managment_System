import { AnalyticsController } from '../application/AnalyticsController';
import { AccessScope } from '../application/AccessScope';
import {
  AudienceRedactor,
  ImpactReportBuilder,
  validateExportOptions,
} from '../application/ImpactReportBuilder';
import {
  CsvReportExporter,
  PdfReportExporter,
  PdfWriter,
  ReportExporterFactory,
  Sha256ChecksumCalculator,
  csvCell,
} from '../infrastructure/ReportExporters';
import { MemoryAnalyticsStore } from '../testing/MemoryAnalyticsStore';
import { event, input, dmc, alert, occupancy, dispatch } from '../testing/fixtures';
import { FixedClock } from '@shared/time/Clock';
import { SequentialIdGenerator } from '@shared/ids/IdGenerator';
import { InMemoryAuditLog } from '@shared/audit/AuditLog';
import type { ExportOptions } from '../domain/types';

const options: ExportOptions = {
  format: 'PDF',
  audience: 'INTERNAL',
  datasets: ['alerts', 'occupancy', 'distribution'],
};
function harness() {
  const store = new MemoryAnalyticsStore();
  store.events.set(event.eventId, event);
  store.alerts.set(alert.id, alert);
  store.occupancy.set(occupancy.id, occupancy);
  store.dispatches.set(dispatch.id, dispatch);
  store.dispatches.set('other', {
    ...dispatch,
    id: 'other',
    organizationId: 'army',
    organizationName: 'Army',
  });
  const audit = new InMemoryAuditLog();
  const clock = new FixedClock();
  const pdf = new PdfReportExporter(new PdfWriter());
  const checksum = new Sha256ChecksumCalculator();
  const controller = new AnalyticsController({
    store,
    audit,
    clock,
    ids: new SequentialIdGenerator(),
    scope: new AccessScope(audit, clock),
    checksum,
    exporters: new ReportExporterFactory(pdf, new CsvReportExporter()),
  });
  return { controller, store, pdf, checksum, audit, clock };
}
describe('UC-4 AnalyticsController', () => {
  it('UC-4 step 2: latest event is selected even when catalog insertion order is oldest first', async () => {
    const h = harness();
    h.store.events.clear();
    h.store.events.set('old', {
      ...event,
      eventId: 'old',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    });
    h.store.events.set(event.eventId, event);
    expect((await h.controller.getSummary(dmc)).filter.eventId).toBe('flood');
  });
  it('UC-4 steps 2â€“8: recent-event summary uses all read models and the same filter', async () => {
    const h = harness();
    h.store.events.set('old', {
      ...event,
      eventId: 'old',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    });
    const readers = [
      jest.spyOn(h.store, 'countReach'),
      jest.spyOn(h.store, 'occupancySeries'),
      jest.spyOn(h.store, 'distributionByDistrict'),
    ];
    const result = await h.controller.getSummary(dmc);
    expect(result.filter.eventId).toBe('flood');
    expect(result.metrics.recordCount).toBe(4);
    expect(result.metrics.totals).toMatchObject({
      alertsIssued: 1,
      reachPct: 80,
      peakOccupancy: 75,
      reliefDistributed: [{ unit: 'kits', quantity: 200 }],
    });
    expect(readers.map((r) => r.mock.calls[0]?.[0])).toEqual([
      readers[0]?.mock.calls[0]?.[0],
      readers[0]?.mock.calls[0]?.[0],
      readers[0]?.mock.calls[0]?.[0],
    ]);
  });
  it('UC-4 E1: invalid input does not reach the read models', async () => {
    const h = harness();
    const read = jest.spyOn(h.store, 'countReach');
    await expect(
      h.controller.fetchImpactData({ ...input, district: 'bad' }, dmc),
    ).rejects.toMatchObject({ code: 'INVALID_FILTER' });
    expect(read).not.toHaveBeenCalled();
  });
  it('UC-4 E2: empty catalog summary and query return zero records', async () => {
    const h = harness();
    h.store.events.clear();
    h.store.alerts.clear();
    h.store.occupancy.clear();
    h.store.dispatches.clear();
    expect((await h.controller.getSummary(dmc)).metrics.recordCount).toBe(0);
    await expect(
      h.controller.generateImpactReport({ ...input, eventId: undefined }, options, dmc),
    ).rejects.toMatchObject({ code: 'NO_DATA' });
    expect(h.store.history).toHaveLength(0);
  });
  it('UC-4 A1: relief scope never reduces public reach or occupancy', async () => {
    const h = harness();
    const ngo = { ...dmc, role: 'NGO_MANAGER' as const, organizationId: 'red-cross' };
    const result = await h.controller.fetchImpactData(input, ngo);
    expect(result.metrics.totals).toMatchObject({
      alertsIssued: 1,
      reachPct: 80,
      peakOccupancy: 75,
      reliefDistributed: [{ unit: 'kits', quantity: 100 }],
    });
    expect(result.metrics.allocations.map((row) => row.organizationId)).toEqual(['red-cross']);
  });
  it.each(['PDF', 'CSV'] as const)(
    'UC-4 step 12 / BR4: %s has exact file hash and fixed timestamp',
    async (format) => {
      const h = harness();
      const result = await h.controller.generateImpactReport(input, { ...options, format }, dmc);
      expect(result.metadata.checksum).toBe(h.checksum.calculate(result.bytes));
      expect(result.metadata).toMatchObject({
        generatedAt: h.clock.now().toISOString(),
        status: 'COMPLETED',
        attempts: 1,
        filter: input,
      });
      expect(h.store.history).toEqual([result.metadata]);
      expect(h.audit.entries[0]?.action).toBe('analytics.export.completed');
      expect(h.audit.entries[0]).toMatchObject({
        subjectType: 'ImpactReport',
        subjectId: result.metadata.reportId,
        details: { checksum: result.metadata.checksum, attempts: 1 },
      });
      expect(result.bytes.toString()).toContain(result.metadata.contentChecksum);
      if (format === 'PDF') expect(result.bytes.subarray(0, 4).toString()).toBe('%PDF');
      else expect(result.bytes.toString()).toContain('"dataset","id"');
    },
  );
  it('UC-4 A2: CSV path bypasses broken PDF exporter', async () => {
    const h = harness();
    h.pdf.setMode('FAIL_ALWAYS');
    const spy = jest.spyOn(h.pdf, 'export');
    await h.controller.generateImpactReport(input, { ...options, format: 'CSV' }, dmc);
    expect(spy).not.toHaveBeenCalled();
  });
  it('UC-4 E3: retries PDF once and succeeds', async () => {
    const h = harness();
    h.pdf.setMode('FAIL_ONCE');
    expect((await h.controller.generateImpactReport(input, options, dmc)).metadata).toMatchObject({
      attempts: 2,
      status: 'COMPLETED',
    });
  });
  it('UC-4 E3: two failures are logged and offer CSV', async () => {
    const h = harness();
    h.pdf.setMode('FAIL_ALWAYS');
    await expect(h.controller.generateImpactReport(input, options, dmc)).rejects.toMatchObject({
      code: 'EXPORT_FAILED',
      details: { csvAvailable: true, canRetry: true },
    });
    expect(h.store.history[0]).toMatchObject({ status: 'FAILED', attempts: 2 });
    expect(h.store.history[0]?.checksum).toBeUndefined();
    expect(h.audit.entries[0]?.action).toBe('analytics.export.failed');
    await expect(h.controller.generateImpactReport(input, options, dmc)).rejects.toMatchObject({
      message: 'Report generation failed after one automatic retry.',
    });
  });
  it.each(['INTERNAL', 'EXTERNAL'] as const)(
    'UC-4 A1 / BR3: NGO %s report only contains its organisation and public aggregates',
    async (audience) => {
      const h = harness();
      const user = {
        ...dmc,
        userId: 'ngo',
        role: 'NGO_MANAGER' as const,
        organizationId: 'red-cross',
      };
      const result = await h.controller.generateImpactReport(
        input,
        { ...options, format: 'CSV', audience },
        user,
      );
      expect(result.bytes.toString()).not.toContain('Army');
      expect(result.bytes.toString()).not.toContain('Private officer');
      expect(result.bytes.toString()).not.toContain('private-citizen');
      expect(result.bytes.toString()).not.toContain('failed');
      expect(await h.controller.getReports(user)).toHaveLength(1);
      expect(await h.controller.getReports({ ...user, userId: 'other' })).toHaveLength(0);
      expect(await h.controller.getReports(dmc)).toHaveLength(1);
    },
  );
  it('UC-4 A3: filters period/dataset and paginates stable event logs', async () => {
    const h = harness();
    h.store.alerts.set('older', { ...alert, id: 'older', at: '2026-09-01T12:00:00Z' });
    const all = await h.controller.getEventLog(input, dmc, 1);
    expect(all.total).toBe(5);
    expect(all.rows[0]?.at).toBe(alert.at);
    const selected = await h.controller.getEventLog(
      input,
      { ...dmc, role: 'DONOR', organizationId: 'red-cross' },
      1,
      'alerts',
      '2026-09-02',
    );
    expect(selected.total).toBe(1);
    expect(selected.rows[0]).not.toHaveProperty('citizenIdentifiers');
    expect((await h.controller.getEventLog(input, dmc, 2, 'alerts', '2026-09-03')).rows).toEqual(
      [],
    );
  });
  it.each([0, -1, 1.5, NaN])('UC-4 A3: rejects invalid page %s', async (page) => {
    await expect(harness().controller.getEventLog(input, dmc, page)).rejects.toMatchObject({
      kind: 'VALIDATION',
    });
  });
  it('UC-4 A3: rejects invalid dataset', async () => {
    await expect(harness().controller.getEventLog(input, dmc, 1, 'invalid')).rejects.toMatchObject({
      kind: 'VALIDATION',
    });
  });
  it.each([
    [0, undefined, 'page', 'Page must be a positive integer.'],
    [1, 'bad', 'dataset', 'Unknown dataset.'],
  ] as const)(
    'UC-4 A3: invalid paging/dataset gives useful field diagnostics (%s %s)',
    async (page, dataset, field, message) => {
      await expect(
        harness().controller.getEventLog(input, dmc, page, dataset),
      ).rejects.toMatchObject({ fields: [{ code: 'INVALID_FILTER', field, message }] });
    },
  );
  it('UC-4 A3: internal DMC details, chronological order and actual second-page slicing', async () => {
    const h = harness();
    h.store.alerts.clear();
    h.store.dispatches.clear();
    h.store.occupancy.clear();
    for (let i = 0; i < 25; i++)
      h.store.alerts.set(`a${i}`, {
        ...alert,
        id: `a${String(i).padStart(2, '0')}`,
        at: i < 10 ? '2026-09-02T12:00:00Z' : '2026-09-03T12:00:00Z',
      });
    const first = await h.controller.getEventLog(input, dmc, 1, 'alerts');
    const second = await h.controller.getEventLog(input, dmc, 2, 'alerts');
    expect(first.rows.map((r) => r.id)).toEqual(
      Array.from({ length: 15 }, (_, i) => `a${i + 10}`).concat([
        'a00',
        'a01',
        'a02',
        'a03',
        'a04',
      ]),
    );
    expect(second.rows.map((r) => r.id)).toEqual(['a05', 'a06', 'a07', 'a08', 'a09']);
    expect(first.rows[0]).toHaveProperty('officerName', 'Private officer');
    expect((await h.controller.getEventLog(input, dmc, 1, 'alerts', '2026-09-02')).total).toBe(10);
  });
  it.each(['occupancy', 'distribution'] as const)(
    'UC-4 A3: accepts dataset %s',
    async (dataset) => {
      expect(
        (await harness().controller.getEventLog(input, dmc, 1, dataset)).total,
      ).toBeGreaterThan(0);
    },
  );
  it('UC-4 export: selected dataset with records succeeds even if other selected dataset is empty', async () => {
    const h = harness();
    h.store.occupancy.clear();
    expect((await h.controller.generateImpactReport(input, options, dmc)).metadata.status).toBe(
      'COMPLETED',
    );
    await expect(
      h.controller.generateImpactReport(input, { ...options, datasets: ['occupancy'] }, dmc),
    ).rejects.toMatchObject({
      message: 'No records in the selected datasets. Widen your filters.',
    });
  });
});
describe('UC-4 BR3 / A2 report strategies', () => {
  it.each([
    ['format', 'Choose PDF or CSV.', { format: 'X' }],
    ['audience', 'Choose an audience.', { audience: 'X' }],
    ['datasets', 'Select at least one valid dataset.', { datasets: ['alerts', 'invalid'] }],
  ] as const)('UC-4 BR3: invalid %s gives actionable diagnostics', (field, message, change) => {
    try {
      validateExportOptions({ ...options, ...change } as unknown as ExportOptions);
      throw new Error('invalid accepted');
    } catch (error) {
      expect(error).toMatchObject({ fields: [{ code: 'INVALID_FILTER', field, message }] });
    }
  });
  it('UC-4 report Builder: title and checksum placeholder are deterministic', () => {
    expect(new ImpactReportBuilder('r', input, options, 'time').build()).toEqual({
      reportId: 'r',
      filter: input,
      options,
      generatedAt: 'time',
      title: 'Post-Event Impact & Relief Report',
      contentChecksum: '',
      sections: {},
    });
  });
  const facts = { alerts: [alert], occupancy: [occupancy], distribution: [dispatch] };
  it('UC-4 BR3: internal keeps private fields and unselected datasets are removed', () => {
    expect(new AudienceRedactor().redact(facts, options)).toEqual(facts);
    expect(
      new AudienceRedactor().redact(facts, { ...options, audience: 'EXTERNAL', datasets: [] }),
    ).toEqual({});
    expect(new AudienceRedactor().redact(facts, { ...options, datasets: ['alerts'] })).toEqual({
      alerts: [alert],
    });
  });
  it.each([
    { format: 'X' },
    { audience: 'X' },
    { datasets: [] },
    { datasets: ['bad'] },
    { datasets: undefined },
  ])('UC-4 export: invalid options %j rejected', (change) => {
    expect(() => validateExportOptions({ ...options, ...change } as ExportOptions)).toThrow();
  });
  it('UC-4 A2: factory rejects unsupported formats', () => {
    expect(() =>
      new ReportExporterFactory(
        new PdfReportExporter(new PdfWriter()),
        new CsvReportExporter(),
      ).create('XLS'),
    ).toThrow();
  });
  it('UC-4 A2: CSV escapes commas, quotes, newlines and formula values', async () => {
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
    expect(csvCell('=SUM(A1)')).toBe('"\'=SUM(A1)"');
    expect(csvCell(undefined)).toBe('""');
    const model = new ImpactReportBuilder('r', input, options, 'fixed')
      .withSections({ alerts: [] })
      .withChecksum('checksum')
      .build();
    const csv = await new CsvReportExporter().export(model);
    expect(csv.toString()).toContain('contentChecksum');
    expect(csv.toString()).toContain('"dataset"');
    expect(
      new PdfWriter().write(['', 'Unicode: à·ƒà·’à¶‚à·„à¶½', '(a) \\ test']).toString(),
    ).toContain('xref');
  });
});
