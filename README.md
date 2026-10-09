# Safe Zone

Disaster alerts and coordination for Sri Lanka. SE3070 Assignment 02: four use cases built by four people
on one shared foundation (authentication, offline support, UI shell, contracts).

| Use case                                     | Owner          | Backend                              | Frontend                               |
| -------------------------------------------- | -------------- | ------------------------------------ | -------------------------------------- |
| UC-1 Issue Warning (+ shared authentication) | G.V.D. Perera  | `backend/src/modules/warnings`       | `frontend/src/features/warnings`       |
| UC-2 Allocate Multi-Agency Resource          | K.K.I. Shaveen | `backend/src/modules/resources`      | `frontend/src/features/resources`      |
| UC-3 Submit and Verify Hazard Report         | Pawan          | `backend/src/modules/hazard-reports` | `frontend/src/features/hazard-reports` |
| UC-4 Post-Event Impact Analysis              | Tharaka        | `backend/src/modules/analytics`      | `frontend/src/features/analytics`      |

> **Building a use case?** Read [docs/building-a-use-case.md](docs/building-a-use-case.md): it shows exactly how to plug
> your module into the backend and the web app, and how to test it.

## Quick start

You need **Node 20.19+** (22 LTS recommended), npm 10+, and a **MongoDB** (any one of: a local install, Docker, or a
free MongoDB Atlas cluster).

```bash
git clone https://github.com/Vihanga-Deemantha/Disaster_Managment_System.git
cd Disaster_Managment_System
git checkout develop          # the shared foundation lives here once it is merged

npm install                   # installs the backend and the frontend together
npm run setup                 # creates backend/.env with fresh random secrets (never commit it)
docker compose up -d mongo    # skip if you already run MongoDB locally, or use Atlas (see below)
npm run seed                  # demo staff, citizens and river basins
npm run dev                   # API on :4000, web app on :5173
```

Open <http://localhost:5173> and sign in with one of the [demo logins](#demo-logins).

**MongoDB options**

- _Local install or an existing service_: nothing to do, `backend/.env` already points at `mongodb://127.0.0.1:27017/safezone_dev`.
- _Docker_: `docker compose up -d mongo`. If port 27017 is already taken, run it with `MONGO_PORT=27018` and set
  `MONGODB_URI=mongodb://127.0.0.1:27018/safezone_dev` in `backend/.env`.
- _MongoDB Atlas_: create a free cluster, allow your IP, and paste its connection string into `MONGODB_URI` in `backend/.env`.

## Demo logins

`npm run seed` provisions one account per role. Every demo account shares one password: **`SafeZone#Demo2026`**
(override it with `SEED_PASSWORD` in `backend/.env` _before_ seeding). The seed refuses to run in production.

| Role                      | Sign in with                                                                                     | Scope                                |
| ------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------ |
| DMC Officer               | `dmc.officer@safezone.lk`                                                                        | national                             |
| DMC Officer (second)      | `dmc.officer2@safezone.lk`                                                                       | national (second DMC account)        |
| Duty Officer              | `duty.officer@safezone.lk`                                                                       | national                             |
| District Officer          | `district.gampaha@safezone.lk`, `district.colombo@safezone.lk`, `district.ratnapura@safezone.lk` | own district                         |
| NGO Manager               | `ngo.manager@safezone.lk`                                                                        | organisation `org-red-cross`         |
| Armed Forces Liaison      | `forces.liaison@safezone.lk`                                                                     | organisation `org-sl-army`           |
| Government Agency Officer | `agency.officer@safezone.lk`                                                                     | organisation `org-irrigation-dept`   |
| Donor                     | `donor@safezone.lk`                                                                              | organisation `org-relief-foundation` |
| Citizens (5) / Volunteer  | phones `0770000001` to `0770000006`                                                              | their district                       |

Staff accounts are **provisioned only**: staff never self-register. Citizens register themselves at `/register`.
These are fictional demo people with made-up NICs and phone numbers.

## Everyday commands

| Command                      | What it does                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| `npm run dev`                | API (tsx watch) and web app (Vite) together                                        |
| `npm run seed`               | Idempotent demo data. `npm run seed -- --fresh` wipes a `safezone*` database first |
| `npm test`                   | Backend Jest and frontend Vitest, with the coverage gates                          |
| `npm run lint` / `typecheck` | ESLint (incl. architecture rules) / TypeScript                                     |
| `npm run format`             | Prettier (a pre-commit hook also does this for staged files)                       |
| `npm run build`              | Production build of both workspaces                                                |
| `npm run test:e2e`           | Playwright against the production build, own API (`:4100`) and DB (`safezone_e2e`) |
| `npm run test:mutation`      | Stryker mutation testing on domain and application code (slow)                     |

First time running end-to-end tests: `npx playwright install chromium`.

