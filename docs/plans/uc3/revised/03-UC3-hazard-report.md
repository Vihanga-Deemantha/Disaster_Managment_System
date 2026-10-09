# UC3 – Submit and Verify Hazard Report (revised to match `develop`)

> Revised 7 Oct 2026. The code on `develop` is the fixed point; this file was changed to agree with it. The detailed,
> task-by-task plans are `IMPLEMENTATION_PLAN.md` and `docs/plans/uc3/A–D`. Sections 2 and 3 are what goes into the
> report.

**Owner:** Mihijith · **Backend folder:** `backend/src/modules/hazard-reports/` · **Web folder:**
`frontend/src/features/hazard-reports/` (Duty Officer) · **Mobile folder:** `mobile/src/features/hazard-reports/`
(Reporter) · **Branch:** `feat/uc3-hazard-reports`, from `develop`, merged back to `develop` by pull request

Read the revised `00-MASTER-PLAN.md` and `docs/building-a-use-case.md` first. You touch nothing outside your three
folders except: your strings in the three web `messages.*.ts` files, and the small announced additions the new
`mobile/` folder and the photo upload need (ESLint and Prettier entries, CODEOWNERS, README, the `multer` dependency).

**Platforms:** Phase A (the reporter) is the Expo mobile app, as a development build. Phase B (the Duty Officer) is the
web app. The `mobile/` project does not exist yet: creating it is the first mobile task.

## 1. Scope

A citizen or volunteer submits a hazard report (type, photo, GPS, description), offline if necessary. The system
clusters it with nearby recent reports and scores the cluster. A Duty Officer reviews the highest-priority clusters,
verifies or rejects each report, and when a verified cluster crosses the threshold, confirms an escalation that becomes
a pending official warning.

**In:** report form, photo validation, GPS + manual pin, offline queue and operating-system-level sync, duplicate
detection, clustering, priority scoring, review queue, verify, reject, escalation request, reports history, a
read-only "My reports" on the web for citizens who sign in there.
**Out:** issuing the warning (UC1), login and registration (shared authentication already exists), anything beyond a
basic map (Leaflet on both platforms).

## 2. Critique → design changes (copy into the report)

| ID      | Defect in the original                                                                                                                                                                                                                            | Change                                                                                                                                                                                                                                                                             | Why                                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| H1      | Main flow is numbered 14–29 while every alternate and exception flow refers to steps 1–16. A3 uses four different anchors for one flow.                                                                                                           | Renumber 1–16; each alternate/exception has one branch point and one explicit resume step.                                                                                                                                                                                         | The scenario is currently not traceable.                                                                  |
| H2      | "Detect Duplicate Reports" is an «extend» of Submit Hazard Report, but the check runs on every submission; "Update existing Reports" then extends the extension.                                                                                  | Detect Duplicate Reports becomes «include». "Update Existing Report" becomes the «extend» of Submit Hazard Report (condition: duplicate found and reporter chooses update).                                                                                                        | Correct include/extend semantics.                                                                         |
| H3      | The scenario covers two goals by two actors, shown as two use cases on the diagram, but nothing says how they relate.                                                                                                                             | One end-to-end scenario split into Phase A (steps 1–10, Reporter) and Phase B (steps 11–16, Duty Officer); Phase B starts when a cluster is in the queue.                                                                                                                          | Makes actor responsibility clear.                                                                         |
| H4      | Escalation is contradictory: the scenario creates the Warning automatically; the storyboard says the officer confirms; the wireframe has a manual button; the Warning's state and issuer are undefined.                                           | System marks the cluster _Escalation recommended_ when the rule is met; Duty Officer confirms; system publishes an escalation request that becomes a _Pending Approval_ warning for the DMC Officer (UC1).                                                                         | One rule across artefacts; a human check before a public warning; defines the hand-off.                   |
| H5      | "Defined radius and time window", "priority score", "escalation threshold" are never defined, and the wireframes disagree with each other.                                                                                                        | Parameters specified (section 4). Clustering is by distance and time; the cluster displays its dominant hazard type. Dashboard caption corrected.                                                                                                                                  | Requirements must be testable.                                                                            |
| H6      | E3 asks the reporter a question at submit time, but the report may be offline. E3 also mentions "severity", a field the report does not have.                                                                                                     | Duplicate check runs on the server. Online: reporter is asked update vs new. Synced from offline: merged automatically, keeping the earliest `capturedAt`. "Severity" removed.                                                                                                     | Closes a logical hole between A1 and E3.                                                                  |
| H7      | Offline sync can send the same report twice; nothing prevents double counting.                                                                                                                                                                    | Each report carries a client-generated `clientReportId`; the server treats a repeated ID from the same reporter as already received.                                                                                                                                               | Reliability of A1.                                                                                        |
| H8      | A2 is an alternate flow but ends in the failure postcondition; rejecting the _last_ report of a cluster is undefined.                                                                                                                             | A2 keeps its own postcondition; a cluster with no remaining pending/verified reports is closed. Rejection reason mandatory.                                                                                                                                                        | Completeness.                                                                                             |
| H9      | Sequence diagram has `Warning` created directly by `ReportCluster`, entities calling themselves, no control object, unlabelled frames.                                                                                                            | Redraw with boundaries `ReportHazardUI`, `OfficerReviewUI`; controls `ReportSubmissionService`, `ClusteringService`, `ReportReviewService`; entities `HazardReport`, `ReportCluster`; hand-off shown as the `ClusterEscalationRequested` event.                                    | UML correctness, low coupling.                                                                            |
| H10     | The storyboard shows a phone in the field but the Submit wireframe is a desktop web page; no wireframe for the offline state, the manual pin, the duplicate prompt or the reject reason; the reporter never learns what happened to their report. | Reporter screens become native mobile screens (tabs: Report, My reports, Alerts). New mobile wireframes for the offline banner + saved state, manual pin, invalid photo, duplicate prompt and "My reports"; new web wireframe for the reject dialog; lo-fi redrawn to match hi-fi. | Context of use, visibility of system status, error recovery, consistency.                                 |
| **H11** | The report types (flood, landslide, road blockage, other) are wider than the hazards an official warning can be issued for. The original never says what a cluster of road-blockage reports escalates to.                                         | A cluster can be escalated only if it holds a flood or landslide report that is not rejected. The warning's hazard is the cluster's dominant type when that is flood or landslide, otherwise the most severe of the two present.                                                   | A road blockage alone does not justify a public disaster warning; keeps the hand-off to UC1 well defined. |

