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
- Auth: login (multi-company), refresh, me, change-password, register-company
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
DriverAvailability, ShiftPreference, HolidayRequest, DriverWorkingTimeSummary
