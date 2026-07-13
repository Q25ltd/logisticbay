/**
 * runReadinessService — Runs screen B1: "is THIS movement ready to execute?"
 *
 * Planning asks *is this a good movement?* (coverage, capacity, timing — done on the
 * Planning screen). Runs asks a different question: can the ALLOCATED driver, truck
 * and trailer actually do it. This computes the **Resource** half of readiness and a
 * **Ready-to-publish gate** — a boolean + named blockers, NOT a blended percentage
 * (a fuzzy % reintroduces the "what does 82% mean?" fog Runs exists to remove).
 *
 * Deterministic, no AI. `computeRunReadiness` is pure; `loadRunReadiness` below is
 * the shared DB assembler used by GET /runs/:id/readiness AND both publish routes
 * (B5: publish is blocked server-side while any hard check fails).
 *
 * Honesty rule: where the data doesn't exist (MOT, VOR, tacho hours-remaining), the
 * check is `unknown` — never a fake green tick, and never blocks publish on its own.
 */

import type { PrismaClient } from "../generated/client.js";

export interface ReadinessDriver {
  id:                    number;
  displayName:           string;
  status:                string;                 // "active" | …
  licenceClass?:         string | null;
  canDriveCategories?:   string[] | null;
  adrAllowed?:           boolean | null;
  hiabAllowed?:          boolean | null;
  moffettAllowed?:       boolean | null;
  manualHandlingAllowed?: boolean | null;
  canUseTrailer?:        boolean | null;
  trailerTypesAllowed?:  string[] | null;
}

interface ReadinessTruck {
  id:               number;
  registration:     string;
  status?:          string | null;
  onboardEquipment?: string[] | null;
}

interface ReadinessTrailer {
  id:               number;
  registration:     string;
  trailerType?:     string | null;
  bodyType?:        string | null;
  status?:          string | null;
  onboardEquipment?: string[] | null;
}

interface ReadinessLoad {
  hazardous?:        boolean | null;
  requiresTrailer?:  boolean | null;   // an artic/tractor load needs a trailer
  equipment?:        string[] | null;  // required onboard/handling equipment
}

export interface RunReadinessInput {
  hasStops:           boolean;
  driver?:            ReadinessDriver  | null;
  truck?:             ReadinessTruck   | null;
  trailer?:           ReadinessTrailer | null;
  loads:              ReadinessLoad[];
  // Carried from S5 (computed at assignment time) — NOT recomputed here.
  trailerCompatible?: boolean | null;
  vehicleCompatible?: boolean | null;
}

type CheckStatus = "pass" | "warn" | "fail" | "unknown" | "na";

interface ReadinessCheck {
  key:     string;
  label:   string;
  status:  CheckStatus;
  hard:    boolean;            // a hard `fail` blocks publish
  reason?: string;
}

export interface RunReadiness {
  ready:     boolean;          // gate: every hard check passes (no hard `fail`)
  blockers:  string[];         // human-readable hard failures
  resources: {
    checks: ReadinessCheck[];
    passed: number;            // checks that are `pass`
    total:  number;            // applicable checks (excludes `na`)
  };
}

const lc = (s?: string | null) => (s ?? "").toLowerCase();
const has = (arr: string[] | null | undefined, v: string) =>
  (arr ?? []).some(x => lc(x) === lc(v));

/** Map a required equipment token to the driver skill flag that satisfies it. */
function driverHasSkill(d: ReadinessDriver, equip: string): boolean | null {
  const e = lc(equip);
  if (e.includes("hiab"))    return !!d.hiabAllowed;
  if (e.includes("moffett") || e.includes("forklift")) return !!d.moffettAllowed;
  if (e.includes("manual"))  return !!d.manualHandlingAllowed;
  return null; // e.g. tail_lift is a vehicle feature, not a driver skill
}

