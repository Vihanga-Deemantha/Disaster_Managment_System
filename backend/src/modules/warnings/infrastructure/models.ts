import mongoose, { Schema } from 'mongoose';
import {
  AREA_TYPES,
  CHANNELS,
  DISTRICTS,
  HAZARD_TYPES,
  LANGUAGES,
  SEVERITIES,
  type AreaType,
  type Channel,
  type District,
  type HazardType,
  type Language,
  type Severity,
} from '@shared/contracts/enums';
import type { AttemptStatus, Messages, NotificationStatus, WarningStatus } from '../domain/types';

export interface PointDoc {
  lat: number;
  lng: number;
}

export interface TargetAreaDoc {
  areaId: string;
  type: AreaType;
  name: string;
  district: District;
  boundary?: PointDoc[];
}

export interface WarningDoc {
  _id: string;
  hazardType: HazardType;
  severity: Severity;
  messages: Messages;
  targetAreas: TargetAreaDoc[];
  validFrom: Date;
  validTo: Date;
  status: WarningStatus;
  submittedBy: string;
  submittedByName?: string;
  submittedAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
  issuedAt?: Date;
  rejectedBy?: string;
  rejectedAt?: Date;
  rejectionReason?: string;
  sourceClusterId?: string;
  sourceReportId?: string;
  updatedAt: Date;
  version: number;
}

export interface AttemptDoc {
  channel: Channel;
  status: AttemptStatus;
  attemptedAt: Date;
  errorCode?: string;
}

export interface AlertNotificationDoc {
  _id: string;
  warningId: string;
  citizenId: string;
  language: Language;
  content: string;
  attempts: AttemptDoc[];
  overallStatus: NotificationStatus;
  unreachable: boolean;
  nextRetryAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const pointSchema = new Schema<PointDoc>(
  { lat: { type: Number, required: true }, lng: { type: Number, required: true } },
  { _id: false },
);

const targetAreaSchema = new Schema<TargetAreaDoc>(
  {
    areaId: { type: String, required: true },
    type: { type: String, enum: AREA_TYPES, required: true },
    name: { type: String, required: true },
    district: { type: String, enum: DISTRICTS, required: true },
    // `undefined`, not an empty array, when there is no ring: districts are matched by name.
    boundary: { type: [pointSchema], default: undefined },
  },
  { _id: false },
);

/** A message may be empty while a draft is being written, so none of the three is `required`. */
const messageField = { type: String, default: '' };

const warningSchema = new Schema<WarningDoc>(
  {
    _id: { type: String, required: true },
    hazardType: { type: String, enum: HAZARD_TYPES, required: true },
    severity: { type: String, enum: SEVERITIES, required: true },
    messages: {
      type: new Schema({ SI: messageField, TA: messageField, EN: messageField }, { _id: false }),
      required: true,
    },
    targetAreas: { type: [targetAreaSchema], required: true },
    validFrom: { type: Date, required: true },
    validTo: { type: Date, required: true },
    status: {
      type: String,
      enum: ['PENDING_APPROVAL', 'ISSUED', 'REJECTED'],
      required: true,
    },
    submittedBy: { type: String, required: true },
    submittedByName: String,
    submittedAt: { type: Date, required: true },
    approvedBy: String,
    approvedAt: Date,
    issuedAt: Date,
    rejectedBy: String,
    rejectedAt: Date,
    rejectionReason: String,
    sourceClusterId: String,
    sourceReportId: String,
    updatedAt: { type: Date, required: true },
    version: { type: Number, required: true },
  },
  { collection: 'warnings', versionKey: false },
);
warningSchema.index({ status: 1, submittedAt: -1 });
// One draft per UC-3 cluster, enforced by the database as well as by the handler.
warningSchema.index(
  { sourceClusterId: 1 },
  { unique: true, partialFilterExpression: { sourceClusterId: { $type: 'string' } } },
);

const attemptSchema = new Schema<AttemptDoc>(
  {
    channel: { type: String, enum: CHANNELS, required: true },
    status: { type: String, enum: ['DELIVERED', 'FAILED', 'UNAVAILABLE'], required: true },
    attemptedAt: { type: Date, required: true },
    errorCode: String,
  },
  { _id: false },
);

const alertNotificationSchema = new Schema<AlertNotificationDoc>(
  {
    _id: { type: String, required: true },
    warningId: { type: String, required: true },
    citizenId: { type: String, required: true },
    language: { type: String, enum: LANGUAGES, required: true },
    content: { type: String, required: true },
    attempts: { type: [attemptSchema], default: [] },
    overallStatus: {
      type: String,
      enum: ['DELIVERED', 'PENDING_RETRY', 'FAILED'],
      required: true,
    },
    unreachable: { type: Boolean, required: true },
    nextRetryAt: Date,
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { collection: 'alert_notifications', versionKey: false },
);
// One notification per citizen per warning: a re-run can never alert the same person twice.
alertNotificationSchema.index({ warningId: 1, citizenId: 1 }, { unique: true });
// A citizen's inbox (the phone polls it every 15 seconds): their delivered alerts, newest first.
alertNotificationSchema.index({ citizenId: 1, overallStatus: 1, createdAt: -1 });

export const WarningModel = mongoose.model<WarningDoc>('Warning', warningSchema);
export const AlertNotificationModel = mongoose.model<AlertNotificationDoc>(
  'AlertNotification',
  alertNotificationSchema,
);
