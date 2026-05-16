# LogisticBay — Claude Code instructions

## Read this first — mandatory at the start of every session

**MASTER_BLUEPRINT.md** is the full product vision — what LogisticBay is, all roles, all systems, MVP phases. Read this first.

**SYSTEM_PLAN.md** is the system architecture and build plan — the five core objects, phases, rules for adding features.

**PHASE1_DATA_MODEL.md** is the agreed data model contract for Job, JobPart, Run, RunAssignment, LoadTrack, and Event. No code touches these models without reading this first. Special attention: partial quantities, load possession, custody chain, handover logic.

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
