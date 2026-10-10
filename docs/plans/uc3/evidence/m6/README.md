# M6 — manual location and photo recovery

Status: **DONE** — automated checks passed and the owner accepted the M6 phone checks on APK `a1688c84-60d1-40a7-8f35-0b286600f803`.

## Behaviour

- Report location uses the installed WebView with Leaflet 1.9.4 and OpenStreetMap tiles.
- A GPS fix starts with a read-only pin. **Adjust pin** enables taps and marker dragging; an actual selection changes the report source to `MANUAL`.
- Denied, timed-out or unavailable GPS opens manual selection. Denied permission also offers system settings and another GPS attempt.
- A real last-known position is offered with its coordinates and **Use this position**. It is never automatically accepted; the default Colombo map centre never becomes report evidence.
- Confirmed coordinates remain readable when map assets or tiles fail. The UI explains the failure and offers **Reload map**. Map adjustment needs connectivity; this phase does not add offline map tiles.
- Invalid photos are never attached. **Retake photo** opens the camera; **Continue without photo** explicitly removes any prior attachment while retaining the hazard, description and location.
- English, Sinhala and Tamil strings follow the existing mobile UI.

## Verification

Tests exercise malformed bridge messages, read-only versus editable maps, map load errors, explicit last-known confirmation, settings failures, denied-GPS and adjusted-GPS submissions, rejected-photo replacement and continuation without a photo. Embedded map JavaScript is exercised for taps, dragging and tile errors.

Validation on 9 Oct:

- Mobile ESLint and TypeScript checks passed.
- Full suite: **47 suites / 736 tests passed** with coverage. UC3 API, domain (including the map bridge parser) and offline core each retain **100% statements, branches, functions and lines**.
- Embedded JavaScript tests verify read-only versus editable taps, dragging and tile failures. The routing suite uses a WebView test double because Jest cannot load native modules.
- Android export passed: 1,486 modules, 3.3 MB Hermes bundle. No native dependency or app configuration changes were needed.
- Standalone Android preview APK submitted to EAS: [M6 build](https://expo.dev/accounts/pawan-menukas-team/projects/safezone/builds/a1688c84-60d1-40a7-8f35-0b286600f803). Submission status: `NEW`; this records submission, not completed compilation. API endpoint: `http://192.168.8.191:4000` (health checked before submission). Owner subsequently accepted the M6 phone checklist, as recorded below.

## Phone acceptance

On 9 Oct, after the phone checklist was provided, the owner reported **“everything is working fine.”** This records owner acceptance of manual pin submission with permission denied, GPS pin adjustment, oversized-photo continuation/retake, and submitted-location confirmation in the officer console. These are owner-reported results, not remotely observed device tests.

1. Disable the app's location permission. Open Report hazard, select a hazard, tap the map to place a pin, and submit. Confirm the report detail in the officer console identifies a manually pinned location.
2. Enable location permission, retry GPS, choose **Adjust pin**, and move the pin. Submit and confirm the new coordinates and manual source.
3. Select a gallery photo larger than 5 MB. Confirm the explanation, choose **Continue without photo**, and submit. Verify the report has the intended description/location and no photo.
4. Reject another oversized photo, choose **Retake photo**, and capture a valid photo. Verify its preview and submit.
   Additional diagnostic, not explicitly confirmed on the phone: with a confirmed pin, disconnect and reload the map; confirm the failure message and coordinates remain, then reconnect and reload. If a genuine last-known point is available, confirm it is offered but never automatically accepted. Automated tests cover these fallback safeguards.

M7's T1–T8 device acceptance and M4's closed-app OS delivery checks remain separate and pending.
