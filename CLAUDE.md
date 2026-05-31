# LogisticBay — Agent Instructions

> Read this file first, every session, no exceptions.
> Last updated: 2026-05-27

---

## The 8 documents — what each one is for

| Question you have | Go to |
|---|---|
| What is LogisticBay, what are the phases, what roles exist? | **PRODUCT.md** |
| How do Job / JobPart / Run / LoadTrack / Event relate? What are the rules? | **ARCHITECTURE.md** |
| What is the canonical name for a field? Is this name already used? | **DATA_DICTIONARY.md** |
| What is actually built right now — done, partial, not started? | **STATUS.md** ← always check before proposing anything |
| What open decisions need answering before building a feature? | **QUESTIONS.md** |
| What are the safety, security, and agent behaviour rules? | **SAFETY.md** |
| What was decided in a previous session and why? | **DEVLOG.md** |
| How should frontend pages and components be structured? | **ARCHITECTURE.md** → Frontend Rules section |

**Never assume what exists. Always check STATUS.md and the actual routes/pages first.**

---

## Authority hierarchy — when documents conflict, this order wins

1. `api/prisma/schema.prisma` — the schema is implementation truth
2. `DATA_DICTIONARY.md` — canonical field names
3. `STATUS.md` — what is actually built
4. `ARCHITECTURE.md` — target design (may be ahead of schema)
5. `PRODUCT.md` — product vision

---

## Session start — mandatory checklist

Every session, before writing any code, run these three steps and report results to the user:

1. **Read STATUS.md** — state what is ✅ done, 🔶 partial, 🔲 not started in the area the user wants to work on.
2. **Read DEVLOG.md top entry** — state what was last worked on and any open items from that session.
3. **State what you will do** and what docs will need updating when you're done.

If the user asks "before we start, check the status" — this is what they mean.
If the user asks a question and you are about to write code, stop and do this first.

---

## Session end — mandatory checklist

Before the session is considered done:

1. **Update STATUS.md** — move any completed items from 🔲/🔶 to ✅, update partial tables.
2. **Add a DEVLOG.md entry** — what was built, what was decided, what is deferred.
3. **If a new open question emerged** — add it to QUESTIONS.md.
4. **If a new field/concept was added** — add it to DATA_DICTIONARY.md.

Do not wait to be asked. Do this automatically before saying "done".

---

## Mandatory rules

### Field naming
Before naming any new field, state, variable, or JSON key — check **DATA_DICTIONARY.md** first.
If the concept exists, use that exact name. No aliases, no synonyms.
After adding a new field, add it to DATA_DICTIONARY.md in the same commit.

### Nullable fields
Optional string fields must be `String?` in schema, not `String @default("")`.
Fix model-by-model when you touch them — not all at once.
Write path: `body.field?.trim() || null`. Patch path: `body.field !== undefined ? (body.field?.trim() || null) : existing.field`.
Models already fixed: `Customer` (contactName, contactPhone, contactEmail, notes).

### Doc updates — mandatory after every significant session
After any session that adds a feature, changes a model/route, or completes something from the 🔲/🔶 lists:
- Update **STATUS.md** (move items between ✅/🔶/🔲, update partial table)
- Add a session entry to **DEVLOG.md**
- If new open questions emerged, add them to **QUESTIONS.md**

The docs must always reflect what the code actually does.

### Before claiming anything is missing — check first

Never state that a field, feature, or behaviour is missing without first reading the actual code.

1. Read the relevant schema model in `api/prisma/schema.prisma`
2. Read the relevant API route or schema file in `api/src/`
3. Read the relevant UI form or page in `web/src/`

Only after reading all three can you say something is missing or already exists.
"I think it might be missing" is not acceptable. Check, then state a fact.

---

### Before adding any new feature
Answer these five questions first:
1. Which of the five core objects does this belong to? (Job / JobPart / Run / LoadTrack / Event)
2. Where does it fit in the lifecycle?
3. Does a concept with this name already exist? (Check DATA_DICTIONARY.md)
4. What does it depend on? What breaks if this is wrong?
5. Is this in STATUS.md 🔲 — or is it actually already partially built (🔶)?

---

## Preventative rules — apply every session, every change

These rules exist because each one prevented a real bug found in `CODE_AUDIT.md`. They apply to all work, not just cleanup. If a cleanup-mode rule in `CLEANUP_PLAN.md` is stricter, the stricter one wins.

