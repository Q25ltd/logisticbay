# LogisticBay — Phase 1 Data Model
> Logic-level definition of the six core objects.
> Last updated: 2026-05-16 (added stop-level load specs, vehicle/trailer requirement sources, derived run requirements, compatibility check logic)
>
> **This document is never finished.**
> New operational details will always emerge. When they do, insert them here in the right place
> before writing any code. Every detail that is not written down gets built wrong.

---

## Relationships at a glance

```
Company
  └── Branch
        ├── Job
        │     └── JobPart[]          ← physical pieces of work
        └── Run
              └── RunAssignment[]    ← JobPart linked to Run with quantity + sequence
                    └── links to →  JobPart (from any Job in this Branch)

LoadTrack                            ← ledger entry every time load changes hands
Event                                ← immutable record of what actually happened
```

Key rule: **Run does not belong to a Job.** RunAssignment is the bridge.

---

## 1. Job

The customer promise. Holds the full requirement. Never split — only its parts are split.

| Field | Type | Notes |
|---|---|---|
| id | ID | auto |
| companyId | ID | tenant isolation — always required |
| branchId | ID | which branch created this job |
| jobReference | String | system-generated, e.g. `LGB-26-000001` |
| source | Enum | `internal` (planner created) or `external` (from customer request) |
| originRequestId | ID? | link back to the JobRequest if source=external |
| status | Enum | see Status section below — DERIVED, never set manually |
| customerId | ID? | link to Customer record if known |
| customerName | String | always stored even if customerId exists (denormalised for history) |
| customerRef | String? | customer's own order/reference for this job |
| executionDate | Date | the date this job should be executed |
| serviceType | Enum | `standard`, `express`, `timed`, `economy` |
| priority | Enum | `normal`, `urgent`, `critical` |
| vehicleTypeRequired | String? | the vehicle category needed |
| trailerTypesAllowed | String[] | compatible trailer types |
| totalQuantityRequired | Decimal | total quantity that must move (e.g. 52) |
| totalQuantityUnit | String | `pallets`, `boxes`, `kg`, `litres`, etc. |
| materialType | String? | goods description |
| weight | Decimal? | total weight in kg |
| volume | Decimal? | total volume in m³ |
| hazardClass | String? | ADR class if hazardous |
| temperatureControlled | Boolean | default false |
| temperatureRange | String? | e.g. `2-8°C` |
| requirePOD | Boolean | default true |
| plannerNotes | String? | internal planner notes |
| customerNotes | String? | notes from customer |
| driverVisibleNotes | String? | notes driver will see |
| vehicleRequirementSource | Enum | `not_specified`, `customer_specified`, `system_derived`, `planner_set` |
| trailerRequirementSource | Enum | `not_specified`, `customer_specified`, `system_derived`, `planner_set` |
| customerVehicleType | String? | vehicle type the customer asked for |
| customerTrailerTypes | String[] | trailer types the customer specified |
| derivedVehicleType | String? | calculated by system from stop load specs |
| derivedTrailerTypes | String[] | calculated by system from stop load specs |
| finalVehicleType | String? | planner-confirmed vehicle type — used for compatibility checks |
| finalTrailerTypes | String[] | planner-confirmed trailer types — used for compatibility checks |
| createdBy | ID | user who created |
| createdAt | DateTime | |
| updatedAt | DateTime | |
| closedAt | DateTime? | when job reached completed or override_closed |
| closedBy | ID? | who closed it |
| overrideClosed | Boolean | false = closed naturally, true = planner confirmed shortfall |
| overrideReason | Enum? | only set when overrideClosed=true — see reasons below |
| overrideNotes | String? | planner's explanation |
| overrideQuantityDelivered | Decimal? | actual quantity delivered when job was override-closed |
| overrideQuantityShortfall | Decimal? | difference between required and delivered |

### Job status (derived — never set manually)

Status is calculated from the state of all its JobParts and LoadTrack entries.
The ONE exception: `override_closed` — set by planner when confirming a quantity mismatch is resolved.

