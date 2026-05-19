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

- ✅ `Job` table redesign — `PlannedJob` renamed to `Job`, `LoadDetails` merged in, vehicle fields reduced from 15 to 5, blob columns added then mostly flattened
- ✅ `JobRequest` staging table removed — PRF writes directly to `Job` with `status: pending_review`
- ✅ Accept endpoint exists — `POST /job-requests/:id/accept` flips status + sets plannedDate + plannerNotes
- ✅ SharedStopCard — both forms share the stop card
- ✅ Stop-level field names are canonical — `siteName`, `street`, `town`, `lat`, `lng`, `navigationInstructions`, `bookingRef`, `bookedTime` etc. Stop-level aliases from the old NAMING_AUDIT are gone (0 hits).
- ✅ Vocabulary — `vehicleTaxonomy.ts` used by all forms and fleet records
- ❌ **Job-level field names diverge between PRF and CJP** — the two forms collect the same data under different names. Active problem. See next section.
- ❌ Accept step UI — endpoint exists, UI for it not yet built
- ❌ Job detail page `/app/jobs/:id` — still using the pre-migration `JobDetailPage.tsx`

---

## What is wrong with what is already done — read this before continuing

The schema redesign happened. The forms and routes did not finish following through. Six concrete problems remain. Fix all six before adding any new feature.

### 1. Same concept, different name in each form

The DB column is the canonical name. Both forms must use it. Today:

| Job column (canonical) | PRF sends | CJP sends |
|---|---|---|
| `goodsDescription` | `loadData.goodsDescription` | `loadDetails.materialType` (form state `materialDesc`) |
| `weight` | `loadData.estimatedWeight` | `loadDetails.weight` (form state `totalWeight`) |
| `quantity` | `loadData.quantity` | `loadDetails.quantity` (form state `totalQty`) |
| `quantityUnit` | `loadData.unit` | `loadDetails.unit` (form state `qtyUnit`) |
| `hazardClass` | `specialRequirementsData.adrClass` | `loadDetails.hazardClass` (form state `adrClass`) |
| `bookingContactName` | `requesterData.contactName` | form state `contactName` (renamed at submit) |
| `bookingContactPhone` | `requesterData.contactPhone` | form state `contactPhone` |
| `bookingContactEmail` | `requesterData.contactEmail` | form state `contactEmail` |
| `customerName` | `requesterData.customerCompanyName` | `customerName` |
| `vehicleCategory` | `transportRequirementsData.reqBodyCategory` | `reqBodyCategory` |
| `bodyType` | `transportRequirementsData.reqBodyTypes[0]` | `reqBodyType` |
| `equipment` | `transportRequirementsData.reqEquipment` | `reqEquipment` |
| `trailersAllowed` | `transportRequirementsData.trailerTypesAllowed` | `trailerTypesAllowed` |
| `failureAction` | `exceptionPolicyData.rejectionAction` | `failureAction` |
| `tempControlled` | derived from string truthiness of `loadData.temperatureRange` | explicit boolean |
| `fragile` | derived from `specialRequirementsData.items.includes("fragile")` | explicit boolean |

### 2. PRF ships seven JSON blobs for data that should be flat

`requesterData`, `loadData`, `specialRequirementsData`, `transportRequirementsData`, `billingData`, `notesData`, `exceptionPolicyData`. The schema is already flat (after the Job redesign). The blobs add a translation layer that hides drift, breaks Zod validation, and makes the two forms structurally incomparable.

### 3. Silent data loss

- `reqBodyTypes[]` in PRF is a multi-select array but the route does `bodyType = reqBodyTypes[0] ?? ""` (`api/src/routes/jobRequests.ts:195`). Every body type after the first is discarded.
- CJP still sends `assignedDriverId`, `assignedTruck`, `assignedTrailer` to `POST /jobs`. Those columns no longer exist on `Job` (they belong on `Run`). Prisma drops them silently.
- `tempControlled` derived from `!!(loadData.temperatureRange || loadData.chilledFrozenAmbient)` can flip to `true` if a customer types a temperature and then deletes it back to `""` — depending on form state shape — and to `false` even when the customer intends temp-controlled but hasn't filled a range yet.

