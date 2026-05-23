import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { jobsApi } from "../../api/jobs";
import type { Job, JobPart } from "../../types";
import RepeatJobModal from "./RepeatJobModal";
import { Badge } from "../../components/Badge";

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function fmtWindow(start: string | null | undefined, end: string | null | undefined): string {
  if (!start) return "";
  const s  = new Date(start);
  const st = s.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const date = s.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  if (!end) return `${date} from ${st}`;
  const et = new Date(end).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${st}–${et}`;
}

// ── Constants ────────────────────────────────────────────────────────────────

const STOP_TYPE_LABEL: Record<string, string> = {
  pickup:     "Pickup",
  dropoff:    "Drop-off",
  collection: "Collection",
  delivery:   "Delivery",
  handover:   "Handover",
  yard:       "Yard",
  depot:      "Depot",
};

const STOP_DOT_COLOUR: Record<string, string> = {
  pickup:     "bg-blue-500",
  collection: "bg-blue-500",
  dropoff:    "bg-green-500",
  delivery:   "bg-green-500",
  handover:   "bg-violet-500",
  yard:       "bg-slate-400",
  depot:      "bg-slate-400",
};

const PLANNING_STATUS_LABEL: Record<string, { label: string; colour: string }> = {
  no_stops:         { label: "No stops",          colour: "text-slate-400" },
  not_planned:      { label: "Not in a run",       colour: "text-amber-600" },
  partially_planned:{ label: "Partially assigned", colour: "text-indigo-600" },
  planned:          { label: "Fully assigned",     colour: "text-blue-600"  },
  partially_done:   { label: "Partially done",     colour: "text-teal-600"  },
  done:             { label: "All done",            colour: "text-green-600" },
};

const JOB_STATUSES = [
  "draft", "pending_review", "ready_to_plan", "in_planning",
  "planned", "in_progress", "completed", "cancelled",
] as const;

const JOB_STATUS_LABEL: Record<string, string> = {
  draft:          "Draft",
  pending_review: "Pending review",
  ready_to_plan:  "Ready to plan",
  in_planning:    "In planning",
  planned:        "Planned",
  in_progress:    "In progress",
  completed:      "Completed",
  cancelled:      "Cancelled",
};

const JOB_TYPE_LABEL: Record<string, string> = {
  single_drop:   "Single drop",
  multi_drop:    "Multi-drop",
  multi_collect: "Multi-collect",
  collection:    "Collection",
  delivery:      "Delivery",
  express:       "Express",
  groupage:      "Groupage",
  container:     "Container",
};

const CAN_SPLIT_LABEL: Record<string, string> = {
  must_stay_together: "Must stay together",
  can_split:          "Can split",
  preferred_together: "Prefer together",
};

const LOCATION_TYPE_LABEL: Record<string, string> = {
  warehouse:        "Warehouse",
  distribution_centre: "Distribution centre",
  retail:           "Retail",
  residential:      "Residential",
  industrial:       "Industrial",
  construction:     "Construction site",
  farm:             "Farm",
  port:             "Port / terminal",
  airport:          "Airport",
  other:            "Other",
};

const STOP_STATUS_LABEL: Record<string, string> = {
  pending:   "Pending",
  completed: "Completed",
  skipped:   "Skipped",
  failed:    "Failed",
  arrived:   "Arrived",
  loading:   "Loading",
};

/** "some_snake_case" → "Some snake case" */
function cap(s: string): string {
  const spaced = s.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function JobDetailPage() {
  const { id }      = useParams<{ id: string }>();
  const navigate    = useNavigate();
  const [job,         setJob]         = useState<Job | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [toast,       setToast]       = useState("");
  const [showRepeat,  setShowRepeat]  = useState(false);

  async function load() {
    const numId = parseInt(id!, 10);
    if (!id || isNaN(numId)) { setError("Job not found."); setLoading(false); return; }
    setLoading(true); setError("");
    try {
      setJob(await jobsApi.get(numId));
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  if (loading) return (
    <div className="p-6 text-center text-muted animate-pulse">Loading…</div>
  );
  if (error) return (
    <div className="p-6">
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>
    </div>
  );
  if (!job) return null;

  const stops = [...(job.stops ?? [])].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  const planningInfo = PLANNING_STATUS_LABEL[job.planningStatus ?? "not_planned"]
    ?? PLANNING_STATUS_LABEL.not_planned;

  const hasLoad = !!(job.goodsDescription || job.goodsType || job.quantity != null || job.weight != null ||
    (job.loadData && Object.keys(job.loadData as object).length > 0));
  const hasVehicle = !!(job.vehicleCategory || (job.bodyTypes?.length) || job.minGvwClass ||
    (job.equipment as string[] | null)?.length || (job.trailersAllowed as string[] | null)?.length);
  const hasNotes = !!(job.plannerNotes || job.internalNotes || job.driverVisibleNotes ||
    job.safetyInstructions || (job.driverNoteChips as string[] | null)?.length);
  const hasException = !!(
    (job.failureAction && job.failureAction !== "call_assistance") ||
    job.assistanceNote || job.approvalContactName || job.alternativeReturnAddress
  );

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white text-sm px-4 py-2 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <button
            onClick={() => navigate("/app/jobs")}
            className="text-xs mb-2 block hover:underline"
            style={{ color: "#6b7280" }}
          >
            ← Back to Jobs
          </button>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-black" style={{ color: "#0f172a" }}>
              {job.jobReference || `Job #${job.id}`}
            </h1>
            <Badge status={job.status} />
            {job.priority && job.priority !== "normal" && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                job.priority === "urgent" ? "bg-red-100 text-red-700"
                : job.priority === "high" ? "bg-orange-100 text-orange-700"
                : "bg-slate-100 text-slate-500"
              }`}>
                {job.priority.toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-sm" style={{ color: "#6b7280" }}>
            {job.customerName && <span>{job.customerName}</span>}
            {job.plannedDate && (
              <><span>·</span><span>📅 {fmtDate(job.plannedDate)}</span></>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            className="btn btn-secondary text-sm"
            onClick={() => navigate(`/app/jobs/${job.id}/edit`)}
          >
            Edit job
          </button>
          <button
            className="btn bg-green-600 hover:bg-green-700 text-white text-sm font-semibold"
            onClick={() => setShowRepeat(true)}
          >
            🔁 Repeat
          </button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Main content ── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Overview */}
          <Card title="Overview">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
              <Field label="Customer"       value={job.customerName} />
              <Field label="Job type"       value={job.jobType ? (JOB_TYPE_LABEL[job.jobType] ?? cap(job.jobType)) : job.serviceType ? cap(job.serviceType) : undefined} />
              <Field label="Priority"       value={job.priority ? cap(job.priority) : undefined} />
              <Field label="Customer ref"   value={job.customerRef} mono />
              <Field label="PO number"      value={job.purchaseOrderNumber} mono />
              <Field label="Planned date"   value={fmtDate(job.plannedDate)} />
              {job.bookingContactName && (
                <Field label="Booking contact" value={`${job.bookingContactName}${job.bookingContactPhone ? ` · ${job.bookingContactPhone}` : ""}`} />
              )}
              {job.bookingContactEmail && (
                <Field label="Contact email" value={job.bookingContactEmail} />
              )}
              {job.jobTitle && <Field label="Job title" value={job.jobTitle} />}
              {job.canSplitShipment && job.canSplitShipment !== "must_stay_together" && (
                <Field label="Split shipment" value={CAN_SPLIT_LABEL[job.canSplitShipment] ?? cap(job.canSplitShipment)} />
              )}
              {job.parentJobId && (
                <div>
                  <div className="text-xs uppercase tracking-wide" style={{ color: "#9ca3af" }}>Repeated from</div>
                  <button
                    className="font-medium text-sm mt-0.5 text-blue-600 hover:underline"
                    onClick={() => navigate(`/app/jobs/${job.parentJobId}`)}
                  >
                    Job #{job.parentJobId}
                  </button>
                </div>
              )}
            </div>
          </Card>

          {/* Load */}
          {hasLoad && (
            <Card title="Load">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                <Field label="Description"  value={job.goodsDescription} />
                <Field label="Goods type"   value={job.goodsType ? cap(job.goodsType) : undefined} />
                <Field label="Quantity"     value={job.quantity != null ? `${job.quantity} ${job.quantityUnit ?? ""}`.trim() : undefined} />
                <Field label="Weight"       value={job.weight  != null ? `${job.weight} kg`  : undefined} />
                <Field label="Volume"       value={job.volume  != null ? `${job.volume} m³`  : undefined} />
                <Field label="Dimensions"   value={job.dimensions} />
                {job.tempControlled && <Field label="Temperature" value={job.tempRange || "Temp-controlled"} />}
                {job.hazardClass    && <Field label="ADR class"   value={job.hazardClass} />}
                {job.fragile        && <Field label="Fragile"     value="Yes" />}
                {job.stackable      && <Field label="Stackable"   value="Yes" />}
                {job.weighbridgeRequired    && <Field label="Weighbridge"       value="Required" />}
                {job.requirePOD             && <Field label="Proof of delivery" value="Required" />}
                {job.photosRequired         && <Field label="Photos"            value="Required" />}
                {job.photosRequiredOnRejection && <Field label="Photos on rejection" value="Required" />}
              </div>
              {(job.securingRequirements as string[] | null)?.length ? (
                <ChipRow label="Securing" items={job.securingRequirements as string[]} className="mt-3" />
              ) : null}
              {(job.specialRequirements as string[] | null)?.length ? (
                <ChipRow label="Special requirements" items={job.specialRequirements as string[]} className="mt-2" />
              ) : null}
              {job.loadData && Object.keys(job.loadData as object).length > 0 && (
                <LoadDataSection data={job.loadData as Record<string, unknown>} />
              )}
            </Card>
          )}

          {/* Vehicle requirements — always visible; warns when missing */}
          <Card title="Vehicle requirements">
            {!hasVehicle ? (
              <div className="flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                <span className="text-amber-500 text-base leading-none mt-0.5">⚠</span>
                <div>
                  <div className="font-semibold text-amber-800">No vehicle type set</div>
                  <div className="text-xs text-amber-700 mt-0.5">
                    Vehicle requirements must be added before this job can be marked as Ready to plan.
                    <button
                      className="ml-1 underline font-medium hover:no-underline"
                      onClick={() => (window.location.href = `/app/jobs/${job.id}/edit`)}
                    >
                      Edit job →
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                  <Field label="Category"   value={job.vehicleCategory} />
                  <Field label="Min GVW"    value={job.minGvwClass} />
                  <Field label="Access"     value={job.vehicleAccessNotes} />
                </div>
                {(job.bodyTypes as string[] | null)?.length ? (
                  <ChipRow label="Body types" items={job.bodyTypes as string[]} className="mt-3" />
                ) : null}
                {(job.equipment as string[] | null)?.length ? (
                  <ChipRow label="Equipment" items={job.equipment as string[]} className="mt-2" />
                ) : null}
                {(job.trailersAllowed as string[] | null)?.length ? (
                  <ChipRow label="Trailers allowed" items={job.trailersAllowed as string[]} className="mt-2" />
                ) : null}
              </>
            )}
          </Card>

          {/* Stops */}
          <Card title={`Stops (${stops.length})`}>
            {stops.length === 0 ? (
              <p className="text-sm" style={{ color: "#9ca3af" }}>No stops added yet.</p>
            ) : (
              <div className="space-y-0">
                {stops.map((s, i) => (
                  <StopRow key={s.id ?? i} stop={s} isLast={i === stops.length - 1} />
                ))}
              </div>
            )}
          </Card>

          {/* Notes */}
          {hasNotes && (
            <Card title="Notes">
              {job.internalNotes && (
                <div className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-3">
                  <span className="font-semibold text-slate-600">🔒 Internal: </span>
                  <span className="text-slate-700">{job.internalNotes}</span>
                </div>
              )}
              {job.plannerNotes && (
                <div className="text-sm bg-yellow-50 border border-yellow-100 rounded-lg px-3 py-2 mb-3">
                  <span className="font-semibold text-yellow-800">Planner: </span>
                  <span className="text-yellow-900">{job.plannerNotes}</span>
                </div>
              )}
              {job.driverVisibleNotes && (
                <div className="text-sm bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-3">
                  <span className="font-semibold text-blue-800">Driver notes: </span>
                  <span className="text-blue-900">{job.driverVisibleNotes}</span>
                </div>
              )}
              {job.safetyInstructions && (
                <div className="text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">
                  <span className="font-semibold text-red-800">⚠ Safety: </span>
                  <span className="text-red-900">{job.safetyInstructions}</span>
                </div>
              )}
              {(job.driverNoteChips as string[] | null)?.length ? (
                <ChipRow label="Driver chips" items={job.driverNoteChips as string[]} />
              ) : null}
            </Card>
          )}

          {/* Exception policy */}
          {hasException && (
            <Card title="Exception policy">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                <Field label="Failure action"   value={job.failureAction ? cap(job.failureAction) : undefined} />
                <Field label="Assistance phone" value={job.assistancePhone} />
                <Field label="Approval contact" value={job.approvalContactName} />
                <Field label="Approval phone"   value={job.approvalContactPhone} />
                <Field label="Alt return"       value={job.alternativeReturnAddress} />
                <Field label="Alt postcode"     value={job.alternativeReturnPostcode} />
                <Field label="Alt contact"      value={job.alternativeReturnContactName} />
                <Field label="Alt phone"        value={job.alternativeReturnContactPhone} />
              </div>
              {job.assistanceNote && (
                <div className="mt-3 text-sm bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  <span className="font-semibold text-amber-800">Assistance note: </span>
                  <span className="text-amber-900">{job.assistanceNote}</span>
                </div>
              )}
            </Card>
          )}

          {/* Activity / events */}
          {job.events && job.events.length > 0 && (
            <Card title="Activity">
              <div className="space-y-2">
                {job.events.map(ev => (
                  <div key={ev.id} className="flex gap-3 text-sm">
                    <div className="text-xs w-28 flex-shrink-0 pt-0.5" style={{ color: "#9ca3af" }}>
                      {fmtDateTime(ev.createdAt)}
                    </div>
                    <div>
                      <span className="font-semibold" style={{ color: "#0f172a" }}>{cap(ev.eventType)}</span>
                      {ev.note && <div className="text-xs mt-0.5" style={{ color: "#6b7280" }}>{ev.note}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-4">

          {/* Planning / run assignment */}
          <div className="card p-4 space-y-3">
            <h2 className="font-bold text-sm" style={{ color: "#0f172a" }}>Planning</h2>
            <div className={`text-sm font-semibold ${planningInfo.colour}`}>
              {planningInfo.label}
            </div>
            <p className="text-xs" style={{ color: "#6b7280" }}>
              Stops are assigned to Runs. Open the Runs board to create or manage driver assignments.
            </p>
            <button
              className="btn btn-secondary text-sm w-full"
              onClick={() => navigate("/app/runs")}
            >
              Go to Runs →
            </button>
          </div>

          {/* Status update */}
          <StatusPanel job={job} onSaved={() => { showToast("Status updated ✓"); load(); }} />

          {/* Billing */}
          {(job.billingReference || job.declaredGoodsValue || job.billingNotes) && (
            <div className="card p-4 space-y-2">
              <h2 className="font-bold text-sm" style={{ color: "#0f172a" }}>Billing</h2>
              <div className="space-y-1.5 text-sm">
                {job.billingReference   && <Row label="Reference"      value={job.billingReference} />}
                {job.declaredGoodsValue && <Row label="Goods value"    value={`£${job.declaredGoodsValue}`} />}
                {job.billingNotes       && <Row label="Billing notes"  value={job.billingNotes} />}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="card p-4 text-xs space-y-1.5" style={{ color: "#9ca3af" }}>
            <div>Created: {fmtDateTime(job.createdAt)}</div>
            <div>Updated: {fmtDateTime(job.updatedAt)}</div>
            <div className="font-mono">ID: #{job.id}</div>
          </div>
        </div>
      </div>

      {showRepeat && (
        <RepeatJobModal job={job as any} onClose={() => setShowRepeat(false)} />
      )}
    </div>
  );
}

// ── Load data detail section ─────────────────────────────────────────────────

const LOAD_DATA_LABELS: Record<string, string> = {
  loadHeight:             "Load height",
  loadNotes:              "Load notes",
  palletCount:            "Pallet count",
  palletType:             "Pallet type",
  palletTypeOther:        "Pallet type (other)",
  stackable:              "Pallets stackable",
  cageCount:              "Cage count",
  cageFolded:             "Cages folded / nested",
  machineryPieceWeight:   "Machine weight (kg)",
  liftingPoints:          "Has lifting points",
  skidMounted:            "Skid mounted",
  craneRequired:          "Crane required",
  buildingMaterialType:   "Material type",
  buildingPalletised:     "Load palletised",
  longestItem:            "Longest item (m)",
  weatherSensitive:       "Weather sensitive",
  chilledFrozenAmbient:   "Temperature type",
  temperatureRange:       "Temperature range",
  foodPreCooled:          "Pre-cooling required",
  tippingRequired:        "Tipping required",
  wetDry:                 "Wet or dry",
  liquidProductType:      "Product type",
  liquidVolumeLitres:     "Volume (litres)",
  steelPieceCount:        "Number of pieces",
  steelWidth:             "Widest piece (m)",
  vehicleCount:           "Number of vehicles",
  vehicleMakeModel:       "Make & model",
  vehicleKeysWithVehicle: "Keys with vehicle",
  vehicleDriveable:       "Driveable (RORO)",
  containerSize:          "Container size",
  containerSizeOther:     "Container size (other)",
  loadedOrEmpty:          "Loaded or empty",
  containerNum:           "Container number",
  generalPackagingType:   "Packaging type",
  generalPieceCount:      "Number of pieces",
  unNumber:               "UN number",
  packingGroup:           "Packing group",
  hazardousQuantityKg:    "Hazardous quantity (kg)",
  hazardousPaperworkAvailable: "Hazardous paperwork",
  oversizedWidth:         "Overall width (m)",
  oversizedHeight:        "Overall height (m)",
  oversizedLength:        "Overall length (m)",
};

function fmtLoadValue(v: unknown): string {
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (v === null || v === undefined) return "—";
  return String(v);
}

function LoadDataSection({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (!entries.length) return null;
  return (
    <div className="mt-3 pt-3 border-t border-slate-100">
      <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "#94a3b8" }}>Load details</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
        {entries.map(([k, v]) => (
          <div key={k}>
            <div className="text-xs uppercase tracking-wide font-semibold mb-0.5" style={{ color: "#94a3b8" }}>
              {LOAD_DATA_LABELS[k] ?? cap(k)}
            </div>
            <div style={{ color: "#0f172a" }}>{fmtLoadValue(v)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Stop row ─────────────────────────────────────────────────────────────────

function StopRow({ stop: s, isLast }: { stop: JobPart; isLast: boolean }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${
          STOP_DOT_COLOUR[s.type] ?? "bg-slate-400"
        }`}>
          {s.sequenceNumber}
        </div>
        {!isLast && <div className="w-0.5 bg-slate-200 flex-1 my-1 min-h-4" />}
      </div>

      <div className="flex-1 pb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "#94a3b8" }}>
            {STOP_TYPE_LABEL[s.type] ?? s.type}
          </span>
          {s.referenceNumber && (
            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
              {s.referenceNumber}
            </span>
          )}
          {s.status && s.status !== "pending" && (
            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
              s.status === "completed" ? "bg-green-100 text-green-700"
              : s.status === "skipped"  ? "bg-slate-100 text-slate-500"
              : "bg-amber-100 text-amber-700"
            }`}>
              {STOP_STATUS_LABEL[s.status] ?? cap(s.status)}
            </span>
          )}
        </div>

        <div className="text-sm font-semibold mt-0.5" style={{ color: "#0f172a" }}>
          {s.siteName || s.locationTextSnapshot || "—"}
        </div>
        {s.unitName && s.unitName !== s.siteName && (
          <div className="text-xs" style={{ color: "#374151" }}>{s.unitName}</div>
        )}
        {(s.street || s.town || s.postcode) && (
          <div className="text-xs mt-0.5" style={{ color: "#6b7280" }}>
            {[
              s.street,
              s.addressLine2,
              s.town,
              s.countyRegion,
              s.postcode,
              (s.country && s.country !== "United Kingdom" && s.country !== "GB") ? s.country : null,
            ].filter(Boolean).join(", ")}
          </div>
        )}
        {s.locationType && (
          <div className="text-xs mt-0.5 text-slate-400 italic">
            {LOCATION_TYPE_LABEL[s.locationType] ?? cap(s.locationType)}
          </div>
        )}

        {s.timeWindowStart && (
          <div className="text-xs mt-1" style={{ color: "#6b7280" }}>
            🕐 {fmtWindow(s.timeWindowStart, s.timeWindowEnd)}
          </div>
        )}
        {s.bookedTime && (
          <div className="text-xs mt-0.5 font-medium text-green-700">
            ✅ Booked {new Date(s.bookedTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
          </div>
        )}
        {s.earliestArrivalMinutes != null && s.earliestArrivalMinutes > 0 && (
          <div className="text-xs mt-0.5" style={{ color: "#9ca3af" }}>Earliest arrival: {s.earliestArrivalMinutes} min before window</div>
        )}
        {s.unloadingAllowanceMinutes != null && s.unloadingAllowanceMinutes > 0 && (
          <div className="text-xs" style={{ color: "#9ca3af" }}>{s.unloadingAllowanceMinutes} min on site</div>
        )}

        {(s.quantityRequired != null) && (
          <div className="text-xs mt-0.5" style={{ color: "#374151" }}>
            {s.quantityRequired} {s.quantityUnit ?? ""}
          </div>
        )}

        {s.contactName && (
          <div className="text-xs mt-0.5" style={{ color: "#9ca3af" }}>
            {s.contactName}{s.contactPhone ? ` · ${s.contactPhone}` : ""}
          </div>
        )}
        {s.contactEmail && (
          <div className="text-xs mt-0.5" style={{ color: "#9ca3af" }}>
            {s.contactEmail}
          </div>
        )}
        {s.openingHours && (
          <div className="text-xs mt-0.5" style={{ color: "#9ca3af" }}>
            🕒 {s.openingHours}
          </div>
        )}

        {s.bookingRequired && (
          <div className="text-xs mt-0.5 text-amber-600 font-medium">
            Booking required{s.bookingRef ? ` · ${s.bookingRef}` : ""}
          </div>
        )}

        {/* Handling & access */}
        {(s.handlingMethods as string[] | null)?.length ? (
          <div className="mt-1.5">
            <div className="text-xs font-semibold uppercase tracking-wide mb-0.5" style={{ color: "#94a3b8" }}>Handling</div>
            <div className="flex flex-wrap gap-1">
              {(s.handlingMethods as string[]).map(m => (
                <span key={m} className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{cap(m)}</span>
              ))}
            </div>
          </div>
        ) : null}
        {(s.accessRequirements as string[] | null)?.length ? (
          <div className="mt-1.5">
            <div className="text-xs font-semibold uppercase tracking-wide mb-0.5" style={{ color: "#94a3b8" }}>Access</div>
            <div className="flex flex-wrap gap-1">
              {(s.accessRequirements as string[]).map(r => (
                <span key={r} className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">{cap(r)}</span>
              ))}
            </div>
          </div>
        ) : null}
        {(s.proofRequirements as string[] | null)?.length ? (
          <div className="mt-1.5">
            <div className="text-xs font-semibold uppercase tracking-wide mb-0.5" style={{ color: "#94a3b8" }}>Proof required</div>
            <div className="flex flex-wrap gap-1">
              {(s.proofRequirements as string[]).map(r => (
                <span key={r} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{cap(r)}</span>
              ))}
            </div>
          </div>
        ) : null}

        {/* Vehicle restrictions */}
        {(s.heightRestriction || s.weightRestriction || s.lengthRestriction) && (
          <div className="text-xs mt-1.5 flex flex-wrap gap-2">
            {s.heightRestriction && <span className="bg-red-50 text-red-700 px-1.5 py-0.5 rounded">H: {s.heightRestriction}</span>}
            {s.weightRestriction && <span className="bg-red-50 text-red-700 px-1.5 py-0.5 rounded">W: {s.weightRestriction}</span>}
            {s.lengthRestriction  && <span className="bg-red-50 text-red-700 px-1.5 py-0.5 rounded">L: {s.lengthRestriction}</span>}
          </div>
        )}

        {/* Navigation & instructions */}
        {s.navigationInstructions && (
          <div className="text-xs mt-1.5 bg-slate-50 rounded p-2" style={{ color: "#374151" }}>
            <span className="font-semibold">Entrance: </span>{s.navigationInstructions}
          </div>
        )}
        {(s.instructions || s.stopNotes) && (
          <div className="text-xs mt-1.5 bg-blue-50 rounded p-2 text-blue-900">
            <span className="font-semibold">Instructions: </span>{s.instructions || s.stopNotes}
          </div>
        )}

        {/* Load readiness */}
        {s.loadReadiness && (
          <div className="text-xs mt-0.5 font-medium" style={{ color: "#6b7280" }}>
            Load ready: {cap(s.loadReadiness)}
          </div>
        )}

        {/* Exchange quantities */}
        {(s.exchangeDropQty || s.exchangeCollectQty) && (
          <div className="text-xs mt-0.5" style={{ color: "#6b7280" }}>
            {s.exchangeDropQty    ? `Drop ${s.exchangeDropQty}` : ""}
            {s.exchangeDropQty && s.exchangeCollectQty ? " · " : ""}
            {s.exchangeCollectQty ? `Collect ${s.exchangeCollectQty}` : ""}
            {s.exchangeUnit       ? ` ${s.exchangeUnit}` : ""}
          </div>
        )}

        {/* Planner-only internal note */}
        {s.internalNotes && (
          <div className="text-xs mt-1.5 bg-slate-50 border border-slate-200 rounded p-2" style={{ color: "#374151" }}>
            <span className="font-semibold text-slate-500">🔒 </span>{s.internalNotes}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Status panel ─────────────────────────────────────────────────────────────

function StatusPanel({ job, onSaved }: { job: Job; onSaved: () => void }) {
  const [status,  setStatus]  = useState<string>(job.status);
  const [note,    setNote]    = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const needsVehicle = status === "ready_to_plan" && !job.vehicleCategory;

  async function save() {
    if (status === job.status && !note.trim()) return;
    if (needsVehicle) return;
    setLoading(true); setError("");
    try {
      await jobsApi.updateStatus(job.id, status, note.trim() || undefined);
      setNote("");
      onSaved();
    } catch (err: unknown) {
      const msg = (err as Error).message;
      setError(msg.includes("VEHICLE_REQUIRED") || msg.includes("Vehicle type")
        ? "Vehicle type must be selected before marking this job as Ready to plan. Use Edit job to add vehicle requirements."
        : msg);
    } finally {
      setLoading(false);
    }
  }

  const unchanged = status === job.status && !note.trim();

  return (
    <div className="card p-4 space-y-3">
      <h2 className="font-bold text-sm" style={{ color: "#0f172a" }}>Status</h2>

      {needsVehicle && (
        <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-lg leading-snug">
          ⚠ <strong>Vehicle type required.</strong> Set a vehicle category on this job before marking it as Ready to plan.
        </div>
      )}

      {error && !needsVehicle && (
        <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>
      )}

      <select
        className="input text-sm"
        value={status}
        onChange={e => { setStatus(e.target.value); setError(""); }}
      >
        {JOB_STATUSES.map(s => (
          <option key={s} value={s}>{JOB_STATUS_LABEL[s]}</option>
        ))}
      </select>

      <textarea
        className="input text-sm"
        rows={2}
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Override reason (optional)"
      />

      <button
        className="btn btn-primary text-sm w-full"
        onClick={save}
        disabled={unchanged || loading || needsVehicle}
      >
        {loading ? "Saving…" : "Update status"}
      </button>
    </div>
  );
}

// ── Card / field helpers ──────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <h2 className="font-bold mb-3 text-sm" style={{ color: "#0f172a" }}>{title}</h2>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label:  string;
  value:  React.ReactNode;
  mono?:  boolean;
}) {
  if (value === null || value === undefined || value === "" || value === "—") return null;
  return (
    <div>
      <div className="text-xs uppercase tracking-wide" style={{ color: "#9ca3af" }}>{label}</div>
      <div className={`font-medium text-sm mt-0.5 ${mono ? "font-mono" : ""}`} style={{ color: "#0f172a" }}>
        {value}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="shrink-0 w-28 font-medium" style={{ color: "#6b7280" }}>{label}</span>
      <span style={{ color: "#374151" }}>{value}</span>
    </div>
  );
}

function ChipRow({
  label,
  items,
  className,
}: {
  label:     string;
  items:     string[];
  className?: string;
}) {
  if (!items?.length) return null;
  return (
    <div className={className}>
      <div className="text-xs font-medium mb-1" style={{ color: "#6b7280" }}>{label}</div>
      <div className="flex gap-1 flex-wrap">
        {items.map(item => (
          <span key={item} className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
            {cap(item)}
          </span>
        ))}
      </div>
    </div>
  );
}
