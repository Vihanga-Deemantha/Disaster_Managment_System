# UC-2 Resource Allocation Progress Report

## Project part

This work covers **UC-2: Allocate Multi-Agency Resources to an Affected Area** in the SafeZone disaster management system.

The District Officer can identify an affected area, view its outstanding needs, request resources from different organisations, receive owner responses, and track deployment and arrival.

## Work completed

### 1. District Officer resource workspace

The old long resource page was reorganised into a clear workspace:

- **Overview** – district summary, open incidents, active warnings and area requirements.
- **Allocate** – create a resource request for a selected affected area and requirement.
- **Requests & Responses** – view pending, confirmed, rejected and expired requests.
- **Deployments** – follow dispatched resources and confirm arrival.
- **Teams & Shelters** – see rescue team readiness and shelter capacity/occupancy.

The Overview page now shows requirements directly in a large panel. Water, medical supplies, dry rations, rescue teams and evacuation shelters are visible with required, fulfilled, pending and outstanding quantities.

### 2. Multi-agency resource allocation

Resources are stored with their owner organisation and type. The current demo data includes:

- Sri Lanka Army rescue teams
- Sri Lanka Red Cross medical teams
- Red Cross evacuation shelters
- Government and NGO relief supplies

The District Officer can request only a resource that matches the requirement type, category and unit. Shelters are restricted to the affected district.

### 3. Owner response flow

After a request is submitted:

1. The requested quantity is reserved.
2. The organisation receives an in-app notification.
3. The request receives a 30-minute respond-by deadline.
4. The owner can confirm the full quantity, confirm a smaller quantity, or reject with a reason.
5. A confirmed request creates a dispatch.
6. The District Officer confirms arrival.

Notifications are scoped correctly: districts see their own responses, owners see their organisation's requests, and DMC sees national resource notifications.

### 4. Partial allocation and insufficient stock

If the requested quantity is greater than the available stock, the system shows the available amount and the shortfall. The officer must explicitly accept a partial allocation.

The accepted quantity is reserved and the remaining requirement stays outstanding. If stock changes between searching and submitting, the request is rejected safely and the officer is asked to refresh.

### 5. Rescue team and shelter handling

Rescue teams are allocated as whole teams and expose their team type, team size, status and last known location.

Shelters track:

- Capacity
- Current occupancy
- Pending reserved places
- Confirmed committed places
- Free places
- Occupancy history logs

Reserved shelter places remain held until the allocation arrives. This prevents the same shelter capacity being promised twice.

### 6. Dispatch exception flows

The resource workflow now includes the remaining important dispatch variants:

- **Distribution failure** – an officer records a reason and the dispatch moves to `DISTRIBUTION_PENDING`.
- **Reschedule** – a pending delivery can be sent again after the problem is resolved.
- **Reassignment** – a dispatch can move to a higher-priority affected area in the same disaster event, with a reason and history entry.
- **No response** – unanswered requests expire and release their reservation.
- **Owner rejection** – the reservation is released and the requirement remains open.

Each change is written to the audit log and generates an in-app notification.

### 7. Stale partner simulation

Development mode includes a partner feed simulator for the Red Cross, Army and Irrigation Department. A DMC Officer can set a partner feed to:

- `OK`
- `STALE`
- `DOWN`

Stale or unavailable partner stock remains visible as **Status unknown**, cannot be selected for a new request, and creates a DMC notification. Setting the feed back to `OK` refreshes the saved sync time.

### 8. MongoDB demo data

Existing seed data is preserved. An additional resource scenario command is available:

```text
npm run seed:resources-demo -w backend
```

The scenario seed is additive and idempotent. It creates examples for pending, expired, rejected, smaller-confirmed, failed, rescheduled and reassigned requests in Gampaha, Colombo and Ratnapura. It does not clear the database or overwrite existing allocations.

The data is simulated demo data. It does not connect to real Army, NGO or government systems.

## Main use-case flow

```text
Incident / affected area
        ↓
Outstanding requirement
        ↓
Search matching multi-agency resources
        ↓
Check stock, partner freshness and district scope
        ↓
Reserve quantity and notify owner
        ↓
Owner confirms / partially confirms / rejects
        ↓
Create dispatch
        ↓
Officer confirms arrival
        ↓
Requirement and deployment history are updated
```

If there are many incidents, each affected area has its own requirements and allocation history. A resource is allocated against a specific requirement, so one incident's allocation does not get mixed with another incident's allocation.

If no resource is available, the requirement remains outstanding. The officer can try another organisation, accept a partial amount, wait for a partner feed to refresh, or reassign a suitable dispatch to a higher-priority area.

## Access control

- District Officer: sees and allocates only within the assigned district.
- Resource Owner Representative: responds only to requests for their organisation.
- DMC Officer: observes national requests, dispatches and partner feed status.
- Owner status updates and shelter occupancy updates require the owning organisation.

## Demo accounts

All demo accounts use the shared development password:

```text
SafeZone#Demo2026
```

Examples:

- District Officer: `district.gampaha@safezone.lk`
- Army Liaison: `forces.liaison@safezone.lk`
- NGO Manager: `ngo.manager@safezone.lk`
- Government Agency: `agency.officer@safezone.lk`
- DMC Officer: `dmc.officer@safezone.lk`

## Validation status

The original UC-2 resource module had complete domain, API and UI coverage before the exception-flow extension. The new extension has been typechecked and the normal resource tests continue to pass. New variant tests cover partial allocation, stale stock, distribution failure, rescheduling, reassignment, demo expiry and partner simulation.

The final verification pass still needs to resolve a small number of test-harness issues in the newly added simulation tests. These are test setup problems around the React `settle` helper and do not represent a production flow failure. The implementation should be treated as ready for the next verification pass, not as a fully closed release until that pass is complete.

## Files mainly changed

- `backend/src/modules/resources/` – allocation rules, stock, dispatch, partner simulation, Mongo seed and API routes.
- `frontend/src/features/resources/` – district overview, allocation form, request inbox, dispatch actions, teams/shelters and simulation controls.
- `backend/src/modules/hazard-reports/api/hazard-reports.http.ts` – district-scoped incident situation feed.
- `backend/src/modules/warnings/api/warnings.http.ts` – district-scoped active warning feed.

Generated Graphify output and explanatory documents were kept outside the normal commit history.
