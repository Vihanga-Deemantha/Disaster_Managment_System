import type { CitizenProfileView } from '@shared/auth';
import { withoutUndefined } from '../application/compact';
import { AlertNotification } from '../domain/AlertNotification';
import type { Recipient } from '../domain/Recipient';
import { TargetArea } from '../domain/TargetArea';
import { Warning } from '../domain/Warning';
import type { AlertNotificationDoc, TargetAreaDoc, WarningDoc } from './models';

function areaToDoc(area: TargetArea): TargetAreaDoc {
  const { boundary, ...rest } = area.snapshot();
  return {
    ...rest,
    ...(boundary ? { boundary: boundary.map(({ lat, lng }) => ({ lat, lng })) } : {}),
  };
}

function docToArea(doc: TargetAreaDoc): TargetArea {
  return new TargetArea({
    areaId: doc.areaId,
    type: doc.type,
    name: doc.name,
    district: doc.district,
    ...(doc.boundary ? { boundary: doc.boundary.map(({ lat, lng }) => ({ lat, lng })) } : {}),
  });
}

export function warningToDoc(warning: Warning): WarningDoc {
  const { warningId, targetAreas, messages, ...rest } = warning.snapshot();
  return withoutUndefined({
    _id: warningId,
    ...rest,
    messages: { ...messages },
    targetAreas: targetAreas.map(areaToDoc),
  });
}

export function docToWarning(doc: WarningDoc): Warning {
  const { _id, targetAreas, messages, ...rest } = doc;
  return Warning.restore({
    ...rest,
    warningId: _id,
    messages: { SI: messages.SI, TA: messages.TA, EN: messages.EN },
    targetAreas: targetAreas.map(docToArea),
  });
}

export function notificationToDoc(notification: AlertNotification): AlertNotificationDoc {
  const { notificationId, attempts, ...rest } = notification.snapshot();
  return withoutUndefined({
    _id: notificationId,
    ...rest,
    attempts: attempts.map((attempt) => withoutUndefined({ ...attempt })),
  });
}

export function docToNotification(doc: AlertNotificationDoc): AlertNotification {
  const { _id, attempts, ...rest } = doc;
  return AlertNotification.restore({
    ...rest,
    notificationId: _id,
    attempts: attempts.map((attempt) => withoutUndefined({ ...attempt })),
  });
}

/** A registered citizen as UC-1 reads them. The profile view has no NIC, so none can leak into alerts. */
export function toRecipient(view: CitizenProfileView): Recipient {
  return withoutUndefined({
    citizenId: view.citizenId,
    fullName: view.fullName,
    district: view.district,
    riverBasinId: view.riverBasinId,
    homeLocation: { lat: view.homeLocation.lat, lng: view.homeLocation.lng },
    addressLine: view.addressLine,
    preferredLanguage: view.preferredLanguage,
    phone: view.phone,
    deviceToken: view.deviceToken,
    email: view.email,
    whatsappOptIn: view.whatsappOptIn,
    emailOptIn: view.emailOptIn,
  });
}
