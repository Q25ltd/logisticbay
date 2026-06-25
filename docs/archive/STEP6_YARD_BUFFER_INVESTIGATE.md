# Step 6 — Yard Buffer (B2 relay-via-depot) — Investigate-First Report

> LOAD_MOVEMENT_PLAN.md Step 6 + scenario B2. **Investigate only — no code written.** For review before implementation.
> Goal: a load can be **collected by run 1, dropped at a yard, later picked by run 2 and delivered** — `drop_at_yard` / `pick_from_yard` events + custody, reconciling correctly.
> Date: 2026-06-07.

---

## 1. What I read — what's ready and the one hard problem

**Ready:**
- **Custody vocab already exists** — `loadVocab` has `drop_at_yard` / `pick_from_yard` in `TRANSACTION_TYPES` and `TRANSACTION_CUSTODY_MAP` (`on_vehicle↔yard`), `yard` in `CUSTODY_BASES`, and `customAt.yard()`. Mirrored to mobile already (S0).
- **Relay run infra exists** — `RunWaypoint` has `yard_pickup`/`hub_drop`/`depot_start`; `dependsOnRunId` + `runType:"relay"` are used by the existing `POST /planning/runs/:id/overnight-rest` (auto-creates a follow-on delivery run). So "two runs, second depends on first" is already a modelled shape.
- **Custody writer exists** — `appendLoadTrack` (S2) + `applyJobEvent`'s custody block already write `collect`/`deliver`. Adding two more transaction types is additive.

**The hard problem — the reconciler would mis-complete a relay.**
`deriveJobStatus` (S3) decides completion purely from assignment execution states: `delivered === total → completed`. In a relay the **same jobPart has two assignments** — run 1 (collect → drop_at_yard) and run 2 (pick_from_yard → deliver). After run 1 drops at the yard, run 1's assignment is "done" (its leg finished) — but the load is at a **yard**, not the customer. If "run 1 assignment done" counts as delivered, the reconciler would wrongly report the job delivered/partially-delivered while the load is still sitting in a yard.

So Step 6 must make **job completion custody-aware**: a job is `completed` only when its load's **latest custody is `customer_dest`**, not when an assignment hits the `delivered` state. (Run-level rollup can stay assignment-based — run 1 genuinely *is* complete after its leg.) This is the Step 3 reconciler enhancement the original A6 design anticipated ("read latest LoadTrack custody per part") but the S3 implementation deferred.

---

## 2. Proposed design

