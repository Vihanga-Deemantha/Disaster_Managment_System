import type { AreaType, Channel, District, HazardType, Language, Severity } from '@contracts/enums';

/** What the warnings API sends (backend `modules/warnings/api/dto.ts`). Dates travel as ISO text. */
export type WarningStatus = 'PENDING_APPROVAL' | 'ISSUED' | 'REJECTED';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface AreaDto {
  areaId: string;
  type: AreaType;
  name: string;
  district: District;
  /** Where to centre a map. */
  center: GeoPoint;
  boundary?: GeoPoint[];
}

export type Messages = Record<Language, string>;

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
  submittedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  issuedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  sourceClusterId?: string;
  updatedAt: string;
  version: number;
}

export interface RecipientEstimate {
  total: number;
  byChannel: Record<Channel, number>;
  unreachable: number;
}

/** One thing wrong with a warning: which field, and a machine code the screen translates (E1). */
export interface FieldIssue {
  field: string;
  code: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: FieldIssue[];
}

export interface ReviewDto {
  warning: WarningDto;
  recipients: RecipientEstimate;
  validation: ValidationResult;
}

export interface ChannelTally {
  sent: number;
  delivered: number;
  failed: number;
}

export interface IssueResult {
  targeted: number;
  reached: number;
  pendingRetry: number;
  failed: number;
  /** Citizens not reached on any channel: the length of the follow-up list. */
  unreached: number;
  byChannel: Record<Channel, ChannelTally>;
}

export interface DeliveryDto {
  warning: WarningDto;
  result: IssueResult;
  allChannelsUnavailable: boolean;
}

export type GatewayMode = 'OK' | 'FAIL_SOME' | 'DOWN';
export type GatewayModes = Record<Channel, GatewayMode>;

/** WhatsApp and e-mail are the only channels the officer chooses (UC-1 step 11). */
export const OPTIONAL_CHANNELS = ['WHATSAPP', 'EMAIL'] as const satisfies readonly Channel[];
export type OptionalChannel = (typeof OPTIONAL_CHANNELS)[number];
