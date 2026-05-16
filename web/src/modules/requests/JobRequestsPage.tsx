/**
 * Internal review queue for incoming transport requests.
 * Planner/office staff see all pending requests and can accept or reject.
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { jobRequestsApi, type JobRequest, type RequestStop, type ExceptionPolicyData } from "../../api/jobRequests";

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

// Guard API blobs from older rows or malformed responses.
function toStops(raw: unknown): RequestStop[] {
  return Array.isArray(raw) ? raw as unknown as RequestStop[] : [];
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
    <div className="p-4 sm:p-6 space-y-4">
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

      {/* suppress unused total warning */}
      {total === -1 && null}
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function RequestRow({ request: r, onRefresh }: { request: JobRequest; onRefresh: () => void }) {
  const navigate    = useNavigate();
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("no_capacity");
  const [rejectNotes,  setRejectNotes]  = useState("");
  const [accepting,    setAccepting]    = useState(false);
  const [plannerNotes, setPlannerNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState("");
  const [showModal, setShowModal] = useState(false);

  const stops   = toStops(r.stops);
  const load    = r.loadData;

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
    } catch (e: unknown) { setErr((e as Error).message); setBusy(false); }
  }

  async function reject() {
    setBusy(true); setErr("");
    try {
      await jobRequestsApi.reject(r.id, rejectReason, rejectNotes);
      onRefresh();
    } catch (e: unknown) { setErr((e as Error).message); setBusy(false); }
  }

  return (
    <>
      <div className={"card border " + (r.status === "pending_review" ? "border-amber-200" : "border-border")}>
        {/* Summary row */}
        <div className="flex items-start gap-3 p-4">
          <div className="flex-1 min-w-0">
            {/* Name + badges */}
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
                  onClick={() => navigate(`/app/jobs/${r.convertedJob!.id}`)}
                >
                  {r.convertedJob.jobReference ?? `Job #${r.convertedJob.id}`}
                </button>
              )}
            </div>

            {/* Contact + route */}
            <div className="text-xs mt-1 space-x-2" style={{ color: "#6b7280" }}>
              <span>{r.contactName} · {r.contactPhone}</span>
              <span>·</span>
              <span>
                {collections.length > 0
                  ? <>{collections[0].siteName}{collections.length > 1 && <span className="ml-1 text-blue-600 font-medium">+{collections.length - 1}</span>}</>
                  : firstStop?.siteName ?? "?"
                }
                {" → "}
                {deliveries.length > 0
                  ? <>{deliveries[deliveries.length - 1].siteName}{deliveries.length > 1 && <span className="ml-1 text-blue-600 font-medium">+{deliveries.length - 1}</span>}</>
                  : lastStop?.siteName ?? "?"
                }
              </span>
            </div>

            {/* Date + goods */}
            <div className="text-xs mt-0.5" style={{ color: "#6b7280" }}>
              {firstStop && <span>{firstStop.date} · {firstStop.earliestArrivalTime}–{firstStop.latestArrivalTime}</span>}
              {lastStop && firstStop?.date !== lastStop.date && (
                <><span className="mx-1">→</span><span>{lastStop.date}</span></>
              )}
              {load?.goodsDescription && <><span className="mx-2">·</span><span>{load.goodsDescription}</span></>}
              {load?.quantity && <span> · {load.quantity} {load.unit}</span>}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <button
                className="btn btn-secondary text-xs px-3 py-1"
                onClick={() => setShowModal(true)}
              >
                Full details
              </button>
              {r.status === "pending_review" && !accepting && !rejecting && (
                <>
                  <button className="btn btn-primary text-xs px-3 py-1" onClick={() => setAccepting(true)}>
                    ✓ Accept
                  </button>
                  <button
                    className="btn text-xs px-3 py-1 border"
                    style={{ color: "#ef4444", borderColor: "#fca5a5" }}
                    onClick={() => setRejecting(true)}
                  >
                    ✗ Reject
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Source + time */}
          <div className="text-right text-xs shrink-0" style={{ color: "#9ca3af" }}>
            <div>{SOURCE_LABEL[r.source] ?? r.source}</div>
            <div>{timeSince(r.createdAt)}</div>
          </div>
        </div>

        {/* Accept/reject panels */}
        {(accepting || rejecting || err) && (
          <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
            {err && <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{err}</div>}

            {accepting && (
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
            )}

            {rejecting && (
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

        {/* Rejection detail when not in panels block */}
        {!accepting && !rejecting && !err && r.status === "rejected" && r.rejectionReason && (
          <div className="border-t border-border px-4 pb-4 pt-3">
            <div className="text-sm p-3 rounded-xl bg-red-50 border border-red-100">
              <span className="font-semibold text-red-800">Rejected: </span>
              <span className="text-red-700">{r.rejectionReason.replace(/_/g, " ")}</span>
              {r.reviewNotes && <span className="ml-2 text-red-600">— {r.reviewNotes}</span>}
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <RequestDetailModal request={r} onClose={() => setShowModal(false)} />
      )}
    </>
  );
}

// ── Detail modal ──────────────────────────────────────────────────────────────

function RequestDetailModal({ request: r, onClose }: { request: JobRequest; onClose: () => void }) {
  const navigate = useNavigate();
  const stops   = toStops(r.stops);
  const load    = r.loadData;
  const billing = r.billingData;
  const notes   = r.notesData;
  const spec    = r.specialRequirementsData;
  const tr      = r.transportRequirementsData;
  const ep      = (r as unknown as { exceptionPolicyData: ExceptionPolicyData | null }).exceptionPolicyData;

  const hasTransport = !!(
    tr?.plannerDecides || tr?.reqBodyCategory ||
    (tr?.reqBodyTypes?.length) || (tr?.reqEquipment?.length) || (tr?.trailerTypesAllowed?.length)
  );

  const hasException = !!(
    ep?.rejectionAction || ep?.alternativeReturnSiteName || ep?.approvalContactName ||
    ep?.photosRequiredOnRejection || ep?.rejectionSignatureRequired || ep?.rejectionNotes
  );

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" />

      {/* Panel */}
      <div
        className="bg-white w-full max-w-2xl h-full overflow-y-auto flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-base font-bold" style={{ color: "#0f172a" }}>{r.customerName}</h2>
            <div className="text-xs mt-0.5" style={{ color: "#6b7280" }}>
              {SOURCE_LABEL[r.source] ?? r.source} · {timeSince(r.createdAt)}
              {r.convertedJob && (
                <>
                  {" · "}
                  <button
                    className="text-indigo-600 underline"
                    onClick={() => navigate(`/app/jobs/${r.convertedJob!.id}`)}
                  >
                    {r.convertedJob.jobReference ?? `Job #${r.convertedJob.id}`}
                  </button>
                </>
              )}
            </div>
          </div>
          <button
            className="ml-4 text-xl leading-none text-slate-400 hover:text-slate-700"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-6 flex-1">

          {/* Requester */}
          <Section title="Requester">
            <Field label="Company" value={r.requesterData?.customerCompanyName ?? r.customerName} />
            <Field label="Contact" value={r.contactName} />
            <Field label="Phone"   value={r.contactPhone} />
            {r.contactEmail && <Field label="Email" value={r.contactEmail} />}
            {r.requesterData?.customerRef && <Field label="Customer ref" value={r.requesterData.customerRef} />}
            {notes?.customerNotes && <Field label="Customer notes" value={notes.customerNotes} />}
          </Section>

          {/* Stops */}
          <Section title="Stops">
            <div className="space-y-4">
              {stops.map((stop, i) => (
                <DetailedStopBlock
                  key={i}
                  title={stops.length > 1
                    ? `${STOP_TYPE_LABEL[stop.type] ?? "Stop"} ${stops.filter((s, j) => s.type === stop.type && j <= i).length}`
                    : (STOP_TYPE_LABEL[stop.type] ?? "Stop")
                  }
                  stop={stop}
                />
              ))}
            </div>
          </Section>

          {/* Load */}
          <Section title="Load">
            <Field label="Goods type"        value={load?.goodsType?.replace(/_/g, " ") ?? ""} />
            {load?.goodsTypeOther && <Field label="Goods type (other)" value={load.goodsTypeOther} />}
            <Field label="Description"       value={load?.goodsDescription ?? ""} />
            <Field label="Quantity"          value={`${load?.quantity ?? ""} ${load?.unit ?? ""}`} />
            {load?.estimatedWeight != null && <Field label="Est. weight" value={`${load.estimatedWeight} kg`} />}

            {/* Pallets */}
            {load?.palletCount != null && <Field label="Pallet count" value={String(load.palletCount)} />}
            {load?.palletType && <Field label="Pallet type" value={load.palletTypeOther ?? load.palletType} />}
            {load?.stackable != null && <Field label="Stackable" value={load.stackable ? "Yes" : "No"} />}

            {/* Roll cages */}
            {load?.cageCount != null && <Field label="Cage count" value={String(load.cageCount)} />}
            {load?.cageFolded != null && <Field label="Cage folded" value={load.cageFolded ? "Yes" : "No"} />}

            {/* Building materials */}
            {load?.buildingMaterialType && <Field label="Material type" value={load.buildingMaterialType} />}
            {load?.buildingMaterialPalletised != null && <Field label="Palletised" value={load.buildingMaterialPalletised ? "Yes" : "No"} />}
            {load?.buildingMaterialLongestItem && <Field label="Longest item" value={load.buildingMaterialLongestItem} />}
            {load?.buildingMaterialWeatherSensitive != null && <Field label="Weather sensitive" value={load.buildingMaterialWeatherSensitive ? "Yes" : "No"} />}

            {/* Liquid */}
            {load?.liquidProductType && <Field label="Liquid product" value={load.liquidProductType} />}
            {load?.liquidVolumeLitres != null && <Field label="Volume" value={`${load.liquidVolumeLitres} L`} />}
            {load?.liquidFoodGrade != null && <Field label="Food grade" value={load.liquidFoodGrade ? "Yes" : "No"} />}

            {/* General */}
            {load?.generalPackagingType && <Field label="Packaging type" value={load.generalPackagingType} />}
            {load?.generalPieceCount != null && <Field label="Piece count" value={String(load.generalPieceCount)} />}

            {/* Machinery */}
            {load?.dimensions && <Field label="Dimensions" value={load.dimensions} />}
            {load?.machineryPieceWeight != null && <Field label="Piece weight" value={`${load.machineryPieceWeight} kg`} />}
            {load?.machineryLiftingPoints != null && <Field label="Lifting points" value={load.machineryLiftingPoints ? "Yes" : "No"} />}
            {load?.machinerySkidMounted != null && <Field label="Skid mounted" value={load.machinerySkidMounted ? "Yes" : "No"} />}
            {load?.craneRequired != null && <Field label="Crane required" value={load.craneRequired ? "Yes" : "No"} />}

            {/* Steel */}
            {load?.steelPieceCount != null && <Field label="Steel piece count" value={String(load.steelPieceCount)} />}
            {load?.steelWidth && <Field label="Steel width" value={load.steelWidth} />}

            {/* Bulk */}
            {load?.tippingRequired != null && <Field label="Tipping required" value={load.tippingRequired ? "Yes" : "No"} />}

            {/* Food */}
            {load?.temperatureRange && <Field label="Temperature range" value={load.temperatureRange} />}
            {load?.chilledFrozenAmbient && <Field label="Chilled/frozen/ambient" value={load.chilledFrozenAmbient} />}
            {load?.foodPreCooled != null && <Field label="Pre-cooled" value={load.foodPreCooled ? "Yes" : "No"} />}

            {/* Vehicles */}
            {load?.vehicleCount != null && <Field label="Vehicle count" value={String(load.vehicleCount)} />}
            {load?.vehicleMakeModel && <Field label="Make/model" value={load.vehicleMakeModel} />}
            {load?.vehicleKeysWithVehicle != null && <Field label="Keys with vehicle" value={load.vehicleKeysWithVehicle ? "Yes" : "No"} />}
            {load?.driveable != null && <Field label="Driveable" value={load.driveable ? "Yes" : "No"} />}

            {/* Containers */}
            {load?.containerSize && <Field label="Container size" value={load.containerSizeOther ?? load.containerSize} />}
            {load?.loadedOrEmpty && <Field label="Loaded/empty" value={load.loadedOrEmpty} />}
            {load?.containerNumber && <Field label="Container number" value={load.containerNumber} />}

            {/* All types */}
            {load?.loadHeight && <Field label="Load height" value={load.loadHeight} />}
            {load?.canSplitShipment && <Field label="Can split shipment" value={load.canSplitShipment} />}
            {load?.securingRequirements && load.securingRequirements.length > 0 && (
              <div>
                <div className="text-xs font-medium mb-1" style={{ color: "#6b7280" }}>Securing requirements</div>
                <Chips items={load.securingRequirements} />
              </div>
            )}
            {load?.loadNotes && <Field label="Load notes" value={load.loadNotes} />}
          </Section>

          {/* Special requirements */}
          {spec?.items && spec.items.length > 0 && (
            <Section title="Special requirements">
              <Chips items={spec.items} />
              {spec.adrClass && <Field label="ADR class" value={spec.adrClass} />}
              {spec.unNumber && <Field label="UN number" value={spec.unNumber} />}
              {spec.packingGroup && <Field label="Packing group" value={spec.packingGroup} />}
              {spec.hazardousQuantityKg != null && <Field label="Hazardous qty" value={`${spec.hazardousQuantityKg} kg`} />}
              {spec.hazardousPaperworkAvailable != null && (
                <Field label="Paperwork available" value={spec.hazardousPaperworkAvailable ? "Yes" : "No"} />
              )}
              {spec.oversizedWidth && <Field label="Oversized width" value={spec.oversizedWidth} />}
              {spec.oversizedHeight && <Field label="Oversized height" value={spec.oversizedHeight} />}
              {spec.oversizedLength && <Field label="Oversized length" value={spec.oversizedLength} />}
            </Section>
          )}

          {/* Transport requirements */}
          {hasTransport && (
            <Section title="Transport requirements">
              {tr?.plannerDecides && <Field label="Planner decides" value="Yes" />}
              {tr?.reqBodyCategory && <Field label="Body category" value={tr.reqBodyCategory} />}
              {tr?.reqBodyTypes && tr.reqBodyTypes.length > 0 && (
                <div>
                  <div className="text-xs font-medium mb-1" style={{ color: "#6b7280" }}>Body types</div>
                  <Chips items={tr.reqBodyTypes} />
                </div>
              )}
              {tr?.reqEquipment && tr.reqEquipment.length > 0 && (
                <div>
                  <div className="text-xs font-medium mb-1" style={{ color: "#6b7280" }}>Equipment</div>
                  <Chips items={tr.reqEquipment} />
                </div>
              )}
              {tr?.trailerTypesAllowed && tr.trailerTypesAllowed.length > 0 && (
                <div>
                  <div className="text-xs font-medium mb-1" style={{ color: "#6b7280" }}>Trailer types</div>
                  <Chips items={tr.trailerTypesAllowed} />
                </div>
              )}
            </Section>
          )}

          {/* Billing */}
          <Section title="Billing">
            {billing?.declaredGoodsValue != null && (
              <Field label="Declared goods value" value={`£${billing.declaredGoodsValue.toLocaleString()}`} />
            )}
            {billing?.purchaseOrderNumber && <Field label="PO number" value={billing.purchaseOrderNumber} />}
            {billing?.billingReference && <Field label="Billing reference" value={billing.billingReference} />}
          </Section>

          {/* Notes */}
          <Section title="Notes">
            {notes?.driverNoteChips && notes.driverNoteChips.length > 0 && (
              <div>
                <div className="text-xs font-medium mb-1" style={{ color: "#6b7280" }}>Driver note chips</div>
                <Chips items={notes.driverNoteChips} />
              </div>
            )}
            {notes?.driverVisibleNotes && <Field label="Driver notes" value={notes.driverVisibleNotes} />}
            {notes?.safetyInstructions && <Field label="Safety instructions" value={notes.safetyInstructions} />}
          </Section>

          {/* Rejection & return policy */}
          {hasException && (
            <Section title="Rejection & return policy">
              {ep?.rejectionAction && <Field label="Rejection action" value={ep.rejectionAction} />}
              {ep?.alternativeReturnSiteName && <Field label="Alt. return site" value={ep.alternativeReturnSiteName} />}
              {ep?.alternativeReturnAddress && <Field label="Alt. address" value={ep.alternativeReturnAddress} />}
              {ep?.alternativeReturnAddressLine2 && <Field label="Alt. address line 2" value={ep.alternativeReturnAddressLine2} />}
              {ep?.alternativeReturnTown && <Field label="Alt. town" value={ep.alternativeReturnTown} />}
              {ep?.alternativeReturnCounty && <Field label="Alt. county" value={ep.alternativeReturnCounty} />}
              {ep?.alternativeReturnPostcode && <Field label="Alt. postcode" value={ep.alternativeReturnPostcode} />}
              {ep?.alternativeReturnCountry && <Field label="Alt. country" value={ep.alternativeReturnCountry} />}
              {ep?.alternativeReturnNavigationInstructions && (
                <Field label="Alt. nav instructions" value={ep.alternativeReturnNavigationInstructions} />
              )}
              {ep?.alternativeReturnContactName && <Field label="Alt. contact" value={ep.alternativeReturnContactName} />}
              {ep?.alternativeReturnContactPhone && <Field label="Alt. phone" value={ep.alternativeReturnContactPhone} />}
              {ep?.approvalContactName && <Field label="Approval contact" value={ep.approvalContactName} />}
              {ep?.approvalContactPhone && <Field label="Approval phone" value={ep.approvalContactPhone} />}
              {ep?.photosRequiredOnRejection != null && (
                <Field label="Photos required on rejection" value={ep.photosRequiredOnRejection ? "Yes" : "No"} />
              )}
              {ep?.rejectionSignatureRequired != null && (
                <Field label="Signature required" value={ep.rejectionSignatureRequired ? "Yes" : "No"} />
              )}
              {ep?.rejectionNotes && <Field label="Rejection notes" value={ep.rejectionNotes} />}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Expanded stop block (used inside modal) ────────────────────────────────────

function DetailedStopBlock({ title, stop: s }: { title: string; stop: RequestStop }) {
  const warnLevel = s.entranceWarningLevel;
  const warnColor = warnLevel === "danger" ? "#ef4444" : warnLevel === "warn" ? "#d97706" : "#22c55e";

  const ppeItems = s.accessRequirements?.filter(r => r.startsWith("ppe_")) ?? [];
  const accessItems = s.accessRequirements?.filter(r => !r.startsWith("ppe_")) ?? [];

  return (
    <div className="p-4 rounded-xl border bg-slate-50 space-y-2">
      <div className="font-semibold capitalize" style={{ color: "#0f172a" }}>{title}</div>

      {s.referenceNumber && (
        <div className="font-mono text-xs px-1 py-0.5 bg-blue-50 text-blue-800 rounded inline-block">
          Ref: {s.referenceNumber}
        </div>
      )}

      {/* Site + address */}
      <Field label="Site" value={s.siteName} />
      <Field label="Address" value={[
        s.street,
        s.addressLine2,
        s.town,
        s.countyRegion,
        s.postcode,
        s.country,
      ].filter(Boolean).join(", ")} />

      {/* Pin */}
      {s.lat != null && (
        <div className="text-xs" style={{ color: warnColor }}>
          <span className="font-medium">Entrance pin: </span>
          {s.lat.toFixed(5)}, {s.lng.toFixed(5)}
          {warnLevel === "warn"   && " ⚠ Pin >1mi from postcode"}
          {warnLevel === "danger" && " ⚠⚠ Pin far from postcode — verify"}
        </div>
      )}

      {s.navigationInstructions && <Field label="Nav instructions" value={s.navigationInstructions} />}

      {/* Schedule */}
      <Field label="Date" value={s.date} />
      <Field label="Arrival window" value={`${s.earliestArrivalTime} – ${s.latestArrivalTime}`} />
      {s.bookedTime && <Field label="Booked time" value={s.bookedTime} />}
      {s.unloadingAllowanceMinutes > 0 && (
        <Field label="Service time" value={`${s.unloadingAllowanceMinutes} min`} />
      )}
      {s.bookingRequired && (
        <Field label="Booking required" value={s.bookingRef ? `Yes · ${s.bookingRef}` : "Yes"} />
      )}
      {s.openingHours && <Field label="Opening hours" value={s.openingHours} />}

      {/* Quantity at stop */}
      {s.stopQuantity != null && (
        <Field label="Stop quantity" value={`${s.stopQuantity} ${s.stopQuantityUnit ?? ""}`} />
      )}

      {/* Exchange */}
      {(s.exchangeDropQty != null || s.exchangeCollectQty != null) && (
        <Field
          label="Exchange"
          value={`Drop: ${s.exchangeDropQty ?? 0} · Collect: ${s.exchangeCollectQty ?? 0}${s.exchangeUnit ? ` ${s.exchangeUnit}` : ""}`}
        />
      )}

      {s.loadReadiness && <Field label="Load readiness" value={s.loadReadiness} />}

      {/* Handling methods */}
      {s.handlingMethods && s.handlingMethods.length > 0 && (
        <div>
          <div className="text-xs font-medium mb-1" style={{ color: "#6b7280" }}>Handling methods</div>
          <Chips items={s.handlingMethods} />
        </div>
      )}

      {/* Site access requirements */}
      {accessItems.length > 0 && (
        <div>
          <div className="text-xs font-medium mb-1" style={{ color: "#6b7280" }}>Site access requirements</div>
          <Chips items={accessItems} className="bg-amber-50 text-amber-700 border border-amber-200" />
        </div>
      )}

      {/* PPE requirements */}
      {ppeItems.length > 0 && (
        <div>
          <div className="text-xs font-medium mb-1" style={{ color: "#6b7280" }}>PPE requirements</div>
          <Chips items={ppeItems} className="bg-orange-50 text-orange-700 border border-orange-200" />
        </div>
      )}

      {/* Proof requirements */}
      {s.proofRequirements && s.proofRequirements.length > 0 && (
        <div>
          <div className="text-xs font-medium mb-1" style={{ color: "#6b7280" }}>Proof requirements</div>
          <Chips items={s.proofRequirements} />
        </div>
      )}

      {/* Restrictions */}
      {s.heightRestrictionValue && <Field label="Height restriction" value={s.heightRestrictionValue} />}
      {s.weightRestrictionValue && <Field label="Weight restriction" value={s.weightRestrictionValue} />}
      {s.lengthRestrictionValue && <Field label="Length restriction" value={s.lengthRestrictionValue} />}

      {/* Site contact */}
      {s.contactName && <Field label="Site contact" value={s.contactName} />}
      {s.contactPhone && <Field label="Site phone" value={s.contactPhone} />}
      {s.contactEmail && <Field label="Site email" value={s.contactEmail} />}

      {s.stopNotes && <Field label="Stop notes" value={s.stopNotes} />}
    </div>
  );
}

// ── Small summary stop block (kept for backward compat) ───────────────────────

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
        <div className="font-medium">{s.siteName}</div>
        <div>{s.street}{s.addressLine2 ? `, ${s.addressLine2}` : ""}, {s.town} {s.postcode}</div>
        <div className="mt-1">
          {s.date} · {s.earliestArrivalTime}–{s.latestArrivalTime}
          {s.bookedTime && <span className="ml-1 font-medium">({s.bookedTime} exact)</span>}
        </div>
        {s.unloadingAllowanceMinutes > 0 && (
          <div>{s.unloadingAllowanceMinutes} min est. on-site</div>
        )}
        {s.bookingRequired && (
          <div className="text-amber-700 font-medium">
            Booking required{s.bookingRef ? ` · ${s.bookingRef}` : ""}
          </div>
        )}
        {s.lat != null && (
          <div className="mt-1" style={{ color: warnColor }}>
            ● Entrance: {s.lat.toFixed(5)}, {s.lng.toFixed(5)}
            {warnLevel === "warn"   && " ⚠ Pin >1mi from postcode"}
            {warnLevel === "danger" && " ⚠⚠ Pin far from postcode — verify"}
          </div>
        )}
        {s.navigationInstructions && (
          <div className="mt-1 italic text-xs" style={{ color: "#6b7280" }}>{s.navigationInstructions}</div>
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

// ── Modal helpers ─────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-bold mb-3 pb-1 border-b border-border" style={{ color: "#0f172a" }}>
        {title}
      </h3>
      <div className="space-y-2">
        {children}
      </div>
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

function Chips({ items, className }: { items: string[]; className?: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="flex gap-1 flex-wrap">
      {items.map(item => (
        <span
          key={item}
          className={"px-2 py-0.5 rounded-full text-xs font-medium " + (className ?? "bg-slate-100 text-slate-700")}
        >
          {item.replace(/_/g, " ")}
        </span>
      ))}
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

// Suppress unused component warnings — these are kept for potential future use
void StopBlock;
void InfoChip;
void NoteRow;
