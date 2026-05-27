# LogisticBay — Developer Log

> Historical record of every session: what was built, what was decided, what is still outstanding.
> Read this to understand the WHY behind past decisions and avoid re-debating closed questions.
> Do NOT rewrite history — only append. New entries go at the TOP.
> Last updated: 2026-05-27

---

## Session log — 2026-05-27e

### Planning board UI fixes — contradictory status badges

**Commit:** `57ab5f2`

**Problems identified from screenshot analysis:**
1. A run showed both "ASSIGNED" (blue) and "📤 SENT" (purple) badges simultaneously while the driver dropdown said "no driver assigned" — three contradictory signals at once.
2. The dual badge layout (StatusBadge + separate Sent badge) made it look like two independent statuses existed, unclear which was authoritative.
3. A run's planned date wasn't visible in the lane header.

**Fixes:**
- Added `RunStatusBadge` component that merges `run.status` + `run.publishedToDriver` into one coherent pill:
  - `completed` → ✓ Done (green)
  - `in_progress` → In progress (amber)
  - `publishedToDriver = true` → 📤 Sent (violet) — overrides "Assigned"
  - `assigned` (not sent) → Assigned (blue)
  - `draft` → Draft (grey)
- Driver select `onChange` now auto-syncs run status: assigning a driver promotes `draft → assigned`, removing a driver reverts `assigned → draft`. This prevents the "ASSIGNED but no driver" contradiction from occurring in future.
- Run's planned date ("27 May") now shown in the lane header as a subtle grey label.

**No schema or API changes.**

---

## Session log — 2026-05-27d

### Fix P1 field name inconsistency: JobPart temperature fields

**Commits:** (this session)

**Problem:** `Job` used `tempControlled` / `tempRange`. `JobPart` used `temperatureControlled` / `temperatureRange`. Same concept, two names. The read in `plannerWorkService.ts` had `part.temperatureControlled || job.tempControlled` — the `part` side was correct but the `job` side was using a different name. `buildStopData` wasn't writing the field at all (never set on stop create), so JobParts always had `temperatureControlled = false`.

**Fix:**
- Schema: renamed `JobPart.temperatureControlled` → `tempControlled`, `JobPart.temperatureRange` → `tempRange`
- Migration: `20260527000000_rename_jobpart_temperature_fields` (two `RENAME COLUMN` statements)
- API reads fixed: `runs.ts`, `planning.ts`, `plannerWorkService.ts`
- Test mock fixed: `plannerWorkService.test.ts`
- `StructuredJobPartInput` in `jobValidation.ts`: added `tempControlled`, `tempRange`, `stopGoodsType`, `stopWeight`, `hazardous`, `hazardClass`, `oversized` (were all missing — stops were being created without these fields)
- `buildStopData` in `jobUtils.ts`: now writes all those fields to JobPart on create
- Web `JobPart` interface in `types/index.ts`: added same stop-level load flag fields
- DATA_DICTIONARY.md: fixed field names in JobPart section, removed inconsistency warning
- QUESTIONS.md 0a: marked as resolved

**TypeScript check:** both API and web pass clean.

---

## Session log — 2026-05-27c

### DATA_DICTIONARY.md — full system audit and cleanup

**Context:** Full audit of `api/prisma/schema.prisma` vs `DATA_DICTIONARY.md` found ~20 distinct discrepancies. The dictionary was documenting a model that was renamed, a table that no longer exists, and field names that had been updated without updating the dictionary.

**Changes made to DATA_DICTIONARY.md:**

1. **Model rename**: All `PlannedJob` references renamed to `Job` throughout. Added backward-compat note: `web/src/types/index.ts` exports `PlannedJob = Job` for backward compat — new code must use `Job`.

2. **LoadDetails removed**: `LoadDetails` table does not exist in the schema. Its fields were merged into `Job` directly. Section replaced with a clear "REMOVED — merged into Job" tombstone with a complete field mapping (e.g. `LoadDetails.materialType` → `Job.goodsDescription`).

3. **Job field names corrected** (critical — wrong names in old dictionary):
   - `reqBodyCategory` → `vehicleCategory`
   - `reqBodyType` → `bodyTypes` (Json array, not String)
   - `reqGvwMin` → `minGvwClass`
   - `reqEquipment` → `equipment`
   - `trailerTypesAllowed` → `trailersAllowed` (on `Job` only — DriverProfile still uses `trailerTypesAllowed`)

4. **Job fields updated**: Removed stale fields that don't exist in schema (`reqLicenceClass`, `minVehicleSize`, `vehicleRequirementSource`, `trailerRequirementSource`, `derivedVehicleType`, `finalVehicleType`, etc.). Added missing fields: `parentJobId`, `tunnelCode`, all load fields (`goodsType`, `goodsDescription`, `quantity`, `weight`, `tempControlled`, `hazardClass`, etc.), all exception policy fields as direct columns. Fixed status values: now shows all 8 values including `pending_review`, `ready_to_plan`, `in_planning`, `planned`.

5. **Blob sections updated**: `Job.notesData`, `Job.exceptionPolicyData`, `Job.billingData` blobs no longer exist — these are now direct columns on `Job`. Sections updated accordingly. `Job.loadData` still exists for type-specific sub-details.

6. **Company**: Added `type` (`carrier` | `sender` | `both`) and `depotLocationId` (FK → SavedLocation).

7. **User**: Added `failedLoginAttempts` (Int) and `lockedUntil` (DateTime?) — used for login lockout.

8. **SavedLocation**: Fixed nullable status — most text fields are `String?` in schema, not required `String @default("")`.

9. **FleetUnit / FleetTrailer**: Added dimension fields: `heightM`, `widthM`, `lengthM`, `axleLoadT` (used for ORS route restriction checks).

10. **Run**: Added `runType` and `dependsOnRunId`. Fixed status values: `published` → `assigned` (per CLAUDE.md and schema).

11. **ClientRequestLink**: Added `rawToken` (String?) and `isMain` (Boolean).

12. **Added two missing models**: `ShiftPreference` and `DriverWorkingTimeSummary` — both existed in schema, never documented.

13. **Form mapping table**: Updated all `PlannedJob.xxx` → `Job.xxx`, `LoadDetails.xxx` → `Job.xxx`. Fixed Transport Requirements section field names.

**Not fixed this session (still open):**
- `Job.tempControlled` vs `JobPart.temperatureControlled` inconsistency — P1, requires migration + mobile update (tracked in QUESTIONS.md section 0a)
- `JobRequest.transportRequirementsData` blob still stores `reqBodyCategory`/`reqBodyType` under old names — this is the customer-facing intake form structure and is separate from `Job` columns. Accept handler maps between them.

---

## Session log — 2026-05-27b

### AI cost audit + rule-based service rewrites

**Commits:** `e896f2a`

**Context:** User flagged ~1p per run construction. Traced to `checkRun` auto-firing on every stop change (800ms debounce × stops added = N Haiku API calls per run built).

**Decision: which features genuinely need AI vs can be hardcoded**

Full analysis: if the data needed to make a decision already exists in structured fields (weight, tempControlled, bodyType), rules are better — instant, free, testable, predictable. AI is only justified when meaning must be extracted from free text, or when judgment is needed on ambiguous edge cases.

**Result:**
- `checkRunService.ts` — removed Claude entirely. Service already computed all the hard data (ORS routing, leg distances, break threshold, rest stop detection). Added deterministic result function: 9h legal limit → high; break needed + no rest stop → medium; time window missed → high/medium; run >12h → medium; run >10h → low; no coords → informational none.
- `suggestVehicleService.ts` — weight/pallet count decision tree selects vehicle category. Goods description keyword matching selects body type (fridge, ADR, flatbed for steel, tanker for liquid, etc.). Fleet body type filter applied. `suggestTrailerForRun` now pattern-matches available trailers by type.
- `checkLoadVehicleService.ts` — payload capacity table by category; fridge body required for tempControlled; ADR unsafe bodies check; livestock body check.
- `ai.ts` route — removed `AI_ENABLED` guard from 4 deterministic routes. Rate limits raised (no AI cost). Only `parse-request` still requires AI and keeps the guard.

