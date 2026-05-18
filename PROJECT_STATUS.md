# LogisticBay — Project Status

## Live URLs
- API: https://api-production-cdc9.up.railway.app
- Web: https://logisticbay.com / https://logisticbay.vercel.app
- Railway: https://railway.app/project/5b039bc6-fef3-4aa6-b423-1e1088aaa94b

## Stack
- API: ~/timesheet-app/api (Fastify + Prisma + PostgreSQL)
- Web: ~/timesheet-app/web (React + Vite + Tailwind)
- Mobile: ~/timesheet-app/mobile (Expo SDK 54)

## GitHub
- Web+API: https://github.com/Q25ltd/logisticbay
- Mobile: https://github.com/Q25ltd/logisticbay-mobile

## Mobile Screens
- LoginScreen — email+PIN, Face ID, company picker (multi-company)
- HomeScreen — jobs preview, My Shifts, Holidays, Change PIN
- StartShiftScreen — shift start, vehicle setup, week context
- JobsScreen — Today/Upcoming tabs, viewOnly without shift
- JobDetail (src/screens/JobDetail/index.tsx) — full delivery flow with collection/delivery forms, online/offline sync
- ChangeVehicleScreen — mid-shift truck/trailer change
- ChecklistScreen — truck/trailer checks
- EndSegmentScreen — segment close
- EndShiftScreen — shift completion + totals
- ReviewScreen — shift review before submit
- HistoryScreen, ShiftDetailScreen, ChangePinScreen, HolidayScreen

## API Routes
- Auth: login (multi-company), refresh, logout, me, change-password, register-company
- Auth: forgot-password, reset-password, verify-email (built, email gated — see below)
- Company: GET/PATCH company, drivers CRUD, locations, templates
- Jobs: list, create, my, status updates with actual quantities + clientTimestamp + GPS metadata
- Sync: POST /sync/events (offline event ingestion, idempotent via clientEventId)
- Shifts: create, segments, deliveries, submit, PDF
- Availability: weekly plan, shift preferences, holiday requests, working time
- Health: GET /health

## Key Features Done
- Multi-company login with company picker
- Agency driver linking (same user, multiple company profiles)
- Full delivery flow: pending→collected→delivered with qty/POD
- Planner sets required confirmations per job
- Weekly availability (7-day plan, this/next week)
- Holiday requests with allowance tracking
- Working time compliance (60h max, 48h average warning)
- Rest period checks (11h standard, 9h reduced max 3x/week)
- PDF generation for shifts
- Email reports via SendGrid
- Offline-first job execution with queue + auto-sync
- Idempotent event sync using clientEventId
- GPS + clientTimestamp attached to job execution events
- Offline retry system with failure tracking and recovery
- Global offline/sync banner with retry UI

## Web Planner TODO
- Jobs list (core planner view)
- Create job
- Assign driver
- Job detail: show planned vs actual quantities + POD
- Manual status view/override
- Driver profile: min hours/day, holiday allowance fields
- Availability board: see all drivers week plan, approve
- Holiday management: approve/reject, calendar view
- Shift preferences board: today's driver preferences
- Settings: max holidays per day limit

## Schema Models
Company, User, CompanyMembership, DriverProfile,
SavedLocation, JobTemplate, PlannedJob, JobExecutionEvent, SyncEventLog,
Shift, ShiftSegment, DeliveryTask,
DriverAvailability, ShiftPreference, HolidayRequest, DriverWorkingTimeSummary,
RefreshToken, PasswordResetToken, EmailVerificationToken

---

## Auth Security — Built 2026-05-18

### What is done
- **Login lockout**: 5 failed attempts in 15 min locks account for 15 min. Generic error always — never leaks lockout state. `failedLoginAttempts` + `lockedUntil` columns on `User`.
- **Refresh token rotation + reuse detection**: tokens stored as SHA-256 hashes, rotated on every refresh. Reuse revokes the whole token family.
- **Password reset flow**: `POST /auth/forgot-password` → email with 1-hour token → `POST /auth/reset-password` → revokes all sessions. Only `company_owner` role can self-serve reset. Drivers/planners reset via admin panel.
- **Email verification on registration**: `POST /auth/register-company` creates company with `status=pending`, sends verification email, login blocked until verified. `POST /auth/verify-email` activates company (`pending→trial`) and auto-issues tokens.
- **DB migration `20260518000002_auth_security`**: idempotent SQL — adds lockout columns to `User`, creates `PasswordResetToken` and `EmailVerificationToken` tables.
- **Web pages**: `/forgot-password`, `/reset-password?token=`, `/verify-email?token=`, RegisterPage "check inbox" state.

### EMAIL IS CURRENTLY DISABLED (no SendGrid key)
`env.EMAIL_ENABLED = !!process.env.SENDGRID_API_KEY`

**While disabled:**
- `register-company` sets company `status=trial` directly, returns tokens, logs in immediately — same UX as before
- `forgot-password` and `reset-password` routes exist but no email is sent (forgot-password silently succeeds, reset token is never delivered)
- Login lockout still works fully (no email dependency)

### What to do when SendGrid is re-enabled

1. **Add `SENDGRID_API_KEY` to Railway** — this single change activates the full email flow in production automatically (`env.EMAIL_ENABLED` becomes `true`).
2. **Add `EMAIL_FROM` to Railway** — the verified sender address in your SendGrid account (e.g. `noreply@logisticbay.com`).
3. **Test registration end-to-end**: register → "check inbox" screen → click link → lands on dashboard.
4. **Test forgot-password end-to-end**: request reset → email received → reset link works → all sessions revoked → login with new password.
5. **Test expired token**: reset link older than 1 hour → 400 error shown.
6. **Test driver/planner cannot use forgot-password**: only `company_owner` gets an email — others silently succeed with no email sent.
7. **Consider adding a resend-verification endpoint** if users lose the email before verifying.
8. **Consider adding MFA** for planner/owner accounts (listed in SAFETY.md security review TODO).

### Roles that can self-serve password reset
- `company_owner` — yes, via `/forgot-password` email flow
- `driver`, `planner`, `manager` — no, must be reset by company owner via admin panel (not yet built — add to settings page)
