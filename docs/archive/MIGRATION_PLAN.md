# LogisticBay — Phase 1 Migration Plan
> Schema audit findings + safe migration path to Job/JobPart/Run/RunAssignment/LoadTrack/Event
> Last updated: 2026-05-16
> DO NOT implement until this plan is reviewed and approved.

---

## What the audit found

### Current state summary

| What exists | What it does | Problem |
|---|---|---|
| `PlannedJob` | Holds job data AND driver/vehicle assignment | Conflates Job + Run into one model |
| `JobStop` | Stop-by-stop locations | Missing: quantity per stop, custody, load possession |
| `JobExecutionEvent` | Records what happened | Missing: custody fields, expanded event types, run reference |
| `LoadDetails` | Cargo specs per job | Good — keep as-is, link to Job |
| `Shift` / `ShiftSegment` / `DeliveryTask` | Driver shift reporting | **Fully independent from jobs** — no migration risk |
| `SavedLocation` | Reusable addresses | Keep as-is |
| `JobTemplate` | Reusable job structure | Keep as-is |

### Critical findings

**1. PlannedJob is both Job and Run**
Fields that belong on Job: `companyId`, `customerId`, `jobReference`, `materialType`, `plannerNotes`, `requirePOD`, `requireCollection`, `requireDeliveryQty`, `status`, stops, loadDetails.
Fields that belong on Run: `assignedDriverId`, `assignedTruck`, `assignedTrailer`, `vehicleClass`, `vehicleClassRequired`.

**2. Shifts are completely independent**
`Shift`, `ShiftSegment`, `DeliveryTask` have zero FK references to `PlannedJob`. They are a parallel system for timesheet/payroll purposes. Migration does not touch them.

**3. Mobile depends on these PlannedJob fields directly**
```
status, requirePOD, requireCollection, requireDeliveryQty,
podNumber, actualQuantity, actualUnit, quantityExpected, quantityUnit,
materialType, assignedTruck, assignedTrailer, plannerNotes, jobReference,
pickupTextSnapshot, dropoffTextSnapshot, referenceNumber, events[]
```
These must remain accessible at `/jobs/my` throughout and after migration.

**4. Status is a plain String, not an enum**
Values in use: `pending`, `accepted`, `in_progress`, `arrived_pickup`, `collected`, `arrived_dropoff`, `completed`, `cancelled`.
New statuses to add: `partially_collected`, `partially_delivered`, `attention_needed`, `override_closed`.

**5. JobExecutionEvent.driverId references User.id, not DriverProfile.id**
Known tech debt. Do not fix in this migration — mark for Phase 2.

**6. Many string fields default to `""` instead of `NULL`**
Known issue from CLAUDE.md nullable field rule. Fix model-by-model as we touch them.

---

## Migration strategy — additive first, migrate second, remove last

### The golden rule
**Never remove a field until every consumer (mobile, web, API) has been updated to use the replacement.**

Order of operations:
```
Step 1 — Add new models (Run, RunAssignment, LoadTrack) — zero breaking changes
Step 2 — Add new fields to existing models (JobStop gets quantity fields)
Step 3 — Migrate existing data (every PlannedJob → Job + Run + RunAssignments)
Step 4 — Update API routes to write to both old and new fields (dual-write period)
Step 5 — Update web UI to use new model
Step 6 — Update mobile app to use new model
Step 7 — Remove old fields (only after Step 6 is confirmed working)
```

Steps 1-3 can ship together. Steps 4-7 are separate deploys.

---

## Step 1 — Add new models (no breaking changes)

### New model: Run

Add to schema. Does not touch any existing model.

```
Run
  id             Int      PK autoincrement
  companyId      Int      FK Company — tenant isolation
  branchId       Int?     FK Branch — Phase 2 (nullable for now)
  runReference   String   system-generated e.g. RUN-26-000001
  status         String   default "draft"
  assignedDriverId  Int?  FK DriverProfile
  assignedTruck  String   default ""
  assignedTrailer String  default ""
  plannedDate    DateTime?
  estimatedStartTime String default ""
  estimatedEndTime   String default ""
  actualStartTime    DateTime?
  actualEndTime      DateTime?
  publishedToDriver  Boolean default false
  plannerNotes   String   default ""
  createdBy      Int      FK User
  createdAt      DateTime default now()
  updatedAt      DateTime @updatedAt

  @@index([companyId, plannedDate])
  @@index([companyId, status])
  @@index([companyId, assignedDriverId])
```

Run statuses: `draft`, `assigned`, `published`, `in_progress`, `completed`, `failed`, `cancelled`

### New model: RunAssignment

Bridge between JobStop (becoming JobPart) and Run.

