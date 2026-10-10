import type { ModuleFactory } from '@shared/module';
import { AllocationService } from './application/AllocationService';
import { resourceRouter } from './api/resources.http';
import { MongoResourceStore, MongoResourceUnitOfWork } from './infrastructure/MongoResourceStore';
import { ResourceStatusService } from './application/ResourceStatusService';
import { addResourceStatusRoutes } from './api/resourceStatus.http';
import { ExpiryScheduler } from './infrastructure/ExpiryScheduler';
import { DispatchService } from './application/DispatchService';
import { addDispatchRoutes } from './api/dispatch.http';
import { addPartnerDemoRoutes } from './api/partnerDemo.http';
import { Router } from 'express';
import { simulatorRouter } from './api/simulator.http';

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
  const status = new ResourceStatusService({
    uow: new MongoResourceUnitOfWork(),
    clock: ctx.clock,
    ids: ctx.ids,
  });
  const router = Router();
  if (ctx.config.env === 'development')
    router.use(
      '/dev/simulator',
      simulatorRouter(ctx, { service, status, store, uow: new MongoResourceUnitOfWork() }),
    );
  router.use(resourceRouter(ctx, service, store));
  addDispatchRoutes(
    router,
    ctx,
    new DispatchService({ uow: new MongoResourceUnitOfWork(), clock: ctx.clock, ids: ctx.ids }),
  );
  addPartnerDemoRoutes(router, ctx, new MongoResourceUnitOfWork());
  addResourceStatusRoutes(router, ctx, status, store);
  return {
    name: 'resources',
    mountPath: '/api/resources',
    router,
  };
};
