# Naming Conflict Audit

**Scope:** Seven files read on 2026-05-12.

| File | Short label used below |
|------|----------------------|
| `api/prisma/schema.prisma` | **schema** |
| `web/src/modules/requests/PublicRequestForm.tsx` | **PublicForm** |
| `web/src/api/jobRequests.ts` | **jobRequestsApi** |
| `api/src/routes/jobRequests.ts` | **jobRequestsRoute** |
| `api/src/routes/jobs.ts` | **jobsRoute** |
| `web/src/modules/jobs/CreateJobPage.tsx` | **CreateJob** |
| `web/src/modules/jobs/JobDetailPage.tsx` | **JobDetail** |

---

## 1. Contact fields

### 1a. Top-level booking / requester contact on a job

| Concept | Names found in codebase | Files / locations | Proposed canonical |
|---------|------------------------|-------------------|-------------------|
| Booking contact name on `PlannedJob` | `bookingContactName` (schema `PlannedJob`, jobsRoute create/patch, jobRequestsRoute accept) vs `contactName` (CreateJob state `contactName`, CreateJob template blob key `contactName`, createJobPayload param `contactName`) | schema line 292; jobsRoute lines 594,724,730; jobRequestsRoute line 509; CreateJob lines 354,170,694 | `bookingContactName` (matches DB column; the "contact" prefix is already used by stops and saved locations) |
| Booking contact phone | `bookingContactPhone` vs `contactPhone` | Same as above | `bookingContactPhone` |
| Booking contact email | `bookingContactEmail` vs `contactEmail` | Same as above | `bookingContactEmail` |

**Notes:** `bookingContactName/Phone/Email` are **real columns** on `PlannedJob` (migration needed to rename). The `contactName/Phone/Email` names live entirely in the frontend state and template blob (JSON — no migration). In edit mode the code maps `job.bookingContactName → setContactName`, masking the discrepancy.

---

### 1b. Contact on a stop (`JobStop`)

| Concept | Names found in codebase | Files / locations | Proposed canonical |
|---------|------------------------|-------------------|-------------------|
| Stop contact name | `contactName` (schema `JobStop`, jobsRoute stop create/patch, jobRequestsRoute stop insert, jobRequestsApi `RequestStop`, PublicForm `StopState`) | All files — unanimous | `contactName` |
| Stop contact phone | `contactPhone` | All files — unanimous | `contactPhone` |
| Stop contact email | `contactEmail` | All files — unanimous | `contactEmail` |

No conflict here; unanimous across all layers.

---

### 1c. Contact on `SavedLocation`

| Concept | Names found in codebase | Files / locations | Proposed canonical |
|---------|------------------------|-------------------|-------------------|
| Location contact name | `contactName` (schema `SavedLocation`) | schema line 204 | `contactName` |
| Location contact phone | `contactPhone` (schema `SavedLocation`) | schema line 205 | `contactPhone` |

No conflict; `SavedLocation` does not have an email field at all.

---

### 1d. Requester contact in `JobRequest` / public form

| Concept | Names found in codebase | Files / locations | Proposed canonical |
|---------|------------------------|-------------------|-------------------|
| Requester company name | `customerCompanyName` (PublicForm state, `RequesterData` interface, `RequesterBlob`) vs `customerName` (denormalised column on `JobRequest`) | PublicForm lines 634,769; jobRequestsApi line 55; jobRequestsRoute line 334 | `customerCompanyName` in the `requesterData` blob; `customerName` on the top-level denormalised column — these serve different purposes and should stay distinct |
| Requester contact name | `contactName` (all layers — `JobRequest` column, `RequesterData`, PublicForm state) | Unanimous | `contactName` |

No conflict on requester contact name/phone/email — they use the same key throughout.

---

## 2. Address fields

### 2a. Site / company name at a stop

