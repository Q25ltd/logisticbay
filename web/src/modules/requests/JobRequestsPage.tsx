/**
 * Internal review queue for incoming transport requests.
 * Planner/office staff see all pending requests and can accept or reject.
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { jobRequestsApi, type JobRequest } from "../../api/jobRequests";

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

function timeSince(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60)  return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
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
  const navigate   = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("no_capacity");
  const [rejectNotes, setRejectNotes] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [plannerNotes, setPlannerNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const p = r.pickupData   as any;
  const d = r.deliveryData as any;
  const l = r.loadData     as any;

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

  const pickupWarn = p?.entranceWarningLevel;
  const delivWarn  = d?.entranceWarningLevel;
  const hasWarn    = pickupWarn === "warn" || pickupWarn === "danger" || delivWarn === "warn" || delivWarn === "danger";

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
              {r.customerCompanyName}
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
            <span>{p?.siteName ?? "?"} → {d?.siteName ?? "?"}</span>
          </div>
          <div className="text-xs mt-0.5" style={{ color: "#6b7280" }}>
            <span>{p?.pickupDate ?? "?"} collect</span>
            <span className="mx-1">→</span>
            <span>{d?.deliveryDate ?? "?"} deliver</span>
            <span className="mx-2">·</span>
            <span>{l?.goodsDescription ?? "?"}</span>
            {l?.quantity && <span> · {l.quantity} {l.unit}</span>}
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

          {/* Two-column: collection + delivery */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <SiteBlock
              title="Collection"
              site={p}
              reference={r.collectionReference}
              type="pickup"
            />
            <SiteBlock
              title="Delivery"
              site={d}
              reference={r.deliveryReference}
              type="delivery"
            />
          </div>

          {/* Load */}
          <div className="text-sm p-3 rounded-xl bg-slate-50 border">
            <div className="font-semibold mb-1">Load</div>
            <div>{l?.goodsDescription}</div>
            <div className="text-xs mt-1 text-muted">
              {l?.quantity} {l?.unit}
              {l?.estimatedWeight && <span> · {l.estimatedWeight}kg est.</span>}
              {l?.hazardousGoods && <span className="ml-2 font-semibold text-red-600">⚠ ADR {l.adrClass}</span>}
              {l?.temperatureControlled && <span className="ml-2">❄ {l.temperatureRange}</span>}
            </div>
            {l?.loadNotes && <div className="text-xs mt-1 italic">{l.loadNotes}</div>}
          </div>

          {/* References/commercial */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {r.purchaseOrderNumber && <InfoChip label="PO Number" value={r.purchaseOrderNumber} />}
            {r.billingReference && <InfoChip label="Billing ref" value={r.billingReference} />}
            {r.declaredGoodsValue != null && <InfoChip label="Goods value" value={`£${r.declaredGoodsValue.toLocaleString()}`} />}
            <InfoChip label="Pricing" value={r.pricingType.replace(/_/g, " ")} />
          </div>

          {/* Notes */}
          {(r.driverVisibleNotes || r.customerNotes || r.specialInstructions || r.safetyInstructions) && (
            <div className="text-sm space-y-1 p-3 rounded-xl bg-amber-50 border border-amber-100">
              {r.driverVisibleNotes   && <NoteRow label="Driver" value={r.driverVisibleNotes} />}
              {r.safetyInstructions   && <NoteRow label="Safety" value={r.safetyInstructions} />}
              {r.specialInstructions  && <NoteRow label="Special" value={r.specialInstructions} />}
              {r.customerNotes        && <NoteRow label="Customer note" value={r.customerNotes} />}
            </div>
          )}

          {/* Actions — only for pending */}
          {r.status === "pending_review" && (
            <div className="flex flex-col gap-3 pt-2">
              {/* Accept panel */}
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

function SiteBlock({ title, site, reference, type }: {
  title: string; site: any; reference: string; type: "pickup" | "delivery";
}) {
  const warnLevel = site?.entranceWarningLevel;
  const warnColor = warnLevel === "danger" ? "#ef4444" : warnLevel === "warn" ? "#d97706" : "#22c55e";
  const dateField = type === "pickup" ? site?.pickupDate : site?.deliveryDate;
  const loadField = type === "pickup" ? site?.estimatedLoadingMinutes : site?.estimatedUnloadingMinutes;
  const loadLabel = type === "pickup" ? "loading" : "unloading";

  return (
    <div className="p-3 rounded-xl border bg-white">
      <div className="font-semibold mb-2" style={{ color: "#0f172a" }}>{title}</div>
      <div className="font-mono text-xs mb-1 px-1 py-0.5 bg-blue-50 text-blue-800 rounded inline-block">
        Ref: {reference}
      </div>
      <div className="text-xs space-y-0.5 mt-1" style={{ color: "#374151" }}>
        <div className="font-medium">{site?.siteName}</div>
        <div>{site?.addressLine1}, {site?.townCity} {site?.postcode}</div>
        {dateField && <div className="mt-1">{dateField} · {site?.earliestTime}–{site?.latestTime}</div>}
        {loadField && <div>{loadField} min est. {loadLabel}</div>}
        {site?.entranceLat != null && (
          <div className="mt-1" style={{ color: warnColor }}>
            ● Entrance: {(site.entranceLat as number).toFixed(5)}, {(site.entranceLng as number).toFixed(5)}
            {warnLevel === "warn"   && " ⚠ Pin >1mi from postcode"}
            {warnLevel === "danger" && " ⚠⚠ Pin far from postcode — verify"}
          </div>
        )}
        {site?.entranceInstructions && (
          <div className="mt-1 italic text-xs" style={{ color: "#6b7280" }}>{site.entranceInstructions}</div>
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
