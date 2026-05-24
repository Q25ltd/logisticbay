import { getAnthropicClient } from "../lib/anthropic.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StopAreaHint {
  type:      string;   // "collection" | "delivery"
  areaType?: string;   // "industrial" | "residential" | "rural" | "urban" | "port" | "retail" | "unknown"
  label?:    string;   // e.g. "Trafford Park Industrial Estate"
}

export interface VehicleSuggestionInput {
  weight?:               number;    // kg
  quantity?:             number;
  quantityUnit?:         string;
  goodsType?:            string;
  goodsDescription?:     string;
  tempControlled?:       boolean;
  hazardClass?:          string;
  specialRequirements?:  string[];
  stopCount?:            number;
  stops?:                StopAreaHint[];  // area context for each stop
  // Fleet awareness — pass the body types the company actually has
  fleetBodyTypes?:       string[];  // e.g. ["curtain_sider", "fridge", "flatbed"]
  fleetHasAdr?:          boolean;
}

export interface VehicleSuggestion {
  vehicleCategory:   string;           // van | luton_van | rigid | tractor | drawbar
  suggestedBodyTypes: string[];        // body types from the fleet that suit this load
  reasoning:          string;          // short plain-English sentence shown to the planner
  confidence:         "high" | "medium" | "low";
  fleetWarning?:      string | null;   // set if company fleet cannot fulfil this job
}

// ── Main function ─────────────────────────────────────────────────────────────

