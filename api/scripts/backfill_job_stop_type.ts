/**
 * backfill_job_stop_type.ts
 *
 * Fixes JobStop rows where type = "pickup" or "dropoff" (old mobile enum values)
 * to the canonical values "collection" and "delivery".
 *
 * Safe to re-run — already-correct rows are skipped.
 *
 * Run:
 *   DATABASE_URL=... npx tsx scripts/backfill_job_stop_type.ts
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma  = new PrismaClient({ adapter });

  let updated = 0;

  try {
    const pickupResult = await (prisma as unknown as { $executeRaw: (q: unknown, ...args: unknown[]) => Promise<number> })
      .$executeRaw`UPDATE "JobStop" SET "type" = 'collection' WHERE "type" = 'pickup'`;
    updated += pickupResult;

    const dropoffResult = await (prisma as unknown as { $executeRaw: (q: unknown, ...args: unknown[]) => Promise<number> })
      .$executeRaw`UPDATE "JobStop" SET "type" = 'delivery' WHERE "type" = 'dropoff'`;
    updated += dropoffResult;

    console.log(`backfill_job_stop_type complete: ${updated} rows updated`);
    console.log(`  pickup → collection: ${pickupResult}`);
    console.log(`  dropoff → delivery:  ${dropoffResult}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
