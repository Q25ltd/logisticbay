/**
 * runCompatibility — Step 5 (vehicle assignment + real compatibility).
 *
 * Single source for: (a) validating a truck/trailer assignment belongs to the
 * company, and (b) computing Run.trailerCompatible / Run.vehicleCompatible from
 * the run's derived requirements vs the assigned vehicle. Reuses the rule sets
 * in checkLoadVehicleService (no parallel rules). Used by BOTH run systems
 * (routes/runs.ts and routes/planning.ts) — no consolidation (that is Step 16).
 *
 * Weight uses the category-based PAYLOAD_T approximation (D5.4) — there is no
 * per-vehicle payload field yet. Follow-up: add FleetUnit.maxPayloadT.
 */

import { Prisma } from '../generated/client.js';
import { PAYLOAD_T, FRIDGE_BODIES, ADR_UNSAFE_BODIES } from '../services/checkLoadVehicleService.js';

type TxClient = Prisma.TransactionClient;

export interface RunCompatRequirements {
  hasHazardous:       boolean;
  hasTemperatureLoad: boolean;
  /** Total load weight in kg (Run.maxLoadWeight), or null if unknown. */
  maxLoadWeightKg:    number | null;
}

/**
 * Pure rule evaluation. No DB.
 * - No trailer/truck assigned ⇒ that dimension stays compatible (planner may
 *   assign later — consistent with PLANNING_BOARD 1.6 "trailer optional").
 */
export function computeRunCompatibility(
  trailer: { bodyType: string } | null,
  truck:   { vehicleClass: string; bodyCategory: string } | null,
  req:     RunCompatRequirements,
): { trailerCompatible: boolean; vehicleCompatible: boolean } {
  let trailerCompatible = true;
  let vehicleCompatible = true;

  if (trailer) {
    const body = (trailer.bodyType || '').toLowerCase();
    if (req.hasTemperatureLoad && !FRIDGE_BODIES.has(body)) trailerCompatible = false;
    if (req.hasHazardous && ADR_UNSAFE_BODIES.has(body))    trailerCompatible = false;
  }

  if (truck && req.maxLoadWeightKg != null && req.maxLoadWeightKg > 0) {
    const cat  = (truck.vehicleClass || truck.bodyCategory || '').toLowerCase();
    const maxT = PAYLOAD_T[cat];
    if (maxT != null && req.maxLoadWeightKg / 1000 > maxT) vehicleCompatible = false;
  }

  return { trailerCompatible, vehicleCompatible };
}

/**
 * Read a run's current requirements + assigned vehicles, compute compatibility,
 * and persist the flags. Call after requirements change or after a truck/trailer
 * is (re)assigned. Accepts a transaction client or the base PrismaClient.
 */
export async function recomputeRunCompatibility(
  tx: TxClient, runId: number, companyId: number,
): Promise<void> {
  const run = await tx.run.findFirst({
    where:  { id: runId, companyId },
    select: {
      assignedTrailerId: true, assignedTruckId: true,
      hasHazardous: true, hasTemperatureLoad: true, maxLoadWeight: true,
    },
  });
  if (!run) return;

  const trailer = run.assignedTrailerId != null
    ? await tx.fleetTrailer.findFirst({ where: { id: run.assignedTrailerId, companyId }, select: { bodyType: true } })
    : null;
  const truck = run.assignedTruckId != null
    ? await tx.fleetUnit.findFirst({ where: { id: run.assignedTruckId, companyId }, select: { vehicleClass: true, bodyCategory: true } })
    : null;

  const { trailerCompatible, vehicleCompatible } = computeRunCompatibility(trailer, truck, {
    hasHazardous:       run.hasHazardous,
    hasTemperatureLoad: run.hasTemperatureLoad,
    maxLoadWeightKg:    run.maxLoadWeight != null ? Number(run.maxLoadWeight) : null,
  });

  await tx.run.update({ where: { id: runId }, data: { trailerCompatible, vehicleCompatible } });
}

export interface FleetValidation {
  ok:       boolean;
  code?:    string;
  message?: string;
  warnings: string[];
}

/**
 * Validate that a provided truck/trailer id exists and belongs to this company
 * (D5.1). A vehicle that exists but isn't `available` is a warning, not a block.
 */
export async function validateFleetAssignment(
  tx: TxClient, companyId: number,
  truckId?: number | null, trailerId?: number | null,
): Promise<FleetValidation> {
  const warnings: string[] = [];

  if (truckId != null) {
    const t = await tx.fleetUnit.findFirst({ where: { id: truckId, companyId }, select: { status: true, registration: true } });
    if (!t) return { ok: false, code: 'TRUCK_NOT_FOUND', message: `Truck ${truckId} is not in this company's fleet.`, warnings };
    if (t.status !== 'available') warnings.push(`Truck ${t.registration} status is '${t.status}', not available.`);
  }

  if (trailerId != null) {
    const t = await tx.fleetTrailer.findFirst({ where: { id: trailerId, companyId }, select: { status: true, registration: true } });
    if (!t) return { ok: false, code: 'TRAILER_NOT_FOUND', message: `Trailer ${trailerId} is not in this company's fleet.`, warnings };
    if (t.status !== 'available') warnings.push(`Trailer ${t.registration} status is '${t.status}', not available.`);
  }

  return { ok: true, warnings };
}