```
RunAssignment
  id               Int      PK autoincrement
  companyId        Int      FK Company
  runId            Int      FK Run
  jobStopId        Int      FK JobStop  ← references existing JobStop (renaming to JobPart later)
  jobId            Int      FK PlannedJob  ← denormalised for fast queries
  sequenceNumber   Int      order within the run
  quantityAssigned Decimal  how much of this stop's quantity this run covers
  quantityUnit     String   default ""
  status           String   default "pending"
  addedAt          DateTime default now()
  addedBy          Int      FK User
  removedAt        DateTime?
  removedBy        Int?
  removalReason    String   default ""
  notes            String   default ""

  @@index([companyId, runId])
  @@index([companyId, jobStopId])
  @@index([companyId, jobId])
```

RunAssignment statuses: `pending`, `in_progress`, `at_collection`, `at_delivery`, `completed`, `failed`, `skipped`

### New model: LoadTrack

Immutable ledger. Append-only — never update or delete rows.

```
LoadTrack
  id               Int      PK autoincrement
  companyId        Int      FK Company
  jobId            Int      FK PlannedJob
  jobStopId        Int      FK JobStop
  runId            Int?     FK Run
  runAssignmentId  Int?     FK RunAssignment
  eventId          Int      FK JobExecutionEvent — required, must link to the event that caused this
  transactionType  String   collected | depot_received | reloaded | transferred |
                            delivered | failed_delivery | returned | partially_collected
  quantity         Decimal
  unit             String   default ""
  fromCustody      String   e.g. site:{jobStopId} | trailer:{trailerId} | depot:{branchId}
  toCustody        String   e.g. trailer:{trailerId} | depot:{branchId} | delivered:{jobStopId}
  driverId         Int?     FK User
  trailerId        String   default "" (plain string — matches existing assignedTrailer pattern)
  timestamp        DateTime clientTimestamp from event
  serverReceivedAt DateTime default now()
  gpsLat           Float?
  gpsLng           Float?
  notes            String   default ""

  @@index([companyId, jobId])
  @@index([companyId, jobStopId])
  @@index([companyId, runId])
  @@index([companyId, timestamp])
```

---

## Step 2 — Add new fields to existing models

### Add to PlannedJob (Job fields — additive only, no removal yet)

```
overrideClosed          Boolean  default false
overrideReason          String   default ""
overrideNotes           String   default ""
overrideQuantityDelivered Decimal?
overrideQuantityShortfall Decimal?
closedAt                DateTime?
closedBy                Int?     FK User
```

New status values to allow (no schema change needed — status is String):
`partially_collected`, `partially_delivered`, `attention_needed`, `override_closed`

### Add to JobStop (JobPart fields — additive only, no removal yet)

```
quantityRequired    Decimal?   planned quantity for this stop (null = not tracked)
quantityUnit        String     default "" (will use job-level unit if empty)
quantityCollected   Decimal?   updated from LoadTrack
quantityDelivered   Decimal?   updated from LoadTrack
coordinateVerified  Boolean    default false
```

### Add to JobExecutionEvent (Event expansion — additive only)

```
runId            Int?   FK Run
runAssignmentId  Int?   FK RunAssignment
quantityConfirmed Decimal?
fromCustody      String  default ""
toCustody        String  default ""
```

New event types to support (string values, no enum change needed):
`run_started`, `run_completed`, `run_failed`,
`arrived_collection`, `loading_started`, `collected`, `partially_collected`, `collection_failed`,
`arrived_delivery`, `delivered`, `partially_delivered`, `delivery_failed`,
`arrived_depot`, `depot_unloaded`, `depot_loaded`,
`trailer_swapped`, `truck_swapped`, `load_transferred`, `handover`,
`driver_assigned`, `run_published`, `status_override`, `note_added`

Existing event types (`started`, `arrived_pickup`, `arrived_dropoff`, `completed`, `cancelled`) are kept unchanged — mobile sync still uses them.

---

## Step 3 — Data migration (every existing PlannedJob gets one Run)

This is a one-time backfill script. Run on deploy after Step 1 and 2 migrations land.

**Logic per PlannedJob:**

```
For each PlannedJob where status != 'cancelled':

  1. Create Run:
       companyId     = job.companyId
       runReference  = 'RUN-' + job.jobReference (or auto-generate)
       status        = map from job.status (see mapping below)
       assignedDriverId = job.assignedDriverId
       assignedTruck    = job.assignedTruck
       assignedTrailer  = job.assignedTrailer
       plannedDate      = job.plannedDate
       plannerNotes     = job.plannerNotes
       createdBy        = job.createdByUserId
       createdAt        = job.createdAt

  2. For each JobStop on this job:
       Create RunAssignment:
         runId             = new Run.id
         jobStopId         = stop.id
         jobId             = job.id
         sequenceNumber    = stop.sequenceNumber
         quantityAssigned  = stop.numPallets (existing field, may be null → 0)
         quantityUnit      = "" (unit not tracked at stop level yet)
         status            = map from job.status (see mapping below)
         addedAt           = job.createdAt
         addedBy           = job.createdByUserId

  3. For each JobExecutionEvent on this job:
       Update: runId = new Run.id
       (runAssignmentId left null — cannot determine which stop the event was for)
```

