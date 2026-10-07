# Plan A – UC3 Backend Module (`backend/src/modules/hazard-reports/`)

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` or
> `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax. Read `IMPLEMENTATION_PLAN.md` (decisions D1–D14,
> REST contract) and `docs/building-a-use-case.md` first.

**Goal:** Accept hazard reports idempotently, detect duplicates, cluster and score them, let a Duty Officer verify,
reject and escalate, and publish `ClusterEscalationRequested`.

**Architecture:** `domain` (pure rules) → `application` (services + ports) → `infrastructure` (Mongoose, disk) and `api`
(Express). Only `composition.ts` builds concrete classes. Nothing outside this folder is edited except
`backend/package.json` (multer) and the three i18n files (Plan B).

## Global constraints

- Constants (one injected `ClusteringConfig`): radius 2 km · window 6 h · duplicate 200 m / 30 min · photo ≤ 5 MB,
  `image/jpeg | image/png | image/webp` · description ≤ 500 chars · score = round(100 × (0.45·density + 0.30·severity +
  0.25·recency)) · bands ≥75 High, 50–74 Elevated, 30–49 Moderate, <30 Low · escalation: High band AND ≥3 verified AND a
  FLOOD/LANDSLIDE report present (D6).
- ESLint (enforced in CI): no `new Date()` / `Date.now()` / `Math.random()` in `domain/` and `application/` (inject
  `Clock`, `IdGenerator`); no `express` / `mongoose` imports there; no imports from other modules; no `any`; no
  `console`; no `todo` comments; function ≤ 40 lines, complexity ≤ 8, **≤ 5 parameters** (use a `deps` object).
- Import shared errors from `@shared/errors/DomainError` inside `domain/`/`application/` (the `@shared/errors` barrel
  re-exports Express code).
- Coverage gate **100%** on every file here except `composition.ts`, `seed/**`, `testing/**`, `__tests__/**`.
- JSDoc on every public service/domain method naming the scenario steps: `/** UC-3 steps 8–10; A3. */`.
- Test names start with the flow: `'UC-3 E3: …'`. Arrange / Act / Assert, one behaviour per test, assert state not mocks.
- TDD loop for every task: write the test → `npx jest <file> --coverage=false` fails for the expected reason → implement
  → passes → commit. Commit after each task with your own account.

## File map

```
modules/hazard-reports/
├─ domain/
│  ├─ types.ts               report/cluster enums and small value types
│  ├─ ClusteringConfig.ts    the constants object
│  ├─ PriorityScore.ts       value object {value, band}
│  ├─ PriorityScorer.ts      interface + WeightedPriorityScorer            (Strategy)
│  ├─ EscalationPolicy.ts    rule + severity/hazard mapping                (Policy)
│  ├─ PhotoValidator.ts      type / size / signature checks (E2)
│  ├─ DuplicateDetector.ts   same reporter, 200 m, 30 min (E3)
│  ├─ HazardReport.ts        entity: verify / reject / amend
│  └─ ReportCluster.ts       entity: canAccept / add / rescore / recommend / markEscalated
├─ application/
│  ├─ ports.ts               repositories, PhotoStorage, DistrictResolver  (Repository)
│  ├─ ClusteringService.ts   steps 8–10, A3
│  ├─ ReportSubmissionService.ts   steps 7–10, A1, E2, E3, H7
│  └─ ReportReviewService.ts       steps 11–16, A2
├─ infrastructure/
│  ├─ models.ts              Mongoose schemas
│  ├─ MongoHazardReportRepository.ts
│  ├─ MongoReportClusterRepository.ts
│  └─ DiskPhotoStorage.ts
├─ api/
│  ├─ schemas.ts             Zod
│  ├─ dto.ts                 entity → JSON
│  ├─ photoUpload.ts         multer wrapper (maps MulterError → INVALID_PHOTO)
│  └─ hazard-reports.http.ts router
├─ testing/inMemory.ts       in-memory repositories, FakePhotoStorage, builders (not measured)
├─ composition.ts            wiring only
├─ seed/index.ts
└─ __tests__/                one file per class
```

---

## Phase B1 – Domain

### Task B1.1: Types and config

**Files:** Create `domain/types.ts`, `domain/ClusteringConfig.ts` (no tests: declarations only; they are covered through
their users).

```ts
// domain/types.ts
import type { GeoPoint } from '@shared/geo/GeoPoint';

export const REPORT_HAZARD_TYPES = ['FLOOD', 'LANDSLIDE', 'ROAD_BLOCKAGE', 'OTHER'] as const;
export type ReportHazardType = (typeof REPORT_HAZARD_TYPES)[number];
/** Most severe first: breaks ties when choosing a cluster's dominant hazard type. */
export const HAZARD_SEVERITY_ORDER: readonly ReportHazardType[] = [
  'LANDSLIDE',
  'FLOOD',
  'ROAD_BLOCKAGE',
  'OTHER',
];

export type ReporterType = 'CITIZEN' | 'VOLUNTEER';
export const REPORT_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export const CLUSTER_STATUSES = ['OPEN', 'ESCALATION_RECOMMENDED', 'ESCALATED', 'CLOSED'] as const;
export type ClusterStatus = (typeof CLUSTER_STATUSES)[number];
export type Band = 'HIGH' | 'ELEVATED' | 'MODERATE' | 'LOW';

export interface ReportLocation extends GeoPoint {
  source: 'GPS' | 'MANUAL';
  accuracyM?: number;
}
export interface ReportPhoto {
  url: string;
  mime: string;
  bytes: number;
}
/** A photo as it arrives, before it is stored. */
export interface UploadedPhoto {
  content: Uint8Array;
  mimeType: string;
}
```

```ts
// domain/ClusteringConfig.ts
import type { ReportHazardType, ReporterType } from './types';

/** Every tunable rule of UC-3 in one injected object (report change H5). */
export interface ClusteringConfig {
  clusterRadiusKm: number;
  clusterWindowHours: number;
  duplicateRadiusM: number;
  duplicateWindowMin: number;
  photoMaxBytes: number;
  photoMimeTypes: readonly string[];
  descriptionMaxChars: number;
  /** Weighted report count at which density reaches 1. */
  densityFullAt: number;
  scoreWeights: { density: number; severity: number; recency: number };
  reporterWeights: Record<ReporterType, number>;
  hazardWeights: Record<ReportHazardType, number>;
  bands: { high: number; elevated: number; moderate: number };
  escalationMinVerified: number;
  /** A phone clock may run a little ahead of the server. */
  capturedAtSkewMs: number;
}

export const DEFAULT_CLUSTERING_CONFIG: ClusteringConfig = {
  clusterRadiusKm: 2,
  clusterWindowHours: 6,
  duplicateRadiusM: 200,
  duplicateWindowMin: 30,
  photoMaxBytes: 5 * 1024 * 1024,
  photoMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  descriptionMaxChars: 500,
  densityFullAt: 10,
  scoreWeights: { density: 0.45, severity: 0.3, recency: 0.25 },
  reporterWeights: { CITIZEN: 1, VOLUNTEER: 1.5 },
  hazardWeights: { LANDSLIDE: 1, FLOOD: 0.8, ROAD_BLOCKAGE: 0.5, OTHER: 0.3 },
  bands: { high: 75, elevated: 50, moderate: 30 },
  escalationMinVerified: 3,
  capturedAtSkewMs: 5 * 60_000,
};
```

- [ ] Create both files. `cd backend && npx tsc --noEmit` passes.
- [ ] Commit: `feat(uc3): domain types and clustering config`.

### Task B1.2: `PriorityScore` + `WeightedPriorityScorer` (Strategy)

**Files:** Create `domain/PriorityScore.ts`, `domain/PriorityScorer.ts` · Test `__tests__/PriorityScorer.test.ts`

**Produces:** `PriorityScore.of(value, bands)`, `interface PriorityScorer { score(reports, now): PriorityScore }`,
`interface ScorableReport { reporterType; hazardType; capturedAt: Date; status }`.

- [ ] **Step 1: failing test**

```ts
// __tests__/PriorityScorer.test.ts
import { DEFAULT_CLUSTERING_CONFIG as config } from '../domain/ClusteringConfig';
import { PriorityScore } from '../domain/PriorityScore';
import { WeightedPriorityScorer, type ScorableReport } from '../domain/PriorityScorer';

const NOW = new Date('2026-10-07T09:00:00.000Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
const report = (over: Partial<ScorableReport> = {}): ScorableReport => ({
  reporterType: 'CITIZEN',
  hazardType: 'FLOOD',
  capturedAt: NOW,
  status: 'PENDING',
  ...over,
});
const many = (n: number, over: Partial<ScorableReport> = {}) =>
  Array.from({ length: n }, () => report(over));
const scorer = new WeightedPriorityScorer(config);

describe('WeightedPriorityScorer.score', () => {
  it('UC-3 step 10: the report worked example (8 citizens + 4 volunteers, flood, newest 30 min ago) scores 92', () => {
    const reports = [
      ...many(8, { capturedAt: minutesAgo(30) }),
      ...many(4, { reporterType: 'VOLUNTEER', capturedAt: minutesAgo(90) }),
    ];
    expect(scorer.score(reports, NOW)).toEqual({ value: 92, band: 'HIGH' });
  });

  it('UC-3 A3: a single citizen "other" report just now scores 39 (Moderate)', () => {
    expect(scorer.score([report({ hazardType: 'OTHER' })], NOW)).toEqual({
      value: 39,
      band: 'MODERATE',
    });
  });

  it('weighs a volunteer 1.5 times a citizen', () => {
    const old = { hazardType: 'OTHER', capturedAt: minutesAgo(360) } as const;
    expect(scorer.score(many(4, old), NOW).value).toBe(27); // 100 × (0.45 × 0.4 + 0.09)
    expect(scorer.score(many(4, { ...old, reporterType: 'VOLUNTEER' }), NOW).value).toBe(36); // 0.45 × 0.6 + 0.09
  });

  it('rounds an exact half up despite floating-point noise (single flood report just now = 53.5 → 54)', () => {
    expect(scorer.score([report()], NOW)).toEqual({ value: 54, band: 'ELEVATED' });
  });

  it('UC-3 A2: ignores rejected reports', () => {
    const reports = [report(), report({ status: 'REJECTED', hazardType: 'LANDSLIDE' })];
    expect(scorer.score(reports, NOW)).toEqual(scorer.score([report()], NOW));
  });

  it('caps density at 1', () => {
    expect(scorer.score(many(10), NOW).value).toBe(scorer.score(many(40), NOW).value);
  });

  it.each([[360], [900]])('recency is 0 at and beyond the window (%i min)', (age) => {
    expect(scorer.score(many(10, { capturedAt: minutesAgo(age) }), NOW).value).toBe(69); // 45 + 24 + 0
  });

  it('a report stamped slightly in the future does not push recency above 1', () => {
    expect(scorer.score(many(10, { capturedAt: minutesAgo(-2) }), NOW).value).toBe(94);
  });

  it('an empty or fully rejected set scores 0 (Low)', () => {
    expect(scorer.score([], NOW)).toEqual({ value: 0, band: 'LOW' });
    expect(scorer.score([report({ status: 'REJECTED' })], NOW)).toEqual({ value: 0, band: 'LOW' });
  });
});

describe('PriorityScore.of', () => {
  it.each([
    [29, 'LOW'],
    [30, 'MODERATE'],
    [49, 'MODERATE'],
    [50, 'ELEVATED'],
    [74, 'ELEVATED'],
    [75, 'HIGH'],
  ] as const)('band boundary: %i is %s', (value, band) => {
    expect(PriorityScore.of(value, config.bands).band).toBe(band);
  });

  it('clamps to 0–100 and rounds', () => {
    expect(PriorityScore.of(-4, config.bands).value).toBe(0);
    expect(PriorityScore.of(140.2, config.bands).value).toBe(100);
  });
});
```

