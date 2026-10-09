import type { AuthContext } from '@shared/auth';
import type { GeoPoint } from '@shared/geo/GeoPoint';
import type { Clock } from '@shared/time/Clock';
import type { IdGenerator } from '@shared/ids/IdGenerator';
import { ConflictError } from '@shared/errors';
import type { ResourceStatus } from '../domain/types';
import { RescueTeam } from '../domain/RescueTeam';
import { Shelter } from '../domain/Shelter';
import { assertOwner } from './AllocationService';
import { resourceStock } from './resourceStock';
import type { ResourceUnitOfWork, ResourceStore } from './ports';

export class ResourceStatusService {
  constructor(private readonly deps: { uow: ResourceUnitOfWork; clock: Clock; ids: IdGenerator }) {}
  async updateTeam(auth: AuthContext, id: string, status: ResourceStatus, location: GeoPoint) {
    return this.deps.uow.run(async (store) => {
      const item = await store.get('inventory', id);
      assertOwner(auth, item.organizationId);
      const team = resourceStock(item);
      if (!(team instanceof RescueTeam))
        throw new ConflictError('WRONG_RESOURCE_TYPE', 'Choose a rescue team.');
      const inTransit = (await store.list('dispatches')).some(
        (d) => d.resourceId === id && d.status === 'DISPATCHED',
      );
      if (team.reservedQty > 0 || inTransit)
        throw new ConflictError(
          'TEAM_ASSIGNED',
          'Respond to pending requests and confirm arrival before changing team status.',
        );
      const now = this.deps.clock.now();
      team.updateStatus(status, location, now);
      const updated = {
        ...item,
        ...team.snapshot(),
        availableQty: status === 'AVAILABLE' ? 1 : 0,
        lastUpdatedAt: now,
        lastSyncedAt: now,
      };
      await store.save('inventory', id, updated);
      await this.audit(store, auth, 'resources.team-status', id);
      return updated;
    });
  }
  async updateOccupancy(auth: AuthContext, id: string, occupancy: number) {
    return this.deps.uow.run(async (store) => {
      const item = await store.get('inventory', id);
      assertOwner(auth, item.organizationId);
      const shelter = resourceStock(item);
      if (!(shelter instanceof Shelter))
        throw new ConflictError('WRONG_RESOURCE_TYPE', 'Choose a shelter.');
      shelter.updateOccupancy(occupancy);
      const now = this.deps.clock.now();
      const updated = { ...item, ...shelter.snapshot(), lastSyncedAt: now };
      await store.save('inventory', id, updated);
      await store.save('occupancyLogs', this.deps.ids.next(), {
        shelterId: id,
        recordedAt: now,
        occupancy,
      });
      await this.audit(store, auth, 'resources.shelter-occupancy', id);
      return updated;
    });
  }
  private audit(store: ResourceStore, auth: AuthContext, action: string, subjectId: string) {
    return store.audit({
      action,
      subjectId,
      subjectType: 'Resource',
      actorId: auth.userId,
      actorRole: auth.role,
      occurredAt: this.deps.clock.now(),
    });
  }
}
