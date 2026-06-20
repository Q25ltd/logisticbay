# Step 2 — LoadTrack Write Path — Investigate-First Report

> LOAD_MOVEMENT_PLAN.md Step 2. **Investigate only — no code written.** For review before implementation.
> Goal: append a custody (`LoadTrack`) row on `collected` and `completed` (deliver) events, so "where is the load" becomes answerable. Precondition for every Part B scenario beyond B1.
> Date: 2026-06-07.

---

## 1. What I read, and the current state

- **`LoadTrack` model** is fully defined and **never written** today (grep: zero `loadTrack.create`). Required fields: `companyId, jobId, jobPartId, eventId, transactionType, quantity (Decimal), fromCustody, toCustody, timestamp`. Optional: `runId, runAssignmentId, driverId, trailerId (default ""), gpsLat/Lng, notes, deletedAt`. So no schema change is needed for Step 2 — the columns are ready.
- **`applyJobEvent` (post-Step-1)** creates the `JobExecutionEvent` but doesn't capture the created row. Step 2 needs the event's `id` to set `LoadTrack.eventId` (invariant 5: every custody row has a cause).
- **Stops are JobParts typed `collection` / `delivery`.** A simple job has two: `plannerWorkService.ts` already derives `collectionPart = jobParts.find(type==='collection')` and `deliveryPart = ...'delivery'`. So origin/dest resolution already has a proven pattern to reuse.
- **Quantity is already on the wire.** `UpdateJobStatusSchema` (online) already accepts `actualQuantity, actualUnit, collectionNote, podNumber, deliveryNote`; `sync.service.ts`'s `IncomingEvent` has the same. Mobile sends `actualQuantity` at collect and at deliver. None of it currently reaches `applyJobEvent` — it's dropped. Step 2 can thread it with no new wire contract.
- **Vehicle identity:** `Run` has `assignedTrailerId` / `assignedTruckId` (Int FKs). `LoadTrack.trailerId` is a `String`. The resolved assignment gives `runId` → load the run for the vehicle.
- **Custody reader exists and must be updated.** `plannerWorkService.ts:370` detects in-custody via `track.toCustody.includes("driver") || .includes("depot")` — the OLD free-text words. Step 2 writes the NEW bases (`on_vehicle`, `customer_dest`), so this reader must switch to `custodyBaseOf()` from `loadVocab` or it will read custody wrong.

---

## 2. Keep / Change / Delete

| File | Call | Why |
|---|---|---|
| `schema.prisma` `LoadTrack` | **KEEP** | All columns needed already exist. No migration in Step 2. |
| `api/src/sync/applyJobEvent.ts` | **CHANGE** | Capture the created event id; after advancing the assignment, call the new custody helper for `collected`/`completed`. Thread `actualQuantity`/`actualUnit` from input. |
| **new** `api/src/lib/loadTrack.ts` | **ADD** | `appendLoadTrack(tx, {...})` — one helper that writes a custody row from the transaction type + resolved custody/quantity/vehicle. Single writer (avoids scattered `loadTrack.create`). |
| `api/src/sync/sync.service.ts` | **CHANGE (small)** | Pass `actualQuantity`/`actualUnit` (already on `IncomingEvent`) into `applyJobEvent`. |
| `api/src/routes/jobs.ts` PATCH status | **CHANGE (small)** | Pass `body.actualQuantity`/`actualUnit` (already in schema) into `applyJobEvent`. |
| `api/src/services/plannerWorkService.ts` | **CHANGE** | Update the custody reader from `.includes("driver"/"depot")` to base-aware (`custodyBaseOf` ∈ {on_vehicle, yard} = in custody). Reads must match the new writes. |
| `api/src/constants/loadVocab.ts` | **KEEP / consume** | Use `customAt.*`, `TRANSACTION_CUSTODY_MAP`, `custodyBaseOf`. |
| `api/src/services/runService.ts` | **KEEP** | Already preserves LoadTrack on cancel (SAFETY §7) — unaffected. |
| Tests | **ADD** | New `loadtrack.test.ts`: B1 (collect→deliver) writes exactly two rows with correct bases, quantities, eventId set; invariant 3 (no deliver row without a prior collect); idempotent event → no duplicate custody row. |