| Concept | Names found in codebase | Files / locations | Proposed canonical |
|---------|------------------------|-------------------|-------------------|
| Site name on a stop | `siteName` (schema `JobStop`, jobsRoute stop create, `StructuredJobStopInput`) vs `companySiteName` (PublicForm `StopState`, jobRequestsApi `RequestStop`, jobRequestsRoute `StopBlob`, jobRequestsRoute stop insert maps `s.companySiteName → siteName`) | schema `JobStop` line 357; jobsRoute line 625; vs PublicForm line 176; jobRequestsApi line 17; jobRequestsRoute line 537 | `siteName` — matches DB column on `JobStop`; `companySiteName` is only used in the request-intake blob layer |

**Migration needed?** No — `siteName` is already the DB column. `companySiteName` lives only in JSON blobs (no migration needed, code-only change).

---

### 2b. Street / address line 1

| Concept | Names found in codebase | Files / locations | Proposed canonical |
|---------|------------------------|-------------------|-------------------|
| Street / first address line on a stop | `street` (schema `JobStop`, schema `SavedLocation`, jobsRoute stop create, `StructuredJobStopInput`) vs `addressLine1` (PublicForm `StopState`, jobRequestsApi `RequestStop`, jobRequestsRoute `StopBlob`, jobRequestsRoute maps `s.addressLine1 → street`) | schema lines 197,360; jobsRoute line 627 vs PublicForm line 178; jobRequestsApi line 19; jobRequestsRoute line 538 | `street` — real DB column name; `addressLine1` only in the request-intake blob |

**No migration needed** — `addressLine1` never touches the DB directly.

---

### 2c. Town / city

| Concept | Names found in codebase | Files / locations | Proposed canonical |
|---------|------------------------|-------------------|-------------------|
| Town/city on a stop | `town` (schema `JobStop`, schema `SavedLocation`, jobsRoute, CreateJob `StopState`) vs `townCity` (PublicForm `StopState`, jobRequestsApi `RequestStop`, jobRequestsRoute `StopBlob`, maps `s.townCity → town`) | schema `JobStop` line 361; vs PublicForm line 178; jobRequestsApi line 20 | `town` — real DB column |

**No migration needed.**

---

### 2d. Entrance coordinates on a stop

| Concept | Names found in codebase | Files / locations | Proposed canonical |
|---------|------------------------|-------------------|-------------------|
| Stop entrance latitude | `lat` (schema `JobStop`, jobsRoute stop create, `StructuredJobStopInput`, CreateJob `StopState`) vs `entranceLatitude` (PublicForm `StopState`, jobRequestsApi `RequestStop`, jobRequestsRoute `StopBlob`, maps `s.entranceLatitude → lat`) | schema `JobStop` line 364; vs PublicForm line 181; jobRequestsApi line 24 | `lat` — real DB column |
| Stop entrance longitude | `lng` vs `entranceLongitude` | Same sources as above | `lng` |

**No migration needed** — `entranceLatitude/Longitude` live only in the request-intake JSON blob.

---

### 2e. Gate coordinates on a stop

| Concept | Names found in codebase | Files / locations | Proposed canonical |
|---------|------------------------|-------------------|-------------------|
| Gate/secondary lat | `gateLat` (schema `JobStop`, schema `SavedLocation`, jobsRoute) — appears in `StructuredJobStopInput` and the stop creation code | schema `JobStop` line 366, `SavedLocation` line 201; jobsRoute line 633 | `gateLat` (consistent across DB and route — no conflict) |
| Gate/secondary lng | `gateLng` | Same — no conflict | `gateLng` |

---

### 2f. Entrance / navigation instructions on a stop

| Concept | Names found in codebase | Files / locations | Proposed canonical |
|---------|------------------------|-------------------|-------------------|
| Navigation / entrance instructions at a stop | `navigationInstructions` (schema `JobStop`, jobsRoute stop create, CreateJob `StopState`) vs `entranceInstructions` (PublicForm `StopState`, jobRequestsApi `RequestStop`, jobRequestsRoute `StopBlob`, maps `s.entranceInstructions → navigationInstructions`) | schema `JobStop` line 385; jobsRoute line 648 vs PublicForm line 183; jobRequestsRoute line 547 | `navigationInstructions` — real DB column |

