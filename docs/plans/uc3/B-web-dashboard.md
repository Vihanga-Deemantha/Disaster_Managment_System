# Plan B – UC3 Web App (`frontend/src/features/hazard-reports/`) – Duty Officer dashboard

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` or
> `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax. Read `IMPLEMENTATION_PLAN.md` (decisions, REST
> contract) and the "Frontend" half of `docs/building-a-use-case.md` first. Requires Plan A phase B4.

**Goal:** Phase B of the scenario (steps 11–16, A2) on the existing web shell: review queue, cluster, report
verification, reject dialog, escalation confirmation, reports history; plus a read-only "My reports" for citizens who
open the web app.

**Architecture:** One lazily loaded feature mounted at `/hazard-reports/*`. Screens are thin: data comes from a typed
API module through `useCachedResource`, decisions (stats, band labels, why escalation is disabled) live in pure
functions under `model/`, and every irreversible action goes through a dialog. Officer actions need a connection
(their result must be seen at once), so they are disabled offline with a visible reason.

## What already exists (do not rebuild, do not edit)

| You get                                                                                         | From                                                                                                  |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Shell, sidebar entry, lazy route, role guard (`CITIZEN`, `COMMUNITY_VOLUNTEER`, `DUTY_OFFICER`) | `routes.tsx`, `features/hazard-reports/nav.ts`                                                        |
| Signed-in user                                                                                  | `useAuth()` from `@/shared/auth/AuthContext`                                                          |
| API client (CSRF header, cookies, silent refresh, `ApiError` / `NetworkError`)                  | `useApi()` from `@/shared/api/ApiProvider`                                                            |
| Cached reads + "last synced"                                                                    | `useCachedResource`, `LastSynced` in `@/shared/offline/`                                              |
| Online status                                                                                   | `useOnlineStatus()`                                                                                   |
| UI kit                                                                                          | `Button`, `Dialog`, `Alert`, `TextField`, `SelectField`, `Spinner`, `SeverityBadge` in `@/shared/ui/` |
| i18n                                                                                            | `useT()`, `translateError(t, error)`; add keys at the bottom of `messages.en.ts`, `.si.ts`, `.ta.ts`  |
| Test kit                                                                                        | `renderRoutes`, `signIn`, `makeMe`, `server` (MSW), `apiError`, `setBrowserOnline`, `settle`          |
| Leaflet                                                                                         | `leaflet`, `react-leaflet` already in `frontend/package.json`; the service worker caches OSM tiles    |

The only files outside the feature folder you touch are the three `messages.*.ts` files (the guide allows it).

## Global constraints

- Coverage gate **100%** on `src/features/hazard-reports/**` (tests excluded). Every branch you write needs a test.
- ESLint: component ≤ 90 lines, complexity ≤ 8, no `any`, no `console`, `jsx-a11y` recommended, no imports from other
  features. Extract sub-components instead of growing a screen.
- **Visual design is yours.** The tasks specify data, states, behaviour, accessible names and tests. Use the tokens in
  `src/index.css` (`bg-navy-900`, `bg-accent-600`, `text-ink`, …) and match your final wireframes; nothing here
  prescribes layout or styling.
- Every screen has loading, empty, error (with retry) and offline states. Status and band are always colour **and** text.
- Every user-visible string goes through `t()`. A key missing in Sinhala or Tamil is a compile error.
- Test names start with the flow: `'UC-3 A2: …'`.

## File map

```
features/hazard-reports/
├─ index.tsx                    role switch + <Routes>
├─ nav.ts                       (unchanged)
├─ api/
│  ├─ types.ts                  Report, ClusterSummary, ClusterDetail, ReviewResult (copy from IMPLEMENTATION_PLAN.md)
│  └─ hazardReportsApi.ts       typed calls
├─ model/
│  ├─ dashboardStats.ts         stat cards from ClusterSummary[]
│  ├─ escalation.ts             why the Escalate button is disabled
│  ├─ labels.ts                 band / status / hazard → i18n key + tone class
│  └─ formatTime.ts             ISO → "7 Oct, 14:32" in Asia/Colombo
├─ hooks/
│  └─ useAutoRefresh.ts         reload every 15 s while online and visible
├─ components/
│  ├─ BandBadge.tsx  StatusChip.tsx  ScoreBar.tsx  StatCard.tsx
│  ├─ ReportCard.tsx            one report inside a cluster
│  ├─ ReportsMap.tsx            react-leaflet map with one marker per report
│  ├─ ConfirmActionDialog.tsx   verify + escalate confirmations
│  ├─ RejectDialog.tsx          mandatory reason (H8, H10)
│  └─ AsyncState.tsx            loading / error+retry / empty wrapper
├─ screens/
│  ├─ OfficerDashboard.tsx      wireframe 02
│  ├─ ClusterDetail.tsx         wireframe 01 + escalation confirmation (replaces 05)
│  ├─ ReportDetail.tsx          wireframe 04 + reject dialog
│  ├─ ReportsHistory.tsx        wireframe 06
│  └─ CitizenReports.tsx        read-only list for citizens on the web (D13)
└─ __tests__/                   one file per unit above
```