| Status | Meaning |
|---|---|
| `draft` | created, no job parts yet |
| `planned` | job parts exist, all assigned to runs, not started |
| `in_progress` | at least one run has started |
| `partially_collected` | some quantity collected, not all |
| `partially_delivered` | some quantity delivered, not all |
| `completed` | all required quantity delivered — automatic |
| `override_closed` | planner confirmed job complete despite quantity mismatch |
| `attention_needed` | a problem exists — see warnings |
| `cancelled` | job cancelled before execution |

### Override close — rules and flow

Planner can confirm a job complete when quantities do not match exactly.
This covers: client sent wrong quantity, goods damaged at source, agreed shortfall, short load.

**What the system checks before allowing override close:**

```
1. No RunAssignment has status = in_progress     → BLOCK: "A run is still active"
2. No RunAssignment has status = at_collection   → BLOCK: "Driver is still at collection site"
3. No RunAssignment has status = at_delivery     → BLOCK: "Driver is still at delivery site"
4. overrideReason must be provided               → BLOCK: "Reason is required"
5. overrideNotes must be provided                → BLOCK: "Explanation is required"
```

All five checks must pass. If any run is still actively working on this job, the planner cannot close it.
The planner closes the job's outstanding **parts** — not the job directly.

**Override close reasons (enum):**

| Reason | Meaning |
|---|---|
| `client_error` | customer provided wrong quantity — their mistake |
| `short_load` | load was short at source — not enough goods available |
| `agreed_shortfall` | customer agreed to accept less than ordered |
| `goods_damaged` | some goods damaged at collection — not loaded |
| `access_refused` | part of collection refused by site |
| `other` | other — requires explanation in overrideNotes |

**Audit trail — always recorded:**

```
Job override-closed by: Sarah (planner)
Reason: client_error
Expected quantity: 52 pallets
Delivered quantity: 50 pallets
Shortfall: 2 pallets
Notes: "Customer confirmed only 50 were available at site. Signed off."
Timestamp: 2026-05-16 14:32
```

This protects the planner. If the customer disputes later, the record is complete.

---

## 2. JobPart

One physical piece of work. The movable unit.

| Field | Type | Notes |
|---|---|---|
| id | ID | auto |
| companyId | ID | tenant isolation |
| jobId | ID | which Job this belongs to |
| type | Enum | `collect`, `deliver`, `move_to_depot`, `reload`, `transfer`, `return`, `waypoint` |
| sequenceHint | Int? | suggested sequence within the job — not enforced, Run determines actual order |
| status | Enum | see below |
| siteName | String | site/company name at this location |
| street | String | |
| addressLine2 | String? | |
| town | String | |
| county | String? | |
| postcode | String | |
| country | String | default `GB` |
| lat | Decimal? | truck entrance/gate — manually verified |
| lng | Decimal? | truck entrance/gate — manually verified |
| coordinateVerified | Boolean | whether a human confirmed the pin |
| navigationInstructions | String? | gate code, access notes, directions |
| contactName | String? | site contact |
| contactPhone | String? | site contact phone |
| contactEmail | String? | site contact email |
| referenceNumber | String? | collection release number or goods-in number |
| bookingRef | String? | site appointment/slot reference |
| bookingRequired | Boolean | default false |
| timeWindowStart | String? | earliest arrival time, e.g. `08:00` |
| timeWindowEnd | String? | latest arrival time, e.g. `14:00` |
| bookedTime | String? | exact fixed appointment time if booked |
| unloadingAllowanceMinutes | Int | estimated on-site time in minutes |
| quantityRequired | Decimal | planned quantity for this part (may be partial of job total) |
| quantityUnit | String | must match job unit |
| quantityCollected | Decimal | updated from LoadTrack — what was actually collected |
| quantityDelivered | Decimal | updated from LoadTrack — what was actually delivered |
| proofRequirements | String[] | `signature`, `photo`, `pod_number`, `timestamp` |
| accessRequirements | String[] | PPE, high-vis, induction, etc. |
| handlingMethods | String[] | `forklift`, `tail_lift`, `crane`, `manual`, `pump` |
| heightRestriction | String? | e.g. `4.2m` |
| weightRestriction | String? | e.g. `18t` |
| stopNotes | String? | additional notes for this stop |
| stopGoodsType | String? | goods type at this stop — overrides job-level if set |
| stopWeight | Decimal? | weight of load at this specific stop (kg) |
| temperatureControlled | Boolean | default false — does this stop's load require a temp-controlled trailer? |
| temperatureRange | String? | e.g. `2–8°C` |
| hazardous | Boolean | default false |
| hazardClass | String? | ADR class if hazardous (e.g. `3`, `6.1`) |
| oversized | Boolean | default false — affects trailer/permit requirements |
| createdAt | DateTime | |

