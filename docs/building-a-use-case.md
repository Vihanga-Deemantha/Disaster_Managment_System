# Building your use case on the foundation

You own **one** backend module and **one** frontend feature. You never edit `shared/`, `app.ts`, `bootstrap.ts` or `routes.tsx`
(those are frozen; changes go through a PR approved by all four owners). Everything you need is handed to you.

```
backend/src/modules/<name>/      frontend/src/features/<name>/
  domain/ application/             index.tsx   <- your screens (mounted at /<name>/*)
  infrastructure/ api/             nav.ts      <- your sidebar entry (label, path, roles)
  composition.ts  seed/ __tests__/ (add your components, hooks, tests here)
```

Start by reading your use-case file, then work in this order: **domain + tests → application + tests → infrastructure →
HTTP routes + tests → screens + tests**. Name tests after the report: `UC-2 A1: …`.

---

## Backend

### 1. What you receive

`composition.ts` is the **only** place concrete classes are built. It receives a `ModuleContext`:

| `ctx.…`            | What it is                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| `clock`, `ids`     | Inject these. `new Date()`, `Date.now()`, `Math.random()` are lint errors in domain/application  |
| `eventBus`         | Publish and subscribe to the three cross-module events                                           |
| `auditLog`         | `record({ action, actorId, actorRole, subjectType, subjectId, reason, details, occurredAt })`    |
| `guards`           | `requireAuth`, `requireRole(...)`, `requireScope({...})`, `requireRecentAuth(seconds)`           |
| `idempotency`      | `required` / `optional` middleware for the `Idempotency-Key` header (offline replays apply once) |
| `citizenProfiles`  | Registered citizens for alert targeting (never exposes the NIC). UC-1 only, realistically        |
| `logger`, `config` | Structured logger; `config.env` and `config.isProduction` (no secrets)                           |

```ts
// modules/resources/composition.ts
import type { ModuleFactory } from '@shared/module';

export const createResourcesModule: ModuleFactory = (ctx) => {
  const allocations = new MongoAllocationRepository();
  const controller = new AllocationController({
    allocations,
    clock: ctx.clock,
    ids: ctx.ids,
    events: ctx.eventBus,
    audit: ctx.auditLog,
  });
  return {
    name: 'resources',
    mountPath: '/api/resources',
    router: createResourcesRouter(controller, ctx),
    devRouter: createResourcesDevRouter(), // optional: demo toggles, mounted at /api/dev outside production only
  };
};
```

The module is already registered in `bootstrap.ts`; you only replace the stub in `composition.ts`.

### 2. Routes: guards first, no logic in handlers

```ts
// modules/resources/api/resources.http.ts
import { Router } from 'express';
import { getAuth } from '@shared/auth';
import { parseOrThrow } from '@shared/errors';
import type { ModuleContext } from '@shared/module';

export function createResourcesRouter(
  controller: AllocationController,
  { guards, idempotency }: ModuleContext,
) {
  const router = Router();
  router.use(guards.requireAuth);

  router.post(
    '/districts/:district/allocations',
    guards.requireRole('DISTRICT_OFFICER'),
    guards.requireScope({ district: (req) => req.params.district }), // an officer may only act in their own district
    idempotency.required, // after requireAuth: keys are per user
    async (req, res) => {
      const input = parseOrThrow(createAllocationSchema, req.body); // Zod -> 400 with a field list
      res.status(201).json(await controller.requestAllocation(getAuth(req).userId, input));
    },
  );
  return router;
}
```

- Express 5 forwards thrown errors and rejected promises to the error handler: just `throw` a domain error.
- Throw `ValidationError` (400), `UnauthorizedError` (401), `ForbiddenError` (403), `NotFoundError` (404),
  `ConflictError` (409), `UnprocessableError` (422), `TooManyRequestsError` (429), `ServiceUnavailableError` (503) from
  `@shared/errors`. Give each a **code** (`NO_RECIPIENTS`); the body is always `{ error: { code, message, fields? } }`.
- `requireScope` compares the caller's token claims (district / organisation) with what the route names. Callers without
  that claim (e.g. a DMC Officer) are national and pass. The server decides, never the client.
