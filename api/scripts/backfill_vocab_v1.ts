import "dotenv/config";
import { PrismaClient, Prisma } from "../src/generated/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  licencesThatCanDrive,
  type BodyCategory,
  type DriverLicenceClass,
} from "../src/constants/vehicleTaxonomy.js";

type UnitBackfill = {
  vehicleClassLegacy: string;
  bodyCategory: string;
  gvwClass: string;
  bodyType: string;
};

type JobBackfill = {
  bodyCategory: string;
  bodyType: string;
  equipment: string[];
  licenceClass: string;
};

function legacyUnitClass(value: string): UnitBackfill {
  const source = value.trim();
  const text = source.toLowerCase();
  if (text === "van") return { vehicleClassLegacy: source, bodyCategory: "van", gvwClass: "3.5t", bodyType: "panel" };
  if (text === "artic" || text === "artic unit" || /^class\s*1$/.test(text)) {
    return { vehicleClassLegacy: source, bodyCategory: "tractor", gvwClass: "44t", bodyType: "" };
  }
  if (text === "rigid" || /^class\s*2$/.test(text)) return { vehicleClassLegacy: source, bodyCategory: "rigid", gvwClass: "", bodyType: "" };
  if (text === "tipper") return { vehicleClassLegacy: source, bodyCategory: "rigid", gvwClass: "", bodyType: "tipper" };
  if (text === "grab") return { vehicleClassLegacy: source, bodyCategory: "rigid", gvwClass: "", bodyType: "tipper" };
  if (text === "mixer") return { vehicleClassLegacy: source, bodyCategory: "rigid", gvwClass: "", bodyType: "mixer" };
  if (text === "hiab") return { vehicleClassLegacy: source, bodyCategory: "rigid", gvwClass: "", bodyType: "flatbed" };
  if (text === "refrigerated") return { vehicleClassLegacy: source, bodyCategory: "rigid", gvwClass: "", bodyType: "fridge" };
  return { vehicleClassLegacy: source, bodyCategory: "", gvwClass: "", bodyType: "" };
}

function legacyTrailerType(value: string) {
  const text = value.trim().toLowerCase();
  if (text === "curtain sider" || text === "curtain_sider") return "curtain_sider";
  if (text === "box") return "box";
  if (text === "flatbed") return "flatbed";
  if (text === "low loader" || text === "low_loader") return "low_loader";
  if (text === "fridge" || text === "refrigerated" || text === "refrigerated_trailer") return "fridge";
  if (text === "tipper") return "tipper";
  if (text === "tanker") return "tanker_other";
  if (text === "container" || text === "skeletal") return "skeletal_40";
  if (text === "walking_floor") return "walking_floor";
  return value.trim();
}

function legacyJobRequirement(value: string): JobBackfill {
  const text = value.trim().toLowerCase();
  if (text === "van") return { bodyCategory: "van", bodyType: "panel", equipment: [], licenceClass: "B" };
  if (text === "artic" || /^class\s*1$/.test(text)) return { bodyCategory: "tractor", bodyType: "", equipment: [], licenceClass: "CE" };
  if (text === "rigid" || /^class\s*2$/.test(text)) return { bodyCategory: "rigid", bodyType: "", equipment: [], licenceClass: "C" };
  if (text === "tipper" || text === "grab") return { bodyCategory: "rigid", bodyType: "tipper", equipment: [], licenceClass: "C" };
  if (text === "mixer") return { bodyCategory: "rigid", bodyType: "mixer", equipment: [], licenceClass: "C" };
  if (text === "hiab") return { bodyCategory: "rigid", bodyType: "flatbed", equipment: ["hiab_crane"], licenceClass: "C" };
  if (text === "refrigerated") return { bodyCategory: "rigid", bodyType: "fridge", equipment: [], licenceClass: "C" };
  return { bodyCategory: "", bodyType: "", equipment: [], licenceClass: "" };
}