- [ ] **Step 2:** run `npx jest src/modules/hazard-reports/__tests__/PriorityScorer.test.ts --coverage=false` → fails
      (modules not found).
- [ ] **Step 3: implement**

```ts
// domain/PriorityScore.ts
import type { ClusteringConfig } from './ClusteringConfig';
import type { Band } from './types';

function bandFor(value: number, bands: ClusteringConfig['bands']): Band {
  if (value >= bands.high) return 'HIGH';
  if (value >= bands.elevated) return 'ELEVATED';
  if (value >= bands.moderate) return 'MODERATE';
  return 'LOW';
}

/** Value object: a 0–100 priority and the band it falls in. */
export class PriorityScore {
  private constructor(
    readonly value: number,
    readonly band: Band,
  ) {}

  static of(raw: number, bands: ClusteringConfig['bands']): PriorityScore {
    const value = Math.max(0, Math.min(100, Math.round(raw)));
    return new PriorityScore(value, bandFor(value, bands));
  }
}
```

```ts
// domain/PriorityScorer.ts
import type { ClusteringConfig } from './ClusteringConfig';
import { PriorityScore } from './PriorityScore';
import type { ReportHazardType, ReportStatus, ReporterType } from './types';

export interface ScorableReport {
  reporterType: ReporterType;
  hazardType: ReportHazardType;
  capturedAt: Date;
  status: ReportStatus;
}

/** Strategy: how a cluster's priority is computed. Swappable without touching clustering. */
export interface PriorityScorer {
  score(reports: readonly ScorableReport[], now: Date): PriorityScore;
}

const HOUR_MS = 3_600_000;

export class WeightedPriorityScorer implements PriorityScorer {
  constructor(private readonly config: ClusteringConfig) {}

  /** UC-3 steps 10 and 14; A2. Rejected reports never count. */
  score(reports: readonly ScorableReport[], now: Date): PriorityScore {
    const active = reports.filter((report) => report.status !== 'REJECTED');
    if (active.length === 0) return PriorityScore.of(0, this.config.bands);
    const { density, severity, recency } = this.config.scoreWeights;
    const raw =
      density * this.density(active) +
      severity * this.severity(active) +
      recency * this.recency(active, now);
    // Binary floating point turns an exact 53.5 into 53.49999999999999; settle it before rounding.
    return PriorityScore.of(Number((100 * raw).toFixed(6)), this.config.bands);
  }

  private density(active: readonly ScorableReport[]): number {
    const weighted = active.reduce(
      (sum, r) => sum + this.config.reporterWeights[r.reporterType],
      0,
    );
    return Math.min(1, weighted / this.config.densityFullAt);
  }

  private severity(active: readonly ScorableReport[]): number {
    return Math.max(...active.map((r) => this.config.hazardWeights[r.hazardType]));
  }

  private recency(active: readonly ScorableReport[], now: Date): number {
    const newest = Math.max(...active.map((r) => r.capturedAt.getTime()));
    const hours = Math.max(0, (now.getTime() - newest) / HOUR_MS);
    return Math.max(0, 1 - hours / this.config.clusterWindowHours);
  }
}
```

- [ ] **Step 4:** tests pass. **Step 5:** commit `feat(uc3): weighted priority scorer (H5)`.

### Task B1.3: `EscalationPolicy`

**Files:** Create `domain/EscalationPolicy.ts` · Test `__tests__/EscalationPolicy.test.ts`

```ts
// domain/EscalationPolicy.ts
import type { HazardType, Severity } from '@shared/contracts/enums';
import type { ClusteringConfig } from './ClusteringConfig';
import type { Band, ReportHazardType, ReportStatus } from './types';

export type EscalationRequirement = 'HIGH_BAND' | 'VERIFIED_REPORTS' | 'WARNABLE_HAZARD';

export interface EscalationInput {
  band: Band;
  dominantHazardType: ReportHazardType;
  reports: readonly { status: ReportStatus; hazardType: ReportHazardType }[];
}

export interface EscalationDecision {
  recommended: boolean;
  /** What is still missing: drives the disabled-button tooltip. */
  unmet: EscalationRequirement[];
  verifiedCount: number;
  requiredVerified: number;
  /** The hazard UC-1 would warn about; undefined when the cluster holds no flood or landslide report. */
  hazardType?: HazardType;
  proposedSeverity?: Severity;
}

const isWarnable = (type: ReportHazardType): type is 'FLOOD' | 'LANDSLIDE' =>
  type === 'FLOOD' || type === 'LANDSLIDE';

/** The dominant type when UC-1 can issue it, else the most severe flood/landslide report present. */
function warningHazardType({
  dominantHazardType,
  reports,
}: EscalationInput): HazardType | undefined {
  if (isWarnable(dominantHazardType)) return dominantHazardType;
  const active = reports.filter((report) => report.status !== 'REJECTED');
  if (active.some((report) => report.hazardType === 'LANDSLIDE')) return 'LANDSLIDE';
  return active.some((report) => report.hazardType === 'FLOOD') ? 'FLOOD' : undefined;
}

/** Report §4: High band with a dominant landslide/flood proposes HIGH, anything else MEDIUM. */
export const severityFor = (band: Band, dominant: ReportHazardType): Severity =>
  band === 'HIGH' && isWarnable(dominant) ? 'HIGH' : 'MEDIUM';

/** Policy: when a cluster may be escalated, and what the request to UC-1 says (H4, H5, H11). */
export class EscalationPolicy {
  constructor(private readonly config: Pick<ClusteringConfig, 'escalationMinVerified'>) {}

  /** UC-3 step 15. */
  evaluate(input: EscalationInput): EscalationDecision {
    const verifiedCount = input.reports.filter((report) => report.status === 'VERIFIED').length;
    const hazardType = warningHazardType(input);
    const unmet: EscalationRequirement[] = [];
    if (input.band !== 'HIGH') unmet.push('HIGH_BAND');
    if (verifiedCount < this.config.escalationMinVerified) unmet.push('VERIFIED_REPORTS');
    if (!hazardType) unmet.push('WARNABLE_HAZARD');
    return {
      recommended: unmet.length === 0,
      unmet,
      verifiedCount,
      requiredVerified: this.config.escalationMinVerified,
      hazardType,
      proposedSeverity: hazardType ? severityFor(input.band, input.dominantHazardType) : undefined,
    };
  }
}
```

**Tests (each one `it`):**

| Name                                                                                  | Input                                                                        | Expect                                                                              |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `UC-3 step 15: High band with 3 verified flood reports is recommended`                | HIGH, FLOOD, 3 VERIFIED + 2 PENDING flood                                    | `recommended: true`, `unmet: []`, `hazardType: 'FLOOD'`, `proposedSeverity: 'HIGH'` |
| `High with 2 verified is not recommended`                                             | HIGH, FLOOD, 2 VERIFIED                                                      | `unmet: ['VERIFIED_REPORTS']`, `verifiedCount: 2`, `requiredVerified: 3`            |
| `Elevated with 5 verified is not recommended`                                         | ELEVATED, FLOOD, 5 VERIFIED                                                  | `unmet: ['HIGH_BAND']`                                                              |
| `H11: road-blockage-only cluster is never recommended`                                | HIGH, ROAD_BLOCKAGE, 3 VERIFIED road blockage                                | `unmet: ['WARNABLE_HAZARD']`, `hazardType` and `proposedSeverity` undefined         |
| `H11: road blockage dominant but a landslide and a flood present → LANDSLIDE, MEDIUM` | HIGH, ROAD_BLOCKAGE, 3 VERIFIED road + 1 PENDING landslide + 1 PENDING flood | `recommended: true`, `hazardType: 'LANDSLIDE'`, `proposedSeverity: 'MEDIUM'`        |
| `road blockage dominant with only a flood present → FLOOD`                            | … + 1 PENDING flood                                                          | `hazardType: 'FLOOD'`                                                               |
| `a rejected flood report does not make the cluster warnable`                          | HIGH, OTHER, 3 VERIFIED other + 1 REJECTED flood                             | `unmet: ['WARNABLE_HAZARD']`                                                        |
| `lists every unmet requirement`                                                       | LOW, OTHER, none                                                             | `unmet: ['HIGH_BAND','VERIFIED_REPORTS','WARNABLE_HAZARD']`                         |
| `severityFor: HIGH+LANDSLIDE → HIGH; ELEVATED+FLOOD → MEDIUM`                         | direct                                                                       | as named                                                                            |

- [ ] Write the tests, see them fail, implement, pass, commit `feat(uc3): escalation policy (H4, H11)`.

### Task B1.4: `PhotoValidator` (E2)

**Files:** Create `domain/PhotoValidator.ts` · Test `__tests__/PhotoValidator.test.ts`

```ts
// domain/PhotoValidator.ts
import { ValidationError } from '@shared/errors/DomainError';
import type { ClusteringConfig } from './ClusteringConfig';
import type { UploadedPhoto } from './types';

export type PhotoProblem = 'PHOTO_EMPTY' | 'PHOTO_TOO_LARGE' | 'PHOTO_TYPE' | 'PHOTO_UNREADABLE';

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0): boolean =>
  signature.every((value, index) => bytes[offset + index] === value);

/** The first bytes every real file of that type begins with: a renamed text file fails here. */
const SIGNATURES: Record<string, (bytes: Uint8Array) => boolean> = {
  'image/jpeg': (bytes) => startsWith(bytes, [0xff, 0xd8, 0xff]),
  'image/png': (bytes) => startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]),
  'image/webp': (bytes) =>
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8),
};

export class PhotoValidator {
  constructor(
    private readonly config: Pick<ClusteringConfig, 'photoMaxBytes' | 'photoMimeTypes'>,
  ) {}

  /** UC-3 E2: why the photo cannot be accepted, or undefined when it can. */
  check(photo: UploadedPhoto): PhotoProblem | undefined {
    if (photo.content.byteLength === 0) return 'PHOTO_EMPTY';
    if (photo.content.byteLength > this.config.photoMaxBytes) return 'PHOTO_TOO_LARGE';
    if (!this.config.photoMimeTypes.includes(photo.mimeType)) return 'PHOTO_TYPE';
    const matches = SIGNATURES[photo.mimeType];
    return matches?.(photo.content) ? undefined : 'PHOTO_UNREADABLE';
  }

  assertValid(photo: UploadedPhoto): void {
    const problem = this.check(photo);
    if (problem) {
      throw new ValidationError(
        [{ field: 'photo', code: problem }],
        'The photo could not be accepted.',
        'INVALID_PHOTO',
      );
    }
  }
}
```

**Tests:** accepts a JPEG, PNG and WebP under the limit (build `Uint8Array` with the signature + padding) · exactly
5 MB accepted (boundary; `new Uint8Array(5 * 1024 * 1024)` with JPEG signature) · 5 MB + 1 → `PHOTO_TOO_LARGE` · zero
bytes → `PHOTO_EMPTY` · `image/gif` → `PHOTO_TYPE` · `image/png` with JPEG bytes → `PHOTO_UNREADABLE` · a configured
type with no signature entry (`photoMimeTypes: ['image/avif']`) → `PHOTO_UNREADABLE` (covers the `?.` branch) ·
`assertValid` throws `ValidationError` with `code 'INVALID_PHOTO'` and `fields [{ field: 'photo', code: 'PHOTO_TYPE' }]`
· `assertValid` returns for a valid photo.

- [ ] Tests → fail → implement → pass → commit `feat(uc3): photo validator (E2)`.

### Task B1.5: `HazardReport` entity

**Files:** Create `domain/HazardReport.ts` · Test `__tests__/HazardReport.test.ts`