export async function suggestVehicle(
  input: VehicleSuggestionInput,
): Promise<VehicleSuggestion> {

  const client = getAnthropicClient();

  const lines: string[] = [];
  if (input.weight != null)           lines.push(`Weight: ${input.weight} kg (${(input.weight / 1000).toFixed(2)} tonnes)`);
  if (input.quantity != null)         lines.push(`Quantity: ${input.quantity} ${input.quantityUnit ?? "units"}`);
  if (input.goodsType)                lines.push(`Goods type: ${input.goodsType}`);
  if (input.goodsDescription)         lines.push(`Description: ${input.goodsDescription}`);
  if (input.tempControlled)           lines.push(`Temperature controlled: yes`);
  if (input.hazardClass)              lines.push(`Hazardous goods: class ${input.hazardClass}`);
  if (input.specialRequirements?.length) lines.push(`Special: ${input.specialRequirements.join(", ")}`);
  if (input.stopCount != null)        lines.push(`Number of stops: ${input.stopCount}`);

  const loadBlock = lines.length > 0 ? lines.join("\n") : "No load details provided.";

  // Build stop area block
  let stopBlock = "";
  if (input.stops?.length) {
    const stopLines = input.stops.map((s, i) => {
      const area = (s.areaType && s.areaType !== "unknown")
        ? ` — ${s.areaType}${s.label ? ` (${s.label})` : ""}`
        : "";
      return `  Stop ${i + 1}: ${s.type}${area}`;
    });
    stopBlock = `\nSTOP AREAS:\n${stopLines.join("\n")}`;
  }

  // Build fleet body-type block
  let fleetBlock = "";
  if (input.fleetBodyTypes?.length) {
    fleetBlock = `\nCOMPANY FLEET BODY TYPES AVAILABLE:\n${input.fleetBodyTypes.join(", ")}\nOnly suggest body types from this list. If none suit the load, return an empty array and set fleetWarning.`;
  } else {
    fleetBlock = `\nCOMPANY FLEET BODY TYPES AVAILABLE: unknown — suggest the ideal body type(s) regardless.`;
  }

  const systemPrompt = `You are a UK road freight expert. Given a load description, stop locations, and the company's available fleet body types, recommend the most appropriate vehicle category AND body type.
Return ONLY a valid JSON object — no markdown, no explanation.`;

  const userPrompt = `VEHICLE CATEGORIES (pick exactly one):
  van        — light goods vehicle ≤3.5t GVW; max ~500 kg payload; 1–2 standard pallets
  luton_van  — box van ≤3.5t; ~700 kg payload; up to 3 pallets
  rigid      — HGV without trailer; 7.5t–26t GVW; 5–15t payload; up to 26 pallets
  tractor    — articulated lorry (artic); 44t GVW; up to 26t payload; 26–33 pallets
  drawbar    — rigid truck + drawbar trailer; 44t GVW; similar capacity to tractor

BODY TYPE SELECTION RULES:
- Temperature-controlled loads MUST use: fridge | fridge_multi_temp | fridge_pharma | insulated
- Hazardous ADR loads prefer: curtain_sider | flatbed (never fridge or box unless explicitly ADR-rated)
- Palletised general freight: curtain_sider is the most common choice; box is also fine
- Steel / machinery / oversized: flatbed | step_frame | low_loader
- Bulk dry: walking_floor | bulk_tipper
- Liquids / chemicals: tanker_chemical | tanker_food
- If the company has a suitable body type in their fleet, prefer it over an ideal type they don't have.
- If NO available fleet body type suits the load, return an empty suggestedBodyTypes array and set fleetWarning.
- Only include body types that genuinely match — don't list everything available.

GENERAL NOTES:
- Pallet count: 1 euro-pallet ≈ 300 kg average; a rigid fits up to ~26 pallets; an artic fits up to ~33.
- When weight and pallet count conflict, use whichever requires the larger vehicle.
- Residential and rural areas often have narrow roads — prefer smaller vehicles unless weight demands larger.
- Industrial, port and distribution centre stops typically allow full-size artics.
- If very little data is given, set confidence "low".

LOAD DETAILS:
${loadBlock}${stopBlock}${fleetBlock}

RESPONSE SCHEMA:
{
  "vehicleCategory": "van"|"luton_van"|"rigid"|"tractor"|"drawbar",
  "suggestedBodyTypes": ["curtain_sider"] (array of 1–2 body type values from fleet, or [] if none fit),
  "reasoning": "one concise sentence explaining the choice (max 20 words)",
  "confidence": "high"|"medium"|"low",
  "fleetWarning": null | "short sentence if company fleet cannot handle this job"
}`;

  const response = await client.messages.create({
    model:      "claude-haiku-4-5",
    max_tokens: 256,
    system:     systemPrompt,
    messages:   [{ role: "user", content: userPrompt }],
  });

  const raw = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
  const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("AI returned an unexpected response — please try again");
  }

  const VALID_CATEGORIES = new Set(["van", "luton_van", "rigid", "tractor", "drawbar"]);
  const cat = typeof parsed.vehicleCategory === "string" && VALID_CATEGORIES.has(parsed.vehicleCategory)
    ? parsed.vehicleCategory
    : "rigid"; // safe default

  const reasoning = typeof parsed.reasoning === "string" && parsed.reasoning.trim()
    ? parsed.reasoning.trim()
    : "Vehicle selected based on load details.";

  const confidence =
    parsed.confidence === "high" || parsed.confidence === "medium" || parsed.confidence === "low"
      ? parsed.confidence
      : "medium";

  // Validate suggested body types against the fleet (if provided)
  const validBodyTypes = new Set(input.fleetBodyTypes ?? []);
  const rawBodyTypes = Array.isArray(parsed.suggestedBodyTypes) ? parsed.suggestedBodyTypes : [];
  const suggestedBodyTypes = input.fleetBodyTypes?.length
    ? rawBodyTypes.filter((bt): bt is string => typeof bt === "string" && validBodyTypes.has(bt))
    : rawBodyTypes.filter((bt): bt is string => typeof bt === "string");

  const fleetWarning = typeof parsed.fleetWarning === "string" && parsed.fleetWarning.trim()
    ? parsed.fleetWarning.trim()
    : null;

  return { vehicleCategory: cat, suggestedBodyTypes, reasoning, confidence, fleetWarning };
}

// ── Trailer suggestion for planning board ─────────────────────────────────────

export interface TrailerOption {
  id:           number;
  registration: string;
  trailerType:  string;   // e.g. "curtainsider", "flatbed", "fridge", "box"
  bodyType:     string;   // e.g. "curtainsider", "fridge", "flatbed", "box"
  status:       string;
}

