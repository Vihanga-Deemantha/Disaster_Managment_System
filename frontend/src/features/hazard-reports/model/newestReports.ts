import type { Report } from '../api/types';

export function newestReports(reports: readonly Report[]): Report[] {
  return [...reports].sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt));
}