- Mass-alert style actions add `guards.requireRecentAuth(300)` (step-up, BR3): the web app calls `reauth(password)` first.
- If a 5xx response still changed state (UC-1 E2: issued but every gateway down), call
  `retainIdempotentResult(res)` from `@shared/http/idempotency` so a replay returns the same answer instead of re-running.

### 3. Events (the only way modules talk)

```ts
import type { WarningIssued } from '@shared/contracts/events';

await ctx.eventBus.publish({
  type: 'WarningIssued',
  warningId /* …the frozen payload… */,
} satisfies WarningIssued);

ctx.eventBus.subscribe('ClusterEscalationRequested', async (event) => {
  /* event is fully typed */
});
```

A subscriber that throws never breaks the publisher; the failure is logged. The payloads in
`shared/contracts/events.ts` are frozen: agree any change with the group.

### 4. Persistence

Use Mongoose models in `infrastructure/`. Reuse the shared ones where they exist: `RiverBasinModel` (shared/geo), the
audit log, the citizen directory. Citizens are stored with a 2dsphere-indexed `homeLocation`, so
`ctx.citizenProfiles.findWithinPolygon(ring)`, `.findByDistrict(...)` and `.findByRiverBasin(...)` are ready for targeting.

### 5. Seed data

Fill `seed/index.ts` (it receives `SeedContext`: `accounts`, `users`, `demoPasswordHash`, `clock`, `ids`, `logger`).
Create demo citizens with `ctx.accounts.createCitizen(...)` so they are stored exactly like real registrations. The demo
organisation ids (`org-red-cross`, …) are exported as `DEMO_ORGANIZATIONS` from `shared/auth/seed`. Seeds must be idempotent.
Run `npm run seed` (add `-- --fresh` to start clean).

### 6. Testing

- **Domain / application**: plain Jest with `FixedClock` and `SequentialIdGenerator`, in-memory repositories you write,
  `FakeEventBus` (`.ofType('WarningIssued')`), `FakeAuditLog` (`.actions()`), `FakeCitizenProfileReader`.
- **HTTP**: one call gives you an Express app with the real guards, CSRF, idempotency and error handling:

  ```ts
  import { createModuleHarness } from '@shared/testing/moduleHarness';

  const h = createModuleHarness(createResourcesModule);
  const res = await h
    .as({ role: 'DISTRICT_OFFICER', district: 'GAMPAHA' })
    .post('/api/resources/districts/GAMPAHA/allocations')
    .send(body);
  expect(res.status).toBe(201);
  expect(h.events.ofType('AllocationDeployed')).toHaveLength(1);
  ```

  `h.as({...})` signs the request in as that user (any `AuthContext` field, e.g. `authenticatedAt` for step-up tests) and
  adds the CSRF header. Use `h.clock.advance(...)` to move time.

- **Repositories**: `connectTestMongo()` / `clearDatabase()` from `@shared/testing/mongo` give you a real throwaway MongoDB.
- Coverage for `modules/<name>/**` must be **100%** (lines, branches, functions, statements). `composition.ts`, `seed/` and
  `testing/` folders are excluded; the gate switches on automatically when your folder has code.

---

## Frontend

### 1. Your screens

`features/<name>/index.tsx` exports your page component. The app mounts it at `/<name>/*` inside the shared shell, lazily,
and already guards it with the `roles` in your `nav.ts`. Handle sub-routes yourself:

```tsx
import { Route, Routes } from 'react-router';

export function WarningsPage() {
  return (
    <Routes>
      <Route index element={<PendingApprovals />} />
      <Route path=":warningId" element={<ReviewWarning />} />
    </Routes>
  );
}
```

Features may import `@/shared/*` and `@contracts/*` but **not other features** (ESLint enforces it).

To look like the rest of the app, start each screen with `<PageHeader title subtitle>` and build it from `Card`, `StatCard`
and `SeverityPill` in `@/shared/ui`. Your `nav.ts` entry may also name an `icon` (any name in `shared/ui/Icon.tsx`; a plain
dot when you leave it out) and a `useBadge` hook that returns a number to show beside the label (UC-1 shows how many warnings
are waiting). `docs/design/uc1-pending-approvals-redesign.md` shows the look and the reasons for it.

### 2. Talking to the API, online or offline

