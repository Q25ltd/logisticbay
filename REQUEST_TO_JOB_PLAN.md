# Request → Job — architecture plan

> Nothing is built until this plan is agreed.

---

## The rule

**Job = everything PRF collects.**
**CJP = same as PRF + planner notes + planned date. Those are the only additions.**

No financials. No pricing. Not now.

---

## The two paths

```
PRF form  →  Job (status: pending_review)  →  Accept (planned date + planner notes)  →  Job (status: ready_to_plan)
CJP form  →  Job (status: draft / ready_to_plan)
```

No staging table. No blob promotion. No dual write path.
PRF writes directly to Job + JobPart using the exact same columns as CJP.
Accept only changes status + sets two fields.

---

## Accept step — two fields only

1. **Planned date** — required
2. **Planner notes** — optional

That is all the accept step does.

---

## Job requirements vs resource matching

**Job form describes what the job NEEDS.**
**System checks what each resource HAS when assigning.**

You never ask the same question twice.

| Job says | At assignment system checks |
|----------|-----------------------------|
| Vehicle category + body type | FleetUnit.bodyCategory + bodyType |
| Minimum GVW | FleetUnit.gvwClass |
| Equipment needed (tail lift, HIAB etc.) | FleetUnit.onboardEquipment |
| Trailer types allowed | FleetTrailer.bodyType |
| ADR class (from load details) | Driver.adrCertificates |
| Vehicle type implies licence | Driver.licenceClass |

Driver licence is never asked on the job form. Vehicle type implies it. System checks at assignment.

---

## Vocabulary — already solved

`vehicleTaxonomy.ts` is the single source of truth. Already used by:

| File | Uses taxonomy |
|------|---------------|
| CJP form | ✅ |
| PRF form | ✅ |
| Fleet unit registration | ✅ |
| Fleet trailer registration | ✅ |
| Driver registration | ✅ |
| Assignment drawer | ✅ |

All forms, all fleet records, all driver records use the same constants.
Same value in the job = same value in the fleet = matching works automatically.

Two legacy alias fields exist (`FleetUnit.vehicleClass`, `FleetTrailer.trailerType`) — they mirror the canonical fields, cause no mismatch, can be cleaned when we touch those models.

---

## Database redesign — what changes

### 1. Remove `JobRequest` staging table

PRF writes directly to `Job` + `JobPart`.
Job starts with `status: pending_review`.
Accept flips status + sets planned date + planner notes.
`JobRequest` table and route deleted.

### 2. Rename `PlannedJob` → `Job`

Simpler. Clearer. Matches how we talk about it.

### 3. Merge `LoadDetails` into `Job`

Always 1:1. Separate table adds joins for no benefit.
All load fields move into `Job`.

### 4. Clean vehicle requirement fields — 15 → 5

**Remove:**
`minVehicleSize`, `equipmentRequired`, `trailerTypesForbidden`,
`vehicleRequirementSource`, `customerVehicleType`, `derivedVehicleType`, `finalVehicleType`,
`customerTrailerTypes`, `derivedTrailerTypes`, `finalTrailerTypes`,
`reqLicenceClass`, `driverQualificationsReq`

**Keep (rename to clean names):**
```
vehicleCategory     (was reqBodyCategory)
bodyType            (was reqBodyType)
minGvwClass         (was reqGvwMin)
equipment           (was reqEquipment)
trailersAllowed     (was trailerTypesAllowed)
vehicleAccessNotes  (unchanged)
```

### 5. Flatten JSON blobs into columns

| Blob | Fields to flatten |
|------|------------------|
| `notesData` | driverNoteChips[], driverVisibleNotes, safetyInstructions |
| `billingData` | declaredGoodsValue, billingReference (vatRegistered/vatNumber stay in blob for now) |
| `exceptionPolicyData` | approvalContactName, approvalContactPhone (rejectionAction already has a column) |
| `loadData` | keep as blob — goods-type sub-details only, too specific |

### 6. Add `parentJobId` for job splitting

Nullable self-relation on `Job`.
Design and build separately when ready.

---

## What `Job` holds after redesign

```
Job
├── identity        id, companyId, jobReference, status, priority
│                   createdByUserId, templateId
├── scheduling      plannedDate, serviceType, jobType, canSplitShipment
├── customer        customerId, customerName, customerRef
│                   purchaseOrderNumber, billingReference, declaredGoodsValue
│                   bookingContactName, bookingContactPhone, bookingContactEmail
│                   custRefRequired, poRequired
├── planner         plannerNotes, internalNotes
│                   driverNoteChips[], driverVisibleNotes, safetyInstructions
├── load            goodsType, goodsDescription, quantity, quantityUnit, weight
│                   volume, dimensions, fragile, stackable
│                   tempControlled, tempRange
│                   hazardClass, photosRequired, weighbridgeRequired
│                   securingRequirements[], specialRequirements[]
│                   loadData (blob — goods sub-type detail only)
├── vehicle         vehicleCategory, bodyType, minGvwClass
│                   equipment[], trailersAllowed[], vehicleAccessNotes
├── exception       failureAction, assistancePhone, assistanceNote
│                   approvalContactName, approvalContactPhone
│                   alternativeReturnAddress, alternativeReturnPostcode
│                   alternativeReturnContactName, alternativeReturnContactPhone
├── splitting       parentJobId (nullable)
└── timestamps      createdAt, updatedAt, closedAt

JobPart (one per stop — clean, no changes needed)
├── sequence, type
├── address         siteName, street, town, postcode, country, lat, lng
├── timing          timeWindowStart, timeWindowEnd, bookedTime, unloadingAllowanceMinutes
├── quantity        quantityRequired, quantityUnit
├── handling        handlingMethods[]
├── access          accessRequirements[], heightRestriction, weightRestriction, lengthRestriction
├── proof           proofRequirements[]
├── contact         contactName, contactPhone, contactEmail
├── booking         bookingRequired, bookingRef, openingHours
├── planner extras  locationType, instructions, internalNotes, navigationInstructions
└── notes           stopNotes, loadReadiness
```

---

## Status flow

```
pending_review  ← PRF submitted, awaiting planner accept
draft           ← CJP saved as draft
ready_to_plan   ← accepted (PRF) or saved ready (CJP)
in_planning     ← planner working on it
planned         ← run created, driver assigned
in_progress     ← driver started
completed       ← all stops done
cancelled
```

---

## Build order

| Step | What | Why first |
|------|------|-----------|
| 1 | Redesign `Job` table in schema | Everything else depends on clean data model |
| 2 | Migration — careful, backfill 17 rows | Must not lose existing data |
| 3 | Update CJP to write to new Job structure | CJP is the simpler path, no staging |
| 4 | Remove `JobRequest` — PRF writes directly to Job | Eliminates dual path |
| 5 | Accept step UI — planned date + planner notes form | Completes PRF path |
| 6 | Job detail page `/app/jobs/:id` | Planning, editing, driver assignment |
| 7 | Job splitting — `parentJobId` | After detail page exists |

---

## What is already done

- ✅ SharedStopCard — both forms identical stop fields
- ✅ All stop fields reach correct `JobPart` columns — canonical names
- ✅ CJP writes all fields correctly
- ✅ Vocabulary — `vehicleTaxonomy.ts` used by all forms and fleet records
- ⚠️ PRF still goes through `JobRequest` staging — removed in Step 4
- ❌ `Job` table redesign — Step 1
- ❌ Accept step UI — Step 5
- ❌ Job detail page — Step 6
