# LogisticBay — Cleanup Execution Plan

**Audience:** the coding agent (Sonnet) executing the cleanup.
**Authority:** this file is your contract for this work. If anything in here conflicts with your own judgement, this file wins — escalate to the user instead of "improving" the plan.
**Last updated:** 2026-05-30
**Tracking branch:** `cleanup/main-tracker` — all cleanup PRs target this branch, not `main`.

---

## YOU MUST READ THESE FIRST, IN THIS ORDER

1. `CLAUDE.md` — session-start checklist and authority hierarchy.
2. `CODE_AUDIT.md` — the audit you are executing. Every task in this plan maps back to an audit item ID (A.1, B.3, C.2, etc.). **Note: the audit was taken on 2026-05-30. Recent commits to `main` have already addressed some items — TASK 0.4 will reconcile this.**
3. `STATUS.md` — current build state. Cross-reference here so you do not duplicate something already complete.
4. `QUESTIONS.md` — open product/design questions. May overlap with Section E of `CODE_AUDIT.md`.
5. `SAFETY.md` — sections 4 (event-based model), 6 (tenant isolation), 7 (data cleanup), 14 (soft delete). These are non-negotiable.
6. `DATA_DICTIONARY.md` and `ARCHITECTURE.md` — for naming.
7. `api/prisma/schema.prisma` — implementation truth.
8. `DEVLOG.md` top 3 entries — last sessions' context.

> Older planning docs (`RELEASE_READINESS.md`, `PROJECT_STATUS.md`, etc.) live in `docs/archive/` and are **read-only historical reference**. If something in this plan refers to a doc that lives in `docs/archive/`, that reference is for context only — do not act on it as a source of truth.

**You may not begin any task before reading the above. Confirm to the user, in your first message of every session, that you have re-read this file and the audit.**

---

## THE 21 COMMANDMENTS — non-negotiable

1. **One task at a time.** Finish, verify, commit, update checkpoint, move on. No bundling.
2. **No scope creep.** If you spot something else that needs fixing, log it under "DISCOVERED" at the bottom of this file. Do NOT fix it inline.
3. **No silent renames.** Renaming a field, function, type, or status string is its own task with its own gate.
4. **No "while I'm here" tidying.** If a file is dirty in a way that is not the current task, leave it.
5. **No deletes without proof.** Before deleting code, run `grep -rn "<name>" .` excluding `node_modules`, `dist`, `generated`. Paste the output count in the PR.
6. **No schema changes without a migration.** Edit `schema.prisma` only via `npx prisma migrate dev --name <name>`. Never hand-edit a migration after it has been applied to staging.
7. **Migrations are additive first.** Add column nullable → backfill → switch reads → switch writes → drop old. Never combine.
8. **No destructive SQL in migrations** without an explicit STOP gate. `DELETE`, `DROP COLUMN`, `DROP TABLE`, `TRUNCATE` → STOP and confirm.
9. **Stay tenant-scoped.** Every new Prisma write must include `companyId` in the `where` (use `updateMany`/`deleteMany` if `update`/`delete` does not allow it). Every new read must filter `companyId`.
10. **No behaviour change without a flag.** If a fix changes what users experience (e.g. tightening cancel rules), wrap behind a `Company` feature flag or get explicit approval.
11. **Verification is part of done.** A task without the four-line verification block at the bottom is not done.
12. **Stop on doubt.** If you cannot answer "what is the user-visible change here?" in one sentence, stop and ask.
13. **No new dependencies.** Adding an npm package needs explicit approval. Use what's already in `package.json`.
14. **Update the checkpoint after every task.** The checkpoint is the only state that survives between sessions.
15. **Register what you create.** Every new route file must be imported and registered in `api/src/app.ts` in the same commit it's created. Every new web page must be added to the router in `web/src/App.tsx`. After creating a file, run `grep -rn "<filename>" api/src web/src` and confirm at least one import exists before committing.
16. **Search before writing.** Before adding a function whose name contains `validate*`, `format*`, `build*`, `parse*`, `check*`, `compute*`, or any verb that smells generic, run `grep -rn "functionName" api/src` first. If it exists, import it. If a near-duplicate exists, extend or extract — do not create a parallel implementation.
17. **No `any`, no unvalidated casts.** `any` is forbidden. `as Type` is only allowed immediately after a Zod parse, a `typeof` check, an `instanceof` check, or a Prisma raw query that types are known to misrepresent (cite which one in a one-line comment). Use `unknown` and narrow it.
18. **Every Zod string has `.max()`.** No `z.string()` is allowed without a `.max(N)` chained somewhere in the same schema definition. User-visible string fields also have `.trim()`. Open-bounded text (notes, descriptions) caps at 4000; references and codes cap at 64; names cap at 200. CI grep gate: `grep -nE "z\.string\(\)([^.]|\.[^m])" api/src/schemas` must return zero hits unless the next chain is `.max(`.
19. **Never comment out code.** Delete it. Git history is the archive. A `//` followed by what looks like a former code line, or a `/* … */` wrapping a function body, fails review automatically.
20. **One error envelope.** All API error responses use `{ error: string, code?: string, details?: unknown }` — no other shape. Use the helpers in `api/src/lib/errors.ts` (created by TASK 3.7): `notFound("Job")`, `badRequest("VEHICLE_REQUIRED", "Vehicle type must be selected")`, `forbidden("Not your job")`, `conflict("DUPLICATE_REPEAT", "...")`. Do not inline `reply.status(404).send({ error: "..." })`.
21. **Auth check lives in middleware only.** No `jwt.verify` outside `api/src/middleware.ts` and `api/src/lib/tokens.ts`. Every route that touches user-owned data has `{ preHandler: authenticate }` (or `[authenticate, requireRole(...)]`) on its declaration. CI grep gate: `grep -rn "jwt.verify" api/src --include="*.ts" | grep -v middleware.ts | grep -v lib/tokens.ts` must return zero hits.

Breach any of these → revert your work and ask the user.

---

## READ-ONLY ZONES (do not modify unless the active task explicitly authorises)

Active task scope is defined per-task below. By default, treat these as read-only:

