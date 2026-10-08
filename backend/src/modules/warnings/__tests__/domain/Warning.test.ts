import { LANGUAGES } from '@shared/contracts/enums';
import { Warning } from '../../domain/Warning';
import {
  aTargetArea,
  aWarning,
  HOUR,
  MESSAGES,
  MINUTE,
  NOW,
  thrownBy,
} from '../../testing/builders';

const later = (ms: number): Date => new Date(NOW.getTime() + ms);

describe('UC-1 step 6 / E1: Warning.validate', () => {
  it('UC-1 step 6: accepts a complete warning that is waiting for approval', () => {
    expect(aWarning().validate(NOW)).toEqual({ ok: true, errors: [] });
  });

  it.each(LANGUAGES)(
    'UC-1 E1: rejects a missing %s message and names the field (HCI-06a)',
    (language) => {
      const warning = aWarning({ messages: { ...MESSAGES, [language]: '' } });

      const result = warning.validate(NOW);

      expect(result.ok).toBe(false);
      expect(result.errors).toEqual([{ field: `messages.${language}`, code: 'MESSAGE_REQUIRED' }]);
    },
  );

  it('UC-1 E1: treats a message of only spaces as missing', () => {
    const warning = aWarning({ messages: { ...MESSAGES, TA: '   \n ' } });

    expect(warning.validate(NOW).errors).toEqual([
      { field: 'messages.TA', code: 'MESSAGE_REQUIRED' },
    ]);
  });

  it('UC-1 E1: allows an SMS of exactly 160 characters', () => {
    const warning = aWarning({ messages: { ...MESSAGES, EN: 'a'.repeat(160) } });

    expect(warning.validate(NOW).ok).toBe(true);
  });

  it('UC-1 E1: rejects an SMS of 161 characters', () => {
    const warning = aWarning({ messages: { ...MESSAGES, EN: 'a'.repeat(161) } });

    expect(warning.validate(NOW).errors).toEqual([{ field: 'messages.EN', code: 'SMS_TOO_LONG' }]);
  });

  it('UC-1 E1: ignores spaces around the text when counting the 160 characters', () => {
    const warning = aWarning({ messages: { ...MESSAGES, EN: `  ${'a'.repeat(160)}  ` } });

    expect(warning.validate(NOW).ok).toBe(true);
  });

  it('UC-1 E1: counts characters as people do, not UTF-16 units (160 emoji fit, 161 do not)', () => {
    const fits = aWarning({ messages: { ...MESSAGES, SI: '😀'.repeat(160) } });
    const tooLong = aWarning({ messages: { ...MESSAGES, SI: '😀'.repeat(161) } });

    expect(fits.validate(NOW).ok).toBe(true);
    expect(tooLong.validate(NOW).errors).toEqual([{ field: 'messages.SI', code: 'SMS_TOO_LONG' }]);
  });

  it('UC-1 E1: requires at least one target area', () => {
    const warning = aWarning({ targetAreas: [] });

    expect(warning.validate(NOW).errors).toEqual([
      { field: 'targetAreas', code: 'TARGET_AREA_REQUIRED' },
    ]);
  });

  it.each([
    ['ends before it starts', later(-HOUR)],
    ['ends the moment it starts', NOW],
  ])('UC-1 E1: rejects a validity window that %s', (_when, validTo) => {
    const warning = aWarning({ validFrom: NOW, validTo });

    expect(warning.validate(later(-2 * HOUR)).errors).toEqual([
      { field: 'validTo', code: 'VALIDITY_WINDOW_INVALID' },
    ]);
  });

  it('UC-1 E1: accepts a window that is one millisecond long, on the right side of the boundary', () => {
    const warning = aWarning({ validFrom: NOW, validTo: later(1) });

    expect(warning.validate(later(-HOUR)).ok).toBe(true);
  });

  it('UC-1 E1: rejects a warning whose validity ended before now', () => {
    const warning = aWarning({ validFrom: later(-2 * HOUR), validTo: later(-HOUR) });

    expect(warning.validate(NOW).errors).toEqual([{ field: 'validTo', code: 'VALIDITY_EXPIRED' }]);
  });

  it('UC-1 E1: counts a validity that ends exactly now as expired', () => {
    const warning = aWarning({ validFrom: later(-HOUR), validTo: NOW });

    expect(warning.validate(NOW).errors).toEqual([{ field: 'validTo', code: 'VALIDITY_EXPIRED' }]);
  });

  it('UC-1 E1: accepts a validity that ends one millisecond after now', () => {
    const warning = aWarning({ validFrom: later(-HOUR), validTo: later(1) });

    expect(warning.validate(NOW).ok).toBe(true);
  });

  it('UC-1 E1: reports a broken window once, not also as expired', () => {
    const warning = aWarning({ validFrom: later(-HOUR), validTo: later(-2 * HOUR) });

    expect(warning.validate(NOW).errors).toEqual([
      { field: 'validTo', code: 'VALIDITY_WINDOW_INVALID' },
    ]);
  });

  it('UC-1 E1: reports every problem at once so the screen can mark them all', () => {
    const warning = aWarning({
      messages: { SI: '', TA: '', EN: 'a'.repeat(200) },
      targetAreas: [],
    });

    expect(warning.validate(NOW).errors.map((issue) => issue.field)).toEqual([
      'messages.SI',
      'messages.TA',
      'messages.EN',
      'targetAreas',
    ]);
  });

  it('UC-1 E1: says a warning that was already issued or rejected is not pending', () => {
    const issued = aWarning();
    issued.approve('usr-dmc-1', NOW);
    issued.markIssued(NOW);
    const rejected = aWarning();
    rejected.reject('usr-dmc-1', 'Duplicate of W-9', NOW);

    expect(issued.validate(NOW).errors).toEqual([{ field: 'status', code: 'NOT_PENDING' }]);
    expect(rejected.validate(NOW).errors).toEqual([{ field: 'status', code: 'NOT_PENDING' }]);
  });
});