### 4. Database pollution

The redesign was correct but the cleanup is unfinished.

- `Job.billingData Json?` blob coexists with `billingReference`, `declaredGoodsValue`, `billingNotes` columns. Drop the blob.
- `Job.loadData Json?` blob coexists with all the flat load columns. Drop the blob.
- `JobPart.numPallets Int?` (legacy) coexists with `quantityRequired Decimal?` (new).
- `JobPart.earliestArrivalMinutes Int?` (legacy) coexists with `timeWindowStart DateTime?` (new).
- Most `String @default("")` fields on `Job`, `JobPart`, `SavedLocation`, `JobTemplate` should be `String?` per the nullable-field rule in `CLAUDE.md`. Only `Customer` has been migrated.

### 5. Route validation is bypassed

`api/src/schemas/jobs.ts` defines Zod schemas. `api/src/routes/jobs.ts` does not import them. The route uses `body as CreateJobBody` (type assertion, no runtime check) plus the hand-rolled `validateCreateJob` in `api/src/validation.ts`. Bad payloads reach Prisma, not Zod.

### 6. Legacy fallbacks are permanent

Routes contain chains like:

```
body.vehicleCategory ?? body.reqBodyCategory ?? legacyVehicleToRequirement(body.vehicleClass)
body.trailersAllowed ?? body.trailerTypesAllowed ?? []
body.equipment ?? body.reqEquipment ?? []
```

As long as both names are accepted, both names keep being used. There is no forcing function to migrate. The fallbacks must come out.

---

## The naming rule — final

One concept. One name. The `Job` and `JobPart` column names are the source of truth.

- A form's wire payload uses the DB column name. No aliases.
- A form's internal React state uses the DB column name. No aliases.
- A Zod schema declares the DB column name. No optional aliases.
- A route reads only the DB column name. No `??` chains, no legacy fallbacks.
- If you find a concept that does not have a column, do not invent a name — check `DATA_DICTIONARY.md`. If it is not there, add it to the dictionary first, then to the schema, then to the form. Never the other way round.

`DATA_DICTIONARY.md` is the law. The Prisma schema reflects the dictionary. Code mirrors the schema.

---

## Field contract — Job creation

Every payload sent to `POST /jobs` (CJP) or `POST /public/request/:token` (PRF) is a flat object using exactly these field names. Anything else is rejected with `400`. Types match the Prisma schema.

### Identity & customer
`customerId` (int | null), `customerName` (string, required), `customerRef` (string | null), `purchaseOrderNumber` (string | null), `jobTitle` (string | null), `priority` (`"low" | "normal" | "high" | "urgent"`), `serviceType` (string | null), `jobType` (string | null), `canSplitShipment` (string)

### Booking contact
`bookingContactName` (string | null), `bookingContactPhone` (string | null), `bookingContactEmail` (string | null)

### Billing
`billingReference` (string | null), `declaredGoodsValue` (string | null), `billingNotes` (string | null), `custRefRequired` (boolean), `poRequired` (boolean)

### Load
`goodsType` (string | null), `goodsDescription` (string | null), `quantity` (number | null), `quantityUnit` (string | null), `weight` (number | null), `volume` (number | null), `dimensions` (string | null), `fragile` (boolean), `stackable` (boolean), `tempControlled` (boolean), `tempRange` (string | null), `hazardClass` (string | null), `photosRequired` (boolean), `weighbridgeRequired` (boolean), `securingRequirements` (string[]), `specialRequirements` (string[])

### Vehicle requirements
`vehicleCategory` (string | null), `bodyType` (string | null), `minGvwClass` (string | null), `equipment` (string[]), `trailersAllowed` (string[]), `vehicleAccessNotes` (string | null)