### Register what you create
Every new API route file must be imported and registered in `api/src/app.ts` in the same commit it is created. Every new web page must be added to the router in `web/src/App.tsx`. After creating a file, run `grep -rn "<filename>" api/src web/src` and confirm at least one import exists before committing. Files written and never imported (e.g. former `api/src/auth.ts`, `mobile/src/apiWithQueue.ts`) are forbidden — delete them on sight.

### Search before writing
Before adding a function whose name contains a generic verb (`validate*`, `format*`, `build*`, `parse*`, `check*`, `compute*`, `find*`, `get*`), run `grep -rn "functionName" api/src` first. If it exists, import it. If a near-duplicate exists, extend or extract — do not create a parallel implementation. Duplicated state machines, validation, and helpers are how this codebase got messy in the first place.

### No `any`, no unvalidated casts
`any` is forbidden. `as Type` is only allowed immediately after a Zod parse, a `typeof` narrow, an `instanceof` check, or a Prisma raw query that types misrepresent (cite which in a one-line comment). Use `unknown` and narrow it. Every async function handles its rejection cases — no silent `.catch(() => {})`. Empty catches are only acceptable inside the Fastify error handler.

### Every Zod string has `.max()`
No `z.string()` without a `.max(N)` chained somewhere in the same schema. User-visible string fields also have `.trim()`. Defaults: free text caps at 4000, references and codes at 64, names at 200, emails at 320, postcodes at 16. Open `api/src/schemas/` and follow the convention already there.

### One error envelope
All API error responses use the shape `{ error: string, code?: string, details?: unknown }`. Use the helpers in `api/src/lib/errors.ts` once they exist (`notFound`, `badRequest`, `forbidden`, `conflict`, `validationFailed`). Do not inline `reply.status(4xx).send({ error: "..." })` in routes.

### Auth check lives in middleware only
No `jwt.verify` outside `api/src/middleware.ts` and `api/src/lib/tokens.ts`. Every route that touches user-owned data declares `{ preHandler: authenticate }` or `[authenticate, requireRole(...)]`. Inline JWT verification is forbidden.

### Tenant scoping is the law
Every Prisma read filters by `companyId` from the JWT. Every write includes `companyId` in the `where` clause as defence-in-depth (use `updateMany`/`deleteMany` keyed on `{ id, companyId }` when `update`/`delete` does not allow it). Frontend `companyId` in a request body is ignored or rejected — never trusted.

### Never comment out code
Delete it. Git history is the archive. A `//` followed by what looks like a former code line, or a `/* … */` wrapping a function body, fails review automatically.

### One status string registry
Every status value (`"draft"`, `"in_progress"`, `"cancelled"`, etc.) comes from a const exported from one file per concept. Magic strings in route handlers are forbidden. Job statuses live in `api/src/sync/sync.constants.ts`; run statuses in `api/src/sync/runStatuses.ts` (once TASK 4.5 lands).

### One soft-delete convention
A model is soft-deleted via `deletedAt: DateTime?` (preferred) OR `status: 'deleted'` — never both, never invent a third. `RunAssignment.removedAt` is grandfathered; do not copy that name on new models. New models use `deletedAt`. Every list/get query must filter `deletedAt: null` (or equivalent) — this is non-negotiable.

### Verification protocol — run before every commit
```bash
npm run typecheck       # must exit 0
npm run check:vocab     # must exit 0
npm test --prefix api   # must exit 0
npx knip                # no NEW unused exports vs baseline
```
Plus the grep gates from `CLEANUP_PLAN.md` Verification Protocol when you touched the relevant code. A task without these run is not done.

### When in doubt, stop and ask
If you cannot answer "what is the user-visible change of what I just did?" in one sentence, stop. If you are about to drop a column, rename a status string, change a default, or invalidate sessions — stop. Ask the user before proceeding. Silent behavioural changes are how customer trust dies.

---

## Known gaps — planned but not yet implemented

| Document says | Reality today |
|---|---|
| `branchId` on Job and Run | No Branch model in schema. All at Company level. Do NOT add `branchId` to queries. |
| `job_creator` role | Not enforced in routes. Only `company_owner` and `planner` used in `requireRole`. |
| `manager` role | Role string exists, no route guards use it. |
| Job statuses `planned`, `partially_collected`, `partially_delivered`, `attention_needed` | Not yet implemented. Current set: `draft`, `pending_review`, `ready_to_plan`, `in_progress`, `completed`, `cancelled`. |
| Run statuses `at_collection`, `loading`, `in_transit`, `at_delivery`, `failed` | Not yet implemented. Current set: `draft`, `assigned`, `in_progress`, `completed`, `cancelled`. |
