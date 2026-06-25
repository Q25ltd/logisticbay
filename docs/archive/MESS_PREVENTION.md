# LogisticBay — Mess Prevention

**Audience:** the user (you) and any human reviewer. Coding agents read `CLAUDE.md` and `CLEANUP_PLAN.md` for rules; this file describes the **scaffolding** that keeps the rules enforceable.

Rules alone do not prevent drift. Process and tooling do. Each item below is something you can stand up once and reap from forever.

---

## Why this file exists

Reading `CODE_AUDIT.md`, every duplication, every silent error swallow, every shape that doesn't match — they all happened in moments where:

- the agent (or human) didn't know what already existed
- the agent didn't know the rule
- the agent knew the rule but skipped it
- nobody noticed at review time
- nobody noticed at runtime

Rules cover the second case. The other four need structural scaffolding. That is what's below.

---

## Tier 1 — Do these this week (cheap, high leverage)

### 1. Pre-commit hooks
**Problem:** rules only work if someone enforces them. Humans forget; agents skim.
**Fix:** `husky` + `lint-staged`. On every `git commit`:
- `npm run typecheck` (changed packages only)
- `eslint --fix` (staged files)
- Grep gates from `CLEANUP_PLAN.md` (the `as any`, `jwt.verify`, `z.string()` without `.max()` ones)
- Block commit if any fail

Cost: ~30 minutes setup, two npm packages, one config file. Pays back instantly.

**Acceptance:** `git commit` on a branch with `as any` introduced fails locally before it reaches review.

### 2. PR template
**Problem:** PRs ship without explaining what changed or how it was verified. Reviewer (you) has to reverse-engineer.
**Fix:** `.github/pull_request_template.md` with mandatory sections:
```
## Audit ref
CODE_AUDIT.md <ID> | RELEASE_READINESS.md <ID> | new (justify)

## Scope (one sentence)

## Files changed

## Behaviour change
None | User-visible: <describe>

## Verification (paste output)
- [ ] typecheck OK
- [ ] check:vocab OK
- [ ] npm test --prefix api OK
- [ ] knip OK / new findings: <list>
- [ ] grep gates OK
- [ ] tenant-isolation test passes (if route touched)
- [ ] Migration is additive (if schema touched)

## STOP gates triggered
None | S<N>: <what you asked, what answer you got>
```
A PR missing any section auto-fails review.

### 3. CODEOWNERS file
**Problem:** sensitive files (schema, auth, middleware, safety doc) get changed without your eyes on them.
**Fix:** `.github/CODEOWNERS`:
```
/api/prisma/schema.prisma          @<your-handle>
/api/prisma/migrations/            @<your-handle>
/api/src/middleware.ts             @<your-handle>
/api/src/auth.ts                   @<your-handle>
/api/src/lib/tokens.ts             @<your-handle>
/SAFETY.md                         @<your-handle>
/CLAUDE.md                         @<your-handle>
/CLEANUP_PLAN.md                   @<your-handle>
/CODE_AUDIT.md                     @<your-handle>
```
GitHub then **requires** your review before any of these can be merged. Even if an agent races to merge, GitHub blocks.

### 4. CI must block merge
**Problem:** the GitHub Actions CI added in `08d6fd6` may be advisory. Confirm it is **required**.
**Fix:** GitHub → Settings → Branches → `main` branch protection → Require status checks → tick every CI job. Tick "Require branches to be up to date before merging". Tick "Require linear history" if you're not already.

Cost: 5 minutes. Catches every "I'll just merge this real quick" attempt.

### 5. Knip in CI (already partly planned as TASK 0.5)
Run `npx knip` in CI as advisory first, then blocking once Phase 5 closes the dead-code baseline. Same job as the existing checks.

---

## Tier 2 — Do these this month (higher cost, durable payoff)

