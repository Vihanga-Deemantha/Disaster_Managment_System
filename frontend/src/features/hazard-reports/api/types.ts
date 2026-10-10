import type { District } from '@contracts/enums';

export type ReportStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';
export type Band = 'HIGH' | 'ELEVATED' | 'MODERATE' | 'LOW';
export type ClusterStatus = 'OPEN' | 'ESCALATION_RECOMMENDED' | 'ESCALATED' | 'CLOSED';
export type ReportHazardType = 'FLOOD' | 'LANDSLIDE' | 'ROAD_BLOCKAGE' | 'OTHER';
export type EscalationRequirement = 'HIGH_BAND' | 'VERIFIED_REPORTS' | 'WARNABLE_HAZARD';
export interface Report {
  id: string;
  clientReportId: string;
  reporterId: string;
  reporterType: 'CITIZEN' | 'VOLUNTEER';
  hazardType: ReportHazardType;
  description: string;
  photoUrl?: string;
  location: { lat: number; lng: number; source: 'GPS' | 'MANUAL'; accuracyM?: number };
  capturedAt: string;
  receivedAt: string;
  syncedFromOffline: boolean;
  status: ReportStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  clusterId?: string;
}
export interface ClusterSummary {
  id: string;
  district: District;
  centroid: { lat: number; lng: number };
  dominantHazardType: ReportHazardType;
  priorityScore: number;
  band: Band;
  status: ClusterStatus;
  counts: { total: number; pending: number; verified: number; rejected: number };
  escalation: { recommended: boolean; unmet: EscalationRequirement[]; requiredVerified: number };
  firstReportedAt: string;
  lastReportAt: string;
}
export interface ClusterDetail extends ClusterSummary {
  reports: Report[];
}
export interface ReviewResult {
  report: Report;
  cluster: ClusterSummary;
}
