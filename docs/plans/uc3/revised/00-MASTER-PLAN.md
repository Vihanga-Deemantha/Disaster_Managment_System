# Safe Zone – SE3070 Assignment 02 Master Plan (revised to match `develop`)

> Revised 7 Oct 2026. The shared foundation on the `develop` branch is the fixed point: wherever the earlier version
> of this file disagreed with that code, this file was changed, not the code. Sections 1 and 7 are unchanged.
> `README.md` and `docs/building-a-use-case.md` on `develop` are the authority for anything not repeated here.

Read this first. Then each member opens only their own file (`01`–`04`).

| File                           | Use case                                        | Owner                                                     |
| ------------------------------ | ----------------------------------------------- | --------------------------------------------------------- |
| `01-UC1-issue-warning.md`      | Issue Warning (+ shared authentication)         | G.V.D. Perera (Vihanga)                                   |
| `02-UC2-allocate-resources.md` | Allocate Multi-Agency Resource to Affected Area | K.K.I. Shaveen                                            |
| `03-UC3-hazard-report.md`      | Submit and Verify Hazard Report                 | Mihijith (listed as "Pawan" in the README and CODEOWNERS) |
| `04-UC4-impact-analytics.md`   | Post-Event Impact Analysis & Relief Reporting   | Tharaka                                                   |

## 1. What is being marked

| Part                                | Marks | What earns them                                                                                                                                             |
| ----------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Group: critique of original design  | 20    | 90% functional design (requirement coverage, logic, UML correctness), 10% interaction design (usability, flow, HCI principles). Strengths _and_ weaknesses. |
| Group: proposed changes             | 10    | Redrawn diagrams, every change traceable to a critique point.                                                                                               |
| Individual: implementation accuracy | 30    | End-to-end, every main / alternate / exception flow, UI matches the report's wireframes.                                                                    |
| Individual: code quality            | 20    | Clean structure, SOLID, design patterns used correctly, no code smells.                                                                                     |
| Individual: unit tests              | 20    | >80% coverage, positive + negative + edge + error cases, meaningful assertions.                                                                             |

Three rules from the spec that shape everything below:

1. **The implementation must follow the report exactly.** So the report's change list is the specification. Every member's file has a "Design changes" table. Those rows go into the report word for word, and the code implements them, nothing more.
2. **Do not change the design without justification.** Each change row names the defect it fixes.
3. **Login / logout / role admin are not graded.** They are nevertheless already built (shared authentication on `develop`); nobody rebuilds or stubs them.

## 2. Deadline reality

Deadline is **Friday 9 Oct, 11:59 PM**. Scope is fixed: depth on one use case each, simulated external services, no extra features.

| When                  | Everyone                                                                                                                                                             | Output                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Wed evening           | Foundation is already merged to `develop`. Confirm the decisions in section 9. Each member branches from `develop`.                                                  | 4 feature branches        |
| Wed night             | Each member: domain classes + repository interfaces + first tests                                                                                                    | Domain layer green        |
| Thu morning–afternoon | Services (all flows) + unit tests alongside                                                                                                                          | Backend flows done        |
| Thu evening           | HTTP routes + start UI (Mihijith: the mobile app is the riskiest part; start its development build on Wed night). 20-minute sync: test the three cross-module events | API working               |
| Fri morning           | UI screens, wire to API, UI states (loading, empty, error, offline)                                                                                                  | Demo-able use case        |
| Fri afternoon         | Redraw diagrams, write own report section, open a pull request to **`develop`**                                                                                      | Report draft complete     |
| Fri 6–9 PM            | Full run-through on a clean clone, coverage screenshots, proofread report                                                                                            | Submit by 9 PM, not 11:58 |

## 3. Stack (as built on `develop`)