### Exception policy
`failureAction` (string), `assistancePhone` (string | null), `assistanceNote` (string | null), `approvalContactName` (string | null), `approvalContactPhone` (string | null), `alternativeReturnAddress` (string | null), `alternativeReturnPostcode` (string | null), `alternativeReturnContactName` (string | null), `alternativeReturnContactPhone` (string | null)

### Proof
`requirePOD` (boolean)

### Driver-visible notes
`driverNoteChips` (string[]), `driverVisibleNotes` (string | null), `safetyInstructions` (string | null)

### Stops
`stops` (`JobPart[]` — uses `JobPart` column names, already canonical via SharedStopCard)

### Planner-only fields — CJP path only

PRF must not send these. CJP may send these:
`plannedDate` (date string), `plannerNotes` (string | null), `internalNotes` (string | null), `saveMode` (`"draft" | "ready_to_plan"`)

### What each path sets server-side, not from the form

- PRF route sets `status = "pending_review"`, `createdByUserId` = active planner of the company.
- CJP route sets `status` from `saveMode` (`"draft"` or `"ready_to_plan"`), `createdByUserId` = authenticated user.
- Both routes generate `jobReference` atomically via `generateJobReference()`.

That is the entire contract. There are no other accepted fields.

---

## Forbidden patterns

These break data integrity. Do not introduce. Do not perpetuate.

1. **No internal aliases.** Form state name = wire name = column name. If `goodsDescription` is the column, the React state variable is also `goodsDescription`. No `materialDesc`, no `totalQty`, no `qtyUnit`, no `adrClass`, no `reqBodyCategory`, no `trailerTypesAllowed` (the column is `trailersAllowed`).
2. **No JSON blobs for flat data.** Delete the PRF blobs (`requesterData`, `loadData`, `specialRequirementsData`, `transportRequirementsData`, `billingData`, `notesData`, `exceptionPolicyData`) from both the form and the route. Ship the columns flat.
3. **No legacy fallback chains in routes.** Once a name is removed, the old name returns `400` with a clear message — e.g. `"reqBodyCategory is not accepted — use vehicleCategory"`. No silent acceptance, no `??` chains.
4. **No multi-select shipped to a scalar column.** If the form is multi-select, the column must be `Json` array. If the column is scalar, the form is single-select. PRF's `reqBodyTypes[]` to scalar `bodyType` is the bug.
5. **No derived booleans from strings.** `tempControlled` is a real checkbox. `fragile` is a real checkbox. Do not fish booleans out of multi-select arrays or string truthiness.
6. **No writes to fields that no longer exist on the model.** `assignedDriverId`, `assignedTruck`, `assignedTrailer`, `vehicleClass`, `vehicleClassRequired`, `reqLicenceClass` are not Job fields. CJP must stop sending them. Driver and vehicle assignment go through `POST /runs/:id/assignments` on the Run model.
7. **No new `String @default("")` columns.** Optional strings are `String?`. Empty string is not a null substitute. Fix existing ones on `Job`, `JobPart`, `SavedLocation`, `JobTemplate` as they are touched, per `CLAUDE.md`.
8. **No Zod schema bypass.** Every POST and PATCH on Job goes through `parseBody(SharedSchema, request.body)` first. `validateCreateJob` and the rest of `api/src/validation.ts` for Job-related entities is deprecated — delete on migration.
9. **No `body.x ?? existing.x` in PATCH.** Use `body.x !== undefined ? body.x : existing.x` so "not sent" and "explicitly cleared" are distinguishable. `??` treats `null` as "missing" and silently keeps the old value.
10. **No silent re-mapping in routes.** A route that translates `loadData.goodsDescription → Job.goodsDescription` is the bug — the form must send `goodsDescription` directly. Route code does nothing but validate and assign.

---

## Implementation order — final

Do these in order. Do not start step N+1 before step N is merged.

