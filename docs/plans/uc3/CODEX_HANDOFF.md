# UC3 hand-off: everything an agent needs to finish the plan

Read this file first, then `IMPLEMENTATION_PLAN.md` (status table, decisions D1–D14, REST contract, Notes), then the
plan for the phase you were given. **Where this file and a plan disagree, this file wins** (it was written after the
backend was built). Where a plan and the code disagree, the code wins.

## 1. Where things stand (7 Oct 2026)

Branch `feat/uc3-hazard-reports`, cut from `develop`. Owner: Pawan-Menuka. Deadline Fri 9 Oct 2026, 23:59.

| Done                                                                               | Left                                                                 |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| B1 domain, B2 application, B3 persistence, B4 HTTP API (277 tests, module at 100%) | **B5** seed                                                          |
| `mobile/` scaffold (Expo SDK 57, tabs, Jest)                                       | **M0.2** root lint entries, **M0.3** API client + sign-in, dev build |
| Plans A–D, revised master + UC3 plans                                              | **W1–W5** web dashboard                                              |
|                                                                                    | **M1–M7** mobile logic, screens, OS background sync, device tests    |
|                                                                                    | **R** report artefacts (owner does these by hand)                    |

Plans: `docs/plans/uc3/A-backend.md` (B5 only now), `B-web-dashboard.md` (W1–W5), `C-mobile-app.md` (M0–M7),
`D-offline-sync-design.md` (read before M3–M5). Spec: `docs/plans/uc3/revised/03-UC3-hazard-report.md`.
Foundation guide: `README.md`, `docs/building-a-use-case.md`.

## 2. Hard rules

1. **Scope.** Edit only `backend/src/modules/hazard-reports/**`, `frontend/src/features/hazard-reports/**`,
   `mobile/**`, `docs/plans/**`, `IMPLEMENTATION_PLAN.md`. Allowed shared edits, each as its own small commit:
   your strings at the bottom of `frontend/src/shared/i18n/messages.{en,si,ta}.ts`; the additive entries of task M0.2
   (`eslint.config.mjs`, `.prettierignore`, `.github/CODEOWNERS`, a README section). Nothing else under
   `backend/src/shared`, `frontend/src/shared`, `app.ts`, `bootstrap.ts`, `routes.tsx`, `navigation.ts`, `e2e/`.
2. **No cross-module imports.** UC3 talks to other use cases only through `ctx.eventBus`.
3. **Never push to `main` or `develop`.** Commit on `feat/uc3-hazard-reports`. Push only when the owner says so.
4. **Commits carry the owner's identity only.** No `Co-Authored-By` trailer, no "generated with" line, in commits or PRs.
5. **One phase per session.** Finish it, verify it, update the status table in `IMPLEMENTATION_PLAN.md`
   (TODO → DONE with a one-line note and any deviation), commit, stop and report.
6. **Tests first** for logic (domain-style code, hooks, services): write the test, see it fail, implement, see it pass.
   Name tests after the flow: `'UC-3 A1: …'`. Assert state, not mock calls.
7. **Coverage gates are real:** 100% lines/branches/functions/statements on the backend module and the web feature
   (`composition.ts`, `seed/`, `testing/`, tests excluded). Close a gap by adding a test, never with an ignore comment.
8. **Visual design belongs to the owner.** Build behaviour, states, accessible names and tests with the shared UI kit
   and the colour tokens in `frontend/src/index.css` (web) / `mobile/src/shared/theme` (mobile). Plain, semantic
   markup; no invented branding, no redesign of shared components. If wireframe images are provided, match them.
