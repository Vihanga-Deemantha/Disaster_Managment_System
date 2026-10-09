# M7 — real Android sync acceptance

Status: **WIP**. Device results are pending; M6 acceptance is not evidence that closed-app OS delivery works.

## Setup and baseline

- Branch: `feat/uc3-mobile-reporting`.
- Installed APK reported by owner: M6 build `a1688c84-60d1-40a7-8f35-0b286600f803`.
- Package: `lk.safezone.mobile`; task: `safezone.hazard-reports.sync`.
- API `http://192.168.8.191:4000/api/health`: `status: ok` checked on 9 Oct before acceptance.
- Phone: **Oppo F11 Pro, Android 11**, as reported by owner. USB is available but the owner chose to defer USB testing for now.
- ADB is not on PATH and no installation was found in the usual local Android directories checked. No platform-tools installation is being made; start with foreground acceptance and then observe normal OS scheduling.
- Most recent automated baseline, from M6: lint/typecheck and Android export passed; 47 suites / 736 tests passed with UC3 API/domain/offline core at 100% coverage. These are automated results, not M7 physical test passes.

## Results

| Test | Scenario                     | Device result | Evidence needed                                                                                                    |
| ---- | ---------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------ |
| T1   | Foreground reconnect         | Pending       | Two distinct reports retained offline, later delivered with original capture times and offline-sync flag           |
| T2   | App in background            | Pending       | Screen recording, scheduler/worker evidence, server arrival before reopening, delivery notification                |
| T3   | App removed from recents     | Pending       | Screen recording, scheduler/worker evidence, server arrival before reopening, delivery notification                |
| T4   | Interrupted upload           | Pending       | Screen recording, exact clientReportId, one server record and intact photo after retry                             |
| T5   | Reboot without reopening app | Pending       | Persisted work and server arrival/notification after reboot                                                        |
| T6   | Lost server response/replay  | Pending       | Controlled interruption after server commit, same clientReportId retried, one server effect, cleared local journal |
| T7   | Expired session              | Pending       | Controlled expiry of the test session, sign-in notification, retained queue, delivery after reauthentication       |
| T8   | Offline duplicate            | Pending       | Same hazard and coordinates within the duplicate window, one merged server report, newer description, no prompt    |

## Execution notes

- Use a unique `M7-Tn` description for every test. For T1, use test pins about 1 km apart and away from this account's recent pending reports. The current backend duplicate detector compares reporter, pending status, distance (200 m) and capture window (30 minutes); changing hazard type alone does not prevent merging. For T8, use the same coordinates deliberately and keep the target report pending.
- Before going offline, obtain a real GPS fix or explicitly confirm a map pin; keep GPS/location services enabled. Confirm notifications are allowed using the existing permission button when a report is queued.
- T2–T5 must establish server arrival while Safe Zone remains backgrounded/closed. Opening the app, refreshing, or tapping a notification can trigger foreground delivery and cannot prove the OS path.
- The latest-run footer is helpful but may be overwritten by a subsequent foreground sync. Keep scheduler/worker evidence and server timing alongside it.
- On the standalone preview, the in-app development worker button is intentionally hidden. The existing OS job can be inspected/forced over USB with ADB, or observed through normal scheduling. A forced scheduler run proves the OS execution path, not natural scheduling latency.
- Do not use Android Settings **Force stop** for the swipe-away case. Record ordinary removal from recents separately; vendor battery restrictions may affect it.
- T6/T7 require a controlled test setup. Do not stop the shared API or revoke another person's sessions as part of preparation. Agree on the interruption/session target before executing those tests.
- Store recordings for T2–T4 with the report evidence and record the phone model/Android version. Raw cookies, session tokens and unrelated device logs do not belong in committed evidence.

## References

- [Plan D §11](../../D-offline-sync-design.md)
- [Expo SDK 57 BackgroundTask testing and inspection](https://docs.expo.dev/versions/v57.0.0/sdk/background-task/#inspecting-background-tasks)
- [Android WorkManager debugging](https://developer.android.com/develop/background-work/background-tasks/testing/persistent/debug)

M4 remains WIP until closed-app OS delivery and physical notification acceptance have been demonstrated. M7 remains WIP until the actual T1–T8 outcomes and evidence are recorded.
