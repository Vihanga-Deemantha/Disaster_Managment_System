# Plan D – OS-Level Offline Sync: Design, Guarantees and Acceptance Tests

Read this before Plan C phases M3–M5. It explains _why_ the mobile code is shaped the way it is; Plan C has the code.

## 1. The requirement

> A report captured without a connection must reach the server later **even if the app is no longer open** – including
> when the app is closed while an upload is in progress – exactly once, with its original capture time.

"OS level, not app level" means: **the obligation to deliver is held by the operating system's job scheduler, not by
any timer, listener or promise inside the running app.** An in-app `NetInfo` listener or `setInterval` dies with the
process. A job registered with Android WorkManager or iOS BGTaskScheduler does not: the OS persists it, waits for the
network, and starts the app's JavaScript headlessly (no screen) to run it.

## 2. Options considered

| #   | Option                                                                                                                                          | App closed?                              | Verdict                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `NetInfo` reconnect listener + sync on app start (what `03-UC3-hazard-report.md` describes)                                                     | ✗ dies with the process                  | **App level.** Kept only as a fast path while the app is open.                                                                               |
| 2   | **`expo-background-task` + `expo-task-manager`** (Android WorkManager / iOS BGTaskScheduler) running the same TypeScript sync engine headlessly | ✓                                        | **Chosen.** First-party Expo, no custom native code, the sync logic stays in Jest-testable TypeScript.                                       |
| 3   | Custom Kotlin module: one-time `WorkManager` request with `NetworkType.CONNECTED` + native OkHttp upload                                        | ✓, and fires within seconds of reconnect | Rejected for this deadline: duplicates the queue logic in untested Kotlin, Android only, about a day of work. Recorded as future work (§10). |
| 4   | Third-party `react-native-background-upload` / `react-native-background-fetch`                                                                  | ✓                                        | Rejected: could not be verified against the current Expo SDK and the new React Native architecture in the time available.                    |
| 5   | iOS `NSURLSession` background upload (`expo-file-system` `sessionType: 'background'`)                                                           | ✓ (iOS only)                             | Not needed for the Android demo; the `ReportUploader` port lets it be added later without touching the engine.                               |

**Consequence (decision D8):** `expo-task-manager` is not available in Expo Go on Android, so the app must run as a
**development build**. That is one cloud build (or one local `expo run:android`), after which JavaScript still
hot-reloads exactly as in Expo Go.

## 3. Architecture

```
                     ┌──────────────────────── phone ────────────────────────┐
  Report screen ──►  │  OfflineReportQueue  (write-ahead journal)            │
  (always enqueues   │   AsyncStorage: entries      documentDirectory: photos│
   first)            └───────────────▲──────────────────────┬────────────────┘
                                     │ update / remove      │ list
                     ┌───────────────┴──────────────────────▼────────────────┐
                     │  SyncManager  (pure TypeScript, no React, no Expo)    │
                     │   one lane · oldest first · classify outcome · settle │
                     └───▲─────────▲──────────▲───────────▲──────────────────┘
        app open:        │         │          │           │        app closed:
        SUBMIT ──────────┘  RECONNECT   APP_FOREGROUND    └──── OS_TASK
        (interactive)       (NetInfo)   (AppState)              TaskManager.defineTask(...)
                                                                 ▲
                                    Android WorkManager / iOS BGTaskScheduler
                                    (persisted by the OS, requires network, survives app exit and reboot)

                     ReportUploader ──► POST /api/hazard-reports  (multipart, clientReportId, capturedAt)
                                         server: unique (reporterId, clientReportId)  →  201 / 200 already received
```

The same `SyncManager` instance logic serves all four triggers. The background task file is a 15-line adapter.

## 4. Three guarantees and what provides each

