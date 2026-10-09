# Demo data for the final demonstration

`npm run seed:demo` fills a database with a complete, believable state of the whole system: every use case has
something in every state it can be in. This page says what is there, which login shows it, and how to put it on
MongoDB Atlas.

## Run it

```bash
npm run seed:demo -- --fresh     # drop a `safezone*` database, then seed everything
npm run seed:demo                # on a database that already has it: says so and adds nothing
```

It takes about 15 seconds on a local MongoDB, and a few minutes over the internet to Atlas (each step waits for the
database). It prints a progress line per use case and, at the end, what the database holds by state.

| Good to know                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--fresh` only drops a database whose name starts with `safezone` (for example `safezone_demo`). It refuses anything else.                                                                                                             |
| The scenarios move stock and counters, so they are meant for an empty database. A marker (`demo_seed_state`) stops a second run; `--fresh` is how you rebuild. A run that stopped half-way is detected and asks for `--fresh`.         |
| **Re-seed on the day.** Report times and cluster scores count back from the moment of seeding, and drafts that came from UC-3 are valid for 24 hours by design. Run it with `--fresh` shortly before the demonstration.                |
| **UC-2 needs a replica set** (it books stock in transactions). Atlas is one. A plain local `mongod` is not: start the project's own with `scripts/start-local.ps1` (it uses `docker-compose.yml`).                                     |
| Report **photos are files**, not database records: they are written to `backend/.data/hazard-photos` (or `HAZARD_PHOTO_DIR`) on the machine that ran the seed. Seed from the machine that runs the API, or the photos will be missing. |
| `npm run seed` (the base seed) is unchanged and still works. `seed:demo` runs it first, then adds the scenarios.                                                                                                                       |

## On MongoDB Atlas

1. Create a free cluster. Under **Database Access** add a user with a password (URL-encode special characters in it).
   Under **Network Access** allow your address, or `0.0.0.0/0` for the demonstration (your address changes with the network).
2. **Connect → Drivers** and copy the connection string. Put it in `backend/.env`, naming the database after the host:

   ```
   MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/safezone_demo?retryWrites=true&w=majority
   ```

3. Seed it, then start the app as usual:

   ```bash
   npm run seed:demo -- --fresh
   npm run dev
   ```

Keep the `NIC_ENCRYPTION_KEY` and `NIC_HASH_KEY` of `backend/.env` the same for the seed and for the API (they are, when both
read the same file). Never commit the URI: it holds the password.

## The people

Every account shares the demo password in the [README](../README.md#demo-logins) (`SEED_PASSWORD` changes it before seeding).

| Role                                  | Sign in with                                                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| DMC Officer (two accounts)            | `dmc.officer@safezone.lk`, `dmc.officer2@safezone.lk`                                                            |
| Duty Officer (two accounts)           | `duty.officer@safezone.lk`, `duty.officer2@safezone.lk`                                                          |
| District Officer, five districts      | `district.gampaha@`, `.colombo@`, `.ratnapura@`, `.kalutara@`, `.kegalle@safezone.lk`                            |
| Resource owners                       | `ngo.manager@` (Red Cross), `forces.liaison@` (Army), `agency.officer@` (Irrigation Department) `safezone.lk`    |
| Donor                                 | `donor@safezone.lk`                                                                                              |
| 200 citizens (the phone app's people) | `0771500001` to `0771500200`: Gampaha 1-60, Colombo 61-110, Ratnapura 111-140, Kalutara 141-170, Kegalle 171-200 |
| 5 more citizens                       | `0770000001` to `0770000005`                                                                                     |
| 7 volunteers                          | `0770000006`, and `0772100001` to `0772100006`                                                                   |

`0771500001` is the phone demonstration account (Gampaha). It has no active alert, so the warning you issue live is the
only banner it gets, and its **My reports** holds a verified, a rejected (with the reason) and a pending report.

## What is in each use case

### UC-1 Issue Warning (sign in as `dmc.officer2@safezone.lk`)

| Where                      | What is there                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Pending Approvals** (11) | The five base drafts (Gampaha, Ratnapura, Kalu Ganga basin, Kelani Ganga basin, Kegalle). **Five requests from approved UC-3 reports** (three Ratnapura landslide, one Colombo road blockage, one Kalutara other) with no text yet, to show E1. **One draft from an escalated cluster** (Colombo flood), with no Sinhala or Tamil.                                                                           |
| **Issued Warnings** (4)    | **Colombo flood**: delivered on push, SMS, WhatsApp and e-mail (expired). **Gampaha flood**: 56 of 62 reached, 14 failed pushes, **6 citizens not reached** (try **Retry failed** and the CSV). **Ratnapura landslide**: issued while every gateway was down, delivered an hour later (active). **Kegalle landslide**: the full UC-3 to UC-1 path, from a cluster, text completed by a DMC Officer (active). |
| **Rejected Warnings** (8)  | Two rejected by a person (not enough evidence, duplicate) and six single-report requests set aside because a cluster warning covered them, each with its reason.                                                                                                                                                                                                                                             |
| Phone **Alerts** tab       | Gampaha citizens: an expired alert. Kegalle and Ratnapura citizens: an active one. Colombo citizens: an expired one.                                                                                                                                                                                                                                                                                         |

Try: open a report-linked draft (**Review**), see the three blank texts and the errors, fill them in, **Approve & Issue**.

### UC-3 Hazard reports (sign in as `duty.officer@safezone.lk`; the phone for citizens and volunteers)

| Where                 | What is there                                                                                                                                                                                                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard**         | Nine open clusters in every priority band. **Ratnapura landslide** is **Escalation recommended** (high priority, three verified): open it and press **Escalate to warning**, then look at Pending Approvals. It is a landslide on purpose, so it stays high priority all day.                   |
| Escalate switched off | Kalutara flood (high priority, nothing verified), Kandy flood (reports delivered late from a phone with no signal: elevated, nothing verified), the road-blockage and "other" clusters (no warning exists for them).                                                                            |
| **Report history**    | Two escalated clusters (Kegalle, Colombo flood), one **closed** cluster (three false alarms, each rejected with a reason), verified and rejected reports, volunteers' reports (weighted 1.5), pins placed by hand, reports taken hours before they were delivered, and 23 reports with a photo. |

The photos are small pictures drawn by the seed (sky, ground, the hazard), not real photographs.

### UC-2 Allocate Resources (a District Officer, and the owner accounts)

| Where                 | What is there                                                                                                                                                                                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Requests**          | Every outcome: ten confirmed (one in part: 90 of 120), one **declined with a reason**, one that **ran out of time with no answer** (stock released, then asked of another owner), and one **waiting for its owner**: sign in as `ngo.manager@safezone.lk` to confirm or decline it. |
| **Deployments**       | Seven arrivals confirmed, and three on the way (Colombo shelter places, a Ratnapura medical team, Kegalle shelter places): sign in as the district officer and confirm arrival.                                                                                                     |
| **Teams & shelters**  | A rescue unit deployed in Colombo, seven shelter occupancy reports, an owner feed three days old, and a water source taken offline. Shelters in five districts, each balanced (free + held + occupied + confirmed = capacity).                                                      |
| **District overview** | Open incident groups and active warnings for the district. Ratnapura and Kegalle show an active warning; the others show none.                                                                                                                                                      |

### UC-4 Impact analytics (`dmc.officer@safezone.lk`, `ngo.manager@safezone.lk`, `donor@safezone.lk`)

Six months of history in ten districts (choose "Ratnapura Monsoon Flood" or "Colombo Urban Flood" for full charts), the
alerts and arrivals made by the stories above (they reached analytics through the same events the running system uses),
and an **export history**: three exports (a PDF, a CSV and a PDF) made by the real export code, each with its SHA-256, and
one export that **failed** after its automatic retry.

## How it works, and how to extend it

The scenarios do not write documents by hand. They build the same services the API is made of (the warning controller, the
report submission and review services, the allocation service, the analytics controller) and run them with the clock set to
past moments, so delivery results, retries, cluster scores, stock and the analytics feed are the ones the rules produce. The
gateways are scripted per story (all working; every ninth citizen failing for good; down and back an hour later).

| File (`backend/src/seed/demo/`) | Does                                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| `index.ts`                      | The command: the base seed, then the scenarios; `--fresh` guard                        |
| `run.ts`                        | Orders the stories, writes the "already seeded" marker                                 |
| `world.ts`                      | Joins the real services with a moving clock                                            |
| `accounts.ts`                   | Extra staff and the volunteers                                                         |
| `hazardReports.ts`              | UC-3 stories: seven clusters (their reports, reviews, one escalation)                  |
| `warnings.ts`                   | UC-1 stories: three issued with delivery history, the Kegalle cluster path, rejections |
| `resources.ts`                  | UC-2 stories: thirteen requests, arrivals, shelter reports, stock exceptions           |
| `analytics.ts`                  | UC-4 export history; a store that writes in parallel (so Atlas is not slow)            |
| `gateways.ts`, `photos.ts`      | The scripted channels; the drawn photos                                                |

Tests: `backend/src/seed/__tests__/` seed an in-memory database and check every state above, that nothing is added twice,
and that a half-finished run is refused. The Sinhala and Tamil texts of the new warnings are drafts: have a native speaker
read them before the demonstration.
