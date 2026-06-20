# LogisticBay — Status & Release Readiness

> **Keep this file accurate.** After every session that adds, changes, or removes a feature,
> update the relevant section. Three tiers: ✅ Done · 🔶 Partial · 🔲 Not started.
> For the release checklist (P0/P1/P2), update checkbox status when tasks are completed.
> Last updated: 2026-06-07 (Load-movement build started — see LOAD_MOVEMENT_PLAN.md)

---

## Load-movement build progress (LOAD_MOVEMENT_PLAN.md)

Gated 16-step build of the full load lifecycle. Per-step detail + gates live in LOAD_MOVEMENT_PLAN.md and DEVLOG.md.

- ✅ **Step 0 — vocabulary registries** (2026-06-07): `loadVocab.ts` added byte-identical across shared/api/web (+mobile soft); `check-vocab` group-aware and passing; DATA_DICTIONARY custody/transaction fields now enum. Foundation only — no runtime behaviour changed, nothing imports it yet. Gates: typecheck ✅, check:vocab ✅, api tests ✅ 83/83, knip shows only expected loadVocab mirror false-positives + existing baseline noise (not cleaned, by decision).
- ✅ **Step 1 — status bridge** (2026-06-07): driver events now advance `RunAssignment.status` over `EXECUTION_STATES` instead of `Job.status`; a `planned` job is driver-startable (🔴 audit blocker resolved). Migration `..._run_assignment_execution_state_default`. Gates: typecheck ✅, check:vocab ✅, api tests ✅ 82/82 incl. keystone planned-job chain test. Job.status left to the Step 3 reconciler by design (D1=A).
- ✅ **Step 2 — LoadTrack write path** (2026-06-07): `collected`/`completed` events append append-only custody rows (collect customer_origin→on_vehicle, deliver on_vehicle→customer_dest) via `appendLoadTrack`; stop-aware, quantity threaded, invariant-3 guarded; `plannerWorkService` reader now base-aware. Gates: typecheck ✅, check:vocab ✅, api tests ✅ 91/91. No schema/mobile change.
- ✅ **Step 3 — reconciler** (2026-06-07): `reconcileLoadState` derives `Job.status` (in_execution/partially_collected/collected/partially_delivered/completed; dormant attention_needed) and `Run.status` rollups (+ actualStartTime/actualEndTime) from execution state + custody. Called at end of `applyJobEvent` (same tx) + nightly `reconcileWorker`. Ends the D1=A freeze; delivered B1 auto-completes. Gates: typecheck ✅, check:vocab ✅, api tests ✅ 95/95. Fixes audit 🟠 #4.
- ✅ **Step 4 — publish gate** (2026-06-07): driver-own reads (`GET /jobs`, `/jobs/my`, `GET /jobs/:id`) filter `publishedToDriver: true`; recalled/unpublished → hidden + 403. Writes left ungated (offline-first). Planner views unaffected. Gates: typecheck ✅, check:vocab ✅, api tests ✅ 107/107. Fixes audit 🟠 #1.
- ✅ **Step 5 — vehicle assignment + real compatibility** (2026-06-07): `runCompatibility` helper computes `trailerCompatible`/`vehicleCompatible` (reused rules); FK validation on truck/trailer assign (both run systems); planning publish now enforces compat with override; planning UI warning. Gates: typecheck ✅, check:vocab ✅, pure units ✅ 7/7, knip ✅ (full DB suite re-run recommended — interrupted). Fixes audit 🟠 #2, #3.
- 🔶 **Step 6 — yard buffer** (2026-06-07): `drop_at_yard`/`pick_from_yard` events + custody + custody-aware reconciler (B2 relay). Implemented; sandbox gates green; **full DB suite + knip re-run pending** to record green.

**Re-plan 2026-06-07 (see LOAD_MOVEMENT_PLAN.md Part E):** remaining work (old S7–S16) re-organised into **three screens, delivered vertically Planning → Runs → Live**.