### JobPart status

| Status | Meaning |
|---|---|
| `unassigned` | not yet in any run |
| `assigned` | in a run, run not started |
| `in_progress` | run has started, this part not done |
| `completed` | all required quantity confirmed |
| `partially_done` | some quantity done, remainder outstanding |
| `failed` | could not complete — attention needed |
| `cancelled` | removed from plan |

### Partial quantity logic (important)

A collect part requiring 52 pallets may be split across two runs:
- Run 1 is assigned 26 pallets
- Run 2 is assigned 26 pallets
- 26 + 26 = 52 = quantityRequired ✓

If only 20 were collected in Run 1 (driver could only load 20):
- quantityCollected = 20
- quantityRequired - quantityCollected = 32 still uncollected
- Status → `partially_done`
- System warns: 32 pallets remain at collection site

---

## 3. Run

The execution plan. One driver, one vehicle, one trailer, one period of work.
Independent — not owned by any Job.

| Field | Type | Notes |
|---|---|---|
| id | ID | auto |
| companyId | ID | tenant isolation |
| branchId | ID | which branch this run belongs to |
| runReference | String | system-generated, e.g. `RUN-26-000042` |
| status | Enum | see below |
| assignedDriverId | ID? | null until planner assigns |
| assignedTruckId | ID? | null until assigned |
| assignedTrailerId | ID? | null until assigned |
| plannedDate | Date | |
| estimatedStartTime | String? | |
| estimatedEndTime | String? | |
| actualStartTime | DateTime? | from Event |
| actualEndTime | DateTime? | from Event |
| publishedToDriver | Boolean | false = planner still building, true = driver can see it |
| plannerNotes | String? | |
| endInstruction | Enum? | `none`, `drop_trailer_at_base`, `stay_with_trailer` — set by planner before publishing |
| endInstructionNote | String? | e.g. "Bay 3" or "deliver Leeds 08:00 tomorrow" |
| returnToBase | Boolean | default false — whether driver should return to base after last delivery |
| returnToBaseNote | String? | e.g. "Return to Manchester depot" �� no address needed, driver knows |
| returningAt | DateTime? | when driver confirmed heading back — from Event |
| arrivedBaseAt | DateTime? | when driver confirmed arrived at base — from Event |
| requiredTrailerType | String? | derived from all stops on this run |
| requiredEquipment | String[] | derived from all stops — e.g. `tail_lift`, `crane` |
| maxLoadWeight | Decimal? | sum of stop weights for this run |
| hasHazardous | Boolean | true if any stop on this run has hazardous=true |
| hasTemperatureLoad | Boolean | true if any stop on this run has temperatureControlled=true |
| hasOversized | Boolean | true if any stop on this run has oversized=true |
| trailerCompatible | Boolean | does assignedTrailerId satisfy requiredTrailerType? updated at publish |
| vehicleCompatible | Boolean | does assignedTruckId satisfy finalVehicleType? updated at publish |
| compatibilityOverridden | Boolean | default false — planner overrode a compatibility block |
| compatibilityOverrideReason | String? | required if compatibilityOverridden=true |
| createdBy | ID | |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### Run status

| Status | Meaning |
|---|---|
| `draft` | planner is building it, no driver yet |
| `assigned` | driver and vehicle assigned, not started |
| `published` | sent to driver, awaiting start |
| `in_progress` | driver started |
| `returning_to_base` | all deliveries done, driver heading back empty |
| `completed` | driver confirmed arrived base — run fully closed |
| `failed` | run could not complete |
| `cancelled` | cancelled before starting |

