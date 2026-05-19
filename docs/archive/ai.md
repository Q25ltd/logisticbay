# LogisticBay — AI Agent Operating Rules

Purpose:
This file defines how AI agents must behave when working on LogisticBay.

It does NOT replace:
- DEVLOG.md
- SAFETY.md
- FPSR.md

Those files define project architecture and safety.
This file defines agent discipline.

────────────────────────────────────────

1. RULE HIERARCHY

If rules appear to conflict, follow this priority order:

1. Production safety
2. Tenant isolation
3. Data integrity
4. Offline/event durability
5. Security/authentication
6. Existing approved architecture
7. Project truth files
8. Task-specific instructions
9. Cleanup/refactor quality
10. Code style/preferences

Never improve style by weakening safety.

Examples:
- Do not delete safety code to clean files.
- Do not bypass validation to make a feature work.
- Do not break old mobile clients without explicit approval.
- Do not change architecture because another pattern looks cleaner.

────────────────────────────────────────

2. REQUIRED READING

Before touching code, read the relevant truth files.

Always read:
- DEVLOG.md
- SAFETY.md
- PROJECT_STATUS.md
- FPSR.md

If the agent has not read the relevant rules, it must not edit code.

────────────────────────────────────────

3. NO SILENT RULE CONFLICTS

If a rule conflict appears, stop.

The agent must:
1. identify the conflict
2. quote or summarise both rules
3. explain the risk
4. offer options, including “do nothing”
5. wait for Brain to choose

The agent must not silently choose between conflicting rules.

────────────────────────────────────────

4. WORKFLOW RULE

Default workflow:

1. inspect existing code
2. identify exact files involved
3. explain intended change
4. identify risk level
5. make the smallest safe change
6. run relevant checks
7. report result

Do not jump straight to implementation on risky work.

────────────────────────────────────────

5. STOP-BEFORE-RISK RULE

The agent must stop before implementation if the task touches:

- deployment files
- production startup scripts
- database schema
- migrations
- auth/JWT/session logic
- tenant isolation
- offline sync
- idempotency
- audit logging
- secrets/env vars
- package manager or lock files
- CI/CD config
- mobile app config
- data deletion
- rollback/compatibility code

When stopping, explain:

1. problem
2. why it matters
3. options, including “do nothing”

No implementation until Brain chooses.

────────────────────────────────────────

6. SMALL CHANGE RULE

No large rewrites unless explicitly requested.

Prefer:
- one file
- one purpose
- one behaviour change
- one commit-sized change

Do not mix:
- feature work
- cleanup
- refactor
- database change
- deployment change
- dependency upgrades

One task = one reason to change.

────────────────────────────────────────

7. EXISTING ARCHITECTURE WINS

Existing approved architecture has priority over AI preference.

The agent must not:
- introduce a new architecture style casually
- replace patterns because another looks cleaner
- partially migrate architecture
- invent generic frameworks inside the app
- mix competing patterns in one subsystem

If architecture needs to change, stop and propose options.

────────────────────────────────────────

8. NO PREMATURE ABSTRACTION

Do not create abstractions before at least two real use cases exist.

Avoid:
- generic managers
- generic engines
- generic builders
- base classes
- universal wrappers
- “future-proof” systems

A little duplication is better than the wrong abstraction.

Abstract on proven repetition, not prediction.

────────────────────────────────────────

9. DEAD CODE CLEANUP

Agents should remove dead code, but safely.

Allowed without approval:
- unused imports
- unused local variables
- unreachable local branches
- old commented-out code
- duplicate comments
- unused helper inside the same edited file

Approval required before deleting:
- whole files
- API routes
- database fields
- migrations
- deployment/config files
- auth/security code
- offline/sync code
- audit/logging code
- compatibility shims
- deprecated files still referenced anywhere

Before deleting non-trivial code, prove:
1. not imported anywhere
2. not used by routing/navigation/config/tests/scripts
3. not used by dynamic imports
4. not kept for rollback/migration/compatibility
5. not needed by older mobile/web clients

Principle:
Do not preserve rubbish.
Do not delete safety rails.

────────────────────────────────────────

10. PROTECTED FILE RULE

Some files look unused but are used by build/deploy/runtime tools.

Never delete, rename, or heavily rewrite protected files without approval.