- `api/prisma/migrations/**` — historical migrations are immutable.
- `api/src/generated/**` — generated client, never edit.
- `DEVLOG.md` historical entries — only append new entries at the top.
- `SAFETY.md` — only the auditor adds new vulnerability rows. Body unchanged unless instructed.
- `CODE_AUDIT.md` — only flip status boxes per the rules in that file.
- `CLEANUP_PLAN.md` — only the CHECKPOINT table, DISCOVERED, BLOCKED, and DECISIONS sections. The plan body, commandments, STOP gates, and task definitions are immutable to the agent. If you believe a task definition is wrong, log it under BLOCKED and ask the user.
- `docs/archive/**` — historical context only, never modify.
- `node_modules/`, `dist/`, `.expo/`, `.vercel/`, `.clone/`, `.claude/worktrees/`.

---

## PER-TASK LIFECYCLE — follow exactly

### 1. Claim
- Open `CODE_AUDIT.md`, find the audit item this task fixes.
- Change `[ ]` to `[~]` and add `Owner: sonnet-<short-uuid>`.
- Open this file, find the matching plan entry, mark `STATUS: in-progress`.

### 2. Pre-flight checklist (paste answers into your scratch notes; do not commit them)
- **Q1.** Which audit item(s) am I fixing? (must be exactly the items in the task scope)
- **Q2.** What files am I allowed to read?
- **Q3.** What files am I allowed to modify?
- **Q4.** What is the user-visible change in one sentence?
- **Q5.** What test will prove this works?
- **Q6.** What test will prove this did not break tenant isolation?
- **Q7.** Is there a STOP gate before I start? (see per-task) If yes, halt and ask.

If you cannot answer any of Q1–Q5, STOP and ask the user.

### 3. Branch
- Create a branch: `cleanup/<phase>-<task-id>-<short-slug>` (e.g. `cleanup/p2-a1-unify-state-machine`).
- Never push to `main` or `staging` directly.

### 4. Implement
- Make the smallest change that satisfies acceptance criteria in `CODE_AUDIT.md`.
- Do not refactor code outside the task scope, even if it would make your task easier — if you must, raise as a blocking question.

### 5. Verify (mandatory — see verification protocol below)
- Type-check.
- Run tests.
- Run the targeted test you wrote (you almost always need to add one).
- Manually trace through the changed code in your head against acceptance criteria.

### 6. Commit
Commit message format (strict):
```
cleanup(<phase>): <audit-id> <short-summary>

Audit: CODE_AUDIT.md <audit-id>
Scope: <one sentence>
Files: <comma-separated paths>
Verified: <typecheck OK | test added: <path> | tenant-isolation test passes>
Behaviour change: <none | user-visible: …>
```

Example:
```
cleanup(P2): A.14 remove dead api/src/auth.ts

Audit: CODE_AUDIT.md A.14
Scope: delete unused module and bcrypt dep
Files: api/src/auth.ts, api/package.json, api/package-lock.json
Verified: typecheck OK; grep for bcrypt (native) returns 0 hits in api/src
Behaviour change: none
```

### 7. Update checkpoint
- In this file, set task `STATUS: done`, paste the verification block, paste the commit sha.
- In `CODE_AUDIT.md`, flip `[~]` to `[x]` with the verification block.
- Append a one-line entry to `DEVLOG.md` under a new dated section.

### 8. Open PR
- Title: `cleanup(<phase>): <task-id> <summary>`.
- Body: copy the commit message, plus the answers to Q1–Q7 from the pre-flight checklist, plus screenshots of test output.
- Request review from the user. **Do not self-merge.**

### 9. Move on only after merge
- If the user requests changes, address them in the same branch.
- If the user rejects, revert your status changes in this file and `CODE_AUDIT.md` back to `[ ]`, log the reason under "BLOCKED" at the bottom of this file.

---

## VERIFICATION PROTOCOL

You must run these before claiming done. Output goes into the PR body.

### Always:
```bash
npm run typecheck
npm run check:vocab
npm test --prefix api
npx knip                                                 # added — see TASK 0.5
grep -rn "z\.string\(\)([^.]|\.[^m])" api/src/schemas    # Commandment 18 gate — must return 0
grep -rn "jwt.verify" api/src --include="*.ts" | grep -v middleware.ts | grep -v lib/tokens.ts   # Commandment 21 gate — must return 0
grep -rn " as any" api/src --include="*.ts"              # Commandment 17 gate — must return 0
```

All must exit 0 / return 0 hits. If any fail and the failure is unrelated to your task, STOP and ask — do not "fix" the unrelated failure.

### If you touched a route handler:
- Add a happy-path test in `api/src/tests/` using `app.inject()`.
- Add a tenant-isolation assertion using the pattern in `tenant-isolation.test.ts`.
- If the route writes to the DB, assert the row was created/updated as expected by re-querying with Prisma.

### If you touched the state machine, sync, or idempotency:
- Add a test asserting the same `clientEventId` posted twice returns `duplicate` the second time.
- Add a test asserting an invalid transition returns 400 and writes nothing to `JobExecutionEvent`.

### If you touched the schema:
- Confirm `npx prisma migrate dev --name <task-id-slug>` runs cleanly against a local DB.
- Confirm `npx prisma migrate deploy` then `npm test --prefix api` against an empty DB.
- Confirm the new migration is **additive only** (no `DROP`, no destructive `ALTER`).

### If you deleted code:
- `grep -rn "<deleted-symbol>" . --include="*.ts" --include="*.tsx" --include="*.md" | grep -v node_modules | grep -v dist | grep -v generated` returns 0 hits.
- Paste the command output in the PR.

### If you touched tenant scoping:
- Run `api/src/tests/tenant-isolation.test.ts` and paste output.
- If the touched route is not yet covered by the test, add it.

---

## STOP GATES — halt and ask the user

Stop and post a message starting with **"STOP — need user input"** before doing any of these:

- **S1.** Answering any Section E question from `CODE_AUDIT.md`.
- **S2.** Schema changes that drop a column or table.
- **S3.** Changes that alter a user-visible behaviour (cancel rules, status transitions, default values).
- **S4.** Adding a dependency to `package.json`.
- **S5.** Modifying CI, deployment config (`railway.json`, `vercel.json`, `Dockerfile`, `start.sh`).
- **S6.** Touching production secrets or `.env` defaults.
- **S7.** Anything that would invalidate existing user sessions (changing JWT shape, secret rotation).
- **S8.** A migration that requires data backfill of > 1000 rows.

