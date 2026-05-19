# LogisticBay — Claude Code instructions

## Read this first — mandatory at the start of every session

Use the right document for the right question. Each doc has one job:

| Question | Go to |
|---|---|
| What is LogisticBay, what are the phases, what are the roles? | **MASTER_BLUEPRINT.md** |
| How do the five core objects relate? What is a Run vs a Job vs a JobPart? | **SYSTEM_PLAN.md** |
| What fields exist on Job / JobPart / Run / LoadTrack / Event? What are the status values? | **PHASE1_DATA_MODEL.md** — but see ⚠ gaps table at the top before trusting field names |
| What is actually built right now — done, partial, not started? | **PROJECT_STATUS.md** ← always check here before proposing anything |
| What is the canonical name for a field or concept? | **DATA_DICTIONARY.md** |
| What open decisions need answers before building? | **QUESTIONS_OPERATIONS.md** / **QUESTIONS_*.md** |

**Never assume what exists. Always check PROJECT_STATUS.md and the actual routes/pages first.**

### Document authority hierarchy

When documents conflict, this order wins:
1. `schema.prisma` — the schema is the implementation truth
2. `DATA_DICTIONARY.md` — canonical field names
3. `PROJECT_STATUS.md` — what is actually built
4. `PHASE1_DATA_MODEL.md` — target design (may be ahead of schema)
5. `SYSTEM_PLAN.md` — architecture principles
6. `MASTER_BLUEPRINT.md` — product vision

## Doc-update rule — mandatory after every significant change

After any session that:
- adds a new feature or screen
- changes a data model or route
- completes or partially completes something from the 🔲 or 🔶 lists
- identifies a new gap or open question

**You MUST update PROJECT_STATUS.md** before the session ends. Move items between tiers (🔲 → 🔶 → ✅), add new rows to the partial table, note new gaps in the not-started list.

If a new open question surfaces that belongs in one of the QUESTIONS_*.md files, add it there too.

The rule in one sentence: **the docs must always reflect what the code actually does, not what it was planned to do.**

## Field naming rule — mandatory before adding any new field

Before naming any new field, state, variable, or JSON blob key, **check DATA_DICTIONARY.md first**.

Rules:
1. If the concept already exists in the dictionary, use that exact name — no aliases, no synonyms.
2. If you are unsure whether a concept already exists, grep the codebase and the dictionary before deciding.
3. Never invent a new name for a concept that already has a canonical name. Examples of forbidden aliases:
   - `companySiteName`, `siteCompanyName`, `customerSiteName` → use `siteName`
   - `addressLine1`, `address1`, `streetAddress` → use `street`
   - `townCity`, `city`, `cityTown` → use `town`
   - `entranceLatitude`, `gateLat` (on intake blobs), `pinLat` → use `lat`
   - `entranceLongitude`, `gateLng` (on intake blobs), `pinLng` → use `lng`
   - `entranceInstructions`, `gateInstructions`, `accessInstructions` → use `navigationInstructions`
   - `bookingReference`, `siteBookingRef`, `bookingNumber` → use `bookingRef`
   - `exactAppointmentTime`, `appointmentTime`, `fixedTime` → use `bookedTime`
   - `estimatedServiceTimeMinutes`, `serviceTimeMinutes`, `dwellTime` → use `unloadingAllowanceMinutes`
   - `customerReference`, `customerOrderRef`, `clientRef` → use `customerRef`
   - `trailerTypesAllowed` is already canonical — do not create `trailersAllowed`
   - `requirePOD` is already canonical — do not create `podRequired`
   - `weighbridgeRequired` is already canonical — do not create `weighbridgeReq`

4. When creating a JSON blob field that will eventually map to a DB column, use the DB column name from the start. The intake `stops[]` blob uses the same names as `JobStop` columns. The intake `requesterData` blob uses the same names as the denormalized `JobRequest` columns.
5. After adding any new field, add it to DATA_DICTIONARY.md in the same PR. The dictionary is the contract.

## Reference field semantics — mandatory understanding

There are four distinct reference fields. They are not interchangeable:

| Field | Scope | Example |
|---|---|---|
| `jobReference` | System-generated LogisticBay job number | `LGB-26-000001` |
| `customerRef` | Customer's own order/reference for the whole transport job | `ACME-ORDER-7781` |
| `referenceNumber` | Operational driver reference at a specific stop (collection release number or goods-in number) | `COL-44392` |
| `bookingRef` | Site appointment/slot reference | `SLOT-09:30-BAY4` |

Never merge these into a single field or use one in place of another.

## Nullable field rule — fix on contact, not all at once

Many models still have optional string fields declared as `String @default("")` instead of `String?`. This is a known issue — empty string is being used as a null substitute, which breaks `WHERE field IS NULL` queries and makes PATCH semantics ambiguous ("not sent" vs "explicitly cleared to empty").

**Rule: whenever you do feature work on a model, fix its optional string fields in the same PR.**

How to fix a model:
1. Change each optional field in `schema.prisma` from `String @default("")` to `String?`
2. Write a migration: `ALTER TABLE "X" ALTER COLUMN "y" DROP NOT NULL;` for each field, then `UPDATE "X" SET "y" = NULL WHERE "y" = '';`
3. Update the write paths in the route: CREATE uses `body.field?.trim() || null`, PATCH uses `body.field !== undefined ? (body.field.trim() || null) : existing.field`
4. Run `prisma generate` and `tsc --noEmit` — fix any type errors

Models already fixed: `Customer` (contactName, contactPhone, contactEmail, notes).

Do NOT do a single sweep across all models — migration risk is too high vs benefit. Fix model-by-model as you touch them.

## Codebase conventions

- API schemas live in `api/src/schemas/`. Always validate with Zod.
- Shared TypeScript types for API bodies live in `api/src/types/requests.ts`.
- Frontend API client types live in `web/src/api/*.ts`.
- The `DATA_DICTIONARY.md` at the repo root is the authoritative field reference.
- Backfill scripts go in `api/scripts/` and follow the pattern in `backfill_vocab_v1.ts`.
