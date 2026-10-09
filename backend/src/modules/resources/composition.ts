import type { ModuleFactory } from '@shared/module';
import { AllocationService } from './application/AllocationService';
import { resourceRouter } from './api/resources.http';
import { MongoResourceStore, MongoResourceUnitOfWork } from './infrastructure/MongoResourceStore';
import { ResourceStatusService } from './application/ResourceStatusService';
import { addResourceStatusRoutes } from './api/resourceStatus.http';
import { ExpiryScheduler } from './infrastructure/ExpiryScheduler';

/** UC-2 adapters are composed here; allocation rules depend only on injected ports. */
export const createResourcesModule: ModuleFactory = (ctx) => {
  const service = new AllocationService({
    uow: new MongoResourceUnitOfWork(),
    clock: ctx.clock,
    ids: ctx.ids,
    events: ctx.eventBus,
  });
  const store = new MongoResourceStore();
  if (ctx.config.env !== 'test')
    new ExpiryScheduler({
      expire: () => service.expirePending(),
      onError: (error) => ctx.logger.error('Allocation expiry failed', { error: String(error) }),
    }).start();
  const router = resourceRouter(ctx, service, store);
  addResourceStatusRoutes(
    router,
    ctx,
    new ResourceStatusService({
      uow: new MongoResourceUnitOfWork(),
      clock: ctx.clock,
      ids: ctx.ids,
    }),
    store,
  );
  return {
    name: 'resources',
    mountPath: '/api/resources',
    router,
  };
};
