/**
 * JobQuickLook — read-only slide-in drawer for a full job.
 *
 * Lets a planner answer a quick question about any job without leaving the board.
 * Opens from a job card or a run stop; Esc or backdrop closes; "Open full job →"
 * goes to the editable page. Leads with Goods & handling, then Timing & status,
 * per the planner's priority.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { jobsApi } from "../../api/jobs";
import type { Job, JobPart } from "../../types";
import { cap } from "../jobs/createJobUtils";

function fmtDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function fmtTime(iso?: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });
}

const STATUS_COLOUR: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  pending_review: "bg-amber-100 text-amber-700",
  ready_to_plan: "bg-blue-100 text-blue-700",
  in_planning: "bg-indigo-100 text-indigo-700",
  planned: "bg-violet-100 text-violet-700",
  in_progress: "bg-emerald-100 text-emerald-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "" || value === false) return null;
  return (
    <div className="flex gap-2 text-[12px]">
      <span className="text-slate-400 w-28 flex-shrink-0">{label}</span>
      <span className="text-slate-700 break-words">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 border-t border-slate-100">
      <h4 className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-2">{title}</h4>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function stopWindow(s: JobPart): string {
  if (s.bookedTime) return `Booked ${fmtTime(s.bookedTime)}`;
  if (s.timeWindowStart || s.timeWindowEnd) return `${fmtTime(s.timeWindowStart)}–${fmtTime(s.timeWindowEnd)}`;
  return "No window";
}

function StopRow({ s, idx }: { s: JobPart; idx: number }) {
  const isCollect = s.type === "collection";
  const addr = [s.siteName, s.street, s.town, s.postcode].filter(Boolean).join(", ") || s.locationTextSnapshot || "—";
  const access = [...(s.accessRequirements ?? []), ...(s.handlingMethods ?? [])];
  const qty = s.quantityRequired ?? s.numPallets;
  return (
    <div className="rounded border border-slate-100 p-2 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${isCollect ? "bg-blue-50 text-blue-700" : "bg-green-50 text-green-700"}`}>
            {idx}. {isCollect ? "Collect" : s.type === "delivery" ? "Deliver" : cap(s.type)}
          </span>
          {qty != null && qty > 0 && <span className="text-[11px] text-slate-500">{qty}{s.quantityUnit ? " " + s.quantityUnit : ""}</span>}
        </span>
        <span className="text-[11px] font-semibold text-amber-700">{stopWindow(s)}</span>
      </div>
      <div className="text-[12px] text-slate-700">{addr}</div>
      {(s.contactName || s.contactPhone) && (
        <div className="text-[11px] text-slate-500">📞 {[s.contactName, s.contactPhone].filter(Boolean).join(" · ")}</div>
      )}
      {s.bookingRequired && <div className="text-[11px] text-slate-500">Booking required{s.bookingRef ? ` · ref ${s.bookingRef}` : ""}</div>}
      {s.openingHours && <div className="text-[11px] text-slate-500">Hours: {s.openingHours}</div>}
      {access.length > 0 && <div className="text-[11px] text-slate-500">Access: {access.join(", ")}</div>}
      {(s.instructions || s.stopNotes) && <div className="text-[11px] text-slate-500 italic">{s.instructions || s.stopNotes}</div>}
    </div>
  );
}

export default function JobQuickLook({ jobId, onClose }: { jobId: number | null; onClose: () => void }) {
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (jobId == null) { setJob(null); setError(null); return; }
    let live = true;
    setLoading(true); setError(null); setJob(null);
    jobsApi.get(jobId)
      .then(j => { if (live) setJob(j); })
      .catch(() => { if (live) setError("Couldn't load this job."); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [jobId]);

  useEffect(() => {
    if (jobId == null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jobId, onClose]);

  if (jobId == null) return null;

  const flags = job ? [
    job.tempControlled && `Temp-controlled${job.tempRange ? ` (${job.tempRange})` : ""}`,
    job.hazardClass && `Hazardous ${job.hazardClass}`,
    job.fragile && "Fragile",
    job.stackable ? "Stackable" : "Not stackable",
  ].filter(Boolean) as string[] : [];

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <aside className="fixed right-0 top-0 h-full w-[420px] max-w-[92vw] bg-white shadow-2xl z-50 overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 sticky top-0 bg-white z-10">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[15px] font-semibold text-slate-800">{job?.customerName ?? (loading ? "Loading…" : "Job")}</div>
              <div className="text-[11px] text-slate-400">{job?.jobReference ?? ""}</div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg leading-none px-1" aria-label="Close">✕</button>
          </div>
          {job && (
            <div className="flex items-center gap-2 mt-2">
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_COLOUR[job.status] ?? "bg-slate-100 text-slate-600"}`}>{cap(job.status.replace(/_/g, " "))}</span>
              <span className="text-[11px] text-slate-400">{fmtDate(job.stops?.find(s => s.type === "collection" || s.type === "pickup")?.timeWindowStart ?? job.stops?.[0]?.timeWindowStart ?? null)}</span>
              <Link to={`/app/jobs/${job.id}`} className="ml-auto text-[12px] text-blue-600 hover:underline font-medium">Open full job →</Link>
            </div>
          )}
        </div>

        {loading && <div className="p-6 text-center text-[12px] text-slate-400">Loading job…</div>}
        {error   && <div className="p-6 text-center text-[12px] text-red-500">{error}</div>}

        {job && (
          <div className="flex-1">
            {/* Goods & handling — first, per planner priority */}
            <Section title="Goods & handling">
              <Field label="Goods" value={job.goodsType ? cap(job.goodsType) : job.goodsDescription} />
              {job.goodsDescription && job.goodsType && <Field label="Description" value={job.goodsDescription} />}
              <Field label="Quantity" value={job.quantity != null && job.quantity > 0 ? `${job.quantity}${job.quantityUnit ? " " + job.quantityUnit : ""}` : null} />
              <Field label="Weight" value={job.weight != null && job.weight > 0 ? `${job.weight.toLocaleString()} kg` : null} />
              <Field label="Dimensions" value={job.dimensions} />
              {flags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {flags.map(f => <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{f}</span>)}
                </div>
              )}
              {(job.specialRequirements?.length ?? 0) > 0 && <Field label="Special" value={job.specialRequirements!.join(", ")} />}
            </Section>

            {/* Vehicle requirement */}
            {(job.vehicleCategory || job.minGvwClass || (job.equipment?.length ?? 0) > 0 || job.vehicleAccessNotes) && (
              <Section title="Vehicle requirement">
                <Field label="Category" value={job.vehicleCategory ? cap(job.vehicleCategory) : null} />
                <Field label="Min GVW" value={job.minGvwClass} />
                <Field label="Body types" value={(job.bodyTypes?.length ?? 0) > 0 ? job.bodyTypes!.join(", ") : null} />
                <Field label="Equipment" value={(job.equipment?.length ?? 0) > 0 ? job.equipment!.join(", ") : null} />
                <Field label="Access notes" value={job.vehicleAccessNotes} />
              </Section>
            )}

            {/* Timing & status — per-stop windows */}
            <Section title={`Stops & timing (${job.stops?.length ?? 0})`}>
              {(job.stops ?? []).length === 0 && <div className="text-[11px] text-slate-400">No stops recorded.</div>}
              {(job.stops ?? []).map((s, i) => <StopRow key={s.id ?? i} s={s} idx={i + 1} />)}
            </Section>

            {/* Notes */}
            {(job.plannerNotes || job.internalNotes) && (
              <Section title="Notes">
                <Field label="Planner" value={job.plannerNotes} />
                <Field label="Internal" value={job.internalNotes} />
              </Section>
            )}

            {/* References */}
            {(job.customerRef || job.purchaseOrderNumber) && (
              <Section title="References">
                <Field label="Customer ref" value={job.customerRef} />
                <Field label="PO number" value={job.purchaseOrderNumber} />
              </Section>
            )}

            <div className="px-4 py-3 text-[10px] text-slate-300">Read-only preview</div>
          </div>
        )}
      </aside>
    </>
  );
}