**No migration needed.**

---

### 2g. Booking reference on a stop

| Concept | Names found in codebase | Files / locations | Proposed canonical |
|---------|------------------------|-------------------|-------------------|
| Booking reference at a stop | `bookingRef` (schema `JobStop`, jobsRoute stop create/patch, CreateJob `StopState`) vs `bookingReference` (PublicForm `StopState`, jobRequestsApi `RequestStop`, jobRequestsRoute `StopBlob`, maps `s.bookingReference → bookingRef`) | schema `JobStop` line 382; jobsRoute line 645 vs PublicForm line 205; jobRequestsRoute line 552 | `bookingRef` — real DB column |

**No migration needed.**

---

## 3. Reference numbers

| Concept | Names found in codebase | Files / locations | Proposed canonical |
|---------|------------------------|-------------------|-------------------|
| Internal job reference number | `jobReference` (schema `PlannedJob`, jobsRoute, jobRequestsApi, JobDetail) vs `referenceNumber` (schema `PlannedJob` has *both* `jobReference` and `referenceNumber`; CreateJob state `referenceNumber`; JobDetail displays `job.referenceNumber` labelled "Cust. Ref") | schema lines 268–269; jobsRoute lines 571–572 | These are genuinely two different fields: `jobReference` = system auto-generated sequence number; `referenceNumber` = legacy free-text customer reference. The *label* conflict is the issue: JobDetail labels `referenceNumber` as "Cust. Ref" while CreateJob labels the same field "Reference number". The field below (`customerRef`) is a third field covering the same ground. |
| Customer / booking reference on a job | `customerRef` (schema `PlannedJob`, jobsRoute, CreateJob state) vs `referenceNumber` (schema `PlannedJob`, CreateJob state, jobsRoute) vs `billingReference` (jobRequestsRoute accept maps `billing.billingReference → customerRef`) | schema lines 269,288; jobsRoute lines 509,572,1123; CreateJob line 345 | `customerRef` — it already lives in the DB. Consider deprecating `referenceNumber` or explicitly documenting that `referenceNumber` = "carrier reference / old field" and `customerRef` = "customer PO/booking ref". |
| Reference at a stop | `referenceNumber` (schema `JobStop`, jobsRoute, CreateJob `StopState`, PublicForm `StopState`, jobRequestsApi, jobRequestsRoute) | All layers unanimous | `referenceNumber` — no conflict |
| Customer reference on a request | `customerReference` (PublicForm state, `RequesterData`, jobRequestsRoute `RequesterBlob`) | Request intake only | `customerReference` |
| Purchase order number on a job | `purchaseOrderNumber` (schema `PlannedJob`, jobsRoute, CreateJob state, jobRequestsRoute accept, jobRequestsApi `BillingData`) | All unanimous | `purchaseOrderNumber` |

---

## 4. Stop timing fields

