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
import { bodyTypeLabel } from "../constants/vehicleTaxonomy.js";

const lcs = (s?: string | null) => (s ?? "").toLowerCase();

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
  motExpiryDate?:   Date | string | null;
}

interface ReadinessTrailer {
  id:               number;
  registration:     string;
  trailerType?:     string | null;
  bodyType?:        string | null;
  status?:          string | null;
  onboardEquipment?: string[] | null;
  motExpiryDate?:   Date | string | null;
  // Load state relative to THIS run: pre-loaded with one of its jobs is the right
  // trailer; loaded with anything else means it's full and cannot go out.
  loadedWithThisRun?:  boolean;
  loadedWithOtherJob?: boolean;
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
  // Human text for the trailer TYPE this run needs (e.g. "temperature-controlled
  // (fridge)") — surfaced in the no-trailer warning so the driver knows what to
  // collect from the yard.
  requiredTrailerText?: string | null;
}

type CheckStatus = "pass" | "warn" | "fail" | "unknown" | "na";

/**
 * Where the information behind a check is BORN / fixed (four-intake-gates):
 *   allocation — fix on the Runs screen itself (assign / swap the asset)
 *   driver     — the driver registration form (Drivers page)
 *   fleet      — the unit/trailer registration form (Fleet page)
 *   job        — the job intake form (CJP/PRF)
 */
export type CheckSource = "allocation" | "driver" | "fleet" | "job";

interface ReadinessCheck {
  key:     string;
  label:   string;
  status:  CheckStatus;
  hard:    boolean;            // a hard `fail` blocks publish
  reason?: string;
  source?: CheckSource;        // stamped from CHECK_SOURCE — tells the planner WHERE to fix it
}