**Important:** A Run does NOT close when a shift ends. A Run closes only when all its RunAssignments are done AND driver has confirmed return to base (if returnToBase=true). A run can span two shifts and two days — this is normal and correct.

### One Run, many Jobs example

```
Run 1 — Driver Dave — Truck AB12 CDE — Trailer 44
  ├── Collect 26 pallets London    (from Job A — customer ACME)
  ├── Collect 12 boxes Sheffield   (from Job B — customer BEXLEY)
  ├── Deliver 26 pallets Leeds     (from Job A)
  └── Deliver 12 boxes Leeds       (from Job B)
```

Both Job A and Job B are served by the same run. The planner combined them because the route makes sense. Each job's progress is tracked independently through their own JobParts and LoadTrack entries.

---

## 4. RunAssignment

The bridge between a JobPart and a Run. This is where partial quantities live.

| Field | Type | Notes |
|---|---|---|
| id | ID | auto |
| companyId | ID | tenant isolation |
| runId | ID | which Run |
| jobPartId | ID | which JobPart |
| jobId | ID | denormalised from JobPart for fast queries |
| sequenceNumber | Int | order of this stop within the run (1, 2, 3...) |
| quantityAssigned | Decimal | how much of this part's quantity this run is responsible for |
| quantityUnit | String | must match JobPart unit |
| status | Enum | `pending`, `in_progress`, `completed`, `failed`, `skipped` |
| addedAt | DateTime | when planner added this part to the run |
| addedBy | ID | planner who added it |
| removedAt | DateTime? | if removed from run |
| removedBy | ID? | |
| removalReason | String? | |
| notes | String? | |

### Partial quantity through RunAssignment

JobPart requires 52 pallets (quantityRequired=52).

| RunAssignment | runId | quantityAssigned | Meaning |
|---|---|---|---|
| Assignment A | Run 1 | 26 | Dave collects 26 |
| Assignment B | Run 2 | 26 | Sarah collects 26 |

Rule: SUM(quantityAssigned across all RunAssignments for a JobPart) should equal JobPart.quantityRequired.
If the sum is less, system warns: **unassigned quantity**.
If the sum is more, system blocks: **over-assignment**.

### Load possession check

Before a deliver RunAssignment is valid, system checks:
- Is there a corresponding collect RunAssignment on the SAME run?
- OR: is the load confirmed at depot and a reload is planned on this run?
- OR: is there a confirmed transfer event linking this run to the load?

If none of these are true, system warns: **load not available for this delivery.**

---

## 5. LoadTrack

The ledger. Every time load changes physical custody, one record is written.
Immutable — never updated, only appended.

| Field | Type | Notes |
|---|---|---|
| id | ID | auto |
| companyId | ID | tenant isolation |
| jobId | ID | |
| jobPartId | ID | which JobPart this quantity belongs to |
| runId | ID? | which run this happened in |
| runAssignmentId | ID? | |
| eventId | ID | the Event that triggered this — required |
| transactionType | Enum | see below |
| quantity | Decimal | how much moved |
| unit | String | |
| fromCustody | String | where it came FROM — see custody format |
| toCustody | String | where it went TO — see custody format |
| driverId | ID? | |
| trailerId | ID? | |
| timestamp | DateTime | clientTimestamp from driver event |
| serverReceivedAt | DateTime | |
| gpsLat | Decimal? | |
| gpsLng | Decimal? | |
| notes | String? | |

### Transaction types

| Type | Meaning |
|---|---|
| `collected` | load picked up from source site — goes onto trailer |
| `depot_received` | load dropped at depot/yard |
| `reloaded` | load reloaded from depot onto a trailer |
| `transferred` | load moved from one trailer to another |
| `delivered` | load delivered to destination — leaves system |
| `failed_delivery` | delivery attempted but refused/impossible |
| `returned` | load returned to source after failed delivery |
| `partially_collected` | partial quantity collected, remainder stays at site |

### Custody format

Custody is a string describing where the load physically is:

| Custody value | Meaning |
|---|---|
| `site:{jobPartId}` | still at the source site (uncollected) |
| `trailer:{trailerId}` | on a specific trailer |
| `depot:{branchId}` | at a depot/yard waiting for onward movement |
| `delivered:{jobPartId}` | delivered to destination |
| `failed:{jobPartId}` | failed — location uncertain, attention needed |

