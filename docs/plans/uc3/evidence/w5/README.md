# W5 verification — 8 October 2026

History supports status filtering, submitted/trimmed search, newest-capture ordering, report links and full-description
tooltips. Cache entries are separate per filter. Citizens and volunteers see a translated mobile-app notice, report
statuses and rejection reasons, with no submission or review actions. Saved lists remain readable offline.

## Automated checks

| Check                                   | Result                                                             |
| --------------------------------------- | ------------------------------------------------------------------ |
| Tests against W1 placeholders           | 13 failed as expected                                              |
| Final UC3 feature tests                 | 154 passed / 14 files                                              |
| Feature coverage                        | 100% statements/lines 1049/1049; branches 237/237; functions 88/88 |
| Full frontend                           | 930 passed / 53 files; 287.99s; zero retries                       |
| Full-run UC3 LCOV                       | 100% lines 1049/1049; branches 240/240; functions 88/88            |
| Frontend typecheck and production build | Passed                                                             |
| Final root lint                         | Passed; one pre-existing UC4 hook dependency warning               |
| Full backend                            | 1340 passed, 7 failed / 1347; 69 passed, 1 failed / 70 suites      |
| Backend UC3 LCOV                        | 100% lines 445/445; branches 163/163; functions 171/171            |
| Root typecheck                          | Existing missing optional `argon2` import in shared auth           |

The seven backend failures are shared password-hashing tests requiring the missing optional native `argon2` module.
No shared auth or backend source was changed. Coverage thresholds were kept unchanged. Full suites used two workers;
frontend used a 60-second test timeout and one allowed retry, with no retry used. Existing MSW handler warnings and
the 766.21 kB vendor chunk warning remain. The local seed and server use the supported bcrypt fallback.

## Real browser walkthrough

The root seed ran against a separate local `safezone_uc3_w5` MongoDB database. Existing development data was preserved.
UC3 seed timestamps were refreshed immediately before checking the time-sensitive score scenario. The real API ran
on port 4190 and Vite on 5190. Playwright Chromium drove the UI after two in-app browser connection timeouts.

The duty officer rejected one Kalutara report with a reason (87 → 82), verified three reports, opened the recommended
cluster and confirmed escalation. The DMC account saw six Pending Approvals, including the new draft with
`sourceClusterId: seed-cluster-kalutara`, `submittedBy: usr-duty-1` and status `PENDING_APPROVAL`. No warning was issued.
History status/search/empty/offline states and the citizen list were exercised. Preview servers were stopped afterward.

[walkthrough.json](walkthrough.json) lists all 21 captures. Key evidence:

- [History](10-history-all.png), [rejected filter](11-history-rejected.png), [search](12-history-search.png),
  [empty results](13-history-empty.png), [saved offline history](15-history-offline-saved.png).
- [DMC pending draft](16-dmc-pending-approvals.png).
- [Citizen list](17-citizen-reports.png), [phone layout](18-citizen-phone.png),
  [saved offline list](21-citizen-offline-saved.png).
- Citizen [empty](19-citizen-empty-fixture.png) and [error](20-citizen-error-fixture.png) captures use browser response
  fixtures; all main-flow, history and populated citizen captures use the real seeded API.

Desktop history and phone citizen captures were visually inspected. Final owner wireframe images were not available
in the checkout, so comparison and design sign-off remain with the owner. All W1–W5 implementation tasks are complete;
the global native-dependency gate and owner wireframe comparison remain unchecked in the plan.