| Concept | Names found in codebase | Files / locations | Proposed canonical |
|---------|------------------------|-------------------|-------------------|
| Earliest arrival (stop time window start, integer minutes offset) | `earliestArrivalMinutes` (schema `JobStop`, jobsRoute stop create/patch) vs `earliestArrival` (CreateJob `StopState`) vs `earliestArrivalTime` (PublicForm `StopState`, jobRequestsApi `RequestStop`, jobRequestsRoute `StopBlob`) | schema `JobStop` line 373; jobsRoute line 637 vs CreateJob line 307 vs PublicForm line 187 | **Three different representations of the same concept:** (1) `earliestArrivalMinutes` = integer minutes from midnight in the DB; (2) `earliestArrival` = string minutes offset in CreateJob; (3) `earliestArrivalTime` = `HH:MM` wall-clock time string in the request intake flow. The DB column name `earliestArrivalMinutes` is correct for what it stores; the public form's `earliestArrivalTime` is a wall-clock string and gets combined with `date` to produce a full `DateTime` saved into `timeWindowStart`. These three are architecturally distinct but their names are too similar. |
| Latest arrival (stop time window end, integer minutes offset) | `latestArrivalTime` (PublicForm `StopState`, jobRequestsApi `RequestStop`, jobRequestsRoute `StopBlob`) — stored as `timeWindowEnd` in DB after combining with `date` | PublicForm line 188; jobRequestsApi line 37; jobRequestsRoute line 558 | `latestArrivalTime` → becomes `timeWindowEnd` in DB |
| Service time / unloading allowance at a stop | `unloadingAllowanceMinutes` (schema `JobStop`) vs `estimatedServiceTimeMinutes` (PublicForm `StopState`, jobRequestsApi `RequestStop`, jobRequestsRoute `StopBlob`, maps to `unloadingAllowanceMinutes`) vs `unloadingTime` (CreateJob `StopState`, createJobPayload) vs `serviceTime` / `serviceTimeCustom` (PublicForm local UI state) | schema `JobStop` line 374; jobRequestsRoute line 559 vs PublicForm line 189 vs CreateJob line 308 | `unloadingAllowanceMinutes` — real DB column. `estimatedServiceTimeMinutes` used only in the request intake blob layer. `unloadingTime` used only in the internal CreateJob form. |
| Booked / exact appointment time | `bookedTime` (schema `JobStop`, jobsRoute) vs `exactAppointmentTime` (PublicForm `StopState`, jobRequestsApi `RequestStop`, jobRequestsRoute) | schema `JobStop` line 371; jobsRoute line 636 vs PublicForm line 206 | `bookedTime` — real DB column |

---

## 5. Vehicle fields

| Concept | Names found in codebase | Files / locations | Proposed canonical |
|---------|------------------------|-------------------|-------------------|
| Vehicle body category requirement | `reqBodyCategory` (schema `PlannedJob`, jobsRoute, CreateJob state, jobRequestsApi `TransportRequirementsData`, jobRequestsRoute `TransportRequirementsBlob`) | All layers unanimous | `reqBodyCategory` |
| Vehicle body type requirement | `reqBodyType` (schema `PlannedJob`, jobsRoute, CreateJob state, jobRequestsApi, jobRequestsRoute) | Unanimous | `reqBodyType` |
| Vehicle class (legacy free-text field) | `vehicleClass` (schema `PlannedJob`, jobsRoute, CreateJob state) vs `vehicleClassRequired` (schema `PlannedJob`, jobsRoute) | schema lines 276–277; jobsRoute line 579; CreateJob line 574 | Both exist in the DB as separate columns. `vehicleClass` = what was assigned; `vehicleClassRequired` = legacy planning requirement text. Both real columns; no rename recommended — but `vehicleClassRequired` should be considered deprecated in favour of `reqBodyCategory`. |
| Equipment requirements on a job — dual fields | `reqEquipment` (schema `PlannedJob` Json, jobsRoute, CreateJob state — the structured normalised list) vs `equipmentRequired` (schema `PlannedJob` Json, jobsRoute — a second Json field serving the same purpose) | schema lines 281,299; jobsRoute lines 509,600,1132 | `reqEquipment` — the structured field. `equipmentRequired` appears to be a legacy parallel field that is still written to but not the canonical value. Both are JSON blobs — no migration needed, code-only clean-up. |
| Fleet unit body category | `bodyCategory` (schema `FleetUnit`) | schema line 695 | `bodyCategory` — consistent with `reqBodyCategory` once the `req` prefix is understood as "required" |

---

## 6. Trailer fields