Format of a STOP message:
```
STOP — need user input

Task: <task-id>
Reason: <one of S1..S8>
Question: <specific question, with options A/B/C if applicable>
Why I cannot decide: <one sentence>
Blocking until: <expected answer time / not blocking>
```

---

## PHASES — execute in order. Do not start phase N+1 before phase N is fully merged.

Each task lists: **scope · files · STOP gates · acceptance · verification · audit refs**.

---

## PHASE 0 — Baseline & safety harness

Goal: leave a known-good starting point and a way to detect drift.

### TASK 0.1 — Snapshot baseline

- **STATUS:** open
- **Scope:** capture baseline state.
- **Files (read):** entire repo. **Files (modify):** `DEVLOG.md` only (append).
- **Acceptance:**
  1. Run `npm run typecheck` → record output.
  2. Run `npm test --prefix api` → record output.
  3. Run `npm run check:vocab` → record output.
  4. Run `grep -rn "PlannedJob\|plannedJob" . --include="*.ts" --include="*.md" | grep -v node_modules | grep -v generated | wc -l` and record number.
  5. Run `grep -rn "TODO\|FIXME\|XXX" api/src --include="*.ts" | wc -l` and record number.
  6. Append a `DEVLOG.md` entry: "Cleanup baseline 2026-XX-XX — typecheck OK, N tests pass, M PlannedJob refs, P TODOs."
- **Verification:** appended entry visible; numbers cited verbatim.
- **Audit refs:** none — this is bookkeeping.
- **STOP gates:** none.

### TASK 0.2 — Set up branch hygiene

- **STATUS:** open
- **Scope:** ensure cleanup work is isolated.
- **Files:** none (git config).
- **Acceptance:**
  1. Create branch `cleanup/main-tracker`. All cleanup PRs target this branch, not `main`.
  2. Open this file and add: `Tracking branch: cleanup/main-tracker` under the title.
  3. Confirm Vercel and Railway will NOT auto-deploy from `cleanup/main-tracker`.
- **STOP gate:** **S5** — touching deploy config. **STOP and ask** before disabling auto-deploy.

---

### TASK 0.3 — Fix vocab drift (precondition for Phase 2 verification)

- **STATUS:** open
- **Audit refs:** none — this is plumbing.
- **Why:** `npm run check:vocab` currently exits 1 because `web/src/constants/vehicleTaxonomy.ts` (435 lines) carries an extra `bodyTypeLabel(...)` helper at line 433 that is not in `shared/vehicleTaxonomy.ts` or `api/src/constants/vehicleTaxonomy.ts` (423 lines each). Until this is fixed, every Phase 2+ task's verification protocol fails — and Commandment 11 says "verification is part of done".
- **Scope:** decide where `bodyTypeLabel` belongs and resync.
- **Files (modify) — one of the two paths:**
  - **Path A (preferred):** move `bodyTypeLabel` into `shared/vehicleTaxonomy.ts`, copy to `api/src/constants/vehicleTaxonomy.ts` and `mobile/src/constants/vehicleTaxonomy.ts` so the three core files are byte-identical. Web continues to import from its local copy.
  - **Path B:** delete `bodyTypeLabel` from `web/src/constants/vehicleTaxonomy.ts` and inline the logic at its call sites. Only viable if the helper is used in ≤ 3 places.
- **STOP gate:** none if Path A. **S3** if Path B (call-site changes can affect UX rendering of body type labels).
- **Acceptance:**
  1. `npm run check:vocab` exits 0.
  2. `diff` of the three core files produces no output.
  3. Web compiles and the page using `bodyTypeLabel` still renders identical text (manual smoke test acceptable — no need for a full e2e).
  4. The PR description states which path was taken and why.

---

### TASK 0.4 — Reconcile CODE_AUDIT.md against current `main`

- **STATUS:** open
- **Why:** the audit was taken at a commit before recent security work. Several items are already addressed in `main`:
  - `48f84d2 feat(security): fail fast on missing JWT secrets` → likely fixes audit B.7.
  - `71d4716 feat(security): refresh token rotation, 15m access TTL, /auth/logout` → may affect audit B.17.
  - `08d6fd6 feat(security): full tenant isolation test suite + GitHub Actions CI` → covers the audit's "tenant test only covers 2 endpoints" concern.
  - `48bbe82 feat(security): per-route rate limits` → covers register/refresh/change-password rate-limit concerns.
  - `44aa5a0 Codebase deduplication: shared utils, recall fix, naming consistency` → may have addressed parts of Section A.
  - `e896f2a Replace AI calls with deterministic rules` → architectural change; verify the audit didn't make assumptions that no longer hold.
- **Scope:** read-only reconciliation. For every audit item, determine its current state and tag it accordingly.
- **Files (modify):** `CODE_AUDIT.md` only — flip status boxes per the rules in that file.
- **Acceptance:** for every item in `CODE_AUDIT.md` Sections A, B, C, D:
  1. Read the cited `file:line` references against `main`.
  2. Tag the item as one of:
     - `[x]` **already-fixed** — cite the commit sha in the verification block; example: `Already fixed: commit 48f84d2 — feat(security): fail fast on missing JWT secrets`.
     - `[~partial]` — some sites fixed but duplication still exists elsewhere; cite which sites remain.
     - `[ ]` — still applies as written.
     - `[~obsolete]` — the underlying code no longer exists (architectural change). Cite which commit removed it.
  3. Do **not** modify any code in this task — read-only.
  4. Post a summary in the PR: "N items already-fixed, M partial, P still-open, Q obsolete."
- **STOP gate:** none — read-only.

---

### TASK 0.5 — Install knip and baseline current dead-code state

- **STATUS:** open
- **Audit refs:** D.1–D.6 (and prevention going forward).
- **Why:** Section D of `CODE_AUDIT.md` is six dead-code findings caught by hand. `knip` finds them automatically and prevents new ones.
- **Files (modify):** `package.json` (root), `knip.json` (new), `.github/workflows/ci.yml` (add knip step).
- **Scope:**
  1. `npm install --save-dev knip` at repo root.
  2. Create `knip.json` with `workspaces` entry for `api`, `web`, `mobile`, `shared`.
  3. Run `npx knip` once to record baseline. **Do not fix findings in this task** — fixes belong in Phase 5.
  4. Commit the baseline as a snapshot in `DEVLOG.md`.
  5. Add `npx knip` to CI as a non-blocking check first (warning only). Once Phase 5 closes the baseline list, flip it to blocking.
