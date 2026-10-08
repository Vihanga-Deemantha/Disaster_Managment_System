import type { Channel } from '@contracts/enums';
import type { ApiClient } from '@/shared/api/apiClient';
import { ApiError } from '@/shared/api/errors';
import type {
  DeliveryDto,
  GatewayMode,
  GatewayModes,
  OptionalChannel,
  ReviewDto,
  WarningDto,
} from './types';

const BASE = '/api/warnings';

/** UC-1 step 1: what is waiting for a DMC Officer, newest first. */
export const listPending = (api: ApiClient): Promise<WarningDto[]> =>
  api.get<WarningDto[]>(`${BASE}?status=PENDING_APPROVAL`);

/** UC-1 step 2. */
export const getReview = (api: ApiClient, warningId: string): Promise<ReviewDto> =>
  api.get<ReviewDto>(`${BASE}/${warningId}`);

/** UC-1 step 14: the numbers, per channel. */
export const getDelivery = (api: ApiClient, warningId: string): Promise<DeliveryDto> =>
  api.get<DeliveryDto>(`${BASE}/${warningId}/delivery`);

/**
 * UC-1 steps 6 to 14 (BR3, BR5). The key is made once per confirmation and reused if the request has to
 * be sent again, so a dropped connection can never issue the warning twice.
 */
export const issueWarning = (
  api: ApiClient,
  warningId: string,
  optionalChannels: readonly OptionalChannel[],
  idempotencyKey: string,
): Promise<DeliveryDto> =>
  api.post<DeliveryDto>(`${BASE}/${warningId}/issue`, { optionalChannels }, { idempotencyKey });

/**
 * E2: the server answers 503 `ALL_CHANNELS_UNAVAILABLE` when the warning WAS issued but no gateway could
 * send anything. That is not a failure to issue: the summary screen explains it and offers a retry.
 */
export const isOutage = (error: unknown): boolean =>
  error instanceof ApiError && error.code === 'ALL_CHANNELS_UNAVAILABLE';

/** A1, E2: send again whatever has not got through. */
export const retryFailed = (api: ApiClient, warningId: string): Promise<DeliveryDto> =>
  api.post<DeliveryDto>(`${BASE}/${warningId}/retry-failed`);

/** E2: where the browser downloads the follow-up list (the session cookie goes with the request). */
export const unreachedCsvUrl = (warningId: string): string => `${BASE}/${warningId}/unreached.csv`;

/** The same-origin path of one warning's screens inside the app. */
export const reviewPath = (warningId: string): string => `/warnings/${warningId}`;
export const deliveryPath = (warningId: string): string => `/warnings/${warningId}/delivery`;

/** Demo toggles (not mounted in production). */
export const getGateways = (api: ApiClient): Promise<GatewayModes> =>
  api.get<GatewayModes>('/api/dev/gateways');

export const setGatewayMode = (
  api: ApiClient,
  channel: Channel,
  mode: GatewayMode,
): Promise<GatewayModes> => api.put<GatewayModes>(`/api/dev/gateways/${channel}`, { mode });
