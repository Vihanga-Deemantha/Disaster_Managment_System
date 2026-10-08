import { DISTRICT_CENTROIDS } from '@shared/geo/districts';
import { toAreaDto, toDeliveryDto, toReviewDto, toUnreachedCsv, toWarningDto } from '../../api/dto';
import type { UnreachedEntry } from '../../application/WarningController';
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

describe('UC-1 step 2: toAreaDto', () => {
  it('centres the map on the middle of the boundary when there is one', () => {
    const area = aTargetArea({
      areaId: 'basin-kelani',
      type: 'RIVER_BASIN',
      name: 'Kelani Ganga',
      boundary: [
        { lat: 6, lng: 79 },
        { lat: 8, lng: 81 },
        { lat: 7, lng: 80 },
      ],
    });

    expect(toAreaDto(area)).toStrictEqual({
      areaId: 'basin-kelani',
      type: 'RIVER_BASIN',
      name: 'Kelani Ganga',
      district: 'GAMPAHA',
      center: { lat: 7, lng: 80 },
      boundary: [
        { lat: 6, lng: 79 },
        { lat: 8, lng: 81 },
        { lat: 7, lng: 80 },
      ],
    });
  });

  it('centres a district without a boundary on the district’s own centre, and sends no boundary', () => {
    expect(toAreaDto(aTargetArea())).toStrictEqual({
      areaId: 'GAMPAHA',
      type: 'DISTRICT',
      name: 'Gampaha',
      district: 'GAMPAHA',
      center: DISTRICT_CENTROIDS.GAMPAHA,
    });
  });

  it('falls back to the district’s centre for an empty ring, rather than dividing by zero', () => {
    const dto = toAreaDto(aTargetArea({ boundary: [] }));

    expect(dto.center).toEqual(DISTRICT_CENTROIDS.GAMPAHA);
    expect(Number.isNaN(dto.center.lat)).toBe(false);
  });

  it('hands out a copy of the ring, so the caller cannot change the warning', () => {
    const area = aTargetArea({
      boundary: [
        { lat: 6, lng: 79 },
        { lat: 8, lng: 81 },
        { lat: 7, lng: 80 },
      ],
    });

    toAreaDto(area).boundary?.pop();

    expect(area.boundary).toHaveLength(3);
  });
});

describe('UC-1 step 2: toWarningDto', () => {
  it('shows a pending warning with dates as ISO text, and leaves out what has not happened', () => {
    expect(toWarningDto(aWarning())).toStrictEqual({
      warningId: 'W-1',
      hazardType: 'FLOOD',
      severity: 'HIGH',
      messages: MESSAGES,
      targetAreas: [toAreaDto(aTargetArea())],
      validFrom: NOW.toISOString(),
      validTo: new Date(NOW.getTime() + 24 * HOUR).toISOString(),
      status: 'PENDING_APPROVAL',
      submittedBy: 'usr-duty-1',
      submittedAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      version: 1,
    });
  });

  it('shows who submitted it by name when the warning carries one, next to the id', () => {
    const dto = toWarningDto(aWarning({ submittedByName: 'Duty Officer (demo)' }));

    expect(dto).toMatchObject({
      submittedBy: 'usr-duty-1',
      submittedByName: 'Duty Officer (demo)',
    });
  });

  it('shows who approved and issued it, and when', () => {
    const warning = aWarning({ sourceClusterId: 'cluster-7' });
    warning.approve('usr-dmc-1', new Date(NOW.getTime() + HOUR));
    warning.markIssued(new Date(NOW.getTime() + 2 * HOUR));

    expect(toWarningDto(warning)).toMatchObject({
      status: 'ISSUED',
      approvedBy: 'usr-dmc-1',
      approvedAt: new Date(NOW.getTime() + HOUR).toISOString(),
      issuedAt: new Date(NOW.getTime() + 2 * HOUR).toISOString(),
      sourceClusterId: 'cluster-7',
      updatedAt: new Date(NOW.getTime() + 2 * HOUR).toISOString(),
      version: 3,
    });
  });

  it('shows who rejected it, when, and why', () => {
    const warning = aWarning();
    warning.reject('usr-dmc-1', 'Duplicate of W-9', new Date(NOW.getTime() + HOUR));

    const dto = toWarningDto(warning);

    expect(dto).toMatchObject({
      status: 'REJECTED',
      rejectedBy: 'usr-dmc-1',
      rejectedAt: new Date(NOW.getTime() + HOUR).toISOString(),
      rejectionReason: 'Duplicate of W-9',
    });
    expect('approvedBy' in dto).toBe(false);
    expect('issuedAt' in dto).toBe(false);
  });
});

