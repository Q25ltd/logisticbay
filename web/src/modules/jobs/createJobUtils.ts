import type { JobStop } from "../../types";
import type { StopState } from "./createJobTypes";

// ── Helper date functions ─────────────────────────────────────────────────────

export const today = () => new Date().toISOString().split("T")[0];
export const nowDisplay = () =>
  new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

// ── Stop factory ──────────────────────────────────────────────────────────────

export function makeStop(): StopState {
  return {
    id: Math.random().toString(36).slice(2),
    collapsed: false,
    showOptional: false,
    stopType: "collection",
    locationQuery: "",
    savedLocationId: null,
    siteName: "",
    street: "",
    town: "",
    postcode: "",
    country: "United Kingdom",
    lat: "",
    lng: "",
    unitBuilding: "",
    addressLine2: "",
    countyRegion: "",
    date: today(),
    timeType: "anytime",
    exactTime: "",
    windowStart: "",
    windowEnd: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    refNumber: "",
    bookingRequired: false,
    bookingRef: "",
    openingHours: "",
    locationType: "",
    driverNotes: "",
    navigationInstructions: "",
    numPallets: "",
    quantity: "",
    earliestArrival: "",
    unloadingTime: "",
    internalNotes: "",
  };
}

// ── Edit-mode helpers ─────────────────────────────────────────────────────────

export function parseISOToDateAndTime(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: today(), time: "" };
  // Stored as "${date}T${time}:00.000Z" so extract the literal parts directly
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return m ? { date: m[1], time: m[2] } : { date: today(), time: "" };
}

export function jobStopToStopState(stop: JobStop): StopState {
  let timeType: StopState["timeType"] = "anytime";
  let date = today();
  let exactTime = "";
  let windowStart = "";
  let windowEnd = "";

  if (stop.bookedTime) {
    const p = parseISOToDateAndTime(stop.bookedTime);
    timeType = "exact";
    date = p.date;
    exactTime = p.time;
  } else if (stop.timeWindowStart) {
    const p = parseISOToDateAndTime(stop.timeWindowStart);
    timeType = "window";
    date = p.date;
    windowStart = p.time;
    windowEnd = stop.timeWindowEnd ? parseISOToDateAndTime(stop.timeWindowEnd).time : "";
  }

  function minsToHHMM(mins: number | null | undefined): string {
    if (mins == null) return "";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  return {
    id: Math.random().toString(36).slice(2),
    collapsed: true,
    showOptional: false,
    stopType: (stop.type === "pickup" || stop.type === "collection") ? "collection" : "delivery",
    locationQuery: stop.locationTextSnapshot || stop.siteName || "",
    savedLocationId: stop.savedLocationId ?? null,
    siteName: stop.siteName || "",
    street: stop.street || "",
    town: stop.town || "",
    postcode: stop.postcode || "",
    country: "United Kingdom",
    lat: stop.lat != null ? String(stop.lat) : "",
    lng: stop.lng != null ? String(stop.lng) : "",
    unitBuilding: stop.unitName || "",
    addressLine2: "",
    countyRegion: "",
    date,
    timeType,
    exactTime,
    windowStart,
    windowEnd,
    contactName: stop.contactName || "",
    contactPhone: stop.contactPhone || "",
    contactEmail: stop.contactEmail || "",
    refNumber: stop.referenceNumber || "",
    bookingRequired: stop.bookingRequired ?? false,
    bookingRef: stop.bookingRef || "",
    openingHours: stop.openingHours || "",
    locationType: stop.locationType || "",
    driverNotes: stop.instructions || "",
    navigationInstructions: stop.navigationInstructions || "",
    numPallets: stop.numPallets != null ? String(stop.numPallets) : "",
    quantity: "",
    earliestArrival: minsToHHMM(stop.earliestArrivalMinutes),
    unloadingTime: stop.unloadingAllowanceMinutes != null ? String(stop.unloadingAllowanceMinutes) : "",
    internalNotes: stop.internalNotes || "",
  };
}

// ── Validation ────────────────────────────────────────────────────────────────

export function stopComplete(s: StopState) {
  const addr = s.siteName.trim() && s.street.trim() && s.town.trim() && s.postcode.trim();
  const time =
    s.timeType === "exact"  ? !!s.exactTime :
    s.timeType === "window" ? !!(s.windowStart && s.windowEnd) : true;
  return !!(addr && s.date && time);
}

// ── Time utilities ────────────────────────────────────────────────────────────

export function toMins(t: string): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return isNaN(h) || isNaN(m) ? null : h * 60 + m;
}

export function fmtMins(m: number) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return h > 0 ? `${h}h ${min}m` : `${min}m`;
}
