import type { AuthContext } from '@shared/auth';
import type { Clock } from '@shared/time/Clock';
import type { IdGenerator } from '@shared/ids/IdGenerator';
import type { EventBus } from '@shared/events/EventBus';
import { ConflictError, ForbiddenError } from '@shared/errors';
import { AllocationRequest } from '../domain/AllocationRequest';
import { ResourceRequirement } from '../domain/ResourceRequirement';
import { assertResourceQuantity, recordArrival, resourceStock } from './resourceStock';
import { assertQuantity } from '../domain/quantity';
import type { Inventory, ResourceStore, ResourceUnitOfWork, RequestRecord, Records } from './ports';

export interface AllocationDeps {
  uow: ResourceUnitOfWork;
  clock: Clock;
  ids: IdGenerator;
  events: EventBus;
}
export class AllocationService {
  constructor(private readonly deps: AllocationDeps) {}

  async request(auth: AuthContext, requirementId: string, resourceId: string, quantity: number) {
    assertQuantity(quantity, 'quantity');
    const requestId = this.deps.ids.next();
    return this.deps.uow.run(async (store) => {
      const need = await store.get('needs', requirementId);
      const area = await store.get('areas', need.areaId);
      assertDistrict(auth, area.district);
      const item = await store.get('inventory', resourceId);
      assertMatch(item, need);
      assertOutstanding(new ResourceRequirement(need).outstanding() - need.pendingQty, quantity);
      assertResourceQuantity(item, quantity);
      if (item.resourceType === 'SHELTER' && item.district !== area.district)
        throw new ConflictError('RESOURCE_MISMATCH', 'Choose a shelter in the affected district.');
      const stock = resourceStock(item);
      stock.reserve(quantity);
      const now = this.deps.clock.now();
      const request: RequestRecord = {
        requestId,
        requirementId,
        resourceId,
        organizationId: item.organizationId,
        requestedQty: quantity,
        status: 'PENDING',
        district: area.district,
        requestedBy: auth.userId,
        createdAt: now,
        respondBy: new Date(now.getTime() + 30 * 60_000),
      };
      await store.save('inventory', resourceId, { ...item, ...stock.snapshot() });
      await store.save('needs', requirementId, { ...need, pendingQty: need.pendingQty + quantity });
      await store.save('requests', requestId, request);
      await this.notify(store, {
        requestId,
        organizationId: item.organizationId,
        message: `${quantity} ${item.unit} of ${item.category} requested for ${area.name}. Respond within 30 minutes.`,
      });
      await this.audit(store, auth, 'resources.requested', requestId);
      return request;
    });
  }

  async respond(
    auth: AuthContext,
    requestId: string,
    response: { quantity?: number; reason?: string },
  ) {
    return this.deps.uow.run(async (store) => {
      const record = await store.get('requests', requestId);
      assertOwner(auth, record.organizationId);
      const request = new AllocationRequest(record);
      const item = await store.get('inventory', record.resourceId);
      const stock = resourceStock(item);
      const need = await store.get('needs', record.requirementId);
      const now = this.deps.clock.now();
      let dispatchId: string | undefined;
      if (response.quantity !== undefined) {
        assertResourceQuantity(item, response.quantity);
        request.confirm(response.quantity, now);
        stock.consume(response.quantity);
        const unused = record.requestedQty - response.quantity;
        if (unused > 0) stock.release(unused);
        const requirement = new ResourceRequirement(need);
        requirement.addFulfilled(response.quantity);
        need.fulfilledQty = requirement.fulfilledQty;
        dispatchId = await this.dispatch(store, record, response.quantity, need.areaId);
      } else {
        request.reject(response.reason ?? '', now);
        stock.release(record.requestedQty);
      }
      need.pendingQty -= record.requestedQty;
      await store.save('needs', record.requirementId, need);
      await store.save('inventory', record.resourceId, { ...item, ...stock.snapshot() });
      await store.save('requests', requestId, { ...record, ...request.snapshot() });
      await this.notifyResponse(store, record, item, request.status);
      await this.audit(store, auth, `resources.${request.status.toLowerCase()}`, requestId);
      return { ...record, ...request.snapshot(), dispatchId };
    });
  }

