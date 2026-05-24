/**
 * RepeatJobModal — creates a new job by copying an existing one.
 *
 * Per-stop dates: the modal preserves the original day-gap between stops.
 * e.g. if the source job collected on day 0 and delivered on day 1, the
 * repeat defaults collection to the chosen date and delivery to date+1.
 * The user can override any stop's date independently.
 * When the main "Collection / start date" changes all stop dates shift
 * by the same delta so relative gaps are maintained.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { jobsApi } from "../../api/jobs";
import type { PlannedJob } from "../../types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000,
  );
}

// Human-readable unit labels
const UNIT_LABELS: Record<string, string> = {
  pallets:      "Pallets",
  roll_cages:   "Roll cages",
  tonnes:       "Tonnes",
  kg:           "kg",
  bags:         "Bags",
  items:        "Items",
  loads:        "Loads",
  litres:       "Litres",
  cubic_metres: "m³",
};

function unitLabel(u: string | null | undefined): string {
  if (!u) return "";
  return UNIT_LABELS[u] ?? u;
}

interface StopRow {
  sequenceNumber:   number;
  type:             string;
  siteName:         string | null;
  town:             string | null;
  postcode:         string | null;
  stopDate:         string;   // YYYY-MM-DD — each stop can have its own date
  timeWindowStart:  string;   // HH:MM or ""
  timeWindowEnd:    string;
  bookedTime:       string;
  referenceNumber:  string;
  bookingRef:       string;
  bookingRequired:  boolean;
  quantityRequired: string;   // numeric string or ""
  quantityUnit:     string;
}

interface Props {
  job:     PlannedJob;
  onClose: () => void;
}

function toHHMM(dt: string | null | undefined): string {
  if (!dt) return "";
  try {
    const d = new Date(dt);
    const h = String(d.getUTCHours()).padStart(2, "0");
    const m = String(d.getUTCMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  } catch { return ""; }
}

function toDateStr(dt: string | null | undefined): string | null {
  if (!dt) return null;
  try { return new Date(dt).toISOString().slice(0, 10); }
  catch { return null; }
}

export default function RepeatJobModal({ job, onClose }: Props) {
  const navigate = useNavigate();
  const [saving,   setSaving]  = useState(false);
  const [error,    setError]   = useState("");
  const [date,     setDate]    = useState(today());
  const [custRef,  setCustRef] = useState(job.customerRef ?? "");
  const [quantity, setQuantity] = useState(job.quantity != null ? String(job.quantity) : "");
  const [weight,   setWeight]  = useState(job.weight   != null ? String(job.weight)   : "");

  // Compute the "base date" from the earliest stop datetime in the source job,
  // then derive each stop's offset in days from that base.
  const [stops, setStops] = useState<StopRow[]>(() => {
    const sourceDates = (job.stops ?? [])
      .map(s => toDateStr(s.timeWindowStart))
      .filter((d): d is string => d !== null)
      .sort();
    const baseSourceDate = sourceDates[0] ?? null; // earliest original stop date

    return (job.stops ?? []).map(s => {
      const origDate = toDateStr(s.timeWindowStart);
      let stopDate = today(); // default: same as main date
      if (baseSourceDate && origDate) {
        const offset = daysBetween(baseSourceDate, origDate);
        stopDate = addDays(today(), offset);
      }
      return {
        sequenceNumber:   s.sequenceNumber,
        type:             s.type ?? "delivery",
        siteName:         s.siteName  ?? null,
        town:             s.town      ?? null,
        postcode:         s.postcode  ?? null,
        stopDate,
        timeWindowStart:  toHHMM(s.timeWindowStart),
        timeWindowEnd:    toHHMM(s.timeWindowEnd),
        bookedTime:       toHHMM(s.bookedTime),
        referenceNumber:  "",
        bookingRef:       "",
        bookingRequired:  s.bookingRequired ?? false,
        quantityRequired: s.quantityRequired != null ? String(s.quantityRequired) : "",
        quantityUnit:     s.quantityUnit ?? job.quantityUnit ?? "",
      };
    });
  });

  function updateStop(seq: number, patch: Partial<StopRow>) {
    setStops(prev => prev.map(s => s.sequenceNumber === seq ? { ...s, ...patch } : s));
  }

  /** When the main date changes, shift all stop dates by the same delta. */
  function handleMainDateChange(newDate: string) {
    if (!newDate) { setDate(newDate); return; }
    const delta = daysBetween(date, newDate);
    if (delta !== 0) {
      setStops(prev => prev.map(s => ({
        ...s,
        stopDate: addDays(s.stopDate, delta),
      })));
    }
    setDate(newDate);
  }

  function buildDateTime(dateStr: string, timeStr: string): string | undefined {
    if (!timeStr || !dateStr) return undefined;
    return `${dateStr}T${timeStr}:00.000Z`;
  }

  async function handleCreate() {
    if (!date) { setError("Please select a date."); return; }

    // Validate all stop dates are set
    const missingDates = stops.filter(s => !s.stopDate);
    if (missingDates.length > 0) {
      setError("Please set a date for every stop.");
      return;
    }

    // Booking refs are required for stops that need them
    const missingRefs = stops.filter(s => s.bookingRequired && !s.bookingRef.trim());
    if (missingRefs.length > 0) {
      setError(
        `Booking reference required for: ${missingRefs.map(s =>
          `${s.type === "collection" ? "Collection" : "Delivery"} ${s.sequenceNumber}`
        ).join(", ")}`
      );
      return;
    }

    setSaving(true); setError("");
    try {
      const newJob = await jobsApi.repeat(job.id, {
        plannedDate: date,
        customerRef: custRef.trim() || undefined,
        quantity:    quantity ? parseFloat(quantity) : undefined,
        weight:      weight   ? parseFloat(weight)   : undefined,
        stops: stops.map(s => ({
          sequenceNumber:   s.sequenceNumber,
          timeWindowStart:  buildDateTime(s.stopDate, s.timeWindowStart),
          timeWindowEnd:    buildDateTime(s.stopDate, s.timeWindowEnd),
          bookedTime:       buildDateTime(s.stopDate, s.bookedTime),
          referenceNumber:  s.referenceNumber.trim() || undefined,
          bookingRef:       s.bookingRef.trim()      || undefined,
          quantityRequired: s.quantityRequired ? parseFloat(s.quantityRequired) : undefined,
        })),
      });
      onClose();
      navigate(`/app/jobs/${newJob.id}`);
    } catch (e: unknown) {
      setError((e as Error).message ?? "Something went wrong — please try again.");
    } finally {
      setSaving(false);
    }
  }

  const jobUnit = unitLabel(job.quantityUnit);

  // Are any stops on a different date from the main date?
  const isMultiDay = stops.some(s => s.stopDate !== date);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-primary">Repeat this job</h2>
            <p className="text-xs text-muted mt-0.5">
              All details copy from job #{job.id} — change only what's different this time
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-primary hover:bg-slate-100 transition-colors text-lg">×</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</div>
          )}

          {/* Main / collection date */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-1">
              {stops.some(s => s.type === "collection") ? "Collection date" : "Job date"} *
            </label>
            <input
              type="date"
              className="input w-full"
              value={date}
              onChange={e => handleMainDateChange(e.target.value)}
            />
            {isMultiDay && (
              <p className="text-xs text-blue-600 mt-1">
                ℹ Delivery date(s) adjusted automatically — check below
              </p>
            )}
          </div>

          {/* Customer ref */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-1">Customer reference</label>
            <input type="text" className="input w-full" placeholder="e.g. ORD-2026-1234"
              value={custRef} onChange={e => setCustRef(e.target.value)} />
          </div>

          {/* Quantity + weight */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-1">
                Quantity{jobUnit ? ` (${jobUnit})` : ""}
              </label>
              <input type="number" min="0" step="1" className="input w-full" placeholder="e.g. 24"
                value={quantity} onChange={e => setQuantity(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-1">Weight (kg)</label>
              <input type="number" min="0" step="0.1" className="input w-full" placeholder="e.g. 1200"
                value={weight} onChange={e => setWeight(e.target.value)} />
            </div>
          </div>

          {/* Per-stop fields */}
          {stops.map((s, i) => (
            <div key={s.sequenceNumber} className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2.5">

              {/* Stop header */}
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.type === "collection" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                  {s.type === "collection" ? "Collection" : "Delivery"} {i + 1}
                </span>
                {(s.siteName || s.town) && (
                  <span className="text-xs text-muted truncate">{[s.siteName, s.town, s.postcode].filter(Boolean).join(", ")}</span>
                )}
              </div>

              {/* Stop date — always visible so planner can change delivery to next day */}
              <div>
                <label className="text-xs text-slate-500 block mb-0.5">
                  {s.type === "collection" ? "Collection date" : "Delivery date"} *
                </label>
                <input
                  type="date"
                  className="input w-full !py-1.5 !text-sm"
                  value={s.stopDate}
                  onChange={e => updateStop(s.sequenceNumber, { stopDate: e.target.value })}
                />
              </div>

              {/* Time window */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-500 block mb-0.5">Arrive from</label>
                  <input type="time" className="input w-full !py-1.5 !text-sm"
                    value={s.timeWindowStart} onChange={e => updateStop(s.sequenceNumber, { timeWindowStart: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-0.5">Arrive by</label>
                  <input type="time" className="input w-full !py-1.5 !text-sm"
                    value={s.timeWindowEnd} onChange={e => updateStop(s.sequenceNumber, { timeWindowEnd: e.target.value })} />
                </div>
              </div>

              {/* Quantity at this stop */}
              <div>
                <label className="text-xs text-slate-500 block mb-0.5">
                  {s.type === "collection" ? "Collecting" : "Delivering"}
                  {s.quantityUnit ? ` (${unitLabel(s.quantityUnit)})` : ""}
                </label>
                <input type="number" min="0" step="1" className="input w-full !py-1.5 !text-sm"
                  placeholder="Quantity at this stop"
                  value={s.quantityRequired} onChange={e => updateStop(s.sequenceNumber, { quantityRequired: e.target.value })} />
              </div>

              {/* Delivery / collection reference */}
              <div>
                <label className="text-xs text-slate-500 block mb-0.5">
                  {s.type === "collection" ? "Collection" : "Delivery"} reference
                </label>
                <input type="text" className="input w-full !py-1.5 !text-sm" placeholder="e.g. DEL-001"
                  value={s.referenceNumber} onChange={e => updateStop(s.sequenceNumber, { referenceNumber: e.target.value })} />
              </div>

              {/* Booking ref — only when required */}
              {s.bookingRequired && (
                <div>
                  <label className="text-xs text-slate-500 block mb-0.5">
                    Booking reference <span className="text-red-500">*</span>
                  </label>
                  <input type="text" className="input w-full !py-1.5 !text-sm" placeholder="Required for this stop"
                    value={s.bookingRef} onChange={e => updateStop(s.sequenceNumber, { bookingRef: e.target.value })} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="text-sm font-medium text-slate-400 hover:text-slate-700 transition-colors">Cancel</button>
          <div className="flex-1" />
          <button onClick={handleCreate} disabled={saving || !date}
            className="btn bg-green-600 hover:bg-green-700 text-white text-sm px-6 py-2.5 font-bold disabled:opacity-40">
            {saving ? "Creating…" : "Create job"}
          </button>
        </div>

      </div>
    </div>
  );
}