describe('UC-1 A2: Warning.update', () => {
  it('UC-1 A2: changes only what was given and keeps the rest', () => {
    const warning = aWarning();

    warning.update(
      { messages: { EN: 'Updated English text.' }, severity: 'CRITICAL' },
      later(MINUTE),
    );

    const state = warning.snapshot();
    expect(state.messages).toEqual({ ...MESSAGES, EN: 'Updated English text.' });
    expect(state.severity).toBe('CRITICAL');
    expect(state.validFrom).toEqual(NOW);
    expect(state.validTo).toEqual(later(24 * HOUR));
  });

  it('UC-1 A2: changes the validity window', () => {
    const warning = aWarning();

    warning.update({ validFrom: later(HOUR), validTo: later(5 * HOUR) }, later(MINUTE));

    expect(warning.snapshot()).toMatchObject({ validFrom: later(HOUR), validTo: later(5 * HOUR) });
  });

  it('UC-1 A2: ignores a message that is left undefined instead of blanking it', () => {
    const warning = aWarning();

    warning.update({ messages: { SI: undefined, TA: 'புதிய உரை' } }, later(MINUTE));

    expect(warning.snapshot().messages).toEqual({ ...MESSAGES, TA: 'புதிய உரை' });
  });

  it('UC-1 A2: bumps the version and the update time on every change', () => {
    const warning = aWarning();
    expect(warning.version).toBe(1);

    warning.update({ severity: 'LOW' }, later(MINUTE));

    expect(warning.version).toBe(2);
    expect(warning.snapshot().updatedAt).toEqual(later(MINUTE));
  });

  it('UC-1 A2: lets an officer save a draft that is not yet valid', () => {
    const warning = aWarning();

    warning.update({ messages: { SI: '' } }, later(MINUTE));

    expect(warning.validate(NOW).ok).toBe(false);
  });

  it.each([
    ['issued', 'This warning is no longer waiting for approval.'],
    ['rejected', 'This warning is no longer waiting for approval.'],
    ['being issued', 'This warning is already being issued.'],
  ] as const)('UC-1 A2: refuses to edit a warning that is %s', (state, message) => {
    const warning = aWarning();
    if (state === 'rejected') warning.reject('usr-dmc-1', 'Not needed', NOW);
    if (state === 'being issued') warning.approve('usr-dmc-1', NOW);
    if (state === 'issued') {
      warning.approve('usr-dmc-1', NOW);
      warning.markIssued(NOW);
    }
    const versionBefore = warning.version;

    const error = thrownBy(() => warning.update({ severity: 'LOW' }, later(MINUTE)));

    expect(error).toMatchObject({ code: 'WARNING_NOT_PENDING', kind: 'CONFLICT', message });
    expect(warning.version).toBe(versionBefore);
  });
});

