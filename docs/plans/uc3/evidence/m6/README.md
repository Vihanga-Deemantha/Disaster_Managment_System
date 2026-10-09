# M6 — manual location and photo recovery

Status: implemented locally; automated checks passed, standalone APK and phone acceptance pending.

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
- Standalone preview build submission is next; phone acceptance remains pending.

## Phone acceptance still required

1. Disable the app's location permission. Open Report hazard, select a hazard, tap the map to place a pin, and submit. Confirm the report detail in the officer console identifies a manually pinned location.
2. Enable location permission, retry GPS, choose **Adjust pin**, and move the pin. Submit and confirm the new coordinates and manual source.
3. Select a gallery photo larger than 5 MB. Confirm the explanation, choose **Continue without photo**, and submit. Verify the report has the intended description/location and no photo.
4. Reject another oversized photo, choose **Retake photo**, and capture a valid photo. Verify its preview and submit.
5. With a confirmed pin, disconnect the phone and reload the map. Confirm the failure message and coordinates remain; reconnect and reload. If a genuine last-known point is available, confirm it is offered but never automatically accepted.

M7's T1–T8 device acceptance and M4's closed-app OS delivery checks remain separate and pending.
