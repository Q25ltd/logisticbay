# LogisticBay — Status & Release Readiness

> **Keep this file accurate.** After every session that adds, changes, or removes a feature,
> update the relevant section. Three tiers: ✅ Done · 🔶 Partial · 🔲 Not started.
> For the release checklist (P0/P1/P2), update checkbox status when tasks are completed.
> Last updated: 2026-05-23

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
  - Section 4: special requirements (ADR, oversized, fragile, high-value, etc.)
  - Section 5: vehicle requirements (category, body types, equipment, trailers)
  - Section 6: billing (declared value, PO number, billing ref)
  - Edit mode (restore from existing Job), template apply mode
  - Required-field red highlighting on save attempt (all 6 sections + stops)
  - `saveMode`: draft | ready_to_plan
- **Public Request Form (PRF)** — `/request/:token`
  - Full identical field set to CJP — same Zod schema, same DB columns
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
- **AI-assisted job creation** (requires `ANTHROPIC_API_KEY`, model: `claude-haiku-4-5`):
  - `POST /ai/parse-request` — paste email/WhatsApp/note → structured job data → pre-fills CJP form
  - Customer name auto-matched against database; contact fields filled from stored account
  - `POST /ai/suggest-vehicle` — analyses load (weight, qty, goods type, temp, hazmat) → recommends vehicle category with one-line reason
  - CJP Section 5 shows violet "AI vehicle suggestion" panel — planner can accept or dismiss
  - `GET /ai/status` — returns `{ enabled: boolean }` for frontend feature gating
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
- `JobDetailPage` — full job detail view
- `CreateJobPage` — create + edit mode
- Job status updates via PATCH
- Planner notes, internal notes

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
| **Driver profiles (web)** | CRUD — name, pay rate, min hours | Availability board (see all drivers week view), working time compliance display |
| **Shifts (web)** | Basic list | Full shift detail with PDF, delivery task breakdown |
| **LoadTrack** | Schema + model fully defined | No write path from mobile or API yet — custody chain not recorded |
| **Job audit log** | `JobAudit` rows written on accept/reject | No viewer in web planner UI |
| **Fleet ↔ Run linkage** | Schema has `assignedTruckId` / `assignedTrailerId` | Run creation UI does not yet offer truck/trailer picker |
| **Job status guards** | PATCH /jobs/:id/status exists | Role-based edit restrictions post-assignment not enforced in code |

---

## 🔲 NOT STARTED — future phases

### Planning board — NEXT BUILD PRIORITY
Full spec in **PLANNING_BOARD.md**. Three phases.

**Phase 1 — Planning board (Types 1, 2, 3)**
- [ ] 1.1  Schema: add `runType` + `dependsOnRunId` to Run (migration)
- [ ] 1.2  API: geographic clustering endpoint (groups ready-to-plan stops by GPS/postcode)
- [ ] 1.3  Page: `/app/planning` — date picker, two-panel layout
- [ ] 1.4  Left panel: unplanned stops, auto-grouped clusters
- [ ] 1.5  Right panel: run cards, drag stops onto runs
- [ ] 1.6  Trailer assignment UI on run card (required)
- [ ] 1.7  Driver assignment UI on run card (optional at planning)
- [ ] 1.8  Run dependency locking (relay: run B locked until run A done)
- [ ] 1.9  Split load UI — assign quantity per run, balance check
- [ ] 1.10 AI validation (Claude API) — green/amber/red per run with reason
- [ ] 1.11 AI grouping suggestion — "Suggest runs for today" button
- [ ] 1.12 Job progress update — job status derived from RunAssignment completion
- [ ] 1.13 Publish run → driver notification

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
Run, RunAssignment, LoadTrack
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
