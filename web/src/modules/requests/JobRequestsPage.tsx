/**
 * Internal review queue for incoming transport requests.
 * Planner/office staff see all pending requests and can accept or reject.
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { jobRequestsApi, type JobRequest, type RequestStop } from "../../api/jobRequests";

const STATUS_TABS = [
  { key: "",               label: "All" },
  { key: "pending_review", label: "Pending" },
  { key: "accepted",       label: "Accepted" },
  { key: "rejected",       label: "Rejected" },
];

const STATUS_BADGE: Record<string, string> = {
  pending_review: "bg-amber-100 text-amber-800",
  accepted:       "bg-green-100 text-green-800",
  rejected:       "bg-red-100 text-red-800",
  cancelled:      "bg-gray-100 text-gray-500",
};

const STATUS_LABEL: Record<string, string> = {
  pending_review: "Pending review",
  accepted:       "Accepted",
  rejected:       "Rejected",
  cancelled:      "Cancelled",
};

const SOURCE_LABEL: Record<string, string> = {
  client_request_link: "Customer portal",
  internal_manual:     "Manual entry",
};

const STOP_TYPE_LABEL: Record<string, string> = {
  collection: "Collection",
  delivery:   "Delivery",
  reload:     "Reload",
  return:     "Return",
  waypoint:   "Waypoint",
  other:      "Stop",
};

function timeSince(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60)   return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

// Helper: cast blob to RequestStop array
function toStops(raw: Record<string, unknown>[]): RequestStop[] {
  return (raw ?? []) as RequestStop[];
}

export default function JobRequestsPage() {
  const navigate = useNavigate();
  const [tab,      setTab]      = useState("pending_review");
  const [requests, setRequests] = useState<JobRequest[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [total,    setTotal]    = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    jobRequestsApi.list(tab || undefined)
      .then(r => { setRequests(r.data); setTotal(r.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-4 sm:p-6 max-w-5xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black" style={{ color: "#0f172a" }}>Job Requests</h1>
          <p className="text-sm mt-0.5" style={{ color: "#6b7280" }}>
            Incoming transport requests from customers. Accept to create a job for planning.
          </p>
        </div>
        <button
          className="btn btn-secondary text-sm"
          onClick={() => navigate("/app/request-links")}
        >
          Manage intake links
        </button>
      </div>

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
      ) : requests.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📭</div>
          <div className="font-semibold" style={{ color: "#0f172a" }}>No requests</div>
          <p className="text-sm mt-1" style={{ color: "#6b7280" }}>
            {tab === "pending_review"
              ? "All requests have been reviewed."
              : "No requests in this category yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map(r => <RequestRow key={r.id} request={r} onRefresh={load} />)}
        </div>
      )}
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function RequestRow({ request: r, onRefresh }: { request: JobRequest; onRefresh: () => void }) {
  const navigate    = useNavigate();
  const [expanded,  setExpanded]  = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("no_capacity");
  const [rejectNotes,  setRejectNotes]  = useState("");
  const [accepting,    setAccepting]    = useState(false);
  const [plannerNotes, setPlannerNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState("");

  const stops   = toStops(r.stops);
  const billing = r.billingData  as Record<string, unknown>;
  const notes   = r.notesData    as Record<string, unknown>;
  const load    = r.loadData     as Record<string, unknown>;

  const collections = stops.filter(s => s.type === "collection");
  const deliveries  = stops.filter(s => s.type === "delivery");
  const firstStop   = stops[0];
  const lastStop    = stops[stops.length - 1];

  const hasWarn = stops.some(
    s => s.entranceWarningLevel === "warn" || s.entranceWarningLevel === "danger"
  );

  async function accept() {
    setBusy(true); setErr("");
    try {
      const result = await jobRequestsApi.accept(r.id, plannerNotes);
      onRefresh();
      navigate(`/app/jobs/${result.jobId}`);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  async function reject() {
    setBusy(true); setErr("");
    try {
      await jobRequestsApi.reject(r.id, rejectReason, rejectNotes);
      onRefresh();
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  return (
    <div className={"card border " + (r.status === "pending_review" ? "border-amber-200" : "border-border")}>
      {/* Summary row */}
      <div
        className="flex items-start gap-3 p-4 cursor-pointer"
        onClick={() => setExpanded(o => !o)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm" style={{ color: "#0f172a" }}>
              {r.customerName}
            </span>
            <span className={"inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold " + (STATUS_BADGE[r.status] ?? "bg-gray-100 text-gray-600")}>
              {STATUS_LABEL[r.status] ?? r.status}
            </span>
            {hasWarn && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                ⚠ Pin warning
              </span>
            )}
            {r.convertedJob && (
              <button
                className="text-xs text-indigo-600 underline"
                onClick={e => { e.stopPropagation(); navigate(`/app/jobs/${r.convertedJob!.id}`); }}
              >
                {r.convertedJob.jobReference ?? `Job #${r.convertedJob.id}`}
              </button>
            )}
          </div>
          <div className="text-xs mt-1 space-x-2" style={{ color: "#6b7280" }}>
            <span>{r.contactName} · {r.contactPhone}</span>
            <span>·</span>
            <span>
              {collections.length > 0
                ? <>{collections[0].companySiteName}{collections.length > 1 && <span className="ml-1 text-blue-600 font-medium">+{collections.length - 1}</span>}</>
                : firstStop?.companySiteName ?? "?"
              }
              {" → "}
              {deliveries.length > 0
                ? <>{deliveries[deliveries.length - 1].companySiteName}{deliveries.length > 1 && <span className="ml-1 text-blue-600 font-medium">+{deliveries.length - 1}</span>}</>
                : lastStop?.companySiteName ?? "?"
              }
            </span>
          </div>
          <div className="text-xs mt-0.5" style={{ color: "#6b7280" }}>
            {firstStop && <span>{firstStop.date} · {firstStop.earliestArrivalTime}–{firstStop.latestArrivalTime}</span>}
            {lastStop && firstStop?.date !== lastStop.date && (
              <><span className="mx-1">→</span><span>{lastStop.date}</span></>
            )}
            {load?.goodsDescription && <><span className="mx-2">·</span><span>{load.goodsDescription as string}</span></>}
            {load?.quantity && <span> · {load.quantity as number} {load.unit as string}</span>}
          </div>
        </div>
        <div className="text-right text-xs shrink-0" style={{ color: "#9ca3af" }}>
          <div>{SOURCE_LABEL[r.source] ?? r.source}</div>
          <div>{timeSince(r.createdAt)}</div>
          <div className="mt-1">{expanded ? "▲" : "▼"}</div>
        </div>
      </div>

      {/* Detail panel */}
      {expanded && (
        <div className="border-t border-border px-4 pb-4 space-y-4 pt-4">
          {err && <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{err}</div>}

          {/* Stops grid */}
          <div className={`grid gap-3 text-sm ${stops.length <= 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
            {stops.map((stop, i) => (
              <StopBlock
                key={i}
                title={stops.length > 1
                  ? `${STOP_TYPE_LABEL[stop.type] ?? "Stop"} ${stops.filter((s, j) => s.type === stop.type && j <= i).length}`
                  : (STOP_TYPE_LABEL[stop.type] ?? "Stop")
                }
                stop={stop}
              />
            ))}
          </div>

          {/* Load */}
          <div className="text-sm p-3 rounded-xl bg-slate-50 border">
            <div className="font-semibold mb-1">Load</div>
            <div>{load?.goodsDescription as string}</div>
            <div className="text-xs mt-1 text-muted">
              {load?.quantity as number} {load?.unit as string}
              {load?.estimatedWeight && <span> · {load.estimatedWeight as number}kg est.</span>}
            </div>
            {/* Special requirements from specialRequirementsData */}
            {(() => {
              const spec = r.specialRequirementsData as Record<string, unknown>;
              const items = (spec?.items ?? []) as string[];
              return items.length > 0 ? (
                <div className="flex gap-1 flex-wrap mt-2">
                  {items.map((item: string) => (
                    <span key={item} className="px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-700 border border-red-200 font-medium">
                      {item.replace(/_/g, " ")}
                    </span>
                  ))}
                  {spec?.adrClass && <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-800 font-bold">ADR {spec.adrClass as string}{spec.unNumber ? ` UN${spec.unNumber}` : ""}</span>}
                  {spec?.temperatureRange && <span className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700">❄ {spec.temperatureRange as string}</span>}
                </div>
              ) : null;
            })()}
            {load?.loadNotes && <div className="text-xs mt-1 italic text-muted">{load.loadNotes as string}</div>}
          </div>

          {/* Billing */}
          {(billing?.purchaseOrderNumber || billing?.billingReference || billing?.declaredGoodsValue != null || r.pricingType) && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {billing?.purchaseOrderNumber && <InfoChip label="PO Number"   value={billing.purchaseOrderNumber as string} />}
              {billing?.billingReference    && <InfoChip label="Billing ref" value={billing.billingReference as string} />}
              {billing?.declaredGoodsValue != null && <InfoChip label="Goods value" value={`${billing.currency ?? "£"}${(billing.declaredGoodsValue as number).toLocaleString()}`} />}
              <InfoChip label="Pricing" value={r.pricingType.replace(/_/g, " ")} />
            </div>
          )}

          {/* Notes */}
          {(notes?.driverVisibleNotes || notes?.customerNotes || notes?.safetyInstructions || (notes?.driverNoteChips as string[] | undefined)?.length) && (
            <div className="text-sm space-y-1 p-3 rounded-xl bg-amber-50 border border-amber-100">
              {notes?.driverNoteChips && (notes.driverNoteChips as string[]).length > 0 && (
                <div className="flex gap-1 flex-wrap mb-1">
                  {(notes.driverNoteChips as string[]).map((c: string) => (
                    <span key={c} className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800 font-medium">
                      {c.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              )}
              {notes?.driverVisibleNotes  && <NoteRow label="Driver"       value={notes.driverVisibleNotes as string} />}
              {notes?.safetyInstructions  && <NoteRow label="Safety"       value={notes.safetyInstructions as string} />}
              {notes?.customerNotes       && <NoteRow label="Customer note" value={notes.customerNotes as string} />}
            </div>
          )}

          {/* Internal notes (set by reviewer) */}
          {r.internalOfficeNotes && (
            <div className="text-sm p-3 rounded-xl bg-slate-50 border">
              <NoteRow label="Internal notes" value={r.internalOfficeNotes} />
            </div>
          )}

          {/* Transport requirements */}
          {(() => {
            const tr = r.transportRequirementsData as Record<string, unknown>;
            const equip = (tr?.reqEquipment ?? []) as string[];
            const trailers = (tr?.trailerTypesAllowed ?? []) as string[];
            if (!tr?.reqBodyCategory && !tr?.reqBodyType && !equip.length && !trailers.length) return null;
            return (
              <div className="text-xs p-3 rounded-xl bg-indigo-50 border border-indigo-100">
                <div className="font-semibold text-indigo-800 mb-1">Transport requirements</div>
                {tr.reqBodyCategory && <div>Category: <span className="font-medium">{tr.reqBodyCategory as string}</span></div>}
                {tr.reqBodyType     && <div>Body type: <span className="font-medium">{(tr.reqBodyType as string).replace(/_/g, " ")}</span></div>}
                {equip.length > 0   && <div>Equipment: <span className="font-medium">{equip.join(", ")}</span></div>}
                {trailers.length > 0 && <div>Trailers: <span className="font-medium">{trailers.join(", ")}</span></div>}
              </div>
            );
          })()}

          {/* Actions — only for pending */}
          {r.status === "pending_review" && (
            <div className="flex flex-col gap-3 pt-2">
              {accepting ? (
                <div className="p-3 rounded-xl bg-green-50 border border-green-200 space-y-3">
                  <div className="font-semibold text-sm text-green-800">Accept this request</div>
                  <div>
                    <label className="text-xs font-medium" style={{ color: "#374151" }}>
                      Planner notes (optional — visible internally)
                    </label>
                    <textarea className="input mt-1 text-sm" rows={2} value={plannerNotes}
                      onChange={e => setPlannerNotes(e.target.value)}
                      placeholder="Ready to plan. Allocated to North route." />
                  </div>
                  <div className="flex gap-2">
                    <button className="btn btn-primary text-sm" onClick={accept} disabled={busy}>
                      {busy ? "Creating job…" : "✓ Accept & create job"}
                    </button>
                    <button className="btn btn-secondary text-sm" onClick={() => setAccepting(false)}>Cancel</button>
                  </div>
                </div>
              ) : rejecting ? (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 space-y-3">
                  <div className="font-semibold text-sm text-red-800">Reject this request</div>
                  <div>
                    <label className="text-xs font-medium" style={{ color: "#374151" }}>Reason</label>
                    <select className="input mt-1 text-sm" value={rejectReason} onChange={e => setRejectReason(e.target.value)}>
                      <option value="no_capacity">No capacity</option>
                      <option value="outside_service_area">Outside service area</option>
                      <option value="incomplete_information">Incomplete information</option>
                      <option value="pricing_issue">Pricing issue</option>
                      <option value="duplicate_request">Duplicate request</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium" style={{ color: "#374151" }}>Note (optional)</label>
                    <textarea className="input mt-1 text-sm" rows={2} value={rejectNotes}
                      onChange={e => setRejectNotes(e.target.value)}
                      placeholder="We cannot accommodate this date — please rebook for next week." />
                  </div>
                  <div className="flex gap-2">
                    <button className="btn text-sm" style={{ background: "#ef4444", color: "white" }}
                      onClick={reject} disabled={busy}>
                      {busy ? "Rejecting…" : "✗ Reject request"}
                    </button>
                    <button className="btn btn-secondary text-sm" onClick={() => setRejecting(false)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button className="btn btn-primary text-sm" onClick={() => setAccepting(true)}>
                    ✓ Accept
                  </button>
                  <button
                    className="btn text-sm border"
                    style={{ color: "#ef4444", borderColor: "#fca5a5" }}
                    onClick={() => setRejecting(true)}
                  >
                    ✗ Reject
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Rejection detail */}
          {r.status === "rejected" && r.rejectionReason && (
            <div className="text-sm p-3 rounded-xl bg-red-50 border border-red-100">
              <span className="font-semibold text-red-800">Rejected: </span>
              <span className="text-red-700">{r.rejectionReason.replace(/_/g, " ")}</span>
              {r.reviewNotes && <span className="ml-2 text-red-600">— {r.reviewNotes}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Stop detail block ─────────────────────────────────────────────────────────

function StopBlock({ title, stop: s }: { title: string; stop: RequestStop }) {
  const warnLevel = s.entranceWarningLevel;
  const warnColor = warnLevel === "danger" ? "#ef4444" : warnLevel === "warn" ? "#d97706" : "#22c55e";

  return (
    <div className="p-3 rounded-xl border bg-white">
      <div className="font-semibold mb-2 capitalize" style={{ color: "#0f172a" }}>{title}</div>
      {s.referenceNumber && (
        <div className="font-mono text-xs mb-1 px-1 py-0.5 bg-blue-50 text-blue-800 rounded inline-block">
          Ref: {s.referenceNumber}
        </div>
      )}
      <div className="text-xs space-y-0.5 mt-1" style={{ color: "#374151" }}>
        <div className="font-medium">{s.companySiteName}</div>
        <div>{s.addressLine1}{s.addressLine2 ? `, ${s.addressLine2}` : ""}, {s.townCity} {s.postcode}</div>
        <div className="mt-1">
          {s.date} · {s.earliestArrivalTime}–{s.latestArrivalTime}
          {s.exactAppointmentTime && <span className="ml-1 font-medium">({s.exactAppointmentTime} exact)</span>}
        </div>
        {s.estimatedServiceTimeMinutes > 0 && (
          <div>{s.estimatedServiceTimeMinutes} min est. on-site</div>
        )}
        {s.bookingRequired && (
          <div className="text-amber-700 font-medium">
            Booking required{s.bookingReference ? ` · ${s.bookingReference}` : ""}
          </div>
        )}
        {s.entranceLatitude != null && (
          <div className="mt-1" style={{ color: warnColor }}>
            ● Entrance: {s.entranceLatitude.toFixed(5)}, {s.entranceLongitude.toFixed(5)}
            {warnLevel === "warn"   && " ⚠ Pin >1mi from postcode"}
            {warnLevel === "danger" && " ⚠⚠ Pin far from postcode — verify"}
          </div>
        )}
        {s.entranceInstructions && (
          <div className="mt-1 italic text-xs" style={{ color: "#6b7280" }}>{s.entranceInstructions}</div>
        )}
        {s.handlingMethods && s.handlingMethods.length > 0 && (
          <div className="flex gap-1 flex-wrap mt-1">
            {s.handlingMethods.map((m: string) => (
              <span key={m} className="px-1.5 py-0.5 rounded bg-slate-100 text-xs">{m.replace(/_/g, " ")}</span>
            ))}
          </div>
        )}
        {s.siteRestrictions && s.siteRestrictions.length > 0 && (
          <div className="flex gap-1 flex-wrap mt-1">
            {s.siteRestrictions.map((r: string) => (
              <span key={r} className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-xs border border-amber-200">{r.replace(/_/g, " ")}</span>
            ))}
          </div>
        )}
        {s.contactName && (
          <div className="mt-1 text-xs text-muted">
            Contact: {s.contactName}{s.contactPhone ? ` · ${s.contactPhone}` : ""}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2 rounded-lg bg-slate-50 border">
      <div className="text-xs" style={{ color: "#9ca3af" }}>{label}</div>
      <div className="font-semibold text-xs capitalize" style={{ color: "#0f172a" }}>{value}</div>
    </div>
  );
}

function NoteRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-xs">
      <span className="font-semibold">{label}: </span>
      <span style={{ color: "#374151" }}>{value}</span>
    </div>
  );
}
