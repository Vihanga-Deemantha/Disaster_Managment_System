import type { QueuedReport, UploadOptions } from '../offline/types';

export interface FilePart {
  uri: string;
  name: string;
  type: string;
}
export type SubmitPart = [name: string, value: string | FilePart];
export function buildSubmitParts(entry: QueuedReport, options: UploadOptions): SubmitPart[] {
  const { location, photo } = entry;
  const parts: SubmitPart[] = [
    ['clientReportId', entry.clientReportId],
    ['hazardType', entry.hazardType],
    ['description', entry.description],
    ['lat', String(location.lat)],
    ['lng', String(location.lng)],
    ['locationSource', location.source],
    ['capturedAt', entry.capturedAt],
    ['syncedFromOffline', String(options.syncedFromOffline)],
  ];
  if (location.accuracyM !== undefined) parts.push(['accuracyM', String(location.accuracyM)]);
  if (options.duplicateAction) parts.push(['duplicateAction', options.duplicateAction]);
  if (photo) parts.push(['photo', { uri: photo.uri, name: photo.name, type: photo.mimeType }]);
  return parts;
}