---

## Phase W1 – Plumbing

### Task W1.1: Types, API module, i18n keys

**Files:** Create `api/types.ts`, `api/hazardReportsApi.ts` · Modify `shared/i18n/messages.{en,si,ta}.ts` ·
Test `__tests__/hazardReportsApi.test.ts`

```ts
// api/hazardReportsApi.ts
import type { ApiClient } from '@/shared/api/apiClient';
import type { ClusterDetail, ClusterSummary, Report, ReportStatus, ReviewResult } from './types';

export interface HistoryFilter {
  status?: ReportStatus;
  q?: string;
}

const BASE = '/api/hazard-reports';

function historyQuery({ status, q }: HistoryFilter): string {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (q) params.set('q', q);
  const query = params.toString();
  return query ? `?${query}` : '';
}

/** Every UC-3 call the web app makes. Screens never build URLs themselves. */
export const hazardReportsApi = (api: ApiClient) => ({
  queue: () => api.get<ClusterSummary[]>(`${BASE}/clusters?status=OPEN,ESCALATION_RECOMMENDED`),
  escalated: () => api.get<ClusterSummary[]>(`${BASE}/clusters?status=ESCALATED`),
  cluster: (id: string) => api.get<ClusterDetail>(`${BASE}/clusters/${encodeURIComponent(id)}`),
  report: (id: string) => api.get<Report>(`${BASE}/${encodeURIComponent(id)}`),
  history: (filter: HistoryFilter) => api.get<Report[]>(`${BASE}${historyQuery(filter)}`),
  mine: () => api.get<Report[]>(BASE),
  verify: (id: string) => api.post<ReviewResult>(`${BASE}/${encodeURIComponent(id)}/verify`),
  reject: (id: string, reason: string) =>
    api.post<ReviewResult>(`${BASE}/${encodeURIComponent(id)}/reject`, { reason }),
  escalate: (id: string) =>
    api.post<ClusterDetail>(`${BASE}/clusters/${encodeURIComponent(id)}/escalate`),
});

export type HazardReportsApi = ReturnType<typeof hazardReportsApi>;
```

`api/types.ts`: the three interfaces from `IMPLEMENTATION_PLAN.md` plus
`export interface ReviewResult { report: Report; cluster: ClusterSummary }` and the union type aliases
(`ReportStatus`, `Band`, `ClusterStatus`, `ReportHazardType`, `EscalationRequirement`).

**i18n keys** (English; add the same keys with Sinhala and Tamil text to the other two files – draft them, then
proofread):

