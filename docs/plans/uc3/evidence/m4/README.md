# M4 native persistence and automatic delivery — 9 October 2026

Branch: `feat/uc3-mobile-reporting`. Native integration is implemented and regression checks pass; M4 remains WIP until phone acceptance is recorded. No subagents used. Changes are confined to mobile implementation and UC3 progress documentation.

## Behaviour

- Every validated submission is journaled before upload. Photos are copied from temporary picker/cache locations into the app's document directory. Capture time, owner and client identity survive runtime reconstruction. Failed native writes retain the form and never claim the report was saved.
- The native queue adapter propagates storage errors and rejects corrupt journals without overwriting them. Photo deletion is restricted to the owned report directory. Acknowledged delivery cleans up the queue and its photo; repeated submission of an unchanged offline form reuses its client identity.
- The shared API client verifies the authenticated citizen/volunteer before uploading that owner's entries. Foreground, reconnect and OS jobs use the M3 serialized delivery engine and its idempotent retry behaviour.
- NetInfo probes the configured API's health endpoint with GET and disables native public-internet reachability so the laptop can be reached on a local network without internet.
- The task is defined at module scope and imported before Expo Router. Registration is idempotent, uses the 15-minute minimum interval and checks availability/restrictions. Unexpected task errors report failure; offline/no-session outcomes follow the M3 task-result policy.
- Signed-in app startup, return to foreground and reconnection trigger delivery. Logout/account changes clean up the old listeners. Background sending restrictions are explained on My reports.
- Optional delivery/sign-in notifications use their own Android channel and the saved EN/SI/TA language. Permission is requested only after tapping an explained foreground button; denied permissions and notification failures never undo delivery. Existing alert handlers are preserved.

## SDK verification

Expo SDK 57 documentation and installed types were consulted before native implementation:

- [BackgroundTask](https://docs.expo.dev/versions/v57.0.0/sdk/background-task/) — minimum interval is in minutes; native testing worker is for debug builds.
- [TaskManager](https://docs.expo.dev/versions/v57.0.0/sdk/task-manager/) — module-scope task definition and persistent registration.
- [Notifications](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/) — permission checks, Android channels and immediate local scheduling.
- [FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/) — installed SDK 57 `File`, `Directory`, `Paths` API. The version-specific URL was unavailable; installed types confirmed the methods.
- Installed NetInfo README — GET health probes and `useNativeReachability: false` for local API reachability.

The plan's old URI-based FormData example is deliberately replaced by the SDK 57 File transport already verified in M2. Composition reuses the existing shared API/storage rather than creating a second client. Native boundaries have mocked unit tests in addition to the planned device checks.

## Automated verification

New tests cover native persistence and photo cleanup, corruption/write failures, API session ownership, reachability transitions, optional notifications, task results/registration, listener cleanup, journaled UI submission and runtime reconstruction. Native storage/task/adapter tests were first run before implementation and failed for the missing modules/task definition.

- `npx eslint mobile`: passed.
- Mobile `npm run typecheck`: passed.
- Full mobile `npx jest --runInBand --coverage --testTimeout=60000`: **38 suites / 677 tests passed**, 31 more tests than M3.
- UC3 domain/offline/API coverage: **100%** statements, branches, functions and lines. Full configured mobile coverage: 99.86% statements, 99.79% branches, 100% functions and lines. Native boundary behaviour is tested through mocks and remains subject to device acceptance.
- Existing Alerts VirtualizedList act warning and an Expo Go notification warning appeared in the passing router suite. These are test-environment warnings; the phone uses a standalone build.
- Laptop `GET http://192.168.8.191:4000/api/health`: `status: ok`; Wi-Fi IPv4 address confirmed unchanged before build.

## Build and phone acceptance

A replacement standalone preview APK is required to install this JavaScript implementation. No native packages or plugins were added in M4.

Pending owner/device checks:

1. Open online as a Citizen or Volunteer and obtain a valid location. Turn airplane mode on, submit a uniquely described report with a photo and confirm Saved on this phone. Notification permission must only appear after tapping Enable delivery notifications.
2. Close and reopen offline. The standalone app should retain the login and saved journal. Restore Wi-Fi with the app open; confirm the report and photo reach the server once. Repeat opening/reconnecting and confirm no extra report is created.
3. Save another offline report, put the app in the background and restore connectivity. Verify OS-triggered delivery and its notification using Android jobscheduler as described in Plan D, or allow the OS to schedule the job. Fifteen minutes is the minimum requested interval, not a guaranteed delivery deadline. Force-stop can prevent OS jobs until the app is opened again.
4. Disable background activity where supported, reopen the app and verify the fallback notice if the native API reports restricted/unavailable. Foreground delivery must still work.

Full My reports listing, saved-report actions and status chips remain M5. Automatic orphan-photo sweeping is not implemented here; acknowledged reports clean up their owned photos. Actual phone persistence and OS scheduling have not been claimed from mocked tests.
