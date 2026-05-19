/**
 * Internal review queue for incoming transport requests (pending_review jobs).
 * Planner/office staff see all pending jobs from the PRF and can accept or reject.
 *
 * Accept = sets plannedDate (required) + plannerNotes (optional) → ready_to_plan
 * Reject = cancels the job and logs a reason
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Job, JobPart } from "../../types";
import { jobRequestsApi } from "../../api/jobRequests";

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_TABS = [
  { key: "pending_review", label: "Pending" },
  { key: "",               label: "All"     },
];

const STATUS_BADGE: Record<string, string> = {
  pending_review: "bg-amber-100 text-amber-800",
  ready_to_plan:  "bg-blue-100 text-blue-700",
  in_planning:    "bg-indigo-100 text-indigo-700",
  planned:        "bg-green-100 text-green-800",
  in_progress:    "bg-teal-100 text-teal-800",
  completed:      "bg-gray-100 text-gray-600",
  cancelled:      "bg-red-100 text-red-500",
  draft:          "bg-slate-100 text-slate-500",
};

const STATUS_LABEL: Record<string, string> = {
  pending_review: "Pending review",
  ready_to_plan:  "Ready to plan",
  in_planning:    "In planning",
  planned:        "Planned",
  in_progress:    "In progress",
  completed:      "Completed",
  cancelled:      "Cancelled",
  draft:          "Draft",
};

const STOP_TYPE_LABEL: Record<string, string> = {
  pickup:     "Pickup",
  dropoff:    "Drop-off",
  collection: "Collection",
  delivery:   "Delivery",
  handover:   "Handover",
  yard:       "Yard",
  depot:      "Depot",
};

const REJECT_REASONS = [
  { value: "no_capacity",           label: "No capacity"           },
  { value: "outside_service_area",  label: "Outside service area"  },
  { value: "incomplete_information",label: "Incomplete information" },
  { value: "pricing_issue",         label: "Pricing issue"         },
  { value: "duplicate_request",     label: "Duplicate request"     },
  { value: "other",                 label: "Other"                 },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeSince(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60)   return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

/** Format an ISO datetime string as "12 Jun · 09:00–13:00" */
function fmtWindow(start: string | null | undefined, end: string | null | undefined): string {
  if (!start) return "";
  const s  = new Date(start);
  const date = s.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const st   = s.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (!end) return `${date} from ${st}`;
  const et   = new Date(end).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${st}–${et}`;
}

/** Today's date as YYYY-MM-DD (for date input min). */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function JobRequestsPage() {
  const navigate = useNavigate();
  const [tab,      setTab]      = useState("pending_review");
  const [jobs,     setJobs]     = useState<Job[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [total,    setTotal]    = useState(0);

  const [slugUrl,    setSlugUrl]    = useState<string | null>(null);
  const [linkId,     setLinkId]     = useState<number | null>(null);
  const [linkActive, setLinkActive] = useState(true);
  const [linkCopied, setLinkCopied] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    jobRequestsApi.list(tab || undefined)
      .then(r => { setJobs(r.data); setTotal(r.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    jobRequestsApi.listLinks().then(r => {
      const main = r.data.find(l => l.isMain);
      if (main) { setLinkId(main.id); setLinkActive(main.isActive); }
      if (r.companySlug) setSlugUrl(`${window.location.origin}/request/${r.companySlug}`);
    }).catch(() => {});
  }, []);

  function handleLinkCopy() {
    if (!slugUrl) return;
    navigator.clipboard.writeText(slugUrl).catch(() => {});
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  async function toggleLink() {
    if (!linkId) return;
    try {
      const updated = await jobRequestsApi.updateLink(linkId, { isActive: !linkActive });
      setLinkActive(updated.isActive);
    } catch { /* silent */ }
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">

      {/* Header */}
      <div>
        <h1 className="text-xl font-black" style={{ color: "#0f172a" }}>Job Requests</h1>
        <p className="text-sm mt-0.5" style={{ color: "#6b7280" }}>
          Incoming transport requests from customers — accept to move to planning.
        </p>
      </div>

      {/* Intake link strip */}
      {slugUrl && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-100">
          <span className="text-xs font-semibold shrink-0" style={{ color: "#4338ca" }}>Intake link</span>
          <span className="font-mono text-xs text-slate-600 truncate flex-1 min-w-0">{slugUrl}</span>
          <button
            className={"btn text-xs px-2.5 py-1 shrink-0 " + (linkCopied ? "btn-primary" : "btn-secondary")}
            onClick={handleLinkCopy}
          >
            {linkCopied ? "✓ Copied" : "Copy"}
          </button>
          <button
            className={"text-xs px-2.5 py-1 rounded-lg font-medium border shrink-0 transition-colors " +
              (linkActive
                ? "bg-indigo-100 text-indigo-700 border-indigo-200 hover:bg-indigo-200"
                : "bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200")}
            onClick={toggleLink}
          >
            {linkActive ? "Active" : "Inactive"}
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {STATUS_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={"px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors " +
              (tab === t.key
                ? "border-indigo-500 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-700")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="text-sm text-muted py-8 text-center">Loading…</div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📭</div>
          <div className="font-semibold" style={{ color: "#0f172a" }}>No requests</div>
          <p className="text-sm mt-1" style={{ color: "#6b7280" }}>
            {tab === "pending_review"
              ? "No pending requests — all reviewed."
              : "No requests yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map(j => (
            <RequestRow key={j.id} job={j} onRefresh={load} onNavigate={navigate} />
          ))}
          {total > jobs.length && (
            <p className="text-xs text-center text-muted pt-2">
              Showing {jobs.length} of {total}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function RequestRow({
  job: j,
  onRefresh,
  onNavigate,
}: {
  job:         Job;
  onRefresh:   () => void;
  onNavigate:  ReturnType<typeof useNavigate>;
}) {
  const [rejecting,    setRejecting]    = useState(false);
  const [rejectReason, setRejectReason] = useState("no_capacity");
  const [rejectNotes,  setRejectNotes]  = useState("");
  const [accepting,    setAccepting]    = useState(false);
  const [plannedDate,  setPlannedDate]  = useState("");
  const [plannerNotes, setPlannerNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState("");
  const [showModal, setShowModal] = useState(false);

  const stops      = j.stops ?? [];
  const collections = stops.filter(s => s.type === "collection" || s.type === "pickup");
  const deliveries  = stops.filter(s => s.type === "delivery"   || s.type === "dropoff");
  const firstStop   = stops[0];

  async function accept() {
    if (!plannedDate) { setErr("Planned date is required"); return; }
    setBusy(true); setErr("");
    try {
      const result = await jobRequestsApi.accept(j.id, plannedDate, plannerNotes.trim() || undefined);
      onRefresh();
      onNavigate(`/app/jobs/${result.jobId}`);
    } catch (e: unknown) { setErr((e as Error).message); setBusy(false); }
  }

  async function reject() {
    setBusy(true); setErr("");
    try {
      await jobRequestsApi.reject(j.id, rejectReason, rejectNotes.trim() || undefined);
      onRefresh();
    } catch (e: unknown) { setErr((e as Error).message); setBusy(false); }
  }

  const isPending = j.status === "pending_review";

  return (
    <>
      <div className={"card border " + (isPending ? "border-amber-200" : "border-border")}>

        {/* Summary row */}
        <div className="flex items-start gap-3 p-4">
          <div className="flex-1 min-w-0">

            {/* Name + status badge */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm" style={{ color: "#0f172a" }}>
                {j.customerName || "(no customer)"}
              </span>
              <span className={"inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold " +
                (STATUS_BADGE[j.status] ?? "bg-gray-100 text-gray-600")}>
                {STATUS_LABEL[j.status] ?? j.status}
              </span>
              {j.jobReference && (
                <span className="text-xs font-mono text-slate-400">{j.jobReference}</span>
              )}
            </div>

            {/* Contact + route */}
            <div className="text-xs mt-1 space-x-2" style={{ color: "#6b7280" }}>
              {j.bookingContactName && (
                <span>{j.bookingContactName}{j.bookingContactPhone ? ` · ${j.bookingContactPhone}` : ""}</span>
              )}
              {(collections.length > 0 || deliveries.length > 0) && (
                <>
                  {j.bookingContactName && <span>·</span>}
                  <span>
                    {collections.length > 0
                      ? <>{collections[0].siteName}{collections.length > 1 && <span className="ml-1 text-blue-600 font-medium">+{collections.length - 1}</span>}</>
                      : (firstStop?.siteName ?? "?")
                    }
                    {" → "}
                    {deliveries.length > 0
                      ? <>{deliveries[deliveries.length - 1].siteName}{deliveries.length > 1 && <span className="ml-1 text-blue-600 font-medium">+{deliveries.length - 1}</span>}</>
                      : (stops[stops.length - 1]?.siteName ?? "?")
                    }
                  </span>
                </>
              )}
            </div>

            {/* Date + goods */}
            <div className="text-xs mt-0.5" style={{ color: "#6b7280" }}>
              {firstStop?.timeWindowStart && (
                <span>{fmtWindow(firstStop.timeWindowStart, firstStop.timeWindowEnd)}</span>
              )}
              {j.goodsDescription && (
                <><span className="mx-2">·</span><span>{j.goodsDescription}</span></>
              )}
              {j.quantity != null && j.quantityUnit && (
                <span className="ml-1 text-slate-500">{j.quantity} {j.quantityUnit}</span>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <button
                className="btn btn-secondary text-xs px-3 py-1"
                onClick={() => setShowModal(true)}
              >
                Full details
              </button>
              {isPending && !accepting && !rejecting && (
                <>
                  <button
                    className="btn btn-primary text-xs px-3 py-1"
                    onClick={() => { setAccepting(true); setRejecting(false); setErr(""); }}
                  >
                    ✓ Accept
                  </button>
                  <button
                    className="btn text-xs px-3 py-1 border"
                    style={{ color: "#ef4444", borderColor: "#fca5a5" }}
                    onClick={() => { setRejecting(true); setAccepting(false); setErr(""); }}
                  >
                    ✗ Reject
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Time since */}
          <div className="text-right text-xs shrink-0" style={{ color: "#9ca3af" }}>
            <div>{timeSince(j.createdAt)}</div>
          </div>
        </div>

        {/* Accept / reject panels */}
        {(accepting || rejecting || err) && (
          <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
            {err && (
              <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{err}</div>
            )}

            {accepting && (
              <div className="p-3 rounded-xl bg-green-50 border border-green-200 space-y-3">
                <div className="font-semibold text-sm text-green-800">Accept this request</div>

                {/* Planned date — required */}
                <div>
                  <label className="text-xs font-medium" style={{ color: "#374151" }}>
                    Planned date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    className="input mt-1 text-sm"
                    min={todayISO()}
                    value={plannedDate}
                    onChange={e => { setPlannedDate(e.target.value); setErr(""); }}
                  />
                </div>

                {/* Planner notes — optional */}
                <div>
                  <label className="text-xs font-medium" style={{ color: "#374151" }}>
                    Planner notes <span className="text-xs font-normal text-slate-400">(optional — internal only)</span>
                  </label>
                  <textarea
                    className="input mt-1 text-sm"
                    rows={2}
                    value={plannerNotes}
                    onChange={e => setPlannerNotes(e.target.value)}
                    placeholder="Allocated to North route. Call site before 08:00."
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    className="btn btn-primary text-sm"
                    onClick={accept}
                    disabled={busy || !plannedDate}
                  >
                    {busy ? "Creating job…" : "✓ Accept & open job"}
                  </button>
                  <button
                    className="btn btn-secondary text-sm"
                    onClick={() => { setAccepting(false); setErr(""); }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {rejecting && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 space-y-3">
                <div className="font-semibold text-sm text-red-800">Reject this request</div>

                <div>
                  <label className="text-xs font-medium" style={{ color: "#374151" }}>Reason</label>
                  <select
                    className="input mt-1 text-sm"
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                  >
                    {REJECT_REASONS.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium" style={{ color: "#374151" }}>
                    Note <span className="text-xs font-normal text-slate-400">(optional)</span>
                  </label>
                  <textarea
                    className="input mt-1 text-sm"
                    rows={2}
                    value={rejectNotes}
                    onChange={e => setRejectNotes(e.target.value)}
                    placeholder="Cannot accommodate this date — please rebook for next week."
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    className="btn text-sm"
                    style={{ background: "#ef4444", color: "white" }}
                    onClick={reject}
                    disabled={busy}
                  >
                    {busy ? "Rejecting…" : "✗ Reject request"}
                  </button>
                  <button
                    className="btn btn-secondary text-sm"
                    onClick={() => { setRejecting(false); setErr(""); }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <JobDetailModal job={j} onClose={() => setShowModal(false)} onNavigate={onNavigate} />
      )}
    </>
  );
}

// ── Detail modal ──────────────────────────────────────────────────────────────

function JobDetailModal({
  job: j,
  onClose,
  onNavigate,
}: {
  job:        Job;
  onClose:    () => void;
  onNavigate: ReturnType<typeof useNavigate>;
}) {
  const stops = j.stops ?? [];

  const hasVehicle = !!(j.vehicleCategory || (j.bodyTypes && j.bodyTypes.length) || j.minGvwClass ||
    (j.equipment && j.equipment.length) || (j.trailersAllowed && j.trailersAllowed.length));

  const hasException = !!(j.failureAction && j.failureAction !== "call_assistance") ||
    !!(j.approvalContactName || j.alternativeReturnAddress);

  const hasNotes = !!(j.driverVisibleNotes || j.safetyInstructions ||
    (j.driverNoteChips && j.driverNoteChips.length));

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/40" />
      <div
        className="bg-white w-full max-w-2xl h-full overflow-y-auto flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-base font-bold" style={{ color: "#0f172a" }}>
              {j.customerName || "(no customer)"}
            </h2>
            <div className="text-xs mt-0.5 flex items-center gap-2" style={{ color: "#6b7280" }}>
              <span className={"inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold " +
                (STATUS_BADGE[j.status] ?? "bg-gray-100 text-gray-600")}>
                {STATUS_LABEL[j.status] ?? j.status}
              </span>
              {j.jobReference && <span className="font-mono">{j.jobReference}</span>}
              <span>·</span>
              <span>{timeSince(j.createdAt)}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 ml-4">
            <button
              className="btn btn-secondary text-xs px-3 py-1.5"
              onClick={() => { onClose(); onNavigate(`/app/jobs/${j.id}`); }}
            >
              Open job ↗
            </button>
            <button
              className="text-xl leading-none text-slate-400 hover:text-slate-700"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-6 flex-1">

          {/* Customer / booking contact */}
          <Section title="Customer">
            <Field label="Company"      value={j.customerName} />
            <Field label="Contact name" value={j.bookingContactName} />
            <Field label="Phone"        value={j.bookingContactPhone} />
            <Field label="Email"        value={j.bookingContactEmail} />
            <Field label="Customer ref" value={j.customerRef} />
            <Field label="PO number"    value={j.purchaseOrderNumber} />
          </Section>

          {/* Stops */}
          <Section title={`Stops (${stops.length})`}>
            <div className="space-y-4">
              {stops.map((s, i) => (
                <StopBlock
                  key={s.id ?? i}
                  title={
                    stops.length > 1
                      ? `${STOP_TYPE_LABEL[s.type] ?? s.type} ${stops.filter((x, j) => x.type === s.type && j <= i).length}`
                      : (STOP_TYPE_LABEL[s.type] ?? s.type)
                  }
                  stop={s}
                />
              ))}
              {stops.length === 0 && (
                <p className="text-xs text-muted">No stops recorded.</p>
              )}
            </div>
          </Section>

          {/* Load */}
          <Section title="Load">
            <Field label="Goods type"    value={j.goodsType?.replace(/_/g, " ")} />
            <Field label="Description"   value={j.goodsDescription} />
            <Field label="Quantity"      value={j.quantity != null ? `${j.quantity} ${j.quantityUnit ?? ""}` : undefined} />
            <Field label="Weight"        value={j.weight   != null ? `${j.weight} kg`  : undefined} />
            <Field label="Volume"        value={j.volume   != null ? `${j.volume} m³`  : undefined} />
            <Field label="Dimensions"    value={j.dimensions} />
            {j.tempControlled && <Field label="Temperature" value={j.tempRange || "Temp-controlled"} />}
            {j.hazardClass && <Field label="ADR class" value={j.hazardClass} />}
            {j.fragile    && <Field label="Fragile"    value="Yes" />}
            {j.stackable  && <Field label="Stackable"  value="Yes" />}
            {j.weighbridgeRequired && <Field label="Weighbridge" value="Required" />}
            {Array.isArray(j.securingRequirements) && j.securingRequirements.length > 0 && (
              <ChipRow label="Securing" items={j.securingRequirements as string[]} />
            )}
            {Array.isArray(j.specialRequirements) && j.specialRequirements.length > 0 && (
              <ChipRow label="Special requirements" items={j.specialRequirements as string[]} />
            )}
          </Section>

          {/* Vehicle requirements */}
          {hasVehicle && (
            <Section title="Vehicle requirements">
              <Field label="Category"  value={j.vehicleCategory} />
              {Array.isArray(j.bodyTypes) && j.bodyTypes.length > 0 && (
                <ChipRow label="Body types" items={j.bodyTypes as string[]} />
              )}
              <Field label="Min GVW"   value={j.minGvwClass} />
              {Array.isArray(j.equipment) && j.equipment.length > 0 && (
                <ChipRow label="Equipment" items={j.equipment as string[]} />
              )}
              {Array.isArray(j.trailersAllowed) && j.trailersAllowed.length > 0 && (
                <ChipRow label="Trailers" items={j.trailersAllowed as string[]} />
              )}
              <Field label="Access notes" value={j.vehicleAccessNotes} />
            </Section>
          )}

          {/* Driver-visible notes */}
          {hasNotes && (
            <Section title="Driver notes">
              {Array.isArray(j.driverNoteChips) && j.driverNoteChips.length > 0 && (
                <ChipRow label="Note chips" items={j.driverNoteChips as string[]} />
              )}
              <Field label="Driver notes"       value={j.driverVisibleNotes} />
              <Field label="Safety instructions" value={j.safetyInstructions} />
            </Section>
          )}

          {/* Exception policy */}
          {hasException && (
            <Section title="Exception policy">
              <Field label="Failure action"     value={j.failureAction?.replace(/_/g, " ")} />
              <Field label="Assistance phone"   value={j.assistancePhone} />
              <Field label="Approval contact"   value={j.approvalContactName} />
              <Field label="Approval phone"     value={j.approvalContactPhone} />
              <Field label="Alt return address" value={j.alternativeReturnAddress} />
              <Field label="Alt return postcode" value={j.alternativeReturnPostcode} />
              <Field label="Alt contact name"   value={j.alternativeReturnContactName} />
              <Field label="Alt contact phone"  value={j.alternativeReturnContactPhone} />
            </Section>
          )}

          {/* Planner notes (if any) */}
          {j.plannerNotes && (
            <Section title="Planner notes">
              <p className="text-sm" style={{ color: "#374151" }}>{j.plannerNotes}</p>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Stop block (inside modal) ─────────────────────────────────────────────────

function StopBlock({ title, stop: s }: { title: string; stop: JobPart }) {
  return (
    <div className="p-4 rounded-xl border bg-slate-50 space-y-2">
      <div className="font-semibold capitalize" style={{ color: "#0f172a" }}>{title}</div>

      {s.referenceNumber && (
        <div className="font-mono text-xs px-1 py-0.5 bg-blue-50 text-blue-800 rounded inline-block">
          Ref: {s.referenceNumber}
        </div>
      )}

      <Field label="Site"    value={s.siteName} />
      <Field
        label="Address"
        value={[s.street, s.addressLine2, s.town, s.countyRegion, s.postcode, s.country]
          .filter(Boolean).join(", ")}
      />

      {s.lat != null && (
        <div className="text-xs" style={{ color: "#6b7280" }}>
          <span className="font-medium">Pin: </span>
          {s.lat.toFixed(5)}, {(s.lng ?? 0).toFixed(5)}
        </div>
      )}

      {s.navigationInstructions && (
        <Field label="Entrance instructions" value={s.navigationInstructions} />
      )}

      {(s.timeWindowStart || s.timeWindowEnd) && (
        <Field label="Time window" value={fmtWindow(s.timeWindowStart, s.timeWindowEnd)} />
      )}
      {s.bookedTime && (
        <Field label="Booked time" value={new Date(s.bookedTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} />
      )}
      {s.unloadingAllowanceMinutes != null && s.unloadingAllowanceMinutes > 0 && (
        <Field label="Service time" value={`${s.unloadingAllowanceMinutes} min`} />
      )}
      {s.bookingRequired && (
        <Field label="Booking" value={s.bookingRef ? `Required · ${s.bookingRef}` : "Required"} />
      )}
      {s.openingHours && <Field label="Opening hours" value={s.openingHours} />}

      {s.quantityRequired != null && (
        <Field label="Quantity" value={`${s.quantityRequired} ${s.quantityUnit ?? ""}`} />
      )}
      {(s.exchangeDropQty != null || s.exchangeCollectQty != null) && (
        <Field
          label="Exchange"
          value={`Drop ${s.exchangeDropQty ?? 0} · Collect ${s.exchangeCollectQty ?? 0}${s.exchangeUnit ? ` ${s.exchangeUnit}` : ""}`}
        />
      )}

      {Array.isArray(s.handlingMethods)   && s.handlingMethods.length   > 0 && <ChipRow label="Handling"    items={s.handlingMethods as string[]} />}
      {Array.isArray(s.accessRequirements) && s.accessRequirements.length > 0 && <ChipRow label="Site access" items={s.accessRequirements as string[]} variant="amber" />}
      {Array.isArray(s.proofRequirements)  && s.proofRequirements.length  > 0 && <ChipRow label="Proof"      items={s.proofRequirements as string[]} />}

      {s.heightRestriction && <Field label="Height restriction" value={s.heightRestriction} />}
      {s.weightRestriction && <Field label="Weight restriction" value={s.weightRestriction} />}
      {s.lengthRestriction && <Field label="Length restriction" value={s.lengthRestriction} />}

      {s.contactName && <Field label="Site contact" value={s.contactName} />}
      {s.contactPhone && <Field label="Site phone"  value={s.contactPhone} />}
      {s.stopNotes    && <Field label="Stop notes"  value={s.stopNotes} />}
    </div>
  );
}

// ── Modal helpers ─────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-bold mb-3 pb-1 border-b border-border" style={{ color: "#0f172a" }}>
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex gap-2 text-xs">
      <span className="shrink-0 font-medium w-36" style={{ color: "#6b7280" }}>{label}</span>
      <span style={{ color: "#374151" }}>{value}</span>
    </div>
  );
}

function ChipRow({
  label,
  items,
  variant,
}: {
  label:    string;
  items:    string[];
  variant?: "amber";
}) {
  if (!items || items.length === 0) return null;
  const cls = variant === "amber"
    ? "bg-amber-50 text-amber-700 border border-amber-200"
    : "bg-slate-100 text-slate-700";
  return (
    <div>
      <div className="text-xs font-medium mb-1" style={{ color: "#6b7280" }}>{label}</div>
      <div className="flex gap-1 flex-wrap">
        {items.map(item => (
          <span key={item} className={"px-2 py-0.5 rounded-full text-xs font-medium " + cls}>
            {item.replace(/_/g, " ")}
          </span>
        ))}
      </div>
    </div>
  );
}