```
hazardReports.dashboard.title            Hazard report clusters
hazardReports.dashboard.caption          Reports are grouped by distance (2 km) and time (6 hours). Each cluster shows its most common hazard type.
hazardReports.dashboard.empty            No open clusters. New reports appear here automatically.
hazardReports.dashboard.refresh          Refresh
hazardReports.stat.openClusters          Open clusters
hazardReports.stat.pendingReports        Reports awaiting review
hazardReports.stat.highPriority          High priority
hazardReports.stat.escalationRecommended Escalation recommended
hazardReports.col.area | .hazard | .reports | .score | .lastReport | .status | .captured | .received | .reporter | .description
hazardReports.reportsCount               {total} reports, {verified} verified
hazardReports.band.HIGH | ELEVATED | MODERATE | LOW        High priority | Elevated | Moderate | Low
hazardReports.clusterStatus.OPEN | ESCALATION_RECOMMENDED | ESCALATED | CLOSED
hazardReports.reportStatus.PENDING | VERIFIED | REJECTED   Pending review | Verified | Rejected
hazardReports.hazard.FLOOD | LANDSLIDE | ROAD_BLOCKAGE | OTHER
hazardReports.reporter.CITIZEN | VOLUNTEER
hazardReports.cluster.title              {area} cluster
hazardReports.cluster.score              Priority score {score} of 100
hazardReports.cluster.openReport         Review report
hazardReports.cluster.mapLabel           Map of the reports in this cluster
hazardReports.escalate.button            Escalate to warning
hazardReports.escalate.needs.HIGH_BAND          The cluster must be High priority.
hazardReports.escalate.needs.VERIFIED_REPORTS   {verified} of {required} reports verified.
hazardReports.escalate.needs.WARNABLE_HAZARD    The cluster needs a flood or landslide report.
hazardReports.escalate.offline           Escalating needs a connection so you can see the result.
hazardReports.escalate.confirmTitle      Escalate this cluster?
hazardReports.escalate.confirmBody       A warning request for {area} will be sent to the DMC Officer for approval. This cannot be undone.
hazardReports.escalate.confirm           Send for approval
hazardReports.escalate.done              Sent to the DMC Officer for approval. The warning is not active until it is approved.
hazardReports.report.title               Hazard report
hazardReports.report.noPhoto             No photo was attached.
hazardReports.report.photoAlt            Photo attached to this {hazard} report
hazardReports.report.location.GPS        GPS, accurate to about {metres} m
hazardReports.report.location.MANUAL     Pinned on the map by the reporter
hazardReports.report.syncedFromOffline   Sent later from offline. Captured at {captured}, received at {received}.
hazardReports.report.backToCluster       Back to the cluster
hazardReports.verify.button | .confirmTitle | .confirmBody | .confirm      Verify report | Verify this report? | It will count as genuine and cannot be changed afterwards. | Verify
hazardReports.verify.done                Verified. Cluster score is now {score} ({band}).
hazardReports.reject.button | .title | .reasonLabel | .reasonHint | .confirm    Reject report | Reject this report | Reason | The report is kept for audit with this reason. | Reject report
hazardReports.reject.done                Rejected. Cluster score is now {score} ({band}).
hazardReports.reject.clusterClosed       No reports remain in this cluster, so it was closed.
hazardReports.review.nowRecommended      This cluster is now recommended for escalation.
hazardReports.review.offline             Reviewing needs a connection.
hazardReports.history.title | .filterStatus | .filterAll | .search | .searchButton | .empty
hazardReports.history.rejectedBecause    Rejected: {reason}
hazardReports.mine.title                 My reports
hazardReports.mine.useMobileApp          To report a hazard, use the Safe Zone mobile app. Reports you have sent appear here.
hazardReports.mine.empty                 You have not sent any reports yet.
error.REPORT_NOT_FOUND | CLUSTER_NOT_FOUND | REPORT_ALREADY_REVIEWED | ESCALATION_NOT_ALLOWED | REASON_REQUIRED | REASON_TOO_LONG
```

(One key per `|`-separated entry. Check how `{placeholders}` are passed by reading `I18nProvider.tsx` before using them.)

**API tests** (fake `ApiClient` object with `vi.fn()` `get`/`post`): each method calls the right path · `history({})` →
no query string; `{ status: 'REJECTED', q: 'bridge road' }` → `?status=REJECTED&q=bridge+road` · ids are URL-encoded ·
`reject` sends `{ reason }`.

- [x] Tests → fail → implement → pass → `npm run typecheck -w frontend` (catches a missing translation key) → commit
      `feat(uc3-web): api module, types and strings`.

### Task W1.2: Pure model functions

**Files:** Create `model/dashboardStats.ts`, `model/escalation.ts`, `model/labels.ts`, `model/formatTime.ts` ·
Tests `__tests__/model.test.ts`

```ts
// model/dashboardStats.ts
import type { ClusterSummary } from '../api/types';

export interface DashboardStats {
  openClusters: number;
  pendingReports: number;
  highPriority: number;
  escalationRecommended: number;
}

export function dashboardStats(clusters: readonly ClusterSummary[]): DashboardStats {
  return {
    openClusters: clusters.length,
    pendingReports: clusters.reduce((sum, cluster) => sum + cluster.counts.pending, 0),
    highPriority: clusters.filter((cluster) => cluster.band === 'HIGH').length,
    escalationRecommended: clusters.filter((cluster) => cluster.status === 'ESCALATION_RECOMMENDED')
      .length,
  };
}
```

