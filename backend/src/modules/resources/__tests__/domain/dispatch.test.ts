import { ResourceDispatch, type DispatchProps } from '../../domain/ResourceDispatch';

const now = new Date('2026-10-09T00:00:00Z');
const record: DispatchProps = {
  dispatchId: 'd',
  requestId: 'r',
  resourceId: 'i',
  requirementId: 'n',
  areaId: 'a',
  district: 'GAMPAHA',
  quantity: 10,
  status: 'DISPATCHED',
  dispatchedAt: now,
};
it('UC-2 A5: requires a reason, preserves history and only reschedules pending distribution', () => {
  const dispatch = new ResourceDispatch(record);
  expect(() => dispatch.reportDistributionFailure(' ', 'officer', now)).toThrow();
  dispatch.reportDistributionFailure('Road closed', 'officer', now);
  expect(dispatch.snapshot().status).toBe('DISTRIBUTION_PENDING');
  dispatch.reschedule('officer', now);
  expect(dispatch.snapshot().history).toHaveLength(2);
  expect(dispatch.snapshot().history![1].reason).toBeUndefined();
  expect(() => dispatch.reschedule('officer', now)).toThrow();
  dispatch.reassign('replacement', 'Urgent', 'officer', now);
  expect(dispatch.snapshot().replacementDispatchId).toBe('replacement');
  expect(() => dispatch.reassign('again', 'Urgent', 'officer', now)).toThrow();
  const restored = new ResourceDispatch(dispatch.snapshot());
  const snapshot = restored.snapshot();
  snapshot.history!.pop();
  expect(restored.snapshot().history).toHaveLength(3);
});
it('UC-2 A3: can reassign distribution pending but never a deployed dispatch', () => {
  const dispatch = new ResourceDispatch({ ...record, status: 'DISTRIBUTION_PENDING' });
  dispatch.reassign('new', 'Emergency', 'actor', now);
  expect(dispatch.snapshot().status).toBe('REASSIGNED');
  expect(() =>
    new ResourceDispatch({ ...record, status: 'DEPLOYED' }).reportDistributionFailure(
      'Road',
      'a',
      now,
    ),
  ).toThrow();
});