### 6. ADRs (Architectural Decision Records)
**Problem:** `CODE_AUDIT.md` Section E has 7 design questions. Even after you answer them, six months from now nobody remembers why. Then someone "improves" the code and undoes the decision.
**Fix:** `docs/adr/000N-<short-name>.md`. Each ADR is ~1 page:
```
# 0001 — Cancellation cascade on driver-initiated cancel

Date: 2026-MM-DD
Status: accepted
Context: …
Decision: drivers may not transition to `cancelled`. Only planners can. The endpoint…
Consequences: …
Reverted-by: (filled in if ever undone)
```
Every Section E answer becomes an ADR. Every future "why?" question links to the ADR rather than relitigating.

**Acceptance:** at least 7 ADRs exist (one per E.1–E.7) by end of Phase 1.

### 7. Behaviour-change log
**Problem:** when a planner says "this used to work", you need to be able to reconstruct exactly what changed and when. Right now `DEVLOG.md` mixes infrastructure changes with user-visible ones.
**Fix:** `BEHAVIOUR_CHANGES.md` at the root. One line per behavioural change, newest first:
```
2026-06-10 — Drivers can no longer cancel jobs. Use the planner cancel flow. (PR #142, TASK 2.3)
2026-06-08 — Job-status updates require Idempotency-Key header. (PR #138, TASK 2.3)
```
Every PR with "Behaviour change: user-visible" in its body must add a line here, enforced by PR template + a CI check.

**Why useful:** when support says "customer X says their drivers can't do Y any more", you grep this file.

### 8. Status / event / role registries
**Problem:** magic strings everywhere; `Run.status = "banana"` accepted (CODE_AUDIT C.7); inconsistent vocab (`pickup` vs `collection` vs `arrived_pickup`, see C.3).
**Fix:** one TypeScript file per concept, exporting `as const` arrays + derived enums:
```
api/src/domain/jobStatus.ts
api/src/domain/runStatus.ts
api/src/domain/eventType.ts
api/src/domain/userRole.ts
api/src/domain/softDelete.ts        ← lists which models use which convention
```
Every status string in the codebase imports from there. CI grep gate: any string literal that matches a status pattern but is not imported from the registry fails.

