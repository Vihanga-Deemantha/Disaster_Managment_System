import { createWarningsHarness } from '../../testing/harness';
import {
  aRecipient,
  aTargetArea,
  aWarning,
  citizens,
  HOUR,
  MESSAGES,
  NOW,
} from '../../testing/builders';

const OFFICER = 'usr-dmc-1';
const later = (ms: number): Date => new Date(NOW.getTime() + ms);

describe('UC-1 step 1: WarningController.listWarnings', () => {
  async function filled() {
    const h = createWarningsHarness();
    await h.add(aWarning({ warningId: 'W-old' }, NOW));
    await h.add(aWarning({ warningId: 'W-new' }, later(2 * HOUR)));
    await h.add(aWarning({ warningId: 'W-mid' }, later(HOUR)));
    return h;
  }

  it('UC-1 step 1: lists the warnings waiting for approval, newest first', async () => {
    const h = await filled();

    const list = await h.controller.listWarnings('PENDING_APPROVAL');

    expect(list.map((w) => w.warningId)).toEqual(['W-new', 'W-mid', 'W-old']);
  });

  it('UC-1 step 1: leaves out the warnings that are no longer pending when asked for pending ones', async () => {
    const h = await filled();
    await h.controller.rejectWarning('W-mid', OFFICER, 'Duplicate of W-9');

    const pending = await h.controller.listWarnings('PENDING_APPROVAL');
    const rejected = await h.controller.listWarnings('REJECTED');

    expect(pending.map((w) => w.warningId)).toEqual(['W-new', 'W-old']);
    expect(rejected.map((w) => w.warningId)).toEqual(['W-mid']);
  });

  it('UC-1 step 1: lists every status when none is asked for', async () => {
    const h = await filled();
    await h.controller.rejectWarning('W-mid', OFFICER, 'Duplicate of W-9');

    expect(await h.controller.listWarnings()).toHaveLength(3);
  });

  it('UC-1 step 1: an empty list is just empty', async () => {
    expect(await createWarningsHarness().controller.listWarnings('PENDING_APPROVAL')).toEqual([]);
  });
});

describe('UC-1 step 2: WarningController.getWarningForReview', () => {
  it('UC-1 step 2: returns the warning, the estimate per channel and what is still wrong', async () => {
    const h = createWarningsHarness({
      recipients: [
        ...citizens(2),
        aRecipient({ citizenId: 'c-3', deviceToken: undefined, whatsappOptIn: true }),
        aRecipient({ citizenId: 'c-4', deviceToken: undefined, phone: undefined }),
      ],
    });
    await h.add(aWarning({ messages: { ...MESSAGES, TA: '' } }));

    const review = await h.controller.getWarningForReview('W-1');

    expect(review.warning.warningId).toBe('W-1');
    expect(review.recipients).toEqual({
      total: 4,
      unreachable: 1,
      byChannel: { PUSH: 2, SMS: 3, WHATSAPP: 1, EMAIL: 0 },
    });
    expect(review.validation).toEqual({
      ok: false,
      errors: [{ field: 'messages.TA', code: 'MESSAGE_REQUIRED' }],
    });
  });

  it('UC-1 step 2 (SD1-03): counts a citizen once even when two target areas overlap', async () => {
    const h = createWarningsHarness({
      recipients: [aRecipient({ citizenId: 'both', riverBasinId: 'basin-kelani' })],
    });
    await h.add(
      aWarning({
        targetAreas: [
          aTargetArea(),
          aTargetArea({ areaId: 'basin-kelani', type: 'RIVER_BASIN', name: 'Kelani Ganga' }),
        ],
      }),
    );

    const review = await h.controller.getWarningForReview('W-1');

    expect(review.recipients.total).toBe(1);
  });

  it('UC-1 step 2: judges validity against the clock, so a warning that has since expired is flagged', async () => {
    const h = createWarningsHarness({ recipients: [aRecipient()] });
    await h.add();
    h.clock.advance(25 * HOUR);

    const review = await h.controller.getWarningForReview('W-1');

    expect(review.validation.errors).toEqual([{ field: 'validTo', code: 'VALIDITY_EXPIRED' }]);
  });

  it('UC-1 step 2: reports an unknown warning as not found', async () => {
    await expect(
      createWarningsHarness().controller.getWarningForReview('nope'),
    ).rejects.toMatchObject({
      code: 'WARNING_NOT_FOUND',
      kind: 'NOT_FOUND',
      message: 'There is no warning with this id.',
    });
  });
});