- **Backend:** Node 20.19+ (22 LTS recommended), Express 5, TypeScript, MongoDB + Mongoose 8, Zod 4, Jest 30 + ts-jest, Stryker mutation testing.
- **Web app (`frontend/`):** React 19 + Vite 7 + TypeScript, Tailwind 4, React Router 7, Vitest 3 + React Testing Library + MSW, Leaflet / react-leaflet, an offline-capable PWA (service worker, IndexedDB cache, write outbox). Playwright end-to-end tests at the repo root.
- **Mobile app (`mobile/`, to be created by Mihijith):** React Native + Expo (TypeScript), Expo Router, `expo-dev-client`, `expo-task-manager` + `expo-background-task`, `expo-image-picker`, `expo-location`, `expo-notifications` (local notifications), `expo-file-system`, `expo-crypto`, `@react-native-async-storage/async-storage`, `@react-native-community/netinfo`, `react-native-webview` (map pin with Leaflet + OpenStreetMap). Tests: Jest with the `jest-expo` preset + React Native Testing Library. Install native packages with `npx expo install <pkg>`.
- **Lint/format:** one root ESLint config (architecture rules included) + Prettier, enforced by a pre-commit hook and CI.

### Two clients, one backend

| Platform                         | Users                                                                                                                                                         | Who builds screens there                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Mobile app** (`mobile/`, Expo) | Citizen, Community Volunteer                                                                                                                                  | UC3: report a hazard, my reports, offline queue (large). UC1: Alerts tab (small).                                  |
| **Web app** (`frontend/`)        | Duty Officer, DMC Officer, District Officer, NGO Manager, Armed Forces Liaison, Government Agency Officer, Donor; citizens can also sign in and register here | UC1 approve & issue, UC2 everything, UC3 officer review (+ a read-only "My reports" for citizens), UC4 everything. |

Practical points for the mobile app:

- It runs as an **Expo development build**, not Expo Go: UC3's offline sync is done by an operating-system background job, and `expo-task-manager` is unavailable in Expo Go on Android. One build (EAS cloud or `npx expo run:android`); JavaScript still reloads live.
- The app reaches the backend over Wi-Fi: `EXPO_PUBLIC_API_URL=http://192.168.x.x:4000` (the laptop's LAN IP). The API already listens on all interfaces. No CORS change is needed: a native app sends no `Origin` header.
- **Authentication is the real one.** The app signs in with `POST /api/auth/login` (phone number + password of a seeded or registered citizen), the platform cookie jar keeps the session cookies, and every state-changing request carries `X-Requested-With: SafeZone`. There is no "continue as" picker and no `x-user-id` header.
- **Remote push is simulated**: UC1's push adapter records the alert in the citizen's inbox; the app polls while open and raises a _local_ notification. State this in the report as a prototype constraint.
- `mobile/` is its own npm project, outside the root `workspaces`.

## 4. Repository layout and ownership

```
Disaster_Managment_System/
├─ backend/src/
│  ├─ shared/                  # FROZEN. Changes only by PR approved by all 4.
│  │  ├─ contracts/            # enums, the three events, auth schemas, API error shape (also compiled into the web app)
│  │  ├─ auth/                 # register, login, refresh rotation, step-up re-auth, guards, citizen directory
│  │  ├─ events/EventBus.ts    # interface + InMemoryEventBus
│  │  ├─ errors/               # DomainError subclasses + the one error middleware
│  │  ├─ http/                 # CSRF, Idempotency-Key middleware, request logging
│  │  ├─ time/Clock.ts  ids/IdGenerator.ts  geo/ (GeoPoint + distanceKm, districts, river basins)
│  │  ├─ audit/  config/  db/  logging/
│  │  ├─ testing/              # FakeEventBus, FakeAuditLog, moduleHarness, test MongoDB
│  │  └─ module.ts             # ModuleContext (what a module receives) and ModuleRegistration (what it returns)
│  ├─ modules/
│  │  ├─ warnings/             # UC1 only
│  │  ├─ resources/            # UC2 only
│  │  ├─ hazard-reports/       # UC3 only
│  │  └─ analytics/            # UC4 only
│  ├─ app.ts  bootstrap.ts     # FROZEN. Modules are already registered; you only fill in your composition.ts
│  └─ server.ts  seed/index.ts
├─ frontend/src/
│  ├─ shared/                  # FROZEN: AppShell, API client, auth pages, i18n (Si/Ta/En), offline layer, UI kit, test kit
│  ├─ features/{warnings,resources,hazard-reports,analytics}/   # index.tsx (screens) + nav.ts (sidebar entry)
│  └─ routes.tsx  navigation.ts                                 # FROZEN
├─ e2e/                        # Playwright
└─ mobile/                     # Expo app (does not exist yet; created in UC3's phase M0)
   ├─ index.ts                 # entry: registers the background task, then expo-router
   ├─ app/                     # Expo Router: _layout.tsx, sign-in.tsx, (tabs)/report.tsx, my-reports.tsx, alerts.tsx
   └─ src/
      ├─ shared/               # API client, session, theme tokens
      └─ features/
         ├─ hazard-reports/    # UC3 only
         └─ alerts/            # UC1 only
```

Inside every backend module:

```
modules/<name>/
├─ domain/          # entities, value objects, pure rules. No Express, no Mongoose.
├─ application/     # services (one per user goal) + port interfaces
├─ infrastructure/  # Mongoose models/repositories, simulated gateways
├─ api/             # router, Zod schemas, DTO mappers
├─ composition.ts   # the ONLY place concrete classes are built; receives ModuleContext
├─ seed/            # receives SeedContext; must be idempotent
├─ testing/         # in-memory fakes (not measured for coverage)
└─ __tests__/
```

**Why this prevents conflicts:** nobody edits a file outside their module/feature folder. The exceptions the guide
allows: your feature's strings at the bottom of the three `messages.*.ts` files. Anything else in a frozen file (a new
dependency, the ESLint and Prettier entries the new `mobile/` folder needs, CODEOWNERS) is a small additive commit
announced in the group chat.