### 9. Daily Drift Report
**Problem:** even with rules, drift creeps. You don't notice until you audit.
**Fix:** small script `scripts/drift-report.sh` that runs nightly via GitHub Actions cron, posts to a Slack channel (or email, or a markdown file in the repo):
```
Drift Report 2026-06-10
- `as any` count: 7 (was 5 yesterday — +2 ⚠️)
- inline `jwt.verify`: 0 (was 0 — flat ✅)
- inline `parseInt((request.params`: 12 (was 14 — −2 ✅)
- z.string() without .max(): 3 (was 3 — flat ⚠️)
- TODO/FIXME count: 1 (was 1 — flat)
- knip unused exports: 23 (was 23 — flat)
- Routes without authenticate: 0 (was 0 — flat ✅)
```
Trend lines tell you whether the team is regressing. If `as any` ticks up two days in a row, you have a conversation.

### 10. Invariants script
**Problem:** data drift is invisible until a customer notices. `Job.status="cancelled"` with active assignments. `JobExecutionEvent` rows whose `Job` was deleted. Negative quantities. These are silent corruption.
**Fix:** `scripts/check-invariants.ts` runs nightly against production. Each check is a SQL query whose count must be 0:
```sql
-- I1: no cancelled job has active assignments
SELECT count(*) FROM "Job" j
JOIN "RunAssignment" ra ON ra."jobId" = j.id
WHERE j.status = 'cancelled' AND ra."removedAt" IS NULL;

-- I2: every JobExecutionEvent has companyId matching its Job
SELECT count(*) FROM "JobExecutionEvent" e
JOIN "Job" j ON j.id = e."jobId"
WHERE e."companyId" != j."companyId";

-- I3: no negative quantities
SELECT count(*) FROM "Job" WHERE quantity < 0;

-- I4: every active membership has a non-deleted user
SELECT count(*) FROM "CompanyMembership" m
LEFT JOIN "User" u ON u.id = m."userId"
WHERE m.status = 'active' AND (u.id IS NULL OR u.status = 'deleted');
```
If any count > 0, post to the drift report with a red flag. **This is the canary in the mine.** When something silently goes wrong, you'll see it in 24 hours, not 6 months when a customer complains.

### 11. Limited-scope agent sessions
**Problem:** open-ended sessions invite drift. "Clean up the api" is too broad; agent improvises.
**Fix:** every cleanup session opens with an explicit file-list:
> "This session may modify exactly these files: `api/src/sync/sync.constants.ts`, `api/src/sync/applyJobEvent.ts` (new). Read-only: everything else. Tests in `api/src/tests/sync/` may be added."

Put this at the top of your session prompt. Agent self-checks against the list before every edit. The plan already encodes this per-task; just enforce it verbally too.

---

## Tier 3 — Do these when the team grows (process maturity)

### 12. Staging environment with synthetic data
Already on `RELEASE_READINESS.md` (archived) as P0.1. Without staging, every "I'll just test in production" temptation succeeds.

### 13. Backup restore drill quarterly
Already on the archived list. Untested backups don't count.

### 14. Sentry / error monitoring
Already on the list. Until it lands, you only find out about bugs when customers report them. Add `@sentry/node` to api, `@sentry/react` to web, `@sentry/react-native` to mobile. Scrub PII in `beforeSend`. The audit (CODE_AUDIT) cannot find runtime bugs — only Sentry can.

### 15. SLOs and runtime alerts
- p95 latency on `GET /jobs` and `POST /sync/events`
- failed sync events / minute
- 5xx rate
- `needsReview` event count

When these breach, you get paged. Without runtime signals, you're blind.

### 16. Schema migration review template
Every migration PR has a checklist:
- [ ] Additive only? (no DROP COLUMN / DROP TABLE)
- [ ] Backfill plan (if a new NOT NULL)?
- [ ] Rollback plan (paste SQL)?
- [ ] Estimated row count?
- [ ] Locks table > 1 second?
- [ ] Applied to staging first?

CI verifies the checklist boxes are ticked before allowing the merge.

### 17. Read-only Sunday
No deploys on Sundays unless it's an incident. Reduces "deploy Friday, panic Saturday" pattern.

---

## What NOT to do (anti-patterns I see teams reach for)

- **Adding more rules to CLAUDE.md without enforcing them.** Each unenforced rule is dead weight that erodes the credibility of the enforced ones.
- **Building a "agent observability dashboard".** You don't have the volume to justify it. Drift report + invariants + Sentry covers 95%.
- **Trying to write tests for every function.** Test what would actually fail in production. Tenant isolation, idempotency, state transitions, money/quantity math — yes. UI tests — limit to the most critical flows.
- **Adding more linters.** ESLint + a few grep gates is enough. Each linter you add becomes another thing the agent fights with.
- **Rewriting from scratch.** You are 2 phases of cleanup away from solid. A rewrite is 18 months of new bugs.

---

## Order of work I'd actually do

If I were standing this up tomorrow:

1. **Today (1 hour):** pre-commit hooks (#1), CODEOWNERS (#3), CI required checks (#4), PR template (#2).
2. **This week (4 hours):** ADRs scaffold (#6) — just the folder and a template; fill as decisions land. Behaviour-change log (#7).
3. **Next week (1 day):** status/event registries (#8) — touch every magic-string file once, with the rule in place.
4. **Within 2 weeks (1 day):** invariants script (#10) and drift report (#9). These are the runtime safety net.
5. **Before first paying customer:** everything in Tier 3.

Cumulative cost: maybe 2.5 working days. Payback: years.

---

## How this file interacts with the rest

- `CLAUDE.md` — rules for every session.
- `CLEANUP_PLAN.md` — rules for the cleanup-mode sessions specifically. Builds on `CLAUDE.md`.
- `CODE_AUDIT.md` — findings to fix.
- `MESS_PREVENTION.md` (this file) — scaffolding so the findings don't grow back.
- `SAFETY.md` — invariants the rules and scaffolding protect.

If you treat all five as living documents (open each PR with the question "does this affect any of these?"), drift becomes hard.