```ts
// domain/HazardReport.ts
import { ConflictError, ValidationError } from '@shared/errors/DomainError';
import type {
  ReportHazardType,
  ReportLocation,
  ReportPhoto,
  ReportStatus,
  ReporterType,
} from './types';

export interface HazardReportState {
  id: string;
  clientReportId: string;
  reporterId: string;
  reporterType: ReporterType;
  hazardType: ReportHazardType;
  description: string;
  photo?: ReportPhoto;
  location: ReportLocation;
  capturedAt: Date;
  receivedAt: Date;
  syncedFromOffline: boolean;
  status: ReportStatus;
  reviewedBy?: string;
  reviewedAt?: Date;
  rejectionReason?: string;
  clusterId?: string;
}

export type NewHazardReport = Omit<
  HazardReportState,
  'status' | 'reviewedBy' | 'reviewedAt' | 'rejectionReason' | 'clusterId'
>;

export interface Amendment {
  description: string;
  photo?: ReportPhoto;
  capturedAt: Date;
}

export class HazardReport {
  private constructor(private state: HazardReportState) {}

  /** UC-3 step 7: every report starts Pending. */
  static submit(input: NewHazardReport): HazardReport {
    return new HazardReport({ ...input, status: 'PENDING' });
  }

  /** Rebuilds a stored report. */
  static restore(state: HazardReportState): HazardReport {
    return new HazardReport({ ...state });
  }

  get id(): string {
    return this.state.id;
  }
  get status(): ReportStatus {
    return this.state.status;
  }
  get clusterId(): string | undefined {
    return this.state.clusterId;
  }
  get reporterId(): string {
    return this.state.reporterId;
  }
  get location(): ReportLocation {
    return this.state.location;
  }
  get capturedAt(): Date {
    return this.state.capturedAt;
  }

  snapshot(): HazardReportState {
    return { ...this.state };
  }

  /** UC-3 steps 13–14. */
  verify(officerId: string, now: Date): void {
    this.assertPending();
    this.state = { ...this.state, status: 'VERIFIED', reviewedBy: officerId, reviewedAt: now };
  }

  /** UC-3 A2: a reason is mandatory (H8); the report is kept for audit. */
  reject(officerId: string, reason: string, now: Date): void {
    this.assertPending();
    const rejectionReason = reason.trim();
    if (!rejectionReason) throw new ValidationError([{ field: 'reason', code: 'REASON_REQUIRED' }]);
    this.state = {
      ...this.state,
      status: 'REJECTED',
      reviewedBy: officerId,
      reviewedAt: now,
      rejectionReason,
    };
  }

  /** UC-3 E3 "update existing": keeps the earliest capture time and the old photo unless a new one came. */
  amend(change: Amendment): void {
    this.assertPending();
    const capturedAt =
      change.capturedAt < this.state.capturedAt ? change.capturedAt : this.state.capturedAt;
    this.state = {
      ...this.state,
      description: change.description,
      photo: change.photo ?? this.state.photo,
      capturedAt,
    };
  }

  assignTo(clusterId: string): void {
    this.state = { ...this.state, clusterId };
  }

  private assertPending(): void {
    if (this.state.status !== 'PENDING') {
      throw new ConflictError('REPORT_ALREADY_REVIEWED', 'This report has already been reviewed.');
    }
  }
}
```

(Prettier will expand the one-line getters; that is fine.)

**Tests:** `submit` starts PENDING · `verify` sets status, reviewer, time · `verify` on VERIFIED and on REJECTED →
`REPORT_ALREADY_REVIEWED` · `reject` sets status, reviewer, time and the trimmed reason · `reject` with `'   '` →
`ValidationError` with field `reason` and status still PENDING · `reject` on a reviewed report → conflict · `amend`
replaces description, keeps the old photo when none given, replaces it when given, keeps the **earlier** `capturedAt`
(both orders) · `amend` on a verified report → conflict · `assignTo` sets `clusterId` · `restore` copies (mutating the
input object afterwards does not change the entity) · `snapshot` returns a copy.

- [ ] Tests → fail → implement → pass → commit `feat(uc3): HazardReport entity (A2, E3)`.

### Task B1.6: `DuplicateDetector` (E3)

**Files:** Create `domain/DuplicateDetector.ts` · Test `__tests__/DuplicateDetector.test.ts`

```ts
// domain/DuplicateDetector.ts
import { distanceKm, type GeoPoint } from '@shared/geo/GeoPoint';
import type { ClusteringConfig } from './ClusteringConfig';
import type { HazardReport } from './HazardReport';

export interface DuplicateCandidate {
  reporterId: string;
  location: GeoPoint;
  capturedAt: Date;
}

export class DuplicateDetector {
  constructor(
    private readonly config: Pick<ClusteringConfig, 'duplicateRadiusM' | 'duplicateWindowMin'>,
  ) {}

  /**
   * UC-3 E3: the same reporter's still-pending report within 200 m and 30 min, nearest in time first.
   * A reviewed report is never a duplicate target: the officer has already acted on it.
   */
  find(candidate: DuplicateCandidate, existing: readonly HazardReport[]): HazardReport | undefined {
    const gapMs = (report: HazardReport): number =>
      Math.abs(report.capturedAt.getTime() - candidate.capturedAt.getTime());
    return existing
      .filter((report) => report.reporterId === candidate.reporterId && report.status === 'PENDING')
      .filter(
        (report) =>
          distanceKm(report.location, candidate.location) * 1000 <= this.config.duplicateRadiusM,
      )
      .filter((report) => gapMs(report) <= this.config.duplicateWindowMin * 60_000)
      .sort((a, b) => gapMs(a) - gapMs(b))[0];
  }
}
```

**Tests** (helper: `north(point, metres)` = `{ lat: point.lat + metres / 111_195, lng: point.lng }`): same reporter,
50 m, 10 min → found · different reporter → undefined · 201 m → undefined · 199 m → found · 31 min later → undefined ·
exactly 30 min → found · 20 min **earlier** than the existing one (offline report arriving late) → found · existing is
VERIFIED → undefined · existing is REJECTED → undefined · two matches → the one closest in time · empty list → undefined.

- [ ] Tests → fail → implement → pass → commit `feat(uc3): duplicate detector (E3)`.

### Task B1.7: `ReportCluster` entity

**Files:** Create `domain/ReportCluster.ts` · Test `__tests__/ReportCluster.test.ts`

```ts
// domain/ReportCluster.ts
import type { District } from '@shared/contracts/enums';
import { ConflictError } from '@shared/errors/DomainError';
import { distanceKm, type GeoPoint } from '@shared/geo/GeoPoint';
import type { ClusteringConfig } from './ClusteringConfig';
import type { HazardReport, HazardReportState } from './HazardReport';
import type { PriorityScorer } from './PriorityScorer';
import {
  HAZARD_SEVERITY_ORDER,
  type Band,
  type ClusterStatus,
  type ReportHazardType,
} from './types';

export interface ClusterCounts {
  total: number;
  pending: number;
  verified: number;
  rejected: number;
}

export interface ReportClusterState {
  id: string;
  centroid: GeoPoint;
  district: District;
  reportIds: string[];
  dominantHazardType: ReportHazardType;
  priorityScore: number;
  band: Band;
  status: ClusterStatus;
  counts: ClusterCounts;
  firstReportedAt: Date;
  lastReportAt: Date;
  escalatedBy?: string;
  escalatedAt?: Date;
}

const HOUR_MS = 3_600_000;

function countByStatus(reports: readonly HazardReportState[]): ClusterCounts {
  const count = (status: HazardReportState['status']) =>
    reports.filter((r) => r.status === status).length;
  return {
    total: reports.length,
    pending: count('PENDING'),
    verified: count('VERIFIED'),
    rejected: count('REJECTED'),
  };
}

/** Most frequent type among active reports; the more severe type wins a tie. */
function dominantType(
  active: readonly HazardReportState[],
  fallback: ReportHazardType,
): ReportHazardType {
  const tally = (type: ReportHazardType) => active.filter((r) => r.hazardType === type).length;
  const ranked = [...HAZARD_SEVERITY_ORDER].sort((a, b) => tally(b) - tally(a));
  return active.length > 0 ? (ranked[0] as ReportHazardType) : fallback;
}

export class ReportCluster {
  private constructor(private state: ReportClusterState) {}

  /** UC-3 A3: a report with no matching cluster starts its own. */
  static open(id: string, first: HazardReport, district: District): ReportCluster {
    const report = first.snapshot();
    return new ReportCluster({
      id,
      centroid: { lat: report.location.lat, lng: report.location.lng },
      district,
      reportIds: [report.id],
      dominantHazardType: report.hazardType,
      priorityScore: 0,
      band: 'LOW',
      status: 'OPEN',
      counts: { total: 1, pending: 1, verified: 0, rejected: 0 },
      firstReportedAt: report.capturedAt,
      lastReportAt: report.capturedAt,
    });
  }

  static restore(state: ReportClusterState): ReportCluster {
    return new ReportCluster({ ...state, reportIds: [...state.reportIds] });
  }

  get id(): string {
    return this.state.id;
  }
  get status(): ClusterStatus {
    return this.state.status;
  }

  snapshot(): ReportClusterState {
    return { ...this.state, reportIds: [...this.state.reportIds] };
  }

  distanceKmTo(point: GeoPoint): number {
    return distanceKm(this.state.centroid, point);
  }

  /** UC-3 step 8: open, within the radius, and its latest report within the time window. */
  canAccept(report: HazardReport, config: ClusteringConfig, now: Date): boolean {
    const idleHours = (now.getTime() - this.state.lastReportAt.getTime()) / HOUR_MS;
    return (
      this.isOpen() &&
      this.distanceKmTo(report.location) <= config.clusterRadiusKm &&
      idleHours <= config.clusterWindowHours
    );
  }

  /** UC-3 step 9: the centroid is the running mean; times follow capture time, not arrival time (A1). */
  add(report: HazardReport): void {
    const size = this.state.reportIds.length;
    const { lat, lng } = report.location;
    const { centroid, firstReportedAt, lastReportAt } = this.state;
    this.state = {
      ...this.state,
      reportIds: [...this.state.reportIds, report.id],
      centroid: {
        lat: (centroid.lat * size + lat) / (size + 1),
        lng: (centroid.lng * size + lng) / (size + 1),
      },
      firstReportedAt: report.capturedAt < firstReportedAt ? report.capturedAt : firstReportedAt,
      lastReportAt: report.capturedAt > lastReportAt ? report.capturedAt : lastReportAt,
    };
  }

  /** UC-3 steps 10, 14; A2: a cluster with no pending or verified report left is closed (H8). */
  rescore(reports: readonly HazardReport[], scorer: PriorityScorer, now: Date): void {
    const snapshots = reports.map((report) => report.snapshot());
    const active = snapshots.filter((report) => report.status !== 'REJECTED');
    const score = scorer.score(snapshots, now);
    this.state = {
      ...this.state,
      priorityScore: score.value,
      band: score.band,
      counts: countByStatus(snapshots),
      dominantHazardType: dominantType(active, this.state.dominantHazardType),
      status: active.length === 0 && this.isOpen() ? 'CLOSED' : this.state.status,
    };
  }

  /** UC-3 step 15: toggles Open ↔ Escalation recommended. Escalated and closed clusters do not move. */
  recommend(recommended: boolean): void {
    if (this.isOpen()) {
      this.state = { ...this.state, status: recommended ? 'ESCALATION_RECOMMENDED' : 'OPEN' };
    }
  }

  /** UC-3 step 16: only a recommended cluster can be escalated, and only once (H4). */
  markEscalated(officerId: string, now: Date): void {
    if (this.state.status !== 'ESCALATION_RECOMMENDED') {
      throw new ConflictError(
        'ESCALATION_NOT_ALLOWED',
        'This cluster cannot be escalated in its current state.',
      );
    }
    this.state = { ...this.state, status: 'ESCALATED', escalatedBy: officerId, escalatedAt: now };
  }

  private isOpen(): boolean {
    return this.state.status === 'OPEN' || this.state.status === 'ESCALATION_RECOMMENDED';
  }
}
```