export function computeRunReadiness(input: RunReadinessInput): RunReadiness {
  const { driver, truck, trailer, loads } = input;
  const checks: ReadinessCheck[] = [];

  const anyHazardous   = loads.some(l => l.hazardous);
  const needsTrailer   = loads.some(l => l.requiresTrailer);
  const neededEquip    = [...new Set(loads.flatMap(l => (l.equipment ?? []).map(lc)))];

  // ── Driver ────────────────────────────────────────────────────────────────
  checks.push(driver
    ? { key: "driver_assigned", label: "Driver assigned", status: "pass", hard: true }
    : { key: "driver_assigned", label: "Driver assigned", status: "fail", hard: true, reason: "No driver assigned to this run." });

  if (driver) {
    checks.push(driver.status === "active"
      ? { key: "driver_available", label: "Driver available", status: "pass", hard: true }
      : { key: "driver_available", label: "Driver available", status: "fail", hard: true, reason: `${driver.displayName} is not active (${driver.status}).` });

    // Licence — only meaningful once a truck is assigned (it determines the class).
    if (truck) {
      const hasLicence = !!(driver.licenceClass && driver.licenceClass.trim()) || (driver.canDriveCategories?.length ?? 0) > 0;
      checks.push(hasLicence
        ? { key: "driver_licence", label: "Driver licence", status: "pass", hard: true }
        : { key: "driver_licence", label: "Driver licence", status: "unknown", hard: true, reason: `No licence category recorded for ${driver.displayName}.` });
    } else {
      checks.push({ key: "driver_licence", label: "Driver licence", status: "na", hard: true });
    }

    // ADR — hard only when the load is hazardous.
    if (anyHazardous) {
      checks.push(driver.adrAllowed
        ? { key: "driver_adr", label: "Driver ADR", status: "pass", hard: true }
        : { key: "driver_adr", label: "Driver ADR", status: "fail", hard: true, reason: `Hazardous load but ${driver.displayName} has no ADR.` });
    } else {
      checks.push({ key: "driver_adr", label: "Driver ADR", status: "na", hard: true });
    }

    // Trailer capability — hard only when a trailer is assigned.
    if (trailer) {
      const typeOk = (driver.trailerTypesAllowed?.length ?? 0) === 0
        || has(driver.trailerTypesAllowed, trailer.trailerType ?? "")
        || has(driver.trailerTypesAllowed, trailer.bodyType ?? "");
      checks.push(driver.canUseTrailer && typeOk
        ? { key: "driver_trailer", label: "Driver can pull trailer", status: "pass", hard: true }
        : { key: "driver_trailer", label: "Driver can pull trailer", status: "fail", hard: true,
            reason: !driver.canUseTrailer ? `${driver.displayName} is not trailer-rated.` : `${driver.displayName} isn't cleared for ${trailer.trailerType ?? trailer.bodyType ?? "this trailer"}.` });
    } else {
      checks.push({ key: "driver_trailer", label: "Driver can pull trailer", status: "na", hard: true });
    }
  }

  // ── Trailer ───────────────────────────────────────────────────────────────
  if (needsTrailer) {
    checks.push(trailer
      ? { key: "trailer_assigned", label: "Trailer assigned", status: "pass", hard: true }
      : { key: "trailer_assigned", label: "Trailer assigned", status: "fail", hard: true, reason: "Load needs a trailer but none is assigned." });
  } else {
    checks.push({ key: "trailer_assigned", label: "Trailer assigned", status: trailer ? "pass" : "na", hard: false });
  }
  // Carried compatibility (S5) — only a fail when something IS assigned.
  if (trailer) {
    checks.push(input.trailerCompatible === false
      ? { key: "trailer_compatible", label: "Trailer suits load", status: "fail", hard: true, reason: "Assigned trailer is not compatible with the load." }
      : input.trailerCompatible == null
        ? { key: "trailer_compatible", label: "Trailer suits load", status: "unknown", hard: true }
        : { key: "trailer_compatible", label: "Trailer suits load", status: "pass", hard: true });
    checks.push((trailer.status ?? "available") === "available"
      ? { key: "trailer_status", label: "Trailer available", status: "pass", hard: false }
      : { key: "trailer_status", label: "Trailer available", status: "warn", hard: false, reason: `Trailer ${trailer.registration} is ${trailer.status}.` });
  }

  // ── Truck (unit) — soft: PRODUCT treats the unit as a later (driver) phase. ──
  checks.push(truck
    ? { key: "truck_assigned", label: "Vehicle assigned", status: "pass", hard: false }
    : { key: "truck_assigned", label: "Vehicle assigned", status: "warn", hard: false, reason: "No vehicle assigned yet." });
  if (truck) {
    checks.push(input.vehicleCompatible === false
      ? { key: "vehicle_compatible", label: "Vehicle suits load", status: "fail", hard: true, reason: "Assigned vehicle is not compatible with the load." }
      : input.vehicleCompatible == null
        ? { key: "vehicle_compatible", label: "Vehicle suits load", status: "unknown", hard: true }
        : { key: "vehicle_compatible", label: "Vehicle suits load", status: "pass", hard: true });
  }

  // ── Equipment — soft: required equipment covered by driver skill or vehicle. ──
  if (neededEquip.length > 0) {
    const missing = neededEquip.filter(e => {
      const bySkill   = driver ? driverHasSkill(driver, e) : null;
      const onVehicle = has(truck?.onboardEquipment, e) || has(trailer?.onboardEquipment, e);
      return bySkill === false && !onVehicle ? true : bySkill == null ? !onVehicle : false;
    });
    checks.push(missing.length === 0
      ? { key: "equipment", label: "Equipment", status: "pass", hard: false }
      : { key: "equipment", label: "Equipment", status: "warn", hard: false, reason: `May be missing: ${missing.join(", ")}.` });
  }

  // ── Not-yet-captured (honest unknowns; never block on their own) ────────────
  checks.push({ key: "mot_inspection", label: "MOT / inspection", status: "unknown", hard: false, reason: "Not captured yet." });
  checks.push({ key: "vor_defects",    label: "Defects / VOR",     status: "unknown", hard: false, reason: "Not captured yet." });
  checks.push({ key: "driver_hours",   label: "Driver hours", status: "unknown", hard: false, reason: "Allocation uses the full preferred shift; live remaining hours are tracked on the Live screen." });

  // ── Gate ────────────────────────────────────────────────────────────────────
  const blockers = checks.filter(c => c.hard && c.status === "fail").map(c => c.reason ?? c.label);
  const ready    = input.hasStops && blockers.length === 0;
  const applicable = checks.filter(c => c.status !== "na");
  const passed     = applicable.filter(c => c.status === "pass").length;

  return { ready, blockers, resources: { checks, passed, total: applicable.length } };
}

