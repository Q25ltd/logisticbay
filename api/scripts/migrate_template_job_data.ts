/**
 * One-off migration: rename legacy alias fields in JobTemplate.defaultJobData
 * to canonical DB column names.
 *
 * Run: npx tsx api/scripts/migrate_template_job_data.ts
 *
 * Field mapping (old → canonical):
 *   contactName          → bookingContactName
 *   contactPhone         → bookingContactPhone
 *   contactEmail         → bookingContactEmail
 *   materialDesc/materialType → goodsDescription
 *   totalQty             → quantity
 *   qtyUnit/unit         → quantityUnit
 *   totalWeight/weight   → weight (keep as string in blob)
 *   adrClass             → hazardClass
 *   reqBodyCategory      → vehicleCategory
 *   reqBodyType          → bodyTypes (wrap scalar in array)
 *   reqGvwMin            → minGvwClass
 *   reqEquipment         → equipment
 *   trailerTypesAllowed  → trailersAllowed
 *   podRequired          → requirePOD
 *   weighbridgeReq       → weighbridgeRequired
 *   forkliftReq/tailLiftReq/craneReq → removed (stop-level, not job-level)
 *   accessNotes          → vehicleAccessNotes
 *   custInstructions     → driverVisibleNotes
 *   returnDestination    → alternativeReturnAddress
 *   altAddress           → removed
 *   assignedTruck        → removed
 *   assignedTrailer      → removed
 *   reqLicenceClass      → removed (derived from vehicle)
 *   reqEndorsements      → removed
 *   driverQuals          → removed
 *   vehicleType/vehicleClass → vehicleCategory (if not already present)
 *   vehicleClassOther    → removed
 *   vehicleTypeOther     → removed
 *   minSize              → removed (superseded by minGvwClass)
 *   loadingMethod        → removed (stop-level)
 *   unloadingMethod      → removed (stop-level)
 *   loadNotes            → removed
 *   trailerLength        → removed
 *   customerInstructions → driverVisibleNotes (if not already present)
 *   unitOther            → removed
 *   qtyUnitOther         → removed
 *   materialType         → goodsDescription (if not already set by materialDesc)
 */

import "dotenv/config";
import "../src/lib/env.js";
import { PrismaClient } from "../src/generated/client.js";
import { PrismaPg }     from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma  = new PrismaClient({ adapter });

type OldJobData = Record<string, unknown>;

function migrateJobData(old: OldJobData): OldJobData {
  const out: OldJobData = {};

  // Identity / customer
  if (old.customerId   !== undefined) out.customerId   = old.customerId;
  if (old.customerName !== undefined) out.customerName = old.customerName;
  if (old.customerRef  !== undefined) out.customerRef  = old.customerRef;
  if (old.serviceType  !== undefined) out.serviceType  = old.serviceType;
  if (old.jobType      !== undefined) out.jobType      = old.jobType;
  if (old.jobTitle     !== undefined) out.jobTitle     = old.jobTitle;
  if (old.priority     !== undefined) out.priority     = old.priority;

  // Booking contact — migrate old names
  out.bookingContactName  = old.bookingContactName  ?? old.contactName  ?? null;
  out.bookingContactPhone = old.bookingContactPhone ?? old.contactPhone ?? null;
  out.bookingContactEmail = old.bookingContactEmail ?? old.contactEmail ?? null;

  // Billing
  if (old.billingNotes   !== undefined) out.billingNotes   = old.billingNotes;
  if (old.custRefRequired !== undefined) out.custRefRequired = old.custRefRequired;
  if (old.poRequired      !== undefined) out.poRequired      = old.poRequired;

  // Load
  out.goodsDescription = old.goodsDescription ?? old.materialDesc ?? old.materialType ?? null;
  out.goodsType        = old.goodsType ?? null;
  out.quantity         = old.quantity  ?? old.totalQty  ?? null;
  out.quantityUnit     = old.quantityUnit ?? old.qtyUnit ?? old.unit ?? null;
  out.weight           = old.weight    ?? old.totalWeight ?? null;
  out.volume           = old.volume    ?? null;
  out.dimensions       = old.dimensions ?? null;
  out.fragile          = old.fragile   ?? false;
  out.stackable        = old.stackable ?? false;
  out.tempControlled   = old.tempControlled ?? false;
  out.tempRange        = old.tempRange ?? null;
  out.hazardClass      = old.hazardClass ?? old.adrClass ?? null;
  out.photosRequired   = old.photosRequired ?? false;
  out.weighbridgeRequired = old.weighbridgeRequired ?? old.weighbridgeReq ?? false;
  if (old.securingRequirements !== undefined) out.securingRequirements = old.securingRequirements;
  if (old.specialRequirements  !== undefined) out.specialRequirements  = old.specialRequirements;

  // Vehicle
  out.vehicleCategory = old.vehicleCategory ?? old.reqBodyCategory ?? old.vehicleType ?? old.vehicleClass ?? null;
  out.minGvwClass     = old.minGvwClass ?? old.reqGvwMin ?? null;
  out.equipment       = old.equipment ?? old.reqEquipment ?? [];
  // bodyTypes: if reqBodyType is a scalar, wrap in array
  if (old.bodyTypes !== undefined) {
    out.bodyTypes = old.bodyTypes;
  } else if (old.reqBodyType) {
    out.bodyTypes = [old.reqBodyType as string];
  }
  out.trailersAllowed = old.trailersAllowed ?? old.trailerTypesAllowed ?? [];
  if (old.vehicleAccessNotes !== undefined) out.vehicleAccessNotes = old.vehicleAccessNotes;
  else if (old.accessNotes !== undefined)   out.vehicleAccessNotes = old.accessNotes;

  // Notes
  out.requirePOD       = old.requirePOD ?? old.podRequired ?? false;
  out.driverVisibleNotes = old.driverVisibleNotes ?? old.custInstructions ?? old.customerInstructions ?? null;
  if (old.internalNotes !== undefined) out.internalNotes = old.internalNotes;

  // Exception policy
  out.failureAction          = old.failureAction ?? null;
  out.assistancePhone        = old.assistancePhone ?? null;
  out.assistanceNote         = old.assistanceNote ?? null;
  out.approvalContactName    = old.approvalContactName ?? null;
  out.approvalContactPhone   = old.approvalContactPhone ?? null;
  out.alternativeReturnAddress      = old.alternativeReturnAddress ?? old.returnDestination ?? null;
  out.alternativeReturnPostcode     = old.alternativeReturnPostcode ?? null;
  out.alternativeReturnContactName  = old.alternativeReturnContactName ?? null;
  out.alternativeReturnContactPhone = old.alternativeReturnContactPhone ?? null;

  // Drop null values to keep blobs clean
  for (const key of Object.keys(out)) {
    if (out[key] === null || out[key] === "") delete out[key];
  }

  return out;
}

async function main() {
  const templates = await prisma.jobTemplate.findMany({
    where:  { defaultJobData: { not: null } },
    select: { id: true, name: true, defaultJobData: true },
  });

  console.log(`Found ${templates.length} templates with defaultJobData`);

  let migrated = 0;
  for (const t of templates) {
    const old = t.defaultJobData as OldJobData;
    const migrated_data = migrateJobData(old);
    await prisma.jobTemplate.update({
      where: { id: t.id },
      data:  { defaultJobData: migrated_data },
    });
    console.log(`  ✓ Template ${t.id}: ${t.name}`);
    migrated++;
  }

  console.log(`\nMigrated ${migrated} templates.`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
