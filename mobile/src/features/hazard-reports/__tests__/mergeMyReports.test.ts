import { mergeMyReports, type RemoteReport } from '../domain/mergeMyReports';
import type { QueueState, QueuedReport } from '../offline/types';
import { aDraft } from '../testing/fakes';

const local = (state: QueueState): QueuedReport => ({
  ...aDraft(),
  clientReportId: 'client-local',
  ownerId: 'citizen-1',
  capturedAt: '2026-10-09T03:00:00Z',
  state,
  attempts: 0,
});
const remote = (status: RemoteReport['status']): RemoteReport => ({
  ...aDraft(),
  id: 'server-1',
  clientReportId: 'client-remote',
  capturedAt: '2026-10-09T04:00:00Z',
  status,
});
describe('UC-3 H10: merge local and server report statuses', () => {
  it.each([
    ['QUEUED', 'PENDING_SYNC'],
    ['UPLOADING', 'SENDING'],
    ['AWAITING_DECISION', 'NEEDS_CHOICE'],
    ['NEEDS_ATTENTION', 'NOT_SENT'],
  ] as const)('maps %s to %s', (state, chip) => {
    const report = { ...local(state), problem: { code: 'INVALID_PHOTO', message: 'Bad photo' } };
    expect(mergeMyReports([report], [])).toEqual([
      {
        key: 'client-local',
        clientReportId: 'client-local',
        hazardType: 'FLOOD',
        description: 'Water rising',
        capturedAt: report.capturedAt,
        chip,
        local: true,
        detail: state === 'NEEDS_ATTENTION' ? 'Bad photo' : undefined,
      },
    ]);
  });
  it.each([
    ['PENDING', 'PENDING_REVIEW'],
    ['VERIFIED', 'VERIFIED'],
    ['REJECTED', 'REJECTED'],
  ] as const)('maps server %s to %s', (status, chip) => {
    expect(
      mergeMyReports([], [{ ...remote(status), rejectionReason: 'Not confirmed' }])[0],
    ).toMatchObject({
      key: 'server-1',
      chip,
      local: false,
      detail: status === 'REJECTED' ? 'Not confirmed' : undefined,
    });
  });
  it('hides an acknowledged local copy and sorts newest capture first without changing inputs', () => {
    const queued = local('QUEUED');
    const acknowledged = { ...remote('PENDING'), clientReportId: queued.clientReportId };
    const other = { ...queued, clientReportId: 'older' };
    const inputs = [queued, other];
    expect(mergeMyReports(inputs, [acknowledged]).map((r) => r.key)).toEqual(['server-1', 'older']);
    expect(inputs).toEqual([queued, other]);
  });
  it('supports missing reasons and empty inputs', () => {
    expect(mergeMyReports([], [])).toEqual([]);
    expect(
      mergeMyReports([local('NEEDS_ATTENTION')], [remote('REJECTED')]).map((r) => r.detail),
    ).toEqual([undefined, undefined]);
  });
});
