# LogisticBay — Project Status

> **Keep this file accurate.** After every session that adds, changes, or removes a feature,
> update the relevant section. Use the three tiers: ✅ Done · 🔶 Partial · 🔲 Not started.
> Last updated: 2026-05-19

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

### Load movement & execution (next priority area)
- Handover / relay confirmation flow (driver B accepts load from driver A)
- Breakdown event type + workflow
- Incident / RTA event type
- Damage report at collection or delivery
- Customer refusal workflow
- Stop reorder by driver (decision needed — see `QUESTIONS_OPERATIONS.md`)
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
- MFA for planner / owner accounts (listed in `SAFETY.md`)
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

## Open question files

| File | Topic |
|------|-------|
| `QUESTIONS_OPERATIONS.md` | Job execution, driver actions, load tracking, failures, relay, POD |
| `QUESTIONS_COMPANY.md` | Company setup, roles, multi-company |
| `QUESTIONS_FINANCIAL.md` | Billing, invoicing, pay rates |
| `QUESTIONS_PLATFORM.md` | Auth, security, notifications, infrastructure |
| `QUESTIONS_PRODUCT.md` | Product direction, customer-facing features |
