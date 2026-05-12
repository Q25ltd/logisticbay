# LogisticBay — Claude Code instructions

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

## Codebase conventions

- API schemas live in `api/src/schemas/`. Always validate with Zod.
- Shared TypeScript types for API bodies live in `api/src/types/requests.ts`.
- Frontend API client types live in `web/src/api/*.ts`.
- The `DATA_DICTIONARY.md` at the repo root is the authoritative field reference.
- Backfill scripts go in `api/scripts/` and follow the pattern in `backfill_vocab_v1.ts`.
