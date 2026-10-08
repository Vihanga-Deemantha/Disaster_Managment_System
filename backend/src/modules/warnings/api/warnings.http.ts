import { Router, type Request, type Response } from 'express';
import { getAuth } from '@shared/auth';
import { ServiceUnavailableError, ValidationError, parseOrThrow } from '@shared/errors';
import { retainIdempotentResult } from '@shared/http/idempotency';
import type { ModuleContext } from '@shared/module';
import type { WarningController } from '../application/WarningController';
import { toDeliveryDto, toReviewDto, toUnreachedCsv, toWarningDto } from './dto';
import { parseIfMatch } from './ifMatch';
import { issueSchema, listQuerySchema, rejectSchema, updateWarningSchema } from './schemas';

/** Step-up (BR3): the password must have been typed within this many seconds of issuing. */
const RECENT_AUTH_SECONDS = 300;

const warningIdOf = (req: Request): string => String(req.params.id);
const officerOf = (req: Request): string => getAuth(req).userId;

/**
 * The HTTP face of UC-1 (SD1-02): every handler parses, calls the controller, and maps the answer.
 * There is no business rule in this file. Everything needs a signed-in DMC Officer (BR1).
 */
export function createWarningsRouter(controller: WarningController, ctx: ModuleContext): Router {
  const router = Router();
  router.use(ctx.guards.requireAuth, ctx.guards.requireRole('DMC_OFFICER'));
  addReviewRoutes(router, controller, ctx);
  addIssueRoutes(router, controller, ctx);
  addDeliveryRoutes(router, controller, ctx);
  return router;
}

/** Steps 1–4 and A2/A3: list, open, edit, reject. */
function addReviewRoutes(router: Router, controller: WarningController, ctx: ModuleContext): void {
  router.get('/', async (req, res) => {
    const { status } = parseOrThrow(listQuerySchema, req.query);
    res.json((await controller.listWarnings(status)).map(toWarningDto));
  });

  router.get('/:id', async (req, res) => {
    res.json(toReviewDto(await controller.getWarningForReview(warningIdOf(req))));
  });

  router.patch('/:id', ctx.idempotency.optional, async (req, res) => {
    const body = parseOrThrow(updateWarningSchema, req.body);
    const expectedVersion = parseIfMatch(req.get('If-Match')) ?? body.expectedVersion;
    if (expectedVersion === undefined) {
      throw new ValidationError([{ field: 'expectedVersion', code: 'VERSION_REQUIRED' }]);
    }
    const { messages, severity, validFrom, validTo } = body;
    const changes = { messages, severity, validFrom, validTo };
    res.json(
      toReviewDto(
        await controller.updateWarning(warningIdOf(req), officerOf(req), changes, expectedVersion),
      ),
    );
  });

  router.post('/:id/reject', ctx.idempotency.optional, async (req, res) => {
    const { reason } = parseOrThrow(rejectSchema, req.body);
    res.json(
      toWarningDto(await controller.rejectWarning(warningIdOf(req), officerOf(req), reason)),
    );
  });
}

/** Steps 5–14: approve and issue. */
function addIssueRoutes(router: Router, controller: WarningController, ctx: ModuleContext): void {
  // Recent re-authentication first: a refused attempt must not use up the Idempotency-Key.
  router.post(
    '/:id/issue',
    ctx.guards.requireRecentAuth(RECENT_AUTH_SECONDS),
    ctx.idempotency.required,
    async (req, res) => {
      const options = parseOrThrow(issueSchema, req.body ?? {});
      const view = await controller.issueWarning(warningIdOf(req), officerOf(req), options);
      if (view.allChannelsUnavailable) outage(res, toDeliveryDto(view));
      res.json(toDeliveryDto(view));
    },
  );
}

/** Steps 12–14, A1, E2: the delivery summary, the retry button and the follow-up list. */
function addDeliveryRoutes(
  router: Router,
  controller: WarningController,
  ctx: ModuleContext,
): void {
  router.get('/:id/delivery', async (req, res) => {
    res.json(toDeliveryDto(await controller.getDelivery(warningIdOf(req))));
  });

  router.post('/:id/retry-failed', ctx.idempotency.optional, async (req, res) => {
    res.json(toDeliveryDto(await controller.retryFailed(warningIdOf(req), officerOf(req))));
  });

  router.get('/:id/unreached.csv', async (req, res) => {
    const csv = toUnreachedCsv(await controller.listUnreached(warningIdOf(req)));
    res
      .type('text/csv; charset=utf-8')
      .set('Content-Disposition', `attachment; filename="unreached-${warningIdOf(req)}.csv"`)
      .send(csv);
  });
}

/**
 * E2: the warning IS issued, but no gateway could send anything. The answer is a 503 that carries the
 * summary, and the idempotency middleware is told to keep it, so a repeat gets the same answer
 * instead of issuing again.
 */
function outage(res: Response, delivery: unknown): never {
  retainIdempotentResult(res);
  throw new ServiceUnavailableError(
    'ALL_CHANNELS_UNAVAILABLE',
    'The warning was issued, but every delivery channel is unavailable. It will be retried.',
    { delivery },
  );
}