  async deploy(auth: AuthContext, dispatchId: string) {
    const event = await this.deps.uow.run(async (store) => {
      const dispatch = await store.get('dispatches', dispatchId);
      assertDistrict(auth, dispatch.district);
      if (dispatch.status !== 'DISPATCHED')
        throw new ConflictError('ILLEGAL_TRANSITION', 'Dispatch already deployed.');
      const item = await store.get('inventory', dispatch.resourceId);
      const now = this.deps.clock.now();
      await recordArrival(store, item, dispatch, now, this.deps.ids.next());
      await store.save('dispatches', dispatchId, {
        ...dispatch,
        status: 'DEPLOYED',
        deployedAt: now,
      });
      await this.audit(store, auth, 'resources.deployed', dispatchId);
      await this.notify(store, {
        requestId: dispatch.requestId,
        organizationId: item.organizationId,
        message: `${dispatch.quantity} ${item.unit} of ${item.category} arrived in ${dispatch.district}.`,
      });
      return {
        type: 'AllocationDeployed' as const,
        allocationId: dispatchId,
        district: dispatch.district,
        affectedAreaId: dispatch.areaId,
        organizationId: item.organizationId,
        organizationName: item.organizationName,
        organizationType: item.organizationType,
        supplyCategory: item.category,
        quantity: dispatch.quantity,
        unit: item.unit,
        deployedAt: now.toISOString(),
      };
    });
    await this.deps.events.publish(event);
    return event;
  }

  async expirePending(): Promise<void> {
    await this.deps.uow.run(async (store) => {
      const now = this.deps.clock.now();
      const due = (await store.list('requests')).filter(
        (r) => r.status === 'PENDING' && r.respondBy <= now,
      );
      for (const record of due) await this.expire(store, record);
    });
  }
  private async expire(store: ResourceStore, record: RequestRecord) {
    const request = new AllocationRequest(record);
    request.markNoResponse(this.deps.clock.now());
    const item = await store.get('inventory', record.resourceId);
    const stock = resourceStock(item);
    stock.release(record.requestedQty);
    const need = await store.get('needs', record.requirementId);
    await store.save('inventory', record.resourceId, { ...item, ...stock.snapshot() });
    await store.save('needs', record.requirementId, {
      ...need,
      pendingQty: need.pendingQty - record.requestedQty,
    });
    await store.save('requests', record.requestId, { ...record, ...request.snapshot() });
    await this.notify(store, {
      requestId: record.requestId,
      district: record.district,
      national: true,
      message: `${item.organizationName} did not respond in time. ${record.requestedQty} ${item.unit} released; choose another owner.`,
    });
    await store.audit({
      action: 'resources.expired',
      subjectId: record.requestId,
      occurredAt: this.deps.clock.now(),
    });
  }
  private async dispatch(
    store: ResourceStore,
    request: RequestRecord,
    quantity: number,
    areaId: string,
  ) {
    const dispatchId = this.deps.ids.next();
    await store.save('dispatches', dispatchId, {
      dispatchId,
      requestId: request.requestId,
      requirementId: request.requirementId,
      resourceId: request.resourceId,
      district: request.district,
      areaId,
      quantity,
      status: 'DISPATCHED',
      dispatchedAt: this.deps.clock.now(),
    });
    return dispatchId;
  }
  private audit(store: ResourceStore, auth: AuthContext, action: string, subjectId: string) {
    return store.audit({
      action,
      actorId: auth.userId,
      actorRole: auth.role,
      subjectType: 'ResourceAllocation',
      subjectId,
      occurredAt: this.deps.clock.now(),
    });
  }
  private async notify(
    store: ResourceStore,
    notification: Omit<Records['notifications'], 'notificationId' | 'createdAt'>,
  ) {
    const notificationId = this.deps.ids.next();
    await store.save('notifications', notificationId, {
      ...notification,
      notificationId,
      createdAt: this.deps.clock.now(),
    });
  }
  private notifyResponse(
    store: ResourceStore,
    record: RequestRecord,
    item: Inventory,
    status: string,
  ) {
    return this.notify(store, {
      requestId: record.requestId,
      district: record.district,
      message: `${item.organizationName} ${status.toLowerCase()} your request for ${item.category}.`,
    });
  }
}
export function assertDistrict(auth: AuthContext, district: string): void {
  if (auth.role !== 'DISTRICT_OFFICER' || auth.district !== district) {
    throw new ForbiddenError(
      'FORBIDDEN_SCOPE',
      'Only the officer for this district may allocate resources.',
    );
  }
}
export function assertOwner(auth: AuthContext, organizationId: string): void {
  const roles = ['NGO_MANAGER', 'ARMED_FORCES_LIAISON', 'GOVERNMENT_AGENCY_OFFICER'];
  if (!roles.includes(auth.role) || auth.organizationId !== organizationId) {
    throw new ForbiddenError('FORBIDDEN_SCOPE', 'Only this resource owner may respond.');
  }
}
function assertOutstanding(outstanding: number, quantity: number): void {
  if (quantity > outstanding)
    throw new ConflictError('EXCEEDS_NEED', 'Quantity exceeds unreserved outstanding need.');
}
function assertMatch(
  item: Inventory,
  need: { resourceType: string; category: string; unit: string },
): void {
  if (
    item.resourceType !== need.resourceType ||
    item.category !== need.category ||
    item.unit !== need.unit
  ) {
    throw new ConflictError('RESOURCE_MISMATCH', 'Choose matching resources and units.');
  }
}
