import { isWithinSriLanka } from '@shared/geo/GeoPoint';
import { z } from 'zod';
import { DEFAULT_CLUSTERING_CONFIG } from '../domain/ClusteringConfig';
import { CLUSTER_STATUSES, REPORT_HAZARD_TYPES, REPORT_STATUSES } from '../domain/types';

/**
 * Multipart text fields arrive as strings. A bare `Number('')` is 0, so a missing or blank
 * coordinate must be refused here instead of silently becoming a point off the coast of Africa.
 */
const coordinate = (limit: number) =>
  z
    .string('LOCATION_REQUIRED')
    .trim()
    .min(1, 'LOCATION_REQUIRED')
    .transform(Number)
    .pipe(
      z.number('LOCATION_INVALID').min(-limit, 'LOCATION_INVALID').max(limit, 'LOCATION_INVALID'),
    );

/** Optional: a blank value means "the phone did not report an accuracy". */
const accuracy = z
  .string()
  .trim()
  .transform((value) => (value === '' ? undefined : Number(value)))
  .pipe(z.number('ACCURACY_INVALID').nonnegative('ACCURACY_INVALID').optional())
  .optional();

/** Counted in characters, not UTF-16 units, like the mobile app counts them. */
const description = z
  .string()
  .trim()
  .refine(
    (value) => [...value].length <= DEFAULT_CLUSTERING_CONFIG.descriptionMaxChars,
    'DESCRIPTION_TOO_LONG',
  )
  .default('');

/** UC-3 step 7: the multipart fields of `POST /api/hazard-reports`. */
export const submitReportSchema = z
  .object({
    clientReportId: z
      .string('CLIENT_REPORT_ID_INVALID')
      .regex(/^[A-Za-z0-9-]{8,64}$/, 'CLIENT_REPORT_ID_INVALID'),
    hazardType: z.enum(REPORT_HAZARD_TYPES, 'HAZARD_TYPE_REQUIRED'),
    description,
    lat: coordinate(90),
    lng: coordinate(180),
    locationSource: z.enum(['GPS', 'MANUAL'], 'LOCATION_SOURCE_INVALID'),
    accuracyM: accuracy,
    capturedAt: z
      .string('CAPTURED_AT_INVALID')
      .pipe(z.iso.datetime({ offset: true, error: 'CAPTURED_AT_INVALID' }))
      .transform((value) => new Date(value)),
    duplicateAction: z.enum(['NEW', 'UPDATE'], 'DUPLICATE_ACTION_INVALID').optional(),
    syncedFromOffline: z
      .enum(['true', 'false'], 'SYNCED_FLAG_INVALID')
      .default('false')
      .transform((value) => value === 'true'),
  })
  .refine((value) => isWithinSriLanka(value), {
    path: ['lat'],
    message: 'LOCATION_OUTSIDE_SRI_LANKA',
    // Judge the position only when both coordinates were readable; otherwise the reporter would be
    // told "outside Sri Lanka" about a coordinate that was merely blank.
    when: ({ issues }) =>
      !issues.some((issue) => issue.path?.[0] === 'lat' || issue.path?.[0] === 'lng'),
  });

/** UC-3 A2: the reason is mandatory (H8). */
export const rejectSchema = z.object({
  reason: z.string('REASON_REQUIRED').trim().min(1, 'REASON_REQUIRED').max(500, 'REASON_TOO_LONG'),
});

const CLUSTER_STATUS_LIST = z
  .string('STATUS_INVALID')
  .transform((value, ctx) => {
    const requested = value.split(',');
    const known = requested.filter((status): status is (typeof CLUSTER_STATUSES)[number] =>
      (CLUSTER_STATUSES as readonly string[]).includes(status),
    );
    if (known.length !== requested.length) {
      ctx.addIssue({ code: 'custom', message: 'STATUS_INVALID' });
      return z.NEVER;
    }
    return known;
  })
  .default(['OPEN', 'ESCALATION_RECOMMENDED']);

/** UC-3 step 11: `?status=OPEN,ESCALATION_RECOMMENDED` (the default). */
export const queueQuerySchema = z.object({ status: CLUSTER_STATUS_LIST });

/** Reports history: `?status=&q=`. */
export const historyQuerySchema = z.object({
  status: z.enum(REPORT_STATUSES, 'STATUS_INVALID').optional(),
  q: z.string().trim().max(100, 'QUERY_TOO_LONG').optional(),
});
