import type { ClusterEscalationRequested } from '@shared/contracts/events';
import { DEFAULT_VALIDITY_MS } from '../../application/EscalationRequestHandler';
import { createWarningsHarness } from '../../testing/harness';
import { aRecipient, aWarning, NOW } from '../../testing/builders';

const escalation = (
  overrides: Partial<ClusterEscalationRequested> = {},
): ClusterEscalationRequested => ({
  type: 'ClusterEscalationRequested',
  clusterId: 'cluster-7',
  hazardType: 'FLOOD',
  proposedSeverity: 'HIGH',
  targetArea: { type: 'DISTRICT', id: 'GAMPAHA', name: 'Gampaha', district: 'GAMPAHA' },
  centroid: { lat: 7.09, lng: 80.0 },
  verifiedReportCount: 6,
  totalReportCount: 9,
  priorityScore: 82,
  requestedBy: 'usr-duty-1',
  occurredAt: NOW.toISOString(),
  ...overrides,
});

describe('UC-1 step 23 of UC-3 / D4: EscalationRequestHandler', () => {
  it('records DMC escalation requests with the actual approving role', async () => {
    const h = createWarningsHarness();
    await h.handler.handle(escalation({ requestedByRole: 'DMC_OFFICER' }));
    expect(h.audit.entries[0]).toMatchObject({ actorRole: 'DMC_OFFICER' });
  });
  it('UC-3 step 23: a confirmed escalation puts a draft in Pending Approvals, linked to its cluster', async () => {
    const h = createWarningsHarness();

    await h.handler.handle(escalation());

    const [draft] = await h.controller.listWarnings('PENDING_APPROVAL');
    expect(draft?.snapshot()).toMatchObject({
      warningId: 'id-1',
      status: 'PENDING_APPROVAL',
      hazardType: 'FLOOD',
      severity: 'HIGH',
      sourceClusterId: 'cluster-7',
      submittedBy: 'usr-duty-1',
      submittedAt: NOW,
      version: 1,
    });
    expect(draft?.targetAreas.map((area) => area.toRef())).toEqual([
      { type: 'DISTRICT', id: 'GAMPAHA', name: 'Gampaha', district: 'GAMPAHA' },
    ]);
  });

  it('UC-3 step 23: the draft is valid for a day from now, unless an officer changes it', async () => {
    const h = createWarningsHarness();

    await h.handler.handle(escalation());

    const draft = (await h.warnings.findByStatus('PENDING_APPROVAL'))[0]?.snapshot();
    expect(draft?.validFrom).toEqual(NOW);
    expect(draft?.validTo).toEqual(new Date(NOW.getTime() + DEFAULT_VALIDITY_MS));
  });

  it('UC-1 E1 / HCI-06a: the system writes English only; Sinhala and Tamil stay empty until a person writes them', async () => {
    const h = createWarningsHarness();

    await h.handler.handle(escalation({ hazardType: 'LANDSLIDE', proposedSeverity: 'CRITICAL' }));

    const review = await h.controller.getWarningForReview('id-1');
    expect(review.warning.smsText('EN')).toBe(
      'Landslide warning (CRITICAL) for Gampaha. Follow official instructions and move to a safe place.',
    );
    expect(review.validation.errors).toEqual([
      { field: 'messages.SI', code: 'MESSAGE_REQUIRED' },
      { field: 'messages.TA', code: 'MESSAGE_REQUIRED' },
    ]);
  });

  it('UC-1 E1: a draft cannot be issued until the missing languages are written', async () => {
    const h = createWarningsHarness({ recipients: [aRecipient()] });
    await h.handler.handle(escalation());

    await expect(
      h.controller.issueWarning('id-1', 'usr-dmc-1', { optionalChannels: [] }),
    ).rejects.toMatchObject({ code: 'WARNING_NOT_VALID' });
  });

  it('UC-3 step 23 / BR2: the Duty Officer who confirmed it is the submitter, so a DMC Officer can approve it', async () => {
    const h = createWarningsHarness({ recipients: [aRecipient()] });
    await h.handler.handle(escalation());
    await h.controller.updateWarning(
      'id-1',
      'usr-dmc-1',
      { messages: { SI: 'සිංහල පණිවිඩය', TA: 'தமிழ் செய்தி' } },
      1,
    );

    const view = await h.controller.issueWarning('id-1', 'usr-dmc-1', { optionalChannels: [] });

    expect(view.warning.status).toBe('ISSUED');
  });

  it('UC-3 step 23: audits the draft as created by the Duty Officer, naming the cluster only', async () => {
    const h = createWarningsHarness();

    await h.handler.handle(escalation());

    expect(h.audit.find('warning.draft_created')).toMatchObject({
      actorId: 'usr-duty-1',
      actorRole: 'DUTY_OFFICER',
      subjectType: 'warning',
      subjectId: 'id-1',
      occurredAt: NOW,
      details: { clusterId: 'cluster-7', severity: 'HIGH' },
    });
  });

  it('UC-3 step 23: a second event for the same cluster updates the draft instead of duplicating it', async () => {
    const h = createWarningsHarness();
    await h.handler.handle(escalation({ proposedSeverity: 'MEDIUM' }));

    await h.handler.handle(escalation({ proposedSeverity: 'CRITICAL' }));

    const drafts = await h.warnings.findByStatus();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.severity).toBe('CRITICAL');
    expect(drafts[0]?.version).toBe(2);
    expect(h.audit.actions()).toEqual(['warning.draft_created', 'warning.escalation_updated']);
  });

  it.each([
    ['lower', 'LOW'],
    ['equal', 'HIGH'],
  ] as const)('UC-3 step 23: a %s severity never lowers the draft', async (_how, severity) => {
    const h = createWarningsHarness();
    await h.handler.handle(escalation({ proposedSeverity: 'HIGH' }));

    await h.handler.handle(escalation({ proposedSeverity: severity }));

    const [draft] = await h.warnings.findByStatus();
    expect(draft?.severity).toBe('HIGH');
    expect(draft?.version).toBe(1);
    expect(h.audit.actions()).toEqual(['warning.draft_created']);
  });

  it('UC-3 step 23: a different cluster gets its own draft', async () => {
    const h = createWarningsHarness();

    await h.handler.handle(escalation({ clusterId: 'cluster-1' }));
    await h.handler.handle(escalation({ clusterId: 'cluster-2' }));

    expect(await h.warnings.findByStatus()).toHaveLength(2);
  });

  it.each(['rejected', 'being issued', 'issued'] as const)(
    'UC-3 step 23: leaves a draft that is already %s alone, even for a higher severity',
    async (state) => {
      const h = createWarningsHarness({ recipients: [aRecipient()] });
      await h.add(aWarning({ sourceClusterId: 'cluster-7', severity: 'LOW' }));
      if (state === 'rejected') await h.controller.rejectWarning('W-1', 'usr-dmc-1', 'Duplicate');
      if (state === 'being issued') {
        const stored = await h.warnings.findById('W-1');
        stored?.approve('usr-dmc-1', NOW);
        await h.warnings.save(stored!, 1);
      }
      if (state === 'issued')
        await h.controller.issueWarning('W-1', 'usr-dmc-1', { optionalChannels: [] });
      const before = h.warnings.stored('W-1');

      await h.handler.handle(escalation({ proposedSeverity: 'CRITICAL' }));

      expect(h.warnings.stored('W-1')).toEqual(before);
      expect(await h.warnings.findByStatus()).toHaveLength(1);
    },
  );

  it('UC-3 step 23: reports a draft that someone changed while it was being updated, instead of losing the update', async () => {
    const h = createWarningsHarness();
    await h.handler.handle(escalation({ proposedSeverity: 'LOW' }));
    jest.spyOn(h.warnings, 'save').mockResolvedValueOnce(false);

    await expect(h.handler.handle(escalation({ proposedSeverity: 'HIGH' }))).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
      message: 'The draft was changed while it was being updated.',
    });
  });

  it('UC-3 step 23: listens on the event bus, and a failing handler never breaks the publisher', async () => {
    const h = createWarningsHarness();
    const stop = h.handler.register();

    await h.events.publish(escalation());

    expect(await h.warnings.findByStatus()).toHaveLength(1);

    stop();
    await h.events.publish(escalation({ clusterId: 'cluster-8' }));
    expect(await h.warnings.findByStatus()).toHaveLength(1);
  });

  it('UC-3 step 23: when saving the draft fails, the bus records the failure and the publisher carries on', async () => {
    const h = createWarningsHarness();
    h.handler.register();
    jest.spyOn(h.warnings, 'insert').mockRejectedValueOnce(new Error('database is down'));

    await expect(h.events.publish(escalation())).resolves.toBeUndefined();

    expect(h.events.handlerErrors).toHaveLength(1);
  });
});
