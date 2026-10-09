import { isTaskSuccess } from '../offline/taskResult';
import type { SyncStop } from '../offline/types';

describe('UC-3 A1: background task result', () => {
  it.each<[SyncStop | undefined, boolean]>([
    ['RETRY_LATER', false],
    ['OFFLINE', true],
    ['NO_SESSION', true],
    [undefined, true],
  ])('maps %s to success=%s', (stoppedBy, success) => {
    expect(
      isTaskSuccess({
        trigger: 'OS_TASK',
        ranAt: '2026-10-09T03:00:00Z',
        uploaded: 0,
        remaining: 1,
        stoppedBy,
      }),
    ).toBe(success);
  });
});
