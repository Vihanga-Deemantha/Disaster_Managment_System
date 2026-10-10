import type { QueuedReport, QueueState } from '../offline/types';
import type { ReportHazardType } from './reportRules';

/** Fields from the reporter's API DTO needed by this projection. Callers must supply only their owner's reports. */
export interface RemoteReport {
  id: string;
  clientReportId: string;
  hazardType: ReportHazardType;
  description: string;
  capturedAt: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  rejectionReason?: string;
}
export type MyReportChip =
  | 'PENDING_SYNC'
  | 'SENDING'
  | 'NEEDS_CHOICE'
  | 'NOT_SENT'
  | 'PENDING_REVIEW'
  | 'VERIFIED'
  | 'REJECTED';
export interface MyReportItem {
  key: string;
  clientReportId: string;
  hazardType: ReportHazardType;
  description: string;
  capturedAt: string;
  chip: MyReportChip;
  local: boolean;
  detail?: string;
}
const LOCAL_CHIPS: Record<QueueState, MyReportChip> = {
  QUEUED: 'PENDING_SYNC',
  UPLOADING: 'SENDING',
  AWAITING_DECISION: 'NEEDS_CHOICE',
  NEEDS_ATTENTION: 'NOT_SENT',
};
const REMOTE_CHIPS: Record<RemoteReport['status'], MyReportChip> = {
  PENDING: 'PENDING_REVIEW',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
};

function localItem(report: QueuedReport): MyReportItem {
  return {
    key: report.clientReportId,
    clientReportId: report.clientReportId,
    hazardType: report.hazardType,
    description: report.description,
    capturedAt: report.capturedAt,
    chip: LOCAL_CHIPS[report.state],
    local: true,
    detail: report.state === 'NEEDS_ATTENTION' ? report.problem?.message : undefined,
  };
}
function remoteItem(report: RemoteReport): MyReportItem {
  return {
    key: report.id,
    clientReportId: report.clientReportId,
    hazardType: report.hazardType,
    description: report.description,
    capturedAt: report.capturedAt,
    chip: REMOTE_CHIPS[report.status],
    local: false,
    detail: report.status === 'REJECTED' ? report.rejectionReason : undefined,
  };
}
export function mergeMyReports(local: QueuedReport[], remote: RemoteReport[]): MyReportItem[] {
  const delivered = new Set(remote.map((report) => report.clientReportId));
  const waiting = local.filter((report) => !delivered.has(report.clientReportId)).map(localItem);
  return [...waiting, ...remote.map(remoteItem)].sort((a, b) =>
    b.capturedAt.localeCompare(a.capturedAt),
  );
}