9. **Check installed versions before using an API** (Zod 4, Express 5, React 19, react-router 7, Expo SDK 57,
   expo-file-system's new `File`/`Directory` API). Read the package's typings or versioned docs; `mobile/AGENTS.md`
   says the same for Expo.
10. If something outside your scope is wrong, write it under "Notes from building" in `IMPLEMENTATION_PLAN.md` and
    tell the owner. Do not fix it.

## 3. Environment (Windows 11, this machine)

- Run `npm` / `npx` / `node` tools in **Git Bash**, not PowerShell 5.1. Quote paths.
- Root install: `npm ci` (never `npm install <pkg> --no-package-lock`, never kill npm mid-run: it corrupts
  `node_modules/.bin`; repair with `npm ci`). `mobile/` has its own `npm install`; add Expo packages with
  `npx expo install <pkg>`.
- Pre-commit hook: commit with `git -c core.hooksPath=.husky/_ commit …` if a plain commit says it cannot spawn
  `.husky/pre-commit`. Do not use `--no-verify`.
- `npx tsc --noEmit`: do not pipe it; allow 5+ minutes.
- The network is flaky. On sudden fetch or MongoDB errors, ask the owner to check the connection before debugging.

### Commands

```bash
# backend (from backend/)
npx jest src/modules/hazard-reports --maxWorkers=2 --coverage=false        # fast loop
npx jest --maxWorkers=2                                                     # everything, real coverage gates
# web (from frontend/)
npx vitest run src/features/hazard-reports
npx vitest run --coverage                                                   # real gates
# mobile (from mobile/)
npx jest && npx tsc --noEmit && npx expo-doctor
# repo root
npx eslint backend/src/modules/hazard-reports frontend/src/features/hazard-reports
npx prettier --check backend/src/modules/hazard-reports frontend/src/features/hazard-reports mobile/src
```

### Known failures that are NOT yours (do not "fix")

- 7 tests in `backend/src/shared/auth/__tests__/infrastructure.test.ts` and 3 `tsc` errors: the optional `argon2`
  package does not install on this machine. Fine in CI.
- `backend/src/__tests__/bootstrap.integration.test.ts` › "registers every use-case module": expects
  `ROUTE_NOT_FOUND` from an unauthenticated call; a guarded module correctly answers `401`. Shared file; the owner is
  raising it with the team.
- MongoDB suites time out when more than two run at once here: always `--maxWorkers=2`.

## 4. The backend as built (use this, not older plan text)

Files: `domain/` (types, `ClusteringConfig`, `PriorityScore(r)`, `EscalationPolicy`, `PhotoValidator`,
`DuplicateDetector`, `HazardReport`, `ReportCluster`), `application/` (`ports.ts`, `ClusteringService`,
`ReportSubmissionService`, `ReportReviewService`), `infrastructure/` (`models.ts`, two Mongo repositories,
`DiskPhotoStorage`, `compact.ts`), `api/` (`schemas.ts`, `dto.ts`, `photoUpload.ts`, `hazard-reports.http.ts`),
`composition.ts` (`composeHazardReportsModule(ctx, ports)` + `createHazardReportsModule`), `testing/`
(`builders.ts`: `aReport`, `aCluster`, `north`, `jpeg`, `KALUTARA`, `BASE_TIME`, `minutesAfter`; `inMemory.ts`;
`httpFixture.ts`).

REST contract: the table and TypeScript shapes in `IMPLEMENTATION_PLAN.md` are accurate. Additions and exact codes:

- Every route needs the `sz_access` cookie; POSTs need `X-Requested-With: SafeZone`.
- `POST /api/hazard-reports`: multipart **or** JSON (JSON only without a photo). All field values are strings.
  `201 {outcome:"CREATED",report}` · `200 {outcome:"ALREADY_RECEIVED"|"UPDATED_EXISTING",report}` ·
  `409 DUPLICATE_SUSPECTED` (`error.details.existingReportId`) ·
  `400 INVALID_PHOTO` (`fields[0].code`: `PHOTO_TOO_LARGE | PHOTO_TYPE | PHOTO_EMPTY | PHOTO_UNREADABLE`) ·
  `400 MALFORMED_UPLOAD` · `400 VALIDATION_FAILED` with field codes `CLIENT_REPORT_ID_INVALID`,
  `HAZARD_TYPE_REQUIRED`, `DESCRIPTION_TOO_LONG`, `LOCATION_REQUIRED`, `LOCATION_INVALID`,
  `LOCATION_OUTSIDE_SRI_LANKA`, `LOCATION_SOURCE_INVALID`, `ACCURACY_INVALID`, `CAPTURED_AT_INVALID`,
  `CAPTURED_AT_IN_FUTURE`, `DUPLICATE_ACTION_INVALID`, `SYNCED_FLAG_INVALID`.
- `capturedAt` must be ISO with an offset (`…Z` or `+05:30`) and at most 5 minutes ahead of the server.
- `GET /clusters?status=` takes a comma list; an unknown value is `400 STATUS_INVALID`. Reading the queue or a cluster
  **rescores it first**, so scores and the `ESCALATION_RECOMMENDED` status are always current.
- `POST /:id/verify`, `POST /:id/reject {reason}` → `200 {report, cluster}` (`cluster` is a `ClusterSummary`).
  `REASON_REQUIRED`, `REASON_TOO_LONG` (500), `REPORT_ALREADY_REVIEWED` (409), `REPORT_NOT_FOUND` (404).
- `POST /clusters/:id/escalate` → `200 ClusterDetail` with `status:"ESCALATED"`; `409 ESCALATION_NOT_ALLOWED`;
  `404 CLUSTER_NOT_FOUND`.
- `GET /photos/:fileName` → the image; `404 PHOTO_NOT_FOUND`. `photoUrl` in a report is this path, relative.
- Roles: submit = `CITIZEN`, `COMMUNITY_VOLUNTEER`; queue/cluster/verify/reject/escalate = `DUTY_OFFICER`;
  list/detail/photo = all three (a reporter only sees their own). Wrong role → `403 FORBIDDEN_ROLE`.

Scores to expect: single flood report now = 54; single "other" = 39; ten flood reports now = 94.

## 5. Corrections to the older plan text

- **Plan C (mobile):** routes are in `mobile/src/app/`; the alias `@/` means `mobile/src/`. Expo SDK is **57**.
  `package.json` already has `main: index.ts`, scripts `start`, `android`, `test`, `typecheck`, `lint`. Task M0.1 is
  done except the development build (the owner does that: it needs their Expo account or Android Studio).
- **Plan C, response classifier:** also treat `400 MALFORMED_UPLOAD` as `REJECTED`.
- **Plan B (web):** use `districtLabel(t, language, district)` from `@/shared/i18n/I18nProvider` for area names.
  The web feature's 100% gate switches on as soon as the folder holds one source file, so finish a screen together
  with its tests.
- **Plan A, B5 seed:** build reports with `HazardReport.restore`, score clusters with the real
  `WeightedPriorityScorer` through `ReportCluster.rescore`, save through the two Mongo repositories. `seed/` is not
  measured for coverage. Target scores 87 / 64 / 48 / 39 / 22 (table in Plan A).

## 6. Order of work

`B5 → W1 → W2 → W3 → W4 → W5` and, in parallel if a second session is used, `M0.2 → M0.3 → M1 → M2 → M3 → M4 → M5 → M6`.
M1 and M3 need no phone and no backend. M2, M4–M7 need the owner's phone with the development build.
If time runs short, cut in the order given in `IMPLEMENTATION_PLAN.md`; never cut M3/M4.

## 7. Prompts (paste one per session)

**Start-of-session preamble (prepend to every prompt below):**

> You are finishing UC3 of the Safe Zone project on branch `feat/uc3-hazard-reports`. Read
> `docs/plans/uc3/CODEX_HANDOFF.md` completely, then `IMPLEMENTATION_PLAN.md`, and follow the hard rules in the
> hand-off without exception. Do exactly one phase, verify it with the listed commands, update the status table,
> commit under my Git identity with no co-author or tool attribution, then stop and report what you built, what you
> verified (with the actual numbers), any deviation, and anything you could not do.

**B5 – seed**

> Phase B5. Implement `backend/src/modules/hazard-reports/seed/index.ts` per task B5.1 of
> `docs/plans/uc3/A-backend.md` and section 5 of the hand-off: five clusters (Kalutara 14 reports, Ratnapura 9,
> Gampaha 6, Beruwala 4, Pelmadulla 3) with fixed ids, timestamps relative to now, idempotent, reporters taken from
> the seeded demo citizens. Log each cluster's computed score. Verify: MongoDB running, `npm run seed -- --fresh`
> then `npm run seed` again (no duplicates), scores 87 / 64 / 48 / 39 / 22; lint clean. If MongoDB is not reachable,
> stop and tell me instead of guessing.

**W1 – web plumbing**

> Phase W1 of `docs/plans/uc3/B-web-dashboard.md` (tasks W1.1–W1.3): `api/types.ts`, `api/hazardReportsApi.ts`,
> the i18n keys in all three language files (write Sinhala and Tamil drafts; mark nothing as final), the `model/`
> functions, shared components, `useAutoRefresh`, and the route shell in `index.tsx` with one-line stub screens.
> Take the response shapes and error codes from section 4 of the hand-off. Verify:
> `npx vitest run src/features/hazard-reports`, typecheck, lint.

**W2 – dashboard** · **W3 – cluster + escalation** · **W4 – report verification** · **W5 – history + citizen view**

> Phase W2 [W3 / W4 / W5] of `docs/plans/uc3/B-web-dashboard.md`. Build every behaviour and every test in that
> phase's tables, including loading, empty, error-with-retry and offline states. Officer actions are disabled offline
> with a visible reason. Use MSW handlers that return the exact shapes from section 4 of the hand-off. Finish with
> `npx vitest run --coverage` showing `src/features/hazard-reports/**` at 100%, plus lint and typecheck. In W5 also run
> task W5.3's manual check against the seeded backend and tell me what you saw on each screen.

**M0 – mobile foundation (rest)**

> Phase M0, tasks M0.2 and M0.3 of `docs/plans/uc3/C-mobile-app.md`, with the corrections in section 5 of the
> hand-off. M0.2: the additive ESLint, Prettier-ignore, CODEOWNERS and README entries, as one separate commit.
> M0.3: `src/shared/config.ts` exists; add `shared/api/errors.ts`, `shared/api/apiClient.ts` with its test table,
> `SessionStore`, `SessionProvider`, a sign-in screen (phone + password against `POST /api/auth/login`), and the auth
> gate in `src/app/_layout.tsx`. Never store a password. Verify: `npx jest`, `npx tsc --noEmit`, `npx expo-doctor`,
> root `npx eslint mobile`. Do not attempt the development build; list for me the exact commands to run for it.

**M1 – mobile pure logic** · **M3 – sync engine**

> Phase M1 [M3] of `docs/plans/uc3/C-mobile-app.md`. For M3 read `docs/plans/uc3/D-offline-sync-design.md` first.
> Pure TypeScript only in `domain/`, `offline/`, `api/`: no React, React Native or Expo imports, no `new Date()`.
> Implement every row of the test tables with the fakes in `testing/fakes.ts`. Verify: `npx jest --coverage` with those
> folders at 90% or more, `npx tsc --noEmit`.

**M2 – online path** · **M4 – OS background sync** · **M5 – offline UI** · **M6 – manual pin + photo recovery**

> Phase M2 [M4 / M5 / M6] of `docs/plans/uc3/C-mobile-app.md` (M4, M5: read Plan D first). Confirm each Expo API
> against the installed SDK 57 typings before using it, and keep each one inside a single adapter file. Verify what can
> be verified here: `npx jest`, `npx tsc --noEmit`, `npx expo export --platform android`, `npx expo-doctor`. You cannot
> run a phone: end by giving me a numbered on-device checklist for this phase, and say plainly that the device
> behaviour is untested until I run it.

**M7 – device acceptance (owner runs, agent assists)**

> I am running the acceptance tests T1–T8 of `docs/plans/uc3/D-offline-sync-design.md` §11 on my phone. For each
> result I paste, tell me whether it passes; if one fails, find the cause in the code, fix it with a test, and tell me
> which test to re-run.

**Review prompt (run after any phase, in a fresh session)**

> Review the last commit on `feat/uc3-hazard-reports` against its phase in the plan and the hard rules in
> `docs/plans/uc3/CODEX_HANDOFF.md`. Report only real problems: wrong behaviour, a flow or test from the plan that is
> missing, an edit outside the allowed scope, a coverage gap, or a test that cannot fail. Do not change anything.

## 8. What to give the agent besides prompts

- The original wireframe images for the web screens (01, 02, 04, 05, 06) and your mobile wireframes, if you want the
  layout matched.
- A running MongoDB and `backend/.env` (`npm run setup`) for B5 and W5.3.
- The laptop's LAN IP for `mobile/.env.local` (`EXPO_PUBLIC_API_URL`), and the installed development build, for M2+.
