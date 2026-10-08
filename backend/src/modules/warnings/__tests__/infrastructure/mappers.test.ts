import type { CitizenProfileView } from '@shared/auth';
import { AlertNotification } from '../../domain/AlertNotification';
import {
  docToNotification,
  docToWarning,
  notificationToDoc,
  toRecipient,
  warningToDoc,
} from '../../infrastructure/mappers';
import {
  aNotification,
  aTargetArea,
  aWarning,
  MESSAGES,
  NOW,
  result,
} from '../../testing/builders';

const RING = [
  { lat: 6.8, lng: 79.8 },
  { lat: 6.8, lng: 80.0 },
  { lat: 7.0, lng: 80.0 },
];

describe('UC-1 persistence: the warning and its document', () => {
  it('writes the warning id as the document id, and leaves no stray field behind', () => {
    const doc = warningToDoc(aWarning());

    expect(doc._id).toBe('W-1');
    expect('warningId' in doc).toBe(false);
  });

  it('keeps a draft’s empty messages as empty strings, not as missing', () => {
    const draft = aWarning({ messages: { SI: '', TA: '', EN: 'English only' } });

    const doc = warningToDoc(draft);

    expect(doc.messages).toEqual({ SI: '', TA: '', EN: 'English only' });
    expect(docToWarning(doc).snapshot().messages).toEqual({ SI: '', TA: '', EN: 'English only' });
  });

  it('round-trips an issued warning with every optional field', () => {
    const warning = aWarning({ sourceClusterId: 'cluster-7' });
    warning.approve('usr-dmc-1', NOW);
    warning.markIssued(new Date(NOW.getTime() + 60_000));

    const copy = docToWarning(warningToDoc(warning));

    expect(copy.snapshot()).toEqual(warning.snapshot());
    expect(copy.snapshot()).toMatchObject({
      status: 'ISSUED',
      approvedBy: 'usr-dmc-1',
      sourceClusterId: 'cluster-7',
    });
  });

  it('keeps the name of whoever submitted it, and leaves the field out when there is none', () => {
    const named = aWarning({ submittedByName: 'Duty Officer (demo)' });

    expect(warningToDoc(named).submittedByName).toBe('Duty Officer (demo)');
    expect(docToWarning(warningToDoc(named)).snapshot().submittedByName).toBe(
      'Duty Officer (demo)',
    );
    expect('submittedByName' in warningToDoc(aWarning())).toBe(false);
  });

  it('round-trips a rejected warning with its reason', () => {
    const warning = aWarning();
    warning.reject('usr-dmc-1', 'Duplicate of W-9', NOW);

    expect(docToWarning(warningToDoc(warning)).snapshot()).toEqual(warning.snapshot());
  });

  it('keeps an area’s boundary ring, and leaves the field out when there is none', () => {
    const warning = aWarning({
      targetAreas: [
        aTargetArea({
          areaId: 'basin-kelani',
          type: 'RIVER_BASIN',
          name: 'Kelani',
          boundary: RING,
        }),
        aTargetArea(),
      ],
    });

    const doc = warningToDoc(warning);

    expect(doc.targetAreas[0]?.boundary).toEqual(RING);
    expect('boundary' in (doc.targetAreas[1] as object)).toBe(false);
    const areas = docToWarning(doc).targetAreas;
    expect(areas[0]?.boundary).toEqual(RING);
    expect(areas[1]?.boundary).toBeUndefined();
  });

  it('leaves fields that were never set out of the document, so nothing is stored as null', () => {
    const doc = warningToDoc(aWarning());

    for (const field of ['approvedBy', 'approvedAt', 'issuedAt', 'rejectedBy', 'sourceClusterId']) {
      expect(field in doc).toBe(false);
    }
  });

  it('gives the document its own copy of the messages', () => {
    const warning = aWarning();

    warningToDoc(warning).messages.EN = 'tampered';

    expect(warning.smsText('EN')).toBe(MESSAGES.EN);
  });
});

describe('UC-1 persistence: the notification and its document', () => {
  it('writes the notification id as the document id', () => {
    const doc = notificationToDoc(aNotification({ id: 'N-9' }));

    expect(doc._id).toBe('N-9');
    expect('notificationId' in doc).toBe(false);
  });

  it('round-trips attempts, with and without an error code, and the next retry time', () => {
    const notification = aNotification();
    notification.recordAttempts(
      [result('PUSH', 'FAILED', 'TIMEOUT'), result('SMS', 'DELIVERED')],
      NOW,
      3,
    );
    notification.scheduleRetryAt(new Date(NOW.getTime() + 30_000));

    const doc = notificationToDoc(notification);
    const copy = docToNotification(doc);

    expect(copy.snapshot()).toEqual(notification.snapshot());
    expect('errorCode' in (doc.attempts[1] as object)).toBe(false);
    expect(doc.attempts[0]?.errorCode).toBe('TIMEOUT');
  });

  it('round-trips an unreachable citizen and leaves unset fields out', () => {
    const notification = AlertNotification.unreachable(
      { notificationId: 'N-2', warningId: 'W-1', citizenId: 'c-2', language: 'TA', content: 'x' },
      NOW,
    );

    const doc = notificationToDoc(notification);

    expect(doc.unreachable).toBe(true);
    expect('nextRetryAt' in doc).toBe(false);
    expect(docToNotification(doc).snapshot()).toEqual(notification.snapshot());
  });
});

describe('UC-1 step 8: a registered citizen as a recipient', () => {
  const view: CitizenProfileView = {
    citizenId: 'c-1',
    fullName: 'Test Citizen',
    phone: '+94771234567',
    homeLocation: { lat: 7.0873, lng: 79.9925 },
    addressLine: '12 Temple Road',
    district: 'GAMPAHA',
    riverBasinId: 'basin-kelani',
    preferredLanguage: 'SI',
    deviceToken: 'token-1',
    email: 'a@example.test',
    whatsappOptIn: true,
    emailOptIn: true,
  };

  it('carries over everything alert targeting needs, and nothing else', () => {
    expect(toRecipient(view)).toEqual(view);
    expect(Object.keys(toRecipient(view)).sort()).toEqual(Object.keys(view).sort());
  });

  it('leaves out what the citizen did not give, instead of listing it as undefined', () => {
    const bare: CitizenProfileView = {
      citizenId: 'c-2',
      fullName: 'Bare Citizen',
      phone: '+94770000000',
      homeLocation: { lat: 7, lng: 80 },
      district: 'COLOMBO',
      preferredLanguage: 'EN',
      whatsappOptIn: false,
      emailOptIn: false,
    };

    const recipient = toRecipient(bare);

    for (const field of ['addressLine', 'riverBasinId', 'deviceToken', 'email']) {
      expect(field in recipient).toBe(false);
    }
  });

  it('copies the location, so editing the recipient does not edit the profile view', () => {
    toRecipient(view).homeLocation.lat = 0;

    expect(view.homeLocation.lat).toBe(7.0873);
  });
});
