export const REPORT_HAZARD_TYPES = ['FLOOD', 'LANDSLIDE', 'ROAD_BLOCKAGE', 'OTHER'] as const;
export type ReportHazardType = (typeof REPORT_HAZARD_TYPES)[number];
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const DESCRIPTION_MAX_CHARS = 500;