Strengths to state: offline capture that preserves the original `capturedAt`; clustering to prioritise officer
attention; rejected reports retained for audit; `Reporter` generalised into Citizen and Community Volunteer; GPS and
photo failures have sensible recoveries.

## 3. Revised scenario (the spec for your code)

**Preconditions:** reporter is a signed-in citizen or volunteer; device has a camera and location services or the
reporter can pin manually.

**Phase A – Reporter**

1. Reporter opens Report Hazard.
2. Reporter selects a hazard type (flood, landslide, road blockage, other).
3. Reporter captures or attaches a photo. System validates it.
4. System captures the GPS location.
5. Reporter adds a short description and submits. System saves the report on the device with its `capturedAt`.
6. System checks connectivity.
7. System uploads the report: status Pending. Server checks for a duplicate from the same reporter.
8. System searches for open clusters within 2 km whose latest report is within 6 h.
9. System adds the report to the nearest matching cluster, or creates a new one.
10. System recalculates the cluster's priority score and reorders the review queue.

**Phase B – Duty Officer** 11. Officer opens the review queue (highest priority first) and opens a cluster. 12. Officer inspects a report (photo, map pin, description). 13. Officer verifies the report as genuine. 14. System sets status Verified and recalculates the cluster score. 15. System checks the escalation rule. If met, the cluster is marked Escalation recommended. 16. Officer confirms the escalation. System publishes the escalation request and marks the cluster Escalated.

**A1** (6a) offline → the report stays on the device as _pending sync_ → reporter may keep submitting → when a
connection is available every saved report is uploaded with its original `capturedAt`, by the app if it is open or by
the operating system's background job if it is not → resume 7 for each.
**A2** (13a) officer rejects with a reason → status Rejected → excluded from the score → cluster re-scored (may drop a
band; closed if nothing remains) → end.
**A3** (8a) no matching cluster → new single-report cluster at its computed score in the normal queue → resume 11.
**E1** (4a) no GPS fix → reporter pins the location on a map → resume 5.
**E2** (3a) photo invalid (not JPEG/PNG/WebP, over 5 MB, empty or unreadable) → reporter informed → retake or continue
without a photo → resume 4.
**E3** (7a) same reporter already has a pending report within 200 m and 30 min → online: reporter chooses _update
existing_ (description/photo amended, end) or _submit as new_ (resume 8); from offline sync: merged as an update
automatically.

