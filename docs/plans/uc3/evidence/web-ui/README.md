# UC3 web design — 8 October 2026

The owner requested original web layouts matching the existing Safe Zone app. The supplied screenshots are
inspiration, rather than exact wireframes. M0 remains paused while another contributor's mobile work is coordinated.

## Design

- Dashboard: shared icon summary cards, a bordered queue, visible priority/status, and history/refresh controls.
- Cluster: summary and map side by side on desktop, stacked on phones, with escalation controls inside the overview.
  Report evidence uses a responsive card grid, full uncropped photos, and consistent missing-photo placeholders.
- Report review: evidence and location map in separate columns, status and delayed-sync information grouped with
  evidence, and clearly separated verification/rejection actions.
- History: filter/search card and horizontally scrollable report table at narrow widths.
- My reports: responsive read-only cards with status and rejection reasons.
- Dialogs/states: shared dialogs, styled reason input, bordered loading/empty panels, existing error/retry and
  offline behavior. Leaflet is contained in its own stacking context beneath dialogs.

The initial design pass changed only UC3 frontend files. The subsequent sidebar request also changes the shared
navigation registration, its expected role links in the route test, and three additive translation keys per language.
The shared shell implementation, backend, other features, and mobile source are unchanged. No application imagery
was added.

## Verification

All 154 UC3 tests pass (14 files), with 100% statements/lines (1150/1150), branches (237/237), and functions (88/88).
Coverage was scoped to UC3; a first unscoped feature-only run also measured untested unrelated modules and therefore
failed their coverage gates. Thresholds and source configuration were not changed.

Root lint passes with the existing analytics hook-dependency warning. Frontend type checking and production build
pass. The existing vendor chunk warning remains. Existing MSW teardown warnings appeared in some passing tests.
Final spacing changes alter CSS classes only; formatting, feature lint, build and browser checks were repeated.

Chromium captures use explicit API response fixtures in an isolated browser context, rather than the production
database. The existing local flood-response image is fixture evidence only. No real report was verified, rejected,
or escalated during this design pass. The prior real-backend walkthrough is documented in [W5 evidence](../w5/README.md).

[Browser checks](checks.json) record the viewport and document-overflow check for each capture. All five pages were
checked at 1440px and 390px, all three dialogs opened, and Sinhala/Tamil citizen layouts were captured. Maps stayed
behind dialogs, no page-level horizontal overflow or runtime errors were found, and offline review actions were disabled.
Tables scroll within their containers on phones.

## Preview

- [Dashboard](01-dashboard.png)
- [Cluster details](02-cluster.png)
- [Report review](03-report.png)
- [Reports history](04-history.png)
- [My reports](13-my-reports.png)
- [Phone report review](10-report-phone.png)
- [Phone history](11-history-phone.png)
- [Phone My reports](12-my-reports-phone.png)
- [Verify confirmation](05-verify-dialog.png), [rejection](06-reject-dialog.png),
  [escalation confirmation](07-escalation-dialog.png)
- [Sinhala](14-my-reports-SI.png), [Tamil](14-my-reports-TA.png)
- [Empty](15-empty.png), [error/retry](16-error.png)
- [Offline review](17-report-offline.png), [offline My reports](18-my-reports-offline.png)

Changes remain local and uncommitted on `feat/uc3-hazard-reports`.

## Sidebar follow-up

The duty officer now has Dashboard, Review reports, and Report history entries. Review reports is a dedicated
pending-only queue at `/hazard-reports/reports`; its cards open existing individual report pages. The sidebar remains
visible and highlights Review reports on individual reports. Citizens and volunteers retain their existing entry
and read-only view. Other roles keep their existing module permissions.

The new queue shares the pending-history cache, displays newest capture first, and supports loading, empty,
error/retry, and cached offline states. Tests exercise the pending filter and navigation from the queue into a report,
back to dashboard, through history, and back to the queue without browser Back.

The [live browser evidence](navigation/checks.json) uses the actual isolated preview API, with desktop and phone
captures. No reports were reviewed or escalated. See [dashboard sidebar](navigation/01-dashboard-sidebar.png),
[review queue](navigation/02-review-queue.png), [history sidebar](navigation/03-history-sidebar.png),
and [phone queue](navigation/04-review-phone.png).

Fetching `origin/develop` found 23 commits beyond this branch's HEAD (latest fetched commit `0b33ed3`), including later UC1 warning-screen changes
and mobile authentication/alerts work. They were inspected but not merged during the navigation fix. UC1 warnings
and UC4 analytics already exist in this checkout and appear for their authorized roles. UC2 Resource Allocation
is a placeholder in this checkout and the fetched develop version.

Final follow-up verification: 262 affected tests passed across 20 files, including all 159 UC3 tests, role-based
routes/sidebar, shared shell navigation, and translation tests. UC3 coverage is 100% lines/statements (1215/1215),
branches (246/246), and functions (92/92). Root lint, frontend typecheck and production build pass, with the existing
analytics hook warning and vendor-size warning. The new report-navigation test initially lacked Marker/Popup in
its Leaflet mock; this was corrected. An unrelated lazy analytics route initially exceeded the loading wait on
the busy machine; the final run used one worker with one allowed retry.
