# Plan C – UC3 Mobile App (`mobile/`) – Reporter (Citizen / Community Volunteer)

## Progress — 9 October 2026

The authoritative phase table is [IMPLEMENTATION_PLAN.md](../../../IMPLEMENTATION_PLAN.md). The task examples below describe the original plan; their historical unchecked steps are not a current progress report.

| Phase | Progress                                                                                    |
| ----- | ------------------------------------------------------------------------------------------- |
| M0    | DONE — foundation and installed standalone APK accepted                                     |
| M1    | DONE — validators and journal core                                                          |
| M2    | DONE — corrected photo upload accepted on the phone                                         |
| M3    | DONE — sync engine, 646 passing mobile tests; commit `26aec6e`                              |
| M4    | WIP — offline save/login/reconnect accepted on phone; closed-app OS delivery pending        |
| M5    | WIP — reporter history/offline status and recovery UI implemented; phone acceptance pending |
| M6–M7 | TODO — manual location/photo recovery and device acceptance                                 |

See `evidence/m0` through `evidence/m4` for verification details. M4 device acceptance is tracked separately from automated implementation checks.

M5 implementation and installation checks are recorded in `evidence/m5/README.md`. Its history cache is scoped per owner; queue subscriptions and server reads are coordinated by a single controller. After an offline save, the form retains its existing retry behaviour and offers **Report another hazard** explicitly, rather than automatically clearing the form.

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` or
> `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax. Read `IMPLEMENTATION_PLAN.md` (decisions, REST
> contract) and **`D-offline-sync-design.md`** first. Phases M1 and M3 need no device and no backend.

**Goal:** Phase A of the scenario (steps 1–7, A1, E1, E2, E3) as a native app: report a hazard with photo and location,
keep working offline, and deliver queued reports through an operating-system background job even when the app is closed.

**Architecture:** Expo Router app. All offline logic is plain TypeScript behind ports (`offline/`, `domain/`, `api/`)
with **no React and no Expo imports**; Expo is touched only in thin adapters (`adapters/`, `background/`). One
`composition.ts` builds the runtime; both the screens and the headless background task call it.

**Tech stack:** Expo SDK 57 (installed) · Expo Router · `expo-dev-client` · `expo-task-manager` +
`expo-background-task` · `expo-notifications` · `expo-location` · `expo-image-picker` · `expo-file-system` ·
`expo-crypto` · `@react-native-async-storage/async-storage` · `@react-native-community/netinfo` ·
`react-native-webview` (map pin) · Jest with `jest-expo` + `@testing-library/react-native`.

## Status of the scaffold (7 Oct)

Task M0.1 is **done except the development build**: `mobile/` exists on branch `feat/uc3-hazard-reports` (Expo SDK 57,
React Native 0.86, React 19.2.3), with every native package installed, `app.json` plugins set, `index.ts` as the entry,
a placeholder `background/syncTask.ts`, three placeholder tabs, and Jest working. Verified: `npx tsc --noEmit`,
`npx jest`, `npx expo export --platform android` and `npx expo-doctor` all pass.

Differences from what the tasks below were written against (the tasks have been corrected where it matters):

- Routes live in **`mobile/src/app/`**, not `mobile/app/`. The alias `@/` already means `mobile/src/`.
- TypeScript 6 needs `"types": ["jest"]` in `tsconfig.json` (added).
- `react-test-renderer` must be pinned to React's exact version, `19.2.3` (done).
- `mobile/AGENTS.md` came with the template: check the versioned Expo docs before using any Expo API.

## Global constraints

- Rules mirrored from the server (same numbers, tested on both sides): photo ≤ 5 MB, `image/jpeg | image/png |
image/webp`; description ≤ 500 characters; hazard type and location required.
- `domain/`, `offline/`, `api/` import **nothing** from `react`, `react-native`, `expo*`, `@react-native-*`. They take
  `Clock` and `IdGenerator` ports: no `new Date()`, `Date.now()`, `Math.random()` there.
- Every submission is written to the journal **before** any upload attempt (Plan D §4).
- An entry leaves the journal only after the server acknowledged it (`201` / `200`), or the reporter discarded it.
- Permissions (camera, location, notifications) are requested at the moment they are needed, with a one-line reason.
- Root lint rules apply here too: no `any`, no `console`, no `todo` comments, ≤ 5 parameters, complexity ≤ 8.
- **Installed versions are newer than any example.** Before writing an adapter, open the package's
  `node_modules/<pkg>/build/*.d.ts` (or its docs for the installed SDK) and confirm the names used below. Each Expo
  API is used in exactly one adapter file so a mismatch is a one-file fix.
- **Visual design is yours.** Tasks specify behaviour, states, accessible labels and tests – not layout or styling.
- Coverage: `src/features/hazard-reports/{domain,offline,api}/**` and `src/shared/api/**` ≥ 90% lines (aim for 100%).

## File map

```
mobile/
├─ index.ts                         entry: imports the background task, then expo-router   (critical – see M4.2)
├─ app.json  eas.json  package.json  jest.config.js  tsconfig.json  .env.example
└─ src/
   ├─ app/                          Expo Router routes
   │  ├─ _layout.tsx                providers + auth gate + sync triggers
   │  ├─ index.tsx  sign-in.tsx
   │  └─ (tabs)/_layout.tsx  report.tsx  my-reports.tsx  alerts.tsx      one-line re-exports
   ├─ shared/
   │  ├─ config.ts                  API base URL
   │  ├─ api/errors.ts  api/apiClient.ts        CSRF header, cookies, refresh-once, timeout
   │  ├─ session/SessionStore.ts  SessionProvider.tsx
   │  └─ theme/tokens.ts            colours from the web's index.css
   └─ features/
      ├─ alerts/                    Member 1 (UC1) – placeholder screen only
      └─ hazard-reports/
         ├─ domain/      reportRules.ts  types.ts  validateReportDraft.ts  validatePickedPhoto.ts  mergeMyReports.ts
         ├─ offline/     ports.ts  types.ts  OfflineReportQueue.ts  SyncManager.ts  classifySubmitResponse.ts
         │               submitReport.ts  taskResult.ts
         ├─ api/         submitParts.ts  HttpReportUploader.ts  MyReportsApi.ts
         ├─ adapters/    AsyncStorageQueueStorage.ts  FileSystemPhotoStore.ts  NetInfoConnectivityMonitor.ts
         │               ExpoSyncNotifier.ts  AsyncStorageRunLog.ts  ApiSessionGate.ts  system.ts  ExpoLocationProvider.ts
         ├─ background/  syncTask.ts                 defineTask + ensureSyncTaskRegistered
         ├─ composition.ts                           builds the runtime once (headless-safe)
         ├─ hooks/       useCurrentLocation.ts  useQueue.ts  useMyReports.ts  useSyncTriggers.ts
         ├─ components/  HazardTiles  PhotoField  MapPin  OfflineBanner  DuplicatePrompt  StatusChip
         ├─ screens/     ReportHazardScreen.tsx  MyReportsScreen.tsx
         ├─ testing/     fakes.ts                    in-memory ports for tests
         └─ __tests__/
```

---

## Phase M0 – Mobile foundation (shared with UC1; announce when pushed)

### Task M0.1: Create the app and the development build

Run from `D:\GitHub\Disaster_Managment_System` in Git Bash.

- [ ] Create and clean the project:

```bash
npx create-expo-app@latest mobile
```

```bash
cd mobile && npm run reset-project
```

- [ ] Install native packages with versions matched to the SDK:

```bash
npx expo install expo-dev-client expo-task-manager expo-background-task expo-notifications expo-location expo-image-picker expo-file-system expo-crypto expo-build-properties @react-native-async-storage/async-storage @react-native-community/netinfo react-native-webview
```

```bash
npx expo install jest-expo jest @types/jest @testing-library/react-native --dev
```

