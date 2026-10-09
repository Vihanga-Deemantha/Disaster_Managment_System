import type { AreaType, District, HazardType, Severity } from '@shared/contracts/enums';
import { DISTRICT_CENTROIDS } from '@shared/geo/districts';
import type { GeoPoint } from '@shared/geo/GeoPoint';
import { withoutUndefined } from '../application/compact';
import type { DeliveryView, UnreachedEntry, WarningReview } from '../application/WarningController';
import type { RecipientEstimate } from '../application/estimate';
import type { IssueResult } from '../domain/IssueResult';
import type { TargetArea } from '../domain/TargetArea';
import type { Messages, WarningStatus } from '../domain/types';
import type { ValidationResult } from '../domain/ValidationResult';
import type { Warning } from '../domain/Warning';

export interface AreaDto {
  areaId: string;
  type: AreaType;
  name: string;
  district: District;
  /** Where to centre a map: the middle of the ring if there is one, else the district's centre. */
  center: GeoPoint;
  boundary?: GeoPoint[];
}

export interface WarningDto {
  warningId: string;
  hazardType: HazardType;
  severity: Severity;
  messages: Messages;
  targetAreas: AreaDto[];
  validFrom: string;
  validTo: string;
  status: WarningStatus;
  submittedBy: string;
  submittedByName?: string;
  submittedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  issuedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  sourceClusterId?: string;
  sourceReportId?: string;
  updatedAt: string;
  version: number;
}

export interface ReviewDto {
  warning: WarningDto;
  recipients: RecipientEstimate;
  validation: ValidationResult;
}

export interface DeliveryDto {
  warning: WarningDto;
  result: IssueResult & { unreached: number };
  allChannelsUnavailable: boolean;
}

const iso = (date: Date | undefined): string | undefined => date?.toISOString();

function centerOf(area: TargetArea): GeoPoint {
  const ring = area.boundary;
  if (!ring || ring.length === 0) return DISTRICT_CENTROIDS[area.district];
  const lat = ring.reduce((sum, point) => sum + point.lat, 0) / ring.length;
  const lng = ring.reduce((sum, point) => sum + point.lng, 0) / ring.length;
  return { lat, lng };
}

export function toAreaDto(area: TargetArea): AreaDto {
  const { boundary, ...rest } = area.snapshot();
  return { ...rest, center: centerOf(area), ...(boundary ? { boundary: [...boundary] } : {}) };
}

export function toWarningDto(warning: Warning): WarningDto {
  const state = warning.snapshot();
  return withoutUndefined({
    warningId: state.warningId,
    hazardType: state.hazardType,
    severity: state.severity,
    messages: state.messages,
    targetAreas: state.targetAreas.map(toAreaDto),
    validFrom: state.validFrom.toISOString(),
    validTo: state.validTo.toISOString(),
    status: state.status,
    submittedBy: state.submittedBy,
    submittedByName: state.submittedByName,
    submittedAt: state.submittedAt.toISOString(),
    approvedBy: state.approvedBy,
    approvedAt: iso(state.approvedAt),
    issuedAt: iso(state.issuedAt),
    rejectedBy: state.rejectedBy,
    rejectedAt: iso(state.rejectedAt),
    rejectionReason: state.rejectionReason,
    sourceClusterId: state.sourceClusterId,
    sourceReportId: state.sourceReportId,
    updatedAt: state.updatedAt.toISOString(),
    version: state.version,
  });
}

export const toReviewDto = (review: WarningReview): ReviewDto => ({
  warning: toWarningDto(review.warning),
  recipients: review.recipients,
  validation: review.validation,
});

export const toDeliveryDto = (view: DeliveryView): DeliveryDto => ({
  warning: toWarningDto(view.warning),
  result: { ...view.result, unreached: view.result.targeted - view.result.reached },
  allChannelsUnavailable: view.allChannelsUnavailable,
});

/** Starts a spreadsheet formula when opened (CSV injection); a leading apostrophe makes it plain text. */
const FORMULA_START = /^[=+\-@\t\r]/;

const quoted = (value: string): string => `"${value.replace(/"/g, '""')}"`;

/** Free text typed by a citizen is neutralised; system-made values (ids, codes, +94 numbers) are not. */
const freeText = (value: string | undefined): string =>
  quoted(value !== undefined && FORMULA_START.test(value) ? `'${value}` : (value ?? ''));

const BYTE_ORDER_MARK = '\uFEFF';

const CSV_HEADER = [
  'Citizen ID',
  'Name',
  'Phone',
  'Address',
  'District',
  'Language',
  'Status',
  'Reason',
]
  .map(quoted)
  .join(',');

/**
 * E2: the follow-up list for door-to-door visits. A byte-order mark makes Excel read the Sinhala and
 * Tamil names as UTF-8.
 */
export function toUnreachedCsv(entries: readonly UnreachedEntry[]): string {
  const rows = entries.map((entry) =>
    [
      quoted(entry.citizenId),
      freeText(entry.fullName),
      quoted(entry.phone ?? ''),
      freeText(entry.addressLine),
      quoted(entry.district),
      quoted(entry.language),
      quoted(entry.status),
      quoted(entry.reason),
    ].join(','),
  );
  return `${BYTE_ORDER_MARK}${[CSV_HEADER, ...rows].join('\r\n')}\r\n`;
}
