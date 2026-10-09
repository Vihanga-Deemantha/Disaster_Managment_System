import { HttpResponse } from 'msw';
import type {
  AreaDto,
  DeliveryDto,
  IssueResult,
  RecipientEstimate,
  ReviewDto,
  WarningDto,
} from '../types';

const HOUR = 3_600_000;

/** `hours` before now, as the ISO text the API sends. */
export const hoursAgo = (hours: number): string =>
  new Date(Date.now() - hours * HOUR).toISOString();
export const hoursFromNow = (hours: number): string =>
  new Date(Date.now() + hours * HOUR).toISOString();

export const aDistrict = (overrides: Partial<AreaDto> = {}): AreaDto => ({
  areaId: 'GAMPAHA',
  type: 'DISTRICT',
  name: 'Gampaha',
  district: 'GAMPAHA',
  center: { lat: 7.0873, lng: 79.9925 },
  ...overrides,
});

export const aBasin = (overrides: Partial<AreaDto> = {}): AreaDto => ({
  areaId: 'basin-kelani',
  type: 'RIVER_BASIN',
  name: 'Kelani Ganga basin',
  district: 'COLOMBO',
  center: { lat: 6.95, lng: 80.1 },
  boundary: [
    { lat: 6.8, lng: 79.9 },
    { lat: 6.8, lng: 80.3 },
    { lat: 7.1, lng: 80.3 },
  ],
  ...overrides,
});

export const aWarning = (overrides: Partial<WarningDto> = {}): WarningDto => ({
  warningId: 'W-102',
  hazardType: 'FLOOD',
  severity: 'HIGH',
  messages: {
    SI: 'ගම්පහ ගංවතුර අනතුරු ඇඟවීම: උස් බිම්වලට යන්න.',
    TA: 'கம்பஹா வெள்ள எச்சரிக்கை: உயரமான இடங்களுக்குச் செல்லுங்கள்.',
    EN: 'Flood warning for Gampaha: move to higher ground now.',
  },
  targetAreas: [aDistrict()],
  validFrom: hoursAgo(1),
  validTo: hoursFromNow(23),
  status: 'PENDING_APPROVAL',
  submittedBy: 'usr-duty-1',
  submittedAt: hoursAgo(2),
  updatedAt: hoursAgo(2),
  version: 1,
  ...overrides,
});

export const anEstimate = (overrides: Partial<RecipientEstimate> = {}): RecipientEstimate => ({
  total: 61,
  unreachable: 0,
  byChannel: { PUSH: 40, SMS: 61, WHATSAPP: 18, EMAIL: 9 },
  ...overrides,
});

export const aReview = (overrides: Partial<ReviewDto> = {}): ReviewDto => ({
  warning: aWarning(),
  recipients: anEstimate(),
  validation: { ok: true, errors: [] },
  ...overrides,
});

export const aResult = (overrides: Partial<IssueResult> = {}): IssueResult => ({
  targeted: 61,
  reached: 61,
  pendingRetry: 0,
  failed: 0,
  unreached: 0,
  byChannel: {
    PUSH: { sent: 40, delivered: 40, failed: 0 },
    SMS: { sent: 61, delivered: 61, failed: 0 },
    WHATSAPP: { sent: 0, delivered: 0, failed: 0 },
    EMAIL: { sent: 0, delivered: 0, failed: 0 },
  },
  ...overrides,
});

export const aDelivery = (overrides: Partial<DeliveryDto> = {}): DeliveryDto => ({
  warning: aWarning({
    status: 'ISSUED',
    approvedBy: 'user-1',
    approvedAt: hoursAgo(0.1),
    issuedAt: hoursAgo(0.1),
  }),
  result: aResult(),
  allChannelsUnavailable: false,
  ...overrides,
});

export const json = (body: unknown, status = 200) => HttpResponse.json(body as never, { status });