describe('UC-1 step 7 / BR2: Warning.approve', () => {
  it('UC-1 step 7: records who approved and when', () => {
    const warning = aWarning();

    warning.approve('usr-dmc-1', later(MINUTE));

    expect(warning.isApproved).toBe(true);
    expect(warning.snapshot()).toMatchObject({
      approvedBy: 'usr-dmc-1',
      approvedAt: later(MINUTE),
      status: 'PENDING_APPROVAL',
      version: 2,
    });
  });

  it('UC-1 BR2: refuses the officer who submitted the warning (four-eyes)', () => {
    const warning = aWarning({ submittedBy: 'usr-dmc-1' });

    const error = thrownBy(() => warning.approve('usr-dmc-1', NOW));

    expect(error).toMatchObject({
      code: 'SELF_APPROVAL_FORBIDDEN',
      kind: 'FORBIDDEN',
      message: 'The officer who submitted a warning cannot approve it.',
    });
    expect(warning.isApproved).toBe(false);
    expect(warning.version).toBe(1);
  });

  it('UC-1 BR2: lets a different officer approve a warning another DMC Officer submitted', () => {
    const warning = aWarning({ submittedBy: 'usr-dmc-1' });

    warning.approve('usr-dmc-2', NOW);

    expect(warning.snapshot().approvedBy).toBe('usr-dmc-2');
  });

  it('UC-1 step 7: approving again as the same officer keeps the first approval but starts a new claim (version moves on)', () => {
    const warning = aWarning();
    warning.approve('usr-dmc-1', NOW);

    warning.approve('usr-dmc-1', later(HOUR));

    expect(warning.snapshot()).toMatchObject({
      approvedBy: 'usr-dmc-1',
      approvedAt: NOW,
      version: 3,
    });
  });

  it('UC-1 step 7: refuses a second officer once someone else is already issuing it', () => {
    const warning = aWarning();
    warning.approve('usr-dmc-1', NOW);

    const error = thrownBy(() => warning.approve('usr-dmc-2', later(MINUTE)));

    expect(error).toMatchObject({
      code: 'WARNING_NOT_PENDING',
      kind: 'CONFLICT',
      message: 'Another officer is already issuing this warning.',
    });
    expect(warning.snapshot().approvedBy).toBe('usr-dmc-1');
  });

  it('UC-1 step 7: refuses to approve a warning that is no longer pending', () => {
    const warning = aWarning();
    warning.reject('usr-dmc-1', 'Not needed', NOW);

    expect(thrownBy(() => warning.approve('usr-dmc-2', NOW))).toMatchObject({
      code: 'WARNING_NOT_PENDING',
    });
  });
});

describe('UC-1 step 13 / SD1-05: Warning.markIssued', () => {
  it('UC-1 step 13: becomes issued and records when', () => {
    const warning = aWarning();
    warning.approve('usr-dmc-1', NOW);

    warning.markIssued(later(2 * MINUTE));

    expect(warning.status).toBe('ISSUED');
    expect(warning.snapshot()).toMatchObject({ issuedAt: later(2 * MINUTE), version: 3 });
  });

  it('UC-1 step 13: cannot be issued before it was approved', () => {
    const warning = aWarning();

    const error = thrownBy(() => warning.markIssued(NOW));

    expect(error).toMatchObject({
      code: 'WARNING_NOT_APPROVED',
      kind: 'CONFLICT',
      message: 'A warning must be approved before it can be issued.',
    });
    expect(warning.status).toBe('PENDING_APPROVAL');
  });

  it('UC-1 BR5: cannot be issued twice', () => {
    const warning = aWarning();
    warning.approve('usr-dmc-1', NOW);
    warning.markIssued(NOW);

    expect(thrownBy(() => warning.markIssued(later(MINUTE)))).toMatchObject({
      code: 'WARNING_NOT_PENDING',
    });
  });
});

describe('UC-1 A3: Warning.reject', () => {
  it('UC-1 A3: records the officer, the time and the reason, and the warning is rejected', () => {
    const warning = aWarning();

    warning.reject('usr-dmc-1', '  Duplicate of W-9  ', later(MINUTE));

    expect(warning.status).toBe('REJECTED');
    expect(warning.snapshot()).toMatchObject({
      rejectedBy: 'usr-dmc-1',
      rejectedAt: later(MINUTE),
      rejectionReason: 'Duplicate of W-9',
      version: 2,
    });
  });

  it.each(['', '   ', '\n\t'])('UC-1 A3: requires a reason (%j is not one)', (reason) => {
    const warning = aWarning();

    const error = thrownBy(() => warning.reject('usr-dmc-1', reason, NOW));

    expect(error).toMatchObject({
      kind: 'VALIDATION',
      fields: [{ field: 'reason', code: 'REASON_REQUIRED' }],
    });
    expect(warning.status).toBe('PENDING_APPROVAL');
  });

  it('UC-1 A3: cannot reject a warning that was already issued', () => {
    const warning = aWarning();
    warning.approve('usr-dmc-1', NOW);
    warning.markIssued(NOW);

    expect(thrownBy(() => warning.reject('usr-dmc-2', 'Too late', NOW))).toMatchObject({
      code: 'WARNING_NOT_PENDING',
    });
  });

  it('UC-1 A3: cannot reject a warning that is being issued right now', () => {
    const warning = aWarning();
    warning.approve('usr-dmc-1', NOW);

    expect(thrownBy(() => warning.reject('usr-dmc-2', 'Changed my mind', NOW))).toMatchObject({
      code: 'WARNING_NOT_PENDING',
    });
    expect(warning.status).toBe('PENDING_APPROVAL');
  });
});