```ts
// model/escalation.ts
import type { ClusterSummary, EscalationRequirement } from '../api/types';

export type EscalationState =
  | { kind: 'READY' }
  | { kind: 'DONE' }
  | { kind: 'OFFLINE' }
  | { kind: 'BLOCKED'; unmet: EscalationRequirement[] };

/** UC-3 step 15 / H4: the button is enabled only for a recommended cluster, and says what is missing otherwise. */
export function escalationState(cluster: ClusterSummary, online: boolean): EscalationState {
  if (cluster.status === 'ESCALATED') return { kind: 'DONE' };
  if (cluster.status !== 'ESCALATION_RECOMMENDED')
    return { kind: 'BLOCKED', unmet: cluster.escalation.unmet };
  return online ? { kind: 'READY' } : { kind: 'OFFLINE' };
}
```

`labels.ts`: `bandTone(band)`, `reportStatusTone(status)`, `clusterStatusTone(status)` return a Tailwind class string;
the i18n keys are built inline as `` `hazardReports.band.${band}` as MessageKey ``. `formatTime(iso, language)` uses
`new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone:
'Asia/Colombo' })` so tests give the same text on a laptop and in CI.

**Tests:** stats for an empty list and for a mixed list · `escalationState`: ESCALATED → DONE; OPEN with unmet →
BLOCKED carrying them; CLOSED → BLOCKED; recommended + online → READY; recommended + offline → OFFLINE · a tone for
every band / report status / cluster status (table test) · `formatTime('2026-10-07T09:02:00.000Z', 'EN')` contains
`14:32`.

- [x] Tests → fail → implement → pass → commit `feat(uc3-web): view-model functions`.

### Task W1.3: Shared pieces and the route shell

**Files:** Create `components/AsyncState.tsx`, `BandBadge.tsx`, `StatusChip.tsx`, `ScoreBar.tsx`, `StatCard.tsx`,
`hooks/useAutoRefresh.ts` · Modify `index.tsx` · Tests `__tests__/components.test.tsx`, `__tests__/routes.test.tsx`

```tsx
// index.tsx
import { Navigate, Route, Routes } from 'react-router';
import { useAuth } from '@/shared/auth/AuthContext';
import { CitizenReports } from './screens/CitizenReports';
import { ClusterDetail } from './screens/ClusterDetail';
import { OfficerDashboard } from './screens/OfficerDashboard';
import { ReportDetail } from './screens/ReportDetail';
import { ReportsHistory } from './screens/ReportsHistory';

/**
 * UC-3 Submit and Verify Hazard Report on the web: Phase B (Duty Officer). Reporters submit from the
 * mobile app; here they only see what happened to their reports.
 */
export function HazardReportsPage() {
  const { user } = useAuth();
  if (user?.role !== 'DUTY_OFFICER') return <CitizenReports />;
  return (
    <Routes>
      <Route index element={<OfficerDashboard />} />
      <Route path="clusters/:clusterId" element={<ClusterDetail />} />
      <Route path="reports/:reportId" element={<ReportDetail />} />
      <Route path="history" element={<ReportsHistory />} />
      <Route path="*" element={<Navigate to="/hazard-reports" replace />} />
    </Routes>
  );
}
```

```ts
// hooks/useAutoRefresh.ts
import { useEffect, useRef } from 'react';

/** Calls `reload` on a timer while the officer is online and the tab is visible (new reports show up by themselves). */
export function useAutoRefresh(reload: () => void, enabled: boolean, intervalMs = 15_000): void {
  const latest = useRef(reload);
  latest.current = reload;
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') latest.current();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [enabled, intervalMs]);
}
```

- `AsyncState<T>` props: `{ resource: CachedResource<T>; isEmpty?: (data: T) => boolean; emptyMessage: string;
children: (data: T) => ReactNode }`. Renders `<Spinner/>` + `common.loading` while `loading && !data`; an
  `<Alert tone="danger">` with `translateError(t, error)` and a `common.retry` button calling `reload` on `error`;
  `emptyMessage` when `isEmpty(data)`; otherwise `children(data)` followed by `<LastSynced syncedAt={…}/>`.