Protected examples:
- package.json
- lock files
- Dockerfile
- railway.json
- vercel.json
- eas.json
- app.json / app.config.*
- vite.config.*
- tsconfig.*
- prisma/schema.prisma
- prisma/migrations/*
- start scripts
- CI workflow files
- environment example files
- DEVLOG.md
- SAFETY.md
- PROJECT_STATUS.md
- FPSR.md

Project truth files may be appended.
Historical logs must not be rewritten unless explicitly instructed.

────────────────────────────────────────

11. NO DEPLOYMENT GUESSING

The agent must not guess deployment behaviour.

Before changing deployment/build config, stop and answer:

- Which environment is affected?
- How does production start today?
- Does rollback still work?
- Are env vars unchanged?
- Does the platform still detect build/start commands?
- Does this affect migrations?
- Does this affect old clients?

If unknown, stop.

────────────────────────────────────────

12. NO DATABASE GUESSING

The agent must not guess database safety.

Before schema/migration/data changes, stop and answer:

- Is this destructive?
- Is this backwards compatible?
- Does existing code still work during deploy?
- Is there a rollback path?
- Is data preserved?
- Does tenant isolation still hold?
- Are indexes needed?
- Is production migration safe?

If unknown, stop.

────────────────────────────────────────

13. NO AUTH / TENANT GUESSING

The agent must not guess around:

- companyId
- JWT
- refresh tokens
- roles
- permissions
- ownership checks
- related-record validation

If unsure, stop.

Tenant isolation and auth are not areas for improvisation.

────────────────────────────────────────

14. NO OFFLINE SYNC GUESSING

The agent must not casually change:

- queue structure
- clientEventId behaviour
- retry behaviour
- failed event retention
- sync response parsing
- optimistic UI behaviour
- offline login/cache assumptions

If offline behaviour is affected, stop and ask Brain.

Drivers must not lose work because an agent “cleaned up” sync code.

────────────────────────────────────────

15. BEHAVIOUR PRESERVATION RULE

During refactor, behaviour must remain unchanged unless explicitly requested.

The agent must not:
- change API response shape
- rename fields casually
- change UI flow
- change validation behaviour
- change defaults
- change error handling
- change persistence behaviour

If behaviour changes are necessary, split them into a separate proposed change.

────────────────────────────────────────

16. VERIFICATION RULE

After code changes, run relevant checks when available.

API:
- typecheck
- tests if available
- prisma validate if schema changed

Web:
- build
- typecheck if available

Mobile:
- typecheck
- Expo config check if app config changed

If checks cannot be run, say exactly what was not run.

Never claim tested unless a command was actually run.

────────────────────────────────────────

17. CHANGE REPORT RULE

Every code change must end with:

- files changed
- what changed
- why changed
- safety impact
- checks run
- risks left
- next recommended step

No vague summaries.

────────────────────────────────────────

18. SPECIALIST HANDOFF RULE

When giving work to another AI/code agent, include:

- exact goal
- files/folders to inspect
- project truth files to read
- forbidden changes
- stop conditions
- expected output
- checks to run

Specialist agents must not freestyle beyond the task.

────────────────────────────────────────

19. CLEANUP SEPARATION RULE

Cleanup is allowed, but it must be controlled.

Do not combine cleanup with risky feature work.

Safe cleanup may be included only when:
- it is in the same file
- it is directly related to the change
- it does not alter behaviour
- it does not touch protected areas

Large cleanup must be its own task.

────────────────────────────────────────

20. FINAL RULE

When unsure, stop.

Guessing is forbidden around:
- production deployment
- database
- migrations
- auth
- tenant isolation
- offline sync
- secrets
- deletion
- compatibility
- safety rules

Default behaviour:
Stop.
Explain.
Offer options.
Wait for Brain.

────────────────────────────────────────

21. READ BEFORE YOU TOUCH

Before writing a single line of code, read:

- DEVLOG.md
- SAFETY.md
- PROJECT_STATUS.md
- FPSR.md
- ai.md (this file)

If these files have not been read in this session, do not edit code.
No exceptions. Not even for small tasks.

────────────────────────────────────────

22. THE PUZZLE RULE

Every task is one small piece of a larger puzzle.

The project is a coherent whole. A feature that works but uses
the wrong pattern, naming, or structure breaks the picture even
if it functions correctly.

Before implementing anything:
- Understand what already exists and how it is shaped
- Identify the naming conventions and file structure in use
- Find how similar features are done elsewhere in the codebase
- Make the new piece look like it always belonged there

Never bolt something on.
Never introduce a new pattern when an existing one fits.
Never mix patterns inside the same subsystem.

────────────────────────────────────────

23. NO MIXED PARTS

Each area of the codebase has an established shape.
Do not mix styles, patterns, or conventions within one area.

Examples of mixed parts (forbidden):
- Using raw SQL in a route that uses Prisma everywhere else
- Inventing a new validation style alongside existing Zod schemas
- Adding a new UI pattern to a page that uses established components
- Combining cleanup with feature work in the same change

If a pattern does not exist yet, propose it and wait for approval
before introducing it.

────────────────────────────────────────

24. LOOKS LIKE IT ALWAYS BELONGED

The measure of a good change is not "does it work."
The measure is: does it look like it was always there?

After making a change, ask:
- Does this follow the same naming as everything around it?
- Does it sit in the right file and folder?
- Does it use the same patterns as adjacent code?
- Would a new developer assume this was part of the original build?

If the answer to any of these is no, reshape the change before
committing it.