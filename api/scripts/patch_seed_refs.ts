import "dotenv/config";
import { PrismaClient } from "../src/generated/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_PROD });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const REFS: Record<string, string> = {
  "QLTD-26-010": "ACME-2026-110",
  "QLTD-26-011": "BCO-ORD-4421",
  "QLTD-26-012": "FC-REF-8801",
  "QLTD-26-013": "ACME-2026-111",
  "QLTD-26-014": "BCO-ORD-4422",
  "QLTD-26-015": "FC-REF-8802",
  "QLTD-26-016": "ACME-2026-112",
  "QLTD-26-017": "BCO-ORD-4423",
};

async function main() {
  for (const [ref, customerRef] of Object.entries(REFS)) {
    const updated = await prisma.job.updateMany({
      where: { jobReference: ref, companyId: 1 },
      data:  { customerRef },
    });
    console.log(`${ref} → customerRef: ${customerRef} (${updated.count} updated)`);
  }
}

main().catch(console.error).finally(() => { prisma.$disconnect(); pool.end(); });