- `BandBadge` shows `t('hazardReports.band.X')` with a tone class; `StatusChip` takes `{ label, tone }`;
  `ScoreBar` is a `role="meter"` with `aria-valuenow/min/max` and `aria-label={t('hazardReports.cluster.score', …)}`;
  `StatCard` is `{ label, value }`.

**Tests:** `AsyncState` four states + retry calls `reload` · `ScoreBar` exposes `meter` with value 87 · `BandBadge`
text for each band · `useAutoRefresh` with `vi.useFakeTimers()`: fires after 15 s when enabled, not when disabled, not
when `document.visibilityState` is `hidden`, stops after unmount · routes: a duty officer at `/hazard-reports` sees the
dashboard heading; a citizen sees "My reports"; `/hazard-reports/nope` redirects to the dashboard (all with MSW
handlers returning `[]`).

- [x] Tests → fail → implement (screens can be one-line stubs for now) → pass → commit `feat(uc3-web): route shell and shared components`.

---

## Phase W2 – Dashboard (step 11, wireframe 02)

### Task W2.1: `OfficerDashboard`

**Files:** Create `screens/OfficerDashboard.tsx` · Test `__tests__/OfficerDashboard.test.tsx`

**Behaviour**

- Data: `useCachedResource({ module: 'hazard-reports', name: 'queue', load: () => client.queue() })` where
  `client = useMemo(() => hazardReportsApi(api), [api])`.
- `useAutoRefresh(resource.reload, online)`; a visible _Refresh_ button too.
- Heading `hazardReports.dashboard.title`, caption `hazardReports.dashboard.caption` (the corrected caption, H5), a
  link to _Reports history_.
- Four stat cards from `dashboardStats(data)`.
- A table in server order (already score-descending). Columns: area (`districtLabel(t, language, district)` from
  `@/shared/i18n/I18nProvider`, so it follows the chosen language), dominant hazard, `reportsCount`, score + `BandBadge`, last report (`formatTime`), status chip
  (only _Escalation recommended_ is highlighted). The area cell is a `<Link to={`clusters/${id}`}>`; the whole table has
  a `<caption className="sr-only">`.
- States through `AsyncState` (empty text `hazardReports.dashboard.empty`).

**Tests** (signed in as `makeMe({ role: 'DUTY_OFFICER' })`; MSW `GET /api/hazard-reports/clusters`):

| Test                                                                      | Expect                                                                             |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `UC-3 step 11: lists clusters highest priority first with score and band` | rows in server order; first row "Kalutara", "87", "High priority"                  |
| `shows the four stat cards`                                               | values from a two-cluster fixture                                                  |
| `flags a cluster recommended for escalation`                              | chip text present                                                                  |
| `links each cluster to its detail screen`                                 | `href` ends `/hazard-reports/clusters/c1`                                          |
| `shows the empty state`                                                   | `[]`                                                                               |
| `shows an error with retry, and retry loads the list`                     | first 500, then 200 after clicking _Try again_                                     |
| `refresh button reloads`                                                  | second handler returns a new cluster                                               |
| `reloads by itself every 15 seconds while online`                         | fake timers; third cluster appears                                                 |
| `offline: shows the saved list and when it was synced`                    | load once, `setBrowserOnline(false)`, re-render → rows still there + "Last synced" |

- [x] Tests → fail → implement → pass → commit `feat(uc3-web): officer dashboard (step 11)`.

---

## Phase W3 – Cluster and escalation (steps 11–12, 15–16; wireframes 01, 05)

### Task W3.1: `ReportsMap` and `ReportCard`

**Files:** Create `components/ReportsMap.tsx`, `components/ReportCard.tsx` · Test `__tests__/ReportsMap.test.tsx`,
`__tests__/ReportCard.test.tsx`

- `ReportsMap` props `{ centre: { lat; lng }; pins: { id; lat; lng; label }[]; ariaLabel: string }`. Renders
  `<MapContainer center zoom={14} aria-label>` + `<TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
attribution="© OpenStreetMap contributors"/>` + one `<Marker>` with a `<Popup>{label}</Popup>` per pin. Import
  `leaflet/dist/leaflet.css` here and fix Leaflet's default marker icon paths for Vite (import the three PNGs from
  `leaflet/dist/images/` and pass them to `L.Icon.Default.mergeOptions`). Check `react-leaflet`'s installed version
  (5.x) for the component names before writing.
