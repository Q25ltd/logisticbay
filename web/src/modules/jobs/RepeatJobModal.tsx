/**
 * RepeatJobModal — creates a new job by copying an existing one.
 * Asks for everything that typically changes between runs:
 *   date, quantity, weight, customer ref, and per-stop times/refs/quantities.
 * Everything else (customer, addresses, load type, vehicle) copies silently.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { jobsApi } from "../../api/jobs";
import type { PlannedJob } from "../../types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Human-readable unit labels
const UNIT_LABELS: Record<string, string> = {
  pallets:      "pallets",
  roll_cages:   "roll cages",
  tonnes:       "tonnes",
  kg:           "kg",
  bags:         "bags",
  items:        "items",
  loads:        "loads",
  litres:       "litres",
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

export default function RepeatJobModal({ job, onClose }: Props) {
  const navigate = useNavigate();
  const [saving,   setSaving]  = useState(false);
  const [error,    setError]   = useState("");
  const [date,     setDate]    = useState(today());
  const [custRef,  setCustRef] = useState(job.customerRef ?? "");
  const [quantity, setQuantity] = useState(job.quantity != null ? String(job.quantity) : "");
  const [weight,   setWeight]   = useState(job.weight   != null ? String(job.weight)   : "");

  const [stops, setStops] = useState<StopRow[]>(() =>
    (job.stops ?? []).map(s => ({
      sequenceNumber:   s.sequenceNumber,
      type:             s.type ?? "delivery",
      siteName:         s.siteName  ?? null,
      town:             s.town      ?? null,
      postcode:         s.postcode  ?? null,
      timeWindowStart:  toHHMM(s.timeWindowStart),
      timeWindowEnd:    toHHMM(s.timeWindowEnd),
      bookedTime:       toHHMM(s.bookedTime),
      referenceNumber:  "",
      bookingRef:       "",
      bookingRequired:  s.bookingRequired ?? false,
      quantityRequired: s.quantityRequired != null ? String(s.quantityRequired) : "",
      quantityUnit:     s.quantityUnit ?? job.quantityUnit ?? "",
    }))
  );

  function updateStop(seq: number, patch: Partial<StopRow>) {
    setStops(prev => prev.map(s => s.sequenceNumber === seq ? { ...s, ...patch } : s));
  }

  function buildDateTime(dateStr: string, timeStr: string): string | undefined {
    if (!timeStr) return undefined;
    return `${dateStr}T${timeStr}:00.000Z`;
  }

  async function handleCreate() {
    if (!date) { setError("Please select a date."); return; }

    // Booking refs are required for stops that need them
    const missingRefs = stops.filter(s => s.bookingRequired && !s.bookingRef.trim());
    if (missingRefs.length > 0) {
      setError(
        `Booking reference is required for: ${missingRefs.map(s =>
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
          timeWindowStart:  buildDateTime(date, s.timeWindowStart),
          timeWindowEnd:    buildDateTime(date, s.timeWindowEnd),
          bookedTime:       buildDateTime(date, s.bookedTime),
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

          {/* Date */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-1">Date *</label>
            <input type="date" className="input w-full" value={date} onChange={e => setDate(e.target.value)} />
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