| Concept | Names found in codebase | Files / locations | Proposed canonical |
|---------|------------------------|-------------------|-------------------|
| Allowed trailer types on a job | `trailerTypesAllowed` (schema `PlannedJob` Json, schema `JobTemplate` Json, schema `DriverProfile` Json, jobsRoute, jobRequestsApi `TransportRequirementsData`, jobRequestsRoute) vs `trailersAllowed` (CreateJob state, CreateJob template blob key `trailersAllowed`) | schema `PlannedJob` line 283; vs CreateJob line 426,732 | `trailerTypesAllowed` — matches DB column name; `trailersAllowed` is frontend-local state only (no migration needed) |
| Forbidden trailer types | `trailerTypesForbidden` (schema `PlannedJob` Json) | schema line 298 | `trailerTypesForbidden` — no conflict; only present in schema |
| Assigned trailer registration on a job | `assignedTrailer` (schema `PlannedJob`, jobsRoute, CreateJob state, JobDetail) | Unanimous | `assignedTrailer` |
| Fleet trailer type | `trailerType` (schema `FleetTrailer`) | schema line 720 | `trailerType` — no conflict |

---

## 7. Load fields

| Concept | Names found in codebase | Files / locations | Proposed canonical |
|---------|------------------------|-------------------|-------------------|
| Goods / material type / description | `materialType` (schema `LoadDetails`, schema `PlannedJob`, jobsRoute) vs `goodsType` (PublicForm state, jobRequestsApi `LoadData`, jobRequestsRoute `LoadDataBlob`) vs `goodsDescription` (jobRequestsApi `LoadData`, jobRequestsRoute `LoadDataBlob`, maps to `materialType` on `LoadDetails`) vs `materialDesc` (CreateJob state) vs `defaultMaterialType` (schema `JobTemplate`) | schema `LoadDetails` line 417; schema `PlannedJob` line 270; jobsRoute line 665 vs PublicForm line 652; jobRequestsApi line 63 vs CreateJob line 383 | `materialType` — real DB column on `LoadDetails` and `PlannedJob`. `goodsType` is a category selector in the request intake (pallets, machinery, etc.) and is a distinct concept from `materialType` (free-text description). `goodsDescription` and `materialDesc` are the same concept and both map to `LoadDetails.materialType`. |
| Quantity | `quantity` (schema `LoadDetails`, jobsRoute) vs `quantityExpected` (schema `PlannedJob`) vs `totalQty` (CreateJob state) | schema `LoadDetails` line 411; schema `PlannedJob` line 271; CreateJob line 382 | `quantity` on `LoadDetails` is the structured value; `quantityExpected` on `PlannedJob` is a legacy denormalised string copy. `totalQty` is frontend-only state. Both DB fields are real columns — migration needed to align. |
| Quantity unit | `unit` (schema `LoadDetails`, jobsRoute) vs `quantityUnit` (schema `PlannedJob`) vs `qtyUnit` (CreateJob state) | schema `LoadDetails` line 412; schema `PlannedJob` line 272; CreateJob line 384 | `unit` on `LoadDetails`; `quantityUnit` on `PlannedJob` is legacy copy. Same structural conflict as `quantity`/`quantityExpected`. |
| Weight | `weight` (schema `LoadDetails`, jobsRoute, jobRequestsApi `LoadData` as `estimatedWeight`) vs `estimatedWeight` (jobRequestsApi, jobRequestsRoute `LoadDataBlob`, maps `loadData.estimatedWeight → weight`) | schema `LoadDetails` line 413; jobRequestsRoute line 574 | `weight` — real DB column. `estimatedWeight` only in request intake blob. |

---

## 8. Status fields

| Concept | Names found in codebase | Files / locations | Proposed canonical |
|---------|------------------------|-------------------|-------------------|
| Job execution status | `status` on `PlannedJob` (values: `pending`, `in_progress`, `arrived_pickup`, `collected`, `arrived_dropoff`, `completed`, `cancelled`) | schema line 313; jobsRoute; JobDetail | `status` — no naming conflict, but the value `accepted` appears in `JobDetail` `STATUS_FLOW` constant (line 29) but does NOT appear in the DB column's known valid values or the `ALLOWED_JOB_TRANSITIONS` map. Likely a stale value left over from a previous design. |
| Job request review status | `status` on `JobRequest` (values: `pending_review`, `accepted`, `rejected`, `cancelled`) | schema line 803 | `status` — no conflict with job status since they live on different models |
| Job stop status | `status` on `JobStop` (values: `pending`) | schema line 393 | `status` — no inter-model conflict but the stop status values are poorly defined |
| Fleet unit availability | `status` on `FleetUnit` (values: `available`, ...) | schema line 699 | `status` — no naming conflict |
| Validation / readiness status on a job | `validationStatus` (schema `PlannedJob`, jobsRoute) | Unanimous | `validationStatus` |

