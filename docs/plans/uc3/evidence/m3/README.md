# M3 mobile sync engine — 9 October 2026

Branch: `feat/uc3-mobile-reporting`. M3 is complete. No subagents used. This phase implements the framework-independent delivery engine and submit/report-list projections. Native persistence, scheduling and phone UI wiring remain M4/M5; the installed M2 APK does not yet use this engine.

## Behaviour

- Validated submissions enter the write-ahead journal before any upload. A storage failure propagates without claiming a save or attempting delivery.
- Interactive submissions and drain triggers share one serialized lane; overlapping drains join one promise. Drains take the signed-in owner's reports oldest first and preserve client identity and capture time.
- Only acknowledged delivery removes an entry. Retryable failures retain it and stop the drain. Permanent rejections remain `NEEDS_ATTENTION` with the server's reason while later entries continue.
- Interrupted `UPLOADING` entries can be retried by a newly constructed engine over the same journal. An acknowledgement followed by failed local cleanup also preserves the identity for an idempotent retry.
- A missing stored photo permits submission without it. Pending duplicate questions wait for a foreground decision; an OS-triggered drain can resolve them unattended through the server's offline merge contract.
- Recovery helpers support explicit duplicate choices and sending without a rejected photo. Those helpers check the caller's owner id before changing journal data. Interactive upload independently checks the authenticated server session against the entry owner.
- Local/server list projection maps every queue/review status, includes refusal reasons, hides acknowledged local copies and sorts newest capture first. Its caller must supply reports filtered to the current owner.
- Run results record upload/remaining counts and stop reason. Only OS-triggered runs request local announcements. The OS task result marks retryable delivery failures for retry.

## Deliberate hardening of the plan examples

`QueuedReport.duplicateAction` persists an explicit NEW/UPDATE choice across a lost response, retry and runtime restart. The plan example only passed this choice to the current upload. Recovery helper signatures additionally take `ownerId`; they cannot alter another account's entry. Signed-in drain counts exclude other owners. An unauthenticated run counts all retained entries for the generic sign-in reminder, without uploading any of them. Unexpected uploader exceptions become retryable; storage exceptions remain visible and preserve the journal.

## Verification

The four new test suites were run before their implementation and failed because the modules did not exist. Tests cover journal-before-upload ordering, permanent/transient failures, account isolation, duplicate decisions, missing photos, runtime reconstruction, failed acknowledgement cleanup, overlapping triggers, run notifications, status merging and task results.

- `npx eslint mobile`: passed.
- Mobile `npm run typecheck`: passed.
- Full mobile `npx jest --runInBand --coverage --testTimeout=60000`: **33 suites / 646 tests passed**, including 53 new M3 tests.
- UC3 domain/offline/API core: **100% statements, branches, functions and lines**.
- Full configured mobile coverage: 99.86% statements, 99.79% branches, 100% functions and lines. Remaining gaps are preexisting registration validation.
- Prettier applied. An existing Alerts-screen VirtualizedList `act` warning appeared during the passing full suite; that shared feature was not changed.

## Previous phase acceptance

The owner confirmed that report submission works in replacement M2 preview APK `5b8ffa48-580f-4200-a001-f99b9ae30749`. The earlier API smoke test separately verified officer visibility and retrieval of the submitted photo. No new APK is needed for M3's pure logic; phone persistence and automatic delivery require M4/M5 integration.
