import type { ModuleFactory } from '@shared/module';
import { AllocationService } from './application/AllocationService';
import { resourceRouter } from './api/resources.http';
import { MongoResourceStore, MongoResourceUnitOfWork } from './infrastructure/MongoResourceStore';

/** UC-2 adapters are composed here; allocation rules depend only on injected ports. */
export const createResourcesModule: ModuleFactory = (ctx) => {
  const service = new AllocationService({
    uow: new MongoResourceUnitOfWork(),
    clock: ctx.clock,
    ids: ctx.ids,
    events: ctx.eventBus,
  });
  return {
    name: 'resources',
    mountPath: '/api/resources',
    router: resourceRouter(ctx, service, new MongoResourceStore()),
  };
};