---

## 9. Pricing fields

| Concept | Names found in codebase | Files / locations | Proposed canonical |
|---------|------------------------|-------------------|-------------------|
| Pricing type | `pricingType` (schema `JobRequest` column, jobRequestsApi, PublicForm state, jobRequestsRoute `BillingBlob`) | Unanimous | `pricingType` |
| Declared goods value | `declaredGoodsValue` (jobRequestsApi `BillingData`, jobRequestsRoute `BillingBlob`) vs `declaredValue` (PublicForm state variable name) | jobRequestsApi line 107; jobRequestsRoute line 186; PublicForm line 695 | `declaredGoodsValue` — the serialised/API key; `declaredValue` is purely a local React state name (no conflict in the wire format) |
| Currency | `currency` (jobRequestsApi `BillingData`, jobRequestsRoute `BillingBlob`) | Only in the billing blob — no DB column exists for this yet | `currency` |

---

## 10. Boolean proof / requirement flags

| Concept | Names found in codebase | Files / locations | Proposed canonical |
|---------|------------------------|-------------------|-------------------|
| POD required on a job | `requirePOD` (schema `PlannedJob`, jobsRoute, CreateJob state `podRequired` → maps to `requirePOD` in `buildBody`, jobRequestsRoute sets `requirePOD: false` on accept) vs `podRequired` (CreateJob state variable, CreateJob template blob key, jobRequestsRoute `defaultJobData.podRequired`) | schema `PlannedJob` line 321; jobsRoute line 616 vs CreateJob line 387,721,753 | `requirePOD` — real DB column. `podRequired` lives only in frontend state and the `defaultJobData` template blob (JSON, no migration). |
| Photos required on load | `photosRequired` (schema `LoadDetails`, jobsRoute, CreateJob state) | Unanimous on `LoadDetails` | `photosRequired` |
| Photos required on rejection (exception policy) | `photosRequiredOnRejection` (PublicForm state, jobRequestsApi `ExceptionPolicyData`, jobRequestsRoute `ExceptionPolicyBlob`) | Request intake blob only | `photosRequiredOnRejection` — no conflict; different concept from `LoadDetails.photosRequired` |
| Proof requirements at a stop (multi-select array) | `proofRequirements` (PublicForm `StopState`, jobRequestsApi `RequestStop`, jobRequestsRoute `StopBlob`) | Only in request intake — no DB column | `proofRequirements` — stored inside the `stops` Json blob on `JobRequest`; never mapped to a DB stop column |
| Weighbridge required | `weighbridgeRequired` (schema `LoadDetails`) vs `weighbridgeReq` (CreateJob state, template blob) | schema `LoadDetails` line 426; CreateJob line 408 | `weighbridgeRequired` — real DB column. `weighbridgeReq` is frontend state only (no migration). |
| Forklift required | `forkliftRequired` (schema `LoadDetails`) vs `forkliftReq` (CreateJob state, template blob) | schema `LoadDetails` line 427; CreateJob line 400 | `forkliftRequired` — real DB column. `forkliftReq` is frontend state only. |
| Tail-lift required | `tailLiftRequired` (schema `LoadDetails`) vs `tailLiftReq` (CreateJob state, template blob) | schema `LoadDetails` line 428; CreateJob line 401 | `tailLiftRequired` — real DB column. `tailLiftReq` is frontend state only. |
| Crane required | `craneRequired` (schema `LoadDetails`, jobRequestsApi `LoadData`, jobRequestsRoute `LoadDataBlob`) vs `craneReq` (CreateJob state, template blob) | schema `LoadDetails` line 429; CreateJob line 402 | `craneRequired` — real DB column. `craneReq` is frontend state only. |
| Collection required | `requireCollection` (schema `PlannedJob`, jobsRoute) | Unanimous | `requireCollection` |
| Delivery quantity required | `requireDeliveryQty` (schema `PlannedJob`, jobsRoute) | Unanimous | `requireDeliveryQty` |
| Customer reference required | `custRefRequired` (schema `PlannedJob`, jobsRoute, CreateJob state, template blob) | Unanimous | `custRefRequired` |
| PO required | `poRequired` (schema `PlannedJob`, jobsRoute, CreateJob state, template blob) | Unanimous | `poRequired` |

