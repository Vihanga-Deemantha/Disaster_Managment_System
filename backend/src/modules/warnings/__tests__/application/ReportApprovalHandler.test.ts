import { ReportApprovalHandler } from '../../application/ReportApprovalHandler';
import { createWarningsHarness } from '../../testing/harness';
import { aRecipient, NOW } from '../../testing/builders';

function setup() {
  const h = createWarningsHarness({ recipients: [aRecipient()] });
  const handler = new ReportApprovalHandler({
    warnings: h.warnings,
    events: h.events,
    audit: h.audit,
    clock: h.clock,
  });
  return { ...h, handler };
}

const event = {
  type: 'HazardReportApproved' as const,
  reportId: 'report-1',
  hazardType: 'FLOOD' as const,
  proposedSeverity: 'MEDIUM' as const,
  targetArea: {
    type: 'DISTRICT' as const,
    id: 'GAMPAHA',
    name: 'Gampaha',
    district: 'GAMPAHA' as const,
  },
  approvedBy: 'usr-dmc-1',
  approvedByRole: 'DMC_OFFICER' as const,
  occurredAt: NOW.toISOString(),
};

describe('UC-3 report approval to DMC Pending Approvals', () => {
  it('registers with the event bus, and unsubscribing stops creating requests', async () => {
    const h = setup();
    const stop = h.handler.register();
    await h.events.publish(event);
    stop();
    await h.events.publish({ ...event, reportId: 'after-unsubscribe' });
    expect(await h.warnings.findByStatus()).toHaveLength(1);
  });

  it('a simultaneous insertion is treated as replay, while an unrelated storage failure is reported', async () => {
    const h = setup();
    const insert = h.warnings.insert.bind(h.warnings);
    jest.spyOn(h.warnings, 'insert').mockImplementationOnce(async (warning) => {
      await insert(warning);
      throw new Error('Concurrent duplicate id');
    });
    await expect(h.handler.handle(event)).resolves.toBeUndefined();
    expect(await h.warnings.findByStatus()).toHaveLength(1);
    jest.spyOn(h.warnings, 'insert').mockRejectedValueOnce(new Error('Database unavailable'));
    await expect(h.handler.handle({ ...event, reportId: 'another-report' })).rejects.toThrow(
      'Database unavailable',
    );
  });
  it.each(['FLOOD', 'LANDSLIDE', 'ROAD_BLOCKAGE', 'OTHER'] as const)(
    'creates a pending request for an approved %s report without sending alerts',
    async (hazardType) => {
      const h = setup();
      await h.handler.handle({ ...event, hazardType });
      const [warning] = await h.warnings.findByStatus('PENDING_APPROVAL');
      expect(warning?.snapshot()).toMatchObject({
        sourceReportId: 'report-1',
        hazardType,
        submittedBy: 'usr-dmc-1',
        status: 'PENDING_APPROVAL',
        severity: 'MEDIUM',
      });
      expect(h.gateways.SMS.calls).toHaveLength(0);
      expect(h.audit.entries[0]).toMatchObject({ actorRole: 'DMC_OFFICER' });
    },
  );

  it('repeated delivery of approval creates only one request and never resets an edited draft', async () => {
    const h = setup();
    await h.handler.handle(event);
    const [warning] = await h.warnings.findByStatus();
    await h.controller.updateWarning(warning!.warningId, event.approvedBy, { severity: 'HIGH' }, 1);
    await h.handler.handle(event);
    const warnings = await h.warnings.findByStatus();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.severity).toBe('HIGH');
  });

  it('each report creates its own request, and the approving DMC officer can issue after completing the text', async () => {
    const h = setup();
    await h.handler.handle(event);
    await h.handler.handle({ ...event, reportId: 'report-2', approvedByRole: 'DUTY_OFFICER' });
    const warnings = await h.warnings.findByStatus();
    expect(warnings).toHaveLength(2);
    const warning = warnings.find((item) => item.snapshot().sourceReportId === 'report-1')!;
    await h.controller.updateWarning(
      warning.warningId,
      event.approvedBy,
      { messages: { SI: 'සිංහල පණිවිඩය', TA: 'தமிழ் செய்தி', EN: 'Approved flood warning.' } },
      1,
    );
    const result = await h.controller.issueWarning(warning.warningId, event.approvedBy, {
      optionalChannels: [],
    });
    expect(result.warning.snapshot()).toMatchObject({
      status: 'ISSUED',
      approvedBy: event.approvedBy,
    });
    expect(h.audit.entries.some((entry) => entry.actorRole === 'DUTY_OFFICER')).toBe(true);
  });
});
