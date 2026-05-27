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

## Known gaps — planned but not yet implemented

| Document says | Reality today |
|---|---|
| `branchId` on Job and Run | No Branch model in schema. All at Company level. Do NOT add `branchId` to queries. |
| `job_creator` role | Not enforced in routes. Only `company_owner` and `planner` used in `requireRole`. |
| `manager` role | Role string exists, no route guards use it. |
| Job statuses `planned`, `partially_collected`, `partially_delivered`, `attention_needed` | Not yet implemented. Current set: `draft`, `pending_review`, `ready_to_plan`, `in_progress`, `completed`, `cancelled`. |
| Run statuses `at_collection`, `loading`, `in_transit`, `at_delivery`, `failed` | Not yet implemented. Current set: `draft`, `assigned`, `in_progress`, `completed`, `cancelled`. |
