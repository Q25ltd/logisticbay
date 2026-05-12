/**
 * backfill_stops_v2.ts
 *
 * Renames old intake blob field names to canonical DB-aligned names in every
 * JobRequest row. Safe to re-run — already-migrated rows are skipped.
 *
 * Renames applied:
 *   stops[n].companySiteName           → siteName
 *   stops[n].addressLine1              → street
 *   stops[n].townCity                  → town
 *   stops[n].entranceLatitude          → lat
 *   stops[n].entranceLongitude         → lng
 *   stops[n].entranceInstructions      → navigationInstructions
 *   stops[n].bookingReference          → bookingRef
 *   stops[n].exactAppointmentTime      → bookedTime
 *   stops[n].estimatedServiceTimeMinutes → unloadingAllowanceMinutes
 *   requesterData.customerReference    → customerRef
 *
 * Run:
 *   DATABASE_URL=... npx tsx scripts/backfill_stops_v2.ts
 */

import "dotenv/config";
import { PrismaClient, Prisma } from "../src/generated/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

// ── Stop blob rename map ──────────────────────────────────────────────────────

const STOP_RENAMES: Record<string, string> = {
  companySiteName:            "siteName",
  addressLine1:               "street",
  townCity:                   "town",
  entranceLatitude:           "lat",
  entranceLongitude:          "lng",
  entranceInstructions:       "navigationInstructions",
  bookingReference:           "bookingRef",
  exactAppointmentTime:       "bookedTime",
  estimatedServiceTimeMinutes:"unloadingAllowanceMinutes",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function migrateStop(stop: Record<string, unknown>): { updated: Record<string, unknown>; changed: boolean } {
  const updated: Record<string, unknown> = {};
  let changed = false;
  for (const [key, value] of Object.entries(stop)) {
    const newKey = STOP_RENAMES[key];
    if (newKey) {
      updated[newKey] = value;
      changed = true;
    } else {
      updated[key] = value;
    }
  }
  return { updated, changed };
}

function migrateStops(raw: unknown): { stops: unknown[]; changed: boolean } {
  if (!Array.isArray(raw)) return { stops: [], changed: false };
  let anyChanged = false;
  const stops = raw.map((s) => {
    if (!s || typeof s !== "object") return s;
    const { updated, changed } = migrateStop(s as Record<string, unknown>);
    if (changed) anyChanged = true;
    return updated;
  });
  return { stops, changed: anyChanged };
}

function migrateRequesterData(raw: unknown): { data: unknown; changed: boolean } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { data: raw, changed: false };
  const obj = raw as Record<string, unknown>;
  if (!("customerReference" in obj)) return { data: raw, changed: false };
  const { customerReference, ...rest } = obj;
  return { data: { ...rest, customerRef: customerReference }, changed: true };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma  = new PrismaClient({ adapter });

  const counts = { scanned: 0, updated: 0, stopsChanged: 0, requesterChanged: 0 };

  try {
    // Process in pages to avoid loading the entire table into memory at once
    const PAGE = 200;
    let cursor: number | undefined;

    while (true) {
      const rows = await prisma.jobRequest.findMany({
        select: { id: true, stops: true, requesterData: true },
        orderBy: { id: "asc" },
        take: PAGE,
        ...(cursor !== undefined ? { skip: 1, cursor: { id: cursor } } : {}),
      });

      if (rows.length === 0) break;
      cursor = rows[rows.length - 1].id;
      counts.scanned += rows.length;

      for (const row of rows) {
        const { stops: newStops, changed: stopsChanged }         = migrateStops(row.stops);
        const { data: newRequester, changed: requesterChanged }  = migrateRequesterData(row.requesterData);

        if (!stopsChanged && !requesterChanged) continue;

        await prisma.jobRequest.update({
          where: { id: row.id },
          data: {
            ...(stopsChanged     ? { stops:         newStops    as Prisma.InputJsonValue } : {}),
            ...(requesterChanged ? { requesterData: newRequester as Prisma.InputJsonValue } : {}),
          },
        });

        counts.updated++;
        if (stopsChanged)     counts.stopsChanged++;
        if (requesterChanged) counts.requesterChanged++;
      }
    }

    console.log("backfill_stops_v2 complete:", JSON.stringify(counts, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