describe('UC-1 A4: cancelling at the confirmation', () => {
  it('UC-1 A4: looking at a warning and then cancelling sends nothing and changes nothing', async () => {
    const h = createWarningsHarness({ recipients: citizens(3) });
    await h.add();

    await h.controller.getWarningForReview('W-1');
    // The officer reads the confirmation, then cancels: the screen simply never calls issueWarning.

    expect(h.warnings.stored('W-1')).toMatchObject({ status: 'PENDING_APPROVAL', version: 1 });
    expect(h.gateways.PUSH.calls).toHaveLength(0);
    expect(h.gateways.SMS.calls).toHaveLength(0);
    expect(h.events.published).toEqual([]);
    expect(h.audit.entries).toEqual([]);
  });
});

describe('UC-1 A2: WarningController.updateWarning', () => {
  it('UC-1 A2: saves the edit, bumps the version, and says what is now valid', async () => {
    const h = createWarningsHarness({ recipients: [aRecipient()] });
    await h.add(aWarning({ messages: { ...MESSAGES, TA: '' } }));

    const review = await h.controller.updateWarning(
      'W-1',
      OFFICER,
      { messages: { TA: 'புதிய எச்சரிக்கை' }, severity: 'CRITICAL' },
      1,
    );

    expect(review.validation.ok).toBe(true);
    expect(review.warning.version).toBe(2);
    expect(h.warnings.stored('W-1')).toMatchObject({
      severity: 'CRITICAL',
      version: 2,
      messages: { ...MESSAGES, TA: 'புதிய எச்சரிக்கை' },
    });
  });

  it('UC-1 A2: still shows what is wrong when the edit leaves the warning incomplete', async () => {
    const h = createWarningsHarness({ recipients: [aRecipient()] });
    await h.add();

    const review = await h.controller.updateWarning('W-1', OFFICER, { messages: { SI: '' } }, 1);

    expect(review.validation.errors).toEqual([{ field: 'messages.SI', code: 'MESSAGE_REQUIRED' }]);
  });

  it('UC-1 A2 / BR4: audits who changed what, naming the fields but never copying the text', async () => {
    const h = createWarningsHarness({ recipients: [aRecipient()] });
    await h.add();

    await h.controller.updateWarning(
      'W-1',
      OFFICER,
      {
        messages: { EN: 'A brand new English text.', SI: MESSAGES.SI },
        validTo: later(48 * HOUR),
        severity: 'LOW',
      },
      1,
    );

    expect(h.audit.find('warning.updated')).toMatchObject({
      actorId: OFFICER,
      actorRole: 'DMC_OFFICER',
      subjectId: 'W-1',
      details: { fields: ['messages.SI', 'messages.EN', 'severity', 'validTo'] },
    });
    expect(JSON.stringify(h.audit.entries)).not.toContain('brand new');
  });

  it('UC-1 A2: an edit that names no field is recorded as touching none', async () => {
    const h = createWarningsHarness({ recipients: [aRecipient()] });
    await h.add();

    await h.controller.updateWarning(
      'W-1',
      OFFICER,
      { validFrom: later(HOUR), validTo: later(30 * HOUR) },
      1,
    );

    expect(h.audit.find('warning.updated')?.details).toEqual({ fields: ['validFrom', 'validTo'] });
  });

  it('UC-1 A2: refuses an edit made from an out-of-date copy, and changes nothing', async () => {
    const h = createWarningsHarness({ recipients: [aRecipient()] });
    await h.add();
    await h.controller.updateWarning('W-1', OFFICER, { severity: 'LOW' }, 1);

    await expect(
      h.controller.updateWarning('W-1', 'usr-dmc-2', { severity: 'CRITICAL' }, 1),
    ).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
      kind: 'CONFLICT',
      message: 'This warning was changed by someone else. Reload it and try again.',
    });

    expect(h.warnings.stored('W-1')).toMatchObject({ severity: 'LOW', version: 2 });
  });

  it('UC-1 A2: an out-of-date copy of a warning that has since been rejected is a version conflict first', async () => {
    const h = createWarningsHarness({ recipients: [aRecipient()] });
    await h.add();
    await h.controller.rejectWarning('W-1', OFFICER, 'Duplicate');

    await expect(
      h.controller.updateWarning('W-1', 'usr-dmc-2', { severity: 'CRITICAL' }, 1),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  });

  it('UC-1 A2: loses cleanly when someone saves between reading and writing', async () => {
    const h = createWarningsHarness({ recipients: [aRecipient()] });
    await h.add();
    jest.spyOn(h.warnings, 'save').mockResolvedValueOnce(false);

    await expect(
      h.controller.updateWarning('W-1', OFFICER, { severity: 'LOW' }, 1),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });

    expect(h.audit.entries).toEqual([]);
  });

  it.each(['rejected', 'being issued'] as const)(
    'UC-1 A2: refuses to edit a warning that is %s',
    async (state) => {
      const h = createWarningsHarness({ recipients: [aRecipient()] });
      await h.add();
      if (state === 'rejected') await h.controller.rejectWarning('W-1', OFFICER, 'Duplicate');
      else {
        const stored = await h.warnings.findById('W-1');
        stored?.approve(OFFICER, NOW);
        await h.warnings.save(stored!, 1);
      }
      const version = h.warnings.stored('W-1')?.version as number;

      await expect(
        h.controller.updateWarning('W-1', OFFICER, { severity: 'LOW' }, version),
      ).rejects.toMatchObject({ code: 'WARNING_NOT_PENDING' });
    },
  );

  it('UC-1 A2: reports an unknown warning as not found', async () => {
    await expect(
      createWarningsHarness().controller.updateWarning('nope', OFFICER, {}, 1),
    ).rejects.toMatchObject({ code: 'WARNING_NOT_FOUND' });
  });
});