## How it fits together

```
backend/src/
├─ shared/                 FROZEN foundation: change by PR approved by all four owners
│  ├─ contracts/           enums, the 3 cross-module events, auth schemas (also compiled into the web app)
│  ├─ auth/                register, login, refresh rotation, step-up re-auth, guards, citizen directory
│  ├─ errors/ events/ http/ audit/ time/ ids/ geo/ config/ logging/ db/
│  ├─ testing/             fakes and the module test harness
│  └─ module.ts            what a use case receives (ModuleContext) and returns (ModuleRegistration)
├─ modules/<use case>/     domain/  application/  infrastructure/  api/  composition.ts  seed/  __tests__/
├─ app.ts  bootstrap.ts    assemble the HTTP app and wire the shared services (frozen)
frontend/src/
├─ shared/                 AppShell, landing page, auth pages, API client, i18n (Si/Ta/En), offline layer, UI kit (frozen)
├─ features/<use case>/    index.tsx (your screens)  nav.ts (your sidebar entry)
└─ routes.tsx  navigation.ts
mobile/src/                the citizens' phone app (Expo), not an npm workspace: see "Mobile app" below
```

- **Layers**: `domain` (rules) → `application` (use-case control class, ports) → `infrastructure` (Mongo, gateways) and
  `api` (HTTP). ESLint enforces the direction: domain/application cannot import Express or Mongoose, and no code may call
  `new Date()`, `Date.now()` or `Math.random()` there (inject `Clock` / `IdGenerator`).
- **Modules never import each other.** They talk through three events on the shared `EventBus`
  (`ClusterEscalationRequested`, `WarningIssued`, `AllocationDeployed`). ESLint enforces this too.
- **One sidebar for every module** (report HCI-01), grouped Warnings / Coordination / Analysis, filtered by role.
- The browser and the server validate registration with **the same Zod schema** (`backend/src/shared/contracts`).

## Authentication and security (master plan §7.1)

- **Sessions**: 15-minute JWT access token and a rotating refresh token (12 h idle, 24 h cap for staff, 7 days for citizens),
  both in httpOnly, SameSite=Strict cookies. Refresh tokens are stored hashed. Re-using an old one revokes the whole sign-in.
- **No lockout, progressive delay instead**: after 3 wrong passwords each attempt waits 1, 2, 4 … up to 30 s, per account
  (unknown accounts too, so existence is not revealed), plus 20 sign-ins per 15 minutes per IP.
- **Step-up (BR3)**: `POST /api/auth/reauth` re-checks the password; `requireRecentAuth(300)` guards mass-alert routes.
- **Citizen data**: NIC encrypted with AES-256-GCM plus an HMAC for duplicate checks, shown masked, never read by other modules.
- **CSRF**: SameSite=Strict, an `X-Requested-With: SafeZone` header on every state-changing request, and an Origin allow-list.
- Every sign-in, failure, refresh-token reuse, logout and registration is written to the audit log (never passwords or tokens).

Endpoints: `POST /api/auth/register | login | refresh | logout | reauth | change-password`, `GET /api/auth/me`.

## Offline support (master plan §6)

The app shell is cached by a service worker, reads are cached per user in IndexedDB (`useCachedResource`), and writes made
offline wait in an ordered outbox (`useOfflineWrite`) that replays when the connection returns: in order, refreshing the
session first, stopping at the first rejected change and showing it, retrying server errors with back-off, and applying each
change once thanks to idempotency keys. Signing out (or a different person signing in) wipes the offline store.

## UC-1 Issue Warning: try it

`npm run seed` adds 200 demo citizens (phones `0771500001` to `0771500200`, same demo password) and the five pending
warnings of the wireframe: Gampaha, Ratnapura, the Kalu Ganga basin, the Kelani Ganga basin and Kegalle. Sign in as
`dmc.officer2@safezone.lk` and open **Pending Approvals**. The Kalu Ganga warning was submitted by
`dmc.officer@safezone.lk`; either DMC account can approve and issue it, including the submitter. If you seeded before the redesign, run
`npm run seed` again (without `--fresh`): it only fills in the submitters' names on the demo warnings.

Approving an individual UC3 report as a Duty Officer or DMC Officer now creates a linked request in
the DMC **Pending Approvals** queue, including Road blockage and Other reports. Approval sends no
alerts. A DMC Officer completes the warning text in all three languages, checks severity and the
proposed district, then uses **Approve & Issue** with password confirmation. Duty Officers cannot
issue warnings. The same DMC Officer may approve the report and issue its warning; the audit keeps
both actions. Repeated approval/event delivery does not create another request for the same report.