describe('UC-1 BR5: Warning.assertPending', () => {
  it('UC-1 BR5: lets a pending warning through, approved or not', () => {
    const warning = aWarning();
    expect(() => warning.assertPending()).not.toThrow();

    warning.approve('usr-dmc-1', NOW);

    expect(() => warning.assertPending()).not.toThrow();
  });

  it.each(['issued', 'rejected'] as const)(
    'UC-1 BR5: stops a warning that is already %s',
    (state) => {
      const warning = aWarning();
      if (state === 'rejected') warning.reject('usr-dmc-1', 'Not needed', NOW);
      else {
        warning.approve('usr-dmc-1', NOW);
        warning.markIssued(NOW);
      }

      expect(thrownBy(() => warning.assertPending())).toMatchObject({
        code: 'WARNING_NOT_PENDING',
        kind: 'CONFLICT',
        message: 'This warning is no longer waiting for approval.',
      });
    },
  );
});

describe('Warning: reading and persistence', () => {
  it('SC1-05: gives the SMS text of each language without surrounding spaces', () => {
    const warning = aWarning({ messages: { ...MESSAGES, EN: '  Move now.  ' } });

    expect(warning.smsText('EN')).toBe('Move now.');
    expect(warning.smsText('SI')).toBe(MESSAGES.SI);
  });

  it('exposes what the application needs to read', () => {
    const area = aTargetArea();
    const warning = aWarning({ sourceClusterId: 'cluster-7', targetAreas: [area] });

    expect(warning.warningId).toBe('W-1');
    expect(warning.hazardType).toBe('FLOOD');
    expect(warning.severity).toBe('HIGH');
    expect(warning.submittedBy).toBe('usr-duty-1');
    expect(warning.targetAreas).toEqual([area]);
    expect(warning.sourceClusterId).toBe('cluster-7');
  });

  it('starts as a pending draft at version 1, stamped with when it was submitted', () => {
    const state = aWarning().snapshot();

    expect(state).toMatchObject({
      status: 'PENDING_APPROVAL',
      version: 1,
      submittedAt: NOW,
      updatedAt: NOW,
    });
    expect(state.approvedAt).toBeUndefined();
  });

  it('round-trips through a snapshot without sharing state with the original', () => {
    const original = aWarning();
    original.approve('usr-dmc-1', NOW);

    const copy = Warning.restore(original.snapshot());
    copy.markIssued(later(MINUTE));

    expect(original.status).toBe('PENDING_APPROVAL');
    expect(copy.status).toBe('ISSUED');
    expect(copy.snapshot().approvedBy).toBe('usr-dmc-1');
  });

  it('keeps its snapshot independent: editing the copy does not edit the warning', () => {
    const warning = aWarning();
    const state = warning.snapshot();

    state.messages.EN = 'tampered';
    state.targetAreas.pop();

    expect(warning.smsText('EN')).toBe(MESSAGES.EN);
    expect(warning.targetAreas).toHaveLength(1);
  });

  it('keeps the input independent: editing the arrays it was built from does not edit the warning', () => {
    const messages = { ...MESSAGES };
    const areas = [aTargetArea()];
    const warning = aWarning({ messages, targetAreas: areas });

    messages.EN = 'tampered';
    areas.pop();

    expect(warning.smsText('EN')).toBe(MESSAGES.EN);
    expect(warning.targetAreas).toHaveLength(1);
  });

  it('keeps restored state independent of the object it was restored from', () => {
    const props = aWarning().snapshot();
    const warning = Warning.restore(props);

    props.messages.EN = 'tampered';
    props.targetAreas.pop();

    expect(warning.smsText('EN')).toBe(MESSAGES.EN);
    expect(warning.targetAreas).toHaveLength(1);
  });
});
