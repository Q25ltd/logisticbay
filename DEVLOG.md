# LogisticBay — Developer Log

> Historical record of every session: what was built, what was decided, what is still outstanding.
> Read this to understand the WHY behind past decisions and avoid re-debating closed questions.
> Do NOT rewrite history — only append. New entries go at the TOP.
> Last updated: 2026-06-07

---

## Runs — B5: hard resource gate on publish (release blocker #1) 2026-07-12

Both publish routes now enforce the B1 readiness gate server-side. `loadRunReadiness(prisma, companyId, runId)` extracted into `runReadinessService.ts` (was ~50 lines inlined in the GET route) and shared by `GET /runs/:id/readiness`, `POST /runs/:id/publish`, and `POST /planning/runs/:id/publish`. Publish → 400 `RESOURCE_NOT_READY` with the named blockers in the message + `details.blockers` while any **hard** check fails; soft/unknown never block (per B1's honesty rule). The S5 compatibility override is applied inside the loader (`compatibilityOverridden` → effective flags true), so an explicitly overridden compat failure cannot re-block publish through the readiness path — and the GET readiness now agrees with what publish will actually do. Real hole closed: the planning publish route had **no driver requirement at all** (only the client disabled the button). New `publishResourceGate.test.ts` (hazmat+no-ADR blocked → ADR fixed passes → planning route blocks driverless run); `runCompatibility.test.ts` fixture driver now `canUseTrailer: true` — the new gate correctly flagged the old bare fixture (trailer assigned, driver not trailer-rated). Gates: typecheck 0/0 · vocab ✅ · api tests 203/203.

## Small fixes — run-card times, search bars, coil≠oil 2026-07-12

Three user-driven fixes in one push batch: **(1)** run cards now show collection → delivery date/times (`runTimes` in `runUtils.ts` — first stop's window start → last stop's booked time with a "booked" chip, or window fallback; UTC wall-clock so no browser-timezone shift; wraps instead of truncating). **(2)** All three search bars (Runs, Planning board, Jobs) had the magnifier emoji rendered on top of the placeholder — `.input`'s `px-3.5` beats the `pl-8` utility in the cascade; removed the overlay icons. **(3)** Job-detail tanker warning fired on "Steel coils" because the liquid-keyword check used substring matching and "coil" contains "oil" — switched to a whole-word regex; verified ethanol still warns, coils don't.

## Runs — candidates ignored `trailersAllowed` (flatbed suggested for a fridge job) 2026-07-12

User caught it in use: the picker suggested a flatbed for a job that only allows fridge trailers. Root cause in `GET /runs/:id/candidates` (`api/src/routes/runs.ts`): `acceptableBodyTypes` was built from `job.bodyTypes` only — but for tractor/artic jobs the allowed trailer bodies live in **`job.trailersAllowed`** (`bodyTypes` is the rigid's own body). Every seeded artic job has `bodyTypes: null`, so the trailer-body constraint was an empty list and `computeRunCandidates`' "needs X" check never fired. Fix: select `trailersAllowed` and merge both into `acceptableBodyTypes`. Proven against real data: fridge-only job on a fresh run → `Trans 28 · Flatbed` now `suitable=false`, reasons `["not refrigerated", "needs fridge"]`. Gates: typecheck 0/0, api tests 190/190. (Known remaining gap, already in STATUS: truck column doesn't yet compare load weight vs GVW at pick time — the publish gate still catches it.)

## Runs — allocation ON the run card + company-assets reference panel + full responsive pass 2026-07-01 → 2026-07-12

Several iterations driven by direct user correction until the screen matched the planner's actual workflow: *"allocation must be done on the card; the side panel just shows what the company has."*

**Final shape (the keeper):**
- **Run card = the workplace.** Each table row carries: run ref, route (origin → destination), requirement badges (⚠ ADR / ❄ Temp / 📏 Oversized / weight in tonnes), **"View job <ref> →" links** (to `/app/jobs/:id` — full job record without leaving Runs), stops + load summary, and **inline Driver/Truck/Trailer pickers** — custom dropdowns (not native selects) fed by the B4 `GET /runs/:id/candidates` endpoint on open, each candidate showing fit %, ★ Suggested, busy-on-run, sorted best-first. Pick → immediate `PATCH /runs/:id` → reload. "Needs: <trailer type>" hint under an empty trailer picker.
- **Right panel = read-only company-assets reference** (`AssetsReferencePanel`): the FULL fleet in 3 columns (Drivers | Units | Trailers), every asset as a mini-card with name/plate, detail (shift hours / class·GVW / trailer body type), and live status dot — green Available / amber `on RUN-x` / red off-road-or-inactive — available sorted first, "N free" per column. Never assigns anything.
- `RunAllocationPanel.tsx` deleted for good (briefly restored when the requirement was misread as panel-based allocation, then removed again once "allocation on the card" was confirmed). `RunsPage.tsx` is the single Runs surface.

**Two real bugs found by auditing my own output (user: "check all you done and fix it"):**
1. The picker popover was `position:absolute` inside the table's `overflow-x-auto` wrapper → **clipped invisible** for most rows (this had been misdiagnosed as a screenshot-tooling quirk). Fixed with `position:fixed` coords from the trigger's `getBoundingClientRect()`, closing on outside-click/scroll/resize.
2. `AssetPicker` was defined **inside** the `RunsPage` component → remounted on every parent render, losing open state + candidate cache. Hoisted to module level.

**Responsive pass (measured, not eyeballed — DOM `scrollWidth` checks at 1440/1280/1024/768/375):**
- Two-pane container `flex-col lg:flex-row` — stacks below 1024 (was: side-by-side at every width, crushed).
- Table `min-w-[680px]` inside `overflow-x-auto` — scrolls in place on narrow screens instead of crushing pickers to slivers.
- Found via element-overflow walk: the `badge` "Published" chip overflowed its 8% column and forced a phantom horizontal scrollbar even at 1440 — replaced with the screen's slim chip style + rebalanced colgroup (Run 14 / Stops 5 / assets 20·18·20 / Readiness 12 / Action 11%); ReadinessCell hard `w-28` → `w-full max-w-28`.
- Assets panel: 3 columns down to `sm`, stacked on phones; `sticky`/max-height scoped to `lg` only.
- Verified: 1440 & 1280 zero scroll; 1024 table scrolls internally only; 768 stacked, panel full-width (3×225px columns); 375 clean, no page-level horizontal scroll anywhere.

Gates: typecheck 0/0 · vocab sync ✅ · api tests 191/191 · knip identical to main baseline (119/82/25). Verified live in the user's Chrome (DOM-level, real click → PATCH → DB row confirmed) and in the preview browser at all five viewports.

## Runs — consolidate to one screen + fix layout proportions 2026-07-01 (later same day)

User feedback (harsh, and correct): two screens did almost the same job, and the panel/table proportions were unusable at real screen sizes — never actually tested below 1440px, and the candidate-picker's 3-column layout truncated driver/truck names to unreadable fragments.

**Consolidation.** Audited every capability of `RunDetailPage.tsx` (829 lines) before touching anything: driver/truck/trailer assignment duplicated `RunAllocationPanel` (same `runsApi.candidates`/`readiness` calls, dropdowns instead of cards); add-stop/sequencing/split were already fully owned by the Planning board (`planningApi.addStop`, `resequence`, the capacity-banner split button); cancel/delete-run was already live on Planning too (✕ button, `handleDeleteRun` → `patchRun({status:"cancelled"})`). Nothing needed building anywhere. Deleted `RunDetailPage.tsx` and the `/app/runs/:id` route. Fixed the three links that would have 404'd (`DashboardPage.tsx`, `PlanningBoardPage.tsx` ×2) to `/app/runs?id=<id>` instead, and added deep-link support in `RunsPage.tsx` — forces the range filter to "All runs" (target run's date is unknown from the caller) and opens the panel immediately. Verified live: created a run dated weeks out, hit the deep link, panel opened with no console errors.

Still separate and NOT consolidated: `AssignDrawer.tsx` — a third, legacy Job-level assignment system used from the old Dashboard (`jobsApi.allocate`, string `assignedTruck`/`assignedTrailer` fields on Job, predates the Run model entirely). Out of scope for this pass; flagged in STATUS.md as the real remaining B6 work.

**Layout fix.** Three concrete bugs, found by actually measuring instead of guessing: (1) the 4 stat-card boxes wrapped to 2×2 under 1280px and ate most of the vertical space before a single run row was visible — replaced with one compact single-row strip (`StatGroup`, was `StatPanel`). (2) The table had no explicit column widths, so the Run cell (now 3 lines: ref, route, status) visually dominated while Driver/Truck/Trailer stayed single-line and looked tiny by comparison — added a `<colgroup>` with fixed percentages. (3) The candidate picker's driver/truck/trailer columns were squeezed 3-across in a 400–460px docked panel, truncating names to `"N…"` / `"Te…"` / `"F…"` — changed to a vertical stack (`flex flex-col gap-4` instead of 3-up `flex`), one section at a time, full width, scrollable. Screenshotted and verified at 1280×800, 1366×768, and 1440×900 this time — the sizes that should have been checked before the first version was called done.

Gates: typecheck 0/0, vocab ✅, api tests 189/189 (RunDetailPage's own tests didn't exist — nothing to remove), knip zero new unused exports vs main.

Further pass on the two-pane Runs screen against a second mockup screenshot (same horizontal top nav kept — no sidebar).

**`RunsPage.tsx`** — toolbar rebuilt above the stat panels: date + range (day / 7-day window / all runs, drives `dateFrom`/`dateTo` on `runsApi.list`), search (matches run ref / driver / truck / trailer), Filters popover (status checkboxes), **Auto allocate** (sequential per-run best-candidate assignment via B4 `candidates` + existing `update` — sequential so a later run's candidate fetch already reflects the earlier run's saved assignment, no double-booking), Settings link, **New Run** (creates a draft via existing `runsApi.create` and opens it in the panel). Table gained row checkboxes (feed Auto allocate's scope — selected rows only, else all "attention" rows), Group by (driver/status) and Sort by (status/reference/readiness).

**`RunAllocationPanel.tsx`** — header now derives route (origin → destination) and load summary from the run's sorted assignments/jobPart, plus a single status chip ("Missing driver/truck/trailer" or "Ready"); added a "This run needs" row of ✓/✗ chips; each candidate column got a drag-and-drop target (cards are `draggable`, dropzone parses a small JSON payload keyed by kind so a trailer card can't be dropped on the truck column) and a "best matches only" toggle; Save button is now a split button — **Save allocation** / **Save & publish**.

**Export cleanup (pre-existing B1–B4 files, not newly written this session):** `npx knip` flagged 8 new unused exports vs the `main` baseline — `Candidate`/`ReadinessTruck`/`ReadinessTrailer`/`ReadinessLoad`/`CheckStatus`/`ReadinessCheck` were `export`ed from `runCandidatesService.ts` / `runReadinessService.ts` (API) and `ReadinessStatus`/`ReadinessCheck` from `web/src/api/runs.ts`, but nothing outside those files imports them by name — only the compute functions and their direct-parameter types are consumed. Dropped `export` on all 8 (module-private now); confirmed zero diff against baseline afterward.

Gates: `npm run typecheck` 0/0, `npm run check:vocab` ✅, `npm test --prefix api` 200/200, `npx knip` — zero new unused exports vs `main`. Verified live in preview (create run → drag/pick driver+truck+trailer → Save → table updates, readiness recalculates, no console errors).

## Runs — two-pane "Allocate Resources" screen matching the mockup 2026-07-01

The earlier remake used dropdowns; the mockup (shared this session) is a **two-pane master/detail**: grouped fleet-overview stats + a runs table on the left, and a **three-column candidate picker** (DRIVER / TRUCK / TRAILER) on the right. Rebuilt to match.

**`RunAllocationPanel.tsx` (new)** — the right pane. Fetches the run + B4 candidates + full driver/fleet records and renders each driver/truck/trailer as a **visible card** (initials avatar, on-duty dot, `Xh shift`, ADR badge, deterministic **fit %**), grouped **Best matches** (available & suitable) then **Other available**, each with per-column search and "view all". Click a card to select (toggle), a **Current allocation** footer shows Driver/Truck/Trailer (or "Missing"), and **Save allocation** PATCHes the run. Header shows readiness as **% + Ready / N left**, where % = `passed ÷ total` checks — an honest progress bar, NOT a fuzzy confidence score (keeps the gate rule intact). Fit % is deterministic (100 − 8·reasons, −12 if unsuitable), used only to order/label cards — labelled "fit", not "match", and never fabricated.

**`RunsPage.tsx` (rebuilt)** — grouped **overview panels** (Runs / Drivers / Trailers / Trucks) computed **truthfully** from the day's runs + fleet + drivers: Runs→Total/Missing driver/Missing trailer/Ready; fleet groups→Total/Available/Allocated/Off-road (Available = in-service and not allocated to a today run). Deliberately did NOT invent "On leave / Workshop / VOR" splits the mockup shows — we don't capture those yet, so they're omitted rather than faked. **Tab filters** (All / Missing driver / Missing trailer / Missing truck / Ready) with counts. Table columns Run · Stops · Driver · Truck · Trailer · Readiness (% bar) · Action; Driver/Truck/Trailer show a red **Missing** chip when unassigned. Clicking a row (or **Allocate**) opens the panel beside the table; **Publish** stays gated on `readiness.ready`.

Not yet built (still backlog, told the user): drag-and-drop into the allocation zones, top-level **Auto-allocate**, driver **avatars** (using initials), truck **make/model** + **defect** status and trailer **pallet capacity** (fields not in schema yet), and the numeric **"% match"** is our deterministic fit, not a learned score. Gate: web typecheck ✅ 0.

## Runs — UI remake toward the mockup (overview cards + allocation card) 2026-06-30

Reworked the Runs screens to match the planner mockup while keeping all B1–B4 logic.

**Runs list (`RunsPage.tsx`)** — replaced the status-pill row with **five overview cards that ARE the filter**: Active runs / Need attention / No driver / Ready to publish / Published (click to filter, click again to clear; a completed/cancelled toggle sits on the right). Per-run state is derived once from status + readiness (`attention | checking | ready | published | done`), drives both the cards and the sort (attention first). Rows gained a **Window** column (est. start–end) and the driver now reads from `readiness.assigned.driver` with a fallback to `run.driver`; an attention row is tinted amber. Publish stays gated on `readiness.ready`.

**Run detail (`RunDetailPage.tsx`)** — split the monolithic "Run Details" card into a prominent **Allocation** card (driver / trailer / vehicle, with an inline ready/blocker chip and the ★ best-fit hints) and a separate **Schedule & notes** card (date + times on one row, notes, end instruction). No logic change to save/publish/candidates.

Scope held deliberately tight (no drag-allocate, no auto-allocate yet — those stay on the backlog). Gate: web typecheck ✅ 0.

## Runs — driver hours = full preferred shift (theoretical allocation, not live) 2026-06-24

User clarified the phasing: **Runs allocation is theoretical, not live** — every driver shows their **full `preferredShiftHours`** (no consumed/remaining tracking). Live remaining hours (tacho) are the **Live phase (last)**. Matches the three-worlds model (Planning/Runs theoretical · Live = reality).

Built into the candidates (B4): `DriverLite.preferredShiftHours`; ctx `runDurationHours` (computed in the route from the run's `estimatedStartTime`/`estimatedEndTime`, "HH:MM"). Driver candidate label now shows the shift (e.g. **"Dave · 8h"**); if the shift can't cover the run's planned duration it adds a **soft** note (`shift 8h < run ~11h`) that does NOT flip suitability and never blocks — and the **recommended driver prefers one whose shift covers the run** (Sue 13h over Dave 8h for an 11h run). Web option labels surface the soft note. Readiness `driver_hours` reworded: *"Allocation uses the full preferred shift; live remaining hours are tracked on the Live screen."* Test added (`runCandidatesService.test.ts`). Gate: typecheck api+web ✅ 0.

## Runs/Planning — flatbed-chemicals fix + executable split (Step 9) 2026-06-24

User reported a flatbed carrying chemicals getting wrong suggestions, and that a recommended split couldn't be performed. Audited every load/asset check:
- `checkLoadVehicle`, `runCompatibility` (S5), `suggestVehicle`, `vehicleSuitability` (Q5b) — all **correct** for flatbed+ADR (flatbed isn't ADR-unsafe; ADR recommends open bodies).
- **`runCandidatesService` (B4) — the bug:** it took only `bodyTypes[0]`, so a chemical job accepting `[curtain, flatbed]` flagged the flatbed *"needs curtain"*; and it never applied the ADR rule (would've recommended an enclosed box). **Fixed:** match **any** acceptable body, and reject `ADR_UNSAFE_BODIES` for hazmat (reusing the canonical sets from `checkLoadVehicleService` — single source). Regression test pins it (flatbed accepted, box rejected).
- **Trailer-requirement rollup gap (both run systems):** `recalculateDerivedRequirements` (runs.ts) and the planning.ts equivalent set `requiredTrailerType` for temp/oversized but **not hazmat**. Added `hasHazardous → curtainsider_or_flatbed` (open body) in both.

**Executable split (LOAD_MOVEMENT_PLAN Step 9):** the capacity check recommended "split into N" but there was no action. Data model already supports it (`RunAssignment.quantityAssigned` + addStop accepts a partial qty; PRODUCT #2 — split distributes quantity across RunAssignments, stays one Job). Built **`POST /runs/:id/split { keepQuantity }`** (tx): this run keeps `keepQuantity` per over-size stop, the remainder of each moves to a NEW `runType:"split"` run (`generateRunReference`, `plannerNotes:"Split from RUN-X"`), then `recalculateDerivedRequirements` on both — ledger stays balanced (26+14=40). Web: an **"✂ Split into N runs"** button in the planning capacity banner (auto by `capacity.maxSpaces`, adjustable after) → `handleSplitRun` → refresh. Gate: typecheck api+web ✅ 0. The split fix-it makes the capacity recommendation actionable.

## Runs — B4: see-your-fleet candidates (available + suitable) 2026-06-24

User point: the B3 allocation selects were blind lists of registrations — you couldn't see what's free, what suits the load, or what's already on another run; you'd pick a reg and only then readiness would fail. Fixed with a candidates endpoint that shows fleet STATE at the moment of allocation.

**`runCandidatesService.ts` (pure):** `computeRunCandidates(ctx, fleet, busy)` annotates every driver/trailer/truck with `available` (not on another run that day), `suitable` (fits the load — body type / refrigeration / hazmat / trailer rating), `busyOn` (the conflicting run ref), `recommended` (available **and** suitable; trailers prefer an exact body match so a fridge isn't grabbed for a curtain job), and sorts each list recommended → fit → free → rest, with `reasons[]` explaining any unsuitability.

**Route `GET /runs/:id/candidates`:** assembles the fleet (trailers/trucks/drivers) + the run's load requirements (hazmat/temp/needs-trailer/body-type from the assignments' jobs) + a **busy map** (every non-cancelled run on the same `plannedDate` → assigned asset ids, generalising the existing driver-conflict check to trailers/trucks).

**Web:** the three allocation selects are now candidate-aware — options read e.g. `TR102 · fridge ★`, `TR103 · curtain · on RUN-9` (busy), `TR101 · curtain · not refrigerated` (unsuitable reason), sorted recommended-first; each has a **"★ Recommended: <asset> · N available & suitable"** quick-pick that one-click selects it. Falls back to the plain fleet list until candidates load.

Verified via node + test (`runCandidatesService.test.ts`): temp-controlled hazmat trailer load → fridge trailer + ADR driver + free truck recommended; curtain flagged "not refrigerated"; busy assets flagged with the run ref; nothing recommended when all busy. Gate: typecheck api+web ✅ 0. **Next: B5 — hard-on-publish (block the backend publish on hard resource failures, override for soft).**

## Runs — B3: detail allocation + readiness panel + gated publish 2026-06-24

`RunDetailPage` was driver-only allocation. Now it's the full canonical allocation surface:
- **Trailer + Vehicle (unit) selects** added next to Driver (trailer-first per PRODUCT), populated from `planningApi.getFleet()`; `handleSave` patches `assignedTrailerId`/`assignedTruckId` (backend already supported it) and re-fetches readiness.
- **Readiness panel** (renders B1 `GET /runs/:id/readiness`): a Ready/Not-ready pill + every resource check with a ✓/⚠/✗/? icon and its reason, plus a "To publish: …" blocker line. Copy frames the distinction: *"Planning proved the movement is good; these checks prove this driver, vehicle & trailer can execute it."*
- **Publish is gated**: when readiness is loaded and not ready → a disabled "Publish — not ready" button (blockers as tooltip); when ready → the active publish. (Backend S4/S5 gate remains the backstop.)

Gate: typecheck web ✅ 0 (api unchanged). **Next: B4 — smart resource suggestions (best available + suitable trailer/driver), reusing the suitability engine.**

## Runs — B2: Runs table (scan-50, renders B1 readiness) 2026-06-24

Rebuilt `RunsPage` from a card list into the **table** the Runs vision calls for:
**Run · Driver · Trailer · Vehicle · Status · Readiness · Publish**. Each row pulls
`GET /runs/:id/readiness` (B1) for the assigned-asset labels + the gate. Rows **sort
problems-first** (not-ready → ready → published → completed/cancelled) so the planner
works top-down; date + status filters kept; a day-summary chip strip (runs · *N not
ready* · published). **Readiness** cell shows `✓ Ready` or `⚠ <first blocker> +N`
(tooltip = all blockers); **Publish** is an inline button **enabled only when
`ready`** (disabled with the blockers as its tooltip otherwise) → `runsApi.publish` →
reload. Row click → detail. Backend: readiness route response gains `assigned
{ driver, truck, trailer }` (regs) so the table renders from one call per run (Run has
no truck/trailer relation to include). Web `runsApi.readiness` + `RunReadiness` type.
Gate: typecheck api+web ✅ 0. *Note: per-run readiness is N calls/day — fine now; a
batch endpoint is a later optimisation.* **Next: B3 — detail truck/trailer allocation
+ readiness breakdown panel + gated publish.**

## Runs — B1: run readiness service (resource checks + publish gate) 2026-06-24

First Phase B build. Runs answers a different question from Planning — Planning: *is this a good movement?* (coverage/capacity/timing); Runs: *can THIS driver + truck + trailer execute it?* Built the **Readiness model** as the keystone (the table column + the detail both render from it).

**`runReadinessService.ts` (pure, no DB):** `computeRunReadiness(input)` → `{ ready, blockers[], resources: { checks[], passed, total } }`. **Ready is a GATE** (boolean + named blockers), not a blended % (a fuzzy 82% reintroduces the confusion Runs removes). Resource checks: driver assigned/available/licence/ADR(hard when hazardous)/trailer-capability; trailer assigned (hard when the load needs one)/compatible (**carries the S5 `trailerCompatible` flag — not recomputed**)/available; vehicle assigned (soft — unit is a later phase)/compatible; equipment (soft, driver-skill or vehicle-onboard); MOT / VOR / driver-hours-remaining surfaced as **`unknown`** (honest — data not captured yet; never a fake tick, never blocks). Hard `fail` → blocks publish; soft/unknown never block alone.

**Route `GET /runs/:id/readiness`:** loads the run + driver (DriverProfile) + assigned truck/trailer + the assignments' job requirements (hazardClass / equipment / vehicleCategory→requiresTrailer), assembles the pure input, returns the readiness. Reuses the run's stored `trailerCompatible`/`vehicleCompatible`.

Verified via node: no-driver → blocked; full compatible set → ready (9/12, the 3 unknowns don't block); hazmat+no-ADR / needs-trailer-none / incompatible-trailer / wrong-trailer-type → each blocked with a clear reason; no-stops → never ready; missing vehicle → soft warn (still ready). Test: `runReadinessService.test.ts` (8 pure cases). Gate: api typecheck ✅ 0. **Next: B2 — rebuild RunsPage as the scan-50 table (Run·Driver·Trailer·Vehicle·Status·Readiness·Publish) rendering from this.**

## Planning — surface silent add-stop failures (release hygiene) 2026-06-24

Last genuine planning code gap before release: `handleAddJobToRun` / `handleAddPartToRun` looped `addStop` with `catch { /* skip */ }` — a stop that failed to attach (already on another run, validation, network) was **silently dropped**, leaving a run quietly missing a load that could then be published. Now failures are counted and surfaced via the existing `err` banner ("Couldn't add N stops for <customer> — it may already be on another run. Check the run before publishing."). Covers the drag-to-run, batch-add, "Add collection", and yard-relay flows (all route through these handlers). Gate: typecheck api+web ✅ 0.

**Planning is now feature-complete per PLANNING_PAGE_DESIGN** — remaining items are all PARKED post-release (Q5c/e, Q5d, hard-on-publish, A4/A5, route map, constraints, Movement persistence). Only gate left is the Mac verification (tests + knip + incognito). Cleared to start Phase B (Runs).

## Planning — date-independent "At yard / In custody" pool 2026-06-24

User concern: a load collected and dropped at a yard (relay / DC / trailer swap) can sit for **days** before its onward run is planned — how do we not forget it? Found the gap: `getPlannerWorkItems` is **date-scoped** (parts whose timeWindow/bookedTime fall in the viewed range), AND an in-custody job has status `collected` (excluded from the `ready_to_plan/in_planning` filter), so a yard-stored load **vanishes from view** until you happen to look at the right date — exactly the "forgotten load" risk.

**Fix (`plannerWorkService`):** added a **date-independent** yard fetch — latest custody per job via `loadTrack.findMany({ distinct: ["jobId"], orderBy timestamp desc })`, keep jobs whose latest custody base is `yard`, then fetch their **onward (delivery) leg** regardless of date where it's not yet on an active run and the job isn't completed/cancelled. Merged into the work list (deduped) so the existing `in_custody` grouping + card rendering pick them up. `PlannerWorkItem` gained `custodyLocation` (e.g. `yard:7`) + `inCustodySince` (ISO, for age).

**Web:** the freight card now shows a blue **"📦 YARD 7 · 2 days"** badge for in-custody loads (same card as before, marked as *at yard*), in the existing "Collected — in custody" section (GROUP_PRIORITY 1 → near top). Helpers `ageAtYard` / `yardLabel`. So a yard load is visible **every day** with its age until its delivery is planned and completed, then it leaves the pool. Covers relay, DC/hub, and trailer-swap (all end with custody at a yard).

Test: `plannerWorkService.test.ts` — a yard load with NO date match still surfaces as `in_custody` with `custodyLocation`/`inCustodySince`. Gate: typecheck api+web ✅ 0. **Mac:** `npm test --prefix api`.

## Docs — consolidation (26 → 10 active) 2026-06-24

Doc sprawl was a drift risk (same procedure in several files). Triaged all root `*.md`,
kept the **10 canonical** (CLAUDE, PRODUCT, ARCHITECTURE, DATA_DICTIONARY, STATUS,
LOAD_MOVEMENT_PLAN, PLANNING_PAGE_DESIGN, QUESTIONS, SAFETY, DEVLOG), and **moved 16 to
`docs/archive/`** (user choice: archive, not delete; cleanup era declared done):
- 10 `*_INVESTIGATE.md` (Steps 1–6, Phase A/A2/A3/A4) — investigate-first scratch for DONE steps.
- `JOB_INTAKE_FLOW_AUDIT.md` — one-off audit that spawned LOAD_MOVEMENT_PLAN.
- `PLANNING_BOARD.md` — superseded by PLANNING_PAGE_DESIGN.
- `PLANNING_LOAD_FEASIBILITY_DESIGN.md` — open items (Q5c/e, Q5d, hard-on-publish) folded into PLANNING_PAGE_DESIGN §5 first.
- `CODE_AUDIT.md`, `CLEANUP_PLAN.md`, `MESS_PREVENTION.md` — cleanup-era; durable rules already in CLAUDE.md "Preventative rules" (now the single source).

Added `docs/archive/README.md` (what/why/superseded-by). Repointed live references:
CLAUDE.md (CODE_AUDIT/CLEANUP_PLAN → archive paths; dropped the stale TASK 0.6 ref),
ARCHITECTURE.md + STATUS.md (PLANNING_BOARD → PLANNING_PAGE_DESIGN; feasibility doc →
PLANNING_PAGE_DESIGN §5). DEVLOG left untouched (append-only history). No code change.
`docs/archive/` also still holds an older pre-existing archival set — untouched.

## Direction — Load Movement Planning System reframe + PLANNING_PAGE_DESIGN.md 2026-06-24

A planning session reframed the product: **LogisticBay is a Load Movement Planning System**, not a run planner. Planning's job is to decide *the best way to move each load*; runs/drivers/trailers/live are stages of executing that decision. Captured as a new canonical doc **`PLANNING_PAGE_DESIGN.md`** (added to the CLAUDE.md doc index).

Key points recorded:
- **Layered model Job → Movement → Run → Load Journey.** The missing middle is the **Movement** (the planning-time strategy decision + its legs). The **Load Journey** = the custody path, which already exists at execution time as the `LoadTrack` ledger — so this is an *additive* planning layer, **not** a re-architecture. Reconciled with PRODUCT.md locked decision #1 ("Run is central") via a planning-layer addendum: Run stays central for *execution*.
- **Planning is building, not firefighting.** Validation (Q1–Q5) stays in the background — quiet "looks good" by default, loud only on a real problem, and always paired with a *building action* (Add collection / Yard relay / Split). The compact run-check + one-click fixes built this week are this direction.
- **Movement-strategy catalogue** (direct, multi-drop, groupage, relay-via-yard, relay-handover, swap, split, tramper, hub, backload) mapped to UI/UX + the Job constraint each needs + which are built; mechanics defer to LOAD_MOVEMENT_PLAN Part B.
- **Job constraints layer** (`storageAllowed`/`relayAllowed`/`directPreferred`/`timeCritical`/`tramperAllowed` + existing `canSplitShipment`) — "Job defines the rules, Planning chooses the move." Schema currently has only `serviceType` + `canSplitShipment`; the rest is the cheapest high-value next step (no re-architecture).
- **Confidence stays honest** (deterministic only; learning engine later). **Recurring runs parked** (templates carry strategy/constraints, never stale operational data — the Paragon failure mode).
- **Staged plan:** (1) capture constraints, (2) make Movement a visible/accepted unit (build all runs of a relay/split from one Accept), (3) persist the Movement/Load-Journey object via LOAD_MOVEMENT_PLAN, gated behind movement Steps 7–10.

Docs touched: new `PLANNING_PAGE_DESIGN.md`; `PRODUCT.md` (planning-layer addendum under decision #1); `CLAUDE.md` (doc index row); `QUESTIONS.md` (§0z — 4 open questions). No code change.

## Planning — job quick-look drawer (read-only) 2026-06-21

Planner need: open any job for a quick look without leaving the board. Built `web/src/modules/planning/JobQuickLook.tsx` — a read-only slide-in drawer (right side, backdrop + Esc close, `Open full job →` link to `/app/jobs/:id`). Fetches the full job via `jobsApi.get(id)`. Sections ordered per the planner's stated priority: **Goods & handling** first (goods type/description, qty, weight, dimensions, temp/hazmat/fragile/stackable flags, special requirements), then vehicle requirement, then **Stops & timing** (each stop: window/booked time, address, contact, booking ref, opening hours, access/handling, instructions), then notes + references.

Wired into `PlanningBoardPage`: `peekJobId` state + an **ⓘ** button on each unplanned `JobWorkCard` (drag-safe — stops propagation) and each `RunLane` stop row; both call `onPeek(jobId)`. No backend change (reuses the existing job-detail endpoint). Gate: web typecheck ✅ 0 (also confirms every `JobPart` field used exists).

**Planning-check redesign (same session):** rebuilt the run-lane check from stacked text lines into a **consistent tile strip** (`CheckTile` component) — the same tiles render every time, colour-coded by state (green/amber/red/neutral), so the planner's eye learns the layout: **Coverage · Confidence · Compatible · Vehicle · Capacity · Detour · Driver hours**. The **Driver-hours tile** is now shown (`~Duty` headline, `drv · Nbrk` sub, red >13h duty / amber on 10h-extension or long day). Added a plain-English **headline banner** for the worst issue with an inline **"Find collection →"** fix-it on coverage failures (sets the board search to the uncovered customer so matching collections surface in Unplanned Freight). `RunLane` gained `onFindCollection` (→ `setSearch`). Web typecheck ✅ 0.

**Layout (same session):** moved the **Proposals panel to a full-width horizontal strip on top** (was a vertical list at the bottom of the narrow Jobs column) — cards are now fixed-width (`w-72`) side-by-side in a horizontal-scroll row, header gained a "Movement plans suggested by the system" subtitle + a **Refresh** button + collapse. **Widened the Unplanned-Freight column** `sm:w-80 lg:w-96` → `sm:w-96 lg:w-[28rem] xl:w-[30rem]`, and bumped freight-card legibility (stop labels 10→11px / w-14→w-16, location 11→12px, more row padding/spacing) so it's easier to read what's being planned. Web typecheck ✅ 0.

**Planning comfort pass (same session):** four UX fixes after a screen review —
1. **One-click missing collection.** Root friction was a job split across two columns: the delivery sits in a run flagged "no collection" while its collection sits in Unplanned Freight. Main now builds `unplannedCollectionByJob` (jobId → unplanned collection part); `RunLane` computes deliveries with no in-run collection (and no feeder run) and the fix-it banner shows **"+ Add collection — <customer>"** which adds it to *this* run in one click (via existing `onDropPart`). Falls back to "Find collection" (search filter) when no unplanned collection exists.
2. **Compact / collapsible run check.** The 7-tile strip is now **collapsed by default** to a one-line summary (status pill · confidence · duty) with a **Details ▾** toggle — so a planner can see many runs without scrolling. Per-run `checkExpanded` state.
3. **De-emphasise tiles on invalid runs.** When coverage is broken, non-coverage tiles are greyed (`dim()` → neutral) so the red error isn't fighting green ticks; the Confidence tile reads **"—" / "Blocked — fix coverage first"** instead of an ambiguous dash.
4. **Day-summary + reclaim space.** Slim header chips (**Runs N · Trucks x/y · Drivers x/y · M unplanned**); Proposals strip **auto-hides when empty** (returns null); 0-count sidebar pool rows dimmed.

Web typecheck ✅ 0.

**Yard relay — one-click link (planning side of LOAD_MOVEMENT_PLAN B2 / Step 6):** building a relay-via-yard (driver A collects → drops at yard; driver B picks from yard → delivers) was technically possible (Collect-only/Deliver-only buttons + yard waypoints + Run-settings `runType=relay`/`dependsOnRunId`) but took ~6 hidden steps and the new "Add collection" fix-it dead-ended once the collection was on another run. Added detection + a one-click action: when a run's uncovered delivery has its **collection on another run**, the banner shows **"🔗 Yard relay from RUN-X"** → `handleLinkRelay` sets `dependsOnRunId`+`runType=relay` on this run and drops a **yard_pickup** waypoint here + a **hub_drop** on the source run (yard = company depot, skipped if already present). Coverage then clears (hasFeederRun true *and* yard pickup present — double safety). Reuses existing `onUpdate`/`onAddWaypoint` (both `loadRight`-refresh), so no backend change — the S6 custody execution already supports it. Web typecheck ✅ 0.

**Yard picker (same session):** the relay link now opens a compact inline picker — "Drop & pick up at: [yard ▾] [Link relay] [Cancel]" — listing the **depot first** then the company's saved locations, defaulting to depot and remembering the last choice for the session. The chosen yard is used for both the `hub_drop` and `yard_pickup` waypoints. Web typecheck ✅ 0.

Remaining ideas: "Split run" action (needs split endpoint), a small route map, and a resizable freight column.

## Planning Q5b — vehicle-type suitability (fixes "van load + artic load = Compatible") 2026-06-21

User point: at planning the **driver is a variable** (allocated later; shift patterns are a later phase) so the check must not assume one — what's *certain* is vehicle type, load, destination, time, and **vehicle type wasn't being checked**. Screenshot RUN-2026-000009 grouped an 11t/22-pallet artic load with an 85 kg/12-item van parcel job and read "Compatible". `checkLoadMixing` only looked at temperature/hazmat/oversized.

**Build (uses ALL available info, advisory at planning):**
- Extracted the weight→class logic into `lib/vehicleClass.ts` (`categoryFromWeight`, `KG_PER_PALLET`, `classRank`, `classCanCarry`) — shared with `suggestVehicleService` (removed its private copies; deleted its dead `PAYLOAD_KG`).
- `lib/vehicleSuitability.ts`: per load, required class = most-demanding of declared `vehicleCategory`, `minGvwClass` (numeric→class), and weight/pallet-derived class. Flags (a) a **class mix** — a van-class load sharing a run with an HGV-class load (high); (b) when a vehicle is **allocated**, whether it suits — under-class/over-payload high, wrong body type / missing equipment medium. A substitute is fine if it **meets-or-exceeds** (bigger vehicle OK), so honest substitutions pass and only mistakes flag.
- `checkRunService`: `RunStop` gains `weightKg` + declared `reqVehicleCategory/reqMinGvwClass/reqBodyTypes/reqEquipment`; input gains `assignedVehicle`; result gains `vehicleSuitability`. Loads deduped per job (weight not double-counted across collection+delivery). High suitability conflicts lower confidence (penalty 50) but **never block** Accept; medium = 18.
- Routes: `/ai/check-run` accepts + passes `assignedVehicle` (per-stop fields flow through the `RunStop[]` cast); `/planning/propose-runs` threads weight + declared category/gvw; `RUN_INCLUDE` job select gains `vehicleCategory`/`minGvwClass`.
- Web: `ai.ts` types (`vehicleSuitability`, stop fields, `assignedVehicle`); `planning.ts` job type; board passes per-stop weight + declared requirement + the assigned truck's `category`, and shows a **"Vehicle ✗/⚠ — Mixing a van-class load … with a rigid-class load …"** lane signal.

Verified by node: the screenshot mix → high "these usually need different vehicles"; van under 11t → "too small"; artic under a 200 kg load → OK (substitution allowed); over-payload → high; two HGV loads → OK. Tests: `vehicleSuitability.test.ts` (pure, 11 cases) + `checkRunService.test.ts` Q5b describe (screenshot mix lowers confidence, van-too-small, coherent load OK). Gates: typecheck api+web ✅ 0. Hard-on-Runs-publish (against the actual allocated truck+trailer) extends S5 later. **Mac:** `npm test --prefix api` + `npx knip`.

## Planning Q3c — window-wait timing + real duty spread (fixes "90% on an impossible run") 2026-06-21

User-found bug (screenshot RUN-2026-000009): a run that delivers Midlands at Lichfield (12:00–15:00) then drives back to collect NHS at Nottingham (11:00–12:00 — already closed) showed **Confidence 90% / Long duty 12h54**. Physically impossible, flagged feasible.

**Root cause:** the time-window loop never modelled **waiting for a window to open**. Arriving early didn't idle the clock, so the internal schedule ran ~hours fast and every downstream stop looked on-time. It also reported duty as drive+dwell+breaks, ignoring the real depot→base spread.

**Fix (`checkRunService`):**
- The schedule clock now **waits** when the driver reaches a customer stop before its window opens (`timeWindowStart`/`bookedTime`); idle time pushes all later stops back, exposing out-of-order plans. Gated to `WORK_STOP_TYPES` so a depot/return-to-base waypoint's planned time isn't treated as a window to sit idle for.
- New `spreadMin` = real depot-start → last-stop span incl. waits. The duty/spread check and `legal.dutyMin` now use it (fallback to the buffered total when no start time). So a 03:00→18:00 day reads as ~14–15h duty, not 12h54.

Verified by node simulation of the exact pattern: the closed-window collection lands **130–140 min late**, `minSlackMin` −140, spread **14.1h** → severity high, confidence ~0 (was 90%). Old code reached that collect at 07:20 and passed it.

**Tests** (`checkRunService.test.ts`, Q3c): the out-of-order plan → concern high, negative slack, confidence <60 (fails on pre-fix code); an in-order plan with a 5h early start waits, stays feasible, and `dutyMin` reflects the wait. No web change — the "Driver hours · Duty ~Xh" line now shows the real spread automatically. Gate: api typecheck ✅ 0.

## Planning Q3b — drivers'-hours model: repeating breaks + working time 2026-06-21

User flagged the run-duration / legal-hours model was thin. It was: drive legs (ORS or 60 km/h fallback) ×1.15 + 45 min/stop + **one** 45-min break if driving passed 4.5h, plus a single ">9h driving" hard flag.

**Bug found while building:** the original break logic was leg-based and skipped the final leg — so a **single long leg** (e.g. London→Edinburgh, ~11h driving) got **zero** breaks. Breaks must derive from *total* driving, not leg boundaries. Fixed.

**New model (`checkRunService`, deterministic, no AI):**
- **Repeating 561 break** — `drivingBreakCount = max(0, ceil(rawDriveMin / 270) − 1)`. A 9h day = 1 break, 11h = 2. Leg-independent; the schedule loop now places breaks at each 270-min cumulative-driving point (capped at the legal count) so intermediate-stop arrival slack includes them.
- **9→10h extension band** — driving > 10h (`EXTENDED_DRIVE_MIN=600`) is a **high** hard flag; 9–10h is a **low** advisory "relies on the 10-hour extension (≤2×/week)" with `legal.usesExtension=true`. (Was a single ">9h" hard flag.)
- **Working Time Directive** — 30-min break once on-duty work passes 6h when no 561 break already covers it (lots of dwell, little driving). Added to time + a low note.
- **Daily duty/spread** — total run (drive + dwell + breaks) > ~13h (`MAX_DUTY_MIN=780`) medium; > ~11h (`LONG_DUTY_MIN=660`) low. (Replaces the old 12h/10h "long day".)
- New structured `legal: { drivingMin, drivingBreakCount, workingMin, dutyMin, usesExtension }` on the result; added to all five returns (`ZERO_LEGAL` for the empty-stops case).

**Web:** `ai.ts` `RunCheckResult` gains `legal`; board shows a **"Driver hours — Driving Xh ⚠(10h extension) · N × 45-min breaks · Duty ~Yh"** lane line (new `fmtHm`).

**Tests** (`checkRunService.test.ts`, no-DB): short run = 0 breaks + legal summary; **the fix** — London→Edinburgh single 11h leg = **2** breaks (not 1), >10h high, `usesExtension=false`; 9–10h band → `usesExtension=true` + 2 breaks; duty > driving + breaks. Break-count + band numbers verified against the haversine fallback via node. Gates: typecheck api+web ✅ 0. **Mac:** `npm test --prefix api` (now globs `src/services/*.test.ts`).

**Still per-run, not per-driver-day** (by the chosen scope): hours already driven earlier in the day, 11h daily rest, and weekly limits are NOT carried — that needs a driver-hours ledger and belongs with the Runs/Live screens. Noted for later.

## Planning Q5a — fleet-aware pallet capacity (forced split) 2026-06-21

Extends the planning check from "is every drop collected?" (Q4) to "can the company actually carry this whole?". A load's **pallet footprint** (stackable halves it: 40 stackable → 20 floor spaces) is compared against the **largest available vehicle the company actually owns**. If nothing fits, the run is flagged and a recommended split count is given — the planner's 40-pallet / no-double-deck case → **split into 2** (collect in one go, carry on 2 trailers).

**New lib (`api/src/lib/loadCapacity.ts`, pure, no schema change):**
- `trailerPalletSpaces({lengthM|trailerLength, decks})` — floor spaces ≈ round(length/13.6 × 26) × decks. 13.6 m single = 26, double-deck = 52.
- `buildFleetCapacityProfile(trailers)` → `{ maxPalletSpaces, hasDoubleDeck, trailerCount }` from **available** trailers only (out-of-service/disposed don't count toward what a planner can assign).
- `checkCapacity({pallets, stackable}, fleet)` → `{ ok, footprint, maxSpaces, splitInto, reason }`. footprint = stackable ? ceil(pallets/2) : pallets. No fleet registered → ok + "can't be checked"; no pallet data → ok.

**`checkRunService` (Q5a):** `RunStop` gains `pallets`/`stackable`; input gains `fleet`; result gains `capacity`. Run footprint = sum of pallets on **collection** stops (peak load), treated non-stackable if any load is non-stackable (conservative). Over-capacity → high issue (penalty 55) → confidence drops; advisory on Planning. Coverage (Q4) still leads the headline, capacity follows (`hardIssue = coverageIssue ?? capacityIssue`).

**Routes:** `/ai/check-run` and `/planning/propose-runs` both load the company's available-trailer profile and inject `fleet`; propose-runs also threads `pallets` (from part `quantityRequired`/`numPallets` when unit is pallets) + job `stackable`. `RUN_INCLUDE` job select gains `stackable`.

**Web:** `ai.ts` types (`capacity`, stop `pallets`/`stackable`); `planning.ts` job type gains `stackable`; board maps `pallets`/`stackable` per stop and shows a red **"Capacity ✗ — N floor spaces needed · largest available holds M — split into K"** lane signal.

**Tests:** `loadCapacity.test.ts` (pure, incl. the 40-pallet split-into-2 case, stackable-fits, double-deck-fits, no-fleet, no-pallets); `checkRunService.test.ts` capacity describe (40 non-stackable /standard-only fails+split, /double-deck passes, no-fleet no-op). Gates: typecheck api+web ✅ 0; pure capacity logic exercised via node ✅. Mac run 2026-06-21: 138 tests ✅ 0 fail.

**Test-glob fix (latent gate hole):** `api` test script globbed only `src/tests/*.test.ts src/lib/*.test.ts` — so `src/services/*.test.ts` (`checkRunService`, `proposeRunsService`, `plannerWorkService`) had **never run in the suite**. The Q4 coverage + Q5a capacity *integration* describes live in `checkRunService.test.ts` and were silently skipped (only the pure `loadCapacity.test.ts` in `src/lib` ran). Added `src/services/*.test.ts` to the glob.

Surfacing those tests on Mac exposed **two pre-existing `plannerWorkService` test failures** (rotted while unrun) — both stale tests, not code bugs: (1) a custody fixture used the pre-S2 free-text `"driver:5"` where custody is now base-prefixed (`on_vehicle:5`), so `custodyBaseOf` returned null and `inCustody` was false → fixed the fixture; (2) a test placed its job part in the **3rd** `jobPart.findMany` slot, but the service was reduced from 3 queries to **2** (timeWindow + bookedTime), so the part was never fetched → moved it to a queried slot and gave it a real `timeWindowStart`. Now 189 tests, 0 fail.

## Phase A / slice A3 — Proposals panel (frontend) 2026-06-21

Frontend-only. No api/, mobile/, or schema changes.

**`web/src/api/planning.ts`**
- Added `ProposalStop`, `ProposalConflict`, `RunProposal`, `ProposeRunsResponse` interfaces matching the backend contract exactly. No `any`.
- Added `planningApi.proposeRuns(date)` → `GET /planning/propose-runs?date=${date}`.

**`web/src/modules/planning/PlanningBoardPage.tsx`**
- Added `ProposalCard` component: renders one proposal as a compact card — strategy badge (Direct / Multi-drop / Groupage), confidence % badge colour-coded by band (≥80 green / 50–79 amber / <50 red / null "—"), detour chip ("Detour N.N×" when not null), compatibility chip (⚠ + first conflict reason, or subtle ✓), why text, customer name list + stop count, and Accept / Dismiss actions.
- Added `ProposalsPanel` component: fetches `proposeRuns(date)` on mount and on date change; renders proposal cards; tracks dismissed indices in local `Set` (resets on new fetch); shows collapse/expand toggle; shows card count badge.
- Accept flow: `createRun({ date, plannerNotes: proposal.why })` → `addStop(run.id, stop.jobPartId)` for each stop in order → refreshes unplanned + runs + re-fetches proposals. Inline error shown on card if any step fails (no crash).
- Dismiss: local UI only (Set of dismissed indices, reset on next fetch). Advisory copy: "reappears on next refresh".
- Mounted: below the batch-action bar in the left (Jobs) column, fixed-height scrollable section (max-h-96), non-intrusive; existing drag/drop board is unchanged.
- Copy rules enforced: panel heading "Proposals", error state "movement plans", Accept button "Accept — create run skeleton". No "auto-plan", "AI", or "dispatch-ready" anywhere in new code. Accept is never disabled by compatibility or confidence — always clickable.

Gates: web typecheck ✅ 0; api typecheck ✅ 0 (unaffected). **Pending:** user incognito smoke test on Mac.

## Planning Q4 — collection coverage (fixes "100% on an unserviceable run") 2026-06-20

User-found bug: a run scored Confidence 100% / Compatible while two deliveries (NHS, Northern Chill) had **no collection** anywhere — the truck would deliver goods it never picked up. The planning check only validated time/route/compatibility, not whether each drop is serviceable.

**Fix (`checkRunService`):** new **collection-coverage** check. A delivery is covered only if its load is sourced — a collection/pickup for the same `jobId` in the run, a yard/depot pickup waypoint, or a feeding relay run (`hasFeederRun`). Uncovered deliveries → high-severity issue (penalty 80, confidence forced ≤ ~20 so it can never read green), a headline message, and a structured `coverage: { ok, uncovered[] }` field. Works without coordinates too.
- `RunStop` gains `jobId`; input gains `hasFeederRun`; result gains `coverage`.
- Web: `ai.ts` types updated; the board passes `jobId` per stop + `hasFeederRun = run.dependsOnRunId != null`; the run lane shows a red **"Coverage ✗ — <delivery> has no collection on this run"** signal; propose-runs passes `jobId` too.
- Tests: 4 new (`checkRunService.test.ts`) incl. the exact screenshot scenario (collect job1 + deliver job1 + orphan deliver job2 → coverage.ok false, confidence ≤25, high) + yard-waypoint and feeder-run covered cases.

**A2 reopened** as feasibility hardening: Q4 ✅ done; **Q5a (fleet-aware pallet capacity)** next — see `PLANNING_LOAD_FEASIBILITY_DESIGN.md`. Gates: typecheck api+web ✅ 0, check:vocab ✅, no-DB unit tests ✅ 55. No schema change. Mac: full DB suite + Planning incognito smoke.

---

## Phase A / slice A3 — proposal-first engine (backend) 2026-06-20

"Never start with a blank page." Deterministic, ADVISORY proposal engine — no solver, no ML.

- **`services/proposeRunsService.ts` (new)** — pure `buildProposals(stops)`: groups stops into per-job units → greedy **corridor** clustering (30 km on delivery coords, postcode-outward fallback) → splits each corridor into **compatibility-safe groups** (reuse `checkLoadMixing`, no high conflict shares a run) → emits candidate runs tagged with a **movement strategy** (`direct` / `multi_drop` / `groupage`) + a one-line "why". 6 pure unit tests.
- **`GET /planning/propose-runs`** — fetches the same unplanned stops as `/planning/unplanned`, runs `buildProposals`, scores each with the planning check (`checkRun` → confidence/detour; compatibility already on the proposal), returns `{ proposals, total }`. **Creates nothing** — the planner accepts a proposal via the existing run endpoints. DB integration test asserts proposals returned + zero runs created.

Decisions (recommended set, user "move to next step"): D-A3.1 greedy + direct/multi-drop/groupage (hub/relay/backload deferred); D-A3.2 accept = existing endpoints; D-A3.3 one server endpoint; D-A3.4 advisory only; D-A3.5 backend here, Proposals panel by Sonnet next.

Gates: typecheck api ✅ 0; check:vocab ✅; no-DB unit tests ✅ **51** (incl. 6 proposeRuns). DB endpoint test runs on Mac. No schema/mobile change. **Remaining A3:** the web Proposals panel (Sonnet).

---

## PROD-BLOCKER fix — assignment creation wrote legacy 'pending' 2026-06-20

Caught during pre-production review. The three `RunAssignment.create` sites — `routes/runs.ts:493`, `routes/planning.ts:457`, `routes/planning.ts:931` — still wrote `status: "pending"` (the pre-Step-1 vocab). After Step 1, the driver's `started` event requires `not_started` (EXECUTION_STATES). So in production every newly-planned stop would be created `pending` and **the driver could never start the job** — the exact 🔴 blocker we fixed, reintroduced at the creation sites. The test suite missed it because every test hand-creates assignments with explicit `"not_started"`; no test went through the real `POST .../assignments` endpoint and then started the chain.

**Fix:** all three sites now write `status: "not_started"`. **Regression guard:** `runCompatibility.test.ts` (which uses the real `POST /runs/:id/assignments`) now asserts the created assignment is `not_started`. Existing prod `pending` rows are converted by the Step 1 migration's backfill (`UPDATE RunAssignment SET status='not_started' WHERE status='pending'`).

Gates: typecheck api ✅ 0. Full DB suite + the new assertion to be re-run on Mac before deploy (this changed runs.ts/planning.ts). **Deploy note:** the migration `20260607000000_run_assignment_execution_state_default` MUST be applied to the production DB.

---

## Phase A / slice A2 — the three planning questions 2026-06-07

The brief's three questions, first-class on the Planning screen — all deterministic/explainable (NOT AI; `/ai/check-run` route name kept, but all output + UI copy says "Planning check"). Backend by parent, web display by a Sonnet subagent.

- **Q3 confidence + contingency buffer** (`services/checkRunService.ts`): applies a +15% drive / 45-min-dwell buffer BEFORE the time-window checks (so plans that only work under perfect conditions are caught), and returns an explainable 0–100 `confidence` (deductions for blown/tight windows, legal-hours, missing break, long day) + a `buffer` summary. `confidence: null` when stops lack coordinates.
- **Q1 stop-mixing compatibility** (new `lib/loadMixing.ts`): "can these loads travel together?" — temp+ambient, different temp ranges, ADR+food, oversized-sharing. **Advisory only** — surfaced as conflict + reason, never blocks adding freight. Folded into the `check-run` result.
- **Q2 direction / empty miles** (`checkRunService` geometry): `routedKm`, `idealKm`, `detourRatio`, and `deadheadKm` (empty miles) — deadhead only when a base location is supplied (D-A2.3; not on Planning yet → null).
- **Web** (`api/ai.ts`, `api/planning.ts` types; `PlanningBoardPage` RunLane): the old single "AI check" dot replaced with four compact signals — Planning check (severity+message), Confidence (% badge by band), Compatibility (⚠ + reasons, advisory), Direction / detour (detour ×, empty mi). No "AI" copy remains; compatibility gates nothing.

Decisions: D-A2.1 explainable confidence + default buffer; D-A2.2 small mixing matrix advisory; D-A2.3 detour now, deadhead only with reliable base; D-A2.4 one enriched call; D-A2.5 order Q3→Q1→Q2; D-A2.6 backend first then Sonnet web. User correction honoured: never call it "AI".

Gates: typecheck api+web ✅ 0; check:vocab ✅; **13 backend unit tests ✅** (loadMixing 6 + checkRunService confidence/geometry 7, no DB). No schema/mobile change. **Pending:** Mac incognito smoke on the Planning board. Remaining Phase A: A3 proposals, A4 split/consolidation, A5 metrics capture.

---

## Phase A / slice A1 — Planning screen structural refactor 2026-06-07

First slice of the three-screen re-org (`LOAD_MOVEMENT_PLAN.md` Part E). Pure re-shape, no new capability, frontend-only. Implemented by a Sonnet subagent against a precise spec; menu then reworked by hand on user feedback. Reviewed + typecheck verified by the parent.

- **`PlanningBoardPage.tsx`** — removed truck/trailer/driver `<select>`s + publish/recall + S5 compat-warning from `RunLane` (asset allocation now belongs to the Runs screen). Replaced with a read-only status line + "Open in Runs — allocate & publish →" link to `/app/runs/:id`. `CapacityBar` re-driven from run requirements (`maxLoadWeight` + required trailer type / temp / ADR chips) instead of the assigned truck. Left panel copy reframed to freight units/movements. Publishing now lives on `RunDetailPage` (untouched interim asset surface; same Run table via `/runs/:id`).
- **`AppShell.tsx`** — sidebar → horizontal top bar, **grouped by operations**: primary tabs Planning · Runs · Live (Live → `/app/dashboard` interim; no duplicate Dashboard item); `Freight ▾` (Jobs, Requests), `Resources ▾` (Fleet, Drivers, Shifts, Holidays); account menu (Settings, Sign out) on the right.

Scope: only the two web files changed; no api/mobile/schema/loadVocab touch. Gates: web typecheck ✅ 0, api typecheck ✅ 0 (unaffected). **Pending:** user incognito smoke test on Mac (`npm run dev`) — Vite can't run in the Linux sandbox. Deferred to later slices: A2 (three questions), A3 (proposals), A4 (split/consolidation), A5 (metrics capture).

---

## Plan change — three-screen delivery re-org 2026-06-07

User direction: deliver the remaining load-movement work as **three planner screens**, built vertically one at a time — **Planning** (jobs → runs), then **Runs** (asset allocation: trucks/trailers/drivers), then **Live management** (real-time firefighting: swaps, cancellations, reassignments, exceptions, on-time delivery).

Decisions: (1) screen-by-screen vertical slices, not capability-first; (2) split the 2,260-line `PlanningBoardPage` monolith — Planning keeps jobs→runs, asset allocation moves to the Runs screen — and consolidate onto **one** run system within the screen work (folds in old S16).

Mapping (full detail in `LOAD_MOVEMENT_PLAN.md` Part E): foundation S0–S6 stays done; old S9/S10 → Phase A (Planning); S7/S8 → Phase B (Runs); S11–S15 + audit Phase 3 → Phase C (Live). Same investigate-first + gate discipline per slice. Next: confirm S6 Mac gate, then Phase A investigate-first.

---

## Load-movement build — STEP 5 (vehicle assignment + real compatibility) GREEN 2026-06-07

`LOAD_MOVEMENT_PLAN.md` Step 5 / audit 🟠 #2, #3 — the **last of the audit's high items**. Truck/trailer are now validated on assignment, and `trailerCompatible`/`vehicleCompatible` are actually computed so the publish gate stops being a no-op. UI pickers already existed (RunDetailPage + planning board); this was mostly backend.

**What changed:**
- **`services/checkLoadVehicleService.ts`** — exported the rule sets (`PAYLOAD_T`, `FRIDGE_BODIES`, `ADR_UNSAFE_BODIES`) so compat reuses them (no parallel rules).
- **`lib/runCompatibility.ts` (new)** — `computeRunCompatibility()` (pure: temp→non-fridge trailer = incompatible; hazardous→ADR-unsafe body = incompatible; weight > category `PAYLOAD_T` = incompatible; no vehicle ⇒ compatible), `recomputeRunCompatibility()` (reads requirements + assigned vehicle, persists flags), `validateFleetAssignment()` (FK + companyId; not-available ⇒ warning, D5.1).
- **`routes/runs.ts`** — recalc recomputes compat; `PATCH`/`POST` validate truck/trailer FK and recompute on vehicle change.
- **`routes/planning.ts`** — same wiring (Option A: each system calls the shared helper, no consolidation), and **publish now enforces compatibility** with the existing `compatibilityOverridden` escape (D5.3), matching `runs.ts`.
- **Web** — `PlanningRun` type gains the compat fields; planning run card shows a red "⚠ Vehicle not compatible with load" warning by the publish button; `RunDetailPage`'s existing ✓/✗ indicator is now real.
- **`tests/runCompatibility.test.ts` (new)** — 7 pure-rule units + DB integration (temp load on box trailer → `trailerCompatible=false` → publish 400 `COMPATIBILITY_FAILED`; override → 200; non-existent trailer → 400 `TRAILER_NOT_FOUND`).

**Decisions (user-approved):** D5.1 validate existence+companyId (status=warn); D5.2 reuse `checkLoadVehicle` rules; D5.3 enforce planning publish; D5.4 category `PAYLOAD_T` approximation; D5.5 defer double-booking; requirement calculators = Option A (shared helper, no consolidation). Non-scope honoured: no schema change, no mobile change, no yard/swap/split, no run-system consolidation (Step 16).

**Gates:** typecheck ✅ (api+web) · check:vocab ✅ · pure compat unit tests ✅ 7/7 · knip ✅ baseline only (`runCompatibility.ts` wired; exported rule sets now consumed — no new unused). **Caveat:** the full `npm test --prefix api` run was interrupted (Ctrl-C mid-run from an accidental second command) before the runCompatibility DB integration + tenant isolation re-ran; everything that executed passed. Recommend a clean re-run to formally reconfirm those two suites.

**Follow-up logged:** add `FleetUnit.maxPayloadT` / `FleetTrailer.maxPayloadT` for precise weight checks (D5.4); double-booking guard (D5.5).

**Milestone:** Steps 0–5 close the audit's 🔴 blocker and ALL 🟠 highs (#1/#2/#3/#4/#5). The direct lifecycle is now fully load-bearing: request → planned → validated vehicle → published → executed → custody → auto-completed.

---

## Load-movement build — STEP 4 (publish gate) GREEN 2026-06-07

`LOAD_MOVEMENT_PLAN.md` Step 4 / audit 🟠 #1 / invariant 6. **Makes publish & recall real:** `publishedToDriver` was written by publish/recall but never read, so neither affected the driver. Now the driver's own feeds filter on it.

**What changed (all `api/src/routes/jobs.ts`):**
- `GET /jobs` driver branch, `GET /jobs/my`, and `GET /jobs/:id` driver auth add `publishedToDriver: true` to the `run:` filter. A driver assigned to an unpublished/recalled run sees nothing in the lists and gets 403 on direct GET (D4.3).
- **Left ungated (D4.2):** `PATCH /jobs/:id/status` driver guard (`jobs.ts:382`) and `/sync/events` auth (`sync.service.ts:101`) — verified by grep. Gating writes would reject a driver's offline-queued events if a run was recalled while offline (SAFETY §2 offline-first); publish/recall controls what NEW work appears, not what already-held work can be recorded.
- **Untouched:** planner views (`GET /jobs?driverId`, `/drivers/:id/schedule`, both role-gated) keep seeing everything; publish/recall endpoints unchanged; no schema change; no mobile change (endpoints return fewer rows).
- **New `publish-gate.test.ts`** — unpublished: GET /jobs + /jobs/my empty, GET /jobs/:id 403; planner ?driverId still sees it; publish → visible + 200; recall → hidden + 403.

**Decisions (user-approved):** D4.1 gate the three driver-own reads; D4.2 leave writes ungated; D4.3 recalled direct GET → 403.

**Gates (Mac):** typecheck ✅ (api+web) · check:vocab ✅ · `npm test --prefix api` ✅ **107/107** incl. the new "Publish gate" suite. knip: unchanged baseline noise (no new files; query-only edits).

**Milestone:** Steps 0–4 close the audit's 🔴 blocker and 🟠 #1/#4/#5. A planner can now build a run and the driver sees it only when published — and it disappears on recall.

---

## Load-movement build — STEP 3 (reconciler) GREEN 2026-06-07

`LOAD_MOVEMENT_PLAN.md` Step 3 (§A6) + audit 🟠 #4 + STATUS P0.14. **Removes the D1=A interim freeze:** `Job.status` and `Run.status` are now derived from execution state + custody, so a delivered B1 job auto-completes end-to-end with no manual step and the planner sees real run progress.

**What changed:**
- **`api/src/lib/reconcileLoadState.ts` (new)** — the sole writer of derived statuses (invariant 7). `deriveJobStatus()` rolls assignment execution states → `in_execution / partially_collected / collected / partially_delivered / completed`, with a dormant `attention_needed` branch (D3.5, fires once Step 11 adds exception events). Enters only from reconciler-owned statuses; never touches `draft/pending_review/ready_to_plan/cancelled`. Rolls up `Run.status` → `in_progress/completed` across **all** of a run's active assignments (a run may carry several jobs) and sets `actualStartTime`/`actualEndTime` once each (D3.3 — the never-before-written timestamps). Idempotent (writes only on change).
- **`applyJobEvent.ts`** — calls `reconcileLoadState(tx, …)` at the end, in the same transaction (D3.1); returns the reconciled `Job.status` in the response.
- **`api/src/jobs/reconcileWorker.ts` (new) + `server.ts`** — nightly safety-net sweep over in-flight jobs, mirroring `autoCleanupWorker` (distinct `pg_advisory_lock`, per-tenant loop, 24h `setInterval`, registered after `app.listen`) (D3.4).
- **Tests** — `reconcileLoadState.test.ts`: 7 pure `deriveJobStatus` unit tests + DB integration (mid-chain `collected`→Job collected/Run in_progress+actualStartTime; end `completed`→Job completed/Run completed+actualEndTime; cancelled-not-overridden). Updated `applyJobEvent.test.ts` and `loadtrack.test.ts` assertions that expected `Job.status` to stay `planned` after the chain — now `completed` (the reconciler runs).

**Decisions (user-approved):** D3.1 call at end of applyJobEvent (same tx); D3.2 defer the "`planned` is never set" planning-tier gap to a follow-up (reconciler treats `in_planning`/`planned` both as entry, so it works regardless); D3.3 include Run rollup + actual timestamps; D3.4 include nightly worker; D3.5 include dormant `attention_needed`. Explicit non-scope (honoured): no publish-gate change, no vehicle compatibility, no yard/swap/handover/split, no `planned`-status fix, no notification/needs-review UI, no mobile change.

**Gates (Mac):** typecheck ✅ (api+web) · check:vocab ✅ · `npm test --prefix api` ✅ **95/95** incl. the new reconcile suite. knip: baseline noise only; `reconcileLoadState.ts` + `reconcileWorker.ts` not flagged (wired in); remaining loadVocab "unused exports" (`JOB_PLANNING_STATUSES`, `DERIVED_JOB_STATUSES`, etc.) are registry symbols awaiting later-step consumers — benign, same nature as `vehicleTaxonomy`; `DATABASE_URL`-in-prisma.config is the pre-existing known false-positive.

**Follow-up logged (not Step 3):** set `planned` when all stops are assigned (planning-tier change to `syncJobPlanningStatuses`, D3.2 deferral). Multi-part execution granularity still carried from Steps 1–2 (reconciler reports `partially_*` honestly meanwhile).

**Milestone:** Steps 0–3 close the audit's 🔴 blocker and 🟠 #4/#5. The direct lifecycle (request → planned → driver execution → custody → auto-complete) now works end-to-end.

---

## Load-movement build — STEP 2 (LoadTrack write path) GREEN 2026-06-07

`LOAD_MOVEMENT_PLAN.md` Step 2. The custody ledger (`LoadTrack`) — defined since Phase 1 but **never written** — now records `collect` and `deliver`. "Where is the load" is answerable; precondition for every Part B scenario beyond B1. No schema change, no mobile wire change.

**What changed:**
- **`api/src/lib/loadTrack.ts` (new)** — `appendLoadTrack(tx, …)`, the single custody writer (append-only, invariant 4). Defensively validates from→to bases against `TRANSACTION_CUSTODY_MAP` (throws on a wrong transition rather than corrupting the ledger).
- **`applyJobEvent.ts`** — on `collected`/`completed`, resolves the stop (collection vs delivery — stop-aware, D2.1), the vehicle (`assignedTrailerId ?? assignedTruckId`, D2.3), and the quantity (threaded `actualQuantity`/`actualUnit`, fallback to the stop's `quantityRequired`, D2.2), then appends the custody row referencing the just-created event id (invariant 5). The invariant-3 guard (no deliver before a collect) runs **before any write**, so a rejected deliver commits nothing. Other events write no custody.
- **`sync.service.ts` + `routes/jobs.ts`** — pass `actualQuantity`/`actualUnit` already on the wire (no contract change).
- **`plannerWorkService.ts`** — in-custody detection switched from `toCustody.includes("driver"/"depot")` to base-aware `custodyBaseOf()` (on_vehicle/yard = in custody), D2.4, so reads match the new writes.
- **`loadtrack.test.ts` (new)** — B1 writes exactly two append-only rows (collect customer_origin→on_vehicle on the collection stop; deliver on_vehicle→customer_dest on the delivery stop), quantity threaded, eventId set; duplicate event → no second row; deliver-without-collect → 400 and writes nothing.
- **`applyJobEvent.test.ts`** — cleanup order fixed (delete `loadTrack` before `jobExecutionEvent`; the chain now produces custody rows that reference events via `LoadTrack_eventId_fkey`).

**Decisions (user-approved):** D2.1 stop-aware custody; D2.2 thread actualQuantity/actualUnit; D2.3 trailer-first then truck for on_vehicle; D2.4 update reader to `custodyBaseOf()`. Explicit non-scope (honoured): no yard events, no swap/handover, no split, no reconciler, no schema change, no mobile change, no `LoadTrack.trailerId` rename.

**Gates (Mac):** typecheck ✅ (api+web) · check:vocab ✅ · `npm test --prefix api` ✅ **91/91** incl. the new "LoadTrack custody write path (Step 2)" suite and the Step 1 keystone chain. knip: baseline noise only; `api/src/lib/loadTrack.ts` and `api/src/constants/loadVocab.ts` are **not** flagged (now consumed); the only new "unused exports" are `loadVocab` registry symbols awaiting later-step consumers (`JOB_PLANNING_STATUSES`, `DERIVED_JOB_STATUSES`, etc.) — benign, same nature as `vehicleTaxonomy`. `DATABASE_URL`-in-prisma.config knip error is the pre-existing known false-positive.

**Parked (not Step 2):** multi-stop/relay custody, yard drops, swaps/handover/split/consolidate (Steps 6+). Execution-vs-custody divergence for multi-part jobs under the job-level event model remains noted; resolved when per-stop execution lands. Job.status still derived only in Step 3.

---

## Load-movement build — STEP 1 (status bridge) GREEN 2026-06-07

Keystone step of `LOAD_MOVEMENT_PLAN.md`. **Resolves the 🔴 audit blocker:** a `planned` job is now startable by a driver. Root cause was one field (`Job.status`) serving two disjoint vocabularies; fix separates them into three dimensions (planning status / execution state / custody).

**What changed:** driver events now advance the per-`RunAssignment` EXECUTION state (loadVocab `EXECUTION_STATES`) instead of writing `Job.status`. `Job.status` is intentionally left untouched by execution (the reconciler derives it in Step 3 — decision D1=A).

- `schema.prisma` + migration `20260607000000_run_assignment_execution_state_default` — `RunAssignment.status` default `pending → not_started`; backfills existing inert `pending` rows (D3). Column was never read/written before Step 1, so zero data risk.
- `sync.constants.ts` — `EVENT_DEFINITIONS` retargeted to execution-state transitions (`started`:not_started→en_route_pickup; `arrived_pickup`→at_pickup; `collected`→loaded; `arrived_dropoff`→at_dropoff; `completed`→delivered). Kept `EVENT_TYPE_MAP` as the **inbound mobile-status alias** (mobile→server contract preserved — no app release needed) and `PLANNER_ONLY_TRANSITIONS`/`JobStatus` (legacy planner table, per approved report). Replaced the now-obsolete `STATUS_BY_EVENT_TYPE` + `ALLOWED_JOB_TRANSITIONS` (their source machine changed; were test-only) with `RESULTING_STATE_BY_EVENT` + `EXECUTION_TRANSITIONS`.
- `applyJobEvent.ts` — resolves the RunAssignment, validates `allowedFromStates`, advances `RunAssignment.status`, populates the event's `runId`/`runAssignmentId`/`jobPartId`. Returns `jobStatus + executionState` (D2).
- `sync.service.ts` + `routes/jobs.ts` — pass the already-resolved assignment id; online `PATCH /jobs/:id/status` returns `executionState`.
- Tests — `sync.constants.test.ts` rewritten for the execution-state model; `applyJobEvent.test.ts` rebuilt with a full planned-job + run + assignment setup and a **keystone regression**: `planned` job driven `started→…→completed`, asserting the assignment reaches `delivered` while `Job.status` stays `planned`. (The suite never had this test — it would have caught the original blocker.)

**Decisions (user-approved):** D1=A (Step 1 pure, Job.status derived later in Step 3); D2 = return `jobStatus + executionState`; D3 = migrate default to `not_started`.

**Gates (Mac):** typecheck ✅ (api+web) · check:vocab ✅ · `npm test --prefix api` ✅ **82/82** incl. keystone chain test · `Job.status` confirmed unchanged by execution; `RunAssignment.status` advances through execution states · knip baseline noise only and the api `loadVocab` "unused" flag is now gone (Step 1 imports it). No references to removed symbols remain (grep). Sandbox: typecheck + check:vocab + 32 no-DB tests verified; DB tests verified on Mac.

**Environment issue (not a code defect):** `prisma migrate deploy` failed in the user's shell because `DATABASE_URL` was not exported to the Prisma CLI; tests still passed against the DB (they load it via dotenv). Migration SQL is committed; apply it when the env var is available to the CLI.

**Deferred to later steps (parked, not pulled forward):** Job.status reconciliation/derivation (Step 3); LoadTrack custody writes (Step 2); publish gate on `/jobs/my` (Step 4); consolidating the three `jobStatuses.ts` copies. Interim: during execution `Job.status` stays at its planning value until Step 3 — accepted under D1=A.

---

## Load-movement build — STEP 0 (vocabulary registries) GREEN 2026-06-07

First step of `LOAD_MOVEMENT_PLAN.md` Part C. Foundation only — no runtime wiring, no deletions, no behaviour change. Establishes the single-source vocabulary that resolves the planning-vs-execution status disconnect (see audit `JOB_INTAKE_FLOW_AUDIT.md` 🔴 blocker; fix lands in Step 1).

**Added:** `loadVocab.ts` — byte-identical in `shared/`, `api/src/constants/`, `web/src/constants/`, soft-mirrored in `mobile/src/constants/`. Contents:
- `JOB_PLANNING_STATUSES` (+ `PLANNER_SET_JOB_STATUSES` / `DERIVED_JOB_STATUSES` split) — dimension 1 (Job.status), the planning-tier vocab that previously had no registry (was 303 magic-string literals).
- `EXECUTION_STATES` — dimension 2, per-RunAssignment driver state machine.
- `CUSTODY_BASES` (+ `customAt` builders, `custodyBaseOf`, `TERMINAL_CUSTODY_BASES`) — dimension 3 custody locations: `customer_origin | on_vehicle | yard | customer_dest | returned | written_off`.
- `TRANSACTION_TYPES` (+ `TRANSACTION_CUSTODY_MAP`) — the 10 custody primitives every scenario composes from.

**Changed:**
- `scripts/check-vocab-sync.ts` — refactored from one global hash to independent per-group hashing; added the `loadVocab` core trio + mobile soft path. (Without this, a second vocab would have been forced to match `vehicleTaxonomy`.)
- `DATA_DICTIONARY.md` — `LoadTrack`/`JobExecutionEvent` custody+transaction fields upgraded from "Free text" to enum refs; new "Load-movement vocabulary" section lists all canonical values + migration note (old free-text `customer`/`driver:<id>`/`depot` superseded; no data to migrate — LoadTrack has no write path until Step 2).

**Decisions (user-approved):** precise custody vocab (not the old free-text words); "api owns + shared mirror" realised via the existing byte-identical-copy + hash-gate pattern (the codebase's answer to knip's cross-workspace blindness); all four registries in one file to keep the hash gate simple.

**Gates (run on Mac):** typecheck ✅ (api+web exit 0) · check:vocab ✅ (exit 0; only the pre-existing mobile vehicleTaxonomy soft-warning) · `npm test --prefix api` ✅ **83/83** · knip — only new delta is the 4 `loadVocab` files under "Unused files" (documented vocab-mirror false-positive, same as `vehicleTaxonomy`; hash-gated instead). No new unused exports.

**Not done (deferred to Step 1):** the three divergent `jobStatuses.ts` copies, `sync.constants.ts`, `runStatuses.ts`, and all magic-string call sites are untouched — consolidation/rewiring happens in Step 1 once the new path is proven. Nothing imports `loadVocab` yet (confirmed by grep).

---

## Fix CJP Job.status bug 2026-06-06

`createJob` always wrote `Job.status = "draft"` regardless of `saveMode`. `patchJob` had the same gap — it read `saveMode` and validated but never wrote `status`.

**Fix:** `api/src/services/jobService.ts`
- `createJob` line 179: `status: saveMode === "ready_to_plan" ? "ready_to_plan" : "draft"`
- `patchJob` tx.job.update data block: spread `{ status }` only when `job.status` is in `["draft", "ready_to_plan"]` to avoid stomping on in-progress/completed/cancelled jobs.

**Tests:** `api/src/tests/job-create-status.test.ts` — 5 new sub-tests covering POST draft, POST ready_to_plan, PATCH promote, PATCH demote, POST ready_to_plan with no stops → 400.

Gates: typecheck ✅ vocab ✅ 80 tests ✅ knip: no new entries.

---

## A.14 + D.4 + TASK 3.2 closed 2026-06-06

`bcrypt` (native) and `@types/bcrypt` removed from `api/package.json` and lockfile. Only `bcryptjs` remains. Zero `from "bcrypt"` import sites confirmed. typecheck ✅ 77 tests ✅.

---

## D.4 + TASK 3.2 closed 2026-06-06

`mobile/src/components.legacy.tsx` deleted — 190 lines of dead code. Zero import sites confirmed via grep. All exports (`COLOURS`, `Button`, `Card`, etc.) superseded by `mobile/src/theme.ts` and inline components.

---

## TASK 3.2 closed 2026-06-06

`POST /jobs/:id/note` clientEventId requirement now fully active.

- `AddJobNoteSchema` already required `clientEventId` (done in earlier session); only the `todo` markers in `api/src/tests/job-note.test.ts` were blocking the clean signal.
- Both callers confirmed sending it: mobile `JobDetailScreen.tsx:215` (`uuidv4()`) and web `JobsPage.tsx:268` (`crypto.randomUUID()`).
- Removed `todo` from tests 1 (missing→400) and 3 (duplicate→200). All 3 subtests now pass as normal tests.
- Gates: typecheck ✅ vocab ✅ 77 tests pass ✅ 0 todo.
- CODE_AUDIT.md B.5 flipped from `[~partial]` to `[x]`. CLEANUP_PLAN.md checkpoint updated.
- Remaining cleanup: 4.1-C (time-locked until 2026-06-16), D.4 components.legacy.tsx, A.14 bcrypt, CODE_AUDIT.md stale boxes.

---

## Cleanup Phase 3 in progress 2026-06-01

Phase 3 (bug fixes) partial completion — PRs #14–18 merged to `cleanup/main-tracker`:

| Task | PR | What |
|---|---|---|
| 3.7 | #14 | `api/src/lib/errors.ts` — 6 helpers, 266 inline `reply.status(4xx)` replaced, CI gate at 0 hits |
| 0.6 | #16 | `AuthCtx.Provider` scoped to `/app/*` — public pages no longer fire `/auth/me` or refresh poll |
| 0.7 | #15 | Read-only audit: `jobRequestsPublicApi` confirmed NO Bearer leak |
| 3.3 | #17 | B.10 — `companyId` added to 10 bare-id `update`/`delete` calls (defence-in-depth) |
| 3.5 | #18 | B.2 — `autoCleanupOldShifts` extracted to `api/src/jobs/autoCleanupWorker.ts`; per-tenant loop, `pg_advisory_lock`, no longer in route file |

Phase 0 is now fully complete (all 7 tasks done).

Open Phase 3 tasks: 3.1 (S3), 3.2 (S3), 3.6 (read-only → S3 on findings), 3.8 (planner override, approved)

---

## Cleanup Phase 2 complete 2026-06-01

Phase 2 (foundation refactors) finished. Five tasks, all merged to `cleanup/main-tracker`:

| Task | PRs | What |
|---|---|---|
| 2.1 A.5/A.6/A.13 | #9 | `EVENT_DEFINITIONS` single source; `PlannedJob` stale refs fixed; 8 new tests |
| 2.2 A.3/A.4 | #10 | `validateGpsPair` + `validateClientTimestamp`; E.4 (flag not reject) live; GPS range fix; 18 new tests |
| 2.3 A.1/A.2/B.5 | #11 | `applyJobEvent` shared state machine; `clientEventId` required; cancel blocked via normal path; 4 new tests |
| 2.4 A.7/B.4/B.15 | #12 | `cancelRun` service; LoadTrack preserved on cancel (user confirmed); planning.ts cancel now transactional |
| 2.5 A.9/A.11/A.12 | #13 | `TxClient`, `dayRangeUtc`, `parseIdParam`; 52 parseInt call sites replaced; NaN id → 400 not 404 |

New files created: `api/src/sync/applyJobEvent.ts`, `api/src/lib/gps.ts`, `api/src/lib/eventTimestamp.ts`, `api/src/services/runService.ts`, `api/src/lib/types.ts`

Test count: 43 → 70 (+27 new tests across Phase 2)
Knip baseline unchanged: 26 unused files, 118 unused exports (Phase 5 closes these)

---

## Cleanup knip baseline 2026-05-30 — TASK 0.5

**knip version:** latest (installed at repo root as devDependency)

**Baseline counts (non-blocking — Phase 5 will close these):**

| Category | Count |
|---|---|
| Unused files | 26 |
| Unused dependencies | 9 |
| Unused devDependencies | 3 |
| Unlisted dependencies | 17 |
| Unlisted binaries | 4 |
| Unused exports | 118 |
| Duplicate exports | 2 |

**Known false positives / noise:**
- `api/prisma.config.ts` — env var `DATABASE_URL` not resolvable at static analysis time (knip known issue with Prisma config files); does not affect output correctness
- Several `@fastify/*` and `@prisma/client` entries flagged as "unused dependencies" — these are loaded via Fastify plugin system and Prisma generated client; knip cannot trace dynamic registration
- `shared/vehicleTaxonomy.ts` flagged as unused file — imported by api, web, mobile copies; knip cannot trace across workspace boundaries without explicit cross-workspace config

**Confirmed real findings (match existing audit items):**
- `api/src/auth.ts` — unused file → D.1
- `mobile/src/apiWithQueue.ts` — unused file → D.2
- `mobile/src/components.legacy.tsx` — unused file → D.4
- `bcrypt` in api/package.json — unused dependency → A.14

---

## Cleanup baseline 2026-05-30 — TASK 0.1

**Typecheck:** OK (exit 0, both API and WEB)

**Tests:** 35 pass, 0 fail
- Suite 1: Job form parity — 9 subtests, all pass
- Suite 2: Tenant isolation — 24 subtests + 2 top-level, all pass

**check:vocab:** EXIT 1 — pre-existing drift detected at baseline
```
❌ Vocabulary files have drifted (API / web / shared):
  fb88d080...  shared/vehicleTaxonomy.ts
  fb88d080...  api/src/constants/vehicleTaxonomy.ts      ← matches shared
  257a4286...  web/src/constants/vehicleTaxonomy.ts      ← DRIFTED
```
`web/src/constants/vehicleTaxonomy.ts` diverged from the shared copy (the `bodyTypeLabel()` export added in session 2026-05-28c was added only to the web copy, not synced back to `shared/vehicleTaxonomy.ts`). This is a pre-existing failure, not introduced by this task.

**PlannedJob refs:** 154 (across `*.ts`, `*.tsx`, `*.md`, excluding `node_modules` and `generated`)

**TODO/FIXME/XXX in api/src:** 1
```
api/src/sync/sync.service.ts:81:
  // TODO(phase-2): migrate JobExecutionEvent.driverId to reference DriverProfile instead of User.
```

**Note:** `RELEASE_READINESS.md` referenced in `CLEANUP_PLAN.md` does not exist in the repo. Logged as a gap — do not let the cleanup plan reference a non-existent file cause confusion.

---

## Session log — 2026-05-30

### Overnight-rest deleted; shift-end GPS capture built

**Decision:** The manual "🌙 Overnight run" feature was replaced entirely by automatic GPS capture on shift submit. Rationale (from user): system should always know where driver and load are when shift ends — this covers day drivers, trampers, and anyone who occasionally stays out. Planner doesn't need to manually create relay runs; they can move deliveries to a different date via the planning board's date-split view (already works).

**Deleted (all three layers):**
- `POST /planning/runs/:id/overnight-rest` API endpoint (~145 lines) — removed in previous session
- `createOvernightRestRun` function from `web/src/api/planning.ts` — removed in previous session
- `PlanningBoardPage.tsx` overnight state (`showOvernightForm`, `orLocation`, `orPostcode`, `orLat`, `orLng`, `orShiftEnd`, `orRestHours`, `orMoveParts`, `orGeoLoading`, `orCreating`), "🌙 Overnight run" button, inline overnight form (~100 lines), `handleCreateOvernightRun` function, `onCreateOvernightRun` prop on `RunLane`, `overnight_rest` from `WAYPOINT_TYPE_LABEL`
- Duplicate prop declarations in `RunLane` destructuring (2× `onOptimiseRoute` etc.) found and fixed during this cleanup

**Built — shift-end GPS:**
1. **Schema** — `Shift.endLat Float?` + `Shift.endLng Float?` added to `api/prisma/schema.prisma`. Migration `20260529000000_add_shift_end_location` created manually and applied via `prisma migrate deploy`.
2. **API** — `SubmitShiftSchema` (`api/src/schemas/shifts.ts`) and `SubmitShiftBody` interface (`api/src/types/requests.ts`) both extended with optional `endLat: number` / `endLng: number`. `PATCH /shifts/:id/submit` handler (`api/src/routes/shifts.ts`) now: (a) persists `endLat`/`endLng` to `Shift`; (b) if GPS present, looks up `DriverProfile` for the submitting user, then finds the driver's next-calendar-day run (status draft/assigned), and upserts a `depot_start` waypoint at the shift-end coordinates. Entire GPS block is wrapped in try/catch — failure is logged but submit still returns 200.
3. **Mobile** — `ReviewScreen.tsx` (`mobile/src/screens/ReviewScreen.tsx`) now imports `expo-location`, requests foreground permission, and calls `Location.getCurrentPositionAsync()` immediately before the submit PATCH. `endLat`/`endLng` added to the PATCH body. Non-fatal: if permission denied or GPS throws, submit proceeds without coordinates.

**Use cases enabled:**
- Day driver finishing in the yard → next-day run's depot_start = yard (GPS matches company depot)
- Tramper stopping roadside → next-day run's depot_start = rest stop location (trailer last known position)
- Planner can still override depot_start via waypoint form

**Deferred / not yet built:**
- No planner UI showing "shift-end GPS captured" confirmation
- No trailer-tracking dashboard (planned in Phase 4)

---

## Session log — 2026-05-28c

### Full codebase deduplication pass

Continued from 2026-05-28b. User instruction: "go treu all system and clean it as much as you can."

**Canonical utilities established in `createJobUtils.ts`:**
- `cap(s)` — snake_case → "Sentence case". Removed local copies from: `JobsPage.tsx`, `PlanningBoardPage.tsx`, `JobRequestsPage.tsx`, `JobDetailDrawer.tsx`, `JobDetailPage.tsx`
- `today()` — ISO date string for today. Removed local copies from: `DashboardPage.tsx`, `JobsPage.tsx`, `RepeatJobModal.tsx`, `PublicRequestForm.tsx`, `RunsPage.tsx`. `PlanningBoardPage.tsx` had two aliases: `todayISO()` (removed, call sites updated) and a local `const today` inside `JobWorkCard` (replaced with `today()` call).
- `addDays(dateStr, n)` — new export. Removed local copies from: `DashboardPage.tsx`, `JobsPage.tsx`, `RepeatJobModal.tsx`. `PlanningBoardPage.tsx` had `addDaysToISO()` — removed, call sites updated. `prevDay`/`nextDay` wrappers in PlanningBoardPage now delegate to `addDays`.

**`bodyTypeLabel(v)` exported from `vehicleTaxonomy.ts`** (uses `BODY_TYPES` from there). Removed local copies from `PlanningBoardPage.tsx` and `JobRequestsPage.tsx`.

**`STOP_TYPE_LABEL` exported from `jobStatuses.ts`** (full labels: "Collection", "Delivery", etc.). Removed local copies from `JobDetailPage.tsx` and `JobRequestsPage.tsx`. `PlanningBoardPage.tsx` had a deliberately abbreviated version — renamed to `STOP_TYPE_LABEL_SHORT` to make intent clear (keeps "Collect", "Deliver" etc. for compact UI).

**Other cleanups in `PlanningBoardPage.tsx`:**
- `const today = new Set<number>()` inside `sidebarCounts` useMemo renamed to `todayIds` — was shadowing the imported `today` function, confusing.
- `JobWorkCard` prop renamed `runs` → `draftRuns` — parent already computed `draftRuns` via filter; card now receives pre-filtered list directly, no duplicate filter computation inside.

**Previously completed in 2026-05-28b (carried forward for completeness):**
- `publishedToDriver` silent recall bug fixed (was missing from patchRun client type and server PATCH body)
- Dead `reseqOps` block removed from `planning.ts`
- `stopId` → `jobPartId` naming consistency in PATCH `/jobs/:id/stop-times` and `AssignDrawer.tsx`
- `haversineKm` deduplicated: canonical in `geo.ts`, removed from `planning.ts` and `checkRunService.ts`
- `parseBody` deduplicated: canonical in `validate.ts`, removed from `jobs.ts` and `jobRequests.ts`
- Dead code removed from PlanningBoardPage: `GROUP_LABEL`, `StatusBadge`, `buildJobGroups`/`JobGroup`, `allDisplayedGroups`
- Near-duplicate handlers deleted: `handleAddPartsToRun`, `onAddPartsToRun`, `onDropParts` — `handleAddJobToRun` extended with optional `partIds?: number[]` instead

**Left deferred (needs investigation, not mechanical cleanup):**
- `clusters` state: fallback path in `handleAddJobToRun` when `workItems` is empty for a jobId — unclear if ever triggered; removing it would be a functional change requiring testing

---

## Session log — 2026-05-28b

### Planning board — per-part date splitting + planned-date removal

**① Jobs panel — split multi-day jobs across collection AND delivery date**

Previous session grouped ALL parts of a job under its collection date, so a Monday-collect / Wednesday-deliver job never appeared in Wednesday's panel. Fixed.

**Architecture:**
- `jobWorkGroupsByDisplayKey` now keys by `(jobId × displayKey)` not just `jobId`
- Each `PlannerWorkItem` is bucketed by its own `partDate()` — collection parts go under their date, delivery parts go under theirs
- Parts with the same `jobId` AND the same date are merged into one card (same-day collect+deliver stays as one card — no change for the common case)
- Multi-day jobs produce two separate cards: one under the collection date (showing the Collect row), one under the delivery date (showing the Deliver row)
- `needs_attention` and `in_custody` group keys still bucket all job parts together (no split) — those groups are status-based, not date-based
- Card `key` prop changed from `grp.jobId` to `${grp.jobId}:${dk}` so the same job can appear under multiple date groups without React key collision

**Drag/drop now date-scope-aware:**
- Card-level drag now sets `application/job-part-ids` (comma-separated list of `jobPartId`s for the card's parts) instead of `application/job-id`
- `RunLane` drop handler priority: `application/job-part-id` (single stop row) → `application/job-part-ids` (card-level, date-scoped) → `application/job-id` (legacy fallback for full-job add)
- New `onDropParts: (jobPartIds: number[]) => Promise<void>` prop on RunLane
- `JobWorkCard.handleAdd` uses new `onAddPartsToRun(group.parts.map(p => p.jobPartId), runId)` — adds only the card's parts, not all job parts
- New `handleAddPartsToRun(jobPartIds, runId)` in parent: loops `planningApi.addStop`, then single reload

**② Planned date removed from all planner-facing forms/lists**
- `CreateJobPage` — no planned date field; auto-derived from first collection stop
- `JobRequestsPage` accept drawer — planned date derived from stop time, not manual input
- `JobsPage` — date column removed from table
- `JobDetailPage` — planned date removed from header + detail grid
- `JobDetailDrawer` — "Planning date" row removed

**③ API date filters migrated from `plannedDate` to stop `timeWindowStart`**
- `GET /jobs` filter, `GET /jobs/my` filter
- `GET /dashboard` range + carry-over queries
- `GET /drivers/:id/schedule` filter
- `POST /job-requests/:id/accept` now auto-derives `resolvedPlannedDate` from stops

**Deferred:**
- ③ Return-to-base warning using `baseLat`/`baseLng`
- ④ DVLA rules compliance
- ⑤ Warning audit trail

---

## Session log — 2026-05-28a

### Jobs panel date grouping + overnight rest auto-create run

**Commits:** `4f6f40e` (date grouping), `d1c9302` (overnight rest)

**① Jobs panel — collection-date-based grouping**
- Replaced the old `groupKey`-based display (vehicle type / direction groups like "Artic — Curtainsider", "North") with date-based groups
- Priority buckets unchanged at top: "Needs attention" (risk=high), "Collected — in custody"
- Everything else groups as "Mon 28 May", "Tue 29 May", etc. — label shows "Today — Mon 28 May" and "Tomorrow — Tue 29 May" for the current two days
- Within each date group: cards sorted by collection time → postcode → goods type
- Items with no date fall through to a "Future" bucket at the bottom
- Sidebar area/vehicle filters continue to work unchanged — only the display grouping changed
- No API changes. All pure frontend memo rewrite: `jobWorkGroupsByDisplayKey` + `orderedDisplayKeys` replace `jobWorkGroupsByGroupKey` + `orderedGroupKeys`

**② Overnight rest auto-create run**

Architecture confirmed with user: logic is **load-location-based**, NOT driver-type-based. Any run can trigger overnight rest if the driver's shift ends at a non-yard location (services/layby). The end-of-shift location check is a planning-time decision (planner fills in where they expect the driver to rest).

- API: `POST /planning/runs/:id/overnight-rest`
  - Body: `restLocationText?`, `restPostcode?`, `restLat?`, `restLng?`, `shiftEndIso?`, `restHours? (9|11)`, `moveDeliveries? (default true)`
  - Creates a new relay run: same `assignedDriverId` + `assignedTrailerId`, `dependsOnRunId` = source run, `runType = "relay"`, `plannedDate` = start of delivery day, `estimatedStartTime` = shiftEnd + restHours (HH:MM)
  - Adds a `depot_start` waypoint at rest location with notes recording the DVLA rest duration + ISO timestamp
  - If `moveDeliveries = true` (default): moves delivery/dropoff assignments from source run to new run with fresh 1000/2000/3000… sequence numbers; recalculates derived requirements on source run
  - DVLA EC 561/2006: 11h standard or 9h reduced (hardcoded, no DB table needed at this stage)
- Frontend: "🌙 Overnight run" button in RunLane action bar
  - Inline form below waypoint form: rest location name, postcode (auto-geocodes via postcodes.io), lat/lng, shift end datetime picker, DVLA rest selector (11h/9h), checkbox to move deliveries
  - Preview line shows calculated delivery run start time before confirming
  - On success: reloads both left panel (delivery stops may have moved) and right panel (new run appeared)
  - `planningApi.createOvernightRestRun()` added to API client

**Deferred:**
- ③ Return-to-base warning using `baseLat`/`baseLng` — next
- ④ DVLA rules compliance cron (annual review) — future
- ⑤ Warning audit trail — future
- Mobile "End shift at rest location" button — Phase 4 GPS work

---

## Session log — 2026-05-27f

### Planning board features — series (manual reorder, driver work pattern, base postcode)

**Commits:** `0f96339` (manual reorder), `11602bf` (driver work pattern + base postcode)

**Context:** User confirmed a multi-feature build plan. Session covers items ① and ② of the agreed order.

**① Manual drag-and-drop stop reorder within run lanes**
- API: `PATCH /planning/runs/:id/assignments/reorder` — receives ordered array of assignment IDs, updates `sequenceNumber` to 1000/2000/3000… preserving waypoint positions (depot_start=0, return_to_base=999999)
- Frontend: drag handle (⠿) on each stop card; `application/run-assignment` drag type distinguishes intra-lane reordering from inter-lane job assignment drags; blue drop-line appears above target; opacity fade on dragged card; "Reordering…" pulse; existing "Optimise route" + confirmation dialog unchanged

**② Driver work pattern + geocoded base postcode**
- Schema: `DriverProfile.workPattern String?` (day_driver | night_driver | tramper) — separate from `driverType` (employment type: permanent/agency/subcontractor); `basePostcode String?`, `baseLat Float?`, `baseLng Float?`
- Migration: `20260527000001_add_driver_work_pattern_and_base_postcode`
- Driver form: base postcode field next to name (auto-geocodes on blur via postcodes.io); work pattern select alongside employment type + licence class
- Drivers list: coloured work pattern badge (☀ Day / 🌙 Night / 🚛 Tramper)
- Planning board driver dropdown: icon suffix on driver name
- `PlanningDriver` API type updated with `workPattern`, `basePostcode`, `baseLat`, `baseLng`

**Deferred (next):** ③ Return-to-base warning (uses `baseLat`/`baseLng`), ④ DVLA rules hardcoded, ⑤ Warning audit trail

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