export interface TrailerSuggestion {
  trailerId:            number | null;
  trailerRegistration:  string | null;
  reasoning:            string;
  confidence:           "high" | "medium" | "low";
}

export async function suggestTrailerForRun(input: {
  weight?:             number;
  quantity?:           number;
  quantityUnit?:       string;
  goodsType?:          string;
  tempControlled?:     boolean;
  hazardClass?:        string;
  stopCount?:          number;
  availableTrailers:   TrailerOption[];
}): Promise<TrailerSuggestion> {

  if (!input.availableTrailers.length) {
    return {
      trailerId:           null,
      trailerRegistration: null,
      reasoning:           "No trailers available in fleet.",
      confidence:          "low",
    };
  }

  const client = getAnthropicClient();

  const loadLines: string[] = [];
  if (input.weight != null)       loadLines.push(`Weight: ${input.weight} kg (${(input.weight / 1000).toFixed(2)} t)`);
  if (input.quantity != null)     loadLines.push(`Quantity: ${input.quantity} ${input.quantityUnit ?? "units"}`);
  if (input.goodsType)            loadLines.push(`Goods type: ${input.goodsType}`);
  if (input.tempControlled)       loadLines.push(`Temperature controlled: yes`);
  if (input.hazardClass)          loadLines.push(`Hazardous goods: class ${input.hazardClass}`);
  if (input.stopCount != null)    loadLines.push(`Number of stops: ${input.stopCount}`);
  const loadBlock = loadLines.length > 0 ? loadLines.join("\n") : "No load details provided.";

  const trailerRows = input.availableTrailers
    .map(t => `  id=${t.id}  reg=${t.registration}  type=${t.trailerType}  body=${t.bodyType}  status=${t.status}`)
    .join("\n");

  const systemPrompt = `You are a UK road freight expert. Given a load description and a list of available trailers, choose the most suitable trailer. Return ONLY a valid JSON object — no markdown, no explanation.`;

  const userPrompt = `LOAD DETAILS:
${loadBlock}

AVAILABLE TRAILERS:
${trailerRows}

SELECTION RULES:
- Temperature-controlled goods MUST use a fridge/reefer trailer.
- Hazardous goods MUST use an ADR-suitable trailer (flatbed or curtainsider — never fridge or box van).
- If no suitable trailer exists, return trailerId null.
- Prefer a curtainsider for general palletised goods.
- Prefer a flatbed for machinery, steel, oversized loads.
- Prefer a fridge/reefer for perishables.
- Choose the trailer whose type and body best match the load; do not pick a trailer merely by id order.
- Do not choose a trailer with status "disposed" or "off_road".

RESPONSE SCHEMA:
{
  "trailerId": <number or null>,
  "trailerRegistration": <string or null>,
  "reasoning": "one concise sentence (max 20 words)",
  "confidence": "high"|"medium"|"low"
}`;

  const response = await client.messages.create({
    model:      "claude-haiku-4-5",
    max_tokens: 256,
    system:     systemPrompt,
    messages:   [{ role: "user", content: userPrompt }],
  });

  const raw = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
  const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("AI returned an unexpected response — please try again");
  }

  // Validate trailerId is actually in the available list
  const validIds = new Set(input.availableTrailers.map(t => t.id));
  const rawId    = typeof parsed.trailerId === "number" ? parsed.trailerId : null;
  const trailerId = rawId !== null && validIds.has(rawId) ? rawId : null;
  const trailer = trailerId !== null ? input.availableTrailers.find(t => t.id === trailerId) : null;

  const reasoning = typeof parsed.reasoning === "string" && parsed.reasoning.trim()
    ? parsed.reasoning.trim()
    : "Trailer selected based on load type.";

  const confidence =
    parsed.confidence === "high" || parsed.confidence === "medium" || parsed.confidence === "low"
      ? parsed.confidence
      : "medium";

  return {
    trailerId:           trailer?.id ?? null,
    trailerRegistration: trailer?.registration ?? null,
    reasoning,
    confidence,
  };
}