describe('UC-1 A3: WarningController.rejectWarning', () => {
  it('UC-1 A3: rejects with a reason, and the reason stays with the warning', async () => {
    const h = createWarningsHarness();
    await h.add();
    h.clock.advance(5 * 60_000);

    const warning = await h.controller.rejectWarning('W-1', OFFICER, '  Duplicate of W-9  ');

    expect(warning.status).toBe('REJECTED');
    expect(h.warnings.stored('W-1')).toMatchObject({
      status: 'REJECTED',
      rejectedBy: OFFICER,
      rejectedAt: later(5 * 60_000),
      rejectionReason: 'Duplicate of W-9',
    });
  });

  it('UC-1 A3 / BR4: audits the rejection with its reason', async () => {
    const h = createWarningsHarness();
    await h.add();

    await h.controller.rejectWarning('W-1', OFFICER, 'Duplicate of W-9');

    expect(h.audit.find('warning.rejected')).toMatchObject({
      actorId: OFFICER,
      subjectId: 'W-1',
      reason: 'Duplicate of W-9',
    });
  });

  it('UC-1 A3 / BR4: audits the reason without the spaces around it', async () => {
    const h = createWarningsHarness();
    await h.add();

    await h.controller.rejectWarning('W-1', OFFICER, '   Duplicate of W-9\n');

    expect(h.audit.find('warning.rejected')?.reason).toBe('Duplicate of W-9');
  });

  it('UC-1 A3: nothing is sent or published when a warning is rejected', async () => {
    const h = createWarningsHarness({ recipients: citizens(2) });
    await h.add();

    await h.controller.rejectWarning('W-1', OFFICER, 'Duplicate of W-9');

    expect(h.gateways.PUSH.calls).toHaveLength(0);
    expect(h.events.published).toEqual([]);
  });

  it.each(['', '   '])(
    'UC-1 A3: refuses to reject without a reason (%j), and the warning stays pending',
    async (reason) => {
      const h = createWarningsHarness();
      await h.add();

      await expect(h.controller.rejectWarning('W-1', OFFICER, reason)).rejects.toMatchObject({
        kind: 'VALIDATION',
        fields: [{ field: 'reason', code: 'REASON_REQUIRED' }],
      });

      expect(h.warnings.stored('W-1')?.status).toBe('PENDING_APPROVAL');
      expect(h.audit.entries).toEqual([]);
    },
  );

  it('UC-1 A3: cannot reject a warning that was already issued', async () => {
    const h = createWarningsHarness({ recipients: [aRecipient()] });
    await h.add();
    await h.controller.issueWarning('W-1', OFFICER, { optionalChannels: [] });

    await expect(h.controller.rejectWarning('W-1', 'usr-dmc-2', 'Too late')).rejects.toMatchObject({
      code: 'WARNING_NOT_PENDING',
    });
  });

  it('UC-1 A3: loses cleanly when someone saves between reading and writing', async () => {
    const h = createWarningsHarness();
    await h.add();
    jest.spyOn(h.warnings, 'save').mockResolvedValueOnce(false);

    await expect(h.controller.rejectWarning('W-1', OFFICER, 'Duplicate')).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
    });

    expect(h.audit.entries).toEqual([]);
  });

  it('UC-1 A3: reports an unknown warning as not found', async () => {
    await expect(
      createWarningsHarness().controller.rejectWarning('nope', OFFICER, 'x'),
    ).rejects.toMatchObject({ code: 'WARNING_NOT_FOUND' });
  });
});
