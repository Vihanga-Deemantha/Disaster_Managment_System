import type { ApiClient } from '@/shared/api/apiClient';
import { ApiError, NetworkError } from '@/shared/api/errors';
import {
  deliveryPath,
  getDelivery,
  getGateways,
  getReview,
  isOutage,
  issueWarning,
  listByStatus,
  listPending,
  retryFailed,
  reviewPath,
  setGatewayMode,
  unreachedCsvUrl,
} from '../api';

/** An API client that records what was asked of it. */
function recorder() {
  const calls: unknown[][] = [];
  const answer = async (...args: unknown[]) => {
    calls.push(args);
    return { ok: true };
  };
  const api = { get: answer, post: answer, put: answer } as unknown as ApiClient;
  return { api, calls };
}

describe('the warnings API calls', () => {
  it('UC-1 step 1: asks for the warnings waiting for approval', async () => {
    const { api, calls } = recorder();
    await listPending(api);
    expect(calls).toEqual([['/api/warnings?status=PENDING_APPROVAL']]);
  });

  it.each(['PENDING_APPROVAL', 'ISSUED', 'REJECTED'] as const)(
    'asks for the %s warnings of the three lists',
    async (status) => {
      const { api, calls } = recorder();
      await listByStatus(api, status);
      expect(calls).toEqual([[`/api/warnings?status=${status}`]]);
    },
  );

  it('UC-1 step 2: asks for one warning’s review', async () => {
    const { api, calls } = recorder();
    await getReview(api, 'W-1');
    expect(calls).toEqual([['/api/warnings/W-1']]);
  });

  it('UC-1 step 14: asks for the delivery summary', async () => {
    const { api, calls } = recorder();
    await getDelivery(api, 'W-1');
    expect(calls).toEqual([['/api/warnings/W-1/delivery']]);
  });

  it('UC-1 BR5: issues with the optional channels and the idempotency key', async () => {
    const { api, calls } = recorder();
    await issueWarning(api, 'W-1', ['EMAIL'], 'key-123');
    expect(calls).toEqual([
      ['/api/warnings/W-1/issue', { optionalChannels: ['EMAIL'] }, { idempotencyKey: 'key-123' }],
    ]);
  });

  it('UC-1 A1: retries what failed', async () => {
    const { api, calls } = recorder();
    await retryFailed(api, 'W-1');
    expect(calls).toEqual([['/api/warnings/W-1/retry-failed']]);
  });

  it('UC-1 demo: reads and sets the simulated gateways', async () => {
    const { api, calls } = recorder();
    await getGateways(api);
    await setGatewayMode(api, 'SMS', 'DOWN');
    expect(calls).toEqual([['/api/dev/gateways'], ['/api/dev/gateways/SMS', { mode: 'DOWN' }]]);
  });
});

describe('the addresses of the warnings screens and files', () => {
  it('knows where the review and delivery screens are', () => {
    expect(reviewPath('W-1')).toBe('/warnings/W-1');
    expect(deliveryPath('W-1')).toBe('/warnings/W-1/delivery');
  });

  it('UC-1 E2: the follow-up list is a plain download', () => {
    expect(unreachedCsvUrl('W-1')).toBe('/api/warnings/W-1/unreached.csv');
  });
});

describe('UC-1 E2: isOutage', () => {
  it('is true only for "issued, but every gateway was down"', () => {
    expect(isOutage(new ApiError(503, 'ALL_CHANNELS_UNAVAILABLE', 'x'))).toBe(true);
  });

  it.each([
    new ApiError(409, 'WARNING_NOT_PENDING', 'x'),
    new ApiError(503, 'SOMETHING_ELSE', 'x'),
    new NetworkError(),
    new Error('boom'),
    'ALL_CHANNELS_UNAVAILABLE',
    undefined,
  ])('is false for %s', (error) => {
    expect(isOutage(error)).toBe(false);
  });
});