The screens follow the supplied design. [`docs/design/uc1-pending-approvals-redesign.md`](docs/design/uc1-pending-approvals-redesign.md)
shows it next to ours, lists every change from it and says why. The sidebar also opens **Issued Warnings** and **Rejected
Warnings**, and the number beside Pending Approvals is how many warnings are waiting.

| Try this                                                              | What it shows                                                                         |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Pending Approvals → hazard tabs, search box, Sort by, All time        | Find a warning among many; the cards above always count everything that is waiting    |
| Sidebar → Issued Warnings, then Rejected Warnings                     | What was sent (→ Delivery summary) and what was turned down, with the reason          |
| Review → Approve & Issue → type the password → Issue                  | Main flow; the password is checked again first (`/api/auth/reauth`, BR3)              |
| Review → Approve & Issue → Cancel                                     | A4: nothing is sent, nothing changes                                                  |
| Review → Edit → clear the Tamil text → Save                           | A2 and E1: inline errors; saving the edit moves the version on                        |
| Review → Reject (a reason is required)                                | A3                                                                                    |
| Open _Demo controls_ → Push notification: **Some sends fail** → Issue | A1: SMS still reaches everyone; the summary shows the failed pushes → Retry failed    |
| Demo controls → Push and SMS: **Down** → Issue                        | E2: still issued, "every channel unavailable", download the list of citizens to visit |
| Demo controls → back to **Working** → Retry failed                    | E3: everything that was waiting is delivered                                          |
| Go offline (browser DevTools → Network → Offline) on a review screen  | BR6: saved copy with "last synced"; Approve & Issue is off; edits are queued          |

The **Demo controls** panel (and `PUT /api/dev/gateways/:channel` with `{ "mode": "OK" | "FAIL_SOME" | "DOWN" }`) exists only
while developing (`npm run dev`) or in a build made with `VITE_DEMO_TOOLS=true`. The API mounts the routes only outside
production. Push, SMS, WhatsApp and e-mail are simulated behind ports; real gateways would be new adapter classes.

| Method and path                                          | Purpose                                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `GET /api/warnings?status=`                              | The list (step 1)                                                                    |
| `GET /api/warnings/:id`                                  | The warning, who it would reach per channel, and what is still wrong                 |
| `PATCH /api/warnings/:id`                                | Edit; the version travels in `expectedVersion` or `If-Match` (409 on a clash)        |
| `POST /api/warnings/:id/reject`                          | Reject with a reason                                                                 |
| `POST /api/warnings/:id/issue` (needs `Idempotency-Key`) | Approve and send; step-up guarded; 503 `ALL_CHANNELS_UNAVAILABLE` still means issued |
| `GET /api/warnings/:id/delivery`, `POST …/retry-failed`  | The summary, and send again what did not get through                                 |
| `GET /api/warnings/:id/unreached.csv`                    | The follow-up list for door-to-door visits                                           |

Failed sends are retried automatically by a timer (every 15 s, 3 retries per channel, back-off 30 s doubling to 10 min);
a gateway that was down never uses up the retries. The Sinhala and Tamil texts of the demo data are drafts: have a
native speaker read them before the demonstration.

## Mobile app (Expo): sign in and the Alerts tab

`mobile/` is the citizens' phone app (Expo SDK 57, React Native, Expo Router). It is **not** one of the npm workspaces: it
has its own `package.json` and lockfile, so install it on its own. It has sign-in and a three-step registration (the
same rules as the web), and UC-1's side of the phone: the **Alerts tab** (every warning sent to the citizen, a severity
chip, the time, an unread dot, pull to refresh, a poll every 15 s while the app is open) and **Alert detail**. When the
poll finds a new valid alert the phone shows a banner (a local notification; remote push does not work in Expo Go). The
screens, the rules, the decisions and what was left out are in
[`docs/design/uc1-mobile-alerts.md`](docs/design/uc1-mobile-alerts.md).

```bash
cd mobile
npm ci                                  # first time only
npm run start                           # development build; `npx expo start --go` for Expo Go
npm test                                # Jest, with the coverage gate
npm run typecheck                       # tsc --noEmit (lint runs from the repository root: `npm run lint`)
```

Start the API (`npm run dev -w backend`) and seed it first (`npm run seed`). While developing, the app finds the API by
itself: it uses the machine it was loaded from, on port 4000 (your laptop's address on the Wi-Fi for Expo Go on a phone,
`localhost` in a browser), so there is no address to type and a change of network cannot leave a stale one behind. Set
`EXPO_PUBLIC_API_URL` (see `mobile/.env.example`) only when the API is somewhere else, such as behind a tunnel. A phone must
be on the same Wi-Fi as the laptop, and Windows must let Node through its firewall on that network. Sign in with a demo
citizen's phone number (`0771500001` to `0771500200`, the demo password above). On the web, as `dmc.officer2@safezone.lk`,
issue the Gampaha warning: within 15 seconds the phone shows a banner, a row with an unread dot and a number on the Alerts
tab. Staff accounts cannot sign in on the phone ("Officer accounts use the web dashboard"). No phone?
`npx expo start --web --port 8081` shows the same screens in a browser; first set
`CORS_ORIGINS=http://localhost:5173,http://localhost:8081` in `backend/.env` and restart the API (a phone needs no CORS
setting). Banners are not available in a browser.

