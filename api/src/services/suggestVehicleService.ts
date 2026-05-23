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
}

export interface VehicleSuggestion {
  vehicleCategory: string;          // van | luton_van | rigid | tractor | drawbar
  reasoning:       string;          // short plain-English sentence shown to the planner
  confidence:      "high" | "medium" | "low";
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

  const systemPrompt = `You are a UK road freight expert. Given a load description and stop locations, recommend the most appropriate vehicle category.
Return ONLY a valid JSON object — no markdown, no explanation.`;

  const userPrompt = `VEHICLE CATEGORIES (pick exactly one):
  van        — light goods vehicle ≤3.5t GVW; max ~500 kg payload; 1–2 standard pallets
  luton_van  — box van ≤3.5t; ~700 kg payload; up to 3 pallets
  rigid      — HGV without trailer; 7.5t–26t GVW; 5–15t payload; up to 26 pallets
  tractor    — articulated lorry (artic); 44t GVW; up to 26t payload; 26–33 pallets
  drawbar    — rigid truck + drawbar trailer; 44t GVW; similar capacity to tractor

NOTES:
- Temperature-controlled loads usually need a fridge rigid or fridge artic.
- Pallet count: 1 euro-pallet ≈ 300 kg average; a rigid fits up to ~26 pallets; an artic fits up to ~33.
- When weight and pallet count conflict, use whichever requires the larger vehicle.
- Residential and rural areas often have narrow roads — prefer smaller vehicles unless weight demands larger.
- Industrial, port and distribution centre stops typically allow full-size artics.
- If very little data is given, set confidence "low".

LOAD DETAILS:
${loadBlock}${stopBlock}

RESPONSE SCHEMA:
{
  "vehicleCategory": "van"|"luton_van"|"rigid"|"tractor"|"drawbar",
  "reasoning": "one concise sentence explaining the choice (max 20 words)",
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

  return { vehicleCategory: cat, reasoning, confidence };
}