**Each module gets one mount path** (`/api/warnings`, `/api/resources`, `/api/hazard-reports`, `/api/analytics`). All of
a module's routes live under it.

**Git:** one branch per member (`feat/uc1-warnings`, `feat/uc2-resources`, `feat/uc3-hazard-reports`,
`feat/uc4-analytics`), **branched from `develop`**, rebased on `develop` each morning, merged to `develop` by pull
request. Nobody pushes to `main`. Commit small and often with your own account.

## 5. Cross-module contracts (frozen – copied from `backend/src/shared/contracts/events.ts`)

Modules never import from each other (ESLint enforces it). They communicate through three events on the shared
`EventBus`. Publishers test "event was published with the right payload" with `FakeEventBus`; subscribers test their
handler by calling it directly.

```ts
export interface TargetAreaRef {
  type: AreaType; // 'DISTRICT' | 'RIVER_BASIN'
  id: string;
  name: string;
  district: District;
}

export interface ClusterEscalationRequested {
  // UC3 -> UC1
  type: 'ClusterEscalationRequested';
  clusterId: string;
  hazardType: HazardType;
  proposedSeverity: Severity;
  targetArea: TargetAreaRef;
  centroid: GeoPoint;
  verifiedReportCount: number;
  totalReportCount: number;
  priorityScore: number; // 0-100
  requestedBy: string; // duty officer id
  occurredAt: string; // ISO
}

export interface WarningIssued {
  // UC1 -> UC4
  type: 'WarningIssued';
  warningId: string;
  hazardType: HazardType;
  severity: Severity;
  targetArea: TargetAreaRef;
  issuedAt: string;
  targetedCitizens: number;
  reached: number; // delivered on at least one channel
  pendingRetry: number;
  failed: number;
  byChannel: Record<Channel, { sent: number; delivered: number; failed: number }>;
}

export interface AllocationDeployed {
  // UC2 -> UC4
  type: 'AllocationDeployed';
  allocationId: string;
  district: District;
  affectedAreaId: string;
  organizationId: string;
  organizationName: string;
  organizationType: OrganizationType; // GOVERNMENT | ARMED_FORCES | NGO | PRIVATE_DONOR
  supplyCategory: string;
  quantity: number;
  unit: string;
  deployedAt: string;
}
```