```tsx
import { useApi } from '@/shared/api/ApiProvider';
import { LastSynced } from '@/shared/offline/LastSynced';
import { useCachedResource } from '@/shared/offline/useCachedResource';
import { useOfflineWrite } from '@/shared/offline/useOfflineWrite';
import { useOnlineStatus } from '@/shared/offline/useOnlineStatus';
import { translateError } from '@/shared/i18n/translateError';

const api = useApi();
const { data, loading, error, syncedAt, fromCache, reload } = useCachedResource({
  module: 'warnings',
  name: 'pending-list',
  load: () => api.get<Warning[]>('/api/warnings?status=PENDING_APPROVAL'),
});
// Show a skeleton while `loading && !data`, `translateError(t, error)` on `error`, an empty state for [],
// and <LastSynced syncedAt={syncedAt} /> beside anything that may come from the cache.

const write = useOfflineWrite(); // for changes that are safe to apply later
const result = await write({
  module: 'warnings',
  method: 'POST',
  url: `/api/warnings/${id}/reject`,
  body: { reason },
});
if (result.queued) {
  /* say "Queued: will be sent when you are back online" */
}

const online = useOnlineStatus();
// For actions whose result the person must see at once (UC-1 Approve & Issue), disable offline and say why:
// <Button disabled={!online} title="Issuing needs a connection so you can see delivery results">
```

The API client adds the CSRF header, sends cookies, refreshes an expired session transparently, and throws `ApiError`
(`.code`, `.fields`, `.details`) or `NetworkError`. The shell already shows the offline banner, the "session expired"
prompt, and warns before sign-out if changes are unsent.

For a step-up confirmation (BR3): `const { reauth } = useAuth(); await reauth(password);` then send the guarded request.
A wrong password rejects with code `INVALID_CREDENTIALS`: show it inline in the dialog.

### 3. UI kit and rules

`Button` (with `loading`), `TextField`, `PasswordField`, `SelectField`, `CheckboxField`, `Alert`, `Dialog` (focus trap, Esc,
returns focus), `Spinner`, `SeverityBadge` live in `@/shared/ui/*`. Rules from the plan: loading, empty and error state on every
screen, confirmation before irreversible actions (`Dialog` does not close on a stray outside click by default), colour **and**
text for severity, keyboard-accessible, responsive down to tablet width.

### 4. Strings in Sinhala, Tamil and English

Add your keys (prefix `warnings.…`) at the bottom of `messages.en.ts`, then the same keys in `messages.si.ts` and
`messages.ta.ts`. A missing key is a **compile error**, and a test checks every language keeps the same `{placeholders}`.
Use `const t = useT(); t('warnings.title')`. For API error codes add `error.<CODE>` keys: `translateError` picks them up.

### 5. Testing

```tsx
import { http, HttpResponse } from 'msw';
import { routes } from '@/routes';
import { signIn } from '@/shared/testing/auth';
import { makeMe } from '@/shared/testing/fixtures';
import { renderRoutes } from '@/shared/testing/render';
import { server } from '@/shared/testing/server';

signIn(makeMe({ role: 'DMC_OFFICER' })); // the server says who is signed in
server.use(http.get('/api/warnings', () => HttpResponse.json([/* … */])));
renderRoutes(routes, { route: '/warnings' }); // real router, real providers, fake API
expect(await screen.findByRole('heading', { name: 'Pending Approvals' })).toBeInTheDocument();
```

Any request without a handler fails the test. Helpers: `setBrowserOnline(false)` / `resetBrowserOnline()`,
`settle(fn)` (wraps async updates in `act`), `apiError(status, code, { fields, details })`, `okUser(user)`.
Cover loading / empty / error / success, dialogs, the offline banner and disabled actions. Coverage for
`features/<name>/**` must be **100%**.

---

## Before you open a pull request

- [ ] `npm run lint && npm run typecheck && npm test` pass locally (the pre-commit hook already formats and lints staged files)
- [ ] Every scenario flow (main, A\*, E\*) is demonstrable from the UI and has a test named after the report
- [ ] JSDoc on public control/domain methods cites the scenario steps: `/** UC-2 steps 6–11; A1; E2. */`
- [ ] No `console.log`, commented-out code, `any`, TODOs, or dead code
- [ ] Added screenshots, coverage and Stryker output to your report section; traceability table filled in