- [ ] `mobile/` stays **out of** the root `workspaces` (its React / React Native versions must not be hoisted together
      with the web app's). It has its own `package-lock.json`.
- [ ] `app.json` (check each plugin's option names in its docs for the installed SDK):

```json
{
  "expo": {
    "name": "Safe Zone",
    "slug": "safezone",
    "scheme": "safezone",
    "version": "0.1.0",
    "orientation": "portrait",
    "android": { "package": "lk.safezone.mobile" },
    "ios": { "bundleIdentifier": "lk.safezone.mobile" },
    "plugins": [
      "expo-router",
      "expo-background-task",
      "expo-notifications",
      [
        "expo-location",
        {
          "locationWhenInUsePermission": "Safe Zone uses your location to place your hazard report on the map."
        }
      ],
      [
        "expo-image-picker",
        {
          "cameraPermission": "Safe Zone uses the camera to attach a photo to your hazard report.",
          "photosPermission": "Safe Zone lets you attach an existing photo to your hazard report."
        }
      ],
      ["expo-build-properties", { "android": { "usesCleartextTraffic": true } }]
    ]
  }
}
```

`usesCleartextTraffic` lets the app call the laptop's `http://` API over Wi-Fi (a release build blocks plain HTTP
otherwise). Only **foreground** location is requested – no background location permission.

- [ ] `package.json`: set `"main": "index.ts"` and scripts
      `"test": "jest"`, `"typecheck": "tsc --noEmit"`, `"start": "expo start --dev-client"`.
- [ ] `mobile/index.ts` (the import order matters; explained in M4.2):

```ts
import './src/features/hazard-reports/background/syncTask';
import 'expo-router/entry';
```

Until M4.2 exists, create `background/syncTask.ts` as an empty module (`export {};`).

- [ ] `jest.config.js`:

```js
/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  collectCoverageFrom: [
    'src/features/hazard-reports/{domain,offline,api}/**/*.ts',
    'src/shared/api/**/*.ts',
  ],
  coverageThreshold: { global: { lines: 90, branches: 85, functions: 90, statements: 90 } },
};
```

- [ ] `.env.example` → `EXPO_PUBLIC_API_URL=http://192.168.1.20:4000`; copy to `.env.local` with the laptop's LAN IP
      (`ipconfig` → IPv4 of the Wi-Fi adapter). `.env.*` is already git-ignored at the root.
- [ ] **Build the development client** (one of):
  - Cloud (no Android toolchain needed): `npm i -g eas-cli`, `eas login`, `eas build:configure`, make the
    `development` profile in `eas.json` `{ "developmentClient": true, "distribution": "internal", "android": {
"buildType": "apk" } }`, then `eas build --profile development --platform android`. Install the APK from the link.
    The free queue can take a while – start it early and keep working on M1 / M3 meanwhile.
  - Local: Android Studio + SDK + JDK 17 installed, phone on USB with debugging on, `npx expo run:android`.
  - A rebuild is needed only when a native package or `app.json` plugin changes. JavaScript reloads live.
- [ ] `npx expo start --dev-client`, open the app on the phone → the blank template screen loads. Allow the Windows
      Firewall prompt for Node (private networks) so the phone can reach Metro and the API.
- [ ] Commit `chore(mobile): expo app, dev client, native modules`.

### Task M0.2: Root tooling (shared files – announce in the group chat)

- [ ] `eslint.config.mjs`: add to `ignores`: `'mobile/android/**', 'mobile/ios/**', 'mobile/.expo/**',
'mobile/dist/**'`; add after the frontend blocks:

```js
  // ---- Mobile (Expo) ---------------------------------------------------------------------------
  {
    files: ['mobile/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'max-lines-per-function': ['error', { max: 90, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // The offline core stays free of React and Expo so Jest can test it without native mocks.
    files: [
      'mobile/src/features/*/domain/**/*.ts',
      'mobile/src/features/*/offline/**/*.ts',
      'mobile/src/features/*/api/**/*.ts',
    ],
    rules: {
      ...restrict({
        patterns: [
          {
            group: ['react', 'react-native', 'react-native-*', 'expo', 'expo-*', '@react-native-*/*', '**/adapters/**', '**/screens/**'],
            message: 'The offline core must not import React, React Native, Expo or adapters. Depend on a port instead.',
          },
        ],
      }),
      ...DETERMINISM,
    },
  },
```

- [ ] `.prettierignore`: add `mobile/android`, `mobile/ios`, `mobile/.expo`, `mobile/package-lock.json`.
- [ ] `.github/CODEOWNERS`: add `/mobile/src/features/hazard-reports/`, uncomment the UC-3 lines with your username.
- [ ] `README.md`: a "Mobile app" section (prerequisites, `EXPO_PUBLIC_API_URL`, how to install the dev build, demo
      logins are the seeded citizens' phone numbers).
- [ ] `npm run lint && npm run format:check` at the root → green. Commit `chore: lint and format rules for mobile`.

### Task M0.3: API client, session, sign-in, tabs

**Files:** Create `src/shared/config.ts`, `shared/api/errors.ts`, `shared/api/apiClient.ts`,
`shared/session/SessionStore.ts`, `shared/session/SessionProvider.tsx`, `shared/theme/tokens.ts`, `src/app/_layout.tsx`,
`src/app/sign-in.tsx`, `src/app/(tabs)/*` · Test `src/shared/api/__tests__/apiClient.test.ts`

```ts
// src/shared/config.ts
/** The laptop's LAN address in development; 10.0.2.2 is "the host machine" from the Android emulator. */
export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:4000').replace(
  /\/+$/,
  '',
);
```

```ts
// src/shared/api/errors.ts
/** The server answered with `{ error: { code, message, … } }`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The request never reached the server (offline, timeout, server down). */
export class NetworkError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('The network request failed.', options);
    this.name = 'NetworkError';
  }
}
```

```ts
// src/shared/api/apiClient.ts
import { ApiError, NetworkError } from './errors';

export type HttpMethod = 'GET' | 'POST';
export interface ApiResponse {
  status: number;
  body: unknown;
}
export interface ApiClient {
  /** Never throws for an HTTP status. Throws `NetworkError` when the server was not reached. Refreshes the session once. */
  send(method: HttpMethod, path: string, body?: unknown): Promise<ApiResponse>;
  /** Like `send`, but returns the body and throws `ApiError` for a non-2xx status. */
  request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T>;
}
export interface ApiClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Same header the web app sends: the API refuses state-changing requests without it. */
const CSRF_HEADERS = { Accept: 'application/json', 'X-Requested-With': 'SafeZone' };
const REFRESHABLE = new Set(['TOKEN_EXPIRED', 'UNAUTHENTICATED']);
const SELF_MANAGED = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/logout',
];

interface ErrorShape {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

export function readError(body: unknown): ErrorShape {
  const error = (body as { error?: Partial<ErrorShape> } | null)?.error;
  return {
    code: error?.code ?? 'UNKNOWN',
    message: error?.message ?? 'Request failed',
    details: error?.details ?? {},
  };
}

const isForm = (body: unknown): body is FormData =>
  typeof FormData !== 'undefined' && body instanceof FormData;

function toInit(method: HttpMethod, body: unknown, signal: AbortSignal): RequestInit {
  if (body === undefined) return { method, headers: CSRF_HEADERS, credentials: 'include', signal };
  // For multipart the runtime must write the boundary itself: never set Content-Type by hand.
  if (isForm(body)) return { method, headers: CSRF_HEADERS, credentials: 'include', signal, body };
  const headers = { ...CSRF_HEADERS, 'Content-Type': 'application/json' };
  return { method, headers, credentials: 'include', signal, body: JSON.stringify(body) };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/**
 * The session lives in httpOnly cookies kept by the platform cookie jar, so it survives the app
 * being closed: a headless background run presents the same cookies (Plan D §8).
 */
export function createApiClient({
  baseUrl,
  fetchImpl,
  timeoutMs = 60_000,
}: ApiClientOptions): ApiClient {
  let refreshing: Promise<boolean> | undefined;

  async function raw(method: HttpMethod, path: string, body: unknown): Promise<ApiResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await (fetchImpl ?? fetch)(
        `${baseUrl}${path}`,
        toInit(method, body, controller.signal),
      );
      return { status: response.status, body: await readJson(response) };
    } catch (cause) {
      throw new NetworkError({ cause });
    } finally {
      clearTimeout(timer);
    }
  }

  async function refreshOnce(): Promise<boolean> {
    const { status, body } = await raw('POST', '/api/auth/refresh', undefined);
    // The foreground app refreshed a moment ago: the cookie jar already holds the new token.
    return status < 300 || readError(body).code === 'TOKEN_ROTATED';
  }

  function refresh(): Promise<boolean> {
    refreshing ??= refreshOnce().finally(() => {
      refreshing = undefined;
    });
    return refreshing;
  }

  async function send(method: HttpMethod, path: string, body?: unknown): Promise<ApiResponse> {
    const first = await raw(method, path, body);
    const expired =
      first.status === 401 &&
      REFRESHABLE.has(readError(first.body).code) &&
      !SELF_MANAGED.includes(path);
    if (!expired || !(await refresh())) return first;
    return raw(method, path, body);
  }

  async function request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
    const response = await send(method, path, body);
    if (response.status >= 200 && response.status < 300) return response.body as T;
    const error = readError(response.body);
    throw new ApiError(response.status, error.code, error.message, error.details);
  }

  return { send, request };
}
```

**`apiClient` tests** (fake `fetchImpl` returning scripted `{ status, json }` objects and recording calls):

| Test                                                                               | Expect                                  |
| ---------------------------------------------------------------------------------- | --------------------------------------- |
| sends the CSRF header and `credentials: 'include'` on every request                |                                         |
| JSON body sets `Content-Type`; a `FormData` body does **not**                      |                                         |
| a 2xx returns the parsed body; a non-JSON body returns `undefined`                 |                                         |
| `401 UNAUTHENTICATED` → one `POST /api/auth/refresh` → the request is retried once | 3 calls                                 |
| `401 TOKEN_EXPIRED` behaves the same                                               |                                         |
| refresh answering `TOKEN_ROTATED` still retries                                    |                                         |
| refresh failing returns the original 401 and does not retry                        | 2 calls                                 |
| a second 401 after a successful refresh is returned, not refreshed again           |                                         |
| two concurrent expired requests share **one** refresh                              | exactly 1 refresh call                  |
| `/api/auth/login` answering 401 is never refreshed                                 | 1 call                                  |
| a rejected fetch → `NetworkError`                                                  |                                         |
| a request slower than `timeoutMs` → `NetworkError`                                 | `timeoutMs: 20`, fetch honours `signal` |
| `request` throws `ApiError` with status, code, message, details                    |                                         |
| `readError(undefined)` → `UNKNOWN`                                                 |                                         |

**Session**

- `SessionStore` (AsyncStorage key `safezone.session`): `load()`, `save(user)`, `clear()` for
  `{ userId, role, displayName }`. Caching the user lets the app open **offline** already knowing who owns new reports.
- `SessionProvider`: on mount `load()` (instant, offline-safe), then if online `GET /api/auth/me` – on `401` clear the
  session; on a network error keep the cached user. `signIn(identifier, password)` → `POST /api/auth/login`
  `{ identifier, password }` → `save(body.user)`. `signOut()` → `POST /api/auth/logout`, `clear()`. Journal entries
  are **not** deleted on sign-out; they belong to their `ownerId` (Plan D §5 rule 6). If the journal holds entries,
  ask for confirmation first ("2 reports are not sent yet").
- Only `CITIZEN` and `COMMUNITY_VOLUNTEER` may enter; any other role sees "Officers use the web dashboard".
- `src/app/_layout.tsx`: `<SessionProvider>` → if no user, render `sign-in`; else the tabs. It also mounts
  `useSyncTriggers()` (M4.3).
- `src/app/sign-in.tsx`: phone number + password, error text from the API's `message`, _Sign in_ disabled while busy.
  No password is stored anywhere by the app.
- `src/app/(tabs)/_layout.tsx`: three tabs _Report_, _My reports_, _Alerts_. `report.tsx` =
  `export { ReportHazardScreen as default } from '@/features/hazard-reports/screens/ReportHazardScreen';` (same
  pattern for the other two; `alerts.tsx` re-exports a placeholder from `src/features/alerts/` that Member 1 replaces).

- [ ] apiClient tests → fail → implement → pass.
- [ ] Implement session, sign-in and tabs. On the phone: sign in as a seeded demo citizen (phone number from the
      README, the seed's demo password) → tabs appear; kill and reopen the app in airplane mode → still signed in.
- [ ] Commit `feat(mobile): api client, session and navigation shell`. **Tell Member 1 the shell is ready.**

---

## Phase M1 – Pure logic (no device needed)

### Task M1.1: Rules and validators (E2, form rules)

**Files:** Create `domain/reportRules.ts`, `domain/types.ts`, `domain/validatePickedPhoto.ts`,
`domain/validateReportDraft.ts` · Test `__tests__/validators.test.ts`

```ts
// domain/reportRules.ts – the same numbers as the server's ClusteringConfig
export const REPORT_HAZARD_TYPES = ['FLOOD', 'LANDSLIDE', 'ROAD_BLOCKAGE', 'OTHER'] as const;
export type ReportHazardType = (typeof REPORT_HAZARD_TYPES)[number];
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const DESCRIPTION_MAX_CHARS = 500;
```

```ts
// domain/types.ts
import type { ReportHazardType } from './reportRules';

export interface DraftLocation {
  lat: number;
  lng: number;
  source: 'GPS' | 'MANUAL';
  accuracyM?: number;
}
/** What the image picker hands back (only the fields used here). */
export interface PickedPhoto {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
}
export interface PhotoToSend {
  uri: string;
  name: string;
  mimeType: string;
  bytes: number;
}
export interface ReportDraft {
  hazardType?: ReportHazardType;
  description: string;
  location?: DraftLocation;
  photo?: PickedPhoto;
}
export interface ValidReportDraft {
  hazardType: ReportHazardType;
  description: string;
  location: DraftLocation;
  photo?: PhotoToSend;
}
```

```ts
// domain/validatePickedPhoto.ts
import { PHOTO_MAX_BYTES, PHOTO_MIME_TYPES } from './reportRules';
import type { PhotoToSend, PickedPhoto } from './types';

export type PhotoProblem = 'PHOTO_TYPE' | 'PHOTO_TOO_LARGE' | 'PHOTO_EMPTY';
export type PhotoCheck = { ok: true; photo: PhotoToSend } | { ok: false; problem: PhotoProblem };

const BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function mimeOf(photo: PickedPhoto): string | undefined {
  if (photo.mimeType) return photo.mimeType.toLowerCase();
  const extension = /\.([A-Za-z0-9]+)$/.exec(photo.fileName ?? photo.uri)?.[1]?.toLowerCase();
  return extension ? BY_EXTENSION[extension] : undefined;
}

/** UC-3 E2, caught on the phone before any upload. The server checks again (and also sniffs the bytes). */
export function validatePickedPhoto(photo: PickedPhoto): PhotoCheck {
  const mimeType = mimeOf(photo);
  if (!mimeType || !(PHOTO_MIME_TYPES as readonly string[]).includes(mimeType))
    return { ok: false, problem: 'PHOTO_TYPE' };
  if (photo.fileSize === 0) return { ok: false, problem: 'PHOTO_EMPTY' };
  // Some Android pickers do not report a size: let it through, the server enforces the limit.
  const bytes = photo.fileSize ?? 0;
  if (bytes > PHOTO_MAX_BYTES) return { ok: false, problem: 'PHOTO_TOO_LARGE' };
  return {
    ok: true,
    photo: { uri: photo.uri, name: `photo.${EXTENSION[mimeType]}`, mimeType, bytes },
  };
}
```

```ts
// domain/validateReportDraft.ts
import { DESCRIPTION_MAX_CHARS } from './reportRules';
import type { ReportDraft, ValidReportDraft } from './types';
import { validatePickedPhoto, type PhotoProblem } from './validatePickedPhoto';

export type DraftProblem =
  'HAZARD_TYPE_REQUIRED' | 'LOCATION_REQUIRED' | 'DESCRIPTION_TOO_LONG' | PhotoProblem;
export type DraftCheck =
  { ok: true; value: ValidReportDraft } | { ok: false; problems: DraftProblem[] };

/** UC-3 steps 2–5: what must be true before Submit does anything. */
export function validateReportDraft(draft: ReportDraft): DraftCheck {
  const problems: DraftProblem[] = [];
  const description = draft.description.trim();
  const photo = draft.photo ? validatePickedPhoto(draft.photo) : undefined;
  if (!draft.hazardType) problems.push('HAZARD_TYPE_REQUIRED');
  if (!draft.location) problems.push('LOCATION_REQUIRED');
  if ([...description].length > DESCRIPTION_MAX_CHARS) problems.push('DESCRIPTION_TOO_LONG');
  if (photo && !photo.ok) problems.push(photo.problem);
  if (problems.length > 0 || !draft.hazardType || !draft.location) return { ok: false, problems };
  return {
    ok: true,
    value: {
      hazardType: draft.hazardType,
      description,
      location: draft.location,
      photo: photo?.ok ? photo.photo : undefined,
    },
  };
}
```

**Tests:** photo – JPEG/PNG/WebP under the limit accepted; exactly 5 MB accepted; 5 MB + 1 → `PHOTO_TOO_LARGE`;
`image/gif` → `PHOTO_TYPE`; size 0 → `PHOTO_EMPTY`; missing `mimeType` inferred from `fileName` `IMG_1.JPG`, then
from the `uri`; nothing to infer from → `PHOTO_TYPE`; missing `fileSize` accepted with `bytes: 0`; the name sent is
`photo.jpg` / `photo.png` / `photo.webp`. Draft – a complete draft is valid and its description trimmed; missing hazard
type; missing location; both missing lists both; 501 characters rejected and 500 accepted (count code points: a
500-character Sinhala description passes); an invalid photo adds its problem; a draft without a photo is valid.

- [ ] Tests → fail → implement → pass → commit `feat(mobile): report rules and validators (E2)`.

### Task M1.2: The journal – `OfflineReportQueue` (A1)

**Files:** Create `offline/types.ts`, `offline/ports.ts`, `offline/OfflineReportQueue.ts`, `testing/fakes.ts` ·
Test `__tests__/OfflineReportQueue.test.ts`

```ts
// offline/types.ts
import type { ReportHazardType } from '../domain/reportRules';
import type { DraftLocation, PhotoToSend } from '../domain/types';

/** See the lifecycle diagram in D-offline-sync-design.md §5. */
export type QueueState = 'QUEUED' | 'UPLOADING' | 'AWAITING_DECISION' | 'NEEDS_ATTENTION';

export interface QueuedReport {
  /** Generated on the phone at capture time; the server's idempotency key (H7). */
  clientReportId: string;
  /** Who captured it. Never uploaded under another account. */
  ownerId: string;
  hazardType: ReportHazardType;
  description: string;
  location: DraftLocation;
  /** ISO time the reporter pressed Submit: preserved however late the upload happens (A1). */
  capturedAt: string;
  photo?: PhotoToSend;
  state: QueueState;
  attempts: number;
  lastAttemptAt?: string;
  /** Set with AWAITING_DECISION. */
  existingReportId?: string;
  /** Set with NEEDS_ATTENTION: why the server refused it. */
  problem?: { code: string; message: string };
}

export type UploadOutcome =
  | {
      kind: 'DELIVERED';
      via: 'CREATED' | 'ALREADY_RECEIVED' | 'UPDATED_EXISTING';
      reportId: string;
    }
  | { kind: 'DUPLICATE_SUSPECTED'; existingReportId: string }
  | { kind: 'REJECTED'; code: string; message: string }
  | { kind: 'AUTH_REQUIRED' }
  | { kind: 'RETRY' };

export interface UploadOptions {
  /** False only while the reporter is looking at the form; true for every background or reconnect drain. */
  syncedFromOffline: boolean;
  duplicateAction?: 'NEW' | 'UPDATE';
}

export type SyncTrigger = 'RECONNECT' | 'APP_FOREGROUND' | 'MANUAL' | 'OS_TASK';
export type SyncStop = 'OFFLINE' | 'NO_SESSION' | 'RETRY_LATER';
export interface SyncRunResult {
  trigger: SyncTrigger;
  ranAt: string;
  uploaded: number;
  remaining: number;
  stoppedBy?: SyncStop;
}
```

```ts
// offline/ports.ts
import type { QueuedReport, SyncRunResult, UploadOptions, UploadOutcome } from './types';

export interface Clock {
  now(): Date;
}
export interface IdGenerator {
  next(): string;
}

/** Persists the whole journal as one JSON document. */
export interface QueueStorage {
  load(): Promise<QueuedReport[]>;
  save(entries: QueuedReport[]): Promise<void>;
}
/** Keeps photos in app-owned storage: the picker's cache file can vanish before the sync runs. */
export interface PhotoStore {
  /** Copies the file and returns the new uri. */
  keep(sourceUri: string, name: string): Promise<string>;
  exists(uri: string): Promise<boolean>;
  discard(uri: string): Promise<void>;
}
export interface ConnectivityMonitor {
  isOnline(): Promise<boolean>;
  /** Calls `listener` on each offline → online transition. Returns an unsubscribe function. */
  onReconnect(listener: () => void): () => void;
}
/** Who is signed in right now, renewing the session if needed. Throws when the server cannot be reached. */
export interface SessionGate {
  currentUserId(): Promise<string | undefined>;
}
/** Never throws: every failure is an outcome. */
export interface ReportUploader {
  upload(entry: QueuedReport, options: UploadOptions): Promise<UploadOutcome>;
}
export interface SyncNotifier {
  reportsSent(count: number): Promise<void>;
  signInNeeded(count: number): Promise<void>;
}
export interface SyncRunLog {
  record(result: SyncRunResult): Promise<void>;
  last(): Promise<SyncRunResult | undefined>;
}
```

```ts
// offline/OfflineReportQueue.ts
import type { ValidReportDraft } from '../domain/types';
import type { Clock, IdGenerator, PhotoStore, QueueStorage } from './ports';
import type { QueuedReport } from './types';

export interface QueueDeps {
  storage: QueueStorage;
  photos: PhotoStore;
  clock: Clock;
  ids: IdGenerator;
}

type Change<T> = (entries: QueuedReport[]) => Promise<{ entries: QueuedReport[]; result: T }>;

const oldestFirst = (a: QueuedReport, b: QueuedReport): number =>
  a.capturedAt.localeCompare(b.capturedAt);

/** The write-ahead journal of reports that the server has not acknowledged yet (UC-3 A1). */
export class OfflineReportQueue {
  /** Serialises read-modify-write cycles so two updates can never overwrite each other. */
  private tail: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly deps: QueueDeps) {}

  /**
   * UC-3 A1: journals a report with its capture time and a fresh `clientReportId`.
   * The photo is copied before the entry is written, so an entry never points at a file that can disappear.
   */
  enqueue(ownerId: string, draft: ValidReportDraft): Promise<QueuedReport> {
    return this.mutate(async (entries) => {
      const clientReportId = this.deps.ids.next();
      const photo = draft.photo
        ? {
            ...draft.photo,
            uri: await this.deps.photos.keep(
              draft.photo.uri,
              `${clientReportId}-${draft.photo.name}`,
            ),
          }
        : undefined;
      const entry: QueuedReport = {
        clientReportId,
        ownerId,
        hazardType: draft.hazardType,
        description: draft.description,
        location: draft.location,
        capturedAt: this.deps.clock.now().toISOString(),
        photo,
        state: 'QUEUED',
        attempts: 0,
      };
      return { entries: [...entries, entry], result: entry };
    });
  }

  /** Oldest capture first: the order in which things happened. */
  async list(): Promise<QueuedReport[]> {
    await this.tail;
    return [...(await this.deps.storage.load())].sort(oldestFirst);
  }

  async get(clientReportId: string): Promise<QueuedReport | undefined> {
    return (await this.list()).find((entry) => entry.clientReportId === clientReportId);
  }

  /** Returns the updated entry, or undefined when it is no longer in the journal. */
  update(clientReportId: string, patch: Partial<QueuedReport>): Promise<QueuedReport | undefined> {
    return this.mutate(async (entries) => {
      const current = entries.find((entry) => entry.clientReportId === clientReportId);
      if (!current) return { entries, result: undefined };
      const updated = { ...current, ...patch };
      return {
        entries: entries.map((entry) => (entry === current ? updated : entry)),
        result: updated,
      };
    });
  }

  /** Removes an acknowledged (or discarded) entry and its photo. Safe to call twice. */
  remove(clientReportId: string): Promise<void> {
    return this.mutate(async (entries) => {
      const gone = entries.find((entry) => entry.clientReportId === clientReportId);
      if (gone?.photo) await this.deps.photos.discard(gone.photo.uri);
      return { entries: entries.filter((entry) => entry !== gone), result: undefined };
    });
  }

  /** UC-3 E2 "continue without a photo", applied to a journaled entry: ready to be sent again. */
  async dropPhoto(clientReportId: string): Promise<QueuedReport | undefined> {
    const entry = await this.get(clientReportId);
    if (entry?.photo) await this.deps.photos.discard(entry.photo.uri);
    return this.update(clientReportId, { photo: undefined, problem: undefined, state: 'QUEUED' });
  }

  /** Lets the screens re-read after any change. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private mutate<T>(change: Change<T>): Promise<T> {
    const run = this.tail.then(async () => {
      const { entries, result } = await change(await this.deps.storage.load());
      await this.deps.storage.save(entries);
      this.listeners.forEach((listener) => listener());
      return result;
    });
    this.tail = run.catch(() => undefined);
    return run;
  }
}
```

`testing/fakes.ts`: `InMemoryQueueStorage` (stores a deep copy via `JSON.parse(JSON.stringify(...))`, exactly like
AsyncStorage would, so `undefined` fields disappear), `FakePhotoStore` (`kept: Map<uri, source>`, `discarded: string[]`,
`keep` returns `file:///documents/<name>`; `exists` true while kept and not discarded; a `lose(uri)` helper),
`FixedClock` (`advance(ms)`), `SequentialIds('client')`, `FakeConnectivity` (`online` flag, `goOnline()` firing
listeners), `FakeSessionGate` (`userId`, `fail` flag), `ScriptedUploader` (queue of outcomes or a function; records
`calls: { entry, options }[]`; can return a deferred promise to hold an upload open), `RecordingNotifier`,
`InMemoryRunLog`, and `aDraft(over)`.

**Tests:**

| Test                                                                       | Expect                                                                              |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `UC-3 A1: enqueue persists the draft with a clientReportId and capturedAt` | entry in storage; id `client-1`; `capturedAt` = clock; `state QUEUED`; `attempts 0` |
| `copies the photo into app storage and stores the new uri`                 | `photo.uri` starts `file:///documents/`; `kept` has the picker uri                  |
| `enqueue without a photo works`                                            | `photo` undefined; nothing kept                                                     |
| `a failed photo copy writes no entry`                                      | `keep` rejects → `enqueue` rejects; storage empty; the queue still works afterwards |
| `list returns oldest capture first`                                        | enqueue at t, advance, enqueue → order by `capturedAt`                              |
| `survives a restart`                                                       | new `OfflineReportQueue` over the same storage lists the same entries               |
| `update merges a patch and returns the entry; unknown id → undefined`      |                                                                                     |
| `remove deletes the entry and its photo, and is idempotent`                | second call resolves; `discarded` has one uri                                       |
| `dropPhoto removes the photo, clears the problem and re-queues`            | from `NEEDS_ATTENTION` → `QUEUED`                                                   |
| `concurrent updates do not overwrite each other`                           | `Promise.all([update(a,{attempts:1}), update(b,{attempts:1})])` → both stored       |
| `subscribers are told about every change and can unsubscribe`              |                                                                                     |

- [ ] Tests → fail → implement → pass → commit `feat(mobile): offline report journal (A1)`.

---

## Phase M2 – Online path on a real phone (steps 1–7)

Do this as soon as Plan A phase B4 is running. It proves camera → location → multipart → API before the offline work.

### Task M2.1: Multipart parts and the uploader

**Files:** Create `api/submitParts.ts`, `offline/classifySubmitResponse.ts`, `api/HttpReportUploader.ts` ·
Tests `__tests__/submitParts.test.ts`, `__tests__/classifySubmitResponse.test.ts`, `__tests__/HttpReportUploader.test.ts`

```ts
// api/submitParts.ts
import type { QueuedReport, UploadOptions } from '../offline/types';

export interface FilePart {
  uri: string;
  name: string;
  type: string;
}
export type SubmitPart = [name: string, value: string | FilePart];

/** The multipart fields of `POST /api/hazard-reports`, as plain data so they can be unit tested. */
export function buildSubmitParts(entry: QueuedReport, options: UploadOptions): SubmitPart[] {
  const { location, photo } = entry;
  const parts: SubmitPart[] = [
    ['clientReportId', entry.clientReportId],
    ['hazardType', entry.hazardType],
    ['description', entry.description],
    ['lat', String(location.lat)],
    ['lng', String(location.lng)],
    ['locationSource', location.source],
    ['capturedAt', entry.capturedAt],
    ['syncedFromOffline', String(options.syncedFromOffline)],
  ];
  if (location.accuracyM !== undefined) parts.push(['accuracyM', String(location.accuracyM)]);
  if (options.duplicateAction) parts.push(['duplicateAction', options.duplicateAction]);
  if (photo) parts.push(['photo', { uri: photo.uri, name: photo.name, type: photo.mimeType }]);
  return parts;
}
```

```ts
// offline/classifySubmitResponse.ts
import type { UploadOutcome } from './types';

interface ErrorBody {
  error?: { code?: string; message?: string; details?: { existingReportId?: unknown } };
}
interface SuccessBody {
  outcome?: string;
  report?: { id?: unknown };
}

const DELIVERED = ['CREATED', 'ALREADY_RECEIVED', 'UPDATED_EXISTING'] as const;
type Via = (typeof DELIVERED)[number];
const isVia = (value: unknown): value is Via => (DELIVERED as readonly unknown[]).includes(value);

/** A 2xx only counts when it is *our* API's answer: a Wi-Fi sign-in page also answers 200. */
function delivered(body: unknown): UploadOutcome {
  const { outcome, report } = (body ?? {}) as SuccessBody;
  if (!isVia(outcome) || typeof report?.id !== 'string') return { kind: 'RETRY' };
  return { kind: 'DELIVERED', via: outcome, reportId: report.id };
}

const isTransient = (status: number): boolean => status === 408 || status === 429 || status >= 500;

/** Turns the server's answer into what the sync engine should do next (Plan D §5). */
export function classifySubmitResponse(status: number, body: unknown): UploadOutcome {
  if (status === 200 || status === 201) return delivered(body);
  const error = ((body ?? {}) as ErrorBody).error ?? {};
  if (status === 401) return { kind: 'AUTH_REQUIRED' };
  if (isTransient(status)) return { kind: 'RETRY' };
  if (status === 409 && error.code === 'DUPLICATE_SUSPECTED') {
    return {
      kind: 'DUPLICATE_SUSPECTED',
      existingReportId: String(error.details?.existingReportId ?? ''),
    };
  }
  return {
    kind: 'REJECTED',
    code: error.code ?? `HTTP_${status}`,
    message: error.message ?? 'The report was refused.',
  };
}
```

```ts
// api/HttpReportUploader.ts
import type { ApiResponse } from '@/shared/api/apiClient';
import { classifySubmitResponse } from '../offline/classifySubmitResponse';
import type { ReportUploader } from '../offline/ports';
import type { QueuedReport, UploadOptions, UploadOutcome } from '../offline/types';
import { buildSubmitParts, type SubmitPart } from './submitParts';

/** Sends the parts as multipart and returns status + parsed body. Throws only when the server was not reached. */
export type SubmitTransport = (parts: SubmitPart[]) => Promise<ApiResponse>;

export class HttpReportUploader implements ReportUploader {
  constructor(private readonly transport: SubmitTransport) {}

  /** UC-3 step 7; A1. Never throws: an unreachable server is simply "try again later". */
  async upload(entry: QueuedReport, options: UploadOptions): Promise<UploadOutcome> {
    try {
      const { status, body } = await this.transport(buildSubmitParts(entry, options));
      return classifySubmitResponse(status, body);
    } catch {
      return { kind: 'RETRY' };
    }
  }
}
```

The transport is built in `composition.ts` (M4.1), the only place that knows about React Native's `FormData`:

```ts
const transport: SubmitTransport = (parts) => {
  const form = new FormData();
  // React Native accepts `{ uri, name, type }` as a file part; the DOM typings do not know that.
  for (const [name, value] of parts) form.append(name, value as unknown as string);
  return api.send('POST', '/api/hazard-reports', form);
};
```

(If the path alias `@/...` is not what the generated `tsconfig.json` uses, follow the generated one.)

**Tests.** Parts: every field of a full entry; no `accuracyM` / `duplicateAction` / `photo` part when absent;
`syncedFromOffline` is the string `'true'` / `'false'`; the photo part carries `uri`, `name`, `type`.
Classifier (table): 201 CREATED → DELIVERED/CREATED · 200 ALREADY_RECEIVED · 200 UPDATED_EXISTING · **200 with an HTML
string body → RETRY** (captive portal) · 200 with an unknown outcome → RETRY · 200 without `report.id` → RETRY · 401 →
AUTH_REQUIRED · 408, 429, 500, 503 → RETRY · 409 DUPLICATE_SUSPECTED → carries `existingReportId` (and `''` when the
detail is missing) · 409 with another code → REJECTED · 400 INVALID_PHOTO → REJECTED with code and message · 403 with
an empty body → REJECTED `HTTP_403` with the default message · `undefined` body → handled. Uploader: passes the built
parts to the transport; maps the answer; a throwing transport → RETRY.

- [ ] Tests → fail → implement → pass → commit `feat(mobile): submit parts, response classifier, uploader`.

### Task M2.2: Location hook (step 4, E1 trigger)

**Files:** Create `hooks/useCurrentLocation.ts`, `adapters/ExpoLocationProvider.ts` · Test `__tests__/useCurrentLocation.test.tsx`

```ts
export interface LocationProvider {
  requestPermission(): Promise<boolean>;
  current(): Promise<{ lat: number; lng: number; accuracyM?: number }>;
  lastKnown(): Promise<{ lat: number; lng: number } | undefined>;
}
export type LocationState =
  | { status: 'LOCATING' }
  | { status: 'READY'; location: DraftLocation }
  | { status: 'MANUAL'; reason: 'DENIED' | 'TIMEOUT' | 'UNAVAILABLE'; location?: DraftLocation };

export function useCurrentLocation(
  provider: LocationProvider,
  timeoutMs = 10_000,
): {
  state: LocationState;
  /** UC-3 E1: the reporter placed or moved the pin. */
  pin(point: { lat: number; lng: number }): void;
  retry(): void;
};
```

Behaviour: on mount (and on `retry`) → `LOCATING` → `requestPermission()`; denied → `MANUAL/DENIED`; granted →
`Promise.race([provider.current(), timeout])`; success → `READY` with `source: 'GPS'` and `accuracyM`; timeout →
`MANUAL/TIMEOUT`; a thrown error → `MANUAL/UNAVAILABLE`. On entering `MANUAL`, the map's starting centre is
`lastKnown()` or Colombo (6.9271, 79.8612); **no location is set until the reporter pins one** (Submit stays disabled).
`pin(point)` → `{ status: 'MANUAL', location: { ...point, source: 'MANUAL' } }`; pinning while `READY` (the "Adjust
pin" action) also switches to `MANUAL` with the new point. Ignore results that arrive after unmount or after a newer
`retry`.

`ExpoLocationProvider`: `Location.requestForegroundPermissionsAsync()` → `status === 'granted'`;
`Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })` → `coords.latitude/longitude/accuracy`;
`Location.getLastKnownPositionAsync()`.

**Tests** (fake provider, `renderHook`, fake timers): returns GPS coordinates when granted · `MANUAL/DENIED` on denial
· `MANUAL/TIMEOUT` when `current()` never resolves · `MANUAL/UNAVAILABLE` when it throws · `pin` sets a MANUAL
location · adjusting a GPS fix marks it MANUAL · `retry` after granting permission reaches READY · a late result after
unmount does not update state.

- [ ] Tests → fail → implement → pass → commit `feat(mobile): current location hook (step 4, E1)`.

### Task M2.3: Report screen – online happy path

**Files:** Create `components/HazardTiles.tsx`, `components/PhotoField.tsx`, `screens/ReportHazardScreen.tsx`,
a temporary direct wiring to the uploader.

- Four large tiles (Flood, Landslide, Road blockage, Other) – a radio group (`accessibilityRole="radio"`,
  `accessibilityState={{ selected }}`).
- `PhotoField`: _Take photo_ → `ImagePicker.requestCameraPermissionsAsync()` then
  `ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 })`; _Choose from gallery_ →
  `launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 })`. (Camera at 0.6 keeps normal photos well under
  5 MB; the gallery is left untouched so the "over 5 MB" exception flow is demonstrable.) Run `validatePickedPhoto` on
  the asset at once; show the thumbnail and a _Remove_ action.
- Location line from `useCurrentLocation` (coordinates as text for now; the map arrives in M6).
- Description `TextInput` with a live `n / 500` counter.
- _Submit_: disabled until a hazard type and a location exist.
- For this phase only (the journal's adapters arrive in M4.1): on Submit build a `QueuedReport` in memory
  (`clientReportId` from `Crypto.randomUUID()`, `capturedAt` now, the picker's own photo uri, `ownerId` from the
  session) and call `new HttpReportUploader(transport).upload(entry, { syncedFromOffline: false })` with the
  `transport` shown in M2.1; show "Report sent" on `DELIVERED`. M4.1 and M5.1 replace this with the runtime,
  `submitReport` and `SyncManager`.

- [ ] On the phone, online: take a photo → wait for the location → type a description → Submit → "Report sent".
- [ ] On the laptop: the report is in `GET /api/hazard-reports/clusters` (duty officer) with a `photoUrl` that opens.
- [ ] Commit `feat(mobile): report screen online path (steps 1–7)`.

---

## Phase M3 – Sync engine (no device needed)

### Task M3.1: `SyncManager`

**Files:** Create `offline/SyncManager.ts` · Test `__tests__/SyncManager.test.ts`

```ts
// offline/SyncManager.ts
import type { OfflineReportQueue } from './OfflineReportQueue';
import type {
  Clock,
  ConnectivityMonitor,
  PhotoStore,
  ReportUploader,
  SessionGate,
  SyncNotifier,
  SyncRunLog,
} from './ports';
import type {
  QueueState,
  QueuedReport,
  SyncRunResult,
  SyncStop,
  SyncTrigger,
  UploadOptions,
  UploadOutcome,
} from './types';

export interface SyncDeps {
  queue: OfflineReportQueue;
  photos: PhotoStore;
  uploader: ReportUploader;
  connectivity: ConnectivityMonitor;
  session: SessionGate;
  notifier: SyncNotifier;
  runLog: SyncRunLog;
  clock: Clock;
}

/** What the reporter is told right after pressing Submit. */
export type SubmitNowResult = UploadOutcome | { kind: 'SAVED_OFFLINE' } | { kind: 'ALREADY_SENT' };
type AttemptResult = UploadOutcome | { kind: 'ALREADY_SENT' };
type Gate = { userId: string } | { stop: SyncStop };

/** Which outcomes end a drain early: the connection or the session is gone, so the rest would fail too. */
const STOPS: Partial<Record<AttemptResult['kind'], SyncStop>> = {
  RETRY: 'RETRY_LATER',
  AUTH_REQUIRED: 'NO_SESSION',
};

const WAITING: QueueState[] = ['QUEUED', 'UPLOADING'];
/** Only the OS task answers a pending duplicate question by itself: nobody is there to ask (H6). */
const WAITING_UNATTENDED: QueueState[] = [...WAITING, 'AWAITING_DECISION'];

/**
 * Delivers journaled reports (UC-3 A1). The same engine runs in the open app and in the headless
 * OS background task; it holds no state that a process death could lose – the journal is the state.
 */
export class SyncManager {
  /** One lane: uploads never overlap inside a JS runtime, whatever triggered them. */
  private lane: Promise<unknown> = Promise.resolve();
  private pending?: Promise<SyncRunResult>;

  constructor(private readonly deps: SyncDeps) {}

  /** UC-3 A1: upload everything that is waiting, oldest first. A call during a run joins that run. */
  run(trigger: SyncTrigger): Promise<SyncRunResult> {
    this.pending ??= this.exclusive(() => this.drain(trigger)).finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  /** UC-3 steps 6–7, E3: try one journaled report now, while the reporter is watching. */
  submitNow(
    clientReportId: string,
    duplicateAction?: UploadOptions['duplicateAction'],
  ): Promise<SubmitNowResult> {
    return this.exclusive(() => this.submitOne(clientReportId, duplicateAction));
  }

  private exclusive<T>(job: () => Promise<T>): Promise<T> {
    const next = this.lane.then(job);
    this.lane = next.catch(() => undefined);
    return next;
  }

  private async drain(trigger: SyncTrigger): Promise<SyncRunResult> {
    const gate = await this.gate();
    if ('stop' in gate) return this.finish(trigger, 0, gate.stop);
    let uploaded = 0;
    let stoppedBy: SyncStop | undefined;
    for (const entry of await this.due(gate.userId, trigger)) {
      const outcome = await this.attempt(entry, { syncedFromOffline: true });
      if (outcome.kind === 'DELIVERED') uploaded += 1;
      stoppedBy = STOPS[outcome.kind];
      if (stoppedBy) break;
    }
    return this.finish(trigger, uploaded, stoppedBy);
  }

  private async submitOne(
    clientReportId: string,
    duplicateAction?: UploadOptions['duplicateAction'],
  ): Promise<SubmitNowResult> {
    const entry = await this.deps.queue.get(clientReportId);
    if (!entry) return { kind: 'ALREADY_SENT' };
    const gate = await this.gate();
    if ('stop' in gate)
      return gate.stop === 'NO_SESSION' ? { kind: 'AUTH_REQUIRED' } : { kind: 'SAVED_OFFLINE' };
    const outcome = await this.attempt(entry, { syncedFromOffline: false, duplicateAction });
    return outcome.kind === 'RETRY' ? { kind: 'SAVED_OFFLINE' } : outcome;
  }

  /** Online and signed in? Checked before the journal is touched, so no photo is sent just to get a 401. */
  private async gate(): Promise<Gate> {
    try {
      if (!(await this.deps.connectivity.isOnline())) return { stop: 'OFFLINE' };
      const userId = await this.deps.session.currentUserId();
      return userId ? { userId } : { stop: 'NO_SESSION' };
    } catch {
      return { stop: 'OFFLINE' };
    }
  }

  private async due(userId: string, trigger: SyncTrigger): Promise<QueuedReport[]> {
    const states = trigger === 'OS_TASK' ? WAITING_UNATTENDED : WAITING;
    return (await this.deps.queue.list()).filter(
      (entry) => entry.ownerId === userId && states.includes(entry.state),
    );
  }

  private async attempt(entry: QueuedReport, options: UploadOptions): Promise<AttemptResult> {
    const sending = await this.markUploading(entry);
    if (!sending) return { kind: 'ALREADY_SENT' };
    const outcome = await this.deps.uploader.upload(sending, options);
    await this.settle(sending.clientReportId, outcome);
    return outcome;
  }

  /** A photo file that no longer exists must not block the report forever: it is sent without it. */
  private async markUploading(entry: QueuedReport): Promise<QueuedReport | undefined> {
    const photoLost =
      entry.photo !== undefined && !(await this.deps.photos.exists(entry.photo.uri));
    return this.deps.queue.update(entry.clientReportId, {
      state: 'UPLOADING',
      attempts: entry.attempts + 1,
      lastAttemptAt: this.deps.clock.now().toISOString(),
      ...(photoLost ? { photo: undefined } : {}),
    });
  }

  /** An entry leaves the journal only when the server has acknowledged it. */
  private async settle(clientReportId: string, outcome: UploadOutcome): Promise<void> {
    const { queue } = this.deps;
    if (outcome.kind === 'DELIVERED') {
      await queue.remove(clientReportId);
    } else if (outcome.kind === 'DUPLICATE_SUSPECTED') {
      await queue.update(clientReportId, {
        state: 'AWAITING_DECISION',
        existingReportId: outcome.existingReportId,
      });
    } else if (outcome.kind === 'REJECTED') {
      const problem = { code: outcome.code, message: outcome.message };
      await queue.update(clientReportId, { state: 'NEEDS_ATTENTION', problem });
    } else {
      await queue.update(clientReportId, { state: 'QUEUED' });
    }
  }

  private async finish(
    trigger: SyncTrigger,
    uploaded: number,
    stoppedBy?: SyncStop,
  ): Promise<SyncRunResult> {
    const remaining = (await this.deps.queue.list()).length;
    const result: SyncRunResult = {
      trigger,
      ranAt: this.deps.clock.now().toISOString(),
      uploaded,
      remaining,
      stoppedBy,
    };
    await this.deps.runLog.record(result);
    if (trigger === 'OS_TASK') await this.announce(result);
    return result;
  }

  /** With the app closed, a notification is the only way the reporter learns what happened (H10). */
  private async announce({ uploaded, remaining, stoppedBy }: SyncRunResult): Promise<void> {
    if (uploaded > 0) await this.deps.notifier.reportsSent(uploaded);
    if (stoppedBy === 'NO_SESSION' && remaining > 0)
      await this.deps.notifier.signInNeeded(remaining);
  }
}
```

**Tests** (all with the fakes; `build(over)` returns `{ sync, queue, uploader, connectivity, session, notifier, runLog,
photos, clock }`; reports are enqueued for owner `'citizen-1'`, which is also the fake session's user):

| Test name                                                                       | Arrange → Expect                                                                                                                                                            |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UC-3 A1: uploads oldest first with the original capturedAt and clientReportId` | 3 entries at different times → `uploader.calls` in capture order; each `entry.capturedAt` / `clientReportId` equals the journaled one; `options.syncedFromOffline === true` |
| `removes an entry once the server acknowledges it`                              | DELIVERED → journal empty; photo discarded; result `{ uploaded: 3, remaining: 0 }`                                                                                          |
| `H7: ALREADY_RECEIVED counts as delivered`                                      | outcome `via: 'ALREADY_RECEIVED'` → removed                                                                                                                                 |
| `keeps the entry and stops on a network failure`                                | outcomes `[DELIVERED, RETRY]` over 3 entries → 2 calls only; first removed; second back to `QUEUED` with `attempts 1`; third untouched; `stoppedBy 'RETRY_LATER'`           |
| `D11: a refused report is kept as NEEDS_ATTENTION and the drain continues`      | `[REJECTED{INVALID_PHOTO}, DELIVERED]` → first `NEEDS_ATTENTION` with `problem`; second removed; `uploaded 1`; no `stoppedBy`                                               |
| `NEEDS_ATTENTION entries are not retried automatically`                         | next `run` → 0 calls                                                                                                                                                        |
| `stops when the session cannot be renewed mid-run`                              | `[AUTH_REQUIRED]` → entry `QUEUED`; `stoppedBy 'NO_SESSION'`                                                                                                                |
| `does nothing when the queue is empty`                                          | 0 calls; result `uploaded 0, remaining 0`; run logged                                                                                                                       |
| `does nothing when offline`                                                     | `connectivity.online = false` → 0 calls; `stoppedBy 'OFFLINE'`; session not asked                                                                                           |
| `does nothing when the server cannot be reached for the session check`          | `session.fail = true` → `stoppedBy 'OFFLINE'`                                                                                                                               |
| `does nothing when signed out`                                                  | `session.userId = undefined` → `stoppedBy 'NO_SESSION'`; 0 calls                                                                                                            |
| `never uploads another user's reports`                                          | entries for `citizen-1` and `citizen-2`, session `citizen-2` → only the second uploaded; the first still in the journal                                                     |
| `a second trigger while a sync is running does not double-upload`               | hold the first upload open with a deferred; call `run` twice → the same promise; 1 uploader call per entry                                                                  |
| `a run requested after the previous one finished starts a new run`              | two sequential `run`s → `runLog` has two records                                                                                                                            |
| `recovers an entry left UPLOADING by a run that died`                           | put an entry in state `UPLOADING` directly in storage → `run` uploads it                                                                                                    |
| `sends a report without its photo when the photo file is gone`                  | `photos.lose(uri)` → uploader called with `entry.photo` undefined                                                                                                           |
| `OS_TASK also resolves a pending duplicate question; other triggers leave it`   | entry `AWAITING_DECISION`: `run('RECONNECT')` → 0 calls; `run('OS_TASK')` → 1 call with `syncedFromOffline: true`                                                           |
| `OS_TASK announces what it sent`                                                | `notifier.sent === [2]`; a `RECONNECT` run announces nothing                                                                                                                |
| `OS_TASK asks the reporter to sign in when the session is gone`                 | signed out + 1 entry → `notifier.signIn === [1]`; with an empty journal → nothing                                                                                           |
| `records every run for the diagnostics line`                                    | `runLog.last()` equals the returned result                                                                                                                                  |
| `UC-3 steps 6–7: submitNow uploads interactively`                               | `options.syncedFromOffline === false`; result `DELIVERED`; journal empty                                                                                                    |
| `UC-3 A1: submitNow offline reports SAVED_OFFLINE and keeps the entry`          | offline → `{ kind: 'SAVED_OFFLINE' }`; entry `QUEUED`; 0 calls                                                                                                              |
| `submitNow with a failing network reports SAVED_OFFLINE`                        | outcome RETRY → `SAVED_OFFLINE`; entry `QUEUED`                                                                                                                             |
| `UC-3 E3: submitNow surfaces DUPLICATE_SUSPECTED and parks the entry`           | → result carries `existingReportId`; entry `AWAITING_DECISION`                                                                                                              |
| `UC-3 E3: submitNow with UPDATE passes the choice on`                           | `calls[0].options.duplicateAction === 'UPDATE'`                                                                                                                             |
| `submitNow when signed out reports AUTH_REQUIRED and keeps the entry`           |                                                                                                                                                                             |
| `submitNow for an entry a drain already delivered reports ALREADY_SENT`         | unknown id                                                                                                                                                                  |
| `submitNow waits for a running drain instead of overlapping it`                 | deferred upload in a drain; `submitNow` called meanwhile → its upload starts only after the first resolves                                                                  |

- [ ] Tests → fail → implement → pass → commit `feat(mobile): sync manager (A1, E3, H7)`.

### Task M3.2: Submit flow and "My reports" merge

**Files:** Create `offline/submitReport.ts`, `domain/mergeMyReports.ts`, `offline/taskResult.ts` ·
Tests `__tests__/submitReport.test.ts`, `__tests__/mergeMyReports.test.ts`, `__tests__/taskResult.test.ts`

```ts
// offline/submitReport.ts
import type { ReportDraft } from '../domain/types';
import { validateReportDraft, type DraftProblem } from '../domain/validateReportDraft';
import type { OfflineReportQueue } from './OfflineReportQueue';
import type { SubmitNowResult, SyncManager } from './SyncManager';

export type SubmitFlowResult =
  { kind: 'INVALID'; problems: DraftProblem[] } | (SubmitNowResult & { clientReportId: string });

export interface SubmitFlowDeps {
  queue: Pick<OfflineReportQueue, 'enqueue' | 'update' | 'dropPhoto' | 'remove'>;
  sync: Pick<SyncManager, 'submitNow'>;
}

/** UC-3 steps 5–7: validate, journal first (durability), then try to send while the reporter watches. */
export async function submitReport(
  deps: SubmitFlowDeps,
  ownerId: string,
  draft: ReportDraft,
): Promise<SubmitFlowResult> {
  const checked = validateReportDraft(draft);
  if (!checked.ok) return { kind: 'INVALID', problems: checked.problems };
  const { clientReportId } = await deps.queue.enqueue(ownerId, checked.value);
  return { ...(await deps.sync.submitNow(clientReportId)), clientReportId };
}

/** UC-3 E3: the reporter answered "update existing" or "submit as new". */
export async function answerDuplicate(
  deps: SubmitFlowDeps,
  clientReportId: string,
  action: 'NEW' | 'UPDATE',
): Promise<SubmitNowResult> {
  await deps.queue.update(clientReportId, { state: 'QUEUED', existingReportId: undefined });
  return deps.sync.submitNow(clientReportId, action);
}

/** UC-3 E2 on a refused entry: continue without the photo. */
export async function sendWithoutPhoto(
  deps: SubmitFlowDeps,
  clientReportId: string,
): Promise<SubmitNowResult> {
  await deps.queue.dropPhoto(clientReportId);
  return deps.sync.submitNow(clientReportId);
}
```

```ts
// offline/taskResult.ts
import type { SyncRunResult } from './types';

/** Tells the OS whether the job did its work or should be tried again. */
export const isTaskSuccess = (result: SyncRunResult): boolean => result.stoppedBy !== 'RETRY_LATER';
```

`mergeMyReports(local: QueuedReport[], remote: RemoteReport[]): MyReportItem[]` where `RemoteReport` is the `Report`
DTO and

```ts
export type MyReportChip =
  | 'PENDING_SYNC'
  | 'SENDING'
  | 'NEEDS_CHOICE'
  | 'NOT_SENT'
  | 'PENDING_REVIEW'
  | 'VERIFIED'
  | 'REJECTED';
export interface MyReportItem {
  key: string;
  clientReportId: string;
  hazardType: ReportHazardType;
  description: string;
  capturedAt: string;
  chip: MyReportChip;
  local: boolean;
  detail?: string; // rejection reason or the server's refusal message
}
```

Rules: local `QUEUED → PENDING_SYNC`, `UPLOADING → SENDING`, `AWAITING_DECISION → NEEDS_CHOICE`,
`NEEDS_ATTENTION → NOT_SENT` (`detail` = `problem.message`); remote `PENDING → PENDING_REVIEW`, `VERIFIED`,
`REJECTED` (`detail` = `rejectionReason`). A local entry whose `clientReportId` already appears in `remote` is hidden
(it was delivered; the journal just has not been cleaned yet). Newest `capturedAt` first.

**Tests:** `submitReport` – invalid draft enqueues nothing; a valid one is journaled **before** `submitNow` is called
(assert call order with a spy that checks the journal inside `submitNow`); the result carries `clientReportId`;
`answerDuplicate` re-queues and passes the action; `sendWithoutPhoto` drops the photo then submits. Merge – each state
maps to its chip; details; a delivered-but-not-cleaned local entry is hidden; ordering; empty inputs. Task result –
`RETRY_LATER` → false; `OFFLINE`, `NO_SESSION`, undefined → true (nothing the OS can fix by retrying sooner).

- [ ] Tests → fail → implement → pass.
- [ ] `cd mobile && npx jest --coverage` → `domain`, `offline`, `api`, `shared/api` ≥ 90%. Commit
      `feat(mobile): submit flow, my-reports merge, task result`.

---

## Phase M4 – OS-level background sync (needs the development build)

**Implementation progress — 9 October:** Native journal/photo storage, authenticated session checks, API reachability, local notifications, the module-scope OS task and signed-in foreground/reconnect triggers are implemented. The report form now saves before delivery and distinguishes a saved report from a failed storage write. Detailed verification and pending phone checks are tracked in [M4 evidence](evidence/m4/README.md).

The implementation uses the existing shared API client and storage wrapper. SDK 57 multipart uploads retain the tested `expo-file-system` `File` transport from M2; the older URI-based FormData example below is illustrative and must not replace it. Reachability uses `GET /api/health` with native public-internet detection disabled so a reachable laptop API works over local Wi-Fi. Notification permission is requested only through an explained foreground button. Background restrictions are visible on My reports; the full offline report list remains M5.

### Task M4.1: Adapters and composition

**Files:** Create everything under `adapters/` and `composition.ts` (not covered by unit tests – they are thin and
exercised by phase M7).

```ts
// adapters/AsyncStorageQueueStorage.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueueStorage } from '../offline/ports';
import type { QueuedReport } from '../offline/types';

const KEY = 'safezone.hazard-reports.journal.v1';

export class AsyncStorageQueueStorage implements QueueStorage {
  async load(): Promise<QueuedReport[]> {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedReport[]) : [];
  }

  async save(entries: QueuedReport[]): Promise<void> {
    await AsyncStorage.setItem(KEY, JSON.stringify(entries));
  }
}
```

```ts
// adapters/FileSystemPhotoStore.ts  – confirm File / Directory / Paths against the installed expo-file-system typings
import { Directory, File, Paths } from 'expo-file-system';
import type { PhotoStore } from '../offline/ports';

const folder = (): Directory => new Directory(Paths.document, 'hazard-photos');

export class FileSystemPhotoStore implements PhotoStore {
  async keep(sourceUri: string, name: string): Promise<string> {
    const directory = folder();
    if (!directory.exists) directory.create({ intermediates: true });
    const target = new File(directory, name);
    await new File(sourceUri).copy(target);
    return target.uri;
  }

  async exists(uri: string): Promise<boolean> {
    return new File(uri).exists;
  }

  async discard(uri: string): Promise<void> {
    const file = new File(uri);
    if (file.exists) file.delete();
  }
}
```

```ts
// adapters/NetInfoConnectivityMonitor.ts
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { API_BASE_URL } from '@/shared/config';
import type { ConnectivityMonitor } from '../offline/ports';

// "Online" means *our API* answers. On a Wi-Fi network without internet (the demo hotspot) the
// default probe would wrongly report offline although the laptop is reachable.
NetInfo.configure({
  reachabilityUrl: `${API_BASE_URL}/api/health`,
  reachabilityTest: async (response) => response.status === 200,
  reachabilityShortTimeout: 5_000,
  reachabilityLongTimeout: 30_000,
});

const isOnline = (state: NetInfoState): boolean =>
  state.isConnected === true && state.isInternetReachable !== false;

export class NetInfoConnectivityMonitor implements ConnectivityMonitor {
  async isOnline(): Promise<boolean> {
    return isOnline(await NetInfo.fetch());
  }

  onReconnect(listener: () => void): () => void {
    let wasOnline = true;
    return NetInfo.addEventListener((state) => {
      const online = isOnline(state);
      if (online && !wasOnline) listener();
      wasOnline = online;
    });
  }
}
```

- `ExpoSyncNotifier`: `reportsSent(n)` / `signInNeeded(n)` →
  `Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null })` inside `try/catch` (a missing
  permission must never fail a sync). Export `askNotificationPermission()` =
  `Notifications.requestPermissionsAsync()`; it is called the first time a report is saved offline, with the line
  "Allow notifications so we can tell you when your saved reports are sent."
- `AsyncStorageRunLog`: key `safezone.hazard-reports.last-sync.v1`.
- `ApiSessionGate`: `currentUserId()` → `api.send('GET', '/api/auth/me')`; `200` → `body.user.userId`; `401` →
  `undefined`; anything else → throw (the engine treats it as offline). `NetworkError` propagates.
- `system.ts`: `systemClock = { now: () => new Date() }`, `uuidGenerator = { next: () => Crypto.randomUUID() }`
  (`expo-crypto`).

```ts
// composition.ts – headless-safe: this file must never import React, a screen, or anything that renders.
import { createApiClient } from '@/shared/api/apiClient';
import { API_BASE_URL } from '@/shared/config';
import { ApiSessionGate } from './adapters/ApiSessionGate';
import { AsyncStorageQueueStorage } from './adapters/AsyncStorageQueueStorage';
import { AsyncStorageRunLog } from './adapters/AsyncStorageRunLog';
import { ExpoSyncNotifier } from './adapters/ExpoSyncNotifier';
import { FileSystemPhotoStore } from './adapters/FileSystemPhotoStore';
import { NetInfoConnectivityMonitor } from './adapters/NetInfoConnectivityMonitor';
import { systemClock, uuidGenerator } from './adapters/system';
import { HttpReportUploader, type SubmitTransport } from './api/HttpReportUploader';
import { OfflineReportQueue } from './offline/OfflineReportQueue';
import { SyncManager } from './offline/SyncManager';

function build() {
  const api = createApiClient({ baseUrl: API_BASE_URL });
  const photos = new FileSystemPhotoStore();
  const queue = new OfflineReportQueue({
    storage: new AsyncStorageQueueStorage(),
    photos,
    clock: systemClock,
    ids: uuidGenerator,
  });
  const transport: SubmitTransport = (parts) => {
    const form = new FormData();
    // React Native accepts `{ uri, name, type }` as a file part; the DOM typings do not know that.
    for (const [name, value] of parts) form.append(name, value as unknown as string);
    return api.send('POST', '/api/hazard-reports', form);
  };
  const connectivity = new NetInfoConnectivityMonitor();
  const runLog = new AsyncStorageRunLog();
  const sync = new SyncManager({
    queue,
    photos,
    connectivity,
    runLog,
    clock: systemClock,
    uploader: new HttpReportUploader(transport),
    session: new ApiSessionGate(api),
    notifier: new ExpoSyncNotifier(),
  });
  return { api, queue, sync, connectivity, runLog };
}

export type HazardReportsRuntime = ReturnType<typeof build>;
let runtime: HazardReportsRuntime | undefined;

/** One runtime per JS context: the open app and a headless background launch each build their own. */
export function getHazardReportsRuntime(): HazardReportsRuntime {
  runtime ??= build();
  return runtime;
}
```

The app-wide `ApiClient` used by `SessionProvider` should be this same instance (`getHazardReportsRuntime().api`) so
there is exactly one refresh single-flight per runtime.

- [x] Implement; `npx tsc --noEmit` clean; replace the temporary wiring from M2.3 with the runtime. Commit
      `feat(mobile): adapters and composition root`.

### Task M4.2: The background task

**Files:** Modify `background/syncTask.ts` (replacing the empty module from M0.1)

```ts
// background/syncTask.ts
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { getHazardReportsRuntime } from '../composition';
import { isTaskSuccess } from '../offline/taskResult';

export const SYNC_TASK = 'safezone.hazard-reports.sync';

/**
 * Runs when Android WorkManager / iOS BGTaskScheduler decides to: with the app in the background,
 * swiped away, or after a reboot. The OS starts the JS runtime without any screen and calls this.
 *
 * It MUST be defined at module scope and this module MUST be imported by the app's entry file
 * (`mobile/index.ts`): in a headless launch no component ever mounts, so a definition placed
 * inside a component or a lazily loaded route would not exist when the OS calls the task.
 */
TaskManager.defineTask(SYNC_TASK, async () => {
  try {
    const result = await getHazardReportsRuntime().sync.run('OS_TASK');
    return isTaskSuccess(result)
      ? BackgroundTask.BackgroundTaskResult.Success
      : BackgroundTask.BackgroundTaskResult.Failed;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Hands the job to the OS. Registration is stored by the OS and survives app restarts and reboots. */
export async function ensureSyncTaskRegistered(): Promise<'REGISTERED' | 'RESTRICTED'> {
  const status = await BackgroundTask.getStatusAsync();
  if (status === BackgroundTask.BackgroundTaskStatus.Restricted) return 'RESTRICTED';
  if (!(await TaskManager.isTaskRegisteredAsync(SYNC_TASK))) {
    await BackgroundTask.registerTaskAsync(SYNC_TASK, { minimumInterval: 15 });
  }
  return 'REGISTERED';
}

/** Development builds only: makes the OS worker run now, for the demo and for the M7 tests. */
export const triggerSyncTaskForTesting = (): Promise<boolean> =>
  BackgroundTask.triggerTaskWorkerForTestingAsync();
```

- [x] Confirm against the installed typings: `BackgroundTaskResult`, `BackgroundTaskStatus`, `registerTaskAsync`
      options (`minimumInterval` in **minutes**, minimum 15), `triggerTaskWorkerForTestingAsync`.
- [x] Confirm `mobile/index.ts` still imports this file **before** `expo-router/entry`, and `package.json` `main` is
      `index.ts`.
- [ ] If any native package or plugin was added since the last build, rebuild the development client.
- [ ] Commit `feat(mobile): OS background sync task (WorkManager / BGTaskScheduler)`.

### Task M4.3: Foreground triggers

**Files:** Create `hooks/useSyncTriggers.ts` · mount it in `src/app/_layout.tsx` (inside the signed-in branch)

```ts
// hooks/useSyncTriggers.ts
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { ensureSyncTaskRegistered } from '../background/syncTask';
import { getHazardReportsRuntime } from '../composition';

/** While the app is open: sync at start, when it returns to the foreground, and when the connection returns. */
export function useSyncTriggers(): void {
  useEffect(() => {
    const { sync, connectivity } = getHazardReportsRuntime();
    void ensureSyncTaskRegistered();
    void sync.run('APP_FOREGROUND');
    const stopReconnect = connectivity.onReconnect(() => void sync.run('RECONNECT'));
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sync.run('APP_FOREGROUND');
    });
    return () => {
      stopReconnect();
      appState.remove();
    };
  }, []);
}
```

`ensureSyncTaskRegistered()` returning `'RESTRICTED'` (background activity disabled for the app by the user or the
vendor) should be surfaced once on _My reports_: "Background sending is turned off for Safe Zone in your phone's
settings. Saved reports will be sent when you open the app."

- [x] On the phone: airplane mode on → submit (shows Saved on this phone) → airplane mode off
      with the app open → the entry disappears from the journal within seconds (check the server). That is trigger
      `RECONNECT`.
- [ ] App in the background, one entry journaled → run the `adb … jobscheduler run` command from Plan D §11 → the
      report reaches the server and a notification appears. That is trigger `OS_TASK`.
- [ ] Commit `feat(mobile): foreground sync triggers`.

---

## Phase M5 – Offline UI (H10: visibility of system status)

### Task M5.1: Report screen wired to the journal

**Files:** Modify `screens/ReportHazardScreen.tsx` · Create `components/OfflineBanner.tsx`,
`components/DuplicatePrompt.tsx`, `hooks/useOnline.ts` · Test `__tests__/ReportHazardScreen.test.tsx`

The screen receives its dependencies as props with production defaults
(`{ runtime = getHazardReportsRuntime(), locationProvider = expoLocationProvider, ownerId }`), so the test passes
fakes and never mocks a native module.

Submit calls `submitReport({ queue, sync }, ownerId, draft)` and maps the result:

| Result                               | What the reporter sees                                                                                                                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INVALID`                            | the problems next to their fields; nothing saved                                                                                                                                                                    |
| `DELIVERED` / `ALREADY_SENT`         | "Report sent." The form resets.                                                                                                                                                                                     |
| `SAVED_OFFLINE`                      | "Saved. It will be sent automatically when you are connected – even if you close the app." The form resets so the next report can be made (A1: "may keep submitting"). First time: ask for notification permission. |
| `DUPLICATE_SUSPECTED`                | `DuplicatePrompt`: "You reported this spot a few minutes ago." → _Update existing_ / _Submit as new_ → `answerDuplicate(...)`. Dismissing the prompt leaves the entry as _Needs your choice_ in My reports.         |
| `REJECTED` with code `INVALID_PHOTO` | "This photo cannot be used." → _Retake_ (discard the entry: `queue.remove`, keep the form filled) / _Continue without photo_ → `sendWithoutPhoto(...)`                                                              |
| `REJECTED` (other)                   | the server's message; the entry stays in My reports as _Not sent_                                                                                                                                                   |
| `AUTH_REQUIRED`                      | "Saved. Sign in again to send it."                                                                                                                                                                                  |

`OfflineBanner` (top of both tabs): shown while `useOnline()` is false – "You are offline. Reports are saved on this
phone and sent later." `useOnline` wraps `connectivity.isOnline()` + NetInfo events.

_Submit_ shows a busy state and ignores a second press while a submission is in flight.

**Tests** (React Native Testing Library; fakes from `testing/fakes.ts`; three tests, as the spec asks):

1. `Submit is disabled until a hazard type and a location exist` – render with a location provider that is denied →
   disabled; choose _Flood_ → still disabled; pin a location (call the pin handler exposed through the `MapPin` test
   double) → enabled.
2. `UC-3 A1: submitting offline shows the saved-for-later confirmation` – `connectivity.online = false`; choose a type,
   GPS location ready, press Submit → the confirmation text; the journal has one `QUEUED` entry.
3. `UC-3 E3: a duplicate response shows the prompt, and "Update existing" resends with that choice` – uploader scripted
   `[DUPLICATE_SUSPECTED, DELIVERED]` → prompt visible → press _Update existing_ → second call has
   `duplicateAction: 'UPDATE'`; "Report sent".

- [ ] Tests → fail → implement → pass → commit `feat(mobile): report screen offline states and duplicate prompt (A1, E3)`.

### Task M5.2: My reports

**Files:** Create `api/MyReportsApi.ts`, `hooks/useQueue.ts`, `hooks/useMyReports.ts`, `components/StatusChip.tsx`,
`screens/MyReportsScreen.tsx` · Test `__tests__/MyReportsApi.test.ts`

- `MyReportsApi(api).list()` → `api.request<RemoteReport[]>('GET', '/api/hazard-reports')`; the last successful list
  is cached in AsyncStorage (`safezone.hazard-reports.mine.v1`) by `useMyReports` so the tab works offline.
- `useQueue()` → the journal entries of the current owner, re-read on `queue.subscribe`.
- `useMyReports()` → `mergeMyReports(local, remoteOrCached)`, `refresh()` (= `sync.run('MANUAL')` then reload the
  remote list), `refreshing`.
- List rows: hazard, description, captured time, a chip with **text and colour**: _Pending sync_, _Sending…_,
  _Needs your choice_, _Not sent_, _Pending review_, _Verified_, _Rejected_ (+ reason).
- Row actions: _Needs your choice_ → _Update existing_ / _Submit as new_; _Not sent_ → the reason +
  _Send without photo_ (only when the entry has a photo) / _Discard_ (confirm first).
- Pull to refresh. Empty state: "You have not reported anything yet."
- Footer diagnostics line from `runLog.last()`: "Last sync 14:32 – by the system in the background – 2 sent, 0
  waiting" (`OS_TASK` → "by the system in the background"; `RECONNECT` → "when the connection returned";
  `APP_FOREGROUND` → "when the app opened"; `MANUAL` → "when you refreshed"). This is the on-screen evidence that the
  **OS** did the work.
- In development builds only (`__DEV__`): a _Run background sync now_ row calling `triggerSyncTaskForTesting()`.

**Tests:** `MyReportsApi.list` calls `GET /api/hazard-reports` and returns the body.

- [ ] Implement. On the phone: demo script step 2 (airplane mode → two reports → _Pending sync_ ×2 → airplane mode
      off → both become _Pending review_; the web dashboard shows the original capture times).
- [ ] Commit `feat(mobile): my reports with sync and decision status (H10)`.

---

## Phase M6 – Manual pin and photo recovery

### Task M6.1: `MapPin` (E1)

**Files:** Create `components/MapPin.tsx`

Props: `{ centre: { lat; lng }; pin?: { lat; lng }; editable: boolean; onPin(point): void }`. A `WebView` whose
`source={{ html }}` loads Leaflet 1.9.4 (CSS + JS from the unpkg CDN) and OpenStreetMap tiles, places a draggable
marker when `editable`, and posts `{ lat, lng }` with `window.ReactNativeWebView.postMessage(JSON.stringify(...))` on
`dragend` and on map `click`. `onMessage` parses it and calls `onPin`. Because the reporter may be offline, render the
coordinates as text under the map as well, and if the WebView reports `onError`, show: "The map cannot load offline.
Your last known position is used – move closer to a connection to adjust it." with the `lastKnown()` point offered
through a _Use this position_ button (which calls `onPin`).

In `ReportHazardScreen`: `LOCATING` → spinner line; `READY` → read-only map with the GPS pin and an _Adjust pin_ button
(switches `editable` on); `MANUAL` → an explanation by reason ("Location permission is off" with _Open settings_ via
`Linking.openSettings()` and _Try again_; "Could not get a GPS fix"), the editable map, and "Tap the map to place the
pin."

- [ ] On the phone: deny the location permission → manual pin → Submit → the web report detail says "Pinned on the map
      by the reporter". Then allow it → GPS pin → _Adjust pin_ → source becomes MANUAL.
- [ ] Commit `feat(mobile): manual location pin (E1)`.

### Task M6.2: Photo recovery (E2)

- [ ] In `PhotoField`, a photo failing `validatePickedPhoto` is **not** attached; show the reason ("Use a JPEG, PNG or
      WebP photo" / "This photo is larger than 5 MB") with _Retake_ and _Continue without photo_.
- [ ] On the phone: pick the > 5 MB gallery image kept for the demo → message → _Continue without photo_ → Submit works.
- [ ] Commit `feat(mobile): invalid photo recovery (E2)`.

---

## Phase M7 – Sync acceptance tests

- [ ] Run T1–T8 from `D-offline-sync-design.md` §11 on the real phone. Record the screen for T2, T3, T4.
- [ ] Note the phone model, Android version and the result of each test in the report (prototype constraints
      paragraph from Plan D §9).
- [ ] `cd mobile && npx jest --coverage && npx tsc --noEmit` → green; screenshot the coverage table.
- [ ] Update the status table in `IMPLEMENTATION_PLAN.md`.

---

## Traceability

| Change / flow                                 | Mobile artefact                                           | Proved by                                                                                 |
| --------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| A1 offline capture with original `capturedAt` | `OfflineReportQueue.enqueue`, `SyncManager.run`           | "enqueue persists… capturedAt", "uploads oldest first with the original capturedAt", T1   |
| A1 at OS level                                | `background/syncTask.ts`, `ensureSyncTaskRegistered`      | T2, T3, T5                                                                                |
| H7 no double counting                         | `clientReportId` in the journal, `classifySubmitResponse` | "ALREADY_RECEIVED counts as delivered", "second trigger… does not double-upload", T4, T6  |
| H6 / E3 duplicate online vs offline           | `submitReport`, `answerDuplicate`, `SyncManager.due`      | "submitNow surfaces DUPLICATE_SUSPECTED", "OS_TASK also resolves a pending duplicate", T8 |
| E1 no GPS → manual pin                        | `useCurrentLocation`, `MapPin`                            | hook tests, screen test 1                                                                 |
| E2 invalid photo                              | `validatePickedPhoto`, `PhotoField`, `sendWithoutPhoto`   | validator tests                                                                           |
| H10 native screens, status visible            | tabs, `OfflineBanner`, `MyReportsScreen`, notifications   | screen tests, `mergeMyReports` tests                                                      |
| Dependency inversion                          | `offline/ports.ts` + eight thin adapters                  | the offline core is tested with zero native mocks                                         |
