import type { ReportHazardType } from './reportRules';

export interface DraftLocation {
  lat: number;
  lng: number;
  source: 'GPS' | 'MANUAL';
  accuracyM?: number;
}
export interface PickedPhoto {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
}
export interface PhotoToSend {
  uri: string;
  name: string;
  mimeType: string;
  bytes: number;
}
export interface ReportDraft {
  hazardType?: ReportHazardType;
  description: string;
  location?: DraftLocation;
  photo?: PickedPhoto;
}
export interface ValidReportDraft {
  hazardType: ReportHazardType;
  description: string;
  location: DraftLocation;
  photo?: PhotoToSend;
}