/** One map, one place — every check key points at the source that fixes it. */
const CHECK_SOURCE: Record<string, CheckSource> = {
  driver_assigned:    "allocation",
  driver_available:   "driver",
  driver_licence:     "driver",
  driver_adr:         "driver",
  driver_trailer:     "driver",
  trailer_assigned:   "allocation",
  trailer_compatible: "allocation",
  trailer_load_state: "allocation",
  trailer_status:     "fleet",
  truck_assigned:     "allocation",
  vehicle_compatible: "allocation",
  equipment:          "fleet",
  mot_inspection:     "fleet",
  vor_defects:        "fleet",
  driver_hours:       "driver",
};

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

    // Trailer capability — hard whenever the LOAD needs a trailer (the driver
    // will pull one even if it isn't pinned yet); type clearance only checkable
    // once a specific trailer is assigned.
    if (trailer) {
      const typeOk = (driver.trailerTypesAllowed?.length ?? 0) === 0
        || has(driver.trailerTypesAllowed, trailer.trailerType ?? "")
        || has(driver.trailerTypesAllowed, trailer.bodyType ?? "");
      checks.push(driver.canUseTrailer && typeOk
        ? { key: "driver_trailer", label: "Driver can pull trailer", status: "pass", hard: true }
        : { key: "driver_trailer", label: "Driver can pull trailer", status: "fail", hard: true,
            reason: !driver.canUseTrailer ? `${driver.displayName} is not trailer-rated.` : `${driver.displayName} isn't cleared for ${trailer.trailerType ?? trailer.bodyType ?? "this trailer"}.` });
    } else if (needsTrailer) {
      checks.push(driver.canUseTrailer
        ? { key: "driver_trailer", label: "Driver can pull trailer", status: "pass", hard: true }
        : { key: "driver_trailer", label: "Driver can pull trailer", status: "fail", hard: true,
            reason: `${driver.displayName} is not trailer-rated.` });
    } else {
      checks.push({ key: "driver_trailer", label: "Driver can pull trailer", status: "na", hard: true });
    }
  }

  // ── Trailer ───────────────────────────────────────────────────────────────
  // Yard-grab ops: a run may publish WITHOUT a pinned trailer — the driver
  // collects a suitable one at the yard and registers it at shift start
  // (POST /shifts trailerReg + walkaround checks). Soft warn carries the
  // required TYPE so the driver knows what to take. A pinned-but-incompatible
  // trailer stays a hard fail below.
  if (needsTrailer) {
    checks.push(trailer
      ? { key: "trailer_assigned", label: "Trailer assigned", status: "pass", hard: false }
      : { key: "trailer_assigned", label: "Trailer assigned", status: "warn", hard: false,
          reason: `No trailer pinned — driver collects one at the yard.${input.requiredTrailerText ? ` Needs: ${input.requiredTrailerText}.` : ""}` });
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
    // Load state — HARD: a trailer full with another job cannot go out on this run.
    if (trailer.loadedWithOtherJob) {
      checks.push({ key: "trailer_load_state", label: "Trailer load state", status: "fail", hard: true,
        reason: `Trailer ${trailer.registration} is loaded with another job — it's full.` });
    } else if (trailer.loadedWithThisRun) {
      checks.push({ key: "trailer_load_state", label: "Trailer load state", status: "pass", hard: true });
    }
    checks.push((trailer.status ?? "available") === "available" || trailer.loadedWithThisRun
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

  // ── MOT / annual test — real check from the fleet form's motExpiryDate ──────
  // Expired = illegal to run → hard fail. Within 30 days → warn. No date on an
  // assigned asset → honest unknown for THAT asset. Nothing assigned → n/a.
  {
    const assets: { reg: string; date: Date | string | null | undefined }[] = [];
    if (input.truck)   assets.push({ reg: input.truck.registration,   date: input.truck.motExpiryDate });
    if (input.trailer) assets.push({ reg: input.trailer.registration, date: input.trailer.motExpiryDate });
    if (assets.length === 0) {
      checks.push({ key: "mot_inspection", label: "MOT / inspection", status: "na", hard: true });
    } else {
      const now = Date.now();
      const soonMs = 30 * 24 * 60 * 60 * 1000;
      const expired: string[] = []; const soon: string[] = []; const missing: string[] = [];
      for (const a of assets) {
        if (a.date == null) { missing.push(a.reg); continue; }
        const t = new Date(a.date).getTime();
        if (t < now) expired.push(`${a.reg} expired ${new Date(a.date).toISOString().slice(0, 10)}`);
        else if (t < now + soonMs) soon.push(`${a.reg} expires ${new Date(a.date).toISOString().slice(0, 10)}`);
      }
      if (expired.length) {
        checks.push({ key: "mot_inspection", label: "MOT / inspection", status: "fail", hard: true, reason: `MOT/annual test expired: ${expired.join("; ")}.` });
      } else if (soon.length) {
        checks.push({ key: "mot_inspection", label: "MOT / inspection", status: "warn", hard: true, reason: `Due soon: ${soon.join("; ")}.` });
      } else if (missing.length) {
        checks.push({ key: "mot_inspection", label: "MOT / inspection", status: "unknown", hard: true, reason: `No test date recorded for ${missing.join(", ")} — add it on the fleet form.` });
      } else {
        checks.push({ key: "mot_inspection", label: "MOT / inspection", status: "pass", hard: true });
      }
    }
  }

  // ── Defects / VOR — real check from the fleet form's status ("vor") ─────────
  {
    const off: string[] = [];
    if (input.truck   && lcs(input.truck.status)   === "vor") off.push(input.truck.registration);
    if (input.trailer && lcs(input.trailer.status) === "vor") off.push(input.trailer.registration);
    if (!input.truck && !input.trailer) {
      checks.push({ key: "vor_defects", label: "Defects / VOR", status: "na", hard: true });
    } else if (off.length) {
      checks.push({ key: "vor_defects", label: "Defects / VOR", status: "fail", hard: true, reason: `${off.join(", ")} is off road (VOR) — swap the asset or return it to service.` });
    } else {
      checks.push({ key: "vor_defects", label: "Defects / VOR", status: "pass", hard: true });
    }
  }

  checks.push({ key: "driver_hours",   label: "Driver hours", status: "unknown", hard: false, reason: "Allocation uses the full preferred shift; live remaining hours are tracked on the Live screen." });

  // Stamp each check with the intake source that fixes it (one map, no drift).
  for (const c of checks) c.source = CHECK_SOURCE[c.key];

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
      ? prisma.fleetUnit.findFirst({ where: { id: run.assignedTruckId, companyId }, select: { id: true, registration: true, status: true, onboardEquipment: true, motExpiryDate: true } })
      : Promise.resolve(null),
    run.assignedTrailerId
      ? prisma.fleetTrailer.findFirst({ where: { id: run.assignedTrailerId, companyId }, select: { id: true, registration: true, trailerType: true, bodyType: true, status: true, onboardEquipment: true, linkedJobId: true, motExpiryDate: true } })
      : Promise.resolve(null),
    jobIds.length
      ? prisma.job.findMany({ where: { companyId, id: { in: jobIds } }, select: { id: true, hazardClass: true, equipment: true, vehicleCategory: true, trailersAllowed: true } })
      : Promise.resolve([]),
  ]);

  const trailerLoaded         = (trailer?.status ?? "").toLowerCase() === "loaded";
  const trailerLoadedWithOurs = trailerLoaded && trailer?.linkedJobId != null && jobIds.includes(trailer.linkedJobId);

  const loads = jobs.map(j => ({
    hazardous:       !!(j.hazardClass && j.hazardClass.trim()),
    requiresTrailer: ["artic", "tractor", "drawbar"].includes((j.vehicleCategory ?? "").toLowerCase()),
    equipment:       arr(j.equipment),
  }));

  // What trailer TYPE does this run need? Derived requirement wins (temp/hazard/
  // oversize), else the union of the jobs' allowed trailer bodies — human labels
  // only, this text is shown to planners and drivers.
  const DERIVED_TRAILER_TEXT: Record<string, string> = {
    temperature_controlled:  "temperature-controlled (fridge)",
    curtainsider_or_flatbed: "curtain-sider or flatbed",
  };
  const allowedBodies = [...new Set(jobs.flatMap(j => arr(j.trailersAllowed) ?? []))].map(bodyTypeLabel);
  const requiredTrailerText = run.requiredTrailerType
    ? (DERIVED_TRAILER_TEXT[run.requiredTrailerType] ?? run.requiredTrailerType.replace(/_/g, " "))
    : allowedBodies.length > 0 ? allowedBodies.join(" / ") : null;

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
    truck:   truck   ? { id: truck.id, registration: truck.registration, status: truck.status, onboardEquipment: arr(truck.onboardEquipment), motExpiryDate: truck.motExpiryDate } : null,
    trailer: trailer ? {
      id: trailer.id, registration: trailer.registration, trailerType: trailer.trailerType, bodyType: trailer.bodyType,
      status: trailer.status, onboardEquipment: arr(trailer.onboardEquipment),
      motExpiryDate: trailer.motExpiryDate,
      loadedWithThisRun:  trailerLoadedWithOurs,
      loadedWithOtherJob: trailerLoaded && !trailerLoadedWithOurs,
    } : null,
    loads,
    trailerCompatible: run.compatibilityOverridden ? true : run.trailerCompatible,
    vehicleCompatible: run.compatibilityOverridden ? true : run.vehicleCompatible,
    requiredTrailerText,
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
