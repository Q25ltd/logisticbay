# Step 4 — Publish Gate — Investigate-First Report

> LOAD_MOVEMENT_PLAN.md Step 4 + audit 🟠 #1 + invariant 6. **Investigate only — no code written.** For review before implementation.
> Goal: a driver sees a run's work **only** when `publishedToDriver = true`, so the planner's publish / recall buttons actually control what the driver sees.
> Date: 2026-06-07.

---

## 1. What I read — the gap and the surfaces

`publishedToDriver` is **written but never read** (grep-confirmed): `runs.ts` publish sets it `true`; `planning.ts` publish sets it `true`; planning PATCH can set it `true`/`false` (recall). **No query filters on it.** So publish and recall have no effect on the driver — exactly audit 🟠 #1.

Driver-facing surfaces that resolve jobs by `run: { assignedDriverId }` **without** the publish filter:

| Surface | Line | Who | Gate? |
|---|---|---|---|
| `GET /jobs` (driver branch) | `jobs.ts:65` | the driver's own list | **YES** |
| `GET /jobs/my` | `jobs.ts:138` | the driver's home feed | **YES** |
| `GET /jobs/:id` (driver auth) | `jobs.ts:198` | driver opening one job | **YES** |
| `GET /jobs?driverId=` (planner) | `jobs.ts:76` | **planner** viewing a driver | **NO** — planner sees all |
| `GET /drivers/:driverId/schedule` | `schedule.ts:31` | **planner/owner only** (`requireRole`) | **NO** — planner view |
| `POST /sync/events` auth | `sync.service.ts:101` | driver event write | **decision — D4.2** |
| `PATCH /jobs/:id/status` driver guard | `jobs.ts:379` | driver event write | **decision — D4.2** |

The planner surfaces (`q.driverId`, `/drivers/:id/schedule`) are role-gated to planner/owner and must keep seeing everything — the publish filter applies **only when the requester is the driver viewing their own work**.

---

## 2. Keep / Change / Delete

| File | Call | Why |
|---|---|---|
| `api/src/routes/jobs.ts` `GET /jobs` driver branch (`:65`) | **CHANGE** | add `publishedToDriver: true` to the `run:` filter. |
| `api/src/routes/jobs.ts` `GET /jobs/my` (`:138`) | **CHANGE** | same. |
| `api/src/routes/jobs.ts` `GET /jobs/:id` driver auth (`:198`) | **CHANGE** | same — a recalled/never-published job returns 403 "Not your job". |
| `api/src/routes/jobs.ts` `GET /jobs?driverId=` (`:76`) | **KEEP** | planner view — must see unpublished. |
| `api/src/routes/schedule.ts` (`:31`) | **KEEP** | planner/owner-only. |
| `runs.ts` / `planning.ts` publish + recall | **KEEP** | already write `publishedToDriver` correctly; recall = `publishedToDriver:false`. |
| `sync.service.ts` / `jobs.ts` write guards | **KEEP (recommended) — see D4.2** | leave writes ungated to protect offline-queued events. |
| Tests | **ADD** | `publish-gate.test.ts`: driver sees nothing for a draft run; publish → visible; recall → hidden again; planner `?driverId` still sees it. |

**Deletions: none. No schema change. No mobile change** (mobile already calls these endpoints; it simply receives fewer rows).

---

## 3. Decisions I need before coding

**D4.1 — Gate the three driver-own read feeds (recommended: yes).** Add `publishedToDriver: true` to `GET /jobs` (driver), `GET /jobs/my`, and `GET /jobs/:id` (driver auth). Planner feeds untouched.

**D4.2 — Gate driver *writes* too? (recommended: NO — reads only for Step 4).**
The audit gap is visibility (reads). Gating writes (`/sync/events` auth + `PATCH /jobs/:id/status` guard) on `publishedToDriver` would mean: if a planner recalls a run while the driver is offline with queued events, those events would be **rejected** and the driver's real work lost — conflicts with the offline-first guarantee (SAFETY §2). Recommendation: leave writes ungated in Step 4 (a driver who already has the run can still record what they did); publish/recall controls what NEW work appears. Alternative (stricter): also require `publishedToDriver` on writes — cleaner "recall blocks everything" semantics but risks dropping offline work; if chosen I'd pair it with queuing/needs-review rather than hard rejection (larger scope).

**D4.3 — Recalled-job direct access (recommended: 403, falls out of D4.1).** With the `GET /jobs/:id` filter, a driver opening a recalled job gets 403 "Not your job" — consistent with it vanishing from the list. Confirm this is the desired behaviour (vs. a softer "no longer assigned" message — a UI concern, out of scope here).

---

## 4. Risk / scope notes

- **No mobile release needed** — endpoints unchanged, just return fewer rows.
- **Interaction with Step 1–3:** none structural; this only narrows driver reads. Reconciler/custody unaffected.
- **Parked (not Step 4):** vehicle compatibility (S5), truck/trailer picker UI (S5), driver push notification on publish/recall (S14). Step 4 makes publish *meaningful*; *notifying* the driver is S14.
- **Exit gate (S4):** a driver assigned to a draft run sees nothing in `/jobs/my` and `GET /jobs`, and 403 on `GET /jobs/:id`; after publish, visible; after recall, hidden again; planner `?driverId` still sees the run throughout; typecheck/check:vocab/api-tests green (DB tests on Mac).

---

## 5. Recommendation

Proceed with **D4.1 = yes (gate the three driver-own reads); D4.2 = reads-only (leave writes ungated to protect offline work); D4.3 = 403 on recalled direct access**. Smallest change that makes publish/recall real without endangering offline-first. Awaiting review before writing any code.