- 🔶 **Phase A — Planning screen** (jobs → runs): A1 ✅ + A2 ✅ — **Mac gate confirmed 2026-06-20** (full api DB suite passes; knip baseline-only). A1 = structural refactor + horizontal ops nav (+ mobile hamburger). A2 = three questions (confidence+buffer, stop-mixing compatibility, detour/empty-miles; four advisory run-lane signals, no "AI" copy). UI incognito smoke optional. Remaining: A3 proposals, A4 split/consolidation, A5 metrics capture. ← active
- 🔲 **Phase B — Runs screen** (asset allocation): trailer swap (S7) + handover (S8) + canonical truck/trailer/driver allocation UI.
- 🔲 **Phase C — Live management screen** (firefighting): exceptions (S11), reassign/cancel (S12), dependency enforce (S13), notifications (S14), monitoring (S15).
- ⏳ Follow-ups: set `planned` when all stops assigned (D3.2); per-vehicle payload field + double-booking guard (D5.4/D5.5).
- ⏳ Follow-up (deferred from S3, D3.2): set `planned` when all stops assigned (planning-tier change to `syncJobPlanningStatuses`).

---

## Live URLs

| Service | URL |
|---------|-----|
| API | https://api-production-cdc9.up.railway.app |
| Web | https://logisticbay.com / https://logisticbay.vercel.app |
| Railway | https://railway.app/project/5b039bc6-fef3-4aa6-b423-1e1088aaa94b |
| Mobile (iOS/Android) | Expo — separate repo: https://github.com/Q25ltd/logisticbay-mobile |
| Web + API repo | https://github.com/Q25ltd/logisticbay |

---

## Stack

- **API** `api/` — Fastify + Prisma + PostgreSQL (Railway)
- **Web** `web/` — React + Vite + Tailwind
- **Mobile** `mobile/` — Expo SDK 54 (React Native)

---

## ✅ FULLY DONE — production-ready

### Auth
- Multi-company login with company picker (one user, multiple companies)
- JWT access + refresh tokens with rotation and reuse detection
- Login lockout: 5 bad attempts → 15-min lock, generic error (never leaks state)
- Password reset (company_owner only): SHA-256 token, 1h TTL, revokes all sessions
- Email verification on registration: `status=pending` → email → `status=trial`
- **Email currently disabled** — `EMAIL_ENABLED = !!SENDGRID_API_KEY`. When key is added to Railway the full flow activates automatically. See `DEVLOG.md` for re-enable steps.
- Agency driver linking (one user, multiple `CompanyMembership` rows)

### Company & users
- Register company, PATCH company settings
- Driver CRUD (add / edit / deactivate) with `DriverProfile` (min hours, pay rate, holiday allowance)
- Customer CRUD (name, contact, notes — all nullable `String?`)
- Saved locations CRUD

### Fleet
- Fleet units (trucks/rigids/vans) — CRUD with status, category, GVW, reg
- Trailers — CRUD with body type, length, status
- Run model stores `assignedTruckId` + `assignedTrailerId` (FK to FleetUnit / FleetTrailer)

### Job templates
- CRUD for planner-managed job templates (`JobTemplate`)
- Default stops, material type, vehicle requirements stored as JSON blobs
- Templates available in Create Job Page (CJP) via search/apply

### Job intake
- **Create Job Page (CJP)** — full 6-section form, all fields persisted to `Job` + `JobPart`
  - Section 1: customer, contact, planned date
  - Section 2: stops (SharedStopCard — collection + delivery)
  - Section 3: load details (goods type, weight, qty, load sub-type blobs)
    - Multi-type pallet repeater (type + count + custom dims per line, backward-compat restore)
    - 25+ progressively-disclosed fields: waste (EWC/TRN), container extras (ISO type, terminal, cut-off, seal), food compliance (HACCP, clean vehicle, allergen-free, temp logger), ADR extended (proper shipping name, subsidiary risk, flash point, EMS code, emergency contact), STGO / abnormal load (category, movement order), cross-border/customs (EORI, HS code, incoterms, crossing booking), subcontracting, driver qualifications — all hidden until relevant goods type or international route triggers
  - Section 4: special requirements (ADR, oversized, fragile, high-value, etc.)
  - Section 5: vehicle requirements (category, body types, equipment, trailers)
    - Artic / drawbar / heavy haulage: trailer types grouped by category (General, Flat, Tanker, Temp, Skeletal, Heavy haulage) with proper labels
  - Section 6: billing (declared value, PO number, billing ref)
  - Edit mode (restore from existing Job), template apply mode
  - Required-field red highlighting on save attempt (all 6 sections + stops)
  - `saveMode`: draft | ready_to_plan — controls both validation strictness AND `Job.status` written on create/patch
