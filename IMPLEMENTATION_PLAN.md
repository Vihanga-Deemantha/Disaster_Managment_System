# UC3 – Submit and Verify Hazard Report: Implementation Plan (index + status)

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement the detailed plans task by task. Update the status table below after every
> phase so a fresh session can resume from this file alone.

**Owner:** Mihijith · **Deadline:** Fri 9 Oct 2026, 23:59 (submit by 21:00) · **Written:** Wed 7 Oct 2026

**Goal:** A citizen/volunteer submits a hazard report from an Expo mobile app (offline-capable, synced by the operating
system even when the app is closed); the backend clusters and scores it; a Duty Officer reviews, verifies/rejects and
confirms escalation on the web dashboard.

**Architecture:** One Express module (`hazard-reports`) in four layers behind ports; the web feature and the mobile app
are two clients of the same REST API. On the phone every submission is first written to a durable journal, then
delivered by whichever trigger fires first (foreground, reconnect, or an OS-scheduled background job). The server is
idempotent on `clientReportId`, so at-least-once delivery becomes exactly-once effect.

**Tech stack:** Node 20+/Express 5/TypeScript/Mongoose 8/Zod 4/Jest 30 · React 19/Vite 7/Tailwind 4/react-router 7/
Vitest 3/MSW 2/react-leaflet 5 · Expo SDK (latest, 58 at time of writing)/Expo Router/expo-background-task +
expo-task-manager/jest-expo.

## The detailed plans

| Plan | File                                                                               | Scope                                                                                         |
| ---- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| A    | [docs/plans/uc3/A-backend.md](docs/plans/uc3/A-backend.md)                         | Backend module (needed by both clients)                                                       |
| B    | [docs/plans/uc3/B-web-dashboard.md](docs/plans/uc3/B-web-dashboard.md)             | **Web app plan** – Duty Officer dashboard                                                     |
| C    | [docs/plans/uc3/C-mobile-app.md](docs/plans/uc3/C-mobile-app.md)                   | **Mobile app plan** – Reporter app                                                            |
| D    | [docs/plans/uc3/D-offline-sync-design.md](docs/plans/uc3/D-offline-sync-design.md) | OS-level offline sync: design, guarantees, acceptance tests (read before Plan C phases M3–M5) |

**Rule (agreed 7 Oct):** the code on `develop` stays as it is; plans change to fit it. The two source documents were
rewritten accordingly and supersede the originals:
[revised/00-MASTER-PLAN.md](docs/plans/uc3/revised/00-MASTER-PLAN.md) and
[revised/03-UC3-hazard-report.md](docs/plans/uc3/revised/03-UC3-hazard-report.md). The only additions to shared files
are the ones a new `mobile/` folder and photo upload cannot avoid (Plan C task M0.2, Plan A task B4.1), all additive.

## Phase status

Legend: `TODO` · `WIP` · `DONE` · `CUT`