**Postconditions.** Verified: report counts towards its cluster; an escalation request exists if the officer confirmed
one. Rejected: report kept for audit, excluded from scoring and escalation.

## 4. Rules and constants (one `ClusteringConfig` object, injected)

```
clusterRadiusKm        2
clusterWindowHours     6
duplicateRadiusM       200
duplicateWindowMin     30
photoMaxBytes          5 MB;  types: image/jpeg, image/png, image/webp (the first bytes are checked too)
descriptionMaxChars    500
capturedAt             may be at most 5 minutes ahead of the server clock

Priority score (0-100) = round(100 x (0.45 x density + 0.30 x severity + 0.25 x recency))
  density   = min(1, weightedCount / 10)     weight: citizen 1.0, volunteer 1.5; rejected reports excluded
  severity  = highest hazard weight present  landslide 1.0, flood 0.8, road blockage 0.5, other 0.3
  recency   = max(0, 1 - hoursSinceNewestReport / 6)      "newest" by capturedAt, not arrival time
  (exact halves round up; the code settles floating-point noise before rounding)

Bands: >= 75 High priority | 50-74 Elevated | 30-49 Moderate | < 30 Low

Escalation recommended when: band is High AND verified reports >= 3 AND a non-rejected flood or landslide report exists (H11)
Hazard sent to UC1:   the dominant type if flood/landslide, else landslide if present, else flood
Severity sent to UC1: High band + dominant landslide/flood -> HIGH; otherwise MEDIUM
Target area sent to UC1: the district nearest the cluster centroid  { type: DISTRICT, id, name, district }
```

Worked example for the report: 8 citizen + 4 volunteer reports (weight 14 → density 1.0), flood (0.8), newest 30 min
ago (recency 0.92) → 100 × (0.45 + 0.24 + 0.23) = 92.

A single report scores above Low because recency and severity count in full: one "other" report just now = 39
(Moderate); one flood report just now = 54 (Elevated).

Report types (`FLOOD | LANDSLIDE | ROAD_BLOCKAGE | OTHER`) live inside the UC3 module; the shared `HazardType` enum is
not changed.

## 5. Domain model

```
HazardReport   id, clientReportId, reporterId, reporterType (CITIZEN | VOLUNTEER), hazardType,
               description, photo?{url, mime, bytes}, location{lat, lng, source: GPS | MANUAL, accuracyM?},
               capturedAt, receivedAt, syncedFromOffline, status (PENDING | VERIFIED | REJECTED),
               reviewedBy?, reviewedAt?, rejectionReason?, clusterId
               verify(by, now), reject(by, reason, now), amend(description, photo, capturedAt)   // guard: only PENDING

ReportCluster  id, centroid, district, reportIds, dominantHazardType, priorityScore, band,
               counts{total, pending, verified, rejected},
               status (OPEN | ESCALATION_RECOMMENDED | ESCALATED | CLOSED),
               firstReportedAt, lastReportAt, escalatedBy?, escalatedAt?
               canAccept(report, config, now), add(report), rescore(reports, scorer, now),
               recommend(flag), markEscalated(by, now)

PriorityScore  value object {value, band}
```

## 6. Application layer and patterns

**Backend**

| Class                                                                                           | Responsibility                                                                  | Pattern                  |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------ |
| `PhotoValidator`                                                                                | Type, size and file-signature checks (E2)                                       | Single-purpose validator |
| `DuplicateDetector`                                                                             | Same reporter, radius, window (E3)                                              | Domain service           |
| `PriorityScorer` (interface) + `WeightedPriorityScorer`                                         | Formula in section 4                                                            | **Strategy**             |
| `EscalationPolicy`                                                                              | Evaluates the escalation rule, lists what is unmet, derives hazard and severity | Policy / Specification   |
| `ClusteringService`                                                                             | Candidate clusters, nearest, create if none, rescore (8–10, A3)                 | Application service      |
| `ReportSubmissionService`                                                                       | Steps 7–10, E2, E3, idempotency on `clientReportId`                             | Application service      |
| `ReportReviewService`                                                                           | Queue, verify, reject, confirm escalation (11–16, A2)                           | Application service      |
| `HazardReportRepository`, `ReportClusterRepository`, `PhotoStorage`, `DistrictResolver` (ports) | Persistence; photos on local disk via multer behind the port                    | **Repository**           |
| `ctx.eventBus.publish(ClusterEscalationRequested)`                                              | Hand-off to UC1                                                                 | **Observer**             |