| Method and path      | Purpose                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/me/alerts` | The signed-in citizen's delivered warnings, newest first (at most 100), and the server's time. Citizens and volunteers only. |

## The public pages

- `/` is the landing page. Someone who is already signed in is sent straight to their own screen instead.
- `/login` and `/register` share one frame: a photo panel on wide screens, the form alone on phones. Registration is
  three short steps (about you, where you live, how we alert you); "Continue" only checks the step you are on.
- All three pages are written in Sinhala, Tamil and English, work without sideways scrolling from 320px wide, and open
  offline after one visit (the service worker keeps the photos from `frontend/public/images` that the visitor has seen).
- The palette and the Plus Jakarta Sans font (self-hosted, so it works offline) come from the design; the tokens are
  in `frontend/src/index.css`.
- They deliberately show **no live warnings** yet. When UC-1 exposes a public feed, add a "Live warnings" section to
  `frontend/src/shared/landing/` that reads it, and never show a message such as "No active warnings" while the feed is
  not connected: on a disaster site that would be a claim nobody has checked.

## Quality gates

| What                         | Gate                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| Each use case (back + front) | **100%** lines, branches, functions, statements. Switches on as soon as the folder has code |
| Shared code incl. auth       | ≥ 90%                                                                                       |
| Mutation score               | ≥ 90% on domain and application (Stryker)                                                   |
| CI (GitHub Actions)          | format → lint → typecheck → tests → build, then Playwright end-to-end                       |

## Git workflow

One branch per person (`feat/uc1-warnings`, `feat/uc2-resources`, `feat/uc3-hazard-reports`, `feat/uc4-analytics`),
branched from `develop`. Rebase on `develop` each morning, open a pull request when a flow works. Commit from your own account
in small steps: individual marks depend on visible individual history. `.github/CODEOWNERS` asks the owner to review changes
to their folders.

## Troubleshooting

- **"Cannot reach MongoDB"**: start one (see Quick start) or fix `MONGODB_URI`.
- **"Invalid environment configuration"**: run `npm run setup` to create `backend/.env`.
- **Port 4000 or 5173 is busy**: set `PORT` in `backend/.env` and `API_PROXY_TARGET=http://localhost:<port>` for the web app.
- **Tests cannot download MongoDB** (restricted network): set `MONGODB_TEST_URI=mongodb://127.0.0.1:27017` to use a running
  MongoDB instead; each test file gets its own throwaway database.
- **`argon2` fails to install**: the API falls back to bcrypt automatically and logs a warning; existing argon2 hashes
  cannot be checked on that machine, so seed it with its own database.
- **CI fails with `Cannot find module '@rollup/rollup-linux-x64-gnu'`** (or `@esbuild/linux-x64`,
  `lightningcss-linux-x64-gnu`, ...): `package-lock.json` has lost the Linux and macOS builds of the packages that ship one
  native build per system (an npm bug, [npm/cli#4828](https://github.com/npm/cli/issues/4828)). It happens when a lockfile
  is created next to an existing `node_modules` folder. `npm run verify:lockfile` lists what is missing (the pre-commit hook
  and CI run it too). Do not add those packages as dependencies, and `npm ci --include=optional` changes nothing: optional
  packages are installed by default. To repair it, delete `package-lock.json` **and** `node_modules`, run `npm install` in
  the clean folder, then run `npm run verify:lockfile` and the whole test suite (a new lockfile re-resolves every package, so
  expect some version changes).
- **Repository inside OneDrive / Dropbox**: syncing `node_modules` is slow and can lock files during `npm install`.
  Prefer a folder outside the synced area (for example `C:\dev\safezone`), or exclude `node_modules` from sync.

## Things to confirm before submission

- `HazardType` and `Severity` values in `backend/src/shared/contracts/enums.ts` are **provisional**: align them with the
  report's class diagram (Section 2.6) before the modules depend on them.
- The top strip of the landing page says "Official early warning service of the Disaster Management Centre", and its
  footer carries the DMC's name. This is a coursework project, so reword both (or add "prototype") before it is hosted
  anywhere public.
- Sinhala and Tamil strings (`frontend/src/shared/i18n/messages.si.ts`, `messages.ta.ts`) are drafts: have a native speaker
  proofread them.
- The home-district check uses approximate district centres, not boundaries (a citizen can always confirm their choice).
  Phone numbers are not verified by a one-time code.