**Deletions in Step 2: none.**

---

## 3. Proposed write logic (for review)

On a successful `collected` event:
- `appendLoadTrack`: `transactionType='collect'`, `jobPartId = collectionPart.id`, `fromCustody = customer_origin:<collectionPart.id>`, `toCustody = on_vehicle:<trailerId|truckId>`, `quantity = actualQuantity ?? collectionPart.quantityRequired ?? 0`, `unit`, `driverId`, `trailerId`, `runId`, `runAssignmentId`, `eventId`, `gps`, `timestamp`.

On a successful `completed` (deliver) event:
- Invariant 3 guard: require an existing `collect` row for this job; else fail (`deliver before collect`).
- `appendLoadTrack`: `transactionType='deliver'`, `jobPartId = deliveryPart.id`, `fromCustody = on_vehicle:<vehicle>`, `toCustody = customer_dest:<deliveryPart.id>`, `quantity = actualQuantity ?? deliveryPart.quantityRequired ?? 0`, etc.

Custody bases/transitions come from `TRANSACTION_CUSTODY_MAP` (validated against it). Other events (`started`, `arrived_pickup`, `arrived_dropoff`) write **no** custody row — they're not custody transfers.

Idempotency is already handled upstream: a duplicate `clientEventId` short-circuits in `applyJobEvent` before any write, so no duplicate custody rows.

---

## 4. Decisions I need before coding

**D2.1 — Stop-aware custody (recommended: yes).** `collected` records the **collection** stop as origin; `completed` records the **delivery** stop as dest (via the `collectionPart`/`deliveryPart` pattern already in `plannerWorkService`). Correct for B1. *Note:* this means the custody row's `jobPartId` (delivery stop) can differ from the execution assignment Step 1 advanced (Step 1 advances the first/collection assignment under the job-level event model). That divergence is inherent to the current job-level mobile event model; full per-stop execution is a later step. Alternative: record both custody rows against a single jobPart — simpler but less accurate for relays later.

**D2.2 — Quantity source (recommended: thread the event quantity).** Use `actualQuantity`/`actualUnit` already arriving on both paths, falling back to the stop's `quantityRequired`. Low effort (no wire change). Alternative: ignore event quantity in Step 2 and use only `quantityRequired` (defers accurate quantities).

**D2.3 — Vehicle identifier (recommended: trailer then truck).** `on_vehicle:<run.assignedTrailerId ?? run.assignedTruckId>`, and store that id in `LoadTrack.trailerId`. Confirm, or prefer resolving the trailer registration string instead of the id.

**D2.4 — Update the custody reader now (recommended: yes).** Switch `plannerWorkService` in-custody detection to the new bases in the same step, so the planning board's cargo-state reads match what Step 2 writes. (No production LoadTrack data exists, so no backward-compat shim needed.)

---

## 5. Risk / scope notes

- **Parked (not Step 2):** multiple collection/delivery stops, yard drops (`drop_at_yard`/`pick_from_yard` are Step 6), swaps/handover/split/consolidate. Step 2 = `collect` + `deliver` only, single collection + single delivery (B1).
- **Execution-vs-custody divergence** for multi-part jobs under the job-level event model — noted above (D2.1); resolved when per-stop execution lands.
- **Exit gate (S2):** B1 produces exactly two append-only `LoadTrack` rows (`collect` customer_origin→on_vehicle, `deliver` on_vehicle→customer_dest), each with `eventId` set; deliver-before-collect is rejected; duplicate event writes no second row; typecheck/check:vocab/api-tests green (DB tests on Mac).

---

## 6. Recommendation

Proceed with **D2.1=yes (stop-aware), D2.2=thread quantity, D2.3=trailer-then-truck, D2.4=update reader now**. This makes custody correct for B1, reuses existing patterns, needs no schema change and no mobile release, and sets up Steps 3 (reconciler reads custody) and 6 (yard) cleanly. Awaiting review before writing any code.