**Tests** (use the builders from `testing/inMemory.ts`, Task B2.1 – write the builders first if you prefer):
`open` → one report, centroid at the report, counts 1/1/0/0 · `canAccept`: inside radius and window → true; 2.1 km →
false; **boundary**: set `clusterRadiusKm` to the exact `distanceKm` between centroid and report → true; latest report
6 h 1 min ago → false; exactly 6 h → true; status ESCALATED → false; CLOSED → false; ESCALATION_RECOMMENDED → true ·
`add`: centroid becomes the mean of two points; `reportIds` grows; an **older** offline report lowers
`firstReportedAt` but not `lastReportAt`; a newer one raises `lastReportAt` · `rescore`: score/band from the scorer
(use a stub scorer returning `PriorityScore.of(80, bands)`); counts by status; dominant = most frequent type; tie
flood/landslide → LANDSLIDE; rejected reports do not count towards dominant; all rejected → CLOSED and dominant
unchanged; all rejected while ESCALATED → stays ESCALATED · `recommend(true)` OPEN → ESCALATION_RECOMMENDED,
`recommend(false)` back to OPEN, no-op when ESCALATED or CLOSED · `markEscalated` from ESCALATION_RECOMMENDED sets
status, officer, time; from OPEN / ESCALATED / CLOSED → `ESCALATION_NOT_ALLOWED` · `restore` + `snapshot` copy
`reportIds`.

- [ ] Tests → fail → implement → pass → `npx eslint backend/src/modules/hazard-reports` clean → commit
      `feat(uc3): ReportCluster entity (H5, H8)`.

---

## Phase B2 – Application

### Task B2.1: Ports and in-memory fakes

**Files:** Create `application/ports.ts`, `testing/inMemory.ts` (not measured; no tests of its own).

```ts
// application/ports.ts
import type { District } from '@shared/contracts/enums';
import type { GeoPoint } from '@shared/geo/GeoPoint';
import type { HazardReport } from '../domain/HazardReport';
import type { ReportCluster } from '../domain/ReportCluster';
import type { ClusterStatus, ReportPhoto, ReportStatus, UploadedPhoto } from '../domain/types';

/** Thrown by `insert` when this reporter already sent this `clientReportId` (H7). */
export class DuplicateClientReportError extends Error {
  constructor() {
    super('This clientReportId was already received.');
    this.name = 'DuplicateClientReportError';
  }
}

export interface ReportSearch {
  status?: ReportStatus;
  /** Free text matched against the description. */
  text?: string;
}

export interface HazardReportRepository {
  /** Must be atomic on (reporterId, clientReportId): throws `DuplicateClientReportError` on a repeat. */
  insert(report: HazardReport): Promise<void>;
  save(report: HazardReport): Promise<void>;
  findById(id: string): Promise<HazardReport | undefined>;
  findByClientReportId(
    reporterId: string,
    clientReportId: string,
  ): Promise<HazardReport | undefined>;
  /** Newest first. */
  findByReporter(reporterId: string): Promise<HazardReport[]>;
  findByCluster(clusterId: string): Promise<HazardReport[]>;
  /** Newest first, at most 200. */
  search(filter: ReportSearch): Promise<HazardReport[]>;
}

export interface ReportClusterRepository {
  save(cluster: ReportCluster): Promise<void>;
  findById(id: string): Promise<ReportCluster | undefined>;
  /** Open or escalation-recommended clusters whose centroid may lie within `radiusKm` of `point`. */
  findOpenNear(point: GeoPoint, radiusKm: number): Promise<ReportCluster[]>;
  findByStatus(statuses: readonly ClusterStatus[]): Promise<ReportCluster[]>;
}

export interface PhotoStorage {
  save(reportId: string, photo: UploadedPhoto): Promise<ReportPhoto>;
  remove(photo: ReportPhoto): Promise<void>;
}

export interface DistrictResolver {
  districtOf(point: GeoPoint): District;
}
```

`testing/inMemory.ts` exports: `InMemoryHazardReportRepository` (Map by id; `insert` throws
`DuplicateClientReportError` when `(reporterId, clientReportId)` exists; stores `report.snapshot()` and returns
`HazardReport.restore(...)` so tests cannot mutate stored state by reference), `InMemoryReportClusterRepository`
(`findOpenNear` returns all OPEN/ESCALATION_RECOMMENDED clusters – the entity does the exact check),
`FakePhotoStorage` (records `saved` and `removed`; returns `{ url: '/api/hazard-reports/photos/<id>.jpg', mime, bytes }`),
`fixedDistrict(district = 'KALUTARA'): DistrictResolver`, and builders:

```ts
export const KALUTARA: GeoPoint = { lat: 6.5854, lng: 79.9607 };
export const north = (point: GeoPoint, metres: number): GeoPoint => ({
  lat: point.lat + metres / 111_195,
  lng: point.lng,
});
export const jpeg = (bytes = 16): UploadedPhoto => ({
  content: Uint8Array.from([0xff, 0xd8, 0xff, ...new Array(bytes - 3).fill(0)]),
  mimeType: 'image/jpeg',
});
export function aReport(over: Partial<HazardReportState> = {}): HazardReport {
  /* restore() with sensible defaults: id 'r-1', clientReportId 'client-0001', reporterId 'citizen-1', CITIZEN, FLOOD, KALUTARA GPS, capturedAt/receivedAt 2026-10-07T09:00Z, PENDING */
}
```

- [ ] Create both files; typecheck; commit `feat(uc3): application ports and in-memory fakes`.

### Task B2.2: `ClusteringService` (steps 8–10, A3)

**Files:** Create `application/ClusteringService.ts` · Test `__tests__/ClusteringService.test.ts`

```ts
// application/ClusteringService.ts
import type { IdGenerator } from '@shared/ids/IdGenerator';
import type { Clock } from '@shared/time/Clock';
import type { ClusteringConfig } from '../domain/ClusteringConfig';
import type { EscalationDecision, EscalationPolicy } from '../domain/EscalationPolicy';
import type { HazardReport } from '../domain/HazardReport';
import type { PriorityScorer } from '../domain/PriorityScorer';
import { ReportCluster } from '../domain/ReportCluster';
import type { DistrictResolver, HazardReportRepository, ReportClusterRepository } from './ports';

export interface ClusteringDeps {
  reports: HazardReportRepository;
  clusters: ReportClusterRepository;
  districts: DistrictResolver;
  scorer: PriorityScorer;
  policy: EscalationPolicy;
  config: ClusteringConfig;
  clock: Clock;
  ids: IdGenerator;
}

export interface ScoredCluster {
  cluster: ReportCluster;
  reports: HazardReport[];
  escalation: EscalationDecision;
}

export class ClusteringService {
  constructor(private readonly deps: ClusteringDeps) {}

  /** UC-3 steps 8–10; A3: nearest matching cluster, else a new one; then the score is recalculated. */
  async assign(report: HazardReport): Promise<ScoredCluster> {
    const { clusters, reports, config, clock } = this.deps;
    const now = clock.now();
    const nearest = (await clusters.findOpenNear(report.location, config.clusterRadiusKm))
      .filter((candidate) => candidate.canAccept(report, config, now))
      .sort((a, b) => a.distanceKmTo(report.location) - b.distanceKmTo(report.location))[0];
    const cluster = nearest ?? this.openFor(report);
    if (nearest) nearest.add(report);
    report.assignTo(cluster.id);
    await reports.save(report);
    return this.rescore(cluster);
  }

  /** UC-3 steps 10, 14, 15; A2: recomputes score, band, counts and the escalation recommendation. */
  async rescore(cluster: ReportCluster): Promise<ScoredCluster> {
    const { reports: repository, clusters, scorer, policy, clock } = this.deps;
    const reports = await repository.findByCluster(cluster.id);
    cluster.rescore(reports, scorer, clock.now());
    const escalation = this.evaluate(cluster, reports);
    cluster.recommend(escalation.recommended);
    await clusters.save(cluster);
    return { cluster, reports, escalation };
  }

  /** What the escalation rule says about a cluster right now, without changing anything. */
  evaluate(cluster: ReportCluster, reports: readonly HazardReport[]): EscalationDecision {
    const { band, dominantHazardType } = cluster.snapshot();
    return this.deps.policy.evaluate({
      band,
      dominantHazardType,
      reports: reports.map((report) => report.snapshot()),
    });
  }

  private openFor(report: HazardReport): ReportCluster {
    const { ids, districts } = this.deps;
    return ReportCluster.open(ids.next(), report, districts.districtOf(report.location));
  }
}
```

**Tests** (real `WeightedPriorityScorer`, real `EscalationPolicy`, `FixedClock`, `SequentialIdGenerator('cluster')`,
in-memory repositories; arrange existing clusters by calling `assign` or by saving restored state):

- `UC-3 A3: with no cluster nearby it opens a new single-report cluster` → cluster id `cluster-1`, `reportIds` =
  [report], report saved with that `clusterId`, district from the resolver, score 54 (single flood just now), status OPEN.
- `UC-3 step 9: joins a cluster inside the radius and window` → same cluster id, `counts.total` 2.
- `outside the radius opens a new cluster` (report 2.5 km north).
- `inside the radius but stale opens a new cluster` (`clock.advance(6 h + 1 min)`).
- `two candidates: the nearest wins` (clusters at 0 m and 1500 m north; report at 300 m).
- `does not join a CLOSED or ESCALATED cluster` (two tests; restore state with that status).
- `updates centroid and dominant hazard type` (flood then two landslides → LANDSLIDE; centroid = mean).
- `UC-3 step 10: recalculates the score on add` (score after second report > after first).
- `UC-3 step 15: rescore recommends escalation when the rule is met and withdraws it when not` (seed a cluster with 10
  flood reports, 3 VERIFIED → `ESCALATION_RECOMMENDED`; then make one verified report REJECTED in the repository and
  `rescore` → `OPEN`).
- `rescore closes a cluster whose reports are all rejected`.
- `evaluate does not persist anything` (repository state unchanged).

- [ ] Tests → fail → implement → pass → commit `feat(uc3): clustering service (steps 8–10, A3)`.

### Task B2.3: `ReportSubmissionService` (steps 7–10, A1, E2, E3, H7)

**Files:** Create `application/ReportSubmissionService.ts` · Test `__tests__/ReportSubmissionService.test.ts`

