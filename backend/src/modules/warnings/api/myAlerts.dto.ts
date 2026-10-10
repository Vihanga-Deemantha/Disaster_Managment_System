import type { AreaType, District, HazardType, Language, Severity } from '@shared/contracts/enums';
import type { CitizenInbox, InboxAlert } from '../application/CitizenAlertInbox';

/** The part of a target area a citizen needs to recognise it. No ring: that is for the officer's map. */
export interface MyAlertAreaDto {
  areaId: string;
  type: AreaType;
  name: string;
  district: District;
}

/**
 * One alert as the phone sees it (`GET /api/me/alerts`). Deliberately small: what was sent, in the
 * citizen's own language, and where and until when it applies. Nothing about other citizens, channels,
 * attempts or the officers involved.
 */
export interface MyAlertDto {
  /** The citizen's own notification id: stable, and unique per citizen per warning. */
  alertId: string;
  warningId: string;
  hazardType: HazardType;
  severity: Severity;
  /** The text this citizen was sent, in `language`. */
  message: string;
  language: Language;
  areas: MyAlertAreaDto[];
  validFrom: string;
  validTo: string;
  /** When it first got through to this citizen, on any channel. */
  deliveredAt: string;
}

export interface MyAlertsDto {
  /** Newest first. */
  alerts: MyAlertDto[];
  /** The server's clock, so "still valid" does not depend on the phone's. */
  serverTime: string;
}

export function toMyAlertDto({ notification, warning, deliveredAt }: InboxAlert): MyAlertDto {
  const state = warning.snapshot();
  return {
    alertId: notification.notificationId,
    warningId: state.warningId,
    hazardType: state.hazardType,
    severity: state.severity,
    message: notification.content,
    language: notification.language,
    areas: state.targetAreas.map((area) => {
      const { areaId, type, name, district } = area.snapshot();
      return { areaId, type, name, district };
    }),
    validFrom: state.validFrom.toISOString(),
    validTo: state.validTo.toISOString(),
    deliveredAt: deliveredAt.toISOString(),
  };
}

export const toMyAlertsDto = (inbox: CitizenInbox): MyAlertsDto => ({
  alerts: inbox.alerts.map(toMyAlertDto),
  serverTime: inbox.serverTime.toISOString(),
});
