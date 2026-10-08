import type { AreaType, District, HazardType, Language, Severity } from '@/shared/contracts/enums';

/** What an alert is about. A hazard this version of the app does not know is still shown, as a plain warning. */
export type HazardKind = HazardType | 'OTHER';

export interface AlertArea {
  areaId: string;
  type: AreaType;
  /** As the DMC wrote it ("Gampaha", "Kelani Ganga"). */
  name: string;
  district?: District;
}

/**
 * One warning that reached this citizen (`GET /api/me/alerts`). Times are ISO strings, so an alert is
 * plain data that can be stored on the phone and compared without surprises.
 */
export interface Alert {
  /** This citizen's own notification id: stable, unique per citizen per warning. */
  alertId: string;
  warningId: string;
  hazardType: HazardKind;
  severity: Severity;
  /** The text this citizen was sent, in `language`. */
  message: string;
  language: Language;
  areas: AlertArea[];
  validFrom: string;
  validTo: string;
  /** When it first got through to this citizen. */
  deliveredAt: string;
}

export interface InboxSnapshot {
  /** Newest first. */
  alerts: Alert[];
  /** The server's clock when it answered; missing when the server did not say. */
  serverTime?: string;
}

/** Why the inbox could not be fetched; the screen words each differently. */
export type InboxProblem = 'OFFLINE' | 'SESSION_EXPIRED' | 'SERVER';

export class InboxUnavailable extends Error {
  constructor(readonly reason: InboxProblem) {
    super(`The alert inbox is unavailable (${reason}).`);
    this.name = 'InboxUnavailable';
  }
}