| Guarantee                                             | Mechanism                                                                                                                                                                                                                                         | Where                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Durability** – a submitted report is never lost     | **Write-ahead journal.** _Every_ submission (online too) is first copied into app storage: photo → document directory, entry → AsyncStorage. Only then is an upload attempted.                                                                    | `OfflineReportQueue.enqueue`                            |
| **Delivery** – it is eventually sent without the user | **OS-owned job** registered once (`registerTaskAsync`), constrained to "network available". The OS relaunches the JS runtime headlessly and calls the task.                                                                                       | `background/syncTask.ts`, WorkManager / BGTaskScheduler |
| **Exactly-once effect** – retries never double count  | **Idempotent server**: `clientReportId` generated on the device at capture; unique index `(reporterId, clientReportId)`; a repeat answers `200 ALREADY_RECEIVED`. An entry is removed from the journal **only after** the server acknowledged it. | Plan A `ReportSubmissionService`, `SyncManager.settle`  |

At-least-once delivery (journal + OS retries) plus an idempotent receiver equals exactly-once effect. This is why no
distributed lock is needed between the foreground app and the background task: if both upload the same entry, the
second gets `200 ALREADY_RECEIVED` and simply removes it.

## 5. Journal entry lifecycle

```
            enqueue                  attempt                   201 / 200
  (form) ──────────► QUEUED ───────────────► UPLOADING ─────────────────► removed (photo deleted)
                       ▲                        │
                       │  network error, 5xx,   │ 409 DUPLICATE_SUSPECTED (interactive submit only)
                       │  429, 401-unrecoverable│──────────────► AWAITING_DECISION ──(user: Update / New)──► QUEUED
                       └────────────────────────┤
                                                │ other 4xx (e.g. INVALID_PHOTO, VALIDATION_FAILED)
                                                └──────────────► NEEDS_ATTENTION ──(Send without photo)──► QUEUED
                                                                                  └─(Discard)────────────► removed
```

Rules:

1. **`UPLOADING` found at the start of a run means the previous run died mid-upload.** It is treated as `QUEUED`. The
   upload either reached the server (→ the retry gets `200`) or it did not (→ `201`). Either way, one report.
2. **Order:** oldest `capturedAt` first, so clusters see reports in the order they happened.
3. **Stop on the first retryable failure** (network, 5xx, 429): the connection is probably gone; do not burn the
   battery on the rest. Skip past permanent rejections so one bad entry cannot block the queue.
4. **`syncedFromOffline`** is decided at upload time: `false` only for the interactive submit while the reporter is
   looking at the screen; `true` for every drain. So a duplicate found during a drain is merged by the server without a
   prompt (scenario E3 from offline, H6).
5. **`AWAITING_DECISION`** is drained only by `OS_TASK` (the reporter is not there to answer). While the app is open
   the entry waits for the prompt.
6. **Never upload under the wrong account.** Each entry stores `ownerId`; a drain only takes entries whose owner equals
   the currently signed-in user.
7. **A missing photo file** (cleared storage) must not block a report forever: the entry is sent without the photo.

## 6. Triggers

| Trigger          | Fired by                             | App state                                    | Mode                                     | Notes                                                                                          |
| ---------------- | ------------------------------------ | -------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `SUBMIT`         | Submit button, when online           | foreground                                   | interactive (`syncedFromOffline: false`) | May return `DUPLICATE_SUSPECTED` → prompt.                                                     |
| `RECONNECT`      | `NetInfo` offline → online           | foreground / recently backgrounded           | drain                                    | Instant; app level; a convenience.                                                             |
| `APP_FOREGROUND` | cold start and `AppState` → `active` | foreground                                   | drain                                    | Also covers "user force-stopped the app, then reopened it".                                    |
| `MANUAL`         | pull-to-refresh on _My reports_      | foreground                                   | drain                                    |                                                                                                |
| **`OS_TASK`**    | **WorkManager / BGTaskScheduler**    | **background, swiped away, or after reboot** | drain + local notification               | The OS-level path. Android minimum interval 15 min; runs only with network and enough battery. |