Everything is built in `composition.ts` from the `ModuleContext` (`clock`, `ids`, `eventBus`, `auditLog`, `guards`).
Verify, reject, submit and escalate are written to the shared audit log.

**Mobile app**

| Unit                                                 | Responsibility                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QueueStorage` + `AsyncStorageQueueStorage`          | Persists the journal of unsent reports as JSON.                                                                                                                                                                                                                                             |
| `PhotoStore` + `FileSystemPhotoStore`                | Copies the picked photo into the app's document directory; deletes it after a successful upload.                                                                                                                                                                                            |
| `OfflineReportQueue`                                 | The journal: enqueue / list / update / remove. Generates `clientReportId` and stamps `capturedAt`. **Every** submission is journaled before any upload.                                                                                                                                     |
| `ConnectivityMonitor` + `NetInfoConnectivityMonitor` | `isOnline()`, `onReconnect(cb)`; "online" means our API answers.                                                                                                                                                                                                                            |
| `SessionGate` + `ApiSessionGate`                     | Who is signed in, renewing the session cookie when needed.                                                                                                                                                                                                                                  |
| `ReportUploader` + `HttpReportUploader`              | Builds the multipart request; turns every answer into an outcome (delivered, duplicate suspected, rejected, sign-in needed, retry).                                                                                                                                                         |
| `SyncManager`                                        | Uploads journaled reports oldest first with their original `capturedAt` and `clientReportId`; removes an entry only when the server acknowledged it; keeps it on a network error and stops; **keeps** a report the server refused, marked _Not sent_ with the reason; one upload at a time. |
| `background/syncTask.ts`                             | Registers the sync with the operating system (`expo-background-task`: Android WorkManager / iOS BGTaskScheduler) so it runs with the app in the background, swiped away, or after a reboot.                                                                                                 |
| `useCurrentLocation`                                 | Foreground permission, position with a timeout; on denial or timeout switches to manual pin.                                                                                                                                                                                                |
| `validateReportDraft`, `validatePickedPhoto`         | Pure functions with the same limits as the server.                                                                                                                                                                                                                                          |

The offline core (`domain/`, `offline/`, `api/`) imports no React and no Expo; only thin adapters do. That lets Jest
test the offline logic without mocking native modules, and it is the Dependency Inversion example for the report.

## 7. REST API

Every route needs the session cookie; state-changing routes need the `X-Requested-With: SafeZone` header.

| Method | Path                                                              | Who                                                            | Purpose / result                                                                                                                                | Flow             |
| ------ | ----------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| POST   | `/api/hazard-reports` (multipart)                                 | Citizen, Volunteer                                             | `201 CREATED` · `200 ALREADY_RECEIVED` (repeated `clientReportId`) · `200 UPDATED_EXISTING` · `409 DUPLICATE_SUSPECTED` with `existingReportId` | 7–10, A1, A3, E3 |
| GET    | `/api/hazard-reports`                                             | Reporter → own reports; Duty Officer → history (`?status=&q=`) | list                                                                                                                                            | H10, history     |
| GET    | `/api/hazard-reports/clusters?status=OPEN,ESCALATION_RECOMMENDED` | Duty Officer                                                   | Review queue, by score                                                                                                                          | 11               |
| GET    | `/api/hazard-reports/clusters/:id`                                | Duty Officer                                                   | Cluster + reports + unmet escalation requirements                                                                                               | 11–12            |
| POST   | `/api/hazard-reports/clusters/:id/escalate`                       | Duty Officer                                                   | Confirm escalation                                                                                                                              | 16               |
| GET    | `/api/hazard-reports/photos/:fileName`                            | signed-in                                                      | Photo bytes                                                                                                                                     | 12               |
| GET    | `/api/hazard-reports/:id`                                         | Duty Officer or the report's owner                             | Report detail                                                                                                                                   | 12               |
| POST   | `/api/hazard-reports/:id/verify`                                  | Duty Officer                                                   | Verify; returns report + rescored cluster                                                                                                       | 13–15            |
| POST   | `/api/hazard-reports/:id/reject` `{ reason }`                     | Duty Officer                                                   | Reject                                                                                                                                          | A2               |

Errors: `INVALID_PHOTO` 400 · `VALIDATION_FAILED` 400 · `UNAUTHENTICATED` 401 · `FORBIDDEN_ROLE` 403 ·
`REPORT_NOT_FOUND` / `CLUSTER_NOT_FOUND` / `PHOTO_NOT_FOUND` 404 · `REPORT_ALREADY_REVIEWED` 409 ·
`ESCALATION_NOT_ALLOWED` 409 · `DUPLICATE_SUSPECTED` 409.

## 8. UI

**Mobile app – Reporter.** Sign-in screen (phone number + password), then tabs: Report · My reports · Alerts (UC1).

1. **Report a hazard** – four large hazard tiles, photo area (_Take photo_ / _Choose from gallery_), map preview with
   the detected pin and "Adjust pin", description with a counter, Submit. States: offline banner + "Saved. It will be
   sent automatically when you are connected – even if you close the app"; location denied → manual pin; invalid photo
   with _Retake_ / _Continue without photo_; duplicate prompt (_Update existing_ / _Submit as new_).
2. **My reports** – chips: Pending sync · Sending · Needs your choice · Not sent · Pending review · Verified ·
   Rejected (with reason). Merges the journal with `GET /api/hazard-reports`; pull to refresh; a line saying when and
   how the last sync ran.

Camera, location and notification permission are requested at the moment they are needed, with a one-line reason.

**Web app – Duty Officer** (inside the existing shell; strings in Sinhala, Tamil and English):

3. **Dashboard** – stat cards + cluster table by priority; refreshes itself.
4. **Report cluster** – score bar, map, report cards. "Escalate to warning" is enabled only when the cluster is
   Escalation recommended; otherwise disabled with the missing requirements written out next to it.
5. **Report detail / verification** – photo, pin, details, capture vs received time for offline reports; Verify
   (confirmation) and a Reject dialog with mandatory reason.
6. **Escalation confirmation** – dialog, then "Sent to the DMC Officer for approval".
7. **Reports history** – status filter and search.
8. **My reports (citizens on the web)** – read-only list with a note to use the mobile app to report.

Officer actions need a connection and are disabled offline with the reason; lists stay readable from the cache.

## 9. Unit tests (minimum list)

**PhotoValidator** – accepts JPEG/PNG/WebP under the limit; rejects wrong type, over limit, zero bytes, a file whose
bytes do not match its type; exactly 5 MB accepted.

**DuplicateDetector** – same reporter within 200 m and 30 min → duplicate; different reporter → not; 201 m → not;
31 min → not; an earlier offline capture within the window → duplicate; previous report Verified/Rejected → not.

**WeightedPriorityScorer** – the worked example gives 92; a single citizen "other" report just now gives 39
(Moderate); a single flood report gives 54 (rounding half up); volunteer weighs 1.5; rejected reports ignored; density
caps at 1; recency is 0 at and beyond 6 h; band boundaries at 29/30, 49/50, 74/75; empty set → 0.

**ReportCluster / ClusteringService** – joins inside radius and window; outside radius → new cluster; stale → new
cluster; two candidates → nearest wins; CLOSED/ESCALATED not joined; centroid and dominant type updated; an older
offline report does not make the cluster look newer; score recalculated on add; boundary at the radius.

**EscalationPolicy** – High + 3 verified → recommended; High + 2 → not; Elevated + 5 → not; road-blockage-only cluster
→ never (H11); road blockage dominant with a landslide present → LANDSLIDE, MEDIUM; severity mapping; every unmet
requirement listed.

**ReportSubmissionService** – stores Pending with the client's `capturedAt` and the server's `receivedAt`; invalid
photo → `INVALID_PHOTO` and nothing saved; no photo allowed; same `clientReportId` twice → one report, cluster count
unchanged; a lost insert race is acknowledged; duplicate online with no action → `DUPLICATE_SUSPECTED`; `UPDATE` →
amended, no new report; `NEW` → new report; duplicate from offline sync → merged, earliest `capturedAt` kept;
`capturedAt` in the future → rejected; manual location flagged `MANUAL`.

**ReportReviewService** – verify sets status, reviewer, time and rescored cluster; verify a reviewed report →
conflict; reject requires a reason; reject can lower the band; rejecting the last active report closes the cluster;
third verification in a High cluster → `ESCALATION_RECOMMENDED`; escalate publishes `ClusterEscalationRequested` with
the exact contract payload (`proposedSeverity`, `targetArea`) and marks ESCALATED; escalate when not recommended →
`ESCALATION_NOT_ALLOWED`; escalate twice → conflict, one event only.

**HTTP (module harness)** – roles, missing cookie, missing CSRF header, validation codes, each route's happy path.

**Web (Vitest + MSW)** – each screen: loading, empty, error + retry, success, offline; dialogs; disabled actions.

**Mobile (Jest, `jest-expo`)**

- `OfflineReportQueue`: enqueue persists the draft, copies the photo, assigns `clientReportId` and `capturedAt`; a
  failed photo copy writes no entry; oldest first; remove deletes entry and photo; survives a restart; concurrent
  updates do not overwrite each other.
- `SyncManager`: oldest first with original `capturedAt` and `clientReportId`; removes on acknowledgement; keeps the
  item and stops on network failure; a refused report is kept as _Not sent_ and the run continues; nothing when the
  queue is empty, offline or signed out; never uploads another user's reports; a second trigger during a run does not
  double-upload; an entry left mid-upload by a dead run is retried; the OS-triggered run resolves a pending duplicate
  question and raises a notification.
- Response classifier: every status, including a 200 that is not our API's answer (Wi-Fi sign-in page) → retry.
- `validatePickedPhoto` / `validateReportDraft`: the server's boundaries.
- `useCurrentLocation` (fake provider): coordinates when granted; manual on denial; manual on timeout.
- Report screen (two or three tests): Submit disabled until type and location exist; offline submit shows the
  saved-for-later confirmation; duplicate response shows the prompt.

Use `FixedClock`, `SequentialIdGenerator`, `FakeEventBus`, `FakeAuditLog`, in-memory repositories. Real MongoDB only in
the repository tests (`connectTestMongo`).

## 10. Build order

1. Domain: config, entities, scorer, policy, validator, detector + tests.
2. Ports + in-memory fakes; the three services + tests.
3. Mongoose repositories, disk photo storage; add `multer`; schemas, DTOs, router, `composition.ts`.
4. Seed: the five dashboard clusters (Kalutara 14 reports, Ratnapura 9, Gampaha 6, Beruwala 4, Pelmadulla 3),
   timestamps relative to now. Re-run the seed shortly before the demo: scores decay with time.
5. **Mobile foundation (start the development build on Wednesday night):** Expo project, API client, sign-in, tabs.
6. **Mobile logic (no device needed):** validators, journal, sync manager with tests.
7. **Mobile online path on a real phone**, then the OS background task and the offline UI.
8. **Web officer UI:** Dashboard → Cluster → Report detail → Reject dialog → Escalation → History.
9. Manual pin, photo recovery, on-device sync tests.
10. Diagrams, revised scenario, wireframes, report section.

If time runs short, cut in this order: reports history search, map preview on the mobile form (coordinates as text),
gallery picker (camera only), the citizen read-only web view, the notification after a background sync. Do not cut the
offline queue or the background task.

## 11. Demo script (rehearse once)

0. `npm run seed` just before starting.
1. On the phone: submit a flood report with a photo → on the web dashboard it appears in a cluster.
2. Phone in airplane mode. Submit two reports → "Pending sync" in My reports. Airplane mode off → both sync and show
   their original capture times on the web.
3. Airplane mode on, submit one, **swipe the app away**, airplane mode off, force the OS job with `adb` → a
   notification says the report was sent; it is on the dashboard although the app was never reopened.
4. Deny location permission → manual pin.
5. Oversized photo from the gallery → message → continue without photo.
6. Submit again from the same spot → duplicate prompt → update existing.
7. On the web, as Duty Officer: open Kalutara (87), reject one report with a reason (score drops to 82), verify three →
   Escalation recommended → confirm.
8. Sign in as DMC Officer → the warning is in Pending Approvals (UC1).

## 12. Done when

- [ ] Every flow in section 3 works: Phase A from the development build on a real phone, Phase B from the web app.
- [ ] `npm run lint && npm run typecheck && npm test` green; UC3 backend module and web feature at **100%**.
- [ ] Mobile `domain/`, `offline/`, `api/` ≥ 90% lines.
- [ ] `ClusterEscalationRequested` payload matches `shared/contracts/events.ts` exactly.
- [ ] Rows H1–H11 are in the report and in the traceability matrix.