| #   | Phase                                                                                       | Plan | Status | Notes                                                                                                                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------- | ---- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Branch `feat/uc3-hazard-reports` from `develop`; team sign-off on section "Decisions" below | –    | WIP    | Branch pushed to origin. Team sign-off on D5–D12 still open.                                                                                                                                                                                                                                                                |
| B1  | Domain: config, types, score, scorer, policy, validator, detector, entities                 | A    | DONE   | 7 Oct. 93 tests, domain folder 100% (lines/branches/functions/statements). Deviations: shared test builders (`aReport`, `aCluster`, `north`, `jpeg`) live in `testing/builders.ts`, not `testing/inMemory.ts`; B2.1 imports them from there. `dominantType` guards the empty case first (same behaviour, one branch fewer). |
| B2  | Application: ports, in-memory fakes, clustering / submission / review services              | A    | DONE   | 7 Oct. Domain + application: 148 tests, 100% on all four measures. Deviations: `PhotoStorage.save(key, photo)` takes a key (report id on create, a fresh id on update) so an updated photo never overwrites the old file; services depend on `Pick<ClusteringService, ...>` instead of the whole class.                     |
| B3  | Infrastructure: Mongoose repositories, disk photo storage                                   | A    | TODO   |                                                                                                                                                                                                                                                                                                                             |
| B4  | HTTP API: schemas, DTOs, multer wrapper, router, composition                                | A    | TODO   | **Unblocks W\* and M2+**                                                                                                                                                                                                                                                                                                    |
| B5  | Seed: five demo clusters                                                                    | A    | TODO   |                                                                                                                                                                                                                                                                                                                             |
| W1  | Web: API module, types, i18n keys, route shell                                              | B    | TODO   |                                                                                                                                                                                                                                                                                                                             |
| W2  | Web: Dashboard (queue)                                                                      | B    | TODO   |                                                                                                                                                                                                                                                                                                                             |
| W3  | Web: Cluster detail + escalation dialog                                                     | B    | TODO   |                                                                                                                                                                                                                                                                                                                             |
| W4  | Web: Report detail + verify + reject dialog                                                 | B    | TODO   |                                                                                                                                                                                                                                                                                                                             |
| W5  | Web: Reports history + citizen read-only view                                               | B    | TODO   |                                                                                                                                                                                                                                                                                                                             |
| M0  | Mobile foundation: Expo app, dev build, API client, sign-in, tabs                           | C    | WIP    | M0.1 scaffold done and verified (SDK 57, routes in `mobile/src/app/`). Left: development build, M0.2 root lint/format entries, M0.3 API client + sign-in. Uncommitted.                                                                                                                                                      |
| M1  | Mobile pure logic: rules, validators, journal queue                                         | C    | TODO   | No device needed                                                                                                                                                                                                                                                                                                            |
| M2  | Mobile online path: Report screen → API on a real phone                                     | C    | TODO   |                                                                                                                                                                                                                                                                                                                             |
| M3  | Sync engine (`SyncManager`) + response classifier                                           | C/D  | TODO   | No device needed                                                                                                                                                                                                                                                                                                            |
| M4  | OS-level background task + foreground triggers + notifier                                   | C/D  | TODO   | Needs the dev build                                                                                                                                                                                                                                                                                                         |
| M5  | Offline UI: banner, queued state, duplicate prompt, My reports                              | C    | TODO   |                                                                                                                                                                                                                                                                                                                             |
| M6  | Manual pin (E1) + photo recovery (E2)                                                       | C    | TODO   |                                                                                                                                                                                                                                                                                                                             |
| M7  | Sync acceptance tests T1–T8 on a real phone                                                 | D    | TODO   | Evidence for the report                                                                                                                                                                                                                                                                                                     |
| R   | Report artefacts: diagrams, wireframes, traceability, coverage screenshots                  | –    | TODO   |                                                                                                                                                                                                                                                                                                                             |

## Decisions – the repo differs from `00-MASTER-PLAN.md` / `03-UC3-hazard-report.md`

The foundation on `develop` was built from a newer master plan (it cites §6 offline, §7.1 auth, §9 100% coverage).
Where the two disagree, **the code on `develop` wins** because it is frozen and shared. Rows marked ⚠ need a word with
the team or a row in your report's change table.

