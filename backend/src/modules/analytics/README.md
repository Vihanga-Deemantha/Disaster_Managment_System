# UC-4 implementation handover

Implemented from `New folder/04-UC4-impact-analytics_1.md` (v2), the master plan, and the UC-4 wireframes on pages 43â€“50 of `Y3S2-WE-SE-042-3.pdf`. Changes are confined to `backend/src/modules/analytics/**` and `frontend/src/features/analytics/**`. Shared authentication, navigation, contracts and the other use cases are unchanged.

The `/analytics` screen provides event, district, hazard and date filters; four KPIs; reach, occupancy and unit-specific relief charts; organisation allocation rows; paged drill-down; export history; and PDF/CSV export with audience and dataset selection. The existing shared shell provides the sidebar. Dirty filters must be applied before export. Empty, invalid, offline, out-of-scope and failed-export states have explicit messages.

## Run and demonstrate

From the repository root, use the existing setup and database instructions, then `npm.cmd run seed` and `npm.cmd run dev`. UC-4 contributes six months of relative demonstration history to the existing seed runner. Open `/analytics` after signing in with the existing demo accounts:

| Role        | Email                     | Scope                                        |
| ----------- | ------------------------- | -------------------------------------------- |
| DMC Officer | `dmc.officer@safezone.lk` | All organisations or a selected organisation |
| NGO Manager | `ngo.manager@safezone.lk` | Red Cross Sri Lanka                          |
| Donor       | `donor@safezone.lk`       | Relief Foundation                            |

Use the demo password documented in the shared seed (`SafeZone#Demo2026`). Select Ratnapura Monsoon Flood or Kalutara Landslide for populated results. Clear the event and choose a district without seeded history for E2. For E3, an authenticated DMC Officer can PUT `{ "mode": "FAIL_ONCE" }` or `{ "mode": "FAIL_ALWAYS" }` to `/api/dev/pdf-exporter`, then export PDF. Restore `{ "mode": "OK" }`. This route is absent in production.

NGO/Donor relief queries and exports enforce the authenticated organisation; a conflicting organisation produces 403 and an audit record. Their alert/shelter figures are public aggregates, and private log/export fields remain redacted for either audience. For DMC, External removes personal and internal failure details; Internal retains authorised details.

## Architecture and integration limits

Domain validation and application policies are framework-independent. Read-model ports, Strategy aggregators/exporters, a Factory, a Builder and idempotent EventBus handlers preserve the plan's design names. MongoDB collections belong exclusively to analytics. Existing `WarningIssued` and `AllocationDeployed` contracts update these projections without importing other modules.

Shelter occupancy is seeded demonstration history because the frozen contract has no occupancy event. Allocation events contain no hazard/event identifier: a dispatch is linked only when its district/time identifies one catalog event unambiguously; otherwise it remains visible in unfiltered history with an unknown hazard. No hazard is invented and no shared contract is changed. The repository currently filters its owned projection collections in memory; production-scale query pushdown is a future optimisation.

PDF generation uses a dependency-free, paginated PDF writer behind the exporter port instead of adding pdfkit to shared package files. The browser download was parsed with pypdf. CSV escapes quotes, commas and newlines and neutralises spreadsheet formulas. Report content uses the same complete scoped filter as the applied dashboard, re-queried at generation time. A live data change can therefore affect a later export.

## Report Section 6.2: business rules to insert

| Rule | Implemented wording                                                                                                                                                                                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| BR1  | Valid calendar dates; start â‰¤ end; no future end; at most 12 months; known district/hazard/event; selected event constrains its date window and district.                                                                                |
| BR2  | Citizens reached = recipients delivered on at least one channel divided by targeted recipients. Zero targeted recipients gives 0%, never NaN.                                                                                              |
| BR3  | Export only selected datasets. External exports omit citizen identifiers, officer names and internal failure details. Role restrictions apply to both audiences.                                                                           |
| BR4  | Embed the SHA-256 of the canonical report content in PDF metadata/footer and CSV metadata. Compute the final downloaded-file SHA-256 after rendering; store it in export history, return it in `X-Report-Checksum`, and show it on screen. |
| BR5  | Retry generation automatically once. If both attempts fail, save Failed metadata and offer Retry and Export CSV.                                                                                                                           |
| BR6  | Cache generated dashboards per user and complete filter. Offline, show cached results with their timestamp and disable Generate/Export.                                                                                                    |