- **STOP gate:** **S4** — adds a dependency. **STOP and confirm before running `npm install`.**
- **Acceptance:**
  - `npx knip` runs and produces output.
  - CI configured.
  - Baseline numbers (unused files, unused exports, unused dependencies) recorded in `DEVLOG.md`.

---

### TASK 0.6 — Scope `AuthCtx.Provider` and `useAuthProvider()` to `/app/*`

- **STATUS:** open
- **Audit refs:** new (web — was out of original audit scope, surfaced during public/private review).
- **Why:** today `web/src/App.tsx:42` wraps the entire `<BrowserRouter>` in `AuthCtx.Provider`, and `useAuthProvider()` (`web/src/hooks/useAuth.ts:30-71`) starts a 5-minute `setInterval` that hits `/auth/refresh`. This runs on every page, including:
  - `/` LandingPage
  - `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`
  - `/request/:token` PublicRequestForm (the customer-facing intake form a planner shares with end customers)

  Effects: (1) a logged-in planner who opens `/request/:token` to test/share leaks `/auth/me` and `/auth/refresh` traffic from that public URL; (2) public visitors trigger `setInterval` and unnecessary fetches on the landing page; (3) any future provider added at the root will inherit the same leak.
- **Scope:** restructure `web/src/App.tsx` so the auth-bearing context only mounts under `/app/*`. Public routes get either no auth context or a frozen stub.
- **Files (modify):**
  - `web/src/App.tsx` (the structural rewrite — single file)
  - `web/src/modules/planner/AppShell.tsx` (likely lifts `useAuthProvider()` invocation into here, or into a new `AuthLayout` route element wrapping `/app`)
  - **Read-only:** `web/src/hooks/useAuth.ts` — leave the hook untouched, only change *where* it is invoked.
