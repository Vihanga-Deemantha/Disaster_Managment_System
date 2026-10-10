import { DISTRICTS } from '@shared/contracts/enums';
import mongoose, { Schema } from 'mongoose';
import type { HazardReportState } from '../domain/HazardReport';
import type { ReportClusterState } from '../domain/ReportCluster';
import { CLUSTER_STATUSES, REPORT_HAZARD_TYPES, REPORT_STATUSES } from '../domain/types';

/** A stored report: the entity's state with `id` stored as Mongo's `_id`. */
export type HazardReportDoc = Omit<HazardReportState, 'id'> & { _id: string };
export type ReportClusterDoc = Omit<ReportClusterState, 'id'> & { _id: string };

const reportSchema = new Schema<HazardReportDoc>(
  {
    _id: { type: String, required: true },
    clientReportId: { type: String, required: true },
    reporterId: { type: String, required: true },
    reporterType: { type: String, enum: ['CITIZEN', 'VOLUNTEER'], required: true },
    hazardType: { type: String, enum: REPORT_HAZARD_TYPES, required: true },
    description: { type: String, default: '' },
    photo: { url: String, mime: String, bytes: Number },
    location: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
      source: { type: String, enum: ['GPS', 'MANUAL'], required: true },
      accuracyM: Number,
    },
    capturedAt: { type: Date, required: true },
    receivedAt: { type: Date, required: true },
    syncedFromOffline: { type: Boolean, required: true },
    status: { type: String, enum: REPORT_STATUSES, required: true },
    reviewedBy: String,
    reviewedAt: Date,
    rejectionReason: String,
    clusterId: String,
  },
  { collection: 'hazard_reports', versionKey: false },
);
// The atomic claim behind replay protection (H7): one report per reporter and client-generated id.
reportSchema.index({ reporterId: 1, clientReportId: 1 }, { unique: true });
reportSchema.index({ clusterId: 1 });
reportSchema.index({ reporterId: 1, capturedAt: -1 });
reportSchema.index({ status: 1, receivedAt: -1 });

export const HazardReportModel = mongoose.model<HazardReportDoc>('HazardReport', reportSchema);

const clusterSchema = new Schema<ReportClusterDoc>(
  {
    _id: { type: String, required: true },
    centroid: { lat: { type: Number, required: true }, lng: { type: Number, required: true } },
    district: { type: String, enum: DISTRICTS, required: true },
    reportIds: [String],
    dominantHazardType: { type: String, enum: REPORT_HAZARD_TYPES, required: true },
    priorityScore: { type: Number, required: true },
    band: { type: String, enum: ['HIGH', 'ELEVATED', 'MODERATE', 'LOW'], required: true },
    status: { type: String, enum: CLUSTER_STATUSES, required: true },
    counts: {
      total: { type: Number, required: true },
      pending: { type: Number, required: true },
      verified: { type: Number, required: true },
      rejected: { type: Number, required: true },
    },
    firstReportedAt: { type: Date, required: true },
    lastReportAt: { type: Date, required: true },
    escalatedBy: String,
    escalatedAt: Date,
  },
  { collection: 'report_clusters', versionKey: false },
);
clusterSchema.index({ status: 1, priorityScore: -1 });
clusterSchema.index({ status: 1, 'centroid.lat': 1, 'centroid.lng': 1 });

export const ReportClusterModel = mongoose.model<ReportClusterDoc>('ReportCluster', clusterSchema);