BR4 corrects a self-reference in the source plan: printing a file's own final checksum changes that file's bytes. The embedded content digest and the final file digest are explicitly labelled separately. The browser check independently hashes the downloaded bytes and compares the result with the success message.

The original PDF is preserved. This handover supplies the business-rule wording, traceability and screenshot artifacts for insertion into the group's editable report; an editable revised report was not supplied.

## Report Section 6.3: traceability and evidence

| Report IDs / flow             | Implementation                                                | Evidence                                                   |
| ----------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------- |
| CD-10; steps 4â€“8            | Read-model ports, owned projections, aggregators              | domain/application/API/Mongo tests                         |
| SC4-02, SD4-01; step 12       | `AnalyticsFilter`, scoped controller, `AudienceRedactor`      | same-filter and audience export assertions                 |
| UCD-14, UCD-15, SC4-01; A1/E4 | Role guards, `AccessScope`, organisation badge/chips          | backend scope/audit tests; real NGO/Donor browser sessions |
| SD4-02; E1/E2/E3              | Inline validation, empty state, retry/fallback                | API/domain/UI tests; browser CSV fallback                  |
| UCD-16, HCI-08a; A2           | PDF/CSV Factory, single-select format radios                  | exporter/API/UI tests; actual downloads                    |
| HCI-10                        | Separate reach %, occupancy people and per-unit relief charts | chart tests and desktop/mobile screenshots                 |
| HCI-01; A3                    | Existing shared shell, paged event-log dialog                 | shared route regression, UI and browser drill-down         |
| BR4                           | `Sha256ChecksumCalculator`, `saveMetadata`                    | downloaded-byte SHA-256 assertions                         |
| BR6                           | Per-user Dexie cache, offline controls                        | hook tests; offline browser reload                         |

Screenshots and sample PDF/CSV downloads are in [frontend evidence](../../../../../frontend/src/features/analytics/evidence/). Screens 01â€“07 cover dashboard, export configuration/result, event log, offline, both restricted roles and mobile. Extracted reference images remain under `seed/wireframes/`.

## Validation commands

Run from the repository root:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd exec -w backend -- jest --config src/modules/analytics/testing/jest.uc4.config.js --runInBand --coverage
npm.cmd exec -w frontend -- vitest run --config src/features/analytics/testing/coverage.config.ts
npm.cmd exec -w backend -- stryker run src/modules/analytics/stryker.config.mjs
npm.cmd exec -w backend -- jest --runInBand --coverage=false
npm.cmd exec -w frontend -- vitest run --config src/features/analytics/testing/regression.config.ts
```

UC-4 coverage: 88 backend tests and 56 frontend tests; 100% statements, branches, functions and lines on measured application code. Wiring, seed and test support are excluded consistently with the repository coverage policy. HTML/lcov reports are in each analytics folder's `evidence/coverage/`. Final mutation score: 98.33% (90% gate passed). Mutation evidence is in backend `evidence/mutation/` with a â‰¥90% gate.

Shared regression verified 538 backend and 479 frontend tests. The frontend regression configuration adds a test-only Node 24/jsdom AbortSignal/DOMException compatibility adapter and analytics responses for the pre-existing route tests. No shared source or shared test was edited.

For isolated production-browser verification, start `npm.cmd exec -w backend -- tsx src/modules/analytics/testing/demo-server.ts` (temporary MongoDB on API port 4124). Start frontend preview on 4184 with `API_PROXY_TARGET=http://127.0.0.1:4124`, then run `node frontend/src/features/analytics/testing/browser-check.mjs`. The script checks SHA-256 downloads, failure fallback, drill-down, cached offline reload, own-organisation scope and 390px mobile width.