---

## Summary: migration cost

| # | Conflict | DB columns affected | Migration needed? |
|---|----------|--------------------|--------------------|
| 1a | `bookingContactName/Phone/Email` vs `contactName/Phone/Email` in CreateJob | `PlannedJob.bookingContactName/Phone/Email` | No — DB column names are correct; frontend state vars need renaming |
| 2a | `siteName` vs `companySiteName` | `JobStop.siteName` | No — `siteName` is the DB column; blob field only |
| 2b | `street` vs `addressLine1` | `JobStop.street`, `SavedLocation.street` | No — `street` is the DB column; blob field only |
| 2c | `town` vs `townCity` | `JobStop.town`, `SavedLocation.town` | No — `town` is the DB column; blob field only |
| 2d | `lat/lng` vs `entranceLatitude/Longitude` | `JobStop.lat/lng` | No — `lat/lng` is the DB column; blob field only |
| 2f | `navigationInstructions` vs `entranceInstructions` | `JobStop.navigationInstructions` | No — DB column name correct; blob field only |
| 2g | `bookingRef` vs `bookingReference` | `JobStop.bookingRef` | No — DB column name correct; blob field only |
| 3 | `referenceNumber` vs `customerRef` (overlapping semantics) | `PlannedJob.referenceNumber` and `PlannedJob.customerRef` | Would need migration to merge or rename either column |
| 4 | `unloadingAllowanceMinutes` vs `estimatedServiceTimeMinutes` vs `unloadingTime` | `JobStop.unloadingAllowanceMinutes` | No — DB column name correct; other names are blob / frontend only |
| 4 | `bookedTime` vs `exactAppointmentTime` | `JobStop.bookedTime` | No — DB column name correct; blob field only |
| 5 | `reqEquipment` vs `equipmentRequired` (dual Json fields on `PlannedJob`) | `PlannedJob.reqEquipment` and `PlannedJob.equipmentRequired` | Neither is a real column (both Json) — code-only change to delete writes to `equipmentRequired` |
| 6 | `trailerTypesAllowed` vs `trailersAllowed` | `PlannedJob.trailerTypesAllowed` | No — DB column name correct; frontend state only |
| 7 | `materialType`/`materialDesc`/`goodsDescription` | `LoadDetails.materialType` | No — DB column correct; others are frontend / blob names |
| 7 | `quantity`/`quantityExpected` and `unit`/`quantityUnit` | `PlannedJob.quantityExpected`, `PlannedJob.quantityUnit` | Yes — migration needed to drop the legacy denormalised copies from `PlannedJob` (or accept they stay as a read-only legacy cache) |
| 10 | `requirePOD` vs `podRequired` | `PlannedJob.requirePOD` | No — DB column correct; `podRequired` is frontend state only |
| 10 | `weighbridgeRequired` vs `weighbridgeReq` | `LoadDetails.weighbridgeRequired` | No — DB column correct; frontend state only |
| 10 | `forkliftRequired` vs `forkliftReq` | `LoadDetails.forkliftRequired` | No — DB column correct; frontend state only |
| 10 | `tailLiftRequired` vs `tailLiftReq` | `LoadDetails.tailLiftRequired` | No — DB column correct; frontend state only |
| 10 | `craneRequired` vs `craneReq` | `LoadDetails.craneRequired` | No — DB column correct; frontend state only |
