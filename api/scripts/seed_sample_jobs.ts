/**
 * Seed script: creates realistic sample jobs for Q25LTD (companyId=1)
 * for today and the next 2 days so the planner UI has data to work with.
 *
 * Safe to re-run — skips jobs if a seed marker already exists.
 * Run: npx tsx scripts/seed_sample_jobs.ts
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_PROD });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const COMPANY_ID      = 1;
const CREATED_BY_USER = 1;  // Nerijus (owner)
const DRIVER_ID       = 1;  // Nerijus (driver profile)

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setUTCHours(6, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

/** Combine a date with a HH:MM string into a full DateTime */
function dateTime(base: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(base);
  d.setUTCHours(h, m, 0, 0);
  return d;
}

async function main() {
  // ── Guard: check if seed already ran ──────────────────────────────────────
  const existingCount = await prisma.job.count({
    where: { companyId: COMPANY_ID, internalNotes: { contains: "[SEED]" } },
  });
  if (existingCount >= 8) {
    console.log(`Seed data already exists (${existingCount} jobs) — skipping.`);
    return;
  }
  // Delete any partial seed jobs so we start fresh
  if (existingCount > 0) {
    const partial = await prisma.job.findMany({
      where: { companyId: COMPANY_ID, internalNotes: { contains: "[SEED]" } },
      select: { id: true, jobReference: true },
    });
    console.log(`Deleting ${partial.length} partial seed jobs…`);
    for (const j of partial) {
      await prisma.jobPart.deleteMany({ where: { jobId: j.id } });
      await prisma.job.delete({ where: { id: j.id } });
    }
  }

  // ── 1. Create sample customers ─────────────────────────────────────────────
  console.log("Creating customers…");
  const [acme, buildco, freshco] = await Promise.all([
    prisma.customer.upsert({
      where:  { companyId_name: { companyId: COMPANY_ID, name: "Acme Aggregates Ltd" } },
      update: {},
      create: { companyId: COMPANY_ID, name: "Acme Aggregates Ltd", contactName: "Dave Barker", contactPhone: "07700 900123", contactEmail: "dave@acme-aggregates.co.uk", status: "active" },
    }),
    prisma.customer.upsert({
      where:  { companyId_name: { companyId: COMPANY_ID, name: "BuildCo Contractors" } },
      update: {},
      create: { companyId: COMPANY_ID, name: "BuildCo Contractors", contactName: "Sarah Mills", contactPhone: "07700 900456", contactEmail: "sarah@buildco.co.uk", status: "active" },
    }),
    prisma.customer.upsert({
      where:  { companyId_name: { companyId: COMPANY_ID, name: "FreshCo Distribution" } },
      update: {},
      create: { companyId: COMPANY_ID, name: "FreshCo Distribution", contactName: "Tom Owens", contactPhone: "07700 900789", contactEmail: "tom@freshco.co.uk", status: "active" },
    }),
  ]);
  console.log(`  ✓ Created customers: ${acme.name}, ${buildco.name}, ${freshco.name}`);

  // ── 2. Create jobs ─────────────────────────────────────────────────────────
  console.log("Creating jobs…");

  const jobDefs = [
    // ── Today's jobs ─────────────────────────────────────────────────────────
    {
      ref:         "QLTD-26-010",
      customer:    acme,
      date:        daysFromNow(0),
      material:    "Gravel 20mm",
      qty:         "24", unit: "tonnes",
      priority:    "high",
      notes:       "Customer requested early morning delivery. Weigh bridge on site.",
      stops: [
        { seq: 1, type: "collection", site: "Acme Quarry — Buxton",    loc: "Quarry Lane, Buxton SK17 8AA",    window: "06:30", contact: "Dave Barker", phone: "07700 900123", ref: "COL-7741" },
        { seq: 2, type: "delivery",   site: "BuildCo Site A — Derby",   loc: "Pride Park, Derby DE24 8HZ",      window: "09:00", contact: "Sarah Mills",  phone: "07700 900456", ref: "DEL-2201" },
      ],
    },
    {
      ref:         "QLTD-26-011",
      customer:    buildco,
      date:        daysFromNow(0),
      material:    "Sharp Sand",
      qty:         "18", unit: "tonnes",
      priority:    "normal",
      notes:       "Gate code: 1234. Back entrance only.",
      stops: [
        { seq: 1, type: "collection", site: "Central Depot — Leicester",     loc: "Depot Road, Leicester LE1 3BP",  window: "07:00", contact: "Mark Hill", phone: "07700 901100", ref: "COL-7742" },
        { seq: 2, type: "delivery",   site: "BuildCo Site B — Nottingham",   loc: "Castle Marina, Nottingham NG7 1TN", window: "10:30", contact: "Sarah Mills", phone: "07700 900456", ref: "DEL-2202" },
      ],
    },
    {
      ref:         "QLTD-26-012",
      customer:    freshco,
      date:        daysFromNow(0),
      material:    "Chilled Goods — Ambient",
      qty:         "4", unit: "pallets",
      priority:    "normal",
      notes:       "Temperature controlled. Must not break cold chain.",
      stops: [
        { seq: 1, type: "collection", site: "FreshCo Warehouse — Coventry",  loc: "Foleshill Road, Coventry CV6 5GS", window: "08:00", contact: "Tom Owens", phone: "07700 900789", ref: "COL-7743" },
        { seq: 2, type: "delivery",   site: "Tesco RDC — Hinckley",           loc: "Watling Street, Hinckley LE10 3ED", window: "11:00", contact: "RDC Goods In", phone: "01455 123456", ref: "DEL-2203" },
      ],
    },
    {
      ref:         "QLTD-26-013",
      customer:    acme,
      date:        daysFromNow(0),
      material:    "Limestone Dust",
      qty:         "30", unit: "tonnes",
      priority:    "low",
      notes:       "Multi-drop. Call 30 mins before arrival at each site.",
      stops: [
        { seq: 1, type: "collection", site: "Acme Quarry — Buxton",           loc: "Quarry Lane, Buxton SK17 8AA",    window: "07:30", contact: "Dave Barker", phone: "07700 900123", ref: "COL-7744" },
        { seq: 2, type: "delivery",   site: "Site 1 — Stoke",                  loc: "Etruria Road, Stoke-on-Trent ST1 5NS", window: "10:00", contact: "Jim Steel", phone: "07700 902001", ref: "DEL-2204" },
        { seq: 3, type: "delivery",   site: "Site 2 — Crewe",                  loc: "Gresty Road, Crewe CW2 6EB",     window: "13:00", contact: "Pat Davies", phone: "07700 902002", ref: "DEL-2205" },
      ],
    },
    // ── Tomorrow's jobs ───────────────────────────────────────────────────────
    {
      ref:         "QLTD-26-014",
      customer:    buildco,
      date:        daysFromNow(1),
      material:    "Concrete Blocks",
      qty:         "12", unit: "tonnes",
      priority:    "high",
      notes:       "Hiab required on site. Customer will have unloading crew ready.",
      stops: [
        { seq: 1, type: "collection", site: "National Builders Merchant — Birmingham", loc: "Great Barr, Birmingham B42 2LY", window: "07:00", contact: "Warehouse", phone: "0121 357 1234", ref: "COL-7745" },
        { seq: 2, type: "delivery",   site: "BuildCo HQ — Solihull",           loc: "Lode Lane, Solihull B91 2RA",    window: "09:30", contact: "Sarah Mills", phone: "07700 900456", ref: "DEL-2206" },
      ],
    },
    {
      ref:         "QLTD-26-015",
      customer:    freshco,
      date:        daysFromNow(1),
      material:    "FMCG Dry Goods",
      qty:         "26", unit: "pallets",
      priority:    "normal",
      notes:       "Full trailer load. Tail lift required at delivery.",
      stops: [
        { seq: 1, type: "collection", site: "FreshCo DC — Daventry",           loc: "Royal Oak Way, Daventry NN11 8PG", window: "06:00", contact: "Night shift supervisor", phone: "01327 700100", ref: "COL-7746" },
        { seq: 2, type: "delivery",   site: "Morrisons RDC — Bridgwater",      loc: "Dunball Industrial Estate, Bridgwater TA6 4TP", window: "14:00", contact: "Goods In", phone: "01278 456789", ref: "DEL-2207" },
      ],
    },
    {
      ref:         "QLTD-26-016",
      customer:    acme,
      date:        daysFromNow(1),
      material:    "Recycled Aggregate",
      qty:         "20", unit: "tonnes",
      priority:    "normal",
      notes:       "",
      stops: [
        { seq: 1, type: "collection", site: "Acme Recycling — Tamworth",       loc: "Lichfield Street, Tamworth B79 7QY", window: "08:00", contact: "Yard manager", phone: "07700 903001", ref: "COL-7747" },
        { seq: 2, type: "delivery",   site: "Road Works — M6 J12",             loc: "M6 Junction 12 Site, Cannock WS11 0JX", window: "11:00", contact: "Site foreman", phone: "07700 903002", ref: "DEL-2208" },
      ],
    },
    // ── Day after tomorrow ────────────────────────────────────────────────────
    {
      ref:         "QLTD-26-017",
      customer:    buildco,
      date:        daysFromNow(2),
      material:    "Steel Sections",
      qty:         "8", unit: "tonnes",
      priority:    "high",
      notes:       "Abnormal load — requires escort. Contact haulage office before departure.",
      stops: [
        { seq: 1, type: "collection", site: "Steel Works — Sheffield",         loc: "Brightside Lane, Sheffield S9 2SP", window: "06:00", contact: "Despatch", phone: "0114 244 5678", ref: "COL-7748" },
        { seq: 2, type: "delivery",   site: "BuildCo Site C — Leeds",          loc: "Kirkstall Road, Leeds LS4 2AS",  window: "10:00", contact: "Sarah Mills", phone: "07700 900456", ref: "DEL-2209" },
      ],
    },
  ];

  let created = 0;
  for (const j of jobDefs) {
    const job = await prisma.job.create({
      data: {
        companyId:       COMPANY_ID,
        createdByUserId: CREATED_BY_USER,
        customerId:      j.customer.id,
        customerName:    j.customer.name,
        jobReference:    j.ref,
        goodsType:       j.material,
        quantity:        Number(j.qty),
        quantityUnit:    j.unit,
        priority:        j.priority,
        plannerNotes:    j.notes,
        internalNotes:   "[SEED] Sample data — safe to delete",
        status:          "draft",
        validationStatus: "ready_to_plan",
        qualityScore:    70,
        stops: {
          create: j.stops.map(s => ({
            companyId:           COMPANY_ID,
            sequenceNumber:      s.seq,
            type:                s.type,
            locationTextSnapshot: s.loc,
            siteName:            s.site,
            timeWindowStart:     s.window ? dateTime(j.date, s.window) : null,
            contactName:         s.contact,
            contactPhone:        s.phone,
            referenceNumber:     s.ref,
          })),
        },
      },
    });
    console.log(`  ✓ ${job.jobReference} — ${j.material} (${j.stops.length} stops)`);
    created++;
  }

  console.log(`\nDone — created ${created} jobs with ${jobDefs.reduce((n, j) => n + j.stops.length, 0)} stops total.`);
  console.log("Customers created: Acme Aggregates, BuildCo Contractors, FreshCo Distribution");
  console.log("\nNext: go to Runs → create a run → add stops from these jobs.");
}

main().catch(console.error).finally(() => { prisma.$disconnect(); pool.end(); });