**Status mapping for migration:**

| PlannedJob.status | Run.status |
|---|---|
| `pending` | `draft` |
| `accepted` | `assigned` |
| `in_progress` | `in_progress` |
| `arrived_pickup` | `in_progress` |
| `collected` | `in_progress` |
| `arrived_dropoff` | `in_progress` |
| `completed` | `completed` |
| `cancelled` | `cancelled` |

**Result:** Every existing job has exactly one Run. System behaves identically to before. New jobs going forward can have multiple Runs.

---

## Step 4 — Dual-write period (API routes)

During this period, routes write to BOTH old fields and new models.

### POST /jobs (create job)
- Write to PlannedJob as today (no change)
- Also create one Run with assignedDriver/Truck/Trailer from body
- Create RunAssignments for each stop

### PATCH /jobs/:id/allocate (assign driver)
- Write to PlannedJob.assignedDriverId, assignedTruck, assignedTrailer as today
- Also write to the job's primary Run

### PATCH /jobs/:id/status
- Write to PlannedJob.status as today (keeps mobile working)
- Also write to RunAssignment.status for the relevant stop
- Also write LoadTrack entry for collect/deliver events

### POST /sync/events
- Process as today (keeps mobile working — no change to mobile sync)
- Additionally write LoadTrack entries for `collected` and `completed` events
- Additionally update RunAssignment.status

### GET /jobs/my
- Returns PlannedJob as today — no change
- Mobile sees no difference

---

## Step 5 — New Run Planner UI (web only)

Build the new planner board using the new Run/RunAssignment/LoadTrack models.
Old planner dashboard remains functional throughout this step.
No mobile changes in this step.

---

## Step 6 — Mobile update (separate release)

Update mobile to:
- Read run data from Run model via new endpoint `GET /runs/my`
- Send events referencing runId and runAssignmentId
- Keep fallback to old `/jobs/my` during transition

This is a separate mobile release — must not be coupled to API changes.

---

## Step 7 — Remove old fields (only after Step 6 confirmed)

Only after mobile has been updated and confirmed working in production:
- Remove `assignedDriverId`, `assignedTruck`, `assignedTrailer` from `PlannedJob`
- Remove `actualQuantity`, `actualUnit`, `podNumber`, `collectionNote`, `deliveryNote` from `PlannedJob` (these move to Event + LoadTrack)
- Archive old status values that are no longer needed

**Do not rush Step 7.** Old fields cost nothing to keep. Removing them too early breaks mobile.

---

## What we do NOT touch in this migration

| Model | Action |
|---|---|
| `Shift` | Untouched — fully independent |
| `ShiftSegment` | Untouched |
| `DeliveryTask` | Untouched |
| `SavedLocation` | Untouched |
| `JobTemplate` | Untouched |
| `Customer` | Untouched |
| `DriverProfile` | Untouched |
| `FleetUnit` | Untouched |
| `FleetTrailer` | Untouched |
| `JobRequest` | Untouched — request intake flow stays the same |
| `ClientRequestLink` | Untouched |
| `AuditLog` | Untouched |
| `JobAudit` | Untouched |

---

## Migration risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| `/jobs/my` breaks for mobile | CRITICAL | Dual-write — PlannedJob fields preserved throughout |
| Existing job status transitions break | HIGH | ALLOWED_JOB_TRANSITIONS unchanged until Step 6 |
| Data loss in backfill | HIGH | Backfill is additive only — creates Run+RunAssignment, never deletes |
| Run created for cancelled jobs | LOW | Skip cancelled jobs in backfill |
| LoadTrack balance wrong for migrated jobs | MEDIUM | Historical jobs start with no LoadTrack entries — ledger begins from migration date |
| Mobile sync breaks | CRITICAL | Sync events continue to write to PlannedJob.status — no change to sync until Step 6 |

---

## Decisions recorded — 2026-05-16

1. **JobStop → JobPart rename**: YES — rename in schema + find/replace all routes in same PR.
2. **Backfill trigger**: Auto on deploy. Script is idempotent (checks for existing Run before creating).
3. **Run.runReference counter**: Separate counter — `RUN-26-000001` sequence, independent of job reference.
4. **Historical event runId**: Leave null — honest value for events before Run model existed.
