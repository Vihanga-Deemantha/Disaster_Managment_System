import type { UploadOutcome } from './types';

const DELIVERED = ['CREATED', 'ALREADY_RECEIVED', 'UPDATED_EXISTING'] as const;
type Via = (typeof DELIVERED)[number];
function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}
function delivered(body: unknown): UploadOutcome {
  const { outcome, report } = record(body);
  const id = record(report).id;
  if (!(DELIVERED as readonly unknown[]).includes(outcome) || typeof id !== 'string' || !id)
    return { kind: 'RETRY' };
  return { kind: 'DELIVERED', via: outcome as Via, reportId: id };
}
function duplicate(error: Record<string, unknown>): UploadOutcome {
  const id = record(error.details).existingReportId;
  return typeof id === 'string' && id.length > 0
    ? { kind: 'DUPLICATE_SUSPECTED', existingReportId: id }
    : { kind: 'RETRY' };
}
const transient = (status: number): boolean => status === 408 || status === 429 || status >= 500;
function rejected(status: number, error: Record<string, unknown>): UploadOutcome {
  return {
    kind: 'REJECTED',
    code: typeof error.code === 'string' ? error.code : `HTTP_${status}`,
    message: typeof error.message === 'string' ? error.message : 'The report was refused.',
  };
}
export function classifySubmitResponse(status: number, body: unknown): UploadOutcome {
  if (status === 200 || status === 201) return delivered(body);
  if (status === 401) return { kind: 'AUTH_REQUIRED' };
  if (transient(status)) return { kind: 'RETRY' };
  const error = record(record(body).error);
  if (status === 409 && error.code === 'DUPLICATE_SUSPECTED') return duplicate(error);
  return rejected(status, error);
}
