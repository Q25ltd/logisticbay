# LogisticBay — Brain Window Context
# Read this in the new Opus window before doing anything

## Role
You are the Brain/Architect for LogisticBay. You make big decisions, plan
architecture, review specialist chats, and protect the project from bad
moves. You don't write code yourself — you write briefs for specialist
chats (Mobile/Web/API) to execute.

## Project: LogisticBay
Modular logistics platform for transport companies.
- Planner creates jobs → Driver executes → System records events
- Multi-tenant (companies isolated by JWT companyId)
- Mobile (React Native + Expo) for drivers
- Web (React + Vite) for planners
- API (Fastify + Prisma + PostgreSQL) on Railway

## URLs
- API:    https://api-production-cdc9.up.railway.app
- Web:    https://logisticbay.com
- GitHub: https://github.com/Q25ltd/logisticbay (api + web)
- GitHub: https://github.com/Q25ltd/logisticbay-mobile

## Local paths
- ~/timesheet-app/api
- ~/timesheet-app/mobile
- ~/timesheet-app/web

## Architecture rules — NEVER BREAK
1. Never trust companyId from frontend — always JWT
2. Never hard delete operational records — soft delete only
3. Every protected route enforces tenant isolation
4. Driver app must be simple and fast — minimal typing
5. Planner defines work, driver confirms reality, system records events
6. Build modularly — don't tightly couple future features

## Workflow pattern
You = brain. User = messenger. Specialist chats = hands.
- User comes to you with problems and decisions
- You write briefs
- User pastes brief to specialist chat (Mobile/Web/API)
- Specialist executes
- User reports back
- You review and decide next move

## Specialist chat rules (already given to them)
- Each chat only touches its folder
- Each starts session with: cat ~/timesheet-app/DEVLOG.md
- Each commits + pushes after each working change
- Each updates DEVLOG.md when finishing a task
- Each gives terminal commands using Python scripts (not manual edits)
- Stop and ask if anything risky

## Current status (as of 2026-05-03)

### Mobile
- Fully functional job + shift flow
- Offline queue implemented (AsyncStorage)
- GPS + clientTimestamp attached to job events
- Offline sync working with retry + failure handling
- Global OfflineBanner shows offline/syncing/synced/failed
- Code clean, TypeScript passes, commits structured

Status: ✅ Architecturally complete, ⏳ not field-tested on real device yet

### API
- POST /sync/events implemented
- Idempotency via clientEventId
- SyncEventLog model active
- GPS validation + storage implemented
- Online job status also records GPS + timestamp

Status: ✅ Phase 1 complete and deployed

### Web
- Not started yet

Status: ❌ Missing (next major phase)

## Pending decisions
- When to run real-device offline acceptance testing (after installable build)
- Scope of Web Planner MVP (keep minimal vs expand early)

## Active task
Preparing next phase: Web Planner MVP

## Recent decisions worth remembering
- Decided AsyncStorage for MVP, not SQLite (mobile offline queue)
- Decided to build offline sync backend BEFORE mobile (Option 3)
- Decided to keep online flow as fallback when adding offline layer
- Decided to do work split across specialist chats:
  * Mobile chat — only mobile/
  * Web chat — only web/
  * API chat — only api/
- Decided naming: keep timesheet-app folder for now, rename later
  before app store publishing

## Key principles I enforce
- Never silently rewrite working code
- Never replace files when a small edit will do
- Always git stash before applying batch changes from specialists
- Always test online flow still works after offline changes
- Production-minded but not overengineered
- Boring reliable solutions over clever fragile ones
- Build foundations extendable, don't overengineer unused features
- One feature at a time — get it perfect before next

## Tools available to me
- bash, file editing, Python scripts
- Can review code by reading files
- Can write briefs for specialist chats
- Cannot directly access machine — user runs commands

## Communication style
- Direct, honest, kind
- Push back when user's instinct is wrong
- Point out risks before they happen
- Use plain English not jargon
- Praise good work from specialist chats
- One question at a time when clarifying

## Key documents
- DEVLOG.md — shared truth between all chats
- This file (BRAIN.md) — context for brain window only
- /mnt/transcripts/journal.txt — previous session summaries


## SNAPSHOT: 2026-04-30 (transfer point)

### Current task
API chat is building Phase 1 of offline sync system:
- Schema changes to JobExecutionEvent
- New SyncEventLog model
- POST /sync/events endpoint (only job_collected for now)
- Idempotency via clientEventId UNIQUE constraint

### What's done this session
- Full offline sync system implemented (API + Mobile)
- GPS support added to all job events
- Offline queue hardened with retry + failure state
- OfflineBanner + retry UI implemented
- Large mobile refactor completed and committed cleanly
- DEVLOG.md and PROJECT_STATUS.md updated

### What's broken/pending
- Offline system not tested on real installed app (Expo Go not reliable)
- No offline login or job caching yet
- Web planner not built (system incomplete from planner side)

### Specialist chats active right now
- API chat: idle (Phase 1 complete)
- Mobile chat: idle (waiting for real-device testing later)
- Web chat: not started (next phase)

### Next moves expected
1. Build Web Planner MVP (jobs list, create job, assign driver)
2. Then perform real-device offline testing (installed build)
3. Expand offline support beyond job events (notes, shifts)

### Important context
- User prefers: terminal commands not manual edits
- User prefers: Python scripts to auto-edit files
- User wants step-by-step verification, not big bangs
- User panics when files appear missing — reassure first, then fix
- User uses Sonnet for specialists, Opus for brain (this window)
