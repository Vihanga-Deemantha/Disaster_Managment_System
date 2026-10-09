# M5 — reporter history and offline status

Branch: `feat/uc3-mobile-reporting`. Automated verification passed; the owner accepted the installed standalone Android preview on 9 October. No subagents used.

## Behaviour

- My reports replaces the placeholder with the current reporter's local journal and submitted server reports, newest capture first. Status is shown in words and colour: Pending sync, Sending, Needs your choice, Not sent, Pending review, Verified and Rejected. Officer rejection reasons remain visible.
- The server API scopes reads to the authenticated reporter; the mobile read adapter also checks reporter ownership before caching. Cached history uses a separate key for each owner. Switching accounts immediately removes the old owner's rows, and disposed controllers ignore late responses.
- Queued reports remain visible offline. The last successfully read server list is cached for offline reopening; an uncached offline list does not claim the reporter has never submitted anything. Read failures preserve cached rows and show a retry message. An unreadable journal is not replaced.
- Both UC3 tabs explain offline operation. My reports refreshes when opened, when the app returns to the foreground, when the connection returns and when the journal changes. Pull-to-refresh and Refresh reports use the existing MANUAL sync trigger, then read the server's latest review statuses.
- Duplicate choices persist through the existing M3 helpers. A Not sent report offers Send without photo only when a photo exists, and Discard requires confirmation before removing the journal entry and owned photo. These controls are scoped to the signed-in reporter.
- The report form retains its current retry behaviour after an offline save. Report another hazard explicitly clears the form so another report can be saved. The original journal entry remains intact. This follows the existing successful-submission pattern rather than silently clearing fields.
- Last-sync diagnostics show the recorded trigger, timestamp and sent/waiting counts. The background test-worker control is present only in development builds. Its result does not claim that normal OS scheduling has been accepted on a real phone.
- The notification-permission feedback fix from M4 is included in the next APK. Permission remains optional and is requested only after an explicit tap. EN/SI/TA strings use the existing shared mobile theme and UI components.

## Implementation notes

`MyReportsController` coordinates queue subscriptions, cache hydration and serialized server reads behind `useMyReports`, avoiding separate hooks making competing reads. Regression tests cover slow cache hydration and a delivery completing during a server request. This is an implementation adjustment to the original separate `useQueue`/`useMyReports` example; the journal, sync policy, server workflow and review permissions are unchanged.

No dependencies, native plugins, backend behaviour or web screens changed in M5. Expo SDK 57 documentation and the installed application were checked before using the existing native boundaries. The Android API address was verified as `192.168.8.191` before build preparation.

## Verification

- New API/cache and state tests failed for missing modules before implementation; the seven initial screen acceptance tests failed before the view existed.
- The two additional refresh-race tests failed before their fixes.
- Mobile lint and TypeScript passed.
- Final full mobile coverage run passed: **43 suites / 706 tests**, including the offline-empty-state regression.
- UC3 domain/offline/API: **100%** statements, branches, functions and lines. Overall configured mobile coverage: 99.86% statements, 99.79% branches, 100% functions and lines.
- Android bundle export passed, producing a 3.2 MB Hermes bundle.

## Build and phone acceptance

Implementation commit: `33c2397`. EAS accepted standalone preview build [`97077042-362c-4544-ab90-06e7b7f4b40c`](https://expo.dev/accounts/pawan-menukas-team/projects/safezone/builds/97077042-362c-4544-ab90-06e7b7f4b40c) on 9 October, initially reporting `NEW`. This records successful submission, not completed cloud compilation or installation. The existing standalone profile, package/signing identity and `http://192.168.8.191:4000` API URL were reused. A laptop health request to that URL returned `status: ok` after submission. The build includes the M4 notification-permission feedback fix.

After installing the M5 APK over the existing app:

1. Sign in as the same Citizen/Volunteer. Open My reports online; confirm previously submitted reports are visible with Pending review, Verified or Rejected status, as applicable.
2. Get a valid location online, then enable airplane mode and submit a uniquely described report. Confirm Saved on this phone. Use Report another hazard to save a second report; My reports should show both as Pending sync.
3. Close and reopen offline. Confirm retained login and the two saved reports. Reconnect with the app open; the rows should become Pending review. Pull to refresh if necessary and confirm only one server report per capture.
4. Tap Enable delivery notifications. Confirm either the OS permission prompt or an explicit enabled/denied/unavailable result. Submission and offline storage must continue without notification permission.
5. Review one report from an officer console. Refresh My reports on the phone; confirm Verified or Rejected and the rejection reason.
6. If a duplicate needs a choice, choose Update earlier report or Send a separate report from My reports. If a report is Not sent, verify photo removal and confirmed discard where applicable.
7. M4 closed-app background delivery and M7 acceptance T1–T8 remain separate physical checks. A standalone preview does not show the development-only testing worker.

Owner acceptance on 9 October: in response to the installation checklist, the owner confirmed that everything works. This accepts the four checks presented in chat: previous reports visible, offline Pending sync, reconnect Pending review and visible delivery-notification permission feedback. Conditional duplicate/rejected-photo recovery remains covered by automated tests; separate manual results for those conditional cases were not provided. Closed-app OS delivery has not been inferred from foreground reconnection.

M5 is DONE. M6 and M7 have not started; M4 remains WIP for its separate closed-app OS-delivery checks.