1. **Define the shared Zod schema.** In `api/src/schemas/jobs.ts`, replace the existing schema with `JobCreateBaseSchema` containing every field listed in the contract above. Use exact DB column names. No optional aliases. Export two variants:
   - `JobCreateFromPRFSchema = JobCreateBaseSchema` (no extra fields — PRF sets nothing the customer should not see)
   - `JobCreateFromCJPSchema = JobCreateBaseSchema.extend({ plannedDate, plannerNotes, internalNotes, saveMode })`
   Both reject unknown fields (use `.strict()`).

2. **Update `api/src/types/requests.ts`** to mirror the Zod-inferred types. Delete `CreateJobBody`'s legacy fields (`reqBodyCategory`, `reqGvwMin`, `reqBodyType`, `reqEquipment`, `reqLicenceClass`, `trailerTypesAllowed`, `vehicleClass`, `vehicleClassRequired`, `materialType`, `quantityExpected`, `assignedDriverId`, `assignedTruck`, `assignedTrailer`, `loadDetails`, `notesData`, `exceptionPolicyData`, `loadData`, `billingData`, `altAddress`, `returnDestination`, `equipmentRequired`, `driverQualificationsReq`, `minVehicleSize`).

3. **Migrate CJP first.** It is smaller and the planner-only fields make the diff easier to reason about. In `web/src/modules/jobs/`:
   - Rename form state variables to column names. `materialDesc → goodsDescription`, `totalQty → quantity`, `qtyUnit → quantityUnit`, `totalWeight → weight`, `adrClass → hazardClass`, `contactName/Phone/Email → bookingContactName/Phone/Email`, `weighbridgeReq → weighbridgeRequired`, `forkliftReq/tailLiftReq/craneReq → handlingMethods[]` (these belong on stops, not on Job — verify).
   - Rewrite `createJobPayload.ts:buildBody` to emit the canonical shape: flat top-level keys, no `loadDetails` nesting, no `altAddress` nesting, no `notesData`/`exceptionPolicyData` blobs, no `assignedDriverId`/`assignedTruck`/`assignedTrailer`, no `vehicleClass`/`vehicleClassRequired`/`reqLicenceClass`.
   - Confirm `tsc --noEmit --strict` in `web/` passes with the new types.

4. **Update `POST /jobs` route to use the shared schema.** In `api/src/routes/jobs.ts`:
   - Replace `body as CreateJobBody` and `validateCreateJob` with `parseBody(JobCreateFromCJPSchema, request.body)`.
   - Delete every `body.x ?? body.y ?? legacy...` chain. Just read `body.x`.
   - Delete `legacyVehicleToRequirement` and `normalizeEquipment`'s fallback path.
   - The route after this change should be roughly half its current size.

5. **Migrate PRF.** In `web/src/modules/requests/PublicRequestForm.tsx`:
   - Flatten the 7 sections of internal state so the keys at the top of the state object match Job column names.
   - Real checkbox for `tempControlled`. Real checkbox for `fragile`. Drop the "derive from multi-select" patterns.
   - Decide once: either `bodyType` becomes a multi-select column in `Job` (`Json?` array, schema migration), or PRF becomes single-select for body type. Pick one and make form + schema agree. No `[0]` collapse.
   - Drop `customerCompanyName` — use `customerName`.
   - Drop `chilledFrozenAmbient` — use `tempControlled` + `tempRange`.
   - The submit payload is a single flat object using DB column names.

6. **Update `POST /public/request/:token` route.** In `api/src/routes/jobRequests.ts`:
   - Replace the blob extraction (`requesterData`, `loadData`, `specialRequirementsData`, `transportRequirementsData`, `billingData`, `notesData`, `exceptionPolicyData`) with `parseBody(JobCreateFromPRFSchema, request.body)`.
   - Delete the `stopToJobPartData` re-mapping for keys that already match `JobPart` columns — pass through.
   - Set `status = "pending_review"`, `createdByUserId`, generate `jobReference`, write Job + JobPart, increment link stats. That is the entire route body.
   - Fix the duplicate-key bug in the reject branch (`newValue` declared twice) while you are in this file.