### The ledger must always balance

For any JobPart:
```
SUM(quantity where toCustody=delivered) 
+ SUM(quantity where toCustody like trailer:%) 
+ SUM(quantity where toCustody like depot:%) 
+ SUM(quantity where toCustody like site:%)
= JobPart.quantityRequired
```

If it does not balance → automatic warning. Do not block, but flag immediately.

### Load possession check using LoadTrack

To check if Driver Dave (Run 1, Trailer 44) has the load available to deliver:

```
Find most recent LoadTrack entry for jobPartId
where toCustody = 'trailer:44'
AND no later entry moving it away from trailer:44
→ load is on Trailer 44 ✓
```

If load is on Trailer 99 (Sarah's trailer) and Dave is assigned to deliver it:
→ WARN: load is on Trailer 99, not on Trailer 44. Transfer required before delivery.

---

## 6. Event

Immutable record of what actually happened. Everything else is derived from events.

| Field | Type | Notes |
|---|---|---|
| id | ID | auto |
| companyId | ID | tenant isolation |
| clientEventId | String | UUID generated on device — idempotency key |
| eventType | Enum | see below |
| jobId | ID? | |
| jobPartId | ID? | |
| runId | ID? | |
| runAssignmentId | ID? | |
| driverId | ID? | |
| trailerId | ID? | |
| quantityConfirmed | Decimal? | what driver actually confirmed |
| unit | String? | |
| fromCustody | String? | for transfer/swap events |
| toCustody | String? | for transfer/swap events |
| clientTimestamp | DateTime | device time — use for operational truth |
| serverReceivedAt | DateTime | when server received it |
| gpsLat | Decimal? | |
| gpsLng | Decimal? | |
| note | String? | driver note if any |
| needsReview | Boolean | true if late or conflicting |
| reviewedAt | DateTime? | |
| reviewedBy | ID? | |

### Event types

**Run lifecycle:**
| Type | Meaning |
|---|---|
| `run_started` | driver started the run |
| `run_completed` | driver finished all assignments in run |
| `run_failed` | driver could not complete run |

**Collection events:**
| Type | Meaning |
|---|---|
| `arrived_collection` | driver arrived at collection site |
| `loading_started` | driver began loading |
| `collected` | driver confirmed quantity loaded and left site |
| `partially_collected` | driver collected less than assigned — quantity confirmed |
| `collection_failed` | could not collect — load not available, refused, etc. |

**Delivery events:**
| Type | Meaning |
|---|---|
| `arrived_delivery` | driver arrived at delivery site |
| `delivered` | driver confirmed delivery — quantity and POD if required |
| `partially_delivered` | driver delivered less than assigned |
| `delivery_failed` | delivery refused, no one available, access denied, etc. |

**Movement events:**
| Type | Meaning |
|---|---|
| `arrived_depot` | driver arrived at depot/yard |
| `depot_unloaded` | load dropped at depot |
| `depot_loaded` | load picked up from depot |
| `trailer_swapped` | driver changed to a different trailer |
| `truck_swapped` | driver changed to a different truck |
| `load_transferred` | load moved from one trailer/driver to another |
| `handover` | formal handover between two drivers at a relay point |

**Return to base events:**
| Type | Meaning |
|---|---|
| `returning_to_base` | driver confirmed leaving last site, heading back empty |
| `arrived_base` | driver confirmed back at base — run closes |
| `trailer_dropped_at_base` | driver dropped loaded trailer at base before going home |
| `staying_with_trailer_overnight` | driver confirmed keeping trailer overnight, will continue tomorrow |
| `trailer_collected_from_standing` | driver (same or different) picked up a standing loaded trailer to continue |

**Planner/system events:**
| Type | Meaning |
|---|---|
| `driver_assigned` | planner assigned driver to run |
| `driver_reassigned` | planner moved a run assignment to a different driver |
| `run_published` | planner published run to driver |
| `status_override` | planner manually overrode a status with reason |
| `note_added` | note added by planner or driver |

---

## Vehicle and trailer compatibility

### Three sources — different enforcement levels

| Source | Set by | Enforcement |
|---|---|---|
| `customer_specified` | Customer on the public form or job creator on internal form | **BLOCK** — cannot publish run with incompatible equipment |
| `system_derived` | System calculates from stop load specs (temperature, hazard, oversized) | **WARN** — planner sees warning, can override with reason |
| `planner_set` | Planner overrides both customer and system value | **BLOCK** — same as customer_specified once planner locks it |
| `not_specified` | Nobody set anything — no load spec data either | No check performed |

### How the final requirement is determined

```
1. Customer fills form → customerTrailerTypes / customerVehicleType set
   vehicleRequirementSource = customer_specified
   trailerRequirementSource = customer_specified

2. Planner adds stop-level load specs (or system auto-derives from goods type):
   → system calculates derivedTrailerTypes (e.g. temperature-controlled if any stop has temperatureControlled=true)
   → system calculates derivedVehicleType (e.g. class_1 if any stop has oversized=true)

3. If customer_specified and derived conflict → WARN planner:
   "Customer asked for curtainsider but load includes temperature-controlled goods"

4. Planner reviews and sets finalTrailerTypes / finalVehicleType
   (can keep customer value, take system value, or set a third value — must record reason if overriding a block)

5. At run publish time, system checks:
   assignedTrailerId.type ∈ finalTrailerTypes  → trailerCompatible = true/false
   assignedTruckId.class  = finalVehicleType   → vehicleCompatible = true/false
```

### Compatibility check at publish

When planner tries to publish a run:

```
If trailerCompatible = false AND trailerRequirementSource = customer_specified:
  → BLOCK: "Trailer {X} is not compatible. Customer specified {types}. Assign a compatible trailer or override."

If trailerCompatible = false AND trailerRequirementSource = system_derived:
  → WARN: "Trailer {X} may not be suitable. Load on this run requires {types}."
  → Planner can acknowledge and publish anyway (records compatibilityOverridden + reason)

If vehicleCompatible = false AND vehicleRequirementSource = customer_specified:
  → BLOCK: same pattern as trailer

If vehicleCompatible = false AND vehicleRequirementSource = system_derived:
  → WARN: same pattern as trailer
```

### Derived run requirements — how they are calculated

When any RunAssignment is added to or removed from a Run, the system recalculates:

```
requiredTrailerType = highest-spec trailer type needed across all stops
  temperature-controlled > insulated > curtainsider > flatbed > standard

requiredEquipment = union of all handlingMethods across all stops

maxLoadWeight = SUM(stopWeight) for all assigned stops

hasHazardous = ANY stop where hazardous = true

hasTemperatureLoad = ANY stop where temperatureControlled = true

hasOversized = ANY stop where oversized = true
```

These derived fields are for the planner's information AND the compatibility check.
They do not enforce anything on their own — the check happens at publish time.

---

## Special cases — handled correctly from the start

### Partial collection

Driver arrives at London to collect 26 pallets. Only 20 are ready.

1. Driver fires `partially_collected` event: quantityConfirmed=20
2. LoadTrack entry: `collected`, quantity=20, fromCustody=`site:{partId}`, toCustody=`trailer:44`
3. RunAssignment status → `partially_done`
4. JobPart: quantityCollected=20, quantityRequired=26 → 6 remaining
5. Job status → `partially_collected`
6. Warning: **6 pallets remain at London site — unresolved**
7. Planner sees warning and decides: send another run, or accept shortfall

### Collected but not yet delivered

Driver Dave has collected 52 pallets. They are on Trailer 44.
No delivery is assigned yet in the run.

LoadTrack shows: toCustody=`trailer:44` for 52 pallets.
No `delivered` entry exists.

Warning: **52 pallets on Trailer 44 have no delivery planned.**

### Trailer currently loaded

Query: what is currently on Trailer 44?

```
Find all LoadTrack entries for Trailer 44
where toCustody = 'trailer:44'
Subtract all entries where fromCustody = 'trailer:44'
= current load on Trailer 44
```

System can always answer: is this trailer empty or loaded?
Cannot assign trailer to a new run if it is still loaded with someone else's job.

### Handover / driver swap at relay point

Scenario: Dave drives from London to Birmingham depot. Sarah takes the load onwards to Dundee.

Events:
1. Dave fires `arrived_depot` at Birmingham depot
2. Dave fires `depot_unloaded`: quantity=52, fromCustody=`trailer:44`, toCustody=`depot:{branchId}`
3. System warns Sarah's run: load now available at depot
4. Sarah fires `depot_loaded`: quantity=52, fromCustody=`depot:{branchId}`, toCustody=`trailer:99`
5. Sarah fires `run_started` and continues to Dundee

LoadTrack is continuous. Custody chain is complete. No gaps.

### Overnight load — Version A (same driver continues tomorrow)

Dave collects, drives to base, parks Trailer 44, goes home.
Tomorrow Dave continues the same run.

```
Day 1:
  Dave: collected → LoadTrack: site → trailer:44
  Dave ends shift
  Dave taps: "Staying with trailer tonight"
  Event: staying_with_trailer_overnight
    driverId: Dave, trailerId: 44, runId: Run1

  FleetTrailer 44:
    loadStatus: loaded_with_driver
    standingNote: "52 pallets Job LGB-26-000042 — Dave continuing tomorrow"
    standingRunId: Run1

  Run 1 status: in_progress  ← stays open, does NOT close

Day 2:
  Dave starts new shift
  System shows: "Continue Run 1 — deliver Leeds — load on Trailer 44"
  Dave taps: morning checks → hooks up Trailer 44 → continues
  Event: trailer_collected_from_standing (same driver re-confirming)
  → delivers → run completes normally
```

### Overnight load — Version B (different driver takes over)

Dave collects, drives to base, drops Trailer 44, goes home.
Tomorrow Sarah picks up Trailer 44 and delivers.

```
Day 1:
  Dave: collected → LoadTrack: site → trailer:44
  Dave ends shift
  Dave taps: "Dropping trailer at base"
  Optional bay: "Bay 3"
  Event: trailer_dropped_at_base
    driverId: Dave, trailerId: 44, bayNote: "Bay 3"
  LoadTrack: trailer:44 → depot:base (standing)

  FleetTrailer 44:
    loadStatus: loaded_standing
    standingNote: "52 pallets Job LGB-26-000042 — Bay 3 — needs delivery Leeds"
    standingRunId: Run1

  Planner sees:
    ⚠ Trailer 44 — loaded standing — Bay 3
    Job LGB-26-000042 — deliver Leeds — assign new run or reassign Dave

Day 2:
  Planner creates Run 2 for Sarah
  Instruction: "Pick up Trailer 44 from Bay 3 — deliver Leeds"
  Planner links the deliver-Leeds JobPart to Run 2 via new RunAssignment

  Sarah morning check-in:
    System shows: "Standing load — Trailer 44 — Bay 3 — 52 pallets"
    Sarah taps: [ Confirm trailer hooked up ]
    Event: trailer_collected_from_standing
      driverId: Sarah, trailerId: 44, fromRunId: Run1, runId: Run2
    LoadTrack: depot:base → trailer:44 (continuing)
    → delivers → Run 2 completes
    → Job checks: all parts done? Yes → Job completed
```

### Shift-end prompt when trailer is loaded

When driver tries to end their shift and a loaded trailer is still attached,
system shows a prompt before allowing shift end. Driver cannot skip this.

```
┌─────────────────────────────────────────────────────┐
│ You have a loaded trailer                           │
│ Trailer 44 — 52 pallets — Job LGB-26-000042         │
│                                                     │
│ [Planner instruction if set]:                       │
│ "Drop at Bay 3"                                     │
│                                                     │
│ What are you doing with the trailer?                │
│                                                     │
│ [ Drop trailer at base ]  ← records location + bay │
│ [ Stay with trailer ]     ← run stays open          │
└─────────────────────────────────────────────────────┘
```

Neither option closes the Job or the JobPart. The load is still in transit.
Only delivery confirmation closes the JobPart.

### Return to base — the empty last leg

After the last delivery the driver has no more customer work.
The run has a simple closing leg back to base.
This is not a JobPart — it is a run-level operation only.

```
Run 1
  ├── Collect London       ← JobPart (customer work)
  ├── Deliver Leeds        ← JobPart (customer work)
  └── Return to base       ← Run closing leg (no address, no customer)
        note: "Return to Manchester depot"
        driver taps: [ Heading back ]  → Event: returning_to_base
        driver taps: [ Arrived ]       → Event: arrived_base
```

When arrived_base fires:
- Run status → `completed`
- Driver currentStatus → `available`
- FleetTrailer loadStatus → `empty` (if trailer was dropped)
- Planner board updates: Dave available from 16:05

No address entry needed. Driver knows where base is.
If the yard is large, planner can add bay note: "Park in bay 3".

### Trailer history — always known

Every Event and LoadTrack entry records trailerId + driverId + timestamp + GPS.
The system can always answer:

```
Trailer 44 — history
  Last used by:   Dave
  Last event:     Dropped at base — Bay 3
  When:           Yesterday 18:42
  Job:            LGB-26-000042 (52 pallets Leeds)
  Current status: Loaded standing — Bay 3
```

No extra fields needed. Comes from the most recent LoadTrack/Event query for that trailer.

### FleetTrailer — fields needed for standing load tracking

Three new fields on `FleetTrailer`:

| Field | Type | Notes |
|---|---|---|
| `loadStatus` | Enum | `empty`, `loaded_standing`, `loaded_with_driver` |
| `standingNote` | String? | "52 pallets, Job LGB-26-000042, Bay 3" |
| `standingRunId` | ID? | FK Run — which run left this load here |

These are updated by Events — never set manually by planner.

### Driver status — always known

`DriverProfile` gets a derived status from the most recent Event:

| Status | Meaning | Set by |
|---|---|---|
| `off_shift` | not on shift | shift end confirmed |
| `available` | on shift, no active run | arrived_base or shift started |
| `on_run_loaded` | on run with load on trailer | collected event |
| `on_run_empty` | on run, no load | run started before collection |
| `empty_returning` | deliveries done, heading back empty | returning_to_base event |

These are derived — never set manually. Always computed from the latest Event for that driver.

### Empty return opportunity — data foundation (intelligence in Phase 2)

When a driver fires `returning_to_base`, the system records:
- driver is empty
- last known location (GPS from event)
- direction: last delivery location → base
- estimated available hours remaining

This is enough for Phase 2 to query:
```
Find unassigned JobParts (type=collect)
whose location is between driver's current position and base
within driver's remaining available hours
matching driver's vehicle/trailer type
→ flag on planner board as opportunity
```

Phase 1 just captures the data correctly.
Phase 2 reads it and surfaces the suggestion.
The planner always makes the final call.

```
Planner board — Phase 2 view:
  🟡 Dave — empty returning — Leeds → Manchester
     Passing Sheffield
     Unassigned collection nearby: Job LGB-26-000051 — 18 pallets — Sheffield — by 16:00
     [ View ]  [ Assign to Dave ]
```

---

## What this replaces in the current system

| Current | New | Action |
|---|---|---|
| `PlannedJob` | `Job` | rename + remove driver/vehicle fields (those move to Run) |
| `JobStop` | `JobPart` | expand with quantity fields + custody logic |
| none | `Run` | new — replaces the driver/vehicle fields stripped from PlannedJob |
| none | `RunAssignment` | new — the bridge, holds sequence and partial quantity |
| none | `LoadTrack` | new — the ledger |
| `JobExecutionEvent` | `Event` | expand event types, add custody fields |

Migration rule: every existing `PlannedJob` becomes one `Job` + one `Run` + `RunAssignment` entries linking its `JobStop` records. No data loss. Existing operations continue uninterrupted.

---

## What must NOT be built yet

These belong to Phase 2 or later:
- Warning engine (reads LoadTrack + RunAssignments to generate warnings)
- Recovery suggestions (Phase 3)
- Branch cooperation across companies (Phase 3)
- Marketplace objects (Phase 4)
- AI suggestions (Phase 4)

Phase 1 is: correct data model + basic API + Run Planner UI.
Get this right. Everything else builds on top.