All triggers enter one serial lane inside `SyncManager`, so two triggers in the same JS runtime can never run two
uploads at once, and a second `run()` while one is in flight returns the same promise.

## 7. Failure matrix

| What goes wrong                                                 | State left behind                                 | Recovery                                                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| App killed after _Submit_ but before the entry is written       | Nothing (the UI had not confirmed yet)            | The reporter sees the form again; no silent loss because "Saved" is shown only after `enqueue` resolved. |
| App killed after the photo copy, before the entry is written    | An orphan photo file                              | Harmless; cleaned by `PhotoStore.sweep()` on next start.                                                 |
| App killed / swiped away **during an upload**                   | Entry `UPLOADING`                                 | Next trigger (usually `OS_TASK`) retries; server dedupes on `clientReportId`.                            |
| Upload reached the server but the response was lost             | Entry `UPLOADING` or `QUEUED`                     | Retry → `200 ALREADY_RECEIVED` → removed.                                                                |
| OS kills the background task at its time limit                  | Earlier entries removed, current one `UPLOADING`  | One entry is processed and settled at a time, so progress is never lost.                                 |
| Phone reboots with reports queued                               | Entries intact (AsyncStorage + files are on disk) | WorkManager re-arms persisted work after boot; the task runs when the network is available.              |
| Foreground drain and OS task overlap                            | Both may send the same entry                      | Second gets `200`; `remove` is idempotent.                                                               |
| Session expired (refresh token idle > 12 h, or absolute 7 days) | Entries stay `QUEUED`                             | Task shows a local notification "Sign in to send N saved reports"; draining resumes after sign-in.       |
| A different user signs in on the same phone                     | Entries of the previous owner stay untouched      | Not uploaded, not shown; they sync when their owner signs in again.                                      |
| Server rejects an entry (4xx)                                   | `NEEDS_ATTENTION` with the server's reason        | Shown in _My reports_ with _Send without photo_ / _Discard_ (D11).                                       |
| Storage is full / photo file gone                               | Entry without a readable photo                    | Sent without the photo.                                                                                  |

## 8. Authentication in the background

The backend session is two httpOnly cookies (decision D4): `sz_access` (15 minutes) and `sz_refresh` (rotating;
12 hours idle; 7 days absolute for citizens). On Android and iOS, React Native's `fetch` uses the platform cookie jar,
which persists cookies with an expiry to disk – so a headless task started hours later still presents `sz_refresh`.

A drain therefore begins with `SessionGate.currentUserId()` → `GET /api/auth/me`. The API client answers
`UNAUTHENTICATED` / `TOKEN_EXPIRED` by calling `POST /api/auth/refresh` **once** (single flight) and retrying;
`TOKEN_ROTATED` (the foreground app refreshed a moment ago) counts as success, exactly like the web client. If the
refresh fails, the run ends with `NO_SESSION` and nothing is uploaded.

Doing this _before_ touching the queue means a multi-megabyte photo is never uploaded just to be answered with 401.

## 9. Platform behaviour and honest limits