**Only remaining AI feature:** `POST /ai/parse-request` — free text → structured job. Already manual button. Genuinely requires AI (can't rule-match unstructured customer emails).

**Known schema inconsistency flagged this session:**
- `LoadDetails.tempControlled` vs `JobPart.temperatureControlled` — same concept, two names. Both pre-exist in the dictionary and schema. Not fixed this session (touching both would require migration + mobile sync changes). Added to QUESTIONS.md.

---

## Session log — 2026-05-27a

### Planning Board: Full UX audit + Phase 1 redesign (colour coding, stop cards, publish gate, recall)

**Commits:** `f5d736c`

**UX audit findings (live app walkthrough):**
- Publish gate critical bug: "Publish to driver" was active with no driver assigned. Run went DRAFT → ASSIGNED with `-- assign --` as driver. Discovered live during audit. Fixed this session.
- No recall path from planning board: once ASSIGNED, planner had no way to revert. Added "↩ Recall run" button.
- Stop cards unreadable at normal scale: customer name truncated, address invisible, time window missing, weight not shown, X button hidden until hover.
- "Not collected" badge misfires: appears even when a collection stop precedes the delivery stop in same run. Root cause: badge driven by `Job.status` not by run stop sequence. Redesign deferred to Phase 2 (requires cargo state service).
- AI analysis as prose paragraph: useful data, unreadable format. Compact to one-line with expandable detail.
- Active filter had no × on button itself — "Clear filters" was tiny text at bottom.

**Phase 1 built this session:**
- `getJobColour(jobId)` — deterministic from `jobId % 10` palette. No DB column. Applied as 3px left border on every stop card. Same job = same colour across collect + deliver.
- Stop card redesign: full customer name, `postcode · address` on line 2, time window (start–end), weight + quantity on line 3, cargo pill in same row. X always visible.
- Publish gate: button hidden, replaced with "Assign a driver to publish" when `run.assignedDriverId` is null.
- Recall button: shown when `run.publishedToDriver || run.status === "assigned"`. Patches `{ status: "draft", publishedToDriver: false }`. Driver push notification deferred to Phase 4.
- Active filter ✕ inline on sidebar button (replaces hidden "Clear filters" at bottom).

**Design decisions made this session (long discussion):**
- **Job colour coding**: auto-assigned from 10-colour palette, deterministic, no user choice. Convenience over beauty.
- **Cargo state on delivery stops**: 5 states (no_collection_run → collected). Source: `LoadTrack` + related run status. Phase 2.
- **One-time swap locations**: stored inline on `LoadTrack` event as free text + GPS. Never saved to Locations table. Yard/depot swaps use `custodyDepotId`. Phase 2.
- **Trailer swap requires simultaneous presence**: both drivers must be at meeting point together. System must calculate overlap window. Phase 3.
- **PlanningSettings**: all dwell times, yard start overhead, tramper wake time, break buffer configurable per company. Phase 3.
- **GPS break detection**: 15-min pings, stationary = <200m movement in 15 min. 48h raw event retention, then delete. 90-day for button-press events (shift actions).
- **Driver hours self-report**: popup after major button presses. Self-reported > GPS-estimated. Pre-fill with estimate, driver confirms or adjusts.
- **Delay cause capture**: optional after long dwell. Defends drivers against unfair blame. Creates paper trail that delays were customer/traffic not driver.
- **Notification philosophy**: driver gets safety + care messages only. Planner gets operational. Never cross-stream. Never send notifications while driver is moving (wait for stationary ping).
- **Product principle**: every notification must be on the side of the person receiving it. System cares about users, does not surveil them.

**Gaps / deferred:**
- "Not collected" badge still misfires until Phase 2 cargo state service is built.
- Recall does not yet notify driver — stub only, Phase 4.
- Stop hover tooltip (full job details) — Phase 2.
- Linked relay run dependency message ("delivery can't happen because collection on RUN-XXX not done") — Phase 2.

---

## Session log — 2026-05-26

### Planning Board: postcode area grouping, relay run support, cargo state, driver types, overnight waypoint

**Commits:** `7fe9add`, `f9fd3e9`, `8c35855`, `518faac`

**Root cause investigation — wrong stop order on RUN-2026-000024:**
- Stops appeared to be in the wrong order (Muller showing as Stop 2 despite an 05:00 time window).
- Queried production API directly; discovered Muller's `timeWindowStart = "2026-05-27T05:00:00Z"` — the stop was for May 27, not May 22. The sort was correct.
- Fix 1: `nearestNeighborSort` operator precedence bug — `lat ?? 51.5 - lat0` evaluated as `lat ?? (51.5 - lat0)` because `??` has lower precedence than `-`. All distances were measured from origin, not previous stop. Fixed with brackets: `((lat ?? 51.5) - lat0)`.
- Fix 2: Date badge on run lane stop rows — neutral slate badge when stop date ≠ run date, so planner can see multi-day stops at a glance without alarming red.

**Relay run support:**
- Individual stop rows in JobWorkCard are now draggable (`application/job-part-id`).
- "Collect →" and "Deliver →" buttons added below "Add both →" for jobs with separate collection + delivery parts.
- Drop handler in RunLane checks `job-part-id` before `job-id` so individual stops take priority.
- `handleAddPartToRun` added to main page; `onAddPartToRun` prop threaded through JobWorkCard.
- Relay hint text: "Relay run? Add collect to one run, deliver to another, then use + Waypoint → Yard stop on each."
- **Decision:** Relay/handover is accomplished via existing `RunWaypoint.waypointType = yard_pickup / hub_drop`. No new API needed.

**Cargo state visibility:**
- `Job.status` added to `RUN_INCLUDE` job select in `api/src/routes/planning.ts`.
- `status: string | null` added to `PlanningAssignment.jobPart.job` frontend type.
- Cargo state pills rendered below each stop row in the run lane: ⏳ Not collected / 🚛 At drop-off / ✅ Collected / ✅ Delivered — driven by `Job.status` lifecycle.
- Stop row changed to `flex-col` to accommodate the cargo pill below the main row.

**Postcode district grouping (user request: "grouping like ls27 instead of N/S/E/W direction"):**
- `extractPostcodeDistrict()` added to `plannerWorkService.ts` — extracts UK outward code (`LS27`, `M1`, `SW1A`) from stop postcode.
- `postcodeDistrict: string | null` added to `PlannerWorkItem` interface and `items.push()`.
- Frontend `PlannerWorkItem` type updated; `DATA_DICTIONARY.md` updated with new field and full `PlannerWorkItem` section.
- Sidebar "By direction" section replaced with "By area" — groups by `postcodeDistrict`, sorted alphabetically.
- `activeDirection` / `byDirection` state replaced with `activeArea` / `byArea` throughout.
- Filter logic updated: `item.postcodeDistrict !== activeArea` instead of `gk !== direction_*`.
- Panel title updated: "Area: LS27" etc.
- **Decision:** Specific postcode districts are strictly more useful than broad N/S/E/W labels for building tight geographic runs. Broad direction groups remain as `groupKey` values for job-panel section headers but are no longer the primary sidebar filter dimension.

**Driver type in planning UI (user request: "day driver or tramper"):**
- `nightsOutAllowed: boolean` added to `PlanningDriver` frontend type. The field was already returned by the API (full DriverProfile is returned) — only the frontend type needed updating.
- Driver dropdown in run lane shows 🌙 suffix for trampers (`nightsOutAllowed = true`).
- Day driver multi-day warning: if assigned driver has `nightsOutAllowed = false` and run has stops spanning multiple calendar dates, a banner appears: "Day driver — stops span multiple days. Add a depot return and a new run for the following day."
- **Decision:** `nightsOutAllowed` (Boolean, already on DriverProfile) is the canonical tramper flag. No new field needed.

**Overnight rest waypoint (user request: "tramper stop — we need to know where he finish and start"):**
- `overnight_rest` added to `WAYPOINT_TYPE_LABEL` map — renders as "Overnight rest" in the run card.
- Waypoint form: when position is mid-route (not depot_start / return_to_base), a type selector now appears with options: Stop / other, Yard pickup, Hub drop, Overnight rest.
- `wpType` state added; used instead of hardcoded `"custom"` in `handleAddWaypoint`.
- **Decision:** Overnight rest is a `RunWaypoint` with `waypointType = "overnight_rest"`. The location records where the tramper parks up. The next day's run starts with a `depot_start` waypoint from that same location. No separate "shift end" model needed at this stage.

**Gaps / open items from this session:**
- Tramper next-day run: the `overnight_rest` waypoint tells you where they rest, but the system does not yet automatically suggest that the next run starts from that location. Planner must manually create a new run and add a depot_start at the overnight rest address.
- Day driver multi-day warning: detects the problem but does not block publishing. Consider adding a publish-time guard (similar to the "no stops" guard) in a future session.
- `DATA_DICTIONARY.md` `RunWaypoint` section added (was missing from 2026-05-24 session).

---

## Session log — 2026-05-24 (continued)

### Planning Board: multi-day jobs, depot waypoints, route feasibility AI, UI polish

**Commits:** `61bb895`, `09aaff6`, `464f90f`

**Route feasibility AI check (replaces vehicle/load check on RunCard):**
- New `api/src/services/checkRunService.ts` — haversine leg distances between stops (×1.25 road factor), HGV 60 km/h speed, 30 min dwell/stop, time window assessment by Claude
- New `POST /ai/check-run` in `api/src/routes/ai.ts` — rate-limited 60/min, requires auth + planner role
- Frontend: `aiApi.checkRun()` in `web/src/api/ai.ts`; RunCard useEffect now calls `checkRun` instead of `checkVehicleLoad`; trigger on `assignments.length` + `estimatedStartTime` changes
- **Decision:** Original plan intended vehicle-load AND time-window checks. Route feasibility was built first. ADR/temp/weight checks still needed (see STATUS.md 1.10).

**Multi-day job filtering:**
- `GET /planning/unplanned` now filters by each stop's own `timeWindowStart` date (not `job.plannedDate`). Falls back to `bookedTime`, then `job.plannedDate` for stops with no time window.
- Two-query approach to avoid Prisma OR + nested relation conflicts; results deduplicated.
- ClusterCard: shows `📅 Fri 31 Jan` label when stop's date ≠ planning date; shows `🔗 Delivery also in [cluster]` amber chip when same job has companion stops in other clusters.

**RunWaypoint — depot/yard stops:**
- New `RunWaypoint` model in schema: `waypointType` (depot_start | yard_pickup | hub_drop | return_to_base | custom), `locationId` (FK → SavedLocation optional), `locationText`, `postcode`, `lat`, `lng`, `scheduledTime`, `notes`, `sequenceNumber`
- Migration `20260524130000_add_run_waypoints` applied locally
- `POST /planning/runs/:id/waypoints` — creates waypoint, auto-fills lat/lng/postcode from SavedLocation if `locationId` given
- `DELETE /planning/runs/:id/waypoints/:wId`
- `RUN_INCLUDE` updated to include `waypoints` (with location)
- RunCard: "Depot / yard stops" section — "+ Add" toggle, type select with plain-English labels, location text input, "After which stop?" dropdown (shows actual stop names for mid-route types; depot_start/return_to_base auto-positioned).
- **Note:** This is Phase 2 depot infrastructure pulled forward as a lightweight Phase 1 addition.

**UI polish (prior sub-session):**
- All raw snake_case enum values removed from every page (body types, fleet status, goods type, quantity units, run status, assignment status, driver type, licence class)
- `FLEET_STATUS_LABELS`, `BODY_TYPES` lookup, `ASSIGNMENT_STATUS_LABEL` maps added across fleet, run, planning, request pages
- Badge component fallback now capitalises first letter and replaces underscores
- RepeatJobModal: `UNIT_LABELS` all proper-cased
- ShiftsPage: status labels fixed

**Key decisions this session:**
- **Trailer made optional** (was required in PLANNING_BOARD.md spec). Real-world: planners often don't know trailer at planning time. Changed: removed red warning, removed API enforcement. Trailer can be assigned later. PLANNING_BOARD.md spec should be updated to reflect this.
- **Single run creation path**: "New Run" button removed from RunsPage. Planning Board is the only place runs are created.
- **AI suggest is job-aware**: all stops from the same job (jobId) are grouped into the same run regardless of geographic cluster, because collection + delivery of one job must travel together. Collections sorted before deliveries within each run.
- **Depot/yard waypoints not in Phase 1 spec** — built anyway as it was a clear practical need. Phase 2 depot buffer (LoadTrack, depot sort UI) remains unbuilt.

**Gaps vs PLANNING_BOARD.md spec:**
- 1.6 Trailer required at publish — REMOVED deliberately
- 1.8 Dependency lock enforcement — UI badge exists, API does not enforce
- 1.10 AI checks — route feasibility only; ADR/temp/weight/split-load checks missing
- 1.12 Job progress from RunAssignment — not built
- 1.13 Driver push notification on publish — not built

---

## Session log — 2026-05-24

### Planning Board Phase 1 + forms polish

**Done:**

New files:
- `api/prisma/migrations/20260524000000_add_run_type_and_dependency/migration.sql` — adds `runType TEXT`, `dependsOnRunId INT` (FK self-ref) to Run
- `api/src/routes/planning.ts` — full planning API: `/planning/unplanned` (haversine clustering), `/planning/runs` CRUD, assignment add/remove, `/planning/fleet`, `/planning/drivers`, `/planning/runs/:id/publish`
- `web/src/api/planning.ts` — typed client for all planning endpoints
- `web/src/modules/planning/PlanningBoardPage.tsx` — full two-panel planning board UI

Schema changes:
- `Run` model: `runType String?`, `dependsOnRunId Int?`, self-referencing `dependsOn`/`dependents` relation named `"RunDependency"`

Key API behaviours:
- `clusterStops()`: greedy haversine 5km radius grouping; postcode area fallback when no GPS
- `recalcDerived()`: recomputes `hasHazardous`/`hasTemperatureLoad`/`hasOversized`/`maxLoadWeight` after any assignment change
- Publish enforces `assignedTrailerId` present; sets run status to `"assigned"`
- Drivers filtered by `status: "active"` on requested date

UI features:
- Left panel: `ClusterCard` — expandable, shows stop count/weight, per-stop run selector + Add button
- Right panel: `RunCard` — stops list (remove), trailer picker (required, red warning if unset), driver picker, run type select, dependency select (relay mode), planner notes, AI check badge (debounced 800ms)
- AI check: maps `severity high→block, medium/low→warn, none→ok`; shows message on hover
- "Suggest runs for today" button: calls `aiApi.suggestVehicle` on biggest unplanned cluster, creates a run, adds all stops

Changes:
- `api/src/app.ts` — registered `planningRoutes`
- `web/src/App.tsx` — added `/app/planning` route
- `web/src/modules/planner/AppShell.tsx` — added "Planning" nav item (between Runs and Fleet)
- PRF: multi-pallet repeater block, identical to CJP (twin rule maintained)
- `web/src/constants/vehicleTaxonomy.ts` (+ shared/ + api/src/constants/) — populated tractor/drawbar/heavy_haulage body type arrays that were previously empty
- `web/src/modules/jobs/JobDetailPage.tsx` — `LoadDataSection` rewrite: array/object fields, grouped body type picker with proper labels

**Key decisions:**
- No `as const` on `RUN_INCLUDE` in Prisma — deep type inference breaks; plain object works fine
- `migrate deploy` used for production-safe migration (not `migrate dev`) to avoid drift errors
- AI check runs client-side on debounce; no caching needed at this scale
- Trailer required at publish; driver optional — matches dispatcher workflow

**Still TODO (Phase 1):**
- 1.8 Run dependency locking (relay lock until parent complete)
- 1.9 Split load quantity UI
- 1.12 Job status derived from RunAssignment completion

---

## Session log — 2026-05-23 (3)

### AI vehicle suggestion + bug fixes + model update

**Done:**

New files:
- `api/src/services/suggestVehicleService.ts` — Claude Haiku analyses load (weight, qty, goods type, temp, hazmat) → recommends vehicle category + one-line reason + confidence

Changes:
- `api/src/routes/ai.ts` — added `POST /ai/suggest-vehicle` endpoint (rate limit 60/min); improved error classification (auth errors → 503 `AI_AUTH_ERROR`, others → 502 `AI_ERROR`)
- `web/src/api/ai.ts` — added `VehicleSuggestionInput`, `VehicleSuggestion` types, `aiApi.suggestVehicle()`
- `web/src/modules/jobs/CreateJobPage.tsx` — Section 5 now has violet "✨ AI vehicle suggestion" panel; `handleSuggestVehicle` + `acceptVehicleSuggestion` handlers; disabled until goods type or weight filled
- `web/src/modules/jobs/ParseRequestPanel.tsx` — friendly error messages for auth vs service errors
- `api/src/services/parseRequestService.ts` — **model updated from retired `claude-3-5-haiku-20241022` to `claude-haiku-4-5`** (old model returned 404 not_found_error)
- `web/src/modules/jobs/CreateJobPage.tsx` — `applyParsedData` now async; searches customer DB by name when AI extracts customer; if exact match found → sets `customerId` + fills contact fields from stored account
- `web/src/modules/templates/TemplatesPage.tsx` — fixed 3× `jobs/new` → `jobs/create` (wrong route caused `parseInt("new")=NaN` → GET `/jobs/NaN` → 500)
- `web/src/modules/jobs/JobDetailPage.tsx` — added `isNaN` guard so bad URL params show "Job not found" instead of hitting API with NaN

**Key decisions:**
- Vehicle suggestion is planner-only (not on PRF) — customers don't choose vehicles
- Suggestion panel hidden in edit mode — no value in re-suggesting on an existing confirmed job
- Model: `claude-haiku-4-5` — cheapest/fastest current Anthropic model ($1/MTok input, $5/MTok output)
- Customer match: exact name match wins; single result wins; multiple non-exact → leaves as text (safer than guessing wrong customer)

---

## Session log — 2026-05-23 (2)

### AI email/message → job form parser

**Done:**

New files:
- `api/src/lib/anthropic.ts` — lazy Anthropic client singleton
- `api/src/services/parseRequestService.ts` — Claude Haiku prompt + JSON extraction + coercion
- `api/src/routes/ai.ts` — `POST /ai/parse-request` + `GET /ai/status`
- `web/src/api/ai.ts` — frontend API client
- `web/src/modules/jobs/ParseRequestPanel.tsx` — collapsible UI panel (paste text → parse → fill form)

Changes:
- `api/src/app.ts` — registered `aiRoutes`
- `api/src/lib/env.ts` — added optional `ANTHROPIC_API_KEY` / `AI_ENABLED`
- `api/package.json` — added `@anthropic-ai/sdk ^0.98.0`
- `web/src/modules/jobs/CreateJobPage.tsx` — added `applyParsedData()` function + `<ParseRequestPanel>` above Section 1 (new jobs only, hidden in edit mode)

**How it works:**
1. Planner opens Create Job → sees "✨ Fill from email or message" panel (collapsed by default)
2. Pastes any free text — email, WhatsApp, phone note
3. Clicks "Extract job details" → calls `POST /ai/parse-request`
4. API fetches company's saved locations, builds prompt with today's date + location hints, calls Claude Haiku
5. Claude returns structured JSON (customer, stops with addresses + times, load, vehicle)
6. Frontend maps to form state — all sections expand so planner can review
7. Confidence badge (high/medium/low) + warnings list tell planner what to check
8. Planner reviews, adjusts, saves

**To activate on Railway:**
Add environment variable: `ANTHROPIC_API_KEY = sk-ant-...`
Get key from: https://console.anthropic.com/settings/keys
Model: `claude-haiku-4-5` — updated from retired `claude-3-5-haiku-20241022` (~£0.001 per parse at new pricing)
AI is disabled gracefully if key is missing — returns 503, no crash.

**Key decisions:**
- New jobs only (hidden in edit mode) — parsing into an existing job would overwrite intentional edits
- Rate limited: 30 calls/minute/company
- Saved locations sent as hints (top 200 by creation date) so Claude can match known depots/sites
- `tempControlled` from Claude → sets `tempType = "chilled"` as a flag; planner picks exact type (chilled/frozen/ambient)
- `vehicleCategory` from Claude → only applied if Claude extracts it; `plannerDecides` flipped to false
- Special requirements merged (additive) not replaced — so manual selections aren't wiped

---

## Session log — 2026-05-23

### Validation gate hardening — job creation completeness

**Done:**

All outstanding validation gaps in the job registration flow fixed before moving to runs phase.

Changes to `api/src/services/jobValidation.ts`:
- Extended `StructuredJobValidationInput` with `loadData?: Record<string, unknown> | null`
- **ADR completeness gate**: when `hazardClass` is set, `unNumber` and `packingGroup` from `loadData` are required (hard error for `ready_to_plan`, warning for draft)
- **Booking reference gate**: stop with `bookingRequired=true` must have `bookingRef` (hard error for `ready_to_plan`, warning for draft)
- **Time window sanity**: within-stop `end < start` is a hard error; cross-stop collection-end after delivery-start is a warning
- **Temperature-controlled trailer check**: `tempControlled` load with trailer types selected that include no cold-chain types → hard error for `ready_to_plan`, warning for draft
- **Weight vs payload check**: declared weight compared to approximate category/GVW max payload table → warning only (not a hard block due to estimate uncertainty)

Changes to `api/src/services/jobService.ts`:
- Both `createJob` and `patchJob` now pass `loadData` (the JSON blob) to `validateStructuredJob` so ADR fields are validated

Changes to `api/src/routes/jobs.ts`:
- `DELETE /jobs/:id` now checks for active `RunAssignment` rows before cancellation; if found returns 200 with `{ cancelled: true, warnings, affectedRunIds }` instead of 204
- `PATCH /jobs/:id/status` with `status=cancelled` returns `warnings + affectedRunIds` if job is in active runs

Changes to `web/src/modules/jobs/JobsPage.tsx`:
- `handleDelete` and `handleStatusChange` now check for `warnings` in the response and display an amber `Alert` banner (8s timeout) listing affected run IDs

**Key decisions:**
- Weight/GVW check is a **warning, not an error** — declared weights are estimates and we don't want to block planners. The lookup table uses conservative UK HGV payload figures.
- Fridge trailer check only triggers when trailer types are explicitly set AND none are cold-chain. If no trailer types set at all, the existing "tractor requires trailer type" check covers that.
- Cancellation cascade does NOT block cancellation — planners may need to cancel in an emergency. It returns the run IDs so the planner knows exactly which runs to update.
- Run-level checks (site access vs vehicle, driver qualifications, split quantity balance) deferred to planning board phase — they require run context that doesn't exist at job-creation time.

---

## Session log — 2026-05-21

### Planning board design + transport enforcement

**Done:**

Jobs page and detail page improvements (deployed):
- Fixed "INVALID DATE" in jobs table (fmtShort/fmtWeekday slicing ISO string to first 10 chars)
- Stats subtitle: bold numbers with contextual colours + date pill chip
- Filter bar: paired ← / → preset buttons, status filter on same row, overflow-x-auto
- Badge: added whitespace-nowrap to prevent "Ready to plan" wrapping
- JobMenu context menu: converted to React portal (createPortal) with getBoundingClientRect — escapes table overflow clipping
- Job detail: booking contact email, all loadData fields via LoadDataSection, stop-level handling/access/proof/restriction/navigation chips and fields
- JWT access token TTL extended from 15 min → 8h; proactive silent refresh added to useAuth

Vehicle type enforcement before Ready to plan (deployed):
- API: planners bypass driver-only ALLOWED_JOB_TRANSITIONS; hard block on transition to ready_to_plan when vehicleCategory is null
- UI: StatusPanel warns + disables Update button when vehicle missing and Ready to plan selected
- UI: Vehicle requirements card always visible; amber warning + Edit job link when no vehicle set

Planning board — full design agreed and documented:
- Created PLANNING_BOARD.md with complete spec (load hierarchy, 5 run types, screen design, AI validation rules, job progress tracking, schema additions, 3-phase build plan)
- Updated ARCHITECTURE.md: run section rewritten to reflect trailer-first assignment order, run types table, dependsOnRunId field
- Updated STATUS.md: planning board added as next build priority with all 13 Phase 1 steps, Phase 2 (5 steps), Phase 3 (6 steps)

**Key decisions made this session:**

1. **Load is the primary tracking entity** — not trailer, not driver. We always know: load → trailer → driver → run → job.
2. **Assignment order is fixed:** trailer first (at planning), driver second (when confirmed), unit/truck third (driver phase).
3. **Run types defined:** direct / relay / split / consolidation / live-reassignment.
4. **Split loads:** same job spread across multiple runs using RunAssignment.quantityAssigned. Job complete when sum(quantityConfirmed) >= job.quantity.
5. **Run dependencies:** Run.dependsOnRunId — relay delivery run locked until collection run confirms depot drop.
6. **Trailer swap** is its own immutable event type — load custody transfers to new driver permanently.
7. **Collections can be freely reassigned** if not yet collected. Deliveries with load on truck require trailer swap.
8. **Planning board starts from jobs** (all ready-to-plan stops visible), not from drivers. Build runs first, assign driver later.
9. **AI integration planned** for: grouping suggestions, per-run validation (green/amber/red), late-run detection (Phase 3).

**Still outstanding:**
- Phase 1 planning board build (steps 1.1–1.13 in STATUS.md)
- Phase 2 depot operations
- Phase 3 live monitoring

---

## Session log — 2026-05-19

### PRF improvements + doc consolidation

**Done:**

PRF and CJP required-field highlighting:
- Section 1 (customer name, contact name, contact phone) — red borders + "Required" messages on save attempt
- Section 3 (goods type chips, goods description, quantity, weight) — conditional red border + counter colour change
- Section 6 (declared value) — error prop on TextField
- Section 2 stop-level `missingCount` / `missing` wiring to SectionHeader and SectionFooter badges

PRF LogisticBay branding:
- `PoweredBy` component with `/favicon.svg` logo + "Powered by LogisticBay" text
- Placed in PRF header (absolute positioned top-right), success screen footer, error screen footer
- Links to `https://logisticbay.com`, text turns `#863bff` on hover

Document consolidation (21 docs → 8 docs):

The previous system had 21 loose documents with overlapping content, stale information, and conflicting rules. Consolidated to exactly 8 docs, each with a single clear purpose:

| Doc | Purpose |
|-----|---------|
| `CLAUDE.md` | Entry point — which doc answers which question, mandatory rules |
| `PRODUCT.md` | What LogisticBay is, phases, roles, locked architecture decisions |
| `ARCHITECTURE.md` | Object model, field tables, status flows, splitting logic, frontend rules |
| `DATA_DICTIONARY.md` | Canonical field names (unchanged) |
| `SAFETY.md` | Agent discipline rules (from ai.md) + production safety standards |
| `STATUS.md` | Live feature status (✅/🔶/🔲) + P0/P1/P2 release checklist |
| `QUESTIONS.md` | All 196 open questions in one file, categorised |
| `DEVLOG.md` | This file — session history |

All superseded docs moved to `docs/archive/` (MASTER_BLUEPRINT.md, SYSTEM_PLAN.md, PHASE1_DATA_MODEL.md, FPSR.md, ai.md, PROJECT_STATUS.md, RELEASE_READINESS.md, OPEN_QUESTIONS.md, all 5 QUESTIONS_*.md, MIGRATION_PLAN.md, NAMING_AUDIT.md, REQUEST_TO_JOB_PLAN.md, JOB_FORM_IMPLEMENTATION_BRIEF.md).

Added ⚠ known-gaps tables to ARCHITECTURE.md and CLAUDE.md covering: branchId not implemented, executionDate→plannedDate, totalQuantityRequired→quantity, serviceType values differ, unimplemented status values, job_creator role not enforced.

**Still outstanding:**
- P0.1 Staging environment
- P0.2 Sentry
- P0.3 Backup restore test
- P0.7 Mobile logout with unsynced events
- Rest of P0 checklist (see STATUS.md)
- Load movement engine (see STATUS.md → not started)

---

## Session log — 2026-05-18

### Auth security (PR: claude/confident-leavitt-acc4c0)

**Done:**
- Login lockout: 5 bad attempts → 15-min lockout. `failedLoginAttempts` + `lockedUntil` on `User`. Generic error always — lockout state never leaked.
- Company email verification: register sets `status=pending`, sends verification email, login returns 403 `EMAIL_NOT_VERIFIED` until verified. Verify endpoint activates company and auto-issues tokens.
- Password reset: company_owner only. SHA-256 hashed token, 1-hour TTL, revokes all sessions on password change.
- DB migration `20260518000002_auth_security`: lockout columns + `PasswordResetToken` + `EmailVerificationToken` tables. Idempotent SQL.
- Web: ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage, RegisterPage "check inbox" state, LoginPage "Forgot password?" link.
- Fixed `email?` missing from `PatchDriverBody` / `PatchDriverSchema` (was causing CI TS error).

**Email gated on `SENDGRID_API_KEY`:**
SendGrid free trial expired. Built a clean bypass: when `SENDGRID_API_KEY` is absent, `env.EMAIL_ENABLED = false` and register-company skips pending state — returns tokens directly (same UX as before). When the key is added to Railway, full email flow activates with zero code changes.

**What to do when SendGrid is re-enabled:**
See `PROJECT_STATUS.md` → "What to do when SendGrid is re-enabled" section — 8 steps including Railway env vars, end-to-end tests, and future admin panel for driver password reset.

**Still outstanding (auth):**
- Admin panel for resetting driver/planner passwords (owner-initiated, no email needed) — add to Settings page
- Resend-verification endpoint if a user loses the email
- MFA for planner/owner (listed in SAFETY.md security review)

LogisticBay is being built for extreme, unbounded tenant growth: thousands to millions of tenant companies and records that may grow from millions into billions or trillions over time. Every engineer must internalise the rules in this document before writing code. The rules are not aspirational — they are enforced in code review, in CI, and in production checks.

---

## North Star

**No unbounded data access, ever.** Every query, every list, every dashboard, every background job, every AI/smart feature is scoped to a single `companyId` and bounded in size. There are no exceptions for "internal admin tools" or "quick fixes."

The mental model:
1. `companyId` first
2. Bounded query second
3. Indexed path third

---

## Project Overview

LogisticBay is a modular logistics operating system for transport companies.

- Planner creates jobs → Driver executes → System records events
- Planner defines work. Driver confirms reality. System records events.

## Stack

- **API:** Fastify + Prisma + PostgreSQL (Node.js / TypeScript)
- **Mobile:** React Native + Expo SDK 54
- **Web:** React + Vite + Tailwind
- **Deploy:** Railway (API) + Vercel (Web)
- **Planned additions:** Redis (cache + queues), S3/R2 (file storage), Sentry (error tracking), TimescaleDB or equivalent (GPS telemetry, later)

## Live URLs

- **API:** https://api-production-cdc9.up.railway.app
- **Web:** https://logisticbay.com / https://logisticbay.vercel.app
- **Railway project:** https://railway.app/project/5b039bc6-fef3-4aa6-b423-1e1088aaa94b

## GitHub

- **API + Web:** https://github.com/Q25ltd/logisticbay
- **Mobile:** https://github.com/Q25ltd/logisticbay-mobile

## Local Paths

- **API:** `~/timesheet-app/api`
- **Mobile:** `~/timesheet-app/mobile`
- **Web:** `~/timesheet-app/web`

## Deploy Commands

- **API:** `cd ~/timesheet-app/api && railway up`
- **Web:** `cd ~/timesheet-app/web && vercel --prod`
- **Mobile:** `cd ~/timesheet-app/mobile && npx expo start`

---

## Architecture Rules — UNBREAKABLE

These rules apply to every file, every endpoint, every feature. A PR that breaks any of them is rejected.

1. **NEVER trust `companyId` from the frontend.** Always use `request.user.companyId` from the verified JWT.
2. **NEVER hard-delete jobs, shifts, drivers, customers, vehicles, or trailers.** Use status fields (soft delete) so audit trail and reporting survive.
3. **Every protected API route MUST enforce tenant isolation.** No exceptions for "admin" routes — admins also belong to a tenant.
4. **JWT_ACCESS_SECRET for access tokens, JWT_REFRESH_SECRET for refresh tokens.** They must be different values, rotated on a schedule.
5. **CORS is restricted to exact domains only.** No wildcards in production.
6. **Mobile saves draft locally first, then syncs to API.** Network is treated as unreliable by default.
7. **Planner defines work. Driver confirms reality. System records events.** This is the source-of-truth contract for every screen.
8. **Every operational record AND every query against high-volume tables must be tenant-scoped by `companyId`.**
9. **Never build list, dashboard, search, or report pages that load all company data into the browser.** Server-side filtering and pagination only.
10. **Every new list/search/report endpoint must define filters, pagination, max rows, and supporting indexes** before merge.
11. **Never use `COUNT(*)` on a tenant-scoped table over 100k rows.** Use precomputed counters or approximate counts (`10,000+`).
12. **Never call an LLM with cross-tenant data in the prompt context.** Vector index, retrieval, and prompt assembly are all `companyId`-scoped.
13. **Background jobs always carry `companyId` in their payload** and process one tenant at a time, with per-tenant fairness.
14. **Every public-facing endpoint has rate limits** per tenant, per user, and per IP.
15. **Every state change is auditable** — who, what, when, from where, with before/after diff for sensitive fields.
16. **Every write endpoint accepts an idempotency key.** Retries must never produce duplicate records.
17. **Mobile clients send `X-App-Version`.** API can refuse below `minSupportedVersion`.
18. **No secrets in git, no secrets in mobile bundles, no secrets in client-side env vars.** Server-side only.

---

## Tenant Isolation — The Inviolable Discipline

Tenant isolation is the single most important rule in this codebase. Get it wrong and one customer sees another customer's data — that is a company-ending event.

### Application layer (primary control)

- Every Prisma query starts with `where: { companyId: req.user.companyId, ... }`
- Every related ID (`driverId`, `jobId`, `customerId`, `siteId`, etc.) is validated to belong to the same `companyId` **before use**, not after
- Repository pattern is mandatory: route handlers never call `prisma.x.findMany(...)` directly. Use typed repositories that require `companyId` as the first argument
- Lint rule (planned, Phase 0): block direct `prisma.*` access from route handlers in CI

### Database layer (defense in depth)

- Postgres Row-Level Security (RLS) policies on every tenant-scoped table
- Connection-level `SET app.current_tenant` for the request lifetime
- Foreign keys composite with `companyId` wherever possible
- Audit any query plan that does not start with a `companyId` index seek

### AI / LLM layer

- Every retrieval step is `companyId`-scoped before it reaches the model
- Hard cap on retrieved rows (top-K) and a token budget enforced before prompt assembly
- Prompt context never mixes tenants — even by accident, even in shared examples
- Vector index is partitioned by `companyId` (separate namespaces, not a shared index with filters)

### Background jobs

- Every job has a `companyId` in its payload
- Per-tenant queues or weighted fair queueing — one large tenant cannot starve everyone else
- Tenant suspension / billing-blocked flag is checked before processing
- Job processing logs include `companyId` in every line

### Tenant deletion / suspension

- Soft-delete first, hard-delete after a documented retention period
- Hard-delete cascades to: operational tables, file storage, search indexes, vector embeddings, cache entries, audit logs (with regulator-compliant retention exception)
- Tested at least twice a year against a synthetic tenant

---
# Core Rule: Data Quality First

Strict information. Flexible operations.

LogisticBay is an operational system.
Its value depends on clean, structured, trustworthy information.

We do not compromise data quality for speed, convenience, or flexible free-text entry.

Target operational model:
- Main Job = commercial/customer container
- Job Part = executable transport movement
- Run = planner execution grouping
- Event = immutable operational truth record

Every field added to the system must have a clear operational purpose.

A field is allowed only if it supports one or more of:
- planning
- execution
- tracking
- status calculation
- risk detection
- recovery suggestions
- reporting/audit
- future automation

If a field does not improve operational truth, do not add it.

Core operational logic must never depend on parsing free text.

Free text is only for:
- notes
- comments
- explanations
- exception details
- human communication

Core logic must use:
- structured fields
- controlled enums
- relations
- timestamps
- IDs
- system-generated events

If information can be represented as a structured field, enum, relation, timestamp, or event, it must not exist only in notes.

The system must filter and validate information before it enters the database, not collect garbage and attempt cleanup later.

Forms should be strict in information collection while allowing flexible operational execution through:
- Job Parts
- Runs
- reassignment
- splitting
- merging
- event tracking

Operational truth should be preserved through append-only events where possible, not destructive state overwrites.

No duplicate meanings.
No vague statuses.
No ambiguous references.
No optional fields without operational purpose.
No “notes as logic.”

One operational concept = one canonical internal name.

### Canonical Naming Discipline

UI labels may differ by audience (customer, planner, driver),
but internal names must stay canonical across:
- database columns
- APIs
- shared schemas
- events
- planners
- mobile
- marketplace
- integrations

Example:
- UI label: "Address line 1"
- Canonical field: `street`

Example:
- UI label: "Company / site name"
- Canonical field: `siteName`

Never create aliases for the same operational meaning.

Bad:
- addressLine1
- streetAddress
- street1

Good:
- street

The same operational meaning must always use the same internal name.

UI labels may vary by audience, but database fields, APIs, shared schemas, and internal logic must use canonical names consistently across the system.

### The Two Canonical Entry Points

The entire system is data manipulation. All operational value comes from the quality of structured data that flows through it. Quantity of data does not matter — quality does. Garbage in means garbage out at every downstream step: planning, allocation, execution, reporting, automation.

The two primary entry points where data enters the system are:

1. **Public job request form** (`/request`) — customer or broker submits a transport request. This is the first moment operational data is captured. Every field collected here must be structured, canonical, and immediately usable without planner cleanup.

2. **Job creation / edit form** (planner web) — planner creates or refines a job from a request or from scratch. This is where the request becomes a dispatched job with stops, vehicle requirements, and assignments.

These two forms are the most important screens in the system. They are the gates. If data quality is poor at intake, every downstream feature — driver allocation, routing, reporting, AI suggestions — is degraded or impossible.

**Rule for every agent working on these forms:**
- Every field must be structured (enum, relation, number, date) unless it is explicitly a notes/comments field.
- Free text is never acceptable for anything that will drive logic, filtering, matching, or reporting.
- A field that cannot be used programmatically without parsing free text should not exist.
- Prefer fewer high-quality fields over many vague ones.
- If a field cannot be explained with: "this field is used to [specific operational decision]", it should not be added.

### Structured Intake Rule

Public forms, planner forms, APIs, imports, and integrations must collect structured operational data at intake time whenever possible.

The system should guide users toward:
- controlled options
- structured selections
- reusable locations
- reusable templates
- validated references
- canonical values

instead of relying on free-text explanations.

The goal is to reduce:
- planner clarification calls
- driver confusion
- operational mistakes
- manual cleanup
- impossible automation later

Before adding any new:
- form field
- database column
- enum
- status
- event type
- relationship

the developer must explain:
1. What operational decision this data supports
2. Whether it should be a structured field, enum, relation, timestamp, or note
3. How it affects Main Job, Job Part, Run, or Event logic
4. What happens if the data is missing, wrong, duplicated, or changed later


## Database & Scale Architecture

Target scale: **unbounded tenant and record growth.** The first rollout may have thousands of companies and millions of rows, but the architecture must not depend on totals staying below any fixed number.

### Required indexes (must exist before scale rollout)

- `PlannedJob`: `(companyId, plannedDate)`, `(companyId, status)`, `(companyId, assignedDriverId)`, `(companyId, customerId)`, `(companyId, updatedAt)`
- `JobExecutionEvent`: `(companyId, jobId, createdAt)`, `(companyId, clientEventId UNIQUE)`
- `Shift`: `(companyId, driverId, startedAt)`, `(companyId, status)`
- `ShiftSegment`: `(companyId, shiftId, startedAt)`
- `FleetUnit` / `FleetTrailer`: `(companyId, status)`, `(companyId, registration)` now; add `(companyId, registration UNIQUE)` only after duplicate cleanup/runbook
- `User` / `CompanyMembership`: `(companyId, userId UNIQUE)`
- Search indexes: Postgres `pg_trgm` + GIN for references, customers, sites, route text — migrate to dedicated search service when any indexed table exceeds 5M rows

### Pagination contract

Every list endpoint must:

- Use cursor-based pagination (NOT offset) for any table that may exceed 1M rows
- Enforce a hard max page size: 100 default, 500 absolute maximum
- Require filter parameters (date range, status, etc.) for tables over 1M rows
- Sort only on indexed columns
- Include a `hasMore` flag and a `nextCursor` value

### Counters and summaries

- `COUNT(*)` on tenant-scoped tables is forbidden over 100k rows
- Pre-aggregated daily and weekly summary tables for dashboards
- Approximate counts in UI (`10,000+`) are acceptable and preferred at scale
- Counters are maintained on write (triggers, CDC, or app-layer atomic increments) — never on read

### Dashboard architecture

- Dashboard data is served by a dedicated server endpoint such as `/dashboard?date=YYYY-MM-DD`
- The frontend never fetches all jobs/customers/drivers/trailers and filters locally
- Server-computed summaries, cached or pre-aggregated for high-traffic tenants
- Warning summaries (working time, holiday clashes, missing assets) are computed server-side, ideally pre-aggregated

---

## PRIORITY ROADMAP — What to build when

This is the most important section for engineering planning.

**Principle:** anything cheap to add now and expensive to retrofit later goes in Phase 0 or Phase 1. Anything we can add cleanly when the customer demands it can wait.

### Phase 0 — Foundations (MUST exist before any tenant-shared production traffic)

These look optional but are 10x harder to retrofit. Build them now.

| # | Item | Cost now | Cost later if skipped |
|---|------|----------|----------------------|
| 0.1 | Tenant isolation in the data layer (composite indexes, Prisma middleware, RLS policies) | 1–2 weeks | Full audit + rewrite of every endpoint |
| 0.2 | Structured logging with correlation IDs (Pino, redaction, `requestId` + `companyId` + `userId` in every line) | 2 days | Cannot debug a production incident |
| 0.3 | Audit log table (actor, action, before/after diff, IP, userAgent, append-only) | 3 days | Regulator asks for it and you don't have it |
| 0.4 | Backup strategy + tested restore (RPO 5 min, RTO 1 hour, point-in-time recovery, quarterly drills) | 1 day | Catastrophic data loss |
| 0.5 | Error tracking (Sentry on API, web, mobile, tagged with `companyId`, `userId`, `releaseVersion`) | 1 day | Blind to production failures |
| 0.6 | Schema migration discipline (reversible, online-only, runbook per migration, no blocking ALTER on big tables) | Ongoing discipline | Hours of downtime per migration |
| 0.7 | Idempotency on every write endpoint (extend the `/sync/events` pattern to all writes) | 2 days | Duplicate records from retries are forever |
| 0.8 | API versioning strategy (`/v1/jobs`, `/v2/jobs`, `X-App-Version` header, 6-month deprecation policy) | 1 day | Cannot ship breaking changes without bricking old mobile installs |
| 0.9 | Environment separation (dev → staging → prod, separate databases, no production data in staging) | 2 days | Developers test in production |
| 0.10 | Secrets management (`JWT_ACCESS_SECRET` ≠ `JWT_REFRESH_SECRET`, rotation runbook, no secrets in git or client bundles) | Ongoing | Leaked secret + no rotation = full incident |
| 0.11 | Per-write request validation with zod or typebox schemas (replace `body as any` everywhere) | 3 days | Type drift, runtime errors, security holes |
| 0.12 | CI gates: typecheck, lint, unit tests, tenant-isolation integration test on every PR | 2 days | Regressions ship to production |

### Phase 1 — Pre-launch (must exist before first paying customer)

| # | Item | Notes |
|---|------|-------|
| 1.1 | Rate limiting (per IP, per user, per tenant, per endpoint class) | Redis-backed counters |
| 1.2 | Per-tenant cost attribution (DB query time, storage, queue time, bandwidth tagged by `companyId`) | Cannot reconstruct from logs later |
| 1.3 | Background job system (BullMQ on Redis, per-tenant fairness, retry with exponential backoff, DLQ with alerting) | Required for any non-trivial async work |
| 1.4 | Real-time / push notifications (APNs + FCM for mobile, WebSocket or SSE for planner live updates) | Logistics is inherently real-time |
| 1.5 | File storage strategy (S3/R2 with signed upload URLs, never proxy through API, tenant-scoped prefixes, lifecycle policies) | Photo POD is coming |
| 1.6 | Caching layer (Redis for sessions, rate limits, idempotency keys, hot dashboards) | Cache invalidation strategy per tenant |
| 1.7 | Force-update mechanism for mobile (API returns `minSupportedVersion`, app refuses to start if below) | Required for breaking sync protocol changes |
| 1.8 | Crash reporting on mobile (Sentry/Bugsnag, source map upload on EAS build) | Already needed |
| 1.9 | Load test harness (k6 or Locust, simulates a realistic customer, run before each major release) | Cheapest insurance available |
| 1.10 | Search infrastructure baseline (Postgres `pg_trgm` + GIN, plan migration to Meilisearch/Typesense at 5M rows) | Don't build full-text search by hand |
| 1.11 | GDPR-ready data export and deletion flow (subject access request export, tenant deletion with retention period) | Build before you have a tenant who asks |
| 1.12 | Driver consent flow for GPS tracking with revocation | Legal requirement in many jurisdictions |
| 1.13 | Webhook delivery system (HMAC signing, retries, delivery log) | Customers want integrations from day one |

### Phase 2 — Early scale (first 100 customers)

| # | Item |
|---|------|
| 2.1 | Read replicas for reporting / analytics queries |
| 2.2 | Connection pooling (PgBouncer in transaction mode) |
| 2.3 | Per-tenant feature flags (LaunchDarkly or self-hosted alternative) |
| 2.4 | Customer onboarding tooling (data import wizard, CSV/Excel) |
| 2.5 | Public API with API keys (separate from JWT user tokens, scoped permissions) |
| 2.6 | Customer-facing audit log / data export (GDPR SAR ready) |
| 2.7 | Internationalisation: language, currency, timezone, units (km/miles, litres/gallons) |
| 2.8 | Multi-country working time rules (UK + EU minimum: regulation 561/2006) |
| 2.9 | Tenant suspension / billing-blocked flag enforced across API, queues, mobile |
| 2.10 | Customer support impersonation tool (audited, time-limited, requires reason code) |

### Phase 3 — Mid scale (100 to 1,000 customers)

| # | Item |
|---|------|
| 3.1 | Time-series database for GPS telemetry (TimescaleDB or equivalent), with retention tiers (raw 7d, 1-min 90d, 5-min 1y) |
| 3.2 | Pre-aggregated dashboard tables (materialised views or trigger-maintained tables) |
| 3.3 | Database partitioning by tenant or by date for high-volume tables |
| 3.4 | Async report generation (CSV/Excel exports run as background jobs, signed download URLs) |
| 3.5 | SOC2 / ISO27001 readiness work |
| 3.6 | Tenant tier infrastructure (shared / dedicated-pool / dedicated-instance) |
| 3.7 | Multi-region deployment (or DR region at minimum) |
| 3.8 | Tachograph integration (UK/EU regulated HGVs) |

### Phase 4 — Large scale (1,000+ customers)

| # | Item |
|---|------|
| 4.1 | Sharding strategy (per-tenant or hash-based) |
| 4.2 | Dedicated DB clusters for enterprise tier |
| 4.3 | CDN/edge for read-heavy global content |
| 4.4 | Analytics warehouse (BigQuery / Snowflake / ClickHouse) — never run analytics on prod DB |
| 4.5 | Tenant hierarchy (parent company / subsidiary / sub-subsidiary) |
| 4.6 | Customer-controlled encryption keys (BYOK) |
| 4.7 | Regional data residency (EU, US, UK separate databases) |

---

## Compliance & Legal (Logistics-specific)

### GDPR / UK DPA

- Documented retention policy per data category (driver personal data, GPS, job history, audit log)
- Right to erasure flow (tested annually, with documented exceptions for regulatory retention)
- Subject access request export tool (drivers can demand all data held on them)
- Data Protection Impact Assessment (DPIA) for GPS tracking
- Lawful basis recorded per field
- Driver consent for GPS tracking with revocation
- Data Processing Agreement (DPA) template ready for B2B customers

### Tachograph / driver hours regulation

- HGVs over 3.5t in UK and EU require digital tachograph
- We integrate with tachograph data — we do not duplicate or replace it
- Know EU regulation 561/2006 before selling to EU customers
- UK Working Time Directive rules already implemented; expand per country at Phase 2

### Audit logging requirements

- Every read of sensitive driver data is logged
- Every cross-tenant admin action is logged
- Logs are tamper-evident (append-only with checksums)
- Logs retained for the longest applicable regulatory period

### Insurance and subpoena handling

- GPS data may be subpoenaed in accident cases
- Documented data handover policy
- Engineers never directly query prod for legal requests — dedicated, audited tool
- Legal hold flag on tenant data prevents deletion during active litigation

---

## Working Time Rules (UK)

- 60h max per week (hard block)
- 48h average over 17 weeks (warning)
- 11h rest between shifts (warning only — not hard block)
- Spare drivers can end shift with no truck or jobs
- POA (period of availability) excluded from working time, included in paid time

When expanding to other countries, this rule set must be parameterised per country and stored as data, not hard-coded.

---

## Database Models (current)

Key models in `api/prisma/schema.prisma`:

`Company`, `User`, `CompanyMembership`, `DriverProfile`, `PlannedJob`, `Shift`, `ShiftSegment`, `JobExecutionEvent`, `DriverAvailability`, `HolidayRequest`, `DriverWorkingTimeSummary`, `SavedLocation`, `JobTemplate`, `SyncEventLog`, `FleetUnit`, `FleetTrailer`.

Every model that holds operational data carries `companyId`. New models must follow this rule.

---

## Job Status Flow

```
pending → in_progress → arrived_pickup → collected → arrived_dropoff → completed
```

> **IMPORTANT — do not confuse job status values with stop type values:**
> - `arrived_pickup` / `arrived_dropoff` are `PlannedJob.status` enum values (the job's lifecycle state).
> - `JobStop.type` is a separate field with canonical values `collection` | `delivery`. Never use `pickup` or `dropoff` for `JobStop.type` — those were the old incorrect values that a backfill script corrected.

## Vehicle Flow

1. **Start Shift:** enter truck reg → do truck check (odometer at top)
2. **Trailer:** enter reg → do trailer check (if not solo / van)
3. **Mid-shift change:** Change Vehicle → odometer end + fuel + AdBlue for old → new check
4. **End Shift:** last vehicle odometer end + fuel + AdBlue → calculated totals shown

## Shift Flow

```
Start Shift → Jobs screen → tap job → vehicle confirm →
Start Pickup → Collected → Start Dropoff → Delivered →
Back to Jobs or End Shift → last vehicle modal → EndShift screen → Review → Submit
```

---

## Current Status (as of 2026-05-07)

### Mobile — nearly complete

- Login with Face ID + company picker
- Multi-company support (one person, multiple companies)
- Home screen: upcoming jobs preview (read-only), start shift, holidays, history
- Start Shift: week plan, truck selection, vehicle class, trailer, GPS
- Truck check: odometer at top, defect confirmation ("safe to proceed?")
- Trailer check: same flow as truck
- Jobs screen: truck banner + trailer banner (tappable), End Shift button
- Change Vehicle: mid-shift truck/trailer change, odometer end, fuel, AdBlue
- Job Detail: full delivery flow (pending → arrived_pickup → collected → arrived_dropoff → completed)
- Vehicle confirmation per job, trailer change detection
- After job complete: "Back to Jobs" + "No more jobs — End Shift"
- End Shift modal: last vehicle odometer/fuel/AdBlue (skip if spare driver)
- EndShift screen: shows calculated totals, no entry fields
- Spare driver: can end shift with no truck or jobs
- Holiday screen: allowance, request, status
- Resume shift → goes to Jobs (not StartShift)
- AppFooter "LogisticBay · Q25 Ltd" on main screens
- Discard button bigger and easier to tap
- Shift flow refactored — large `ShiftScreens.tsx` split into focused screens
- Offline sync UI added globally — banner shows offline / syncing / synced / failed states
- Offline sync retry UI added — failed sync shows Retry action
- Job events attach GPS + clientTimestamp when available
- Offline event queue hardened with retry metadata, failure state, and crash recovery

### Mobile — offline queue (rebuilt 2026-05-02)

- `src/offlineQueue.ts` rebuilt using `POST /sync/events` + `clientEventId`
- Production-hardened with status, retryCount, createdAt, lastAttemptAt, lastError
- Backward compatible with old queued events that lack metadata
- Treats stale `syncing` events as retryable after app crash/restart
- `src/hooks/useNetworkStatus.ts` monitors connection, auto-flushes on reconnect, tracks failedCount
- `src/components/OfflineBanner.tsx` active, wired into `App.tsx`, shows failed state + Retry
- `JobDetail/index.tsx` uses `useIsOnline`, optimistic UI when offline, queues to `/sync/events`
- `JobDetail/index.tsx` attaches GPS + clientTimestamp to online and offline job events
- `src/apiWithQueue.ts` is a deprecated stub — do not use

**Architecture:**
- Job status updates generate a `clientEventId` (UUID) on device
- Offline: events saved to AsyncStorage, optimistic UI update shown immediately
- Online reconnect: auto-flush via `POST /sync/events` (idempotent)
- Server: `SyncEventLog` deduplicates by `clientEventId`, `JobExecutionEvent` stores `clientEventId`
- Migration: `api/prisma/migrations/20260502000000_add_client_event_id_and_sync_log`

### Mobile — TODO

- Detention / waiting timestamps (arrived, loading start, loading finish)
- Full end-to-end test
- Offline queue real-device acceptance test using installed build (not Expo Go Wi-Fi-off)
- Offline login / profile cache and job list cache for true offline app start
- Photo POD (later, depends on file-storage Phase 1 work)

### Web Planner — TODO (next big phase)

- Live shifts view: who is driving, current status, vehicle
- Availability board: see all driver week plans
- Holiday approvals: approve / reject
- Driver profiles: min hours/day, holiday allowance
- Job list: truck/trailer columns, server-side filter + pagination from day one
- One-time location check (GPS snapshot + Google Maps link)
- Dashboard endpoint `/dashboard?date=YYYY-MM-DD` (server-computed, NOT client-aggregated)

### API — TODO (immediate)

- Confirm `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` set in Railway env vars
- Rotate old `JWT_SECRET` after split is confirmed
- Tighten timestamp sanity checks for online `/jobs/:id/status` `clientTimestamp`
- Add stricter sync payload validation tests
- Build audit-review screens for events flagged `needsReview`

---

## Code Quality Issues (audit 2026-04-29, still open unless noted)

Priority fixes:

1. ~~HomeScreen.tsx JSX broken~~ — verify resolved post 2026-04-30 typecheck pass
2. `ShiftScreens.tsx` 824 lines with 3 screens — split into `EndShiftScreen.tsx`, `ReviewScreen.tsx` (StartShiftScreen already split)
3. Extract `mobile/src/utils/shiftTime.ts` (time utils buried in ShiftScreens)
4. Extract `mobile/src/constants/jobStatuses.ts` (status labels duplicated)
5. API routes use `body as any` — replace with typed interfaces in `api/src/types/requests.ts` (also Phase 0.11)
6. `navigation: any` in all screens — needs `mobile/src/navigation/types.ts`
7. `components.tsx` mixes COLOURS + UI — split into `theme.ts` + `components/`
8. `useShift() as any` — needs proper TypeScript types in `ShiftContext.tsx`
9. `JobDetailScreen.tsx` 756 lines — split into `JobDetail/` folder (started)
10. `planner/index.html` 897-line monolith — migrate to `web/src/modules/planner/`

---

## Key Files

### API

- `~/timesheet-app/api/src/server.ts` — registers all routes
- `~/timesheet-app/api/src/routes/auth.ts` — login, register, refresh
- `~/timesheet-app/api/src/routes/companies.ts` — drivers, company management
- `~/timesheet-app/api/src/routes/jobs.ts` — job CRUD, status flow
- `~/timesheet-app/api/src/routes/shifts.ts` — shift lifecycle
- `~/timesheet-app/api/src/routes/availability.ts` — availability, holidays, working time
- `~/timesheet-app/api/src/routes/sync.ts` — offline event ingestion
- `~/timesheet-app/api/src/services/sync.service.ts` — sync business logic
- `~/timesheet-app/api/src/middleware.ts` — JWT auth middleware
- `~/timesheet-app/api/prisma/schema.prisma` — database schema

### Mobile

- `~/timesheet-app/mobile/App.tsx` — navigator, all screens registered
- `~/timesheet-app/mobile/src/AuthContext.tsx` — auth state
- `~/timesheet-app/mobile/src/ShiftContext.tsx` — shift draft state
- `~/timesheet-app/mobile/src/api.ts` — Axios instance with auto-refresh
- `~/timesheet-app/mobile/src/components/OfflineBanner.tsx` — global offline / sync / failure banner
- `~/timesheet-app/mobile/src/offlineQueue.ts` — offline job event queue, retry/failure metadata, AsyncStorage persistence
- `~/timesheet-app/mobile/src/hooks/useNetworkStatus.ts` — network monitor + queue auto-flush + retry trigger
- `~/timesheet-app/mobile/src/components.tsx` — legacy / shared components
- `~/timesheet-app/mobile/src/constants.ts` — vehicle classes, check items
- `~/timesheet-app/mobile/src/screens/HomeScreen.tsx`
- `~/timesheet-app/mobile/src/screens/StartShiftScreen.tsx`
- `~/timesheet-app/mobile/src/screens/JobsScreen.tsx`
- `~/timesheet-app/mobile/src/screens/JobDetail/index.tsx` — job execution flow, online/offline event creation, GPS metadata
- `~/timesheet-app/mobile/src/screens/ChecklistScreen.tsx`
- `~/timesheet-app/mobile/src/screens/ChangeVehicleScreen.tsx`
- `~/timesheet-app/mobile/src/screens/HolidayScreen.tsx`

### Web

- `~/timesheet-app/web/src/main.tsx`
- `~/timesheet-app/web/src/App.tsx`
- `~/timesheet-app/web/src/api/` — client, auth, jobs, drivers
- `~/timesheet-app/web/src/modules/` — planner, drivers, auth, settings

---

## Dev Tools

- Reset all shifts: `DELETE /dev/reset-shifts` (`company_owner` only, dev environments only — must be disabled in production)
- Test token: log in at logisticbay.com, copy from Network tab

## Notes for new chat sessions

1. Always read this file first: `cat ~/timesheet-app/DEVLOG.md`
2. Check recent commits:
   - `git -C ~/timesheet-app/api log --oneline -5`
   - `git -C ~/timesheet-app/mobile log --oneline -5`
3. After finishing work, update the relevant Status section above.
4. Add a session entry at the bottom of this file.
5. Commit message format: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`.

---

## Session History

The following section preserves the chronological record of major changes. New entries go at the end. Do not edit historical entries; correct them in the Status sections above.

---

### 2026-05-02 — Phase 1 Offline Sync (API)

**Built:**
- `POST /sync/events` endpoint for receiving offline job events from mobile
- Idempotency enforced by `@@unique([companyId, clientEventId])` — tenant-scoped, not global
- `SyncEventLog` audit table — records every ingest attempt regardless of outcome
- `sync.constants.ts` — single source of truth for review rules (7-day age limit, 1-hour future drift)
- `sync.service.ts` — business logic separated from route handler
- Migration `20260502082357_add_sync_fields` — applied locally, ready for Railway deploy

**New fields on `JobExecutionEvent`:**
- `clientEventId` — device-generated UUID, unique per company
- `clientTimestamp` — when event happened on device
- `serverReceivedAt` — when server received it
- `appVersion` — for debugging old client behaviour
- `needsReview` / `reviewReason` — flagged if event is over 7 days old or over 1 hour in future

**Acceptance test:**
- First call with `clientEventId: test-idempotency-001` → `accepted`
- Second call with same `clientEventId` → `duplicate` (not error)
- HTTP 200 on both calls
- One DB row created — idempotency confirmed

**Phase 1 supports only `collected` event type.** All other event types rejected with clear error message. More types added in Phase 2.

**Pre-existing issue (out of scope):** `shifts.ts` lines 94–95 — `CheckItem[]` / `Json` type mismatch — pre-dates this session.

**Production deploy instructions:**
1. Push is done — Railway auto-deploys the code
2. Manually run migration on Railway: `prisma migrate deploy` with Railway `DATABASE_URL`
3. Never run `migrate reset` on production

**TODO Phase 2:**
- Migrate `JobExecutionEvent.driverId` from `User` reference to `DriverProfile` reference
- Add remaining event types: `started`, `arrived_pickup`, `arrived_dropoff`, `completed`
- Mobile integration test with real device offline/online toggle

---

### 2026-05-02 — Phase 2 Sync (API)

**Built:**
- All remaining job event types added to `POST /sync/events`
- `sync.constants.ts` `SUPPORTED_EVENT_TYPES` now includes all 5 event types
- `sync.service.ts` adds `podNumber` and `deliveryNote` to `IncomingEvent` interface
- `sync.service.ts` adds `buildJobUpdate()` — single place that maps event type to job status and captured fields

**Event type mapping:**

| Event type | Job status set | Fields captured |
|------------|---------------|-----------------|
| `started` | `in_progress` | none |
| `arrived_pickup` | `arrived_pickup` | none |
| `collected` | `collected` | actualQuantity, actualUnit, collectionNote |
| `arrived_dropoff` | `arrived_dropoff` | podNumber, deliveryNote |
| `completed` | `completed` | podNumber, deliveryNote, actualQuantity, actualUnit |

No migration needed — service / constants layer only.

API sync system is now complete for all job status transitions. Mobile can queue any job event offline and sync when signal returns.

**Next steps (mobile session):**
- `AuthContext.tsx` — cache token + user profile to SecureStore on login
- On app open — read cached profile, attempt background token refresh
- If offline — use cached profile (access token is 7d TTL, covers full shift)
- Job list — cache to AsyncStorage on fetch, read from cache when offline
- Shift submit — queue to sync when offline

---

### 2026-05-02 — Mobile offline queue bug fixes

**Bugs fixed (mobile commit `fa9b830`):** three bugs in the offline queue path that would have prevented sync from working:

1. `QueuedJobEvent.status` renamed to `eventType` — field name now matches `IncomingEvent` on server
2. `STATUS_TO_EVENT_TYPE` map added in `JobDetail/index.tsx` — `in_progress` correctly maps to `started` (the only non-obvious mapping)
3. `flushQueue` filter fixed: `"applied"` → `"accepted"` — matches actual API response
4. `useNetworkStatus.ts` fixed: reads `{ synced, failed }` not `{ results }` — matches actual API response shape

Online path unaffected. Direct `api.patch` calls in `JobDetail` work as before. Only the offline queue path was broken.

**Current offline sync state:**
- API: fully complete — all 5 event types, idempotency, audit log
- Mobile queue: fixed — correct field names, correct response parsing
- Mobile offline login: not yet built (`AuthContext` still calls API on every app open)
- Mobile job list cache: not yet built
- Acceptance test on real device: not yet done

---

### 2026-05-02 — API TypeScript clean

- Fixed pre-existing `shifts.ts` `CheckItem[]` / `Json` type mismatch (lines 94–95)
- API TypeScript build now has zero errors across all files
- Commit: `a42f035`

---

### 2026-05-03 — API offline sync GPS + event metadata hardening

**Commits pushed:**
- `feat(api): add GPS support to offline sync events`
- `feat(api): validate GPS fields for sync events`
- `feat(api): improve holiday availability validation`
- `feat(api): add GPS metadata to online job events`

**What changed:**
- Added `gpsLat` and `gpsLng` to `JobExecutionEvent`
- Added migration `20260503100000_add_gps_to_job_execution_event`
- `sync.service.ts` now persists GPS coordinates from `/sync/events`
- `src/routes/sync.ts` validates GPS safely:
  - `gpsLat` and `gpsLng` must be provided together
  - latitude must be between `-90` and `90`
  - longitude must be between `-180` and `180`
- `src/routes/jobs.ts` online status updates now accept `clientTimestamp`, `gpsLat`, `gpsLng`
- Online job update and `JobExecutionEvent` creation now run in a single Prisma transaction
- `src/types/requests.ts` updated so `UpdateJobStatusBody` includes GPS / timestamp metadata
- Holiday availability and validation changes split into a separate commit instead of being mixed with sync

**Verification:**
- `npx tsc --noEmit` passed in API
- Commits pushed to `Q25ltd/logisticbay`

**Important remaining risk:**
- Offline sync is implemented and type-checked, but not fully real-device field-tested yet
- `clientTimestamp` sanity checking should still be tightened for online `/jobs/:id/status`

---

### 2026-05-03 — Mobile GPS event metadata + production offline queue hardening

**Commits pushed:**
- `feat(mobile): add GPS fields to offline queue events`
- `feat(mobile): attach GPS and clientTimestamp to job events`
- `feat(mobile): harden offline event queue retries`
- `feat(mobile): production-ready offline sync with failure handling and retry UI`
- `refactor(mobile): shift flow restructuring and UI updates (pre-offline polish)`

**What changed:**

`src/offlineQueue.ts`
- `QueuedJobEvent` now supports `gpsLat` and `gpsLng`
- Queue events track `status`, `retryCount`, `createdAt`, `lastAttemptAt`, `lastError`
- Old queued events without metadata are normalised and still sync
- Stale `syncing` events are retryable after app crash/restart
- Failed events are retained instead of silently disappearing

`src/screens/JobDetail/index.tsx`
- Captures GPS with `expo-location` when available
- Attaches `clientTimestamp`, `gpsLat`, `gpsLng` to online `/jobs/:id/status`
- Attaches GPS to offline queued job events
- Continues without GPS if permission denied or fetch fails

`src/hooks/useNetworkStatus.ts`
- Tracks `queueSize` and `failedCount`
- Auto-flushes queue on reconnect
- Exposes `triggerSync` for manual retry
- Adds explicit `failed` sync state instead of misusing `offline`

`src/components/OfflineBanner.tsx`
- Shows offline, syncing, synced, and failed states
- Shows failed count
- Exposes Retry action for failed sync

`App.tsx`
- Passes `failedCount` and `triggerSync` into `OfflineBanner`

Large shift-flow restructuring committed separately after offline commits were isolated.

**Verification:**
- `npx tsc --noEmit` passed in mobile after each sync/offline change
- Commits pushed to `Q25ltd/logisticbay-mobile`

**Current truth:**
- Offline sync is architecturally production-grade and type-checked
- Offline sync is **not yet field-proven** — real installed-build testing is pending
- Do not mark offline as fully accepted until tested on a production-like mobile build, not Expo Go

**Required acceptance test (mandatory before sign-off):**
1. Install app build on real device
2. Log in online
3. Load assigned jobs
4. Start shift
5. Disable network / use airplane mode
6. Perform job status actions offline
7. Kill app and reopen
8. Confirm queued actions still exist
9. Re-enable network
10. Confirm banner shows syncing then synced, or failed with Retry
11. Confirm API has correct `JobExecutionEvent` rows with `clientEventId`, `clientTimestamp`, `gpsLat`, `gpsLng`
12. Confirm duplicate retry does not create duplicate events

---

### 2026-05-03 — API cleanup and production sync

**Migrations applied to production:**
- `20260502082357_add_sync_fields` — sync fields on `JobExecutionEvent`, `SyncEventLog` table
- `20260502120000_add_poa_mins` — POA field on `Shift`, working time calculation fix
- `20260503100000_add_gps_to_job_execution_event` — GPS coords on `JobExecutionEvent`

All 4 migrations applied and confirmed. Database schema is up to date.

**Outstanding:** Railway JWT variables (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`) need confirming in Railway dashboard.

---

### 2026-05-03 — Mobile fixes (mobile session)

**Bugs fixed (commits `5f20b54`, `891c284`, `0d15d17`):**
- POA correctly excluded from working time, included in paid time
- Fuel and AdBlue values no longer lost when driver changes vehicle
- Odometer label on `ChecklistScreen` now reads dynamically from `draft.odometerUnit` (not hardcoded `miles`)
- History screen now shows both working hours and paid hours separately

**EAS update published:**
- Branch: production
- Platforms: iOS + Android
- Update group: `94b06ecd-e1cd-4703-adb8-638d3fec1f0b`

**Still open:**
- Railway JWT variables — `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` need confirming in Railway dashboard
- Real device offline acceptance test (needs standalone build)
- Web Planner MVP (next major phase)

---

### 2026-05-07 — Scale and tenant isolation architecture update

**Decision:** LogisticBay must be built for many tenants and large data volume from this point forward. Tenant isolation is not optional and must be implemented in every file and every data path. The Architecture Rules and Tenant Isolation sections of this document are the canonical reference.

**Important current gaps:**
- Planner Dashboard v1 derives dashboard data client-side. This is acceptable only as MVP validation. Before real scale, replace with a tenant-scoped dashboard API and indexed queries.
- Basic structured request/error logging now includes requestId/userId/companyId when authenticated. Remaining gaps: no Sentry/error tracking, no full append-only audit log, no Redis cache, no background job system, and rate limiting is still basic in-process/API-level rather than per tenant.
- No staging environment. CI runs no tenant-isolation integration test. Must be added.

**Required before scale rollout:**
1. Tenant isolation integration test on every deploy
2. Dashboard API with `companyId`, date, filters, summaries, warnings
3. Jobs API pagination and server-side filters
4. Database indexes reviewed for planner / dashboard / search queries (see required indexes list above)
5. Tenant-scoped search design
6. Background smart-warning / recommendation jobs that run per `companyId`
7. Phase 0 foundations completed in full (see Priority Roadmap)

---

### 2026-05-07 — Urgent safety fixes from DEVLOG pass

**Fixed in code:**
- Production API startup now runs `prisma migrate deploy`; removed production `prisma db push` from `api/start.sh` and `migrate:prod`.
- Planner job delete is now a soft cancel: job evidence, stops, load details, execution events, and audit rows are preserved. Jobs with loaded linked trailers are blocked from deletion until replanned/unloaded.
- Fleet unit/trailer delete is now soft archive (`status = deleted`) and hidden from default fleet lists. Loaded linked trailers cannot be deleted.
- Driver holiday edits no longer hard-delete existing holiday request rows; old rows are marked `deleted` and hidden from active lists.
- Online job status updates now accept `clientEventId`, deduplicate by `(companyId, clientEventId)`, and reject invalid / older-than-7-days / more-than-1-hour-future `clientTimestamp`.
- Mobile online job status updates now send a device-generated UUID `clientEventId`.
- Dev-only `DELETE /dev/reset-shifts` now returns 404 in production.
- API request/error logs include requestId, userId, companyId, role, method, URL, and status where available.
- Added baseline tenant-first indexes for planner, dashboard, fleet, shifts, holidays, and operational event queries via migration `20260507170000_add_tenant_scale_indexes`.

**Still urgent / not done:**
- Dedicated server-side Dashboard API and Jobs cursor pagination.
- Tenant-isolation integration test in CI.
- True append-only audit log coverage for every sensitive read/write.
- Staging environment and tested restore/rollback runbook.
- Search/trigram indexes and duplicate cleanup before fleet registration uniqueness constraints.

---

### 2026-05-07 — Devlog rewrite and architecture charter

This document was rewritten to combine the historical session log with the architecture rules, tenant isolation discipline, scale planning, and prioritised roadmap. Engineers must read the top half (rules + roadmap) at the start of every chat session and before every PR review. Session history below the roadmap is appended; do not edit historical entries.

---

### 2026-05-07 — Phase 0 foundations batch (database empty, safe to restructure)

**companyId on ShiftSegment and DeliveryTask (migration 20260507200000)**
- Both models now carry `companyId` with FK to Company and tenant-scoped indexes.
- Two-step SQL: add nullable → backfill from parent Shift → make NOT NULL.
- Shifts route now passes `companyId` when creating segments and deliveries.

**Append-only AuditLog table (migration 20260507210000)**
- General audit table covering all entity types (Driver, FleetUnit, FleetTrailer, HolidayRequest, Shift, Job, etc.).
- DB-level `RULE` blocks UPDATE and DELETE — rows are immutable once written.
- `src/lib/audit.ts`: `writeAudit()` and `writeAuditBatch()` helpers. Failures are caught and logged — audit never breaks the main request.
- Wired into: driver create, driver update, driver status change, holiday request create, holiday request approve/reject.
- `JobAudit` table kept for backward compat; `AuditLog` is the new general table.

**Zod validation schemas — Phase 0.11**
- `src/schemas/auth.ts`, `drivers.ts`, `jobs.ts`, `shifts.ts`, `availability.ts`, `locations.ts`, `fleet.ts`
- `src/lib/validate.ts`: `parseBody()` and `parseQuery()` helpers returning typed result objects.
- Wired into: auth login/refresh/change-password, register-company, driver create/patch/status, shift create/segment/delivery/submit, holiday request create/approve, availability POST, shift-preference POST.
- All covered route handlers now validate before use; no bare `body as any` on these paths.

**Also committed this session (carried from previous session):**
- Web Dashboard and Jobs: date range quick pills (Today | ±7d | ±14d | ±30d) + manual from/to inputs.
- API: `dateFrom`/`dateTo` range filter on `GET /jobs`.
- API: soft-cancel on job delete; fleet unit/trailer soft-archive.
- API: `clientEventId` deduplication on online job status updates.
- API: `DELETE /dev/reset-shifts` returns 404 in production.
- API: structured logging with `requestId`, `companyId`, `userId`.
- API: `prisma migrate deploy` on startup (removed unsafe `db push` from production).
- API: tenant-scale indexes migration (20260507170000).
- DEVLOG/SAFETY: architecture charter and safety rules documents.

**Remaining Phase 0 items (not yet done):**
- 0.1 RLS policies — Postgres Row-Level Security on every tenant-scoped table.
- 0.2 Structured logging — Pino with redaction, `requestId` + `companyId` + `userId` in every line (partial: exists on request level, not in all background jobs).
- 0.4 Backup strategy + tested restore (Railway point-in-time, quarterly drill).
- 0.5 Sentry error tracking on API, web, mobile.
- 0.6 Schema migration discipline — runbook per migration (ongoing practice).
- 0.7 Idempotency on ALL write endpoints — extend clientEventId to all writes (only job events today).
- 0.8 API versioning strategy — `/v1/jobs`, `X-App-Version`, deprecation policy.
- 0.9 Staging environment — separate DB, no prod data.
- 0.10 Secrets management — confirm `JWT_ACCESS_SECRET` ≠ `JWT_REFRESH_SECRET` in Railway.
- 0.12 CI gates — typecheck, lint, unit tests, tenant-isolation integration test on every PR.
- Server-side Dashboard API and Jobs cursor pagination.
- Repository pattern — typed repositories requiring `companyId` as first argument.

---

### 2026-05-10 — Job Form Vocabulary Unification (Phase 0 of JOB_FORM_IMPLEMENTATION_BRIEF.md)

**Goal:** Establish a single canonical vocabulary for vehicles, trailers, driver licences, and equipment across API, web, and mobile. Fixes three separate incompatible vocabularies that blocked allocation matching.

**Created:**
- `shared/vehicleTaxonomy.ts` — single source of truth: BODY_CATEGORIES, GVW_CLASSES, BODY_TYPES, ONBOARD_EQUIPMENT, DRIVER_LICENCE_CLASSES, DRIVER_ENDORSEMENTS, TRAILER_LENGTHS, revised SERVICE_TYPES, revised JOB_TYPES, helper functions.
- `api/src/constants/vehicleTaxonomy.ts` — identical copy (JS/TS import boundary).
- `web/src/constants/vehicleTaxonomy.ts` — identical copy.
- `mobile/src/constants/vehicleTaxonomy.ts` — identical copy.
- `web/src/lib/textCase.ts` — `applyCase(value, rule)` helper for proper_name / address_line / sentence / upper / lower / none transforms.
- `mobile/src/lib/textCase.ts` — identical copy.
- `scripts/check-vocab-sync.ts` — CI guard: hashes all three taxonomy copies, fails build if they diverge.
- `api/scripts/backfill_vocab_v1.ts` — one-shot migration script to populate new fields from legacy values.

**DB migration `20260510120000_vocab_unification` (additive — no columns dropped):**
- `DriverProfile`: added `endorsements Json?`, `canDriveCategories Json?`
- `PlannedJob`: added `reqBodyCategory`, `reqGvwMin`, `reqBodyType`, `reqEquipment`, `reqLicenceClass`
- `FleetUnit`: added `vehicleClassLegacy`, `bodyCategory`, `gvwClass`, `bodyType`, `onboardEquipment`. Legacy `vehicleClass` stays.
- `FleetTrailer`: added `bodyType`, `trailerLength`, `decks`, `compartments`, `onboardEquipment`. Legacy `trailerType` stays.

**API changes:**
- `api/src/constants/jobCreation.ts` — replaced VEHICLE_CLASSES / TRAILER_TYPES with re-exports from taxonomy. Kept LOAD_UNITS, JOB_STOP_TYPES.
- `api/src/schemas/jobs.ts` — added reqBodyCategory, reqGvwMin, reqBodyType, reqEquipment, reqLicenceClass. Removed trailerTypesForbidden.
- `api/src/schemas/fleet.ts` — replaced vehicleClass with bodyCategory + gvwClass + bodyType + onboardEquipment. Trailer schema: bodyType + trailerLength + decks + compartments.
- `api/src/schemas/drivers.ts` — narrowed licenceClass to B/C1/C1E/C/CE enum; added endorsements, canDriveCategories.
- `api/src/services/jobValidation.ts` — validation now uses isBodyCategory, isBodyType, isOnboardEquipment. reqBodyCategory required for ready_to_plan. Tractor without trailer types → warning.
- `api/src/routes/jobs.ts` — maps new req* fields through; stops writing trailerTypesForbidden.
- `api/src/routes/fleet.ts` — unit routes write bodyCategory/gvwClass/bodyType/onboardEquipment; trailer routes write bodyType/trailerLength/decks.

**Web changes:**
- `web/src/modules/jobs/createJobConstants.ts` — imports from taxonomy, removes local VEHICLE_TYPES/MIN_SIZES/TRAILER_TYPES/EQUIPMENT_OPTS/DRIVER_QUALS.
- `web/src/modules/jobs/CreateJobPage.tsx` — Section 05 rewritten with cascading picker (body category → GVW → body type → trailer type → equipment → licence → endorsements). Auto-suggests licence from body category. Legacy vehicleClass values mapped to new fields in edit/template mode.
- `web/src/modules/jobs/createJobPayload.ts` — maps reqBodyCategory, reqGvwMin, reqBodyType, reqEquipment, reqLicenceClass, reqEndorsements to API body. Removed trailerTypesForbidden.
- `web/src/modules/fleet/fleetConstants.ts` — removed VEHICLE_CLASSES / TRAILER_TYPES display strings; kept UNIT_STATUSES / TRAILER_STATUSES.
- `web/src/modules/fleet/UnitForm.tsx` — cascading body category → GVW → body type → equipment picker.
- `web/src/modules/fleet/TrailerForm.tsx` — body type → trailer length → decks → compartments (tanker only) → equipment.
- `web/src/modules/drivers/DriverForm.tsx` — licenceClass is now a `<select>` with 5 canonical options. Endorsements are a MultiCheck.
- `web/src/modules/planner/JobDetailDrawer.tsx` — removed "Trailer forbidden" row. Shows trailer allowed, equipment from reqEquipment or equipmentRequired.

**trailerTypesForbidden removed:**
User decision: selecting trailer types ALLOWED implicitly forbids all others. A separate "forbidden" list conflicts with the "allowed" list and adds confusion with no practical benefit. Column left in DB (null on new records) — can be dropped in Phase 0.8 soak.

**Typechecks:** `npx tsc --noEmit` → exit 0 in both `api/` and `web/`.

**Migration status:** `20260510120000_vocab_unification` is deployed to production (confirmed via `prisma migrate deploy` 2026-05-12).

**Backfill status:** `api/scripts/backfill_vocab_v1.ts` — run status **unconfirmed**. If `FleetUnit`, `FleetTrailer`, or `DriverProfile` rows exist in production that pre-date this migration, the backfill must be run once: `DATABASE_URL=$DATABASE_URL_PROD npm run backfill:vocab`.

---

### 2026-05-12 — Public request form, data dictionary, misc fixes

**Commits:** `5f5bc22`, `0e1fe7c`, `eb029f0`, `7eea363`, `a693c68`

**Public request form (`web/src/modules/requests/PublicRequestForm.tsx`):**
- Added all missing fields matching the `JobRequest` schema: `craneRequired`, `trailerTypesAllowed`, `vehicleAccessNotes`, `requirePOD`, `weighbridgeRequired`
- All required fields now validated before submit
- Rejection policy clarified: requests go to `pending` review, not auto-approved
- `driverNotes` renamed to `driverVisibleNotes` in the payload (maps to the DB column)

**Misc fixes:**
- API: only sends `Content-Type: application/json` header when the request has a body
- Removed mobile submodule ghost reference; fixed migration drift; corrected blob typing
- Replaced non-logistics emojis with appropriate alternatives across all web UI

**Data dictionary (`DATA_DICTIONARY.md`):**
- Full data dictionary written covering all DB models, JSON blobs, and form fields
- This is the authoritative field reference — code agents must consult it before naming any new field

---

### 2026-05-12 — Canonical field naming — system-wide Phase 2

**Commit:** `2249e95`

**Goal:** Eliminate all field name aliases so every concept has exactly one name across DB columns, JSON blobs, API types, form state, and UI components.

**StopState interface** (`web/src/modules/jobs/createJobTypes.ts`):
- `stopType` → `type`
- `unitBuilding` → `unitName`
- `refNumber` → `referenceNumber`
- `driverNotes` → `instructions`

**CreateJobPayload / buildBody** (`web/src/modules/jobs/createJobPayload.ts`):
- ~20 state variable renames to match canonical names
- Removed duplicate aliases: `minSize`, `equipmentReq`, `driverQuals` (canonical `reqGvwMin`, `reqEquipment`, `reqEndorsements` are used instead)
- **Critical bug fixed:** `buildBody()` was converting `stop.type === "collection"` to `"pickup"` before sending to the API — writing wrong values into `JobStop.type`. Fixed: now sends `stop.type` directly (`"collection"` or `"delivery"`).

**SavedLocation DB column renames** (`api/prisma/schema.prisma` + migration `20260512000000_saved_location_canonical_fields`):
- `addressText` → `locationTextSnapshot`
- `latitude` → `lat`
- `longitude` → `lng`
- Migration applied to production 2026-05-12.

**All dependent code updated:**
- `web/src/modules/jobs/StopCard.tsx` — `applyLocation()`, `LocationSearch` filter
- `web/src/modules/locations/LocationsPage.tsx` — form state, submit, filter, display
- `web/src/modules/jobs/CreateJobPage.tsx` — all state vars, template load/save, alt address
- `web/src/modules/jobs/createJobUtils.ts` — `makeStop()`, `jobStopToStopState()`
- `web/src/modules/templates/TemplatesPage.tsx` — `stopSummary()` backward compat
- `web/src/types/index.ts` — `SavedLocation` interface, `TemplateJobData` interface (canonical + legacy optional fields for reading old stored templates)
- `api/src/routes/jobs.ts` — SavedLocation create/update/read
- `api/src/routes/jobRequests.ts` — request field reads
- `api/src/types/requests.ts` — `CreateLocationBody`, `PatchLocationBody`
- `web/src/api/jobRequests.ts` — frontend API client types

**New backfill scripts:**
- `api/scripts/backfill_job_stop_type.ts` — fixes existing `JobStop` rows: `type = 'pickup'` → `'collection'`, `type = 'dropoff'` → `'delivery'`. Run: `DATABASE_URL=$DATABASE_URL_PROD npm run backfill:job-stop-type`. Safe to re-run.
- `api/scripts/backfill_stops_v2.ts` — fixes `JobRequest.stops[]` blob field names to canonical names (e.g. `companySiteName→siteName`, `addressLine1→street`, `entranceLatitude→lat`, `customerReference→customerRef`). Run: `DATABASE_URL=$DATABASE_URL_PROD npm run backfill:stops-v2`. Safe to re-run.

**Verification:** `tsc --noEmit` → 0 errors in both `web/` and `api/`. Deployed to production via `main` branch push.

---

### 2026-05-13 — Code quality: middleware, lib extraction, Customer nullable fields

**Commits:** `8a82672`, `42aac94`, `4bd3d9d`, `724742e`

**JWT middleware fix (`api/src/middleware.ts`):**
- Replaced `jwt.verify(...) as any` with a Zod-validated payload schema
- `request.user` is now typed as `{ userId, companyId, role }` — bad tokens are rejected at the boundary, not silently passed through

**Route helper extraction (`api/src/lib/`, `api/src/services/`):**
- `lib/coerce.ts` — `toNullableNumber`, `toNullableDate`, `optionalString`, `optionalNumber`, `optionalDate`
- `lib/vehicleCompat.ts` — `legacyVehicleToRequirement`, `normalizeEquipment`, `normalizeShiftVehicleClass`, `canDriveCategoriesForLicence`
- `lib/jobUtils.ts` — `hasLoadDetailsInput`, `appendPlannerReason`, `buildStopData` (eliminates 40-line duplicated stop shape between POST /jobs and PATCH /jobs)
- `lib/dateUtils.ts` — `toISODate`, `isWorkingDay`, `getWeekStart`, `checkRestPeriod`, `holidayDates`, UK bank holidays
- `lib/geo.ts` — `distanceMiles`, `checkEntranceDistance`
- `lib/driverUtils.ts` — `driverProfileData` (all driver profile fields in one place)
- `services/jobValidation.ts` — `findInvalidStopLocationId` (DB-querying helper)
- `sync/sync.constants.ts` — added `EVENT_TYPE_MAP`
- All route files updated to import from lib/services; inline helpers removed

**Customer nullable fields (`api/prisma/schema.prisma`, migrations `20260513000000`, `20260513100000`):**
- `contactName`, `contactPhone`, `contactEmail`, `notes` changed from `String @default("")` to `String?`
- Two migrations required: the first (20260513000000) only dropped DEFAULT — a second migration (20260513100000) was needed to also `DROP NOT NULL` and backfill `'' → NULL`
- `customers.ts` write paths updated: CREATE uses `|| null`, PATCH distinguishes "not sent" from "explicitly cleared"
- **Pattern for other models:** see CLAUDE.md — fix optional fields model-by-model when doing feature work, not as a sweep

**Ongoing known issue — `String @default("")` on optional fields:**
- ~145 fields across `PlannedJob`, `JobStop`, `DriverProfile`, `SavedLocation`, and others still use empty string as null substitute
- These will be fixed model-by-model as feature work touches each model
- Do not fix all at once — migration risk outweighs benefit
- `Customer` is the only model fully fixed as of this date

**Test suite:**
- All 27 tenant-isolation tests pass on a clean database
- CI failure was caused by the incomplete first migration (missing `DROP NOT NULL`); fixed by `724742e`

---

### 2026-05-16 — Railway migration crash: Run model phase 1

**Incident:**
Railway API startup failed during `prisma migrate deploy` on migration `20260516000000_phase1_run_model`.
Initial error was Prisma `P3018` / PostgreSQL `42P07`: relation `Run_companyId_runReference_key` already existed while the migration attempted to add the same unique constraint. Later restarts showed Prisma `P3009` because `_prisma_migrations` now contains a failed migration row.

**Fix in repo:**
- Patched `api/prisma/migrations/20260516000000_phase1_run_model/migration.sql`.
- Unique constraint creation now checks both `pg_constraint.conname` and `pg_class.relname` for:
  - `Run_companyId_runReference_key`
  - `RunAssignment_runId_sequenceNumber_key`
- Follow-up: patched `api/prisma/migrations/20260516000001_jobpart_restriction_fields/migration.sql` to use `ADD COLUMN IF NOT EXISTS` after Railway revealed those columns had already been created by prior schema sync/drift.

**Verification:**
- `DATABASE_URL=postgresql://user:pass@localhost:5432/db npx prisma validate --schema prisma/schema.prisma` → pass.
- `DATABASE_URL=postgresql://user:pass@localhost:5432/db npx prisma generate` → pass.
- `npx tsc --noEmit` in `api/` → pass.

**Production recovery still required:**
The Railway database must have the failed migration state cleared before deploy can proceed. Use `prisma migrate resolve --rolled-back 20260516000000_phase1_run_model` followed by `prisma migrate deploy`, or reset the Railway database if it is confirmed disposable. Local CLI cannot reach Railway's internal `postgres-dj9q.railway.internal` host; use Railway internal execution, a TCP proxy/public connection URL, or the Railway dashboard.