- In tests, `vi.mock('react-leaflet', …)` replacing `MapContainer`, `TileLayer`, `Marker`, `Popup` with plain `div`s
  that render their children, and `vi.mock('leaflet/dist/leaflet.css', () => ({}))`; assert one marker per pin and the
  accessible label. This keeps jsdom away from Leaflet's canvas code while still executing every line of the component.
- `ReportCard` props `{ report: Report }`: thumbnail (`<img src={report.photoUrl} alt=…>` or the "no photo" text),
  hazard label, description, capture time, reporter type, a status chip, a "sent later from offline" note when
  `syncedFromOffline`, rejection reason when rejected, and a link `../reports/${id}` labelled
  `hazardReports.cluster.openReport`.

**Tests:** card with photo / without photo; offline note only when flagged; rejection reason only when rejected; link
target.

- [x] Tests → fail → implement → pass → commit `feat(uc3-web): cluster map and report card`.

### Task W3.2: `ClusterDetail` with escalation confirmation

**Files:** Create `components/ConfirmActionDialog.tsx`, `screens/ClusterDetail.tsx` ·
Tests `__tests__/ConfirmActionDialog.test.tsx`, `__tests__/ClusterDetail.test.tsx`

`ConfirmActionDialog` props: `{ open; title; body; confirmLabel; onConfirm: () => Promise<void>; onClose: () => void }`.
Internally keeps `busy` and `error`; _Cancel_ closes; _Confirm_ awaits `onConfirm`, closes on success, and on failure
stays open showing `<Alert tone="danger">{translateError(t, error)}</Alert>`. Uses the shared `Dialog` with
`dismissible={!busy}` so a running request cannot be abandoned by pressing Esc.

**`ClusterDetail` behaviour**

