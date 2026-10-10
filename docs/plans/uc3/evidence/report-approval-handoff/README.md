# Individual report approval -> DMC Pending Approvals

Owner clarification (9 October 2026): either Duty Officers or DMC Officers can approve citizen/volunteer reports. Each approved individual report must create a warning request in the DMC queue. Duty Officers cannot issue warnings. DMC Officers may issue requests they themselves created. All four UC3 hazards must be supported.

## Resulting flow

1. Verify the individual report in either officer console. This marks the report VERIFIED and publishes HazardReportApproved with its report id, hazard, proposed severity/district and the actual approving identity/role.
2. UC1 listens through the shared event bus and creates a PENDING_APPROVAL request with sourceReportId. Its stable warning id prevents repeated event delivery from creating duplicate requests for the same report. Different approved reports produce separate requests, even if they belong to the same cluster.
3. The officer sees confirmation that no alerts were sent. DMC sees a link to Pending Approvals; the sidebar badge refreshes immediately in the same browser.
4. DMC opens the request, can follow its source-report link, checks the proposed district and severity, and supplies the warning text in Sinhala, Tamil and English. Empty draft messages deliberately prevent issuing incomplete text.
5. DMC chooses Approve & Issue and confirms their password. The same DMC can approve the report and issue its warning. All existing DMC-only guards, recent authentication, optimistic concurrency, issue idempotency, recipient checks, auditing and delivery retries remain in force.

ROAD_BLOCKAGE and OTHER are additive shared hazard types. Existing hazard types remain supported, with labels/icons and copied mobile contracts kept in parity. Legacy explicit cluster escalation remains available as a separate cluster-wide request and still follows its existing recommendation rules; individual report approval no longer depends on those thresholds.

The former prohibition on DMC self-approval is intentionally superseded by this owner decision. UC3 keeps its VERIFIED report status; issuance is recorded in UC1 and does not rewrite the reporter's evidence.

## Verification

- Backend reports and warnings: 46 suites, 865 tests passed; 100% statements, branches, functions and lines. Includes real authenticated HTTP tests for approval by both roles, all four hazards, duplicate prevention, Duty issue denial and same-DMC issuance.
- Web reports, warnings and i18n: 30 files, 464 tests passed; both features have 100% statements, branches, functions and lines.
- Mobile contract parity, translations and alert rules: 3 suites, 140 tests passed. Frontend and mobile type-checking and affected-path ESLint passed.
- Chromium warnings acceptance: all 7 tests passed against the isolated E2E database, including the new citizen submission -> DMC report approval -> linked Pending Approvals request -> same-DMC issue flow. Existing password rejection, gateway failures/recovery, warning rejection and offline behavior passed too. The production frontend build passed as part of this run.

The Windows backend type-check reports only the pre-existing missing optional argon2 package/type declarations; bcrypt fallback remains unchanged. No coverage thresholds or repository test timeouts have been relaxed. The local backend coverage command used a longer CLI timeout to accommodate this Windows host.