- **Public Request Form (PRF)** — `/request/:token`
  - Full identical field set to CJP — same Zod schema, same DB columns (PRF/CJP twin kept in sync)
  - LogisticBay "Powered by" branding badge (header, success, error screens)
  - Required-field red highlighting + per-stop missing field list
  - `status = pending_review` on submit
- **Validation gates** in `validateStructuredJob` (enforced for `ready_to_plan`):
  - Vehicle type required before job moves to ready-to-plan (all paths)
  - ADR completeness: hazard class requires UN number + packing group (from `loadData`)
  - Booking reference: `bookingRequired=true` stop requires `bookingRef`
  - Time window sanity: within-stop end ≥ start; cross-stop collection-end vs delivery-start overlap warning
  - Temperature-controlled trailer: `tempControlled` load with non-fridge trailer types → error
  - Weight vs payload: declared weight vs approximate vehicle max payload → warning
  - Cancellation cascade: cancelling a job in active run assignments returns run IDs + warning
  - Accept flow (`POST /job-requests/:id/accept`) now runs full `validateStructuredJob` before accepting
- **Planning intelligence** (route checks, vehicle suggestion, load checks — all rule-based, no AI cost):
  - `POST /ai/suggest-vehicle` — weight/goods decision tree → vehicle category + body type from fleet
  - `POST /ai/check-vehicle-load` — payload capacity + fridge/ADR/livestock body rules
  - `POST /ai/check-run` — ORS HGV routing + legal hours + break rule + time window checks (deterministic)
  - `POST /ai/suggest-run-trailer` — pattern-match available trailers by temp/ADR/general needs
  - `GET /ai/status` — returns `{ enabled: boolean }` for `parse-request` feature gate
- **AI-assisted job creation** (requires `ANTHROPIC_API_KEY`, model: `claude-haiku-4-5` — only remaining AI call):
  - `POST /ai/parse-request` — paste email/WhatsApp/note → structured job data → pre-fills CJP form
  - Customer name auto-matched against database; contact fields filled from stored account
  - CJP Section 5 shows violet "AI vehicle suggestion" panel — planner can accept or dismiss
  - AI panel hidden in edit mode and not present on PRF (planner-only feature)

### Client request links
- Main link: one auto-created permanent link per company (for website / social)
- Personalised links: unlimited per company
- Raw token stored → link URL always re-copyable (no "copy only once" restriction)
- Regenerate endpoint (`POST /request-links/:id/regenerate`)
- Activate / deactivate toggle

### Job review (PRF intake pipeline)
- `GET /job-requests` — list `pending_review` jobs
- `POST /job-requests/:id/accept` — sets `plannedDate` + `plannerNotes` → `ready_to_plan`
- `POST /job-requests/:id/reject` → `cancelled` with audit entry
- Web: `JobRequestsPage` — full review UI with accept/reject drawers

### Job management (web planner)
- `JobsPage` — list with status filter, search, pagination
- `JobDetailPage` — full job detail view including all loadData blob fields (waste, container extras, food compliance, ADR extended, STGO, cross-border, driver qualifications — each rendered as labelled sub-sections; palletLines rendered as readable summary)
- `CreateJobPage` — create + edit mode
- Job status updates via PATCH
- Planner notes, internal notes
- Vehicle panel: grouped trailer-type picker for artic/drawbar/heavy haulage with proper labels

### Runs & planning
- `Run` model: date, driver, truck, trailer, status, publish flag, end instructions
- `RunAssignment` model: links `JobPart` to a `Run` with sequence number, quantities, custody
- API: full CRUD, publish (`POST /runs/:id/publish`), assignments CRUD, resequence
- Web `RunsPage` — list runs by date, status filter, create new run modal
- Web `RunDetailPage` — assignment management (add/remove job stops, resequence)
- `DashboardPage` — today's runs overview by status, driver names, assignment counts

### Mobile (driver app)
- Login, multi-company picker, Face ID / biometric unlock, Change PIN
- Home screen: jobs preview, My Shifts, Holidays
- Start shift: vehicle setup, truck/trailer selection, checklist
- Jobs screen: Today / Upcoming tabs, view-only without active shift
- Job detail: full collection → delivery execution flow
  - Collect: confirm qty, site check-in
  - Deliver: confirm qty, POD (signature / photo / pod number / timestamp)
  - Per-job POD requirements enforced
