import { getAnthropicClient } from "../lib/anthropic.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ParsedStop {
  type:               "collection" | "delivery";
  siteName?:          string;
  street?:            string;
  addressLine2?:      string;
  town?:              string;
  postcode?:          string;
  country?:           string;
  /** YYYY-MM-DD */
  date?:              string;
  /** HH:MM  — earliest the driver should arrive */
  earliestArrivalTime?: string;
  /** HH:MM  — latest the driver should arrive  */
  latestArrivalTime?:   string;
  /** HH:MM  — specific booked time if stated   */
  bookedTime?:          string;
  contactName?:         string;
  contactPhone?:        string;
  contactEmail?:        string;
  referenceNumber?:     string;
  bookingRequired?:     boolean;
  bookingRef?:          string;
  stopNotes?:           string;
  savedLocationId?:     number;
}

export interface ParsedJobData {
  customerName?:         string;
  bookingContactName?:   string;
  bookingContactPhone?:  string;
  bookingContactEmail?:  string;
  customerRef?:          string;
  goodsType?:            string;
  goodsDescription?:     string;
  quantity?:             number;
  quantityUnit?:         string;
  weight?:               number;
  tempControlled?:       boolean;
  hazardClass?:          string;
  vehicleCategory?:      string;
  specialRequirements?:  string[];
  stops?:                ParsedStop[];
  confidence:            "high" | "medium" | "low";
  warnings:              string[];
}

// ── Saved location hint passed to Claude ──────────────────────────────────────

export interface SavedLocationHint {
  id:       number;
  siteName: string;
  street:   string | null;
  town:     string | null;
  postcode: string | null;
}

// ── Main parse function ───────────────────────────────────────────────────────