|                                       | Android (demo target)                                                                                                                                                                   | iOS                                                                           |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Scheduler                             | WorkManager                                                                                                                                                                             | BGTaskScheduler                                                               |
| App in background                     | ✓ runs                                                                                                                                                                                  | ✓ runs when the system chooses                                                |
| App removed from recents (swiped)     | ✓ runs (some vendors' battery managers are stricter – whitelist the app in battery settings on Xiaomi / Huawei / Oppo for the demo)                                                     | ✗ swiping away suspends background work until the next launch (platform rule) |
| After reboot, app not opened          | ✓                                                                                                                                                                                       | ✓ once the system schedules it                                                |
| User pressed _Force stop_ in Settings | ✗ all jobs cancelled until the app is opened again (Android rule; `APP_FOREGROUND` then drains)                                                                                         | n/a                                                                           |
| Latency after reconnect               | Job becomes eligible ≥ 15 min after it was scheduled; if the phone is still offline then, the OS holds it and runs it when the network returns. Doze / battery saver can defer further. | Opportunistic; minutes to hours                                               |
| Needs                                 | development build                                                                                                                                                                       | development build **and** a physical device (not the simulator)               |
| How to force it for a demo            | `adb shell cmd jobscheduler run -f <package> <JOB_ID>` or the dev-only button calling `triggerTaskWorkerForTestingAsync()`                                                              | dev-only button                                                               |

What to say in the report (prototype constraints, stated plainly): delivery while the app is closed is _deferred, not
instant_ – the OS decides the moment; iOS was not exercised because the team builds on Windows; the instant path
(native one-shot job, §10) is future work.

## 10. Future work (not in this build)

An Android-native **one-time** `WorkManager` request with `Constraints(NetworkType.CONNECTED)`, enqueued as
`ExistingWorkPolicy.KEEP` the moment a report is journaled, would fire within seconds of connectivity returning even
with the app closed. It needs a small Kotlin Expo module whose worker reads the journal and uploads with OkHttp, and an
`NSURLSession` background upload on iOS. The `ReportUploader` and `SyncScheduler` ports already isolate where that
would plug in.

## 11. Acceptance tests (phase M7) – run on a real Android phone with the development build

Setup once: phone and laptop on the same Wi-Fi; `EXPO_PUBLIC_API_URL=http://<laptop-LAN-IP>:4000`; signed in as a demo
citizen; USB debugging on. Find the job id:

```bash
adb shell dumpsys jobscheduler | grep -A 40 -m 1 -E "JOB #.* lk.safezone.mobile"
```

Force the OS job (the app must be in the background or closed):

```bash
adb shell cmd jobscheduler run -f lk.safezone.mobile <JOB_ID>
```

| #   | Scenario                    | Steps                                                                                                                                                                                           | Pass when                                                                                                                            |
| --- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| T1  | Foreground reconnect (A1)   | Airplane mode on → submit two reports → _My reports_ shows two "Pending sync" → airplane mode off                                                                                               | Both become "Pending review" within seconds; the web dashboard shows their **original** capture times and "sent later from offline". |
| T2  | **App in background**       | Airplane on → submit one → press Home → airplane off → force the job (or wait ≥ 15 min)                                                                                                         | Local notification "1 saved report was sent"; report is on the server; _My reports_ footer says last sync was by the system.         |
| T3  | **App swiped away**         | As T2 but swipe the app out of recents before turning airplane mode off                                                                                                                         | Same as T2 with the app never reopened.                                                                                              |
| T4  | **Closed mid-upload**       | Throttle the laptop's Wi-Fi or use a ~4 MB photo → submit online → immediately swipe the app away → force the job                                                                               | Exactly **one** report on the server for that `clientReportId` (check `GET /api/hazard-reports` as the citizen), with its photo.     |
| T5  | Reboot                      | Airplane on → submit → power off → power on (do not open the app) → airplane off → force the job                                                                                                | Report arrives; notification shown.                                                                                                  |
| T6  | Lost response / replay (H7) | Submit online; in the API terminal kill the server right after the request log line and restart it → reopen the app                                                                             | One report on the server; the journal is empty.                                                                                      |
| T7  | Session expired             | Queue a report offline → in MongoDB delete the citizen's refresh-session documents (the collection name is in `backend/src/shared/auth/infrastructure/models.ts`), or wait 12 h → force the job | Notification "Sign in to send 1 saved report"; entry still "Pending sync"; after sign-in it syncs.                                   |
| T8  | Offline duplicate (E3, H6)  | Online: submit a report. Airplane on: submit another from the same spot within 30 min → airplane off                                                                                            | Server still has **one** report, with the newer description (merged); no prompt was shown.                                           |

Record the screen for T2–T4 (they are the evidence for "OS level"). Note the phone model and Android version in the
report next to the results.
