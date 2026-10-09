# M2 mobile online report submission — 9 October 2026

Branch: `feat/uc3-mobile-reporting`. No subagents used. M2 implementation and automated checks are complete; The Android cloud build has been submitted; cloud completion and physical-phone acceptance remain open. M3 has not started.

## Implemented

- Replaced the Report placeholder with four accessible hazard tiles, location status/retry, camera/gallery evidence with immediate validation, a removable photo preview, optional description with Unicode-aware counter, and guarded submission.
- Reused the existing Safe Zone paper/navy/copper tokens and shared screen, field, banner and button components. Added English, Sinhala and Tamil messages.
- Location requests foreground permission and a high-accuracy GPS fix, times out after 10 seconds, and ignores stale results after retry, pin or unmount. Last-known/Colombo coordinates only centre the future manual map; they never silently become report evidence. The manual map remains M6.
- Native image capture uses quality 0.6; gallery selection uses quality 1 so oversized-photo validation remains demonstrable. Cancellation preserves an existing attachment.
- Multipart fields and response classification are pure TypeScript. The native transport uses the shared cookie/refresh/CSRF client and lets React Native supply its multipart boundary.
- The screen reports delivery only for acknowledged CREATED, ALREADY_RECEIVED or UPDATED_EXISTING responses containing a report id. Network failures retain the form and show an honest retry message. Retries preserve client id, capture time and any explicit duplicate choice. Overlapping taps cannot send twice. Authentication failure expires the foreground session.
- Duplicate reports offer explicit update/separate-report actions. Malformed duplicate responses without a valid existing report id are retryable rather than presenting an unusable choice; this is a deliberate hardening of the example plan.

## Automated verification

Tests ran red before implementation for multipart/classifier/uploader, the location hook, submission hook and Report form. A further red test caught losing an explicit duplicate choice on retry; the hook now retains it.

- Mobile Jest with coverage: **29 suites / 592 tests passed**.
- UC3 configured domain/API/offline core: **100% statements, branches, functions and lines**.
- Full configured mobile coverage: 99.84% statements, 99.76% branches, 100% functions and lines; remaining gaps are existing registration validation.
- Root `npx eslint mobile` and mobile `npm run typecheck`: passed.
- Prettier applied to changed source/tests/messages.
- Native adapter tests exercise the installed React Native FormData implementation, not Node's incompatible web file handling.

## Local API smoke test

A clearly labelled demonstration report was submitted as a seeded Citizen to the existing localhost API using multipart PNG evidence. The server returned CREATED, preserved reporter identity and capture time, and returned ALREADY_RECEIVED with the same report id on retry. A seeded Duty Officer could find its cluster/report and retrieve the original 68-byte photo unchanged. No report was approved and no warning was issued.

Identifiers and assertions are recorded in [api-smoke.json](api-smoke.json). This fixture submission verifies the server contract; it does not substitute for physical camera/GPS acceptance.

## Remaining phone acceptance

Install the updated standalone preview APK when available. Keep the laptop API running on port 4000 and the phone on the same Wi-Fi. Its configured API URL is `http://192.168.8.191:4000`; rebuild with an updated URL if that laptop address changes.

1. Open the Report tab and select a hazard type.
2. Allow location access and wait for GPS coordinates. An unavailable/denied location must keep Submit disabled.
3. Take a real photo, add a description, and submit online. Confirm **Report sent**.
4. Open the officer web report queue and confirm the new report and its photo are present.
5. Try removing/replacing a photo and an oversized gallery image; the form must remain usable and explain any refusal.

This phase submits directly online. The form is not yet a durable offline draft and automatic background delivery remains in M3–M5. My reports remains its planned placeholder until M5.

## SDK references checked

Installed Expo SDK 57 / React Native 0.86 versions were checked against the versioned [ImagePicker](https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/), [Location](https://docs.expo.dev/versions/v57.0.0/sdk/location/) and [Crypto](https://docs.expo.dev/versions/v57.0.0/sdk/crypto/) documentation and installed React Native FormData source before using those APIs.

Android JavaScript export also passed: Metro bundled 1,421 modules into a 3.1 MB Hermes bundle with the configured LAN API URL. The generated export remains a local helper artifact.

## Android preview build

EAS accepted standalone Android preview build `b2150ea1-8cdf-4abc-b78d-4898e2ca4c7a` from source commit `4eccee4`. [Build progress and APK download](https://expo.dev/accounts/pawan-menukas-team/projects/safezone/builds/b2150ea1-8cdf-4abc-b78d-4898e2ca4c7a). Initial status was `NEW`; completion and installation have not yet been confirmed. The APK uses the existing app identity/signing credentials and the verified laptop API URL. No Git push was made.