**A. Two new driver event types** (extend `EVENT_DEFINITIONS`):
- `drop_at_yard`: `allowedFromStates: [loaded, en_route_dropoff, at_dropoff] → delivered`; custody `on_vehicle → yard:<ref>`. (Run 1's leg ends "delivered" — its job is to reach the yard.)
- `pick_from_yard`: `allowedFromStates: [not_started] → loaded`; custody `yard:<ref> → on_vehicle`. (Run 2 starts by collecting from the yard.)

The yard reference (`yard:<locationId|label>`) comes from the event payload (a `yardRef`/`yardLocationId` field) or the run's `yard_pickup`/`hub_drop` waypoint. Both already exist on the wire shape side.

**B. Reconciler becomes custody-aware** (`reconcileLoadState` / `deriveJobStatus`):
- Read latest `LoadTrack` per jobPart → current custody base.
- Job rollup tiers driven by custody: all parts at `customer_dest` → `completed`; some → `partially_delivered`; any load `on_vehicle`/`yard` (collected, not yet delivered) → `collected`/`partially_collected`; started but nothing collected → `in_execution`. `exception` still dominates.
- This is consistent with B1 too (collect→on_vehicle, deliver→customer_dest), so it does not regress earlier steps — it makes them more correct.

**C. Relay setup** — the test/flow needs the same jobPart on two runs with `run2.dependsOnRunId = run1`. Creating that is a planning action; for Step 6 the test can build it directly (and via existing planning endpoints). A polished "make relay" UI is out of scope.

**D. Dependency check stub (invariant 8)** — `pick_from_yard` should require a prior matching `drop_at_yard` for that load (else "nothing at the yard to pick"). Step 6 adds a basic guard; full dependency-lock enforcement is Step 13.

---

## 3. Keep / Change / Delete

| File | Call | Why |
|---|---|---|
| `sync/sync.constants.ts` `EVENT_DEFINITIONS` | **CHANGE** | add `drop_at_yard` / `pick_from_yard` transitions. Derived maps update automatically. |
| `sync/applyJobEvent.ts` custody block | **CHANGE** | handle the two new events: resolve yard ref, append `drop_at_yard`/`pick_from_yard` custody; invariant-8 stub on pick. |
| `lib/reconcileLoadState.ts` | **CHANGE** | make job-completion custody-aware (latest LoadTrack per part). Run rollup stays assignment-based. |
| `loadVocab.ts` | **KEEP** | vocab already present (S0). |
| `RunWaypoint` + planning waypoint/overnight-rest | **KEEP** | relay run shape already exists. |
| Schema | **KEEP** | no change — `LoadTrack`/`RunWaypoint`/`dependsOnRunId` all exist. |
| Tests | **ADD** | `yardBuffer.test.ts` (B2): collect → drop_at_yard → pick_from_yard → deliver = 4 custody rows; job stays `collected` while at yard, `completed` only after final deliver; pick-before-drop rejected. Plus reconciler custody-aware unit tests. |

**Deletions: none. No schema change.**

---

## 4. Decisions I need before coding

**D6.1 — Add `drop_at_yard`/`pick_from_yard` as driver event types (recommended: yes), with the transitions in §2A.** Alternative: model them as planner/API-only operations outside the driver event machine — but they're physically driver actions, so the event machine is the right home.

**D6.2 — Make the reconciler custody-aware for job completion (recommended: yes).** Required for a relay to reconcile correctly; also improves B1. This modifies `deriveJobStatus` to consider latest custody, the one non-trivial change in this step. Alternative (worse): add a distinct "dropped_at_yard" execution state and keep the reconciler assignment-only — more states, still needs custody to know the load isn't at the customer.

**D6.3 — Mobile (recommended: no mobile change in Step 6).** The events work via `/sync/events` + `PATCH /jobs/:id/status` (vocab already mirrored to mobile in S0); the mobile *buttons* for "drop at yard"/"pick from yard" are a later mobile session. Step 6 is API + reconciler only. Confirm.

**D6.4 — Yard reference source (recommended: event payload `yardRef`, fallback to the run's yard waypoint).** Keeps Step 6 self-contained. Alternative: require a `RunWaypoint` of type `yard_pickup`/`hub_drop` and derive from it (tighter, but couples the event to waypoint setup).

**D6.5 — Dependency guard depth (recommended: basic stub now).** `pick_from_yard` requires an existing `drop_at_yard` custody row for that load; full relay dependency-lock (block run 2 publish until run 1 drops) is Step 13. Confirm the stub is enough for Step 6.

**D6.6 — Step size.** This is the first step that changes the reconciler's core rule. If you'd prefer, I can split it: **6a** = events + custody (+ pick-before-drop guard), **6b** = reconciler custody-awareness + B2 end-to-end reconcile. Or do it as one step. Your call.

---

## 5. Risk / scope notes

- **Reconciler change touches B1's path** — mitigated because custody-driven completion is equivalent to the assignment-driven result for the direct case; the new tests cover both B1 (still completes) and B2.
- **Multi-assignment-per-part** is the relay's premise; the reconciler already reads all assignments, and will now read custody too.
- **Parked (not Step 6):** trailer swap (S7), driver handover (S8), split (S9), full dependency-lock (S13), relay-setup UI polish, mobile yard buttons.
- **Exit gate (S6):** B2 end-to-end test green — 4 custody rows, job `collected` while at yard then `completed` after final deliver; pick-before-drop rejected; B1 still completes; typecheck/check:vocab/api-tests green (DB tests on Mac).

---

## 6. Recommendation

Proceed with **D6.1 yes; D6.2 yes (custody-aware reconciler); D6.3 no mobile change; D6.4 event payload yardRef; D6.5 basic stub**. For **D6.6**, I lean toward doing it as **one step** (the reconciler change and the events are tightly coupled for a meaningful B2 test) — but I'll split into 6a/6b if you prefer smaller gates. Awaiting review before writing any code.
