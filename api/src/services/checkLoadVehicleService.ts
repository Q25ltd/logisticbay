/**
 * Rule-based load ↔ vehicle compatibility check.
 *
 * No AI — all logic is deterministic rules based on payload capacity,
 * temperature requirements, ADR class, and body-type compatibility.
 * Advisory only — the planner always makes the final call.
 */

export interface LoadVehicleCheckInput {
  vehicleCategory:    string;          // e.g. "rigid"
  bodyTypes?:         string[];        // e.g. ["double_deck_box"]
  goodsDescription?:  string;
  goodsType?:         string;
  weight?:            number;          // kg
  quantity?:          number;
  quantityUnit?:      string;
  hazardClass?:       string;
  tempControlled?:    boolean;
}

export interface LoadVehicleCheckResult {
  concern:     boolean;
  severity:    "high" | "medium" | "low" | "none";
  message:     string;
  suggestion?: string;
}

// ── Payload capacity limits by vehicle category (tonnes) ─────────────────────

// Exported (Step 5) so the run-level compatibility helper reuses the same rules
// rather than maintaining a parallel set.
export const PAYLOAD_T: Record<string, number> = {
  van:           0.8,
  luton_van:     0.9,
  pickup:        1.0,
  rigid:         16.0,   // worst-case 26 t GVW
  tractor:       26.0,   // 44 t GVW + trailer
  drawbar:       24.0,
  heavy_haulage: 60.0,
  spmt:          200.0,
  plant:         20.0,
};

// Bodies that provide active/passive temperature control
export const FRIDGE_BODIES = new Set([
  "fridge", "fridge_multi_temp", "fridge_pharma", "insulated",
]);

// Bodies that are NOT suitable for ADR hazardous loads
// (fridge and enclosed box trap fumes — not safe for general ADR)
export const ADR_UNSAFE_BODIES = new Set([
  "fridge", "fridge_multi_temp", "fridge_pharma", "insulated",
  "box", "double_deck_box", "panel", "luton",
]);

// ── Main function (synchronous — no AI) ──────────────────────────────────────

export function checkLoadVehicle(
  input: LoadVehicleCheckInput,
): LoadVehicleCheckResult {
  const weightKg = input.weight ?? 0;
  const weightT  = weightKg / 1000;
  const bodies   = input.bodyTypes ?? [];

  // 1. Weight overload
  if (weightT > 0) {
    const maxT = PAYLOAD_T[input.vehicleCategory] ?? 16;
    if (weightT > maxT) {
      return {
        concern:    true,
        severity:   "high",
        message:    `Load is ${weightT.toFixed(1)} t but this vehicle type carries up to ~${maxT} t.`,
        suggestion: "Use a heavier vehicle category.",
      };
    }
    // Slightly over 80 % capacity — worth flagging
    if (weightT > maxT * 0.9) {
      return {
        concern:    true,
        severity:   "low",
        message:    `Load is ${weightT.toFixed(1)} t — close to the ~${maxT} t limit for this vehicle type.`,
        suggestion: "Check vehicle's actual plated weight before dispatch.",
      };
    }
  }

  // 2. Temperature-controlled goods need a fridge/insulated body
  if (input.tempControlled) {
    const hasFridgeBody = bodies.some(b => FRIDGE_BODIES.has(b));
    if (bodies.length > 0 && !hasFridgeBody) {
      return {
        concern:    true,
        severity:   "high",
        message:    "Temperature-controlled goods need a refrigerated or insulated body — this vehicle doesn't have one.",
        suggestion: "Assign a fridge or insulated body type.",
      };
    }
    // No body types specified — just warn
    if (bodies.length === 0) {
      return {
        concern:    true,
        severity:   "medium",
        message:    "Temperature-controlled goods — confirm this vehicle has a refrigerated or insulated body.",
      };
    }
  }

  // 3. ADR hazardous goods — certain bodies are unsafe
  if (input.hazardClass) {
    const unsafeBodies = bodies.filter(b => ADR_UNSAFE_BODIES.has(b));
    if (unsafeBodies.length > 0) {
      return {
        concern:    true,
        severity:   "high",
        message:    `Hazardous goods (ADR class ${input.hazardClass}) should not be carried in a ${unsafeBodies[0].replace(/_/g, " ")} body — fumes can accumulate in enclosed spaces.`,
        suggestion: "Use a curtain sider or flatbed for ADR loads.",
      };
    }
    // No specific body — advisory flag
    return {
      concern:    true,
      severity:   "medium",
      message:    `Hazardous goods ADR class ${input.hazardClass} — confirm the vehicle has valid ADR certification and the body type is suitable.`,
    };
  }

  // 4. Livestock or live animals — need a livestock body
  const desc = (input.goodsDescription ?? "").toLowerCase();
  const type = (input.goodsType ?? "").toLowerCase();
  if ((desc.includes("live") && (desc.includes("animal") || desc.includes("stock") || desc.includes("cattle") || desc.includes("sheep") || desc.includes("pig")))
      || type.includes("livestock")) {
    const hasLivestockBody = bodies.some(b => b === "livestock");
    if (!hasLivestockBody) {
      return {
        concern:    true,
        severity:   "high",
        message:    "Live animals require a livestock transporter body with ventilation and partitions.",
        suggestion: "Assign a livestock body type.",
      };
    }
  }

  // All checks passed
  return { concern: false, severity: "none", message: "" };
}

// Keep async wrapper for API route compatibility — no network I/O needed
export async function checkLoadVehicleAsync(
  input: LoadVehicleCheckInput,
): Promise<LoadVehicleCheckResult> {
  return checkLoadVehicle(input);
}