- Change vehicle mid-shift
- End segment, End shift, Review screen, Submit shift
- History screen, Shift detail
- Holiday requests
- **Offline-first**: events queued in AsyncStorage, auto-synced on reconnect
- Idempotent sync via `clientEventId` — no duplicate events
- GPS + `clientTimestamp` attached to every execution event
- Offline/sync status banner with retry UI

### Shifts & availability (web)
- `ShiftsPage` — basic list view (driver, date, hours, status)
- Driver availability: weekly plan, shift preferences
- Holiday requests: submit, approve/reject, allowance tracking
- Working time compliance: 60h max, 48h average warning, 11h rest check

---

## 🔶 PARTIALLY DONE — works but has gaps

| Area | What works | What's missing |
|------|-----------|----------------|
| **Jobs list (web)** | List, filter by status, search | Filter by date range, customer filter |
| **Job detail (web)** | All fields displayed | POD viewer, audit log display, stop-level execution status |
| **Run detail (web)** | Add/remove assignments, resequence | Truck/trailer picker UI (schema supports it, UI doesn't wire it), live status from mobile |
| **Planning dashboard** | Today's runs, driver names | "Ready to plan" jobs backlog panel, drag-to-assign |
| **Driver profiles (web)** | CRUD — name, pay rate, min hours, `workPattern` (day_driver/night_driver/tramper), `basePostcode` (auto-geocoded to `baseLat`/`baseLng` via postcodes.io), work pattern badge display in driver list | Availability board (see all drivers week view), working time compliance display |
| **Shifts (web)** | Basic list | Full shift detail with PDF, delivery task breakdown |
| **LoadTrack** | Schema + model fully defined | No write path from mobile or API yet — custody chain not recorded |
| **Job audit log** | `JobAudit` rows written on accept/reject | No viewer in web planner UI |
| **Fleet ↔ Run linkage** | Schema has `assignedTruckId` / `assignedTrailerId` | Run creation UI does not yet offer truck/trailer picker |
| **Job status guards** | PATCH /jobs/:id/status exists; `applyJobEvent` shared state machine; `clientEventId` required; cancel blocked on normal path | Role-based edit restrictions post-assignment; planner override endpoint (TASK 3.8) |
| **API code quality** | Phase 2 cleanup complete — event definitions single source, GPS/timestamp helpers, shared state machine, cancelRun service, parseIdParam/dayRangeUtc/TxClient | Phase 3 bug fixes; error envelope standardisation (TASK 3.7 in progress) |

---

## 🔲 NOT STARTED — future phases

### Planning board
Full spec in **PLANNING_BOARD.md**. Three phases.

**Phase 1 — Planning board (Types 1, 2, 3)** — BUILT 2026-05-24, updated 2026-05-24
- [x] 1.1  Schema: `runType` + `dependsOnRunId` (self-ref FK) on Run — migration applied
- [x] 1.2  API: `/planning/unplanned` — haversine 5km clustering with postcode fallback; stop-date filtering (timeWindowStart → bookedTime → job.plannedDate cascade)
- [x] 1.3  Page: `/app/planning` — date navigation, two-panel layout (nav item added)
- [x] 1.4  Left panel: ClusterCard — expandable stop list, per-stop run selector, same-job companion-stop indicators, cross-date labels
- [x] 1.5  Right panel: RunCard — stops list, inline add/remove, stop-order warning
- [~] 1.6  Trailer assignment on run card — **CHANGED: now optional** (plan said required). Decision: real-world planning often doesn't know trailer upfront. API enforcement removed; red warning removed. Trailer can be assigned later.
- [x] 1.7  Driver assignment on run card (optional)
- [~] 1.8  Run dependency locking — UI badge shows "🔒 Waiting on RUN-X"; `dependsOnRunId` stored and shown. **API does not enforce lock** (does not block publish if dependency isn't complete). Full enforcement not yet built.
- [ ] 1.9  Split load UI — assign quantity per run, balance check
- [~] 1.10 AI validation — route feasibility check (`POST /ai/check-run`): haversine distances, HGV drive time, time window assessment. **Only route feasibility built.** Spec also lists: ADR on wrong trailer, temp load on non-fridge, weight vs capacity, split-load balance — these are NOT done.
- [x] 1.11 "Suggest all runs" button — job-aware grouping (all stops from same job stay together), one run per cluster, AI vehicle suggestion per run
- [ ] 1.12 Job progress update — job status derived from RunAssignment completion
- [~] 1.13 Publish run → status set to "assigned", `publishedToDriver = true`. **No push notification to driver yet** (plan said driver gets notified). Trailer enforcement removed (see 1.6).

**Planning board extras — 2026-05-27:**
- [x] AI route feasibility (`checkRunService`) → replaced with deterministic rules (ORS routing kept, Claude call removed — zero AI cost per stop change)
- [x] `suggestVehicle` + `suggestTrailerForRun` + `checkLoadVehicle` → all rule-based (weight table, body type matching, fleet filter)

**Planning board extras built outside spec (2026-05-24):**
- [x] Multi-day job support — unplanned filter uses stop's own `timeWindowStart` date not job date; cross-date labels on stops; companion-stop pairing indicators across clusters
- [x] `RunWaypoint` model + `POST/DELETE /planning/runs/:id/waypoints` — depot start, yard pickup, hub drop, return-to-base, custom waypoints on run card; `sequenceNumber` positions them in run order. Schema migration `20260524130000_add_run_waypoints` applied.
- [x] AI route feasibility check (replaces load/vehicle check) — `POST /ai/check-run` with haversine leg distances, HGV speed estimate, time window compliance; `checkRunService.ts`

**Planning board UX redesign — Phase 1 (2026-05-27):**
- [x] Job colour coding — auto-assigned from 10-colour palette via `getJobColour(jobId % 10)`. Left border on every stop card in run lane. Same job = same colour across collect + deliver stops. No DB column needed.
- [x] Stop card redesign — full customer name (no truncation), postcode + address on second line, time window (start–end), weight + quantity on third line, cargo state pill in same row. X button always visible (was hidden until hover).
- [x] Publish gate — button disabled + replaced with "Assign a driver to publish" message when no driver selected. Was previously active with `-- assign --`.
- [x] Recall run — "↩ Recall run" button shown when run is ASSIGNED/published. Sets `status: draft, publishedToDriver: false` via existing PATCH endpoint. Driver notification is a stub (Phase 4).
- [x] Active filter shows ✕ inline on active sidebar button. Clicking deactivates. "Clear filters" link removed (redundant).
- [x] AI analysis block replaced with compact scannable format — severity dot + one-line summary always visible, full text on hover/expand (title attribute for now).

**Planning board extras built 2026-05-26:**
- [x] Nearest-neighbour route optimise bug fix — `??` operator precedence corrected so distances are measured from the previous stop, not from a fixed origin point
- [x] Date badge on wrong-day stops in run lane — neutral slate badge when stop's `timeWindowStart` date ≠ run's `plannedDate`
- [x] Relay run support — per-part drag in JobWorkCard; "Collect →" / "Deliver →" individual buttons; relay hint text explaining yard stop workflow
- [x] Cargo state badges on run lane stop rows — ⏳ Not collected / 🚛 At drop-off / ✅ Collected / ✅ Delivered; driven by `Job.status` returned in `RUN_INCLUDE`
- [x] `Job.status` exposed in `RUN_INCLUDE` (API) and `PlanningAssignment.jobPart.job` (frontend type)
- [x] `PlannerWorkItem.postcodeDistrict` — UK outward code (e.g. `LS27`, `M1`) extracted from stop's own postcode; added to service, API type, and `DATA_DICTIONARY.md`
- [x] Sidebar "By direction" replaced with "By area" — shows specific postcode districts with job counts; clicking filters the jobs panel to that district only
- [x] `PlanningDriver.nightsOutAllowed` exposed from `DriverProfile` — driver dropdown in run lane shows 🌙 suffix for trampers
- [x] Day driver multi-day warning — banner in run lane when a day driver (`nightsOutAllowed = false`) is assigned to a run whose stops span multiple calendar dates
- [x] `overnight_rest` waypoint type added — appears in the waypoint type selector (alongside yard_pickup, hub_drop) for mid-route stops; renders as "Overnight rest" label on the run card

**Planning board extras built 2026-05-28 (sessions 2026-05-28a + 2026-05-28b):**
- [x] Jobs panel date-based grouping — left panel now groups jobs by collection date (Mon 28 May, Tue 29 May…) instead of old vehicle-type/direction groups. Needs attention + In custody stay as priority buckets at top. Cards sorted within each date group by collection time → postcode → goods type.
- [x] **Multi-day job splitting** — jobs panel now places each job part under its OWN date. A Monday-collect / Wednesday-deliver job shows a "Collect" card under Monday AND a "Deliver" card under Wednesday. Same-day collect+deliver stays as one card. Drag/drop is date-scope-aware: card drag now sets `application/job-part-ids` (comma-separated IDs for the card's visible parts only); drop handler priority: single-part → multi-part card → legacy full-job. New `handleAddPartsToRun` parent handler.
- [x] `POST /planning/runs/:id/overnight-rest` API endpoint — auto-creates a relay delivery run when driver rests overnight at a roadside location. Same driver + trailer, depot_start waypoint at rest location, estimatedStartTime = shiftEndIso + restHours (DVLA 11h standard or 9h reduced per EC 561/2006), delivery assignments optionally moved from source run, dependsOnRunId links back to source run.
- [x] "🌙 Overnight run" button in run lane action bar — inline form with rest location, postcode (auto-geocodes), shift end datetime, DVLA rest hours selector, move-deliveries toggle, calculated start time preview.
- [x] Planned date removed from all planner-facing forms — CJP, job requests accept drawer, jobs list, job detail page, job detail drawer. Date is now auto-derived from the first collection stop's `timeWindowStart`.
- [x] All API date filters migrated from `plannedDate` to stop `timeWindowStart` — `GET /jobs`, `GET /jobs/my`, `GET /dashboard`, `GET /drivers/:id/schedule`, `POST /job-requests/:id/accept`.

**Planning board extras built 2026-05-27 (session 2026-05-27e/f):**
- [x] `RunStatusBadge` component — single priority-based pill replacing the old dual ASSIGNED + SENT badge pair. Logic: Done → In progress → Cancelled → 📤 Sent → Assigned → Draft. Eliminates contradictory states (e.g. ASSIGNED + SENT + no driver).
- [x] Auto-sync run status on driver assign/remove — assigning a driver to a Draft run promotes it to Assigned; removing the driver from an Assigned run demotes it back to Draft. Happens inline in the PATCH call, no extra step.
- [x] Planned date label in run lane header — run's `plannedDate` shown next to `RunStatusBadge` so planners can see the date without opening the run.
- [x] Manual drag-and-drop stop reorder — ⠿ drag handle on each stop row in a run lane; blue drop-line indicator; dragged card fades. Intra-lane drag uses `application/run-assignment` MIME type (does not conflict with inter-lane `application/job-id` / `application/job-part-id` drags). Fires `PATCH /planning/runs/:id/assignments/reorder`.
- [x] `PATCH /planning/runs/:id/assignments/reorder` API endpoint — accepts `{ assignmentIds: number[] }` in desired order; renumbers sequence to 1000/2000/3000… preserving depot_start (seq=0) and return_to_base (seq=999999) waypoints.
- [x] Work pattern icon in driver dropdown — driver select in run lane shows 🚛 (tramper), 🌙 (night driver), or ☀ (day driver) next to each driver's name for quick identification.

**Planning board UX redesign — Phase 2 (not started):**
- [ ] Stop hover tooltip — full address, contact, items list, job ref without leaving planning board
- [ ] Cargo state query — `getCargoStateForDeliveryStop()` returning one of 5 states (no_collection_run → collected)
- [ ] Cargo state badge on delivery stops — shows which run collected the cargo + link to that run
- [ ] Yard pickup auto-suggest — when cargo state = `in_custody_yard`, show "Add yard pickup stop" with calculated collect-by time
- [ ] `LoadTrack` custody fields — `custodyType`, `custodyLabel`, `custodyPostcode`, `custodyLat/Lng`, `swapType`, `custodyAt`
- [ ] One-time swap locations — stored inline on `LoadTrack` event, never saved to Locations table

**Planning board UX redesign — Phase 3 (not started):**
- [ ] `PlanningSettings` model — configurable dwell times per swap type, yard start overhead, tramper wake time, break buffer
- [ ] Auto-insert yard pickup waypoint when `hub_drop` fires and delivery run exists
- [ ] Swap coordination check — simultaneous presence overlap for `trailer_swap` / `live_load`
- [ ] Day driver publish gate — block (not just warn) when day driver assigned to multi-day run

**Planning board UX redesign — Phase 4 (not started):**
- [ ] `DriverGpsEvent` model — 15-min GPS pings, 48h retention, then delete
- [ ] `DriverBreakEvent` model — break confirmations + escalations, 90-day retention
- [ ] GPS break detection — stationary detection via 200m threshold between consecutive pings
- [ ] Driver hours self-report popup — after major button presses (collected, delivered)
- [ ] Delay cause capture — optional tap after long dwell; defends drivers against unfair blame
- [ ] Break warning notification — push to driver when stationary, escalate to planner if no response
- [ ] Recall driver notification — push to driver when run recalled/cancelled

**Phase 2 — Depot operations (Type 4)**
- [ ] 2.1  LoadTrack write path (API: POST /load-track)
- [ ] 2.2  Depot buffer panel — confirmed loads vs expected
- [ ] 2.3  Depot sort event — assign collected loads to delivery runs
- [ ] 2.4  Delivery run locked until collection runs complete
- [ ] 2.5  Load availability check when building delivery runs

**Phase 3 — Live monitoring + reassignment (Type 5)**
- [ ] 3.1  Live run status board (GPS positions, run progress)
- [ ] 3.2  Collection reassignment UI
- [ ] 3.3  Trailer swap event UI + API
- [ ] 3.4  Run handover flow (Driver A → Driver B with load)
- [ ] 3.5  AI late-run detection (background agent, planner alerts)
- [ ] 3.6  Driver no-show alert

### Load movement & execution (next priority area)
- Handover / relay confirmation flow (driver B accepts load from driver A)
- Breakdown event type + workflow
- Incident / RTA event type
- Damage report at collection or delivery
- Customer refusal workflow
- Stop reorder by driver (decision needed — see QUESTIONS.md Operations section)
- Partial collection approval flow (driver vs planner decision)
- Live ETA calculation from GPS events
- Live driver location feed on planner dashboard

### Notifications
- Driver receives alert when run is published
- Driver receives alert when run is modified mid-execution
- Planner receives alert when driver reports delay
- Customer receives alert when delivery is complete (optional)

### Reporting & documents
- POD viewer — web page showing proof items per delivery
- Shift PDF (built in API, no web UI to download it)
- Job-level PDF / delivery note
- Customer delivery report

### Customer portal
- Email OTP or account login for customers
- Customer can view job status
- Customer can access their POD
- Customer-side saved templates (needs identity first)

### Platform — future phases
- Intelligence page (AI route suggestions, anomaly detection) — stub only
- Marketplace (load posting / subcontracting) — stub only
- MFA for planner / owner accounts
- Admin panel: owner resets driver / planner passwords (no email needed)
- Resend-verification endpoint (currently no way to resend if email lost)
- Night out allowance amount — fixed or per-company config (not in schema yet)
- Vehicle / driver overlap guard at run publish time (architecture decided, not coded)
- Maximum discrepancy threshold before escalation (field exists, no threshold logic)

---

## Schema models (current)

```
Company, Customer, User, CompanyMembership, DriverProfile
PasswordResetToken, EmailVerificationToken, RefreshToken
SavedLocation, JobTemplate
Job, JobPart, JobAudit, JobExecutionEvent
Run, RunAssignment, RunWaypoint, LoadTrack
SyncEventLog
Shift, ShiftSegment, DeliveryTask
DriverAvailability, ShiftPreference, HolidayRequest, DriverWorkingTimeSummary
FleetUnit, FleetTrailer
AuditLog
ClientRequestLink
```

---

## Release readiness checklist

The P0 items are blockers before taking a first paying customer.
Status: `[ ]` open · `[~]` in progress · `[x]` done

### P0 — BLOCKERS

- [ ] **P0.1** — Stand up a staging environment (separate Railway + Vercel project, separate DB and secrets, document URLs + promotion flow)
- [ ] **P0.2** — Wire Sentry on api, web, mobile (`@sentry/node`, `@sentry/react`, `@sentry/react-native`, PII scrubber on all three)
- [ ] **P0.3** — Test database backup/restore (restore latest snapshot to throwaway DB, row-count comparison, add `docs/runbooks/restore.md`)
- [x] **P0.4** — Remove `JWT_SECRET` fallback; fail fast on missing secrets (`api/src/lib/env.ts`, confirmed `JWT_ACCESS_SECRET ≠ JWT_REFRESH_SECRET` at boot)
- [x] **P0.5** — Shorten access tokens, rotate + persist refresh tokens (`RefreshToken` model, rotation, reuse detection, `/auth/logout` endpoint)
- [x] **P0.6** — Tenant-isolation test on every route + CI gate (26 subtests, `.github/workflows/ci.yml`)
- [ ] **P0.7** — Mobile logout must respect SAFETY §2 (block logout if unsynced events, confirm dialog, audit event on force sign-out)
- [x] **P0.8** — Rate-limit `/auth/register-company`, `/auth/refresh`, `/auth/change-password`
- [ ] **P0.9** — Per-user lockout on failed logins (`LoginAttempt` model or Redis, 5 failures / 15 min → lock 15 min)
- [ ] **P0.10** — Enforce `mustChangePin` server-side (middleware rejects all routes except change-password / me / logout)
- [ ] **P0.11** — Idempotency on every write endpoint (`IdempotencyKey` model, `Idempotency-Key` header, TTL 24h)
- [ ] **P0.12** — Per-tenant rate limiting (keyGenerator using companyId)
- [ ] **P0.13** — Reconciliation surface for `needsReview` events (GET endpoint + web planner page)
- [ ] **P0.14** — Job status reconciler from event log (`lib/jobStatusReconciler.ts`, nightly background job)
- [ ] **P0.15** — Audit-log coverage on all sensitive writes (job, shift, fleet, customer, company, auth events)
- [ ] **P0.16** — Documented + rehearsed rollback runbook (`docs/runbooks/rollback.md`, tested on staging)
- [ ] **P0.17** — Rotate any secret that has ever appeared in chat/commits (Postgres password, JWT secrets, SendGrid key)
- [ ] **P0.18** — `/health` returns real signals (p95 latency, failed-sync count, needsReview count, memory, event-loop lag)
- [ ] **P0.19** — System-state banner + DEGRADED/INCIDENT toggle (`Company.systemState`, `GET /system-state`, web + mobile banner)

### P1 — STRONG RECOMMENDATIONS (before scaling beyond design partners)

- [ ] P1.1 — Postgres Row-Level Security (defence in depth)
- [ ] P1.2 — Repository pattern enforcing companyId
- [ ] P1.3 — Cursor pagination + filters on remaining list endpoints (drivers, customers, locations, templates, etc.)
- [ ] P1.4 — Tenant-scoped search architecture (trigram indexes)
- [ ] P1.5 — Real-device offline acceptance test (12-step test from DEVLOG.md on TestFlight build)
- [ ] P1.6 — Drop unused legacy columns (`trailerTypesForbidden`, `vehicleClassLegacy`)
- [ ] P1.7 — Remove dead code (`api/src/auth.ts`, `mobile/src/components.legacy.tsx`, unify bcrypt library)
- [ ] P1.8 — Fix `updateMany` in shifts.ts to include companyId
- [ ] P1.9 — `/jobs/:id/status` should delegate to shared `applyJobEvent()` function
- [ ] P1.10 — MFA for company_owner and planner roles
- [ ] P1.11 — Email verification on register-company (`Company.status = pending` until email confirmed)
- [ ] P1.12 — Webhook / outbox for downstream integrations
- [ ] P1.13 — Background job runner per tenant (BullMQ or pg-boss)

### P2 — POLISH

- [ ] P2.1 — Stronger PIN policy (reject 000000, 111111, sequential, date-shaped)
- [ ] P2.2 — Standardise error response envelope (`{ error: code, message, details? }`)
- [ ] P2.3 — Type Prisma errors (replace `as any` casts)
- [ ] P2.4 — Prune stale worktrees (`.claude/worktrees/*`)
- [ ] P2.5 — CSP, HSTS, X-Content-Type-Options on web (Vercel `vercel.json` headers block)
- [ ] P2.6 — API versioning prefix (`/v1/...`, `X-App-Version` deprecation header)