```ts
// application/ReportSubmissionService.ts
import type { AuditLog } from '@shared/audit/AuditLog';
import type { Role } from '@shared/contracts/enums';
import { ConflictError, ValidationError } from '@shared/errors/DomainError';
import type { IdGenerator } from '@shared/ids/IdGenerator';
import type { Clock } from '@shared/time/Clock';
import type { ClusteringConfig } from '../domain/ClusteringConfig';
import type { DuplicateDetector } from '../domain/DuplicateDetector';
import { HazardReport } from '../domain/HazardReport';
import type { PhotoValidator } from '../domain/PhotoValidator';
import type { ReportHazardType, ReportLocation, ReportPhoto, UploadedPhoto } from '../domain/types';
import type { ClusteringService } from './ClusteringService';
import {
  DuplicateClientReportError,
  type HazardReportRepository,
  type PhotoStorage,
} from './ports';

export interface SubmitReportCommand {
  reporterId: string;
  reporterRole: Extract<Role, 'CITIZEN' | 'COMMUNITY_VOLUNTEER'>;
  clientReportId: string;
  hazardType: ReportHazardType;
  description: string;
  location: ReportLocation;
  capturedAt: Date;
  photo?: UploadedPhoto;
  duplicateAction?: 'NEW' | 'UPDATE';
  syncedFromOffline: boolean;
}

export type SubmitOutcome = 'CREATED' | 'ALREADY_RECEIVED' | 'UPDATED_EXISTING';
export interface SubmitResult {
  outcome: SubmitOutcome;
  report: HazardReport;
}

export interface SubmissionDeps {
  reports: HazardReportRepository;
  photos: PhotoStorage;
  clustering: ClusteringService;
  detector: DuplicateDetector;
  photoValidator: PhotoValidator;
  config: ClusteringConfig;
  clock: Clock;
  ids: IdGenerator;
  audit: AuditLog;
}

export class ReportSubmissionService {
  constructor(private readonly deps: SubmissionDeps) {}

  /** UC-3 steps 7–10; A1 (a replayed upload is acknowledged, not repeated: H7); A3; E2; E3. */
  async submit(command: SubmitReportCommand): Promise<SubmitResult> {
    const { reports, photoValidator } = this.deps;
    const received = await reports.findByClientReportId(command.reporterId, command.clientReportId);
    if (received) return { outcome: 'ALREADY_RECEIVED', report: received };

    this.assertNotFromTheFuture(command.capturedAt);
    if (command.photo) photoValidator.assertValid(command.photo);

    const duplicate = this.deps.detector.find(
      command,
      await reports.findByReporter(command.reporterId),
    );
    if (duplicate && command.duplicateAction !== 'NEW')
      return this.resolveDuplicate(duplicate, command);
    return this.create(command);
  }

  /** UC-3 E3: online the reporter is asked; a report synced from offline is merged automatically (H6). */
  private async resolveDuplicate(
    existing: HazardReport,
    command: SubmitReportCommand,
  ): Promise<SubmitResult> {
    if (command.duplicateAction !== 'UPDATE' && !command.syncedFromOffline) {
      throw new ConflictError('DUPLICATE_SUSPECTED', 'You reported this a moment ago.', {
        existingReportId: existing.id,
      });
    }
    const photo = command.photo
      ? await this.deps.photos.save(existing.id, command.photo)
      : undefined;
    existing.amend({ description: command.description, photo, capturedAt: command.capturedAt });
    await this.deps.reports.save(existing);
    await this.record('hazard-report.updated', existing, command);
    return { outcome: 'UPDATED_EXISTING', report: existing };
  }

  private async create(command: SubmitReportCommand): Promise<SubmitResult> {
    const { reports, photos, clustering, ids, clock } = this.deps;
    const id = ids.next();
    const photo = command.photo ? await photos.save(id, command.photo) : undefined;
    const report = HazardReport.submit({
      id,
      clientReportId: command.clientReportId,
      reporterId: command.reporterId,
      reporterType: command.reporterRole === 'COMMUNITY_VOLUNTEER' ? 'VOLUNTEER' : 'CITIZEN',
      hazardType: command.hazardType,
      description: command.description,
      photo,
      location: command.location,
      capturedAt: command.capturedAt,
      receivedAt: clock.now(),
      syncedFromOffline: command.syncedFromOffline,
    });
    try {
      await reports.insert(report);
    } catch (error) {
      if (!(error instanceof DuplicateClientReportError)) throw error;
      return this.acknowledgeRace(command, photo);
    }
    await clustering.assign(report);
    await this.record('hazard-report.submitted', report, command);
    return { outcome: 'CREATED', report };
  }

  /** Two uploads of the same report raced (foreground and background sync): the first one won. */
  private async acknowledgeRace(
    command: SubmitReportCommand,
    orphan?: ReportPhoto,
  ): Promise<SubmitResult> {
    if (orphan) await this.deps.photos.remove(orphan);
    const winner = await this.deps.reports.findByClientReportId(
      command.reporterId,
      command.clientReportId,
    );
    return { outcome: 'ALREADY_RECEIVED', report: winner as HazardReport };
  }

  private assertNotFromTheFuture(capturedAt: Date): void {
    const latest = this.deps.clock.now().getTime() + this.deps.config.capturedAtSkewMs;
    if (capturedAt.getTime() > latest) {
      throw new ValidationError([{ field: 'capturedAt', code: 'CAPTURED_AT_IN_FUTURE' }]);
    }
  }

  private record(
    action: string,
    report: HazardReport,
    command: SubmitReportCommand,
  ): Promise<void> {
    return this.deps.audit.record({
      action,
      actorId: command.reporterId,
      actorRole: command.reporterRole,
      subjectType: 'HazardReport',
      subjectId: report.id,
      details: {
        clientReportId: command.clientReportId,
        syncedFromOffline: command.syncedFromOffline,
      },
      occurredAt: this.deps.clock.now(),
    });
  }
}
```

**Tests** (build the service with real domain objects + in-memory repositories + `FakeAuditLog`; helper
`command(over)` returns a valid `SubmitReportCommand`):

| Test name                                                                                               | Expectation                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `UC-3 step 7: stores a Pending report with the client's capturedAt and the server's receivedAt`         | `outcome CREATED`; snapshot `status PENDING`, `capturedAt` = command, `receivedAt` = clock, `clusterId` set; audit `hazard-report.submitted`                                                           |
| `a volunteer's report is typed VOLUNTEER`                                                               | `reporterType 'VOLUNTEER'`                                                                                                                                                                             |
| `a manual location keeps source MANUAL`                                                                 | `location.source 'MANUAL'`                                                                                                                                                                             |
| `a submission without a photo is allowed`                                                               | `photo` undefined; `photos.saved` empty                                                                                                                                                                |
| `stores the photo and links its url`                                                                    | `photo.url` matches `/photos/`                                                                                                                                                                         |
| `UC-3 E2: an invalid photo is refused and nothing is saved`                                             | rejects with code `INVALID_PHOTO`; repository empty; `photos.saved` empty                                                                                                                              |
| `UC-3 A1/H7: the same clientReportId twice yields one report and an unchanged cluster`                  | second call `ALREADY_RECEIVED`, same id; cluster `counts.total` 1                                                                                                                                      |
| `H7: a different reporter may reuse the same clientReportId`                                            | second call `CREATED`                                                                                                                                                                                  |
| `H7: a lost insert race is acknowledged and its photo removed`                                          | wrap the repository so the first `findByClientReportId` returns undefined and `insert` throws `DuplicateClientReportError` after storing a winner → `ALREADY_RECEIVED`, `photos.removed` has one entry |
| `H7: a lost race without a photo removes nothing`                                                       | same without photo → `photos.removed` empty                                                                                                                                                            |
| `an unexpected insert failure propagates`                                                               | `insert` throws `new Error('db down')` → rejects with it                                                                                                                                               |
| `UC-3 E3: online duplicate with no action asks the reporter`                                            | rejects `ConflictError` code `DUPLICATE_SUSPECTED`, `details.existingReportId` = first id; one report stored                                                                                           |
| `UC-3 E3: UPDATE amends the existing report and creates none`                                           | `UPDATED_EXISTING`; description replaced; one report; audit `hazard-report.updated`                                                                                                                    |
| `UC-3 E3: UPDATE with a new photo replaces the photo`                                                   | `photo.url` changed                                                                                                                                                                                    |
| `UC-3 E3: NEW creates a second report in the same cluster`                                              | `CREATED`; two reports; cluster total 2                                                                                                                                                                |
| `UC-3 E3/H6: a duplicate synced from offline is merged automatically and keeps the earliest capturedAt` | `syncedFromOffline: true`, capturedAt 10 min earlier → `UPDATED_EXISTING`; stored `capturedAt` = the earlier one                                                                                       |
| `a reviewed earlier report is not a duplicate`                                                          | first report verified in the repository → second `CREATED`                                                                                                                                             |
| `edge: capturedAt more than 5 minutes ahead of the server is refused`                                   | `ValidationError`, field `capturedAt`, code `CAPTURED_AT_IN_FUTURE`; exactly +5 min accepted                                                                                                           |

- [ ] Tests → fail → implement → pass → commit `feat(uc3): report submission service (A1, E2, E3, H6, H7)`.

### Task B2.4: `ReportReviewService` (steps 11–16, A2)

**Files:** Create `application/ReportReviewService.ts` · Test `__tests__/ReportReviewService.test.ts`

```ts
// application/ReportReviewService.ts
import type { AuditLog } from '@shared/audit/AuditLog';
import { DISTRICT_LABELS } from '@shared/contracts/enums';
import type { ClusterEscalationRequested } from '@shared/contracts/events';
import { ConflictError, NotFoundError } from '@shared/errors/DomainError';
import type { EventBus } from '@shared/events/EventBus';
import type { Clock } from '@shared/time/Clock';
import type { EscalationDecision } from '../domain/EscalationPolicy';
import type { HazardReport } from '../domain/HazardReport';
import type { ReportCluster } from '../domain/ReportCluster';
import type { ClusterStatus } from '../domain/types';
import type { ClusteringService, ScoredCluster } from './ClusteringService';
import type { HazardReportRepository, ReportClusterRepository, ReportSearch } from './ports';

export interface ReviewDeps {
  reports: HazardReportRepository;
  clusters: ReportClusterRepository;
  clustering: ClusteringService;
  events: EventBus;
  audit: AuditLog;
  clock: Clock;
}

export interface ReviewResult {
  report: HazardReport;
  cluster: ScoredCluster;
}

export class ReportReviewService {
  constructor(private readonly deps: ReviewDeps) {}

  /** UC-3 step 11: the review queue, highest priority first, newest first within a score. */
  async queue(statuses: readonly ClusterStatus[]): Promise<ScoredCluster[]> {
    const clusters = await this.deps.clusters.findByStatus(statuses);
    const scored = await Promise.all(clusters.map((cluster) => this.describe(cluster)));
    return scored.sort((a, b) => {
      const [left, right] = [a.cluster.snapshot(), b.cluster.snapshot()];
      return (
        right.priorityScore - left.priorityScore ||
        right.lastReportAt.getTime() - left.lastReportAt.getTime()
      );
    });
  }

  /** UC-3 steps 11–12: one cluster with its reports and what the escalation rule still needs. */
  async cluster(clusterId: string): Promise<ScoredCluster> {
    return this.describe(await this.loadCluster(clusterId));
  }

  /** UC-3 step 12. A reporter may read only their own report. */
  async report(
    reportId: string,
    reader: { userId: string; isOfficer: boolean },
  ): Promise<HazardReport> {
    const report = await this.loadReport(reportId);
    if (!reader.isOfficer && report.reporterId !== reader.userId) throw reportNotFound();
    return report;
  }

  /** Reports history (officer) and "My reports" (reporter). */
  history(filter: ReportSearch): Promise<HazardReport[]> {
    return this.deps.reports.search(filter);
  }

  mine(reporterId: string): Promise<HazardReport[]> {
    return this.deps.reports.findByReporter(reporterId);
  }

  /** UC-3 steps 13–15. */
  async verify(reportId: string, officerId: string): Promise<ReviewResult> {
    const report = await this.loadReport(reportId);
    report.verify(officerId, this.deps.clock.now());
    return this.settle(report, officerId, 'hazard-report.verified');
  }

  /** UC-3 A2: rejected reports stay for audit but leave the score; an emptied cluster closes. */
  async reject(reportId: string, officerId: string, reason: string): Promise<ReviewResult> {
    const report = await this.loadReport(reportId);
    report.reject(officerId, reason, this.deps.clock.now());
    return this.settle(report, officerId, 'hazard-report.rejected', reason.trim());
  }

  /** UC-3 step 16: the officer confirms; UC-1 receives the request as a pending warning (H4). */
  async escalate(clusterId: string, officerId: string): Promise<ScoredCluster> {
    const { clusters, clustering, events, clock } = this.deps;
    const scored = await clustering.rescore(await this.loadCluster(clusterId));
    const now = clock.now();
    // Build the event first: if it cannot be built, nothing has changed yet.
    const event = toEvent(scored.cluster, scored.escalation, officerId, now);
    scored.cluster.markEscalated(officerId, now);
    await clusters.save(scored.cluster);
    await events.publish(event);
    await this.audit('hazard-cluster.escalated', officerId, 'ReportCluster', clusterId);
    return scored;
  }

  private async settle(
    report: HazardReport,
    officerId: string,
    action: string,
    reason?: string,
  ): Promise<ReviewResult> {
    await this.deps.reports.save(report);
    const cluster = await this.deps.clustering.rescore(
      await this.loadCluster(report.clusterId as string),
    );
    await this.audit(action, officerId, 'HazardReport', report.id, reason);
    return { report, cluster };
  }

  private async describe(cluster: ReportCluster): Promise<ScoredCluster> {
    const reports = await this.deps.reports.findByCluster(cluster.id);
    return { cluster, reports, escalation: this.deps.clustering.evaluate(cluster, reports) };
  }

  private async loadReport(reportId: string): Promise<HazardReport> {
    const report = await this.deps.reports.findById(reportId);
    if (!report) throw reportNotFound();
    return report;
  }

  private async loadCluster(clusterId: string): Promise<ReportCluster> {
    const cluster = await this.deps.clusters.findById(clusterId);
    if (!cluster) throw new NotFoundError('CLUSTER_NOT_FOUND', 'This cluster does not exist.');
    return cluster;
  }

  private audit(
    action: string,
    actorId: string,
    subjectType: string,
    subjectId: string,
    reason?: string,
  ): Promise<void> {
    return this.deps.audit.record({
      action,
      actorId,
      actorRole: 'DUTY_OFFICER',
      subjectType,
      subjectId,
      reason,
      occurredAt: this.deps.clock.now(),
    });
  }
}

const reportNotFound = (): NotFoundError =>
  new NotFoundError('REPORT_NOT_FOUND', 'This report does not exist.');

/** The frozen UC-3 → UC-1 contract (`shared/contracts/events.ts`). */
function toEvent(
  cluster: ReportCluster,
  decision: EscalationDecision,
  officerId: string,
  now: Date,
): ClusterEscalationRequested {
  const state = cluster.snapshot();
  if (!decision.hazardType || !decision.proposedSeverity) {
    throw new ConflictError(
      'ESCALATION_NOT_ALLOWED',
      'This cluster has no hazard a warning can be issued for.',
    );
  }
  return {
    type: 'ClusterEscalationRequested',
    clusterId: state.id,
    hazardType: decision.hazardType,
    proposedSeverity: decision.proposedSeverity,
    targetArea: {
      type: 'DISTRICT',
      id: state.district,
      name: DISTRICT_LABELS[state.district],
      district: state.district,
    },
    centroid: state.centroid,
    verifiedReportCount: state.counts.verified,
    totalReportCount: state.counts.total,
    priorityScore: state.priorityScore,
    requestedBy: officerId,
    occurredAt: now.toISOString(),
  };
}
```

