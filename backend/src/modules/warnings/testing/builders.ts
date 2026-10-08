import type { Channel } from '@shared/contracts/enums';
import { AlertNotification, type AttemptResult } from '../domain/AlertNotification';
import type { Recipient } from '../domain/Recipient';
import { TargetArea, type TargetAreaProps } from '../domain/TargetArea';
import type { AttemptStatus, Messages } from '../domain/types';
import { Warning, type NewWarning } from '../domain/Warning';

/** 09:00 UTC on 7 Oct 2026: the same instant `FixedClock` starts at. */
export const NOW = new Date('2026-10-07T09:00:00.000Z');
export const HOUR = 3_600_000;
export const MINUTE = 60_000;

export const MESSAGES: Messages = {
  SI: 'ගංවතුර අනතුරු ඇඟවීම: ගම්පහ දිස්ත්‍රික්කයේ ජලය ඉහළ යයි. උස් බිම්වලට යන්න.',
  TA: 'வெள்ள எச்சரிக்கை: கம்பஹா மாவட்டத்தில் நீர்மட்டம் உயர்கிறது. உயரமான இடங்களுக்குச் செல்லுங்கள்.',
  EN: 'Flood warning: water is rising in Gampaha district. Move to higher ground now.',
};

export const aTargetArea = (overrides: Partial<TargetAreaProps> = {}): TargetArea =>
  new TargetArea({
    areaId: 'GAMPAHA',
    type: 'DISTRICT',
    name: 'Gampaha',
    district: 'GAMPAHA',
    ...overrides,
  });

/** A complete, valid draft submitted by the Duty Officer and still waiting for approval. */
export const aWarning = (overrides: Partial<NewWarning> = {}, now: Date = NOW): Warning =>
  Warning.create(
    {
      warningId: 'W-1',
      hazardType: 'FLOOD',
      severity: 'HIGH',
      messages: { ...MESSAGES },
      targetAreas: [aTargetArea()],
      validFrom: now,
      validTo: new Date(now.getTime() + 24 * HOUR),
      submittedBy: 'usr-duty-1',
      ...overrides,
    },
    now,
  );

/** A warning an officer other than its submitter approved and that went out: what a citizen's inbox shows. */
export const anIssuedWarning = (overrides: Partial<NewWarning> = {}, now: Date = NOW): Warning => {
  const warning = aWarning(overrides, now);
  warning.approve('usr-dmc-1', now);
  warning.markIssued(now);
  return warning;
};

export const aRecipient = (overrides: Partial<Recipient> = {}): Recipient => ({
  citizenId: 'citizen-1',
  fullName: 'Test Citizen',
  district: 'GAMPAHA',
  homeLocation: { lat: 7.0873, lng: 79.9925 },
  preferredLanguage: 'EN',
  phone: '+94771234567',
  deviceToken: 'token-1',
  whatsappOptIn: false,
  emailOptIn: false,
  ...overrides,
});

/** `count` citizens of Gampaha with a device token and a phone; `tweak` changes any of them. */
export const citizens = (
  count: number,
  tweak: (index: number) => Partial<Recipient> = () => ({}),
): Recipient[] =>
  Array.from({ length: count }, (_, index) =>
    aRecipient({ citizenId: `c-${index + 1}`, fullName: `Citizen ${index + 1}`, ...tweak(index) }),
  );

export const aNotification = (
  overrides: Partial<{ id: string; citizenId: string; warningId: string }> = {},
): AlertNotification =>
  AlertNotification.create(
    {
      notificationId: overrides.id ?? 'N-1',
      warningId: overrides.warningId ?? 'W-1',
      citizenId: overrides.citizenId ?? 'citizen-1',
      language: 'EN',
      content: MESSAGES.EN,
    },
    NOW,
  );

export const result = (
  channel: Channel,
  status: AttemptStatus,
  errorCode?: string,
): AttemptResult => ({ channel, status, ...(errorCode === undefined ? {} : { errorCode }) });

/** What a throwing call threw, so a test can inspect the error's `code` and `kind`. */
export function thrownBy(call: () => unknown): unknown {
  try {
    call();
  } catch (error) {
    return error;
  }
  return undefined;
}
