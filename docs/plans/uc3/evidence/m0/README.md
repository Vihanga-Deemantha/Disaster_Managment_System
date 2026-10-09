# M0 foundation verification (9 October 2026)

Branch: `feat/uc3-mobile-reporting`. Reused the teammate's existing Expo SDK 57 foundation, authentication/session code, protected tabs, shared UI and Alerts implementation. M1 remains TODO until development APK and phone verification are complete.

## Local verification

- Locked installs: root `npm ci`, then independent mobile `npm ci`.
- Initial mobile Jest run: 20 suites passed; contract parity could not load root Zod before the root install, and the first registration render exceeded the 20-second timeout on this machine.
- Contract parity rerun after root installation: passed (74 tests).
- Registration suite: all 23 tests passed on a final rerun with the normal repository timeout. No test or timeout configuration changed.
- Initial coverage report: 99.79% statements, 99.67% branches, 100% functions and lines. This was not a fully green single run; the two failed suites were verified separately as above.
- Mobile TypeScript, root ESLint for mobile, and changed Markdown/JSON formatting: passed.
- Expo Doctor: 21/21 checks passed.

## Build setup

- Expo project: https://expo.dev/accounts/pawan-menukas-team/projects/safezone
- Project ID: `fedafe9b-5a9e-43d8-bb47-2f0644a438d5`.
- Android application ID: `lk.safezone.mobile`.
- Development profile: internal distribution, development client, APK.
- EAS generated and stores the Android signing keystore remotely; no signing secrets were added to Git.
- Added repository `.easignore` as necessary build configuration: it preserves root ignore rules and excludes local worktrees/helper sessions and generated native/Expo files. This is an additive shared configuration beyond the old M0.2 list; no application behavior changed.

## Remaining phone checks

Install the development APK, run Metro using `npm start` from `mobile`, and connect the phone and laptop to the same network. Start the local backend on port 4000 (or set `EXPO_PUBLIC_API_URL` for the correct LAN-accessible backend). Verify both CITIZEN and COMMUNITY_VOLUNTEER sign-in, Report / My reports / Alerts navigation, and cached identity after closing and reopening offline. Report and My reports are foundation placeholders until the later UC3 mobile phases.

EAS accepted the Android development build after a transient 503 on the first submission. Build ID: `37be83cb-2c47-461c-aade-ae523bc264e9`. [Build progress and APK download](https://expo.dev/accounts/pawan-menukas-team/projects/safezone/builds/37be83cb-2c47-461c-aade-ae523bc264e9). Cloud completion and phone validation remain pending.

## Phone checks reported by the owner

Citizen and Volunteer sign-in, navigation across the three tabs, and tab switching while offline with the app already open passed. Fully reopening offline reached the development launcher, so it did not exercise application session restoration. Added a standalone internal preview APK profile with developmentClient=false and EXPO_PUBLIC_API_URL=http://192.168.8.191:4000 for this laptop's current Wi-Fi network. It embeds the app bundle; online sign-in still requires the phone to reach the laptop's running API. Rebuild with an updated API URL if the laptop's address changes. Offline cold reopening remains pending.

Standalone preview build accepted by EAS: [build ef10daf3-ef53-4819-affa-8a5ad8e2ebcd](https://expo.dev/accounts/pawan-menukas-team/projects/safezone/builds/ef10daf3-ef53-4819-affa-8a5ad8e2ebcd). Cloud completion, installation and offline reopening are pending.

## Completion confirmed by the owner

9 October: the standalone preview APK was installed and retains the signed-in session after the app is closed and reopened, completing the remaining M0 check. Earlier Citizen/Volunteer sign-in, protected tab navigation and offline tab switching passed. M0 is DONE; Report and My reports remain placeholders until their planned mobile phases.