- `const { clusterId } = useParams()`; data via `useCachedResource({ module: 'hazard-reports', name:
`cluster:${clusterId}`, load: () => client.cluster(clusterId) })`; `useAutoRefresh(reload, online)`.
- Header: area + dominant hazard, `ScoreBar`, `BandBadge`, counts (`reportsCount`), status chip.
- `ReportsMap` centred on `centroid` with one pin per report.
- A list of `ReportCard`s: pending first, then verified, then rejected.
- **Escalate button** driven by `escalationState(cluster, online)`:
  - `READY` → enabled, opens the confirmation dialog.
  - `BLOCKED` → `disabled` and `aria-describedby` pointing at a visible list of the unmet requirements
    (`hazardReports.escalate.needs.*`, with `{verified}` = `counts.verified`, `{required}` =
    `escalation.requiredVerified`). A `title` tooltip alone is invisible to keyboard and touch users, so the reasons
    are rendered as text.
  - `OFFLINE` → disabled with `hazardReports.escalate.offline`.
  - `DONE` → no button; `<Alert tone="success">{t('hazardReports.escalate.done')}</Alert>` (this replaces original
    wireframe 05's "warning is active").
- Confirm → `client.escalate(id)` → on success `reload()`; the `DONE` state then shows. On `409
ESCALATION_NOT_ALLOWED` the dialog shows the translated error and `reload()` runs so the screen matches the server.

**Tests:**

| Test                                                                                                                                                   | Expect                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `UC-3 steps 11–12: shows score, band, counts and one card per report`                                                                                  |                                                                                                             |
| `orders reports pending, verified, rejected`                                                                                                           |                                                                                                             |
| `UC-3 step 15: Escalate is disabled and lists what is missing`                                                                                         | fixture `unmet: ['VERIFIED_REPORTS']`, counts.verified 1 → button disabled, text "1 of 3 reports verified." |
| `lists every unmet requirement`                                                                                                                        | all three                                                                                                   |
| `UC-3 step 16: confirming escalation sends the request and shows "Sent to the DMC Officer for approval"`                                               | POST handler hit once; then GET returns status ESCALATED                                                    |
| `cancelling the confirmation sends nothing`                                                                                                            | no POST                                                                                                     |
| `a refused escalation shows the reason and refreshes`                                                                                                  | 409 → error text in dialog                                                                                  |
| `an escalated cluster shows the success state and no button`                                                                                           |                                                                                                             |
| `offline: Escalate is disabled with the reason`                                                                                                        | recommended cluster + `setBrowserOnline(false)`                                                             |
| `unknown cluster shows the error state`                                                                                                                | 404 `CLUSTER_NOT_FOUND`                                                                                     |
| `ConfirmActionDialog`: confirm calls the action once, shows busy, closes on success; failure keeps it open with the message; Esc is ignored while busy |                                                                                                             |

- [x] Tests → fail → implement → pass → commit `feat(uc3-web): cluster detail and escalation confirmation (steps 15–16, H4)`.

---

## Phase W4 – Report verification (steps 12–14, A2; wireframe 04 + new reject dialog)

### Task W4.1: `RejectDialog`

**Files:** Create `components/RejectDialog.tsx` · Test `__tests__/RejectDialog.test.tsx`

Props `{ open; onReject: (reason: string) => Promise<void>; onClose: () => void }`. A `<textarea>` labelled
`hazardReports.reject.reasonLabel` with hint `reasonHint`, `maxLength={500}`, `required`. _Reject report_ (`danger`
variant) is disabled until the trimmed text is non-empty; submitting awaits `onReject(reason.trim())`; errors are shown
inside the dialog (a server `VALIDATION_FAILED` with field `reason` shows `error.REASON_REQUIRED`). The text is
cleared when the dialog closes.

**Tests:** confirm disabled while empty or whitespace · enabled with text; submits the trimmed reason · busy state
blocks a double submit · failure stays open with the message · cancel calls `onClose` and clears the text.

- [x] Tests → fail → implement → pass → commit `feat(uc3-web): reject dialog with mandatory reason (H8, H10)`.

### Task W4.2: `ReportDetail`

**Files:** Create `screens/ReportDetail.tsx` · Test `__tests__/ReportDetail.test.tsx`

**Behaviour**

- Data: `client.report(reportId)` through `useCachedResource` (`name: `report:${reportId}``).
- Shows: photo (or "no photo" text), `ReportsMap` with the single pin, hazard type, description, reporter type,
  location source line (`location.GPS` with `{metres}` or `location.MANUAL`), captured time, and – when
  `syncedFromOffline` – the note with both captured and received times (this is what makes A1 visible to the officer).
- _Back to the cluster_ link → `../clusters/${report.clusterId}`.
- `status === 'PENDING'` → two buttons: _Verify report_ (opens `ConfirmActionDialog`) and _Reject report_ (opens
  `RejectDialog`). Both disabled offline with `hazardReports.review.offline`.
- After a successful verify/reject the response `{ report, cluster }` is kept in local state: show
  `verify.done` / `reject.done` with the new score and band; if `cluster.status === 'ESCALATION_RECOMMENDED'` also show
  `review.nowRecommended` with a link to the cluster; if `cluster.status === 'CLOSED'` show `reject.clusterClosed`.
  Then `reload()` so the buttons disappear.
- Reviewed reports show their status chip, and the rejection reason when rejected; no buttons.
- `409 REPORT_ALREADY_REVIEWED` (another officer was faster): message in the dialog, then `reload()`.

**Tests:**

| Test                                                                                         | Expect                                                                          |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `UC-3 step 12: shows photo, map pin, description and capture details`                        |                                                                                 |
| `shows "pinned on the map" for a manual location and accuracy for GPS`                       | two fixtures                                                                    |
| `UC-3 A1: a report synced from offline shows captured and received times`                    |                                                                                 |
| `UC-3 steps 13–14: verifying shows the new cluster score`                                    | POST verify → "Cluster score is now 87 (High priority)"                         |
| `UC-3 step 15: the verification that completes the rule says the cluster is now recommended` | response cluster status ESCALATION_RECOMMENDED → link to cluster                |
| `UC-3 A2: rejecting needs a reason and shows the lowered score`                              | POST body `{ reason: 'Photo shows a different place' }` asserted in the handler |
| `UC-3 A2/H8: rejecting the last report says the cluster was closed`                          | response cluster status CLOSED                                                  |
| `a report someone else already reviewed shows the conflict and refreshes`                    | 409                                                                             |
| `a reviewed report has no action buttons and shows its rejection reason`                     |                                                                                 |
| `offline: both actions are disabled with the reason`                                         |                                                                                 |
| `a report without a photo says so`                                                           |                                                                                 |
| `unknown report shows the error state`                                                       | 404                                                                             |

- [x] Tests → fail → implement → pass → commit `feat(uc3-web): report verification screen (steps 12–14, A2)`.

---

## Phase W5 – History and the citizen view

### Task W5.1: `ReportsHistory` (wireframe 06)

**Files:** Create `screens/ReportsHistory.tsx` · Test `__tests__/ReportsHistory.test.tsx`

Status `SelectField` (All / Pending review / Verified / Rejected) and a search `TextField` inside a `<form
role="search">` submitted with a button (no per-keystroke requests). The applied filter is state
`{ status?, q? }`; data via `useCachedResource({ name: `history:${status ?? 'ALL'}:${q ?? ''}`, load: () =>
client.history(filter) })`. Table: captured time, hazard, description (truncated with the full text in `title`),
reporter type, status chip, and for rejected rows `history.rejectedBecause`. Each row links to `../reports/${id}`.

**Tests:** lists reports newest first · choosing _Rejected_ requests `?status=REJECTED` and shows reasons ·
searching "bridge" requests `?q=bridge` · empty state · error + retry · row link target.

- [x] Tests → fail → implement → pass → commit `feat(uc3-web): reports history`.

### Task W5.2: `CitizenReports` (D13)

**Files:** Create `screens/CitizenReports.tsx` · Test `__tests__/CitizenReports.test.tsx`

`client.mine()` through `useCachedResource({ name: 'mine' })`. An `<Alert tone="info">` with
`hazardReports.mine.useMobileApp`, then a list: hazard, description, captured time, status chip, rejection reason when
rejected. Empty state `mine.empty`. No actions.

**Tests** (`signIn(makeCitizen())`): shows the mobile-app notice and the citizen's reports with statuses · a rejected
report shows its reason · empty state · error + retry.

- [x] Tests → fail → implement → pass → commit `feat(uc3-web): read-only my reports for citizens`.

### Task W5.3: Gates and manual check

- [ ] From the repo root: `npm run lint && npm run typecheck && npm test` → green, with
      `src/features/hazard-reports/**` at 100%.
      W5: root lint passes (one existing UC4 warning); frontend typecheck/build and all 930 frontend tests pass.
      Root typecheck and seven shared backend password-hashing tests remain blocked by the known missing optional
      `argon2` dependency. UC3 web and backend coverage gates pass at 100%; shared code was not changed.
- [x] `npm run seed` then `npm run dev`; sign in as the duty officer and walk demo steps 6–7: open Kalutara (87),
      reject one report with a reason (82), verify three (→ _Escalation recommended_), confirm escalation, then sign in as
      the DMC officer and check Pending Approvals (UC1's screen; if UC1 is not merged yet, check the API log line for the
      published event instead).
- [x] Sign in as a demo citizen → the read-only list.
- [x] Capture screen/state evidence: 21 screenshots, including mobile, empty/error and offline views, in
      `docs/plans/uc3/evidence/w5/`. The two citizen empty/error captures use explicitly marked browser fixtures.
- [ ] Compare against the owner's final wireframes (not present in this checkout).
- [x] Update the status table in `IMPLEMENTATION_PLAN.md` (W1–W5 DONE).

The walkthrough used an isolated `safezone_uc3_w5` database and local ports 4190/5190, preserving existing dev data.
Playwright drove the real UI because the in-app browser connection timed out. UC1's new draft was confirmed as
`PENDING_APPROVAL`, submitted by `usr-duty-1`, with `sourceClusterId: seed-cluster-kalutara`.
See [W5 verification evidence](evidence/w5/README.md) for results and limitations.

---

## Traceability

| Change                                                               | Web artefact                                                  | Proved by                                                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| H4 escalation is confirmed by a human, warning is pending not active | `ClusterDetail`, `ConfirmActionDialog`, `model/escalation.ts` | "confirming escalation sends the request…", "Escalate is disabled and lists what is missing" |
| H5 corrected dashboard caption, dominant hazard type                 | `OfficerDashboard`                                            | "lists clusters highest priority first…"                                                     |
| H8 mandatory rejection reason, closed cluster                        | `RejectDialog`, `ReportDetail`                                | "rejecting needs a reason…", "…cluster was closed"                                           |
| H10 reject dialog, visibility of status                              | `RejectDialog`, `AsyncState`, `CitizenReports`                | dialog tests, state tests                                                                    |
| A1 visible to the officer                                            | `ReportDetail`, `ReportCard`                                  | "a report synced from offline shows captured and received times"                             |