Notes for the implementer: `private audit(...)` has 5 parameters (the lint maximum). `escalate` rescoring first means a
cluster whose recency decayed below High since it was recommended is refused (`markEscalated` throws because `rescore`
moved it back to OPEN) – that is intended. The `toEvent` guard is reachable only if the policy and the status disagree;
cover it with one test that injects a stub `ClusteringService` whose `rescore` returns a recommended cluster with a
decision lacking `hazardType`. The cluster is saved before the event is published so that a second click finds it
already ESCALATED and can never publish a second event.

**Tests** (arrange a High cluster: 10 citizen flood reports at KALUTARA captured now, via the submission service or
directly in the repositories; `FakeEventBus`, `FakeAuditLog`, `FixedClock`):

| Test name                                                                                     | Expectation                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UC-3 step 11: the queue is ordered by score, then by newest report`                          | three clusters → order by `priorityScore` desc; equal scores → later `lastReportAt` first                                                                                                                                                                                                                                                                                                                                                          |
| `the queue only returns the requested statuses`                                               | CLOSED cluster excluded                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `UC-3 steps 13–14: verify sets status, reviewer and time, and rescoring the cluster`          | snapshot `VERIFIED`, `reviewedBy`, `reviewedAt` = clock; `cluster.counts.verified` 1; audit `hazard-report.verified`                                                                                                                                                                                                                                                                                                                               |
| `verifying an already reviewed report is a conflict`                                          | `REPORT_ALREADY_REVIEWED`                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `verifying an unknown report is not found`                                                    | `REPORT_NOT_FOUND`                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `UC-3 A2: reject requires a reason`                                                           | `''` → `ValidationError`; report still PENDING                                                                                                                                                                                                                                                                                                                                                                                                     |
| `UC-3 A2: reject excludes the report from the score and can lower the band`                   | 8 citizen flood reports captured 90 min ago → score 79 (High) → reject one → 74 (Elevated)                                                                                                                                                                                                                                                                                                                                                         |
| `UC-3 A2/H8: rejecting the last active report closes the cluster`                             | single-report cluster → status CLOSED                                                                                                                                                                                                                                                                                                                                                                                                              |
| `UC-3 step 15: the third verification in a High cluster recommends escalation`                | after 2: OPEN, `unmet ['VERIFIED_REPORTS']`; after 3: `ESCALATION_RECOMMENDED`, `unmet []`                                                                                                                                                                                                                                                                                                                                                         |
| `UC-3 step 16: escalate publishes ClusterEscalationRequested with the exact contract payload` | `events.ofType('ClusterEscalationRequested')` toEqual `[{ type, clusterId, hazardType: 'FLOOD', proposedSeverity: 'HIGH', targetArea: { type: 'DISTRICT', id: 'KALUTARA', name: 'Kalutara', district: 'KALUTARA' }, centroid, verifiedReportCount: 3, totalReportCount: 10, priorityScore: <value>, requestedBy: 'usr-duty-1', occurredAt: clock ISO } satisfies ClusterEscalationRequested]`; cluster ESCALATED; audit `hazard-cluster.escalated` |
| `escalate when not recommended → ESCALATION_NOT_ALLOWED, no event`                            | 2 verified → conflict; `events.published` empty                                                                                                                                                                                                                                                                                                                                                                                                    |
| `escalate twice → conflict, one event only`                                                   | second call rejects; one event                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `escalate after the score decayed below High is refused`                                      | `clock.advance(6 h)` after recommendation → conflict; cluster back to OPEN                                                                                                                                                                                                                                                                                                                                                                         |
| `escalate an unknown cluster → CLUSTER_NOT_FOUND`                                             |                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `escalate refuses a recommendation without a warnable hazard`                                 | stub clustering as described above → `ESCALATION_NOT_ALLOWED`, no event, cluster not saved as ESCALATED                                                                                                                                                                                                                                                                                                                                            |
| `UC-3 step 12: an officer can read any report; a reporter only their own`                     | other reporter → `REPORT_NOT_FOUND`                                                                                                                                                                                                                                                                                                                                                                                                                |
| `history delegates the filter; mine returns only the reporter's reports`                      |                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `cluster() returns reports and the unmet requirements`                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

- [ ] Tests → fail → implement → pass → commit
      `feat(uc3): report review service (steps 11–16, A2, H4, H8)`.
- [ ] `cd backend && npx jest src/modules/hazard-reports --coverage --collectCoverageFrom='src/modules/hazard-reports/{domain,application}/**/*.ts'`
      → 100% on both folders before moving on.

---

## Phase B3 – Infrastructure

### Task B3.1: Mongoose models and repositories

**Files:** Create `infrastructure/models.ts`, `MongoHazardReportRepository.ts`, `MongoReportClusterRepository.ts` ·
Test `__tests__/mongoRepositories.test.ts` (uses `connectTestMongo()` / `clearDatabase()` from `@shared/testing/mongo`).

- Collections `hazard_reports`, `report_clusters`; `_id: String` = entity id; `versionKey: false`.
- `hazard_reports` indexes: **unique** `{ reporterId: 1, clientReportId: 1 }` (the atomic claim behind H7);
  `{ clusterId: 1 }`; `{ reporterId: 1, capturedAt: -1 }`; `{ status: 1, receivedAt: -1 }`.
- `report_clusters`: store `centroid` as `{ lat, lng }`; index `{ status: 1, priorityScore: -1 }`.
  `findOpenNear` = status in `['OPEN','ESCALATION_RECOMMENDED']` AND a bounding box
  (`lat` within ± `radiusKm / 111`, `lng` within ± `radiusKm / (111 × cos(lat))`); the entity's `canAccept` does the
  exact haversine check. No `2dsphere` index needed.
- `insert`: `Model.create(doc)`; catch error with `code === 11000` → throw `DuplicateClientReportError`; rethrow others.
- `save`: `Model.replaceOne({ _id }, doc, { upsert: true })`.
- `search`: `status` filter; `text` → case-insensitive regex on `description` **with the input escaped**
  (`text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`); sort `receivedAt` desc; limit 200.
- Map with two private functions per repository: `toDocument(entity.snapshot())` and `Entity.restore(fromDocument(doc))`
  (drop `undefined` optionals so `replaceOne` does not store nulls). Call `await Model.init()` in the test `beforeAll`
  so the unique index exists.

**Tests:** round-trip of a full report (all optional fields set) and a minimal one · `insert` twice with the same
`(reporterId, clientReportId)` → `DuplicateClientReportError`; same id pair for another reporter → ok · a non-duplicate
insert error propagates (insert a document violating a required field through a spy on `Model.create` that rejects with
`new Error('boom')`) · `findById` unknown → undefined · `findByClientReportId` hit and miss · `findByReporter` newest
first · `findByCluster` · `search` by status, by text (case-insensitive), a text with regex characters `a.*(` matches
literally, limit · cluster round-trip · `findOpenNear` returns OPEN and ESCALATION_RECOMMENDED inside the box, not
CLOSED/ESCALATED, not one 50 km away · `findByStatus`.

- [ ] Tests → fail → implement → pass → commit `feat(uc3): mongo repositories`.

### Task B3.2: `DiskPhotoStorage`

**Files:** Create `infrastructure/DiskPhotoStorage.ts` · Test `__tests__/DiskPhotoStorage.test.ts`

```ts
// infrastructure/DiskPhotoStorage.ts
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PhotoStorage } from '../application/ports';
import type { ReportPhoto, UploadedPhoto } from '../domain/types';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
export const PHOTO_ROUTE = '/api/hazard-reports/photos';
/** Only names this class produces are ever served: no path can be smuggled in. */
export const PHOTO_FILE_NAME = /^[A-Za-z0-9-]+\.(jpg|png|webp)$/;

export class DiskPhotoStorage implements PhotoStorage {
  constructor(private readonly directory: string) {}

  async save(reportId: string, photo: UploadedPhoto): Promise<ReportPhoto> {
    await mkdir(this.directory, { recursive: true });
    const fileName = `${reportId}.${EXTENSIONS[photo.mimeType] ?? 'bin'}`;
    await writeFile(join(this.directory, fileName), photo.content);
    return {
      url: `${PHOTO_ROUTE}/${fileName}`,
      mime: photo.mimeType,
      bytes: photo.content.byteLength,
    };
  }

  async remove(photo: ReportPhoto): Promise<void> {
    await rm(this.pathOf(photo.url.slice(PHOTO_ROUTE.length + 1)), { force: true });
  }

  /** Absolute path of a stored photo, or undefined when the name is not one of ours. */
  resolve(fileName: string): string | undefined {
    return PHOTO_FILE_NAME.test(fileName) ? this.pathOf(fileName) : undefined;
  }

  private pathOf(fileName: string): string {
    return join(this.directory, fileName);
  }
}
```