export async function parseTransportRequest(
  text:      string,
  todayISO:  string,       // YYYY-MM-DD
  locations: SavedLocationHint[],
): Promise<ParsedJobData> {

  const client = getAnthropicClient();

  const locationsBlock = locations.length > 0
    ? `\nKNOWN SAVED LOCATIONS (match against these if possible):\n${
        locations.map(l =>
          `  id=${l.id}  "${l.siteName}"  ${[l.street, l.town, l.postcode].filter(Boolean).join(", ")}`
        ).join("\n")
      }\nIf a stop address clearly matches one of these, include "savedLocationId": <id>.\n`
    : "";

  const systemPrompt = `You are a logistics data extraction assistant for a UK transport company.
Extract structured job data from free-text transport requests (emails, WhatsApp messages, phone notes).
Return ONLY a valid JSON object — no markdown, no code fences, no explanation.
Be conservative: only include fields you are confident about. Omit uncertain fields entirely.`;

  const userPrompt = `Today's date: ${todayISO} (use this to resolve relative dates like "tomorrow", "Thursday", "next week")
${locationsBlock}
FIELD REFERENCE:
goodsType — pick ONE of: pallets, roll_cages, machinery, building_materials, food_refrigerated, bulk_material, liquid_bulk, steel_long, vehicles, containers, general, other
quantityUnit — pick ONE of: pallets, roll_cages, tonnes, kg, bags, items, loads, litres, cubic_metres, other
vehicleCategory — pick ONE only if clearly stated or strongly implied by load size:
  van (≤3.5t), luton_van (3.5t box), rigid (HGV no trailer), tractor (artic), drawbar (rigid+trailer)
weight — always in kg (convert if stated in tonnes: multiply by 1000)
specialRequirements — array, pick from: fragile, dangerous_goods, high_value, oversized, secure_transport_required
stops — order by sequence (collection before delivery); each stop:
  type: "collection" or "delivery"
  date: YYYY-MM-DD (resolve from today)
  earliestArrivalTime: HH:MM  ("from 8am" → "08:00", "after 9" → "09:00")
  latestArrivalTime: HH:MM    ("before 2pm" → "14:00", "by 17:00" → "17:00")
  bookedTime: HH:MM           (only if a specific booked slot is stated, e.g. "booked for 10:30")
  country: default "GB" unless stated otherwise

RESPONSE SCHEMA:
{
  "customerName": string,
  "bookingContactName": string,
  "bookingContactPhone": string,
  "bookingContactEmail": string,
  "customerRef": string,
  "goodsType": string,
  "goodsDescription": string,
  "quantity": number,
  "quantityUnit": string,
  "weight": number,
  "tempControlled": boolean,
  "hazardClass": string,
  "vehicleCategory": string,
  "specialRequirements": string[],
  "stops": [
    {
      "type": "collection"|"delivery",
      "siteName": string,
      "street": string,
      "addressLine2": string,
      "town": string,
      "postcode": string,
      "country": string,
      "date": "YYYY-MM-DD",
      "earliestArrivalTime": "HH:MM",
      "latestArrivalTime": "HH:MM",
      "bookedTime": "HH:MM",
      "contactName": string,
      "contactPhone": string,
      "contactEmail": string,
      "referenceNumber": string,
      "bookingRequired": boolean,
      "bookingRef": string,
      "stopNotes": string,
      "savedLocationId": number
    }
  ],
  "confidence": "high"|"medium"|"low",
  "warnings": string[]
}

confidence rules:
  "high"   — all key fields extracted clearly (addresses, dates, goods, quantity)
  "medium" — most fields clear but one or two ambiguous
  "low"    — partial data only, significant guesswork

warnings — short plain-English notes about anything ambiguous or missing that the planner should check.
Examples: "No delivery address found", "Date unclear — assumed next Thursday", "Weight not stated"

MESSAGE TO PARSE:
${text}`;

  const response = await client.messages.create({
    model:      "claude-haiku-4-5",
    max_tokens: 1024,
    system:     systemPrompt,
    messages:   [{ role: "user", content: userPrompt }],
  });

  const raw = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";

  // Strip accidental markdown code fences if Claude wraps the JSON
  const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("AI returned an unexpected response — please try again");
  }

  // Normalise and return typed result
  return {
    customerName:        str(parsed.customerName),
    bookingContactName:  str(parsed.bookingContactName),
    bookingContactPhone: str(parsed.bookingContactPhone),
    bookingContactEmail: str(parsed.bookingContactEmail),
    customerRef:         str(parsed.customerRef),
    goodsType:           str(parsed.goodsType),
    goodsDescription:    str(parsed.goodsDescription),
    quantity:            num(parsed.quantity),
    quantityUnit:        str(parsed.quantityUnit),
    weight:              num(parsed.weight),
    tempControlled:      bool(parsed.tempControlled),
    hazardClass:         str(parsed.hazardClass),
    vehicleCategory:     str(parsed.vehicleCategory),
    specialRequirements: strArr(parsed.specialRequirements),
    stops:               parseStops(parsed.stops),
    confidence:          (parsed.confidence === "high" || parsed.confidence === "medium" || parsed.confidence === "low")
                           ? parsed.confidence : "medium",
    warnings:            strArr(parsed.warnings) ?? [],
  };
}

// ── Coercion helpers ──────────────────────────────────────────────────────────

function str(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  return undefined;
}
function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  return undefined;
}
function bool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  return undefined;
}
function strArr(v: unknown): string[] | undefined {
  if (Array.isArray(v) && v.length > 0) return v.filter(x => typeof x === "string") as string[];
  return undefined;
}
function parseStops(v: unknown): ParsedStop[] | undefined {
  if (!Array.isArray(v) || v.length === 0) return undefined;
  return v
    .filter(s => s && (s.type === "collection" || s.type === "delivery"))
    .map(s => ({
      type:               s.type as "collection" | "delivery",
      siteName:           str(s.siteName),
      street:             str(s.street),
      addressLine2:       str(s.addressLine2),
      town:               str(s.town),
      postcode:           str(s.postcode),
      country:            str(s.country) ?? "GB",
      date:               str(s.date),
      earliestArrivalTime: str(s.earliestArrivalTime),
      latestArrivalTime:  str(s.latestArrivalTime),
      bookedTime:         str(s.bookedTime),
      contactName:        str(s.contactName),
      contactPhone:       str(s.contactPhone),
      contactEmail:       str(s.contactEmail),
      referenceNumber:    str(s.referenceNumber),
      bookingRequired:    bool(s.bookingRequired),
      bookingRef:         str(s.bookingRef),
      stopNotes:          str(s.stopNotes),
      savedLocationId:    typeof s.savedLocationId === "number" ? s.savedLocationId : undefined,
    }));
}
