/**
 * AI-powered load ↔ vehicle compatibility check.
 *
 * Given the goods details and the planner's chosen vehicle/trailer,
 * Claude reads the description and returns a plain-English assessment.
 * This is advisory only — the planner always makes the final call.
 */

import { getAnthropicClient } from "../lib/anthropic.js";

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
  concern:     boolean;                 // true = planner should read this
  severity:    "high" | "medium" | "low" | "none";
  message:     string;                  // plain English, 1–2 sentences max
  suggestion?: string;                  // brief alternative (only when concern)
}

// ── Vehicle descriptions sent to Claude ───────────────────────────────────────

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  van:          "Van (light goods, ≤3.5t GVW, ~500 kg payload)",
  luton_van:    "Luton van (box van ≤3.5t, ~700 kg payload)",
  pickup:       "Pickup / 4×4 (open bed, ~900 kg payload)",
  rigid:        "Rigid (no trailer, 7.5–26t GVW, up to ~16t payload)",
  tractor:      "Artic tractor unit (44t GVW with trailer, up to ~26t payload)",
  drawbar:      "Drawbar (rigid truck + drawbar trailer, ~44t GVW)",
  heavy_haulage:"Heavy haulage tractor (STGO, abnormal loads)",
  spmt:         "Self-propelled modular transporter (SPMT)",
  plant:        "Plant / off-highway vehicle",
};

const BODY_DESCRIPTIONS: Record<string, string> = {
  curtain_sider:     "Curtain sider / tautliner",
  double_deck_curtain:"Double-deck curtain sider",
  box:               "Box body",
  double_deck_box:   "Double-deck box",
  panel:             "Panel van body",
  luton:             "Luton (overcab box)",
  flatbed:           "Flatbed",
  dropside:          "Dropside",
  tipper:            "Tipper",
  tanker_food:       "Food tanker (milk / food-grade liquid)",
  tanker_fuel:       "Fuel tanker (petrol / diesel)",
  tanker_chemical:   "Chemical tanker (ADR — hazardous liquids)",
  tanker_water:      "Water tanker / bowser",
  tanker_vacuum:     "Vacuum tanker (waste / slurry)",
  tanker_bitumen:    "Bitumen tanker (heated asphalt)",
  tanker_other:      "Tanker — other",
  fridge:            "Refrigerated (fridge) body",
  fridge_multi_temp: "Multi-temperature fridge",
  fridge_pharma:     "Pharmaceutical-validated fridge",
  insulated:         "Insulated (no active cooling)",
  low_loader:        "Low loader",
  step_frame:        "Step-frame trailer",
  coil_carrier:      "Coil carrier (steel coils)",
  glass_inloader:    "Glass inloader",
  livestock:         "Livestock transporter",
  car_transporter:   "Car transporter",
  skeletal_20:       "Skeletal trailer — 20ft container",
  skeletal_40:       "Skeletal trailer — 40ft container",
};

// ── Main function ─────────────────────────────────────────────────────────────

export async function checkLoadVehicle(
  input: LoadVehicleCheckInput,
): Promise<LoadVehicleCheckResult> {

  const client = getAnthropicClient();

  // Build a compact load summary
  const loadLines: string[] = [];
  if (input.goodsType)         loadLines.push(`Type: ${input.goodsType}`);
  if (input.goodsDescription)  loadLines.push(`Description: ${input.goodsDescription}`);
  if (input.weight != null)    loadLines.push(`Weight: ${input.weight.toLocaleString()} kg`);
  if (input.quantity != null)  loadLines.push(`Quantity: ${input.quantity} ${input.quantityUnit ?? "units"}`);
  if (input.hazardClass)       loadLines.push(`ADR hazard class: ${input.hazardClass}`);
  if (input.tempControlled)    loadLines.push(`Temperature controlled: yes`);

  const loadBlock = loadLines.length > 0
    ? loadLines.join("\n")
    : "No load details provided.";

  // Build a vehicle summary
  const catDesc   = CATEGORY_DESCRIPTIONS[input.vehicleCategory] ?? input.vehicleCategory;
  const bodyDescs = (input.bodyTypes ?? [])
    .map(bt => BODY_DESCRIPTIONS[bt] ?? bt)
    .join(", ");
  const vehicleBlock = bodyDescs
    ? `${catDesc}\nBody type: ${bodyDescs}`
    : catDesc;

  const systemPrompt =
    `You are a UK road freight expert reviewing a vehicle/trailer selection for a load. ` +
    `Be concise and practical. If there is a problem, explain it clearly in one or two sentences ` +
    `that a transport planner would immediately understand — no jargon, no hedging. ` +
    `Return ONLY valid JSON, no markdown.`;

  const userPrompt =
    `LOAD:\n${loadBlock}\n\n` +
    `CHOSEN VEHICLE / TRAILER:\n${vehicleBlock}\n\n` +
    `Is this vehicle / trailer combination suitable for this load?\n\n` +
    `Return this exact JSON structure:\n` +
    `{\n` +
    `  "concern": true or false,\n` +
    `  "severity": "high" | "medium" | "low" | "none",\n` +
    `  "message": "one or two plain-English sentences — tell the planner exactly what the issue is",\n` +
    `  "suggestion": "brief alternative in 5–10 words (only include this key when concern is true)"\n` +
    `}\n\n` +
    `severity guide:\n` +
    `  high   — load would be damaged, spilled, or is illegal / unsafe\n` +
    `  medium — likely wrong vehicle but job could still run with care\n` +
    `  low    — minor mismatch or something worth noting\n` +
    `  none   — selection looks fine (set concern: false)`;

  const response = await client.messages.create({
    model:      "claude-haiku-4-5",
    max_tokens: 200,
    system:     systemPrompt,
    messages:   [{ role: "user", content: userPrompt }],
  });

  const raw = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
  const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    // If Claude returns something unparseable, fail open — return no concern
    return { concern: false, severity: "none", message: "" };
  }

  const concern   = parsed.concern === true;
  const severity  =
    parsed.severity === "high"   ? "high"   :
    parsed.severity === "medium" ? "medium" :
    parsed.severity === "low"    ? "low"    : "none";
  const message   = typeof parsed.message   === "string" ? parsed.message.trim()   : "";
  const suggestion= typeof parsed.suggestion === "string" ? parsed.suggestion.trim() : undefined;

  return { concern, severity, message, ...(suggestion ? { suggestion } : {}) };
}