function normalizeLicence(value: string): DriverLicenceClass | "" {
  const text = value.trim().toUpperCase().replace(/\s+/g, "");
  if (!text) return "";
  if (text.includes("CE") || text.includes("CLASS1")) return "CE";
  if (text.includes("C1E")) return "C1E";
  if (text === "C" || text.includes("CLASS2")) return "C";
  if (text.includes("C1")) return "C1";
  if (text === "B" || text.includes("VAN")) return "B";
  return "";
}

function canDriveCategories(licenceClass: DriverLicenceClass | "") {
  if (!licenceClass) return [];
  const categories = new Set<string>();
  for (const category of ["van", "rigid", "tractor"] as BodyCategory[]) {
    if (licencesThatCanDrive(category).some((licence) => licence.value === licenceClass)) {
      categories.add(category);
    }
  }
  return [...categories];
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  const counts = {
    fleetUnits: 0,
    fleetTrailers: 0,
    plannedJobs: 0,
    drivers: 0,
    shiftSegments: 0,
  };

  try {
    const units = await prisma.fleetUnit.findMany();
    for (const unit of units) {
      const mapped = legacyUnitClass(unit.vehicleClass);
      const data: Prisma.FleetUnitUpdateInput = {
        vehicleClassLegacy: unit.vehicleClassLegacy || mapped.vehicleClassLegacy,
        bodyCategory: unit.bodyCategory || mapped.bodyCategory,
        gvwClass: unit.gvwClass || mapped.gvwClass,
        bodyType: unit.bodyType || mapped.bodyType,
      };
      if (data.vehicleClassLegacy || data.bodyCategory || data.gvwClass || data.bodyType) {
        await prisma.fleetUnit.update({ where: { id: unit.id }, data });
        counts.fleetUnits += 1;
      }
    }

    const trailers = await prisma.fleetTrailer.findMany();
    for (const trailer of trailers) {
      const bodyType = trailer.bodyType || legacyTrailerType(trailer.trailerType);
      if (bodyType && bodyType !== trailer.bodyType) {
        await prisma.fleetTrailer.update({ where: { id: trailer.id }, data: { bodyType } });
        counts.fleetTrailers += 1;
      }
    }

    const jobs = await prisma.plannedJob.findMany();
    for (const job of jobs) {
      const legacy = legacyJobRequirement(job.vehicleClassRequired || job.vehicleClass);
      const equipment = Array.isArray(job.reqEquipment) && job.reqEquipment.length
        ? job.reqEquipment
        : legacy.equipment;
      const data: Prisma.PlannedJobUpdateInput = {
        reqBodyCategory: job.reqBodyCategory || legacy.bodyCategory,
        reqBodyType: job.reqBodyType || legacy.bodyType,
        reqEquipment: equipment as Prisma.InputJsonValue,
        reqLicenceClass: job.reqLicenceClass || legacy.licenceClass,
      };
      if (data.reqBodyCategory || data.reqBodyType || legacy.equipment.length || data.reqLicenceClass) {
        await prisma.plannedJob.update({ where: { id: job.id }, data });
        counts.plannedJobs += 1;
      }
    }

    const drivers = await prisma.driverProfile.findMany();
    for (const driver of drivers) {
      const licenceClass = normalizeLicence(driver.licenceClass);
      if (!licenceClass) continue;
      await prisma.driverProfile.update({
        where: { id: driver.id },
        data: {
          licenceClass,
          canDriveCategories: canDriveCategories(licenceClass) as Prisma.InputJsonValue,
        },
      });
      counts.drivers += 1;
    }

    counts.shiftSegments += (await prisma.shiftSegment.updateMany({
      where: { vehicleClass: { in: ["class1", "class 1", "artic"] } },
      data: { vehicleClass: "tractor" },
    })).count;
    counts.shiftSegments += (await prisma.shiftSegment.updateMany({
      where: { vehicleClass: { in: ["class2", "class 2"] } },
      data: { vehicleClass: "rigid" },
    })).count;

    console.log(JSON.stringify(counts, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
