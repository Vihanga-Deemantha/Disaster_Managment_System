# DMC Officer UC3 permissions — 9 Oct 2026

The owner clarified that DMC Officers must have all Duty Officer capabilities in use case 3. This pass implements that requirement on `feat/uc3-hazard-reports`, following the completed web redesign.

Both roles can open the dashboard, pending review queue, report history, cluster detail, report detail and photo evidence; verify or reject pending reports; and escalate eligible clusters. Backend guards enforce this access independently of the sidebar and route shell. The review service receives an explicit officer identity and records its actual ID and role in UC3 audit entries.

Citizens and community volunteers retain their existing submission and own-report access. Other roles cannot review or escalate. Already-reviewed reports and repeated escalation remain conflicts, and DMC Officers must meet the same escalation prerequisites. UC1 warning approval remains a separate workflow, including its existing self-approval prohibition.

## Validation

- The new DMC regression first failed with `403` before implementation; the Duty Officer case passed.
- Complete backend UC3 suite: 295 tests in 15 suites passed. Coverage: statements 497/497, branches 165/165, functions 173/173, lines 448/448 — all 100%.
- Backend test MongoDB startup initially timed out under load. The successful rerun used Docker MongoDB through `MONGODB_TEST_URI`, with randomly named temporary databases cleaned up by the existing test helper. The preview database was not reset.
- Frontend type checking and scoped lint passed.
- Repository lint and production frontend build passed. Existing analytics hook-dependency and 770.16 kB vendor-chunk warnings remain.
- Live DMC browser walkthrough passed for all five UC3 screens and the existing Pending Approvals screen. Sidebar navigation, verification/rejection dialogs and offline disabling passed. Four live UC3 read endpoints returned 200. Screenshots and `browser-checks.json` are saved alongside this file; no report mutation was submitted against the preview database.
- Backend type checking reports only the three existing missing-`argon2` errors in shared auth; it reports no UC3 errors.
- The backend run emitted a worker teardown warning. Existing MSW refresh/teardown warnings remain in web tests.
- The first combined web run passed all 170 UC3 tests and 40/42 shared route tests. Two shared cold lazy-route assertions (warning list and analytics) timed out while the DOM still showed Loading. The final single-worker run passed all 212 tests in 16 files in 257.34 seconds; one actual retry was needed for the shared analytics lazy-route test. Web UC3 coverage: statements/lines 1433/1433, branches 254/254, functions 98/98 — all 100%. No assertions or coverage gates were relaxed.

## Follow-up outside UC3

UC1's `EscalationRequestHandler.ts` still hardcodes the draft audit role as Duty Officer. The existing shared escalation event carries requester ID but no role. UC3 audit entries now correctly record DMC Officer; the UC1 owner should resolve the role or agree an additive event field for the downstream draft audit. This limitation does not prevent DMC report review or eligible escalation. UC1 and shared contracts were preserved under the handoff's module boundary.

No mobile work, commits, or pushes were performed in this pass. The live preview remains on port 5190. Sign in with `dmc.officer@safezone.lk` and the existing demo password to inspect DMC navigation.