Shared enums (`contracts/enums.ts`): `HazardType` = FLOOD, LANDSLIDE, CYCLONE, TSUNAMI, DROUGHT, LIGHTNING ·
`Severity` = LOW, MEDIUM, HIGH, CRITICAL · `Channel` = PUSH, SMS, WHATSAPP, EMAIL · nine roles · 25 districts. A use
case that needs other values (UC3's "road blockage" and "other" report types) keeps them inside its own module.

How the four use cases form one story (for the demo and the report's overview):

```
Citizen report -> cluster -> Duty Officer verifies -> escalation requested        (UC3)
     -> Warning appears in "Pending Approvals" -> DMC Officer approves & issues   (UC1)
     -> District Officer allocates resources to the affected area                 (UC2)
     -> Post-event analytics on alerts + relief, exported as audit report         (UC4)
```

## 6. Conventions everyone follows

- **Naming:** files `PascalCase.ts` for classes, `camelCase` functions, REST paths kebab-case plural.
- **Error shape:** `{ "error": { "code", "message", "fields"?, "details"? } }`. Throw a `DomainError` subclass with a
  code; one shared middleware maps them: `ValidationError` 400 (default code `VALIDATION_FAILED`), `UnauthorizedError`
  401, `ForbiddenError` 403, `NotFoundError` 404, `ConflictError` 409, `UnprocessableError` 422,
  `TooManyRequestsError` 429, `ServiceUnavailableError` 503.
- **No `new Date()`, `Date.now()`, `Math.random()` in domain/application** (lint error). Inject `Clock` and `IdGenerator`.
- **Routes:** `guards.requireAuth` first, then `requireRole` / `requireScope`; parse with `parseOrThrow(schema, …)`;
  call a service; map to a DTO. No business rules in handlers.
- **Services depend on interfaces only**; concrete classes are wired in `composition.ts`.
- **External systems are simulated adapters** behind ports, each with a configurable failure mode (a module may expose
  demo toggles through `devRouter`, mounted at `/api/dev` outside production).
- **Lint limits:** function ≤ 40 lines (90 for React components), complexity ≤ 8, ≤ 5 parameters, no `any`, no
  `console`, no leftover-work comments.
- **Comments:** JSDoc on every public service/domain method citing the scenario steps: `/** UC-3 steps 8–10; A3. */`.
- **Web:** every string through `t()` in Sinhala, Tamil and English (a missing key is a compile error); reads through
  `useCachedResource`; loading, empty, error and offline state on every screen; confirmation before irreversible
  actions; actions whose result must be seen at once are disabled offline with a reason.
- **Tests:** file per class, names start with the flow (`UC-3 A1: …`), Arrange / Act / Assert, one behaviour per
  test, assert state rather than mock calls. HTTP tests use `createModuleHarness`.
- **Coverage gates (CI):** **100%** lines, branches, functions and statements on `backend/src/modules/<name>/**` and
  `frontend/src/features/<name>/**` (`composition.ts`, `seed/`, `testing/` excluded); ≥ 90% on shared code; mutation
  score ≥ 90% on domain and application.

## 7. Group report plan (30 marks)

Suggested structure, about 15–20 pages plus diagrams:

1. **Introduction** – case study summary, the 4 business use cases, how they connect (the flow in section 5).
2. **Critique of the original design** (20 marks)
   - 2.1 Cross-cutting findings (below)
   - 2.2–2.5 One subsection per use case, each with the same sub-headings: _Requirement coverage · Logical soundness · UML correctness · Interaction design (usability, flow, HCI) · Strengths_.
3. **Proposed changes** (10 marks) – a change table (ID, artefact, change, justification, critique point it resolves), then the redrawn artefacts: use case diagram, class diagram, 4 sequence diagrams, 4 revised scenarios, revised/new wireframes.
4. **Traceability matrix** – change ID → file/class that implements it → test that proves it.

Each member writes their own 2.x and 3.x subsection from the tables in their file. One person owns sections 1, 2.1, the merged use case diagram and class diagram, and the final proofread.

**Cross-cutting findings to put in 2.1** (all visible in the original document):

| #   | Finding                                                                                                                                                                                                                                                                                                                | Type                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| X1  | Actor names differ between artefacts: scenarios use "District Officer", "NGO Representative", "Donor", "Analyst"; the use case diagram has "NGO Manager", "Relief Center Officer", "Disaster Response Team"; wireframes show "System Manager" and a "Duty officer console" for non-duty-officer screens.               | Consistency                         |
| X2  | Scenario names do not match use case names on the diagram.                                                                                                                                                                                                                                                             | Traceability                        |
| X3  | The four use cases hand off to each other but the hand-offs are undefined.                                                                                                                                                                                                                                             | Logical soundness                   |
| X4  | Class diagram models actors as classes holding the business operations, so there are no control/service classes, and sequence diagrams then invent controllers that are not on the class diagram.                                                                                                                      | UML correctness                     |
| X5  | Sequence diagrams use different conventions per member and several disagree with their own scenario.                                                                                                                                                                                                                   | UML correctness                     |
| X6  | Document structure: section numbering restarts, UC3 main flow is numbered 14–29, storyboards 5.2 and 5.4 show frames out of order.                                                                                                                                                                                     | Presentation                        |
| X7  | Wireframes use different shells, product names and navigation menus per member; lo-fi and hi-fi versions of the same screen sometimes show different content.                                                                                                                                                          | HCI consistency                     |
| X8  | The design never states which platform each actor uses. Citizen-facing screens are drawn as desktop web pages while the storyboards show citizens holding phones in the field. No citizen screen exists for _receiving_ a warning.                                                                                     | Platform fit / requirement coverage |
| S1  | Strengths: scenarios include alternate and exception flows with step anchors; notification channels are modelled behind an interface; offline capture with preserved `capturedAt` is a domain-aware requirement; `Resource` is abstracted over teams, shelters and supplies; hi-fi wireframes are visually consistent. | Strength                            |

**Proposed cross-cutting changes:** one actor glossary used everywhere; scenario names equal diagram names; the three events in section 5 added as explicit hand-offs; actor classes on the class diagram replaced by service (control) classes; one sequence-diagram convention (boundary / control / entity); one web shell for all officer wireframes and one mobile shell for all citizen screens.

Tools: draw.io for UML (keep the `.drawio` sources in `/docs`), Figma for wireframes.

## 8. Submission checklist

- [ ] `README.md` is current: `npm install`, `npm run setup`, `npm run seed`, `npm run dev`, `npm test`, demo logins, plus a mobile section (`EXPO_PUBLIC_API_URL`, installing the development build).
- [ ] Clean clone of `develop` on a different laptop builds, seeds, runs, tests pass.
- [ ] `npm run lint && npm run typecheck && npm test` green: every use-case folder at **100%**; screenshots in the submission.
- [ ] Every scenario flow (main, A*, E*) demonstrable from the UI, including failure toggles for simulated services.
- [ ] Every change ID in the report appears in the traceability matrix with a class and a test.
- [ ] UI screens visually match the report's final wireframes, on both web and mobile.
- [ ] Mobile app runs as a development build on a real Android phone against the backend over Wi-Fi.
- [ ] No dead code, no commented-out blocks, no `console.log`.
- [ ] Report: names, IT numbers, group number, contribution table.

## 9. Decisions to confirm together

Check each against the case study text. If the case study says otherwise, the case study wins and the change table is updated.

1. **Notification policy (UC1):** push first with per-recipient SMS fallback.
2. **Escalation is human-confirmed (UC3 → UC1):** a verified cluster over threshold is _recommended_; the Duty Officer confirms; the Warning lands as "Pending Approval" for the DMC Officer.
3. **UC2 primary actor:** District Officer, with the NGO Manager as the resource-owning organisation.
4. **UC4 actor label:** "DMC Officer" replaces "System Manager".
5. **Clustering rule (UC3):** by distance and time, showing the dominant hazard type.
6. **Push is simulated** (in-app inbox + local notification).
7. **`HazardType` and `Severity`** in `contracts/enums.ts` are marked provisional: confirm them against the report's class diagram. UC3 does not need them changed (it keeps its own report types and only escalates flood or landslide clusters).
8. **The mobile app is a development build**, because OS-level background sync cannot run in Expo Go.
9. **The mobile map pin** uses a WebView with Leaflet and OpenStreetMap, the same tiles as the web app, so no Google Maps key is needed.
