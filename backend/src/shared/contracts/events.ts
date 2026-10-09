/**
 * Cross-module events, including the owner-approved individual report -> warning handoff.
 * Modules never import each other: they only publish and subscribe to these on the shared EventBus.
 */
import type { GeoPoint } from '../geo/GeoPoint';
import type { AreaType, Channel, District, HazardType, OrganizationType, Severity } from './enums';

export interface TargetAreaRef {
  type: AreaType;
  id: string;
  name: string;
  district: District;
}

/** UC-3 -> UC-1 (report UC-3 steps 21-23). */
export interface ClusterEscalationRequested {
  type: 'ClusterEscalationRequested';
  clusterId: string;
  hazardType: HazardType;
  proposedSeverity: Severity;
  targetArea: TargetAreaRef;
  centroid: GeoPoint;
  verifiedReportCount: number;
  totalReportCount: number;
  /** 0-100 */
  priorityScore: number;
  /** Duty officer id. */
  requestedBy: string;
  requestedByRole?: 'DUTY_OFFICER' | 'DMC_OFFICER';
  /** ISO timestamp. */
  occurredAt: string;
}

/** UC-3 -> UC-1: an individual report approved by either officer enters the DMC warning queue. */
export interface HazardReportApproved {
  type: 'HazardReportApproved';
  reportId: string;
  hazardType: HazardType;
  proposedSeverity: Severity;
  targetArea: TargetAreaRef;
  approvedBy: string;
  approvedByRole: 'DUTY_OFFICER' | 'DMC_OFFICER';
  occurredAt: string;
}

/** UC-1 -> UC-4 (report UC-1 step 13). */
export interface WarningIssued {
  type: 'WarningIssued';
  warningId: string;
  hazardType: HazardType;
  severity: Severity;
  targetArea: TargetAreaRef;
  issuedAt: string;
  targetedCitizens: number;
  /** Delivered on at least one channel. */
  reached: number;
  pendingRetry: number;
  failed: number;
  byChannel: Record<Channel, { sent: number; delivered: number; failed: number }>;
}

/** UC-2 -> UC-4 (report UC-2 step 14). */
export interface AllocationDeployed {
  type: 'AllocationDeployed';
  allocationId: string;
  district: District;
  affectedAreaId: string;
  organizationId: string;
  organizationName: string;
  organizationType: OrganizationType;
  supplyCategory: string;
  quantity: number;
  unit: string;
  deployedAt: string;
}

export type DomainEvent =
  ClusterEscalationRequested | HazardReportApproved | WarningIssued | AllocationDeployed;
export type DomainEventType = DomainEvent['type'];
export type EventOfType<T extends DomainEventType> = Extract<DomainEvent, { type: T }>;