**Tests** (temp dir via `mkdtemp(join(tmpdir(), 'uc3-photos-'))`, removed in `afterEach`): `save` writes the bytes and
returns url/mime/bytes · png and webp extensions · unknown mime → `.bin` · `remove` deletes the file and is silent when
it is already gone · `resolve('abc-1.jpg')` → path inside the dir · `resolve('../secret.env')` and
`resolve('a.exe')` → undefined.

- [ ] Tests → fail → implement → pass → commit `feat(uc3): disk photo storage`.

---

## Phase B4 – HTTP API

### Task B4.1: Add multer

- [ ] From `D:\GitHub\Disaster_Managment_System`: `npm install multer -w backend` and
      `npm install -D @types/multer -w backend`. Open `node_modules/multer/package.json` and confirm the major version
      supports Express 5 (2.x does); read its README for `memoryStorage` and `limits`.
- [ ] Commit only `backend/package.json` + `package-lock.json`: `chore(backend): add multer for UC-3 photo upload`.
      Announce it in the group chat (D14).

### Task B4.2: Schemas, DTOs, upload wrapper

**Files:** Create `api/schemas.ts`, `api/dto.ts`, `api/photoUpload.ts` · Tests `__tests__/schemas.test.ts`,
`__tests__/dto.test.ts`, (upload wrapper is covered by the HTTP tests in B4.3).

```ts
// api/schemas.ts
import { z } from 'zod';
import { isWithinSriLanka } from '@shared/geo/GeoPoint';
import { CLUSTER_STATUSES, REPORT_HAZARD_TYPES, REPORT_STATUSES } from '../domain/types';

/** Multipart text fields arrive as strings, so numbers and booleans are coerced here. */
export const submitReportSchema = z
  .object({
    clientReportId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/, 'CLIENT_REPORT_ID_INVALID'),
    hazardType: z.enum(REPORT_HAZARD_TYPES, 'HAZARD_TYPE_REQUIRED'),
    description: z.string().trim().max(500, 'DESCRIPTION_TOO_LONG').default(''),
    lat: z.coerce
      .number('LOCATION_REQUIRED')
      .min(-90, 'LOCATION_INVALID')
      .max(90, 'LOCATION_INVALID'),
    lng: z.coerce
      .number('LOCATION_REQUIRED')
      .min(-180, 'LOCATION_INVALID')
      .max(180, 'LOCATION_INVALID'),
    locationSource: z.enum(['GPS', 'MANUAL'], 'LOCATION_SOURCE_INVALID'),
    accuracyM: z.coerce.number().nonnegative().optional(),
    capturedAt: z.iso
      .datetime({ offset: true, error: 'CAPTURED_AT_INVALID' })
      .transform((value) => new Date(value)),
    duplicateAction: z.enum(['NEW', 'UPDATE'], 'DUPLICATE_ACTION_INVALID').optional(),
    syncedFromOffline: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  })
  .refine((value) => isWithinSriLanka(value), {
    path: ['lat'],
    message: 'LOCATION_OUTSIDE_SRI_LANKA',
  });

export const rejectSchema = z.object({
  reason: z.string().trim().min(1, 'REASON_REQUIRED').max(500, 'REASON_TOO_LONG'),
});

const csv = <T extends string>(allowed: readonly T[]) =>
  z
    .string()
    .transform((value) =>
      value.split(',').filter((item): item is T => (allowed as readonly string[]).includes(item)),
    );

export const queueQuerySchema = z.object({
  status: csv(CLUSTER_STATUSES).default(['OPEN', 'ESCALATION_RECOMMENDED']),
});
export const historyQuerySchema = z.object({
  status: z.enum(REPORT_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
});
```

> Zod here is **4.x**. Before relying on `z.iso.datetime`, `z.coerce.number('CODE')` and the `error:` option, open
> `node_modules/zod/package.json` and check the installed version's docs; `shared/contracts/auth.ts` shows the idioms
> that are known to work in this repo (`z.enum(VALUES, 'CODE')`, `.min(n, 'CODE')`). Adjust and let the schema tests
> prove the codes.

`api/dto.ts` exports `toReportDto(report: HazardReport)`, `toClusterSummaryDto(scored: ScoredCluster)`,
`toClusterDetailDto(scored)` producing exactly the shapes in `IMPLEMENTATION_PLAN.md` (dates → ISO strings;
`photoUrl` = `photo?.url`; `escalation: { recommended, unmet, requiredVerified }`).

```ts
// api/photoUpload.ts
import type { RequestHandler } from 'express';
import multer, { MulterError } from 'multer';
import { ValidationError } from '@shared/errors/DomainError';
import type { UploadedPhoto } from '../domain/types';

/** One optional `photo` part, held in memory, cut off at the size limit. */
export function createPhotoUpload(maxBytes: number): RequestHandler {
  const parse = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1 },
  }).single('photo');
  return (req, res, next) => {
    parse(req, res, (error: unknown) => {
      if (error instanceof MulterError) {
        const code = error.code === 'LIMIT_FILE_SIZE' ? 'PHOTO_TOO_LARGE' : 'PHOTO_UNREADABLE';
        next(
          new ValidationError(
            [{ field: 'photo', code }],
            'The photo could not be accepted.',
            'INVALID_PHOTO',
          ),
        );
        return;
      }
      next(error);
    });
  };
}

export function uploadedPhotoOf(file: Express.Multer.File | undefined): UploadedPhoto | undefined {
  return file ? { content: new Uint8Array(file.buffer), mimeType: file.mimetype } : undefined;
}
```

**Schema tests:** a full valid body parses to numbers / `Date` / boolean · defaults (`description ''`,
`syncedFromOffline false`) · each rejection yields its machine code through `parseOrThrow` (`HAZARD_TYPE_REQUIRED`,
`CLIENT_REPORT_ID_INVALID`, `DESCRIPTION_TOO_LONG` at 501 chars and ok at 500, `LOCATION_REQUIRED` when `lat` missing,
`LOCATION_INVALID` at 91, `LOCATION_OUTSIDE_SRI_LANKA` for London, `CAPTURED_AT_INVALID`, `DUPLICATE_ACTION_INVALID`) ·
`rejectSchema` trims and requires · `queueQuerySchema` default and `?status=ESCALATED,BOGUS` → `['ESCALATED']` ·
`historyQuerySchema` rejects an unknown status. **DTO tests:** every field of each DTO for one full and one minimal
entity.

- [ ] Tests → fail → implement → pass → commit `feat(uc3): api schemas, dtos and photo upload wrapper`.

### Task B4.3: Router and composition

**Files:** Create `api/hazard-reports.http.ts` · Modify `composition.ts` · Test `__tests__/hazard-reports.http.test.ts`

```ts
// api/hazard-reports.http.ts
import { Router, type RequestHandler } from 'express';
import { getAuth } from '@shared/auth';
import { NotFoundError } from '@shared/errors/DomainError';
import { parseOrThrow } from '@shared/errors/zod';
import type { ModuleContext } from '@shared/module';
import type { ReportSearch } from '../application/ports';
import type { ReportReviewService } from '../application/ReportReviewService';
import type {
  ReportSubmissionService,
  SubmitReportCommand,
} from '../application/ReportSubmissionService';
import type { ReportStatus } from '../domain/types';
import { toClusterDetailDto, toClusterSummaryDto, toReportDto } from './dto';
import { uploadedPhotoOf } from './photoUpload';
import { historyQuerySchema, queueQuerySchema, rejectSchema, submitReportSchema } from './schemas';

export interface HazardReportsApi {
  submission: ReportSubmissionService;
  review: ReportReviewService;
  upload: RequestHandler;
  /** Absolute path of a stored photo, or undefined. */
  resolvePhoto(fileName: string): string | undefined;
}

type Handlers = Record<string, RequestHandler>;
const param = (value: string | string[] | undefined): string => String(value);

function reporterHandlers({ submission, review, resolvePhoto }: HazardReportsApi): Handlers {
  return {
    submit: async (req, res) => {
      const auth = getAuth(req);
      const { lat, lng, locationSource, accuracyM, ...fields } = parseOrThrow(
        submitReportSchema,
        req.body,
      );
      const result = await submission.submit({
        ...fields,
        reporterId: auth.userId,
        reporterRole: auth.role as SubmitReportCommand['reporterRole'],
        location: { lat, lng, source: locationSource, accuracyM },
        photo: uploadedPhotoOf(req.file),
      });
      res
        .status(result.outcome === 'CREATED' ? 201 : 200)
        .json({ outcome: result.outcome, report: toReportDto(result.report) });
    },
    list: async (req, res) => {
      const auth = getAuth(req);
      const reports =
        auth.role === 'DUTY_OFFICER'
          ? await review.history(toSearch(parseOrThrow(historyQuerySchema, req.query)))
          : await review.mine(auth.userId);
      res.json(reports.map(toReportDto));
    },
    detail: async (req, res) => {
      const auth = getAuth(req);
      const reader = { userId: auth.userId, isOfficer: auth.role === 'DUTY_OFFICER' };
      res.json(toReportDto(await review.report(param(req.params.id), reader)));
    },
    photo: (req, res) => {
      const file = resolvePhoto(param(req.params.fileName));
      if (!file) throw new NotFoundError('PHOTO_NOT_FOUND', 'This photo does not exist.');
      res.sendFile(file, (error) => {
        if (error && !res.headersSent)
          res
            .status(404)
            .json({ error: { code: 'PHOTO_NOT_FOUND', message: 'This photo does not exist.' } });
      });
    },
  };
}

/** The query string calls it `q`; the repository port calls it `text`. */
const toSearch = ({ status, q }: { status?: ReportStatus; q?: string }): ReportSearch => ({
  status,
  text: q,
});

function officerHandlers({ review }: HazardReportsApi): Handlers {
  return {
    queue: async (req, res) => {
      const { status } = parseOrThrow(queueQuerySchema, req.query);
      res.json((await review.queue(status)).map(toClusterSummaryDto));
    },
    cluster: async (req, res) => {
      res.json(toClusterDetailDto(await review.cluster(param(req.params.id))));
    },
    escalate: async (req, res) => {
      res.json(
        toClusterDetailDto(await review.escalate(param(req.params.id), getAuth(req).userId)),
      );
    },
    verify: async (req, res) => {
      const result = await review.verify(param(req.params.id), getAuth(req).userId);
      res.json({
        report: toReportDto(result.report),
        cluster: toClusterSummaryDto(result.cluster),
      });
    },
    reject: async (req, res) => {
      const { reason } = parseOrThrow(rejectSchema, req.body);
      const result = await review.reject(param(req.params.id), getAuth(req).userId, reason);
      res.json({
        report: toReportDto(result.report),
        cluster: toClusterSummaryDto(result.cluster),
      });
    },
  };
}

/** HTTP routes for `/api/hazard-reports/*`: guards first, parse, call a service, map to a DTO. No rules here. */
export function createHazardReportsRouter(
  api: HazardReportsApi,
  { guards }: ModuleContext,
): Router {
  const reporter = reporterHandlers(api);
  const officer = officerHandlers(api);
  const reportersOnly = guards.requireRole('CITIZEN', 'COMMUNITY_VOLUNTEER');
  const officersOnly = guards.requireRole('DUTY_OFFICER');
  const anyUc3Role = guards.requireRole('CITIZEN', 'COMMUNITY_VOLUNTEER', 'DUTY_OFFICER');
  const router = Router();
  router.use(guards.requireAuth);

  router.post('/', reportersOnly, api.upload, reporter.submit);
  router.get('/', anyUc3Role, reporter.list);
  // Fixed paths before `/:id`, or Express would treat "clusters" as a report id.
  router.get('/clusters', officersOnly, officer.queue);
  router.get('/clusters/:id', officersOnly, officer.cluster);
  router.post('/clusters/:id/escalate', officersOnly, officer.escalate);
  router.get('/photos/:fileName', anyUc3Role, reporter.photo);
  router.get('/:id', anyUc3Role, reporter.detail);
  router.post('/:id/verify', officersOnly, officer.verify);
  router.post('/:id/reject', officersOnly, officer.reject);
  return router;
}
```

```ts
// composition.ts
import { join } from 'node:path';
import type { ModuleFactory } from '@shared/module';
import { CentroidDistrictLocator } from '@shared/geo/districts';
import { createHazardReportsRouter } from './api/hazard-reports.http';
import { createPhotoUpload } from './api/photoUpload';
import { ClusteringService } from './application/ClusteringService';
import { ReportReviewService } from './application/ReportReviewService';
import { ReportSubmissionService } from './application/ReportSubmissionService';
import type { DistrictResolver } from './application/ports';
import { DEFAULT_CLUSTERING_CONFIG as config } from './domain/ClusteringConfig';
import { DuplicateDetector } from './domain/DuplicateDetector';
import { EscalationPolicy } from './domain/EscalationPolicy';
import { PhotoValidator } from './domain/PhotoValidator';
import { WeightedPriorityScorer } from './domain/PriorityScorer';
import { DiskPhotoStorage } from './infrastructure/DiskPhotoStorage';
import { MongoHazardReportRepository } from './infrastructure/MongoHazardReportRepository';
import { MongoReportClusterRepository } from './infrastructure/MongoReportClusterRepository';

