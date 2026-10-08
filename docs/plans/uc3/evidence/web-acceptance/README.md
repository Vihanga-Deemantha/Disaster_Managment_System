# UC3 web acceptance — 9 October 2026

Checked the current uncommitted UC3 web implementation on `feat/uc3-hazard-reports`. No functional application failure was found in the flows exercised below. No production code was changed during this verification.

## Real browser checks

Headless Chromium opened the running Vite frontend at `http://127.0.0.1:5190`. Private browser contexts forwarded only frontend `/api/**` requests to a separate API at port 4191, preserving real responses. That API used Docker MongoDB database `safezone_uc3_web_audit_20261009` and an isolated photo directory. Responses were not mocked. Test writes did not affect the original preview database, `safezone_uc3_ui_preview`.

`checks.json` records 22 acceptance checks; `navigation-checks.json` records 8 additional checks. Both report zero browser JavaScript errors. Screenshots alongside these files show the resulting UI.

- Dashboard: seeded score order, manual refresh, and automatic discovery of a newly submitted cluster.
- Duty Officer and DMC Officer: persisted verification and rejection, required rejection reason, trimmed reason, score reduction after rejection, and eligible escalation. Cancelling escalation leaves the cluster unmodified.
- Warning handoff: both escalations create linked UC1 drafts with `PENDING_APPROVAL` status, visible in the DMC Pending Approvals screen. Approval/issuance of those warnings is UC1 and was not exercised in this pass.
- Concurrent review: a second officer reviews an open report first; the original confirmation receives a conflict, displays its error, and refreshes the report.
- History: rejected and verified filters, rejection reasons, search only on submission, trimming while retaining the status filter, and no-results state.
- Cluster closure: rejecting its final report closes the cluster and displays the closure message. The submitted report included manual location and offline-sync metadata.
- Evidence: a real PNG upload is served and decoded in the browser.
- Sidebar and feature links: navigate dashboard, review queue, history, cluster detail and report detail.
- Offline: cached dashboard, queue, history, cluster and report remain accessible through SPA navigation. Verify/reject/escalate controls are disabled, and reconnection re-enables pending-report review.
- Roles: citizen and volunteer own-report lists remain read-only; citizen review and cluster API access are denied. NGO access is denied in both the route UI and API.
- Phone: 390 × 844 viewport, sidebar navigation closes the menu, history stays within the viewport with its table horizontally scrollable. Sinhala and Tamil history render translated headings without page overflow.

Offline checks used a loaded development app with service workers blocked. They establish cached resource navigation and disabled mutations, not a production PWA cold start or offline map-tile availability. Browser screenshot inspection also confirmed the online map rendered.

Two initial harness problems were corrected: an overly broad API intercept matched Vite source imports, and an exact success-message locator overlooked the shared Alert's visually hidden accessibility prefix. The Duty escalation had already succeeded at the latter interruption; verification resumed from persisted test data. Neither required an application change.

## Fresh automated regression

From `frontend/`, run through Git Bash:

```bash
npx vitest run src/features/hazard-reports --maxWorkers=1 --testTimeout=60000 --hookTimeout=60000 --coverage --coverage.include='src/features/hazard-reports/**/*.{ts,tsx}'
```

Result: **170 tests in 15 files passed**, 83.35 seconds, no retries. Coverage: statements and lines 1433/1433, branches 252/252, functions 98/98 — all **100%**. `web-tests.txt` retains the output, including existing MSW refresh/teardown missing-handler warnings. Coverage gates and assertions were not relaxed.

The immediately preceding DMC permission pass also passed 295 UC3 backend tests and 212 frontend feature/shared-route tests, frontend type checking, lint and build. Those results are recorded separately in `../dmc-permissions/README.md`; they were not rerun here because application code did not change.

## Remaining limitations

- UC1's downstream draft audit still hardcodes `DUTY_OFFICER`, including for DMC-originated escalation. UC3's audit correctly records the actual officer role. This is an existing cross-module follow-up; the warning handoff works. UC1 also retains its separate self-approval prohibition.
- Existing shared backend type-check failures concern the missing optional `argon2` package on this machine; this pass does not certify all repository-wide checks.
- Mobile M0 remains paused. Web citizen/volunteer submission is intentionally absent; submissions for these tests were made through the real API. Sinhala/Tamil wording still needs owner proofreading.

The temporary API was stopped after verification. The original preview API on port 4190 and web preview on port 5190 remain running. No commits or pushes were made.