// ── DB assembler — shared by GET /runs/:id/readiness and both publish routes ──

export interface LoadedRunReadiness {
  readiness: RunReadiness;
  assigned:  { driver: string | null; truck: string | null; trailer: string | null };
}

const arr = (v: unknown): string[] | null =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null;

/**
 * Fetch everything readiness needs for one run (tenant-scoped) and compute it.
 * The S5 compatibility override is applied here: an explicitly overridden
 * compat failure must not re-block publish through the readiness gate.
 * Returns null when the run doesn't exist in this company.
 */
export async function loadRunReadiness(
  prisma: PrismaClient,
  companyId: number,
  runId: number,
): Promise<LoadedRunReadiness | null> {
  const run = await prisma.run.findFirst({
    where:   { id: runId, companyId },
    include: { driver: true, assignments: { where: { removedAt: null }, select: { jobId: true } } },
  });
  if (!run) return null;

  const jobIds = [...new Set(run.assignments.map(a => a.jobId))];
  const [truck, trailer, jobs] = await Promise.all([
    run.assignedTruckId
      ? prisma.fleetUnit.findFirst({ where: { id: run.assignedTruckId, companyId }, select: { id: true, registration: true, status: true, onboardEquipment: true } })
      : Promise.resolve(null),
    run.assignedTrailerId
      ? prisma.fleetTrailer.findFirst({ where: { id: run.assignedTrailerId, companyId }, select: { id: true, registration: true, trailerType: true, bodyType: true, status: true, onboardEquipment: true } })
      : Promise.resolve(null),
    jobIds.length
      ? prisma.job.findMany({ where: { companyId, id: { in: jobIds } }, select: { id: true, hazardClass: true, equipment: true, vehicleCategory: true } })
      : Promise.resolve([]),
  ]);

  const loads = jobs.map(j => ({
    hazardous:       !!(j.hazardClass && j.hazardClass.trim()),
    requiresTrailer: ["artic", "tractor", "drawbar"].includes((j.vehicleCategory ?? "").toLowerCase()),
    equipment:       arr(j.equipment),
  }));

  const d = run.driver;
  const readiness = computeRunReadiness({
    hasStops: run.assignments.length > 0,
    driver: d ? {
      id: d.id, displayName: d.displayName, status: d.status,
      licenceClass: d.licenceClass, canDriveCategories: arr(d.canDriveCategories),
      adrAllowed: d.adrAllowed, hiabAllowed: d.hiabAllowed, moffettAllowed: d.moffettAllowed,
      manualHandlingAllowed: d.manualHandlingAllowed, canUseTrailer: d.canUseTrailer,
      trailerTypesAllowed: arr(d.trailerTypesAllowed),
    } : null,
    truck:   truck   ? { id: truck.id, registration: truck.registration, status: truck.status, onboardEquipment: arr(truck.onboardEquipment) } : null,
    trailer: trailer ? { id: trailer.id, registration: trailer.registration, trailerType: trailer.trailerType, bodyType: trailer.bodyType, status: trailer.status, onboardEquipment: arr(trailer.onboardEquipment) } : null,
    loads,
    trailerCompatible: run.compatibilityOverridden ? true : run.trailerCompatible,
    vehicleCompatible: run.compatibilityOverridden ? true : run.vehicleCompatible,
  });

  return {
    readiness,
    assigned: {
      driver:  d?.displayName ?? null,
      truck:   truck?.registration ?? null,
      trailer: trailer?.registration ?? null,
    },
  };
}