const PHOTO_DIRECTORY =
  process.env.HAZARD_PHOTO_DIR ?? join(process.cwd(), '.data', 'hazard-photos');

/** UC-3 Submit and Verify Hazard Report: wiring only. The one place concrete classes are built. */
export const createHazardReportsModule: ModuleFactory = (ctx) => {
  const reports = new MongoHazardReportRepository();
  const clusters = new MongoReportClusterRepository();
  const photos = new DiskPhotoStorage(PHOTO_DIRECTORY);
  const locator = new CentroidDistrictLocator();
  const districts: DistrictResolver = {
    districtOf: (point) => locator.nearest(point, 1)[0] ?? 'COLOMBO',
  };
  const clustering = new ClusteringService({
    reports,
    clusters,
    districts,
    config,
    clock: ctx.clock,
    ids: ctx.ids,
    scorer: new WeightedPriorityScorer(config),
    policy: new EscalationPolicy(config),
  });
  const submission = new ReportSubmissionService({
    reports,
    photos,
    clustering,
    config,
    clock: ctx.clock,
    ids: ctx.ids,
    audit: ctx.auditLog,
    detector: new DuplicateDetector(config),
    photoValidator: new PhotoValidator(config),
  });
  const review = new ReportReviewService({
    reports,
    clusters,
    clustering,
    events: ctx.eventBus,
    audit: ctx.auditLog,
    clock: ctx.clock,
  });
  return {
    name: 'hazard-reports',
    mountPath: '/api/hazard-reports',
    router: createHazardReportsRouter(
      {
        submission,
        review,
        upload: createPhotoUpload(config.photoMaxBytes),
        resolvePhoto: (name) => photos.resolve(name),
      },
      ctx,
    ),
  };
};
```

`.data/` is already git-ignored. `backend/src/__tests__/bootstrap.integration.test.ts` builds every module, so this
composition must not touch the disk or the database at construction time (it does not).

**HTTP tests.** `createModuleHarness(createHazardReportsModule)` would build the Mongo repositories, so the HTTP tests
use a **test factory** in `testing/httpModule.ts` (not measured) that wires the same router to the in-memory
repositories, `FakePhotoStorage` and the harness `ctx`; pass it to `createModuleHarness`. Send multipart with supertest:
`h.as({ role: 'CITIZEN', userId: 'citizen-1' }).post('/api/hazard-reports').field('clientReportId', 'client-0001')….attach('photo', Buffer.from([0xff,0xd8,0xff,0,0]), { filename: 'p.jpg', contentType: 'image/jpeg' })`.

| Test                                                                                               | Expect                                                                                        |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `UC-3 steps 7–10: a citizen submits a report with a photo`                                         | 201, `outcome CREATED`, `report.status PENDING`, `photoUrl` set, `clusterId` set              |
| `H7: the same clientReportId again returns 200 ALREADY_RECEIVED`                                   | 200                                                                                           |
| `UC-3 E3: a second report from the same spot returns 409 DUPLICATE_SUSPECTED with the existing id` | 409, `error.details.existingReportId`                                                         |
| `UC-3 E3: duplicateAction=UPDATE returns 200 UPDATED_EXISTING`                                     | 200                                                                                           |
| `UC-3 A1/H6: syncedFromOffline=true merges without asking`                                         | 200 `UPDATED_EXISTING`                                                                        |
| `UC-3 E2: a text file posing as a JPEG is refused`                                                 | 400 `INVALID_PHOTO`, `fields[0].code PHOTO_UNREADABLE`                                        |
| `UC-3 E2: a photo over 5 MB is refused`                                                            | attach `Buffer.alloc(5 * 1024 * 1024 + 1)` → 400 `INVALID_PHOTO`, `PHOTO_TOO_LARGE`           |
| `a second file part is refused as an invalid photo`                                                | attach two files → 400 `INVALID_PHOTO` (covers the non-size `MulterError` branch)             |
| `missing hazard type and location → 400 with both fields listed`                                   | `VALIDATION_FAILED`                                                                           |
| `a duty officer cannot submit` / `a DMC officer cannot list`                                       | 403 `FORBIDDEN_ROLE`                                                                          |
| `no cookie → 401`                                                                                  | use `request(h.app)` directly                                                                 |
| `no CSRF header on POST → 403 CSRF_HEADER_MISSING`                                                 |                                                                                               |
| `GET / as a reporter returns only their own reports`                                               | two reporters                                                                                 |
| `GET /?status=PENDING&q=bridge as an officer filters history`                                      |                                                                                               |
| `GET /clusters returns the queue by score` · `GET /clusters as a citizen → 403`                    |                                                                                               |
| `GET /clusters/:id returns reports and unmet requirements` · unknown → 404 `CLUSTER_NOT_FOUND`     |                                                                                               |
| `GET /:id as the owner → 200; as another citizen → 404; as an officer → 200`                       |                                                                                               |
| `POST /:id/verify → 200 with the rescored cluster` · twice → 409                                   |                                                                                               |
| `UC-3 A2: POST /:id/reject without a reason → 400; with one → 200`                                 |                                                                                               |
| `UC-3 step 16: POST /clusters/:id/escalate publishes the event`                                    | `h.events.ofType('ClusterEscalationRequested')` length 1; second call 409                     |
| `GET /photos/<name> streams a stored photo`                                                        | make `resolvePhoto` in the test factory point at a temp file → 200, `content-type image/jpeg` |
| `GET /photos/unknown.jpg → 404 PHOTO_NOT_FOUND`                                                    | both the "not ours" branch and the "file missing on disk" callback branch (two tests)         |

- [ ] Tests → fail → implement → pass.
- [ ] From the repo root: `npm run lint && npm run typecheck -w backend && npm test -w backend` → all green, UC3 module
      at 100%. Fix any uncovered branch by adding the missing test, never by `istanbul ignore`.
- [ ] Manual smoke test: `npm run dev`, sign in as a demo citizen in a REST client, POST a report, GET the queue as the
      duty officer.
- [ ] Commit `feat(uc3): hazard-reports http api and composition`. **Tell the team the API is up (unblocks W\* / M2).**

---

## Phase B5 – Seed

### Task B5.1: Five demo clusters

**Files:** Modify `seed/index.ts` (not measured).

Fixed ids (`seed-cluster-kalutara`, `seed-report-kalutara-01`, …) and `replaceOne(..., { upsert: true })` through the
two Mongo repositories, so the seed is idempotent **and re-running it refreshes every timestamp relative to now**
(scores decay with recency, so run `npm run seed` shortly before the demo). Reporters: the six demo citizens
(`usr-citizen-1…5`, `usr-volunteer-1`). Build reports with `HazardReport.restore`, then compute each cluster with the
real `WeightedPriorityScorer` + `ReportCluster.rescore` so stored scores are never hand-typed.

| Cluster              | Centre (lat, lng) | Reports | Mix (all citizens)                          | Newest report | Expected        |
| -------------------- | ----------------- | ------- | ------------------------------------------- | ------------- | --------------- |
| Kalutara river basin | 6.5854, 79.9607   | 14      | 10 pending FLOOD + 4 already REJECTED FLOOD | 101 min ago   | **87 High**     |
| Ratnapura            | 6.6828, 80.3992   | 9       | 8 pending FLOOD + 1 REJECTED                | 302 min ago   | **64 Elevated** |
| Gampaha              | 7.0873, 79.9925   | 6       | 6 pending ROAD_BLOCKAGE                     | 274 min ago   | **48 Moderate** |
| Beruwala             | 6.4788, 79.9828   | 4       | 4 pending ROAD_BLOCKAGE                     | 274 min ago   | **39 Moderate** |
| Pelmadulla           | 6.6205, 80.5419   | 3       | 2 pending OTHER + 1 REJECTED                | 302 min ago   | **22 Low**      |

Why Kalutara has exactly 10 active reports: density is capped at 10, so with 10 the demo step "reject one → the score
drops" is visible (87 → 82) and it stays High, so "verify three → Escalation recommended" still works. Spread report
pins within ~600 m of the centre and capture times backwards from the newest. Give 3 Kalutara reports a description
mentioning "bridge" for the history search demo. Log each cluster's computed score; if one is off by a point because of
rounding, adjust the newest-report age by a minute.

- [ ] Implement; `npm run seed -- --fresh`; check the logged scores match the table; `GET /clusters` as the duty
      officer shows 87 / 64 / 48 / 39 / 22 in that order.
- [ ] Run `npm run seed` again → no duplicates, same five clusters.
- [ ] Commit `feat(uc3): seed five demo clusters`.
- [ ] Update the status table in `IMPLEMENTATION_PLAN.md` (B1–B5 DONE).

---

## Traceability (fill the class/test columns into the report)

| Change                             | Implemented by                                                                    | Proved by                                                    |
| ---------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| H4 human-confirmed escalation      | `ReportCluster.recommend/markEscalated`, `ReportReviewService.escalate`           | `ReportReviewService.test` "escalate …" (4 tests)            |
| H5 defined parameters              | `ClusteringConfig`, `WeightedPriorityScorer`, `PriorityScore`                     | `PriorityScorer.test` (worked example = 92, band boundaries) |
| H6 duplicate online vs offline     | `ReportSubmissionService.resolveDuplicate`                                        | `ReportSubmissionService.test` E3 rows                       |
| H7 `clientReportId` idempotency    | unique index + `ReportSubmissionService.submit/acknowledgeRace`                   | "same clientReportId twice", "lost insert race"              |
| H8 reject reason, cluster closes   | `HazardReport.reject`, `ReportCluster.rescore`                                    | "reject requires a reason", "closes the cluster"             |
| H9 control objects, event hand-off | `ClusteringService`, `ReportSubmissionService`, `ReportReviewService`, `EventBus` | payload test with `satisfies ClusterEscalationRequested`     |
| H11 warnable hazard (D6)           | `EscalationPolicy.warningHazardType`                                              | `EscalationPolicy.test` H11 rows                             |
