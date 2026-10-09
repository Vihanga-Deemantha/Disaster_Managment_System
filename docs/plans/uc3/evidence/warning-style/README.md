# UC3 warning-style redesign

Design reference: the existing DMC warning list (`/warnings`) and warning review (`/warnings/warning-demo-gampaha`), captured in `reference-list.png` and `reference-review.png`.

The UC3 dashboard, pending review queue and history use the same table typography, spacing, borders, icons and action styling. Report review and cluster detail use the warning review's information card and labelled map layout. Report evidence remains separate from cluster escalation. The sidebar retains Dashboard, Review reports and Report history.

Report review shows capture and receipt times separately, with the existing offline delay notice, photo evidence, location source and rejection reason. Verify and Reject remain confirmed actions. Cluster escalation retains its eligibility checks. No backend, warning feature, mobile app or role permissions were changed in this pass.

## Validation

- Frontend type check and repository lint passed. Lint retains the existing analytics EventLogDialog dependency warning.
- 159 UC3 tests in 15 files passed; the coverage run reported 100% statements, branches, functions and lines.
- Real local preview checked at 1440 × 1000 and 390 × 844: dashboard, pending queue, history, cluster and report detail, sidebar navigation, verification and rejection dialogs.
- English, Sinhala and Tamil phone layouts checked; translated information labels wrap within their columns.
- Offline verification and rejection controls disable. No report mutation was submitted during browser checks.
- Screenshots and `browser-checks.json` record the browser checks. Map tiles load externally; the initial desktop capture can precede tile loading. Seeded reports shown here have no attached photos.

## Next pass

Update, 9 Oct: DMC UC3 permissions have now been implemented. See `../dmc-permissions/README.md` for the permission pass and its validation. The paragraph below records the scope decision at the time of the redesign.

The user explicitly chose to complete the redesign before DMC access. DMC Officer must subsequently receive Duty Officer's UC3 capabilities: dashboard, cluster and report evidence, pending review queue, history, verification, rejection and eligible escalation. Implement both frontend navigation/route access and backend authorization, with role tests. This requirement must not bypass UC1's separate warning approval rules.

M0/mobile remains paused pending coordination with the teammate's mobile work. The redesign is local and uncommitted on `feat/uc3-hazard-reports`.
