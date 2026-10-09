import * as Crypto from 'expo-crypto';
import { api } from '@/shared/runtime';
import { ExpoLocationProvider } from './adapters/ExpoLocationProvider';
import { ExpoPhotoPicker, type PhotoPicker } from './adapters/ExpoPhotoPicker';
import { createSubmitTransport } from './adapters/MultipartTransport';
import { HttpReportUploader } from './api/HttpReportUploader';
import type { LocationProvider } from './hooks/useCurrentLocation';
import type { SubmissionDeps } from './hooks/useReportSubmission';

export interface ReportDependencies extends SubmissionDeps {
  location: LocationProvider;
  photos: PhotoPicker;
}
/** M2 online wiring; durable storage and sync replace this direct path in M4/M5. */
export const reportDependencies: ReportDependencies = {
  clock: { now: () => new Date() },
  ids: { next: () => Crypto.randomUUID() },
  uploader: new HttpReportUploader(createSubmitTransport(api)),
  location: new ExpoLocationProvider(),
  photos: new ExpoPhotoPicker(),
};