| #     | Your files say                                                       | Repo reality (`develop`)                                                                                                                                                                 | What this plan does                                                                                                                                                                                                                                                                                                                                                            |
| ----- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1    | Branch from `main`                                                   | Foundation lives on `develop`; README says branch from `develop`                                                                                                                         | `feat/uc3-hazard-reports` from `develop`. Never push to `main`.                                                                                                                                                                                                                                                                                                                |
| D2    | `web/src/features/…`                                                 | `frontend/src/features/…`                                                                                                                                                                | Use `frontend/`.                                                                                                                                                                                                                                                                                                                                                               |
| D3    | Coverage ≥ 80%                                                       | Jest/Vitest gates are **100%** (lines, branches, functions, statements) for `modules/hazard-reports/**` and `features/hazard-reports/**`; `composition.ts`, `seed/`, `testing/` excluded | Plans target 100%. Keep untestable glue in `composition.ts` / `testing/`.                                                                                                                                                                                                                                                                                                      |
| D4    | Auth is an `x-user-id` stub                                          | Real auth: httpOnly cookies `sz_access` (15 min) + `sz_refresh` (rotating, 12 h idle, 7 days for citizens), CSRF header `X-Requested-With: SafeZone`                                     | Mobile signs in with `POST /api/auth/login`; native cookie jar carries the session; background sync refreshes it. No backend change needed.                                                                                                                                                                                                                                    |
| D5 ⚠  | Event has `severity`, `district`                                     | Frozen event has `proposedSeverity`, `targetArea: { type, id, name, district }`                                                                                                          | Publish the frozen shape; `targetArea` = the cluster's district.                                                                                                                                                                                                                                                                                                               |
| D6 ⚠  | Hazard types flood / landslide / road blockage / other               | Shared `HazardType` = FLOOD, LANDSLIDE, CYCLONE, TSUNAMI, DROUGHT, LIGHTNING (provisional, frozen)                                                                                       | UC3 owns `ReportHazardType` locally. A warning needs a hazard UC1 can issue, so escalation additionally requires a FLOOD or LANDSLIDE report in the cluster. **Add as change row H11 in the report.** Alternative: PR to the shared enum (needs all four approvals).                                                                                                           |
| D7    | `/api/report-clusters/…`                                             | One `mountPath` per module                                                                                                                                                               | Clusters live at `/api/hazard-reports/clusters/…`.                                                                                                                                                                                                                                                                                                                             |
| D8 ⚠  | Mobile runs in Expo Go, no native builds                             | `expo-task-manager` is unavailable in Expo Go on Android; OS-level background work needs a **development build**                                                                         | Build one dev APK (EAS cloud build or `npx expo run:android`). Everything else still hot-reloads.                                                                                                                                                                                                                                                                              |
| D9 ⚠  | `react-native-maps`                                                  | In a dev build it needs a Google Maps API key (billing account)                                                                                                                          | Map pin is a WebView + Leaflet + OpenStreetMap (same tiles as the web app, no key) behind a `MapPin` component, so it can be swapped.                                                                                                                                                                                                                                          |
| D10 ⚠ | Mobile `app/` and `src/shared/` are part of the Wednesday foundation | `mobile/` does not exist                                                                                                                                                                 | Phase M0 creates it. Tell Member 1 (Alerts tab) the moment it is pushed. Needs small edits to shared root files (ESLint, Prettier ignore, CODEOWNERS, README) – announce them.                                                                                                                                                                                                 |
| D11   | SyncManager "drops with a visible message on 4xx"                    | –                                                                                                                                                                                        | A rejected report is **kept** in state `NEEDS_ATTENTION` with the reason and _Discard_ / _Send without photo_ actions. Never silently lose a citizen's report. Reword the test name accordingly.                                                                                                                                                                               |
| D12 ⚠ | "single citizen 'other' report just now gives a Low score"           | The formula gives 100 × (0.045 + 0.09 + 0.25) = 38.5 → **39, Moderate**; a single flood report gives 53.5 → 54 (Elevated)                                                                | Implement the formula as written (the report's worked example depends on it); the test asserts 39 / Moderate. Reword A3 to "its computed score". If the team wants single reports to be Low, change the formula **and** the worked example together. Note: exact halves need float-safe rounding (53.5 is `53.49999999999999` in JS) – the scorer settles to 6 decimals first. |
| D13   | Citizens submit only from mobile                                     | Web `nav.ts` and `homePath.ts` send citizens to `/hazard-reports`                                                                                                                        | Web shows citizens a read-only "My reports" list and points them to the mobile app (Plan B, W5).                                                                                                                                                                                                                                                                               |
| D14   | New backend dependency                                               | `multer` is not installed                                                                                                                                                                | Add `multer` + `@types/multer` to `backend/package.json` in a one-line commit; announce it.                                                                                                                                                                                                                                                                                    |

## REST contract (frozen for both clients once B4 is merged)

All routes need the session cookie; state-changing routes need `X-Requested-With: SafeZone`.
Errors are always `{ "error": { "code", "message", "fields"?, "details"? } }`.

| Method | Path                                                              | Who                                                            | Result                                                                                                                                                                                                              |
| ------ | ----------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/hazard-reports` (multipart)                                 | CITIZEN, COMMUNITY_VOLUNTEER                                   | `201 { outcome: "CREATED", report }` · `200 { outcome: "ALREADY_RECEIVED" \| "UPDATED_EXISTING", report }` · `409 DUPLICATE_SUSPECTED` (`details.existingReportId`) · `400 INVALID_PHOTO` · `400 VALIDATION_FAILED` |
| GET    | `/api/hazard-reports`                                             | reporter → own reports; DUTY_OFFICER → history (`?status=&q=`) | `200 Report[]` (newest first)                                                                                                                                                                                       |
| GET    | `/api/hazard-reports/clusters?status=OPEN,ESCALATION_RECOMMENDED` | DUTY_OFFICER                                                   | `200 ClusterSummary[]` (score desc)                                                                                                                                                                                 |
| GET    | `/api/hazard-reports/clusters/:id`                                | DUTY_OFFICER                                                   | `200 ClusterDetail` · `404 CLUSTER_NOT_FOUND`                                                                                                                                                                       |
| POST   | `/api/hazard-reports/clusters/:id/escalate`                       | DUTY_OFFICER                                                   | `200 ClusterDetail` · `409 ESCALATION_NOT_ALLOWED`                                                                                                                                                                  |
| GET    | `/api/hazard-reports/photos/:fileName`                            | any signed-in                                                  | image bytes · `404 PHOTO_NOT_FOUND`                                                                                                                                                                                 |
| GET    | `/api/hazard-reports/:id`                                         | DUTY_OFFICER, or the report's own reporter                     | `200 Report` · `404 REPORT_NOT_FOUND`                                                                                                                                                                               |
| POST   | `/api/hazard-reports/:id/verify`                                  | DUTY_OFFICER                                                   | `200 { report, cluster }` · `409 REPORT_ALREADY_REVIEWED`                                                                                                                                                           |
| POST   | `/api/hazard-reports/:id/reject` `{ reason }`                     | DUTY_OFFICER                                                   | `200 { report, cluster }` · `400 VALIDATION_FAILED` · `409 REPORT_ALREADY_REVIEWED`                                                                                                                                 |

**Multipart fields of POST:** `clientReportId` (8–64 chars `[A-Za-z0-9-]`), `hazardType` (FLOOD \| LANDSLIDE \|
ROAD_BLOCKAGE \| OTHER), `description` (≤ 500, optional), `lat`, `lng`, `locationSource` (GPS \| MANUAL), `accuracyM?`,
`capturedAt` (ISO), `duplicateAction?` (NEW \| UPDATE), `syncedFromOffline?` ("true" \| "false"), file part `photo?`
(JPEG/PNG/WebP, ≤ 5 MB).

```ts
interface Report {
  id: string;
  clientReportId: string;
  reporterId: string;
  reporterType: 'CITIZEN' | 'VOLUNTEER';
  hazardType: 'FLOOD' | 'LANDSLIDE' | 'ROAD_BLOCKAGE' | 'OTHER';
  description: string;
  photoUrl?: string;
  location: { lat: number; lng: number; source: 'GPS' | 'MANUAL'; accuracyM?: number };
  capturedAt: string;
  receivedAt: string;
  syncedFromOffline: boolean;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  clusterId?: string;
}
interface ClusterSummary {
  id: string;
  district: string;
  centroid: { lat: number; lng: number };
  dominantHazardType: Report['hazardType'];
  priorityScore: number;
  band: 'HIGH' | 'ELEVATED' | 'MODERATE' | 'LOW';
  status: 'OPEN' | 'ESCALATION_RECOMMENDED' | 'ESCALATED' | 'CLOSED';
  counts: { total: number; pending: number; verified: number; rejected: number };
  escalation: {
    recommended: boolean;
    unmet: ('HIGH_BAND' | 'VERIFIED_REPORTS' | 'WARNABLE_HAZARD')[];
    requiredVerified: number;
  };
  firstReportedAt: string;
  lastReportAt: string;
}
interface ClusterDetail extends ClusterSummary {
  reports: Report[];
}
```

## Suggested schedule

| When          | Do                                                                                                                   | Phases          |
| ------------- | -------------------------------------------------------------------------------------------------------------------- | --------------- |
| Wed night     | Sign-off on D5–D12 in the group chat. Domain layer. **Start the EAS dev build before bed** (it queues in the cloud). | 0, B1, start M0 |
| Thu morning   | Services + API. Mobile pure logic in the gaps (no device needed).                                                    | B2, B3, B4, M1  |
| Thu afternoon | Seed. Mobile online path on the phone. Sync engine.                                                                  | B5, M2, M3      |
| Thu evening   | OS background task + offline UI. 20-minute sync with the team on the escalation event.                               | M4, M5          |
| Fri morning   | Web dashboard (every backend flow already works in tests).                                                           | W1–W5           |
| Fri afternoon | Manual pin / photo recovery, sync acceptance tests, report artefacts.                                                | M6, M7, R       |

**Cut order if time runs out** (never cut M3/M4 – the offline sync is the distinctive requirement):
W5 history search → map preview on the mobile form (coordinates as text) → gallery picker (camera only) →
citizen read-only web view (leave the placeholder) → local notification after background sync.

## Phase R – report artefacts (your section of the group report)

- [ ] Change table rows H1–H10 from `03-UC3-hazard-report.md`, plus **H11** (D6: a cluster needs a flood or landslide
      report to be escalated, because UC1 can only issue hazards in the shared `HazardType` list).
- [ ] Revised scenario with the wording fixes from D11 (a refused report is kept, not dropped) and D12 (A3: "its
      computed score").
- [ ] Redrawn sequence diagram (boundaries `ReportHazardUI`, `OfficerReviewUI`; controls `ReportSubmissionService`,
      `ClusteringService`, `ReportReviewService`; entities `HazardReport`, `ReportCluster`; the hand-off drawn as the
      `ClusterEscalationRequested` event). Add the mobile `OfflineReportQueue` / `SyncManager` / OS scheduler lifeline for A1.
- [ ] Use case diagram fragment: Detect Duplicate Reports «include»; Update Existing Report «extend».
- [ ] Wireframes – mobile: report form, offline banner + saved confirmation, manual pin, invalid photo, duplicate
      prompt, My reports; web: reject dialog, escalation confirmation, redrawn lo-fi of Report Clusters.
- [ ] Prototype constraints, stated plainly: development build instead of Expo Go (D8); background delivery is
      deferred by the OS, not instant; iOS not exercised; push is simulated (master plan decision 7); districts resolved by
      nearest centre.
- [ ] Traceability matrix: merge the three "Traceability" tables at the end of Plans A, B and C.
- [ ] Evidence: backend + web coverage HTML (100% on the UC3 folders), mobile coverage table, recordings of sync
      tests T2–T4, screenshots of every screen and state.

## Where to run things (this machine)

- Sessions in `.claude/worktrees/*` have no `node_modules`. Install and run from `D:\GitHub\Disaster_Managment_System`.
- Run `npm`/`npx`/`jest`/`vitest`/`expo` through Git Bash, not PowerShell 5.1.
- `npx tsc --noEmit`: do not pipe to `head`/`tail`; allow 5+ minutes.
- Focused backend tests: `cd backend && npx jest src/modules/hazard-reports --coverage=false` (the full `npm test` applies
  the coverage gates and fails on a subset run because shared code is then uncovered).
- Focused web tests: `cd frontend && npx vitest run src/features/hazard-reports`.
- Mobile tests: `cd mobile && npx jest`.

## Done when

- [ ] Every flow in the revised scenario works: Phase A from the phone, Phase B from the web dashboard.
- [ ] `npm run lint && npm run typecheck && npm test` green at the repo root (100% gates for UC3 folders).
- [ ] Mobile logic (`domain/`, `offline/`, `api/`) ≥ 90% lines.
- [ ] Sync acceptance tests T1–T8 (Plan D §8) pass on a real Android phone; screenshots/recording kept for the report.
- [ ] `ClusterEscalationRequested` matches `backend/src/shared/contracts/events.ts` exactly (asserted with `satisfies`).
- [ ] Rows H1–H11 are in the report and in the traceability matrix (change ID → class → test).

## Notes from building (read before B3/B4)

- **Stored scores go stale.** A cluster's score is only recomputed when something changes (submit, verify, reject, escalate). The queue shows the stored value, so a cluster left alone for hours still shows its old band, while `escalate` rescores first and may refuse a recommendation that has decayed below High (tested). Seeding just before the demo avoids it; a periodic rescore or a rescore-on-read in `ReportReviewService.describe` would remove it. Decide in B4.
- **Real photo storage (B3.2):** `DiskPhotoStorage.save(key, photo)` must write `<key>.<ext>`; the service already passes a fresh key for updates.
- **`tsc --noEmit` at the repo level fails on this machine** only because the optional `argon2` package is not installed (shared auth code, not UC3). UC3 files have no type errors.