describe('UC-1 steps 2 and 14: the review and delivery answers', () => {
  it('toReviewDto joins the warning, the recipient estimate and what is still wrong', async () => {
    const h = createWarningsHarness({
      recipients: [...citizens(2), aRecipient({ citizenId: 'x' })],
    });
    await h.add(aWarning({ messages: { ...MESSAGES, TA: '' } }));

    const dto = toReviewDto(await h.controller.getWarningForReview('W-1'));

    expect(dto.warning.warningId).toBe('W-1');
    expect(dto.recipients).toEqual({
      total: 3,
      unreachable: 0,
      byChannel: { PUSH: 3, SMS: 3, WHATSAPP: 0, EMAIL: 0 },
    });
    expect(dto.validation).toEqual({
      ok: false,
      errors: [{ field: 'messages.TA', code: 'MESSAGE_REQUIRED' }],
    });
  });

  it('toDeliveryDto adds how many citizens were not reached, which is what the follow-up list holds', async () => {
    const h = createWarningsHarness({ recipients: citizens(3) });
    await h.add();
    h.gateways.PUSH.failFor('TIMEOUT', 'c-2');
    h.gateways.SMS.failFor('CARRIER_REJECTED', 'c-2');
    const view = await h.controller.issueWarning('W-1', 'usr-dmc-1', { optionalChannels: [] });

    const dto = toDeliveryDto(view);

    expect(dto.result).toMatchObject({ targeted: 3, reached: 2, pendingRetry: 1, unreached: 1 });
    expect(dto.allChannelsUnavailable).toBe(false);
    expect(dto.warning.status).toBe('ISSUED');
  });
});

describe('E2: toUnreachedCsv (the follow-up list)', () => {
  const HEADER = '"Citizen ID","Name","Phone","Address","District","Language","Status","Reason"';
  const entry = (overrides: Partial<UnreachedEntry> = {}): UnreachedEntry => ({
    citizenId: 'c-1',
    fullName: 'Nimal Perera',
    phone: '+94771234567',
    addressLine: '12 Temple Road',
    district: 'GAMPAHA',
    language: 'SI',
    status: 'PENDING_RETRY',
    reason: 'GATEWAY_DOWN',
    ...overrides,
  });

  it('starts with a byte-order mark so Excel reads Sinhala and Tamil as UTF-8, then the header', () => {
    const csv = toUnreachedCsv([]);

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toBe(`\uFEFF${HEADER}\r\n`);
  });

  it('writes one quoted row per citizen, with Windows line endings', () => {
    const csv = toUnreachedCsv([entry(), entry({ citizenId: 'c-2', fullName: 'සුනිල් පෙරේරා' })]);

    expect(csv).toBe(
      `\uFEFF${HEADER}\r\n` +
        '"c-1","Nimal Perera","+94771234567","12 Temple Road","GAMPAHA","SI","PENDING_RETRY","GATEWAY_DOWN"\r\n' +
        '"c-2","සුනිල් පෙරේරා","+94771234567","12 Temple Road","GAMPAHA","SI","PENDING_RETRY","GATEWAY_DOWN"\r\n',
    );
  });

  it('leaves a missing phone or address as an empty cell', () => {
    const csv = toUnreachedCsv([
      entry({ phone: undefined, addressLine: undefined, reason: 'NO_CHANNEL', status: 'FAILED' }),
    ]);

    expect(csv).toContain('"c-1","Nimal Perera","","","GAMPAHA","SI","FAILED","NO_CHANNEL"\r\n');
  });

  it('keeps commas, quotes and line breaks inside their cell', () => {
    const csv = toUnreachedCsv([
      entry({ fullName: 'Perera, "Nimal"', addressLine: '12 Temple Road,\nGampaha' }),
    ]);

    expect(csv).toContain('"Perera, ""Nimal"""');
    expect(csv).toContain('"12 Temple Road,\nGampaha"');
  });

  it.each(['=SUM(A1)', '+94771234567', '-2+3', '@cmd', '\tTabbed', '\rReturn'])(
    'stops free text that a spreadsheet would run as a formula (%j)',
    (text) => {
      const csv = toUnreachedCsv([entry({ fullName: text, addressLine: text })]);

      expect(csv).toContain(`"'${text}","+94771234567","'${text}"`);
    },
  );

  it('leaves text that merely contains those characters alone', () => {
    const csv = toUnreachedCsv([entry({ fullName: 'A=B', addressLine: 'Unit 4-B' })]);

    expect(csv).toContain('"A=B","+94771234567","Unit 4-B"');
  });

  it('does not touch system-made values, such as the +94 phone number', () => {
    const csv = toUnreachedCsv([entry({ phone: '+94771234567' })]);

    expect(csv).toContain(',"+94771234567",');
    expect(csv).not.toContain(`"'+94771234567"`);
  });
});