7. **Drop the polluting columns.** In one Prisma migration:
   - `ALTER TABLE "Job" DROP COLUMN "billingData";`
   - `ALTER TABLE "Job" DROP COLUMN "loadData";`
   - Once mobile is updated: `ALTER TABLE "JobPart" DROP COLUMN "numPallets";`
   - Once UI uses `timeWindowStart` only: `ALTER TABLE "JobPart" DROP COLUMN "earliestArrivalMinutes";`
   Note that step 7 follows mobile migration — do not drop `numPallets` until mobile has been verified to read `quantityRequired`.

8. **Migrate nullable strings.** In one migration per model: `String @default("")` → `String?`, plus `UPDATE "X" SET "y" = NULL WHERE "y" = '';`. Order: `Job` first (most impactful), then `JobPart`, then `SavedLocation`, then `JobTemplate`. Update each route's PATCH handlers to use `body.x !== undefined ? body.x : existing.x` for those fields in the same PR.

9. **Add parity tests.** `api/src/tests/job-form-parity.test.ts`:
   - Build one representative payload object.
   - Assert it validates against `JobCreateFromPRFSchema`.
   - Assert it validates against `JobCreateFromCJPSchema` (with planner fields added).
   - POST to both routes (with appropriate auth / token), read the Job row back, assert the column values are equal between the two paths.
   - This test is the regression guard. CI must run it.

10. **Delete the legacy form internals.** Once steps 3 and 5 are merged and parity tests are green, remove `TemplateJobData`'s legacy-alias fields (`custInstructions`, `materialDesc`, `totalQty`, `qtyUnit`, `totalWeight`, `forkliftReq`, `tailLiftReq`, `craneReq`, `weighbridgeReq`, `podRequired`, `accessNotes`, `vehicleType`, `vehicleTypeOther`, `minSize`, `trailersAllowed` (where it duplicates the canonical), `equipmentReq`, `driverQuals`, `reqBodyCategory`, `reqGvwMin`, `reqBodyType`, `reqEquipment`, `reqLicenceClass`, `reqEndorsements`, `returnDestination`, `altAddress`) from `web/src/types/index.ts`. The "kept for backward compat reading of old templates" comment should disappear — write a one-off migration script for any saved templates that still hold the old shape.

---

## Done criteria

The migration is done when all of these are true.

- `grep -rnE 'body\.[a-zA-Z]+ \?\? body\.' api/src/routes/` returns zero matches.
- `grep -rnE 'requesterData|loadData|specialRequirementsData|transportRequirementsData|billingData|notesData|exceptionPolicyData' api/src/routes/` returns zero matches.
- `grep -rnE 'materialDesc|totalQty|qtyUnit|adrClass|reqBody|reqGvw|reqEquipment|reqLicence|trailerTypesAllowed|customerCompanyName|chilledFrozenAmbient|companySiteName|addressLine1|townCity|estimatedServiceTimeMinutes|exactAppointmentTime|entranceLatitude|bookingReference' web/src/modules/` returns zero matches.
- `grep -nE 'billingData|loadData' api/prisma/schema.prisma` returns zero matches under the `Job` model.
- `grep -nE 'assignedDriverId|assignedTruck|assignedTrailer' web/src/modules/jobs/createJobPayload.ts` returns zero matches.
- `api/src/routes/jobs.ts` is under 600 lines.
- `api/src/routes/jobRequests.ts` is under 350 lines and the `POST /public/request/:token` handler is under 80 lines.
- `tsc --noEmit` is clean in both `api/` and `web/`.
- Both forms produce wire payloads whose top-level keys are a strict subset of `Job` column names plus `stops` plus (CJP only) `plannedDate`, `plannerNotes`, `internalNotes`, `saveMode`.
- The parity test in `api/src/tests/` passes in CI.
- Adding any new field to either form is impossible without first adding it to `DATA_DICTIONARY.md`, then the Prisma schema, then `JobCreateBaseSchema`. There is no other order.

If any one of these is false, the migration is not done. The next feature does not start until it is.
