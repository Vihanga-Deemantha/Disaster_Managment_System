import type { AuthContext } from '@shared/auth';
import { ConflictError } from '@shared/errors';
import { ResourceDispatch } from '../domain/ResourceDispatch';
import { ResourceRequirement } from '../domain/ResourceRequirement';
import { assertDistrict, type AllocationDeps } from './AllocationService';
import type { Dispatch, Need, ResourceStore } from './ports';

/** UC-2 A3/A5: destination, fulfilment, history and notifications commit together. */
export class DispatchService {
  constructor(private readonly deps: Pick<AllocationDeps, 'uow' | 'clock' | 'ids'>) {}
  async change(auth: AuthContext, id: string, action: 'failed' | 'reschedule', reason = '') {
    return this.deps.uow.run(async (store) => {
      const record = await store.get('dispatches', id);
      assertDistrict(auth, record.district);
      const dispatch = new ResourceDispatch(record);
      const now = this.deps.clock.now();
      if (action === 'failed') dispatch.reportDistributionFailure(reason, auth.userId, now);
      else dispatch.reschedule(auth.userId, now);
      const updated = dispatch.snapshot();
      await store.save('dispatches', id, updated);
      await this.record(store, auth, updated, action, reason);
      return updated;
    });
  }
  async reassign(auth: AuthContext, id: string, targetAreaId: string, reason: string) {
    return this.deps.uow.run(async (store) => {
      const record = await store.get('dispatches', id);
      assertDistrict(auth, record.district);
      const source = await store.get('areas', record.areaId);
      const target = await store.get('areas', targetAreaId);
      assertDistrict(auth, target.district);
      if (target.disasterEventId !== source.disasterEventId || target.priority >= source.priority)
        throw new ConflictError(
          'REASSIGN_NOT_HIGHER_PRIORITY',
          'Choose a higher-priority area in the same disaster event.',
        );
      const original = await store.get('needs', record.requirementId);
      const need = await targetNeed(store, original, targetAreaId, record.quantity);
      const nextId = this.deps.ids.next();
      const dispatch = new ResourceDispatch(record);
      const now = this.deps.clock.now();
      dispatch.reassign(nextId, reason, auth.userId, now);
      const replacement = replacementDispatch(record, need, nextId, now, { auth, reason });
      await moveFulfilment(store, original, need, record.quantity);
      await store.save('dispatches', id, dispatch.snapshot());
      await store.save('dispatches', nextId, replacement);
      await this.record(store, auth, replacement, 'reassigned', reason);
      return replacement;
    });
  }
  private async record(
    store: ResourceStore,
    auth: AuthContext,
    dispatch: Dispatch,
    action: string,
    reason: string,
  ) {
    const now = this.deps.clock.now();
    await store.audit({
      action: `resources.${action}`,
      actorId: auth.userId,
      actorRole: auth.role,
      subjectId: dispatch.dispatchId,
      occurredAt: now,
      details: { reason, areaId: dispatch.areaId },
    });
    const item = await store.get('inventory', dispatch.resourceId);
    const area = await store.get('areas', dispatch.areaId);
    const notificationId = this.deps.ids.next();
    await store.save('notifications', notificationId, {
      notificationId,
      requestId: dispatch.requestId,
      organizationId: item.organizationId,
      district: dispatch.district,
      createdAt: now,
      message: `${item.organizationName}: delivery ${action} for ${area.name}.${reason ? ` Reason: ${reason}` : ''}`,
    });
  }
}
async function targetNeed(store: ResourceStore, original: Need, areaId: string, quantity: number) {
  const need = (await store.list('needs')).find(
    (n) =>
      n.areaId === areaId &&
      n.resourceType === original.resourceType &&
      n.category === original.category &&
      n.unit === original.unit,
  );
  if (!need || need.requiredQty - need.fulfilledQty - need.pendingQty < quantity)
    throw new ConflictError(
      'EXCEEDS_NEED',
      'The target area has insufficient matching outstanding need.',
    );
  return need;
}
async function moveFulfilment(
  store: ResourceStore,
  original: Need,
  target: Need,
  quantity: number,
) {
  const source = new ResourceRequirement(original);
  const destination = new ResourceRequirement(target);
  source.revertFulfilled(quantity);
  destination.addFulfilled(quantity);
  await store.save('needs', original.requirementId, { ...original, ...source.snapshot() });
  await store.save('needs', target.requirementId, { ...target, ...destination.snapshot() });
}
function replacementDispatch(
  record: Dispatch,
  target: Need,
  id: string,
  now: Date,
  input: { auth: AuthContext; reason: string },
): Dispatch {
  return {
    dispatchId: id,
    requestId: record.requestId,
    resourceId: record.resourceId,
    requirementId: target.requirementId,
    areaId: target.areaId,
    district: record.district,
    quantity: record.quantity,
    status: 'DISPATCHED',
    dispatchedAt: now,
    previousDispatchId: record.dispatchId,
    history: [
      { action: 'reassigned-from', actorId: input.auth.userId, at: now, reason: input.reason },
    ],
  };
}