- **Implementation sketch (do not deviate without asking):**
  1. Pull `useAuthProvider()` out of `App()` body.
  2. Replace the root `<AuthCtx.Provider>` wrapping `<BrowserRouter>` with a plain `<BrowserRouter>`.
  3. Create an `<AuthLayout>` route element that calls `useAuthProvider()`, renders the loading state, then renders `<AuthCtx.Provider><Outlet /></AuthCtx.Provider>`.
  4. Wrap only the `/app` route in `<AuthLayout>`. Public routes render directly without the provider.
  5. The `/login`, `/register`, `/verify-email` routes still need to call `auth.refresh` after submit — they can either import the context conditionally (it won't be present) or use a smaller dedicated `useLoginRedirect()` hook that reads `getToken()` and decides without subscribing to the full provider.
- **STOP gate:** **S3** — user-visible behaviour change. Public pages will no longer fire `/auth/me` or poll `/auth/refresh`. Logged-in users visiting `/` will no longer auto-redirect (they already had to click "go to app"); confirm with the user this is desired before merging.
- **Acceptance:**
  1. Incognito visit to `/` shows **zero** network calls to `/auth/*` in the Network tab.
  2. Incognito visit to `/login` shows zero `/auth/*` calls until the user submits the form.
  3. Incognito visit to `/request/:token` shows the form and the public link-info endpoint only — no `/auth/*`.
  4. `/app/dashboard` in incognito redirects to `/login` (existing behaviour preserved).
  5. Logged-in `/app/dashboard` still receives the 5-minute refresh poll (existing behaviour preserved).
  6. Console clean on all of the above (no React errors about missing context, no failed fetches).
- **Verification:**
  - `npm run typecheck` (web): exit 0.
  - Manual Chrome Network tab capture pasted in the PR for steps 1–5.
  - `grep -rn "useAuthProvider\|AuthCtx.Provider" web/src` returns exactly one invocation site (the new `AuthLayout`).

---

### TASK 0.7 — Audit `jobRequestsPublicApi` for Bearer-token leakage (read-only)

- **STATUS:** open
- **Audit refs:** new.
- **Why:** the public request form (`/request/:token`) is meant to be opened by end customers — people who are not logged in to LogisticBay. If `web/src/api/jobRequests.ts` shares the same axios/fetch instance as `web/src/api/client.ts` (the authed client), then any logged-in planner testing the link from their own browser will accidentally send their Bearer token to the public endpoint. Worse, if the public endpoint then stores or echoes anything from the request headers, the token leaks downstream.
- **Scope:** read-only audit of three files. No code change unless a leak is found — if found, raise as TASK 0.7.b under DISCOVERED.
- **Files (read):**
  - `web/src/api/jobRequests.ts`
  - `web/src/api/client.ts`
  - `web/src/modules/requests/PublicRequestForm.tsx` (imports)
- **Acceptance:** post a one-paragraph finding to the PR:
  - "`jobRequestsPublicApi` uses the same client as `client.ts` — Bearer token IS attached to public endpoints. **Leak confirmed.**" → opens follow-up task to use a separate fetch instance.
  - **or** "`jobRequestsPublicApi` uses a separate fetch instance with no Authorization header. **No leak.**" → done.
- **STOP gate:** none (read-only).
- **Verification:**
  - `grep -nE "Authorization|Bearer|getToken" web/src/api/jobRequests.ts web/src/api/client.ts` output pasted into the PR.

---

## PHASE 1 — Design decisions (HUMAN ONLY)

You will NOT execute any code in this phase. You will hand the user a numbered list of decisions from Section E of `CODE_AUDIT.md`, plus any new design questions you discover during Phase 0, and wait.

### TASK 1.1 — Answer Section E

- **STATUS:** open
- **Scope:** force a decision on every question in Section E of `CODE_AUDIT.md` (E.1 through E.7).
- **Files:** read `CODE_AUDIT.md`; modify nothing.
- **Acceptance:**
  1. Post a single message titled `STOP — Phase 1 design decisions`.
  2. For each E.x question, present:
     - Restatement in your own words.
     - The minimum 2 viable options with a one-line cost/benefit each.
     - Your suggested default (clearly labelled as a suggestion).
  3. Wait for user answers.
  4. When answers arrive, append a new section `## DESIGN DECISIONS (from user, 2026-XX-XX)` to the BOTTOM of `CODE_AUDIT.md` recording verbatim what was decided.
  5. Cross-reference each Phase 2+ task that depends on the answer.
- **STOP gate:** **S1** — by definition. You may not proceed until answers are written.

---

## PHASE 2 — Foundation refactors (the duplications)

Goal: collapse duplicated logic so subsequent fixes have one place to change. Execute strictly in order — each task depends on the previous.

### TASK 2.1 — Single source of event definitions

- **STATUS:** blocked (depends on TASK 1.1 answer to E.1, E.4)
- **Audit refs:** A.5, A.6, A.13.
- **Scope:** replace `STATUS_BY_EVENT_TYPE`, `EVENT_TYPE_MAP`, `SUPPORTED_EVENT_TYPES`, `ALLOWED_JOB_TRANSITIONS` with a single source object. Update stale `PlannedJob` references.
- **Files (modify):**
  - `api/src/sync/sync.constants.ts` (rewrite)
  - Any file that imports the four old constants (read-only on consumers — only update import paths and re-export from the new source)
- **Files (read-only):** schema, mobile, web.
- **Acceptance:**
  1. Create `EVENT_DEFINITIONS: Record<EventType, { resultingStatus: JobStatus, allowedFromStatuses: JobStatus[] }>`.
  2. Derive the four old constants from `EVENT_DEFINITIONS`. Old constants keep their public names so callers don't change.
  3. Run grep: `grep -rn "PlannedJob" api/src --include="*.ts"` — fix every comment.
  4. Stale comment in `sync.constants.ts:40-41` removed or corrected.
- **Verification:**
  - typecheck OK.
  - `npm test --prefix api` passes.
  - Add `api/src/sync/sync.constants.test.ts` that proves `STATUS_BY_EVENT_TYPE`, `EVENT_TYPE_MAP`, and `ALLOWED_JOB_TRANSITIONS` are derivable from `EVENT_DEFINITIONS` and not hand-edited.
- **STOP gate:** none (this is purely additive).
- **Behaviour change:** none expected — if `EVENT_DEFINITIONS` does not produce identical constants to today, STOP and ask.

### TASK 2.2 — Extract `validateGpsPair` and `validateClientTimestamp`

- **STATUS:** blocked (depends on 2.1)
- **Audit refs:** A.3, A.4.
- **Scope:** two helpers, replace inline duplicates.
- **Files (modify):**
  - Create `api/src/lib/gps.ts`.
  - Create `api/src/lib/eventTimestamp.ts`.
  - Edit only the call sites: `api/src/routes/jobs.ts:405-427`, `api/src/routes/sync.ts:60-102`, `api/src/sync/sync.service.ts:32-45`.
- **Acceptance:**
  1. `validateGpsPair(lat, lng): { valid: true } | { valid: false; reason: string }`.
  2. `validateClientTimestamp(iso): { valid: true; date: Date; needsReview: boolean; reviewReason?: string } | { valid: false; reason: string }`.
  3. Online path uses both. Sync path uses both. **The "reject vs flag" decision from E.4 determines whether sync rejects or flags.**
  4. Unit tests in `api/src/lib/gps.test.ts` and `api/src/lib/eventTimestamp.test.ts`.
- **Verification:** type-check + tests + run `grep -nE "gpsLat\b" api/src/routes` → only references should be via the helper, not inline range checks.
- **STOP gate:** **S3** if E.4 says "online should now flag instead of reject" (changes behaviour for planners).

### TASK 2.3 — Extract `applyJobEvent`

- **STATUS:** blocked (depends on 2.1, 2.2)
- **Audit refs:** A.1, A.2, B.5, B.3 (partial).
- **Scope:** one function that both `routes/jobs.ts` PATCH and `sync.service.ts` use.
- **Files (modify):**
  - Create `api/src/sync/applyJobEvent.ts`.
  - Edit `api/src/sync/sync.service.ts` to call it.
  - Edit `api/src/routes/jobs.ts` `PATCH /jobs/:id/status` handler to call it.
- **Function contract:**
  ```ts
  applyJobEvent(tx, {
    companyId: number,
    actorUserId: number,
    role: UserRole,
    jobId: number,
    eventType: EventType,
    clientEventId: string,   // required, no server fallback
    clientTimestamp: Date,
    gps?: { lat: number; lng: number },
    note?: string,
    payload?: { actualQuantity?, actualUnit?, podNumber?, ... },
  }): Promise<
    | { status: 'accepted'; jobStatus: JobStatus; needsReview: boolean }
    | { status: 'duplicate'; jobStatus: JobStatus }
    | { status: 'failed'; reason: string }
  >
  ```
- **Acceptance:**
  1. Idempotency: same `clientEventId` returns `duplicate`.
  2. Transition validation: uses `ALLOWED_JOB_TRANSITIONS` derived from 2.1. **No role bypass** — planners that want to override go through a separate `plannerOverrideStatus` endpoint to be added in a later task. (STOP-and-ask if you cannot find that endpoint.)
  3. Writes `JobExecutionEvent` and updates `Job.status` in a single transaction.
  4. Cancel cascade always fires regardless of role (per B.5/A.2).
  5. `clientEventId` is required. No server-generated fallback.
- **Verification:**
  - Online `PATCH /jobs/:id/status` without `clientEventId` returns 400.
  - Online and sync paths share `applyJobEvent`. `grep` proves no inline status writes remain in either file.
  - Unit tests cover: happy path, duplicate, invalid transition, missing clientEventId, gps out of range, stale timestamp.
- **STOP gate:** **S3** — this changes planner behaviour (no bypass) and rejects missing clientEventId. **STOP and ask before implementing**, then proceed only with explicit "yes proceed".

### TASK 2.4 — Extract `cancelRun`

- **STATUS:** blocked (depends on 2.3)
- **Audit refs:** A.7, B.4 (partial), B.15.
- **Scope:** unify run cancellation across `routes/runs.ts` DELETE and `routes/planning.ts` PATCH(status=cancelled).
- **Files (modify):**
  - Create `api/src/services/runService.ts`.
  - Edit `routes/runs.ts` and `routes/planning.ts` to delegate.
- **Acceptance:**
  1. Single transaction.
  2. Audit log entry on every cancel.
  3. Sets `removalReason` on every assignment.
  4. Calls `syncJobPlanningStatuses(tx, ...)` inside the same tx.
  5. **Does not hard-delete LoadTrack** — see TASK 4.3 for the soft-delete schema change. Until then, the hard delete from `routes/runs.ts:356` is **DISABLED** by this task; leave a TODO and add an integration test asserting cancelled runs preserve their LoadTrack rows.
- **STOP gate:** **S3** — preserving LoadTrack on cancel is a behaviour change. **STOP and confirm.**

### TASK 2.5 — Extract `parseIdParam`, `dayRangeUtc`, `TxClient`

- **STATUS:** blocked (depends on 2.4)
- **Audit refs:** A.9, A.11, A.12.
- **Scope:** small helpers, mechanical replacement.
- **Files (modify):**
  - Add to `api/src/lib/validate.ts` and `api/src/lib/dateUtils.ts`.
  - Add `api/src/lib/types.ts` exporting `TxClient = Prisma.TransactionClient`.
  - Replace all call sites.
- **Acceptance:** zero inline `parseInt((request.params ...).id, 10)` left in `api/src/routes/`. Zero inline `Omit<PrismaClient, ...>` left. Zero inline `new Date(\`${dateFrom}T00:00:00.000Z\`)` left.
- **Verification:**
  - `grep -nE "parseInt\(\(request.params" api/src/routes` returns 0.
  - `grep -nE 'Omit<PrismaClient, "\\$connect"' api/src` returns 0.
  - `grep -nE "T00:00:00.000Z" api/src/routes` returns 0.
- **STOP gate:** none.

---

## PHASE 3 — Bug fixes (logic that can break)

Each task is small and independent — execute in numeric order but they can be queued.

### TASK 3.1 — Outbox-based shift submit

- **STATUS:** blocked (depends on phase 2 merged)
- **Audit refs:** B.1, B.11.
- **Scope:** replace `setImmediate` in `routes/shifts.ts:225, 299` with an outbox row + worker.
- **Files (modify):**
  - Schema: add `ShiftSubmitJob` table (id, shiftId, companyId, status, attempts, lastError, nextAttemptAt).
  - Migration via `prisma migrate dev`.
  - Edit `routes/shifts.ts` to write outbox row inside the submit transaction.
  - Create `api/src/jobs/shiftSubmitWorker.ts` — polls outbox, generates PDF, sends email, updates working time. Idempotent (re-running on same shiftId is safe).
  - Edit `api/src/server.ts` to boot the worker (single-instance check).
- **Acceptance:**
  1. Shift submit returns 200 instantly with `{ shiftId, status: "queued" }`.
  2. Worker processes within 30 seconds.
  3. If PDF fails, attempts++, retries with backoff up to 5 times, then marks `failed` and pings Sentry.
  4. Single-instance check: worker uses `pg_advisory_lock` keyed on `shift_submit_worker` so multi-Railway-instance does not double-process.
- **Verification:**
  - Integration test: submit a shift, assert outbox row is created in the same transaction (fails together).
  - Integration test: kill worker mid-submit, restart, assert idempotent completion.
- **STOP gate:** **S3** — behaviour change (response shape changes, email arrives async). **STOP.**

### TASK 3.2 — Reject missing `clientEventId` from job-note endpoint

- **STATUS:** blocked (depends on 2.3)
- **Audit refs:** B.5.
- **Scope:** `POST /jobs/:id/note` currently generates a server-side `clientEventId`. Require it from the caller.
- **Files (modify):** `api/src/routes/jobs.ts`, `api/src/schemas/jobs.ts`, mobile client (separate PR if needed — note in the PR description).
- **Acceptance:**
  - Schema requires `clientEventId`.
  - Tests cover missing → 400, duplicate → 200 with `{ duplicate: true }`.
- **STOP gate:** **S3** — mobile must be updated in lockstep. **STOP** until the mobile change is queued.

### TASK 3.3 — Add `companyId` to every `update`/`delete` `where`

- **STATUS:** blocked (depends on 2.5)
- **Audit refs:** B.10.
- **Scope:** defence in depth.
- **Files (modify):** every `api/src/routes/*.ts` containing a `prisma.<model>.update({ where: { id }, ... })` after a `findFirst({ id, companyId })`.
- **Acceptance:**
  - Convert all such calls to `updateMany({ where: { id, companyId } })` (or `update` when Prisma supports composite); if count == 0 → throw 404.
  - `grep -nE "prisma\\.\\w+\\.update\\(\\{ where: \\{ id\\b" api/src/routes` returns 0 (except inside transactions that already filter companyId — leave a comment if so).
- **STOP gate:** none.

### TASK 3.4 — Agency-driver PIN reset safety

- **STATUS:** blocked (depends on Phase 1 if E.x covers this — otherwise STOP S1)
- **Audit refs:** B.12.
- **Scope:** prevent Company A planner from resetting an agency driver's PIN when the driver also belongs to Company B.
- **Files (modify):** `routes/companies.ts:461-485`.
- **Acceptance:**
  - When the target User has > 1 active CompanyMembership, the reset endpoint returns 409 with `{ error: "MULTI_COMPANY_DRIVER", message: "This driver belongs to multiple companies. PIN reset is disabled to protect their other employers." }`.
  - Add an integration test creating exactly this scenario.
- **STOP gate:** **S1** — product decision: do we allow per-membership PINs? **STOP and ask.**

### TASK 3.5 — Restore-tenant guard on background `autoCleanupOldShifts`

- **STATUS:** blocked (depends on Phase 0 baseline)
- **Audit refs:** B.2.
- **Scope:** convert global `updateMany` to per-tenant loop with explicit `companyId`.
- **Files (modify):** `api/src/routes/shifts.ts:437-466`.
- **Acceptance:**
  1. Function iterates companies, runs cleanup with `where: { companyId, … }`.
  2. Wraps each iteration in try/catch with Sentry breadcrumb (Sentry may not be installed yet — log structured error for now, link to RELEASE_READINESS.md P0.2).
  3. Use `pg_advisory_lock` to prevent multi-instance duplicate execution.
  4. Move `setInterval` out of the route file into `api/src/jobs/autoCleanupWorker.ts`. Route file no longer schedules.
- **STOP gate:** none.

### TASK 3.6 — Discover all `Job.status` direct writes

- **STATUS:** blocked (depends on 2.3)
- **Audit refs:** B.3.
- **Scope:** discovery + design only. No code change yet.
- **Files:** read-only sweep.
- **Acceptance:**
  - Produce a list of every `prisma.job.update({ ... status })` and `prisma.job.create({ ... status })` site.
  - Classify each: "executes through applyJobEvent" / "planning transition (syncJobPlanningStatuses)" / "direct write — needs justification".
  - Post the list and STOP. Decision needed: which sites stay direct, which move behind a reconciler.
- **STOP gate:** **S3** — depending on outcomes you may propose a job-status reconciler (RELEASE_READINESS.md P0.14). **STOP and present findings.**

---

### TASK 3.7 — Consistent error envelope + helpers

- **STATUS:** blocked-by-2.5
- **Audit refs:** new (preventative — addresses inconsistency noted around B.14, C.7, error response sites).
- **Why:** the API returns at least three error envelope shapes today:
  - `{ error: "Job not found" }` (most routes)
  - `{ error: "BAD_REQUEST", message: "..." }` (sync, GPS validation in `routes/sync.ts`, parts of `routes/jobs.ts`)
  - `{ error: "Validation failed", details: [...] }` (Zod parse failures)
  - `{ error: "VEHICLE_REQUIRED", message: "..." }` (some structured paths)

  Web and mobile clients have to guess. Standardise on one shape and provide helpers.
- **Files (modify):**
  - Create `api/src/lib/errors.ts` exporting:
    ```ts
    export const HttpError = (status: number, error: string, code?: string, details?: unknown) => …
    export const notFound = (entity: string) => HttpError(404, `${entity} not found`, `${entity.toUpperCase()}_NOT_FOUND`);
    export const badRequest = (code: string, message: string, details?: unknown) => …
    export const forbidden = (message = "Forbidden") => …
    export const conflict = (code: string, message: string) => …
    export const validationFailed = (errors: string[]) => HttpError(400, "Validation failed", "VALIDATION_FAILED", errors);
    ```
  - Update Fastify error handler in `api/src/app.ts` to emit the unified shape (`{ error, code?, details? }`).
  - Migrate route handlers to use the helpers — one route file per commit.
- **Acceptance:**
  - Every API response from a non-200 status code returns `{ error: string, code?: string, details?: unknown }` and nothing else.
  - CI grep gate: `grep -rn "reply.status(4" api/src/routes --include="*.ts" | grep -v "errors.ts"` returns zero hits (all 4xx replies go through helpers).
  - Web and mobile clients updated to read `code` over `error` for branching (separate PR; coordinate).
- **STOP gate:** **S3** — client-visible. Coordinate web/mobile rollout.
- **Verification:**
  - Type-check OK.
  - One integration test per helper asserting envelope shape.
  - Manual review: any 4xx in `api/src/routes` that does not call a helper fails review.

---

## PHASE 4 — Semantic cleanup (renames, schema)

These are riskier because they touch the schema and ripple to clients. Each requires an additive migration first.

### TASK 4.1 — Rename `JobExecutionEvent.driverId` → `actorUserId`

- **STATUS:** blocked
- **Audit refs:** B.6, C.2.
- **Scope:** additive rename + DriverProfile FK addition.
- **Sequence (MUST follow strict order — each step is its own commit):**
  1. **Migration A:** add `JobExecutionEvent.actorUserId Int?` and `JobExecutionEvent.driverProfileId Int?`. Both nullable.
  2. **Backfill script:** populate `actorUserId = driverId`. For `driverProfileId`, look up `DriverProfile` by `(companyId, userId=driverId)`. Run on staging first, then production.
  3. **Code change:** all writes set both `driverId`, `actorUserId`, `driverProfileId`. Reads use new fields where appropriate.
  4. **Soak:** wait at least 14 days in production.
  5. **Migration B:** make `actorUserId` NOT NULL, drop `driverId`. Each step is a separate PR. **DROP COLUMN triggers S2 STOP gate.**
- **Acceptance per step:** typecheck, tests, manual production verification of new column values, then the next step.
- **STOP gates:** **S2** on Migration B (drop column), **S8** on the backfill (potentially > 1000 rows).

### TASK 4.2 — Decide `Job.status` split

- **STATUS:** blocked (depends on E.* and TASK 3.6 outcome)
- **Audit refs:** C.1.
- **Scope:** decision + plan only. No code yet.
- **Acceptance:**
  - Produce a design doc as a new section in `ARCHITECTURE.md` titled "Job status regimes".
  - Decide one of:
    (a) Keep one column, document allowed transitions across both regimes.
    (b) Split into `executionStatus` and `planningStatus`.
  - Plan migration and rename sequence.
- **STOP gate:** **S1** — fundamental design decision. **STOP and present options.**

### TASK 4.3 — Soft-delete `LoadTrack` and `RunAssignment` consistently

- **STATUS:** blocked
- **Audit refs:** B.4, C.6.
- **Scope:** add `deletedAt` (timestamp, nullable) to `LoadTrack`. Standardise on `removedAt` for `RunAssignment` (already exists). Replace hard delete in `routes/runs.ts:356-357` with soft delete.
- **Sequence:**
  1. Migration A: add `LoadTrack.deletedAt`.
  2. Code: replace `loadTrack.deleteMany` with `loadTrack.updateMany({ data: { deletedAt: new Date() } })`. All read queries filter `deletedAt: null`.
  3. Code: same for `runAssignment.deleteMany` → use `removedAt`.
- **STOP gate:** **S3** — behaviour change (cancelled runs now retain history; planner search results change).

### TASK 4.4 — Soft-delete convention doc

- **STATUS:** blocked (depends on 4.3)
- **Audit refs:** C.6.
- **Scope:** documentation only.
- **Files (modify):** `DATA_DICTIONARY.md`.
- **Acceptance:** doc table listing every model and its delete convention (`status='deleted'` / `deletedAt` / `removedAt` / hard delete only via GDPR).

### TASK 4.5 — `Run.status` enum enforcement

- **STATUS:** blocked
- **Audit refs:** C.7.
- **Scope:** add Zod enum, add transition table.
- **Files:** `api/src/sync/runStatuses.ts` (new), `api/src/schemas/` updates, `routes/runs.ts:301`.
- **Acceptance:** PATCH /runs/:id with `status="banana"` returns 400.

---

## PHASE 5 — Dead code removal

Safe last-mile cleanup. None should change behaviour.

### TASK 5.1 — Delete `api/src/auth.ts`
- **Audit refs:** A.14, D.1.
- **STOP gate:** none.

### TASK 5.2 — Delete `mobile/src/apiWithQueue.ts`
- **Audit refs:** D.2. (Mobile; out of API scope but listed for completeness — defer if mobile is out of session scope.)

### TASK 5.3 — Drop `trailerTypesForbidden` column
- **Audit refs:** D.3.
- **STOP gate:** **S2** — drop column. **STOP** and confirm soak window.

### TASK 5.4 — Consolidate `validation.ts` into Zod schemas
- **Audit refs:** D.5.
- **Scope:** for each function in `api/src/validation.ts`, either delete (covered by Zod) or move business rule into `api/src/services/`. Delete the file.
- **STOP gate:** none if behaviour is preserved; STOP S3 if any rule cannot be expressed in Zod.

### TASK 5.5 — Audit `routes/customers.ts` coverage
- **Audit refs:** D.6.
- **Scope:** confirm endpoint list, add anything missing per spec. STOP if you find a missing endpoint and propose, do not implement silently.

---

## ANTI-DRIFT — read this before EVERY task

Before you write a single line of code, ask yourself:

1. **Am I touching a file my task does not authorise?** If yes, stop.
2. **Am I changing more than the audit item requires?** If yes, stop.
3. **Am I making a behavioural change I have not flagged with a STOP gate?** If yes, stop.
4. **Did I add an import I had to install?** If yes, S4 — stop.
5. **Have I run typecheck since my last edit?** If no, do not commit.
6. **Will the next agent who reads this file understand what I did?** If no, rewrite the commit message and the audit verification block.

If any answer is yes, revert and ask.

---

## CHECKPOINT — current state of execution

Update after every task. This is the single source of truth between sessions.

| Phase | Task | Status | Owner | Commit | Date |
|-------|------|--------|-------|--------|------|
| 0     | 0.1  | done   | sonnet | cleanup/p0-0.1-baseline | 2026-05-30 |
| 0     | 0.2  | done   | sonnet | cleanup/p0-0.2-branch-hygiene | 2026-05-30 |
| 0     | 0.3  | done — Path A: bodyTypeLabel added to shared/ + api/ | sonnet | e10ccdd (PR #2) | 2026-05-30 |
| 0     | 0.4  | done | sonnet | cleanup/p0-0.4-reconcile-audit | 2026-05-30 |
| 0     | 0.5  | done | sonnet | cleanup/p0-0.5-knip-baseline | 2026-05-30 |
| 0     | 0.6  | done | sonnet | cleanup/p0-0.6-auth-scope | 2026-06-01 |
| 0     | 0.7  | done — NO LEAK confirmed | sonnet | cleanup/p0-0.7-bearer-audit | 2026-06-01 |
| 1     | 1.1  | done | sonnet + user | cleanup/p1-1.1-design-decisions | 2026-05-31 |
| 2     | 2.1  | done | sonnet | cleanup/p2-2.1-event-definitions | 2026-05-31 |
| 2     | 2.2  | done | sonnet | cleanup/p2-2.2-gps-timestamp-helpers | 2026-05-31 |
| 2     | 2.3  | done | sonnet | cleanup/p2-2.3-apply-job-event | 2026-05-31 |
| 2     | 2.4  | done | sonnet | cleanup/p2-2.4-cancel-run | 2026-05-31 |
| 2     | 2.5  | done | sonnet | cleanup/p2-2.5-shared-helpers | 2026-05-31 |
| 3     | 3.1  | open | | | |
| 3     | 3.2  | open | | | |
| 3     | 3.3  | done | sonnet | cleanup/p3-3.3-companyid-where | 2026-06-01 |
| 3     | 3.4  | open — awaits S1 confirmation (B.12 agency PIN) | | | |
| 3     | 3.5  | done | sonnet | cleanup/p3-3.5-auto-cleanup-worker | 2026-06-01 |
| 3     | 3.6  | open | | | |
| 3     | 3.7  | done | sonnet | cleanup/p3-3.7-error-envelope | 2026-06-01 |
| 4     | 4.1  | blocked-by-3.6 | | | |
| 4     | 4.2  | open — E.2 answered (timeWindowStart); plannedDate drop logged in DISCOVERED | | | |
| 4     | 4.3  | open | | | |
| 4     | 4.4  | blocked-by-4.3 | | | |
| 4     | 4.5  | open | | | |
| 5     | 5.1  | blocked-by-2.5 | | | |
| 5     | 5.2  | blocked-by-2.5 | | | |
| 5     | 5.3  | blocked-by-soak| | | |
| 5     | 5.4  | blocked-by-2.5 | | | |
| 5     | 5.5  | blocked-by-2.5 | | | |

---

## DISCOVERED — log new findings here, do NOT fix inline

| Date | Finder | Description | Suggested audit section | Status |
|------|--------|-------------|-------------------------|--------|
| 2026-05-31 | sonnet (TASK 2.5) | `schedule.ts:26-27` uses local-time date literals (`T00:00:00` / `T23:59:59` without Z). Different semantics from UTC patterns — not replaced. Review: works on UTC servers but silently shifts day boundaries if TZ changes. | A.11 follow-on | open |
| 2026-05-31 | user (E.2 decision) | Drop `Job.plannedDate` column — field was removed from all planner UI in session 2026-05-28b; user confirmed it is no longer needed. Requires: (1) audit all `plannedDate` reads/writes in `api/src/`; (2) migration `DROP COLUMN plannedDate` from `Job`. S2 stop gate answered affirmatively by user in Phase 1 design decisions. | Phase 4 (schema drop) | open — needs its own task |

---

## BLOCKED — log when stuck

| Date | Task | Reason | Resolved by | Resolution |
|------|------|--------|-------------|------------|
|      |      |        |             |            |

---

## DECISIONS — log what the user said

| Date | Question | Answer | Affects tasks |
|------|----------|--------|---------------|
|      |          |        |               |

---

## REFERENCES

- `CODE_AUDIT.md` — the audit (your source of bugs).
- `RELEASE_READINESS.md` — overlapping release-blocker list. Coordinate so the same fix doesn't appear twice.
- `SAFETY.md` — non-negotiable rules.
- `DATA_DICTIONARY.md` — canonical field names.
- `ARCHITECTURE.md` — target design.
- `DEVLOG.md` — historical context.

---

## CLOSING

If you finish all phases without breaching the 14 commandments, the API brain is materially cleaner and safer to put in front of paying customers. If you breach the commandments, you make the next agent's job harder than yours. Stay disciplined.
