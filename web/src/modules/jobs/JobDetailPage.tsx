import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { jobsApi } from "../../api/jobs";
import { aiApi, type AreaInfo, type VehicleSuggestion, type LoadVehicleCheckResult } from "../../api/ai";
import type { Job, JobPart } from "../../types";
import RepeatJobModal from "./RepeatJobModal";
import { Badge } from "../../components/Badge";
import { BODY_CATEGORIES, BODY_TYPES, BODY_TYPES_BY_CATEGORY, GVW_CLASSES } from "../../constants/vehicleTaxonomy";

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

const PRIORITY_LABELS: Record<string, string> = {
  low:    "Low",
  normal: "Normal",
  high:   "High",
  urgent: "Urgent",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  note_added:      "Note added",
  status_changed:  "Status changed",
  started:         "Started",
  arrived_pickup:  "Arrived at pickup",
  collected:       "Collected",
  arrived_dropoff: "Arrived at drop-off",
  completed:       "Completed",
  cancelled:       "Cancelled",
  job_created:     "Job created",
  job_updated:     "Job updated",
};

const LOAD_READINESS_LABELS: Record<string, string> = {
  ready_now:            "Ready now",
  ready_at_booked_time: "Ready at booked time",
  still_being_prepared: "Still being prepared",
  unsure:               "Unsure",
};

const PLANNING_STATUS_LABEL: Record<string, { label: string; colour: string }> = {
  no_stops:         { label: "No stops",       colour: "text-slate-400" },
  not_planned:      { label: "Not in a run",   colour: "text-amber-600" },
  partially_planned:{ label: "Partly in runs", colour: "text-indigo-600" },
  planned:          { label: "In runs",        colour: "text-blue-600"  },
  partially_done:   { label: "Partially done", colour: "text-teal-600"  },
  done:             { label: "All done",        colour: "text-green-600" },
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
  // stop area types: keyed by normalised postcode (no spaces, uppercase)
  const [stopAreas, setStopAreas] = useState<Record<string, AreaInfo>>({});

  const load = useCallback(async () => {
    const numId = parseInt(id!, 10);
    if (!id || isNaN(numId)) { setError("Job not found."); setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const loaded = await jobsApi.get(numId);
      setJob(loaded);
      // Async area lookup — non-blocking, silently ignored on failure
      const postcodes = ((loaded as any).stops ?? [])
        .map((s: any) => s.postcode)
        .filter((p: unknown): p is string => typeof p === "string" && p.trim().length > 0);
      if (postcodes.length > 0) {
        aiApi.lookupAreas(postcodes)
          .then(areas => {
            const map: Record<string, AreaInfo> = {};
            areas.forEach(a => { map[a.postcode.replace(/\s+/g, "").toUpperCase()] = a; });
            setStopAreas(map);
          })
          .catch(() => {}); // silently fail — not critical
      }
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

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
                {PRIORITY_LABELS[job.priority] ?? job.priority}
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
                <Field label="Quantity"     value={job.quantity != null ? `${job.quantity}${job.quantityUnit ? " " + cap(job.quantityUnit) : ""}` : undefined} />
                <Field label="Weight"       value={job.weight  != null ? `${job.weight} kg`  : undefined} />
                <Field label="Volume"       value={job.volume  != null ? `${job.volume} m³`  : undefined} />
                <Field label="Dimensions"   value={job.dimensions} />
                {job.tempControlled && <Field label="Temperature" value={job.tempRange || "Temp-controlled"} />}
                {job.hazardClass    && <Field label="ADR class"   value={job.hazardClass} />}
                {(job as any).tunnelCode && <Field label="Tunnel code" value={(job as any).tunnelCode} />}
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

          {/* Vehicle requirements — interactive picker with AI suggestion */}
          <VehiclePanel
            job={job}
            stopAreas={stopAreas}
            onSaved={() => { showToast("Vehicle updated ✓"); load(); }}
          />

          {/* Stops */}
          <Card title={`Stops (${stops.length})`}>
            {stops.length === 0 ? (
              <p className="text-sm" style={{ color: "#9ca3af" }}>No stops added yet.</p>
            ) : (
              <div className="space-y-0">
                {stops.map((s, i) => {
                  const normPC = s.postcode?.replace(/\s+/g, "").toUpperCase() ?? "";
                  const area   = normPC ? stopAreas[normPC] : undefined;
                  return (
                    <StopRow key={s.id ?? i} stop={s} isLast={i === stops.length - 1} area={area} />
                  );
                })}
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
                      <span className="font-semibold" style={{ color: "#0f172a" }}>{EVENT_TYPE_LABELS[ev.eventType] ?? cap(ev.eventType)}</span>
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
  // General
  loadHeight:             "Load height",
  loadNotes:              "Load notes",
  // Pallets (legacy single-type — kept for old jobs)
  palletCount:            "Pallet count",
  palletType:             "Pallet type",
  palletTypeOther:        "Pallet type (other)",
  // Pallets (new multi-type — palletLines rendered specially below)
  palletLines:            "Pallet types",
  stackable:              "Pallets stackable",
  weightPerUnit:          "Weight per pallet (kg)",
  ispm15Required:         "ISPM-15 certified packaging",
  // Roll cages
  cageCount:              "Cage count",
  cageFolded:             "Cages folded / nested",
  // Machinery
  machineryPieceWeight:   "Machine weight (kg)",
  liftingPoints:          "Has lifting points",
  skidMounted:            "Skid mounted",
  craneRequired:          "Crane required",
  // Building materials
  buildingMaterialType:   "Material type",
  buildingPalletised:     "Load palletised",
  longestItem:            "Longest item (m)",
  weatherSensitive:       "Weather sensitive",
  // Food / refrigerated
  chilledFrozenAmbient:   "Temperature type",
  temperatureRange:       "Temperature range",
  foodPreCooled:          "Pre-cooling required",
  foodCleanVehicle:       "Clean vehicle required",
  foodHaccp:              "HACCP compliance required",
  foodAllergenFree:       "Allergen-free vehicle",
  foodTempLogger:         "Temperature logger required",
  // Bulk
  tippingRequired:        "Tipping required",
  wetDry:                 "Wet or dry",
  // Liquid
  liquidProductType:      "Product type",
  liquidVolumeLitres:     "Volume (litres)",
  // Steel / long
  steelPieceCount:        "Number of pieces",
  steelWidth:             "Widest piece (m)",
  // Vehicles
  vehicleCount:           "Number of vehicles",
  vehicleMakeModel:       "Make & model",
  vehicleKeysWithVehicle: "Keys with vehicle",
  vehicleDriveable:       "Driveable (RORO)",
  // Containers
  containerSize:          "Container size",
  containerSizeOther:     "Container size (other)",
  loadedOrEmpty:          "Loaded or empty",
  containerNum:           "Container number",
  containerIsoType:       "ISO container type",
  containerBookingRef:    "Container booking ref",
  containerTerminal:      "Terminal",
  containerCutOff:        "Cut-off date / time",
  containerSealNumber:    "Seal number",
  // General goods
  generalPackagingType:   "Packaging type",
  generalPieceCount:      "Number of pieces",
  // Hazmat / ADR basics
  unNumber:               "UN number",
  packingGroup:           "Packing group",
  hazardousQuantityKg:    "Hazardous quantity (kg)",
  hazardousPaperworkAvailable: "Hazardous paperwork available",
  // ADR extended
  adrProperShippingName:  "Proper shipping name",
  adrSubsidiaryRisk:      "ADR subsidiary risk",
  adrFlashPoint:          "Flash point",
  adrEmsCode:             "EMS code",
  adrEmergencyContact:    "ADR emergency contact",
  // Oversized
  oversizedWidth:         "Overall width (m)",
  oversizedHeight:        "Overall height (m)",
  oversizedLength:        "Overall length (m)",
  // STGO / abnormal load
  stgoCategory:           "STGO category",
  movementOrderNumber:    "Movement order number",
  // Waste
  isWaste:                "Waste consignment",
  ewcCode:                "EWC code",
  wasteTrnNumber:         "Waste consignment note (TRN)",
  // Transport / subcontracting
  subcontractingAllowed:  "Subcontracting",
  // driverQualifications and crossBorderData rendered specially below
};

// Pallet type code → display label
const PALLET_TYPE_LABEL: Record<string, string> = {
  euro: "Euro (800×1200mm)",
  uk:   "UK (1000×1200mm)",
  half: "Half pallets",
  chep: "CHEP",
};

function fmtPalletLines(lines: unknown): string {
  if (!Array.isArray(lines) || lines.length === 0) return "—";
  return lines
    .map((l: { type?: string; typeOther?: string; count?: number }) => {
      const label = l.type ? (PALLET_TYPE_LABEL[l.type] ?? l.typeOther ?? l.type) : "Unknown";
      return l.count != null ? `${l.count}× ${label}` : label;
    })
    .join(", ");
}

function fmtLoadValue(v: unknown): string {
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (v === "yes" || v === "true") return "Yes";
  if (v === "no"  || v === "false") return "No";
  if (v === null || v === undefined) return "—";
  if (Array.isArray(v)) return "—"; // arrays handled specially
  if (typeof v === "object") return "—"; // objects handled specially
  return String(v);
}

const ACCESS_REQUIREMENT_LABELS: Record<string, string> = {
  narrow_road:           "Narrow road",
  height_restriction:    "Height restriction",
  weight_restriction:    "Weight restriction",
  length_restriction:    "Length restriction",
  no_artic_access:       "No artic access",
  no_trailer_access:     "No trailer access",
  residential_area:      "Residential area",
  security_checkin:      "Security check-in",
  driver_id_required:    "Driver ID required",
  do_not_arrive_early:   "Do not arrive early",
  holding_area_required: "Holding area required",
  port_access:           "Port access",
  airport_access:        "Airport access",
  ppe_required:          "PPE required",
  ppe_safety_boots:      "PPE safety boots",
  ppe_hi_vis:            "PPE hi-vis",
  ppe_hard_hat:          "PPE hard hat",
  ppe_gloves:            "PPE gloves",
  ppe_glasses:           "PPE safety glasses",
};

const HANDLING_METHOD_LABELS: Record<string, string> = {
  forklift:         "Forklift",
  loading_bay:      "Loading bay",
  hiab:             "HIAB / truck crane",
  moffett:          "Moffett / vehicle forklift",
  tail_lift:        "Tail lift",
  pump_truck:       "Pump truck / pallet jack",
  handball:         "Handball (manual)",
  overhead_crane:   "Overhead / gantry crane",
  magnetic_crane:   "Magnetic overhead crane",
  side_loading:     "Side loading",
  roro:             "RORO (drive on / drive off)",
  tipper_discharge: "Tipper discharge",
  grab:             "Grab (aggregate / scrap)",
  pump_discharge:   "Pump discharge (tanker)",
  walking_floor:    "Walking floor",
  conveyor:         "Conveyor",
  other:            "Other",
};

// Keys that are rendered as their own expanded sub-sections, not as plain key-value pairs
const SPECIAL_KEYS = new Set(["palletLines", "driverQualifications", "crossBorderData"]);

const CROSS_BORDER_LABELS: Record<string, string> = {
  shipperEori:         "Shipper EORI",
  consigneeEori:       "Consignee EORI",
  hsCode:              "HS / commodity code",
  customsMovementType: "Customs movement type",
  incoterms:           "Incoterms",
  crossingRequired:    "Port / tunnel crossing",
  crossingType:        "Crossing type",
  crossingBookingRef:  "Crossing booking ref",
};

const DRIVER_QUAL_LABELS: Record<string, string> = {
  cscsRequired:   "CSCS card required",
  bs7858Required: "BS 7858 vetting required",
  dbsLevel:       "DBS check level",
};

function SubSection({ title, entries, labels }: {
  title: string;
  entries: [string, unknown][];
  labels: Record<string, string>;
}) {
  const rows = entries.filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (!rows.length) return null;
  return (
    <div className="pt-2 border-t border-slate-100">
      <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "#94a3b8" }}>{title}</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k}>
            <div className="text-xs uppercase tracking-wide font-semibold mb-0.5" style={{ color: "#94a3b8" }}>
              {labels[k] ?? cap(k)}
            </div>
            <div style={{ color: "#0f172a" }}>{fmtLoadValue(v)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LoadDataSection({ data }: { data: Record<string, unknown> }) {
  const plain  = Object.entries(data).filter(([k, v]) => !SPECIAL_KEYS.has(k) && v !== null && v !== undefined && v !== "");
  const hasPL  = Array.isArray(data.palletLines) && (data.palletLines as unknown[]).length > 0;
  const dqObj  = (data.driverQualifications && typeof data.driverQualifications === "object" && !Array.isArray(data.driverQualifications))
    ? (data.driverQualifications as Record<string, unknown>) : null;
  const cbObj  = (data.crossBorderData && typeof data.crossBorderData === "object" && !Array.isArray(data.crossBorderData))
    ? (data.crossBorderData as Record<string, unknown>) : null;

  if (!plain.length && !hasPL && !dqObj && !cbObj) return null;

  return (
    <div className="mt-3 pt-3 border-t border-slate-100 space-y-4">
      <div className="text-xs font-bold uppercase tracking-wide" style={{ color: "#94a3b8" }}>Load details</div>

      {/* Pallet lines — single summary line */}
      {hasPL && (
        <div>
          <div className="text-xs uppercase tracking-wide font-semibold mb-0.5" style={{ color: "#94a3b8" }}>Pallet types</div>
          <div className="text-sm" style={{ color: "#0f172a" }}>{fmtPalletLines(data.palletLines)}</div>
        </div>
      )}

      {/* Standard key-value grid */}
      {plain.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
          {plain.map(([k, v]) => (
            <div key={k}>
              <div className="text-xs uppercase tracking-wide font-semibold mb-0.5" style={{ color: "#94a3b8" }}>
                {LOAD_DATA_LABELS[k] ?? cap(k)}
              </div>
              <div style={{ color: "#0f172a" }}>{fmtLoadValue(v)}</div>
            </div>
          ))}
        </div>
      )}

      {dqObj && <SubSection title="Driver qualifications" entries={Object.entries(dqObj)} labels={DRIVER_QUAL_LABELS} />}
      {cbObj && <SubSection title="Cross-border / customs" entries={Object.entries(cbObj)} labels={CROSS_BORDER_LABELS} />}
    </div>
  );
}

// ── Stop row ─────────────────────────────────────────────────────────────────

function StopRow({ stop: s, isLast, area }: { stop: JobPart; isLast: boolean; area?: AreaInfo }) {
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
        {/* Area-type badge (loaded async from postcodes.io + OSM) */}
        {area && area.areaType !== "unknown" && (
          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full mt-1 ${
            area.areaType === "industrial"  ? "bg-orange-50 text-orange-700" :
            area.areaType === "residential" ? "bg-blue-50 text-blue-700" :
            area.areaType === "rural"       ? "bg-green-50 text-green-700" :
            area.areaType === "port"        ? "bg-cyan-50 text-cyan-700" :
            area.areaType === "retail"      ? "bg-purple-50 text-purple-700" :
            "bg-slate-100 text-slate-600"
          }`}>
            {area.emoji} {area.label || area.areaType}
          </span>
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
            {s.quantityRequired}{s.quantityUnit ? " " + cap(s.quantityUnit) : ""}
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
                <span key={m} className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{HANDLING_METHOD_LABELS[m] ?? cap(m)}</span>
              ))}
            </div>
          </div>
        ) : null}
        {(s.accessRequirements as string[] | null)?.length ? (
          <div className="mt-1.5">
            <div className="text-xs font-semibold uppercase tracking-wide mb-0.5" style={{ color: "#94a3b8" }}>Access</div>
            <div className="flex flex-wrap gap-1">
              {(s.accessRequirements as string[]).map(r => (
                <span key={r} className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">{ACCESS_REQUIREMENT_LABELS[r] ?? cap(r)}</span>
              ))}
            </div>
          </div>
        ) : null}
        {(s.proofRequirements as string[] | null)?.length ? (
          <div className="mt-1.5">
            <div className="text-xs font-semibold uppercase tracking-wide mb-0.5" style={{ color: "#94a3b8" }}>Proof required</div>
            <div className="flex flex-wrap gap-1">
              {(s.proofRequirements as string[]).map(r => (
                <span key={r} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{cap(r).replace(/\bPod\b/, "POD").replace(/\bCmr\b/, "CMR").replace(/\bAdr\b/, "ADR")}</span>
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
            Load ready: {LOAD_READINESS_LABELS[s.loadReadiness] ?? cap(s.loadReadiness)}
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

// ── Vehicle compatibility check ───────────────────────────────────────────────
// Runs client-side, instant, no API call. Returns plain-English warnings.

const VEHICLE_MAX_KG: Record<string, number> = {
  van:       500,
  luton_van: 700,
  pickup:    900,
  rigid:     16_000,
  tractor:   26_000,
  drawbar:   26_000,
};

const VEHICLE_MAX_PALLETS: Record<string, number> = {
  van:       2,
  luton_van: 3,
  pickup:    1,
  rigid:     26,
  tractor:   33,
  drawbar:   33,
};

const VEHICLE_NAME: Record<string, string> = {
  van:          "a Van",
  luton_van:    "a Luton van",
  pickup:       "a Pickup",
  rigid:        "a Rigid",
  tractor:      "an Artic",
  drawbar:      "a Drawbar",
  heavy_haulage:"Heavy haulage",
};

/** Body types that are suitable for liquid / tanker loads */
const TANKER_BODY_TYPES = new Set([
  "tanker_food", "tanker_fuel", "tanker_chemical",
  "tanker_water", "tanker_vacuum", "tanker_bitumen", "tanker_other",
]);

/** Body types that are suitable for temperature-controlled loads */
const FRIDGE_BODY_TYPES = new Set([
  "fridge", "fridge_multi_temp", "fridge_pharma", "insulated",
]);

/**
 * Returns plain-English warnings when the selected vehicle category and/or
 * body types look wrong for the job's load. Called live as the planner picks.
 *
 * @param category  selected vehicle category (e.g. "rigid")
 * @param bodyTypes selected body types (may be empty while planner is choosing)
 * @param job       the job being planned
 */
function checkVehicleWarnings(category: string, bodyTypes: string[], job: Job): string[] {
  const warnings: string[] = [];
  const name = VEHICLE_NAME[category] ?? "This vehicle";

  const goodsText = `${job.goodsType ?? ""} ${job.goodsDescription ?? ""}`.toLowerCase();

  // ── Weight ────────────────────────────────────────────────────────────────
  const maxKg = VEHICLE_MAX_KG[category];
  if (maxKg && job.weight && job.weight > maxKg) {
    const better =
      job.weight > 16_000 ? "an Artic or Drawbar" :
      job.weight > 700    ? "a Rigid"         :
                            "a Luton van";
    warnings.push(
      `This job carries ${job.weight.toLocaleString("en-GB")} kg. ` +
      `${name} can only handle about ${maxKg.toLocaleString("en-GB")} kg — you probably need ${better}.`,
    );
  }

  // ── Pallets ───────────────────────────────────────────────────────────────
  const maxPallets = VEHICLE_MAX_PALLETS[category];
  if (
    maxPallets &&
    job.quantity != null &&
    (job as any).quantityUnit === "pallets" &&
    job.quantity > maxPallets
  ) {
    const better =
      job.quantity > 26 ? "an Artic or Drawbar" :
      job.quantity > 3  ? "a Rigid"         :
                          "a Luton van";
    warnings.push(
      `This job has ${job.quantity} pallets. ` +
      `${name} can carry up to ${maxPallets} — you probably need ${better}.`,
    );
  }

  // ── Liquid / tanker goods ─────────────────────────────────────────────────
  //  Checks BOTH vehicle class AND body type — a Rigid with a box body
  //  is just as wrong as a van for liquid loads.
  const looksLikeFluid =
    goodsText.includes("tanker")   || goodsText.includes("liquid")   ||
    goodsText.includes("fuel")     || goodsText.includes("chemical")  ||
    goodsText.includes("ibc")      || goodsText.includes("tote")      ||
    goodsText.includes("solvent")  || goodsText.includes("oil")       ||
    goodsText.includes("acid")     || goodsText.includes("bitumen");

  if (looksLikeFluid) {
    if (["van", "luton_van", "pickup"].includes(category)) {
      warnings.push(
        "This looks like a liquid or tanker load. " +
        "A van can't carry liquids in bulk — you'll need a Rigid or Artic with a tanker body.",
      );
    } else if (bodyTypes.length > 0 && !bodyTypes.some(bt => TANKER_BODY_TYPES.has(bt))) {
      // HGV/artic is fine but the chosen body type is wrong
      const chosen = bodyTypes.map(bt => BODY_TYPES.find(b => b.value === bt)?.label ?? cap(bt.replace(/_/g, " "))).join(", ");
      warnings.push(
        `This is a liquid or tanker load but the body type you've chosen ("${chosen}") isn't suitable for carrying liquids. ` +
        `You'll need a tanker body type such as Chemical tanker, Food tanker, or Liquid tanker.`,
      );
    } else if (bodyTypes.length === 0) {
      // Category is fine, no body type picked yet — remind them
      warnings.push(
        "This looks like a liquid or tanker load. " +
        "Remember to select a tanker body type (Chemical tanker, Food tanker, etc.).",
      );
    }
  }

  // ── Hazardous / ADR ───────────────────────────────────────────────────────
  // Check the hazardClass field AND scan the description for "class N" mentions
  const hazardClass = (job as any).hazardClass as string | null | undefined;
  const adrFromDesc = goodsText.match(/\badr\b|\bclass\s*([1-9])\b|\bun\s*\d{4}\b/);
  const adrClass    = hazardClass || (adrFromDesc?.[1] ? `${adrFromDesc[1]}` : null);

  if (adrClass || adrFromDesc) {
    warnings.push(
      `This load contains hazardous goods` +
      (adrClass ? ` (ADR class ${adrClass})` : "") +
      `. The driver and vehicle must have the correct ADR certification — ` +
      `and an ADR safety kit must be on board.`,
    );
  }

  // ── Temperature-controlled ────────────────────────────────────────────────
  const tempControlled = (job as any).tempControlled as boolean | null | undefined;
  if (tempControlled) {
    if (["van", "pickup"].includes(category)) {
      warnings.push(
        "This is a temperature-controlled load. " +
        "A standard van won't keep the goods at the right temperature — " +
        "you'll need a vehicle with a refrigerated body.",
      );
    } else if (bodyTypes.length > 0 && !bodyTypes.some(bt => FRIDGE_BODY_TYPES.has(bt))) {
      const chosen = bodyTypes.map(bt => BODY_TYPES.find(b => b.value === bt)?.label ?? cap(bt.replace(/_/g, " "))).join(", ");
      warnings.push(
        `This is a temperature-controlled load but "${chosen}" isn't a refrigerated body type. ` +
        `You'll need a Fridge or Insulated body.`,
      );
    }
  }

  return warnings;
}

// ── Vehicle panel ─────────────────────────────────────────────────────────────

const BODY_TYPE_GROUP_LABELS: Record<string, string> = {
  general:   "General / enclosed",
  flat:      "Flat / open",
  bulk:      "Bulk & tipping",
  tanker:    "Tanker",
  temp:      "Temperature controlled",
  container: "Container / skeletal",
  heavy:     "Heavy haulage",
  specialist:"Specialist",
  other:     "Other",
};

const TRAILER_CATEGORIES = new Set(["tractor", "drawbar", "heavy_haulage"]);

const VEHICLE_BUTTONS = [
  { value: "van",        label: "Van",        sub: "≤3.5t LCV",        emoji: "🚐" },
  { value: "luton_van",  label: "Luton van",  sub: "≤3.5t box",        emoji: "📦" },
  { value: "pickup",     label: "Pickup",     sub: "4×4 / dropside",   emoji: "🛻" },
  { value: "rigid",      label: "Rigid",  sub: "7.5t–26t",         emoji: "🚛" },
  { value: "tractor",    label: "Artic",       sub: "44t tractor unit", emoji: "🚚" },
  { value: "drawbar",    label: "Drawbar",     sub: "Rigid + trailer",  emoji: "🔗" },
] as const;

const SPECIALIST_CATS = BODY_CATEGORIES.filter(
  c => !VEHICLE_BUTTONS.some(b => b.value === c.value),
);

function VehiclePanel({
  job,
  stopAreas,
  onSaved,
}: {
  job:       Job;
  stopAreas: Record<string, AreaInfo>;
  onSaved:   () => void;
}) {
  const hasVehicle = !!(job.vehicleCategory || (job.bodyTypes as string[] | null)?.length);
  const [editMode, setEditMode] = useState(!hasVehicle);

  // Picker state (pre-fill from job when editing)
  const [category,   setCategory]   = useState(job.vehicleCategory ?? "");
  const [bodyTypes,  setBodyTypes]  = useState<string[]>((job.bodyTypes as string[] | null) ?? []);
  const [minGvw,     setMinGvw]     = useState(job.minGvwClass ?? "");
  const [saving,     setSaving]     = useState(false);
  const [saveErr,    setSaveErr]    = useState("");

  // Live compatibility warnings (instant, rule-based)
  const compatWarnings = category ? checkVehicleWarnings(category, bodyTypes, job) : [];

  // AI load ↔ vehicle check — fires automatically whenever category or body
  // types change (debounced 600 ms). Advisory only — planner can always save.
  const [aiCheck,     setAiCheck]     = useState<LoadVehicleCheckResult | null>(null);
  const [aiChecking,  setAiChecking]  = useState(false);
  const [aiCheckDismissed, setAiCheckDismissed] = useState(false);

  useEffect(() => {
    // Need at least a category and some goods info to check
    if (!category || (!job.goodsDescription && !job.goodsType)) return;

    setAiCheckDismissed(false); // new selection → show result again
    const timer = setTimeout(async () => {
      setAiChecking(true);
      try {
        const result = await aiApi.checkVehicleLoad({
          vehicleCategory:  category,
          bodyTypes:        bodyTypes.length ? bodyTypes : undefined,
          goodsDescription: job.goodsDescription  ?? undefined,
          goodsType:        job.goodsType          ?? undefined,
          weight:           job.weight             ?? undefined,
          quantity:         job.quantity           ?? undefined,
          quantityUnit:     (job as any).quantityUnit ?? undefined,
          hazardClass:      (job as any).hazardClass  ?? undefined,
          tempControlled:   (job as any).tempControlled ?? undefined,
        });
        setAiCheck(result);
      } catch {
        setAiCheck(null); // silently fail — check is advisory
      } finally {
        setAiChecking(false);
      }
    }, 600);

    return () => { clearTimeout(timer); };
  }, [category, bodyTypes.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // AI suggestion state
  const [suggesting,  setSuggesting]  = useState(false);
  const [suggestion,  setSuggestion]  = useState<VehicleSuggestion | null>(null);
  const [suggestErr,  setSuggestErr]  = useState("");

  // Sync state if job reloads
  useEffect(() => {
    setCategory(job.vehicleCategory ?? "");
    setBodyTypes((job.bodyTypes as string[] | null) ?? []);
    setMinGvw(job.minGvwClass ?? "");
    setEditMode(!hasVehicle);
    setSuggestion(null);
  }, [job.id, job.vehicleCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  // Body types available for selected category
  const availableBodyTypes: string[] =
    category ? (BODY_TYPES_BY_CATEGORY as Record<string, string[]>)[category] ?? [] : [];

  // GVW options for selected category
  const availableGvw = GVW_CLASSES.filter(g =>
    (g.applicableTo as readonly string[]).includes(category),
  );

  function toggleBodyType(bt: string) {
    setBodyTypes(prev =>
      prev.includes(bt) ? prev.filter(x => x !== bt) : [...prev, bt],
    );
  }

  async function handleSuggest() {
    setSuggesting(true); setSuggestion(null); setSuggestErr("");
    try {
      const stops = ((job.stops ?? []) as JobPart[]).map(s => {
        const norm = s.postcode?.replace(/\s+/g, "").toUpperCase() ?? "";
        const area = norm ? stopAreas[norm] : undefined;
        return {
          type:     s.type ?? "delivery",
          areaType: area?.areaType,
          label:    area?.label,
        };
      });
      const sug = await aiApi.suggestVehicle({
        weight:           job.weight           ?? undefined,
        quantity:         job.quantity         ?? undefined,
        quantityUnit:     job.quantityUnit      ?? undefined,
        goodsType:        job.goodsType         ?? undefined,
        goodsDescription: job.goodsDescription  ?? undefined,
        tempControlled:   (job as any).tempControlled ?? undefined,
        hazardClass:      (job as any).hazardClass    ?? undefined,
        specialRequirements: ((job as any).specialRequirements as string[] | null) ?? undefined,
        stopCount:        (job.stops ?? []).length || undefined,
        stops:            stops.length ? stops : undefined,
      });
      setSuggestion(sug);
    } catch (e: unknown) {
      setSuggestErr((e as Error).message ?? "Could not get suggestion — try again");
    } finally {
      setSuggesting(false);
    }
  }

  function applySuggestion() {
    if (!suggestion) return;
    setCategory(suggestion.vehicleCategory);
    // Auto-apply suggested body types from the fleet — planner can adjust after
    setBodyTypes(suggestion.suggestedBodyTypes ?? []);
    setMinGvw("");
    setSuggestion(null);
  }

  async function handleSave() {
    if (!category) { setSaveErr("Please select a vehicle type."); return; }
    setSaving(true); setSaveErr("");
    try {
      await jobsApi.update(job.id, {
        vehicleCategory: category || undefined,
        bodyTypes:       bodyTypes.length ? bodyTypes : null,
        minGvwClass:     minGvw || null,   // schema now accepts null
      });
      setEditMode(false);
      onSaved();
    } catch (e: unknown) {
      setSaveErr((e as Error).message ?? "Could not save — please try again");
    } finally {
      setSaving(false);
    }
  }

  // ── View mode (vehicle already set) ──────────────────────────────────────────
  if (!editMode && hasVehicle) {
    const catBtn  = VEHICLE_BUTTONS.find(b => b.value === job.vehicleCategory);
    const specCat = SPECIALIST_CATS.find(c => c.value === job.vehicleCategory);
    const catLabel = catBtn
      ? `${catBtn.emoji} ${catBtn.label}`
      : specCat
        ? specCat.label
        : job.vehicleCategory ?? "";

    // Show warnings even in view mode so planner sees problems without editing
    const viewWarnings = job.vehicleCategory
      ? checkVehicleWarnings(
          job.vehicleCategory,
          (job.bodyTypes as string[] | null) ?? [],
          job,
        )
      : [];

    return (
      <Card title="Vehicle requirements">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="text-sm font-bold" style={{ color: "#0f172a" }}>{catLabel}</div>
            {job.minGvwClass && (
              <div className="text-xs mt-0.5" style={{ color: "#6b7280" }}>Min GVW: {job.minGvwClass}</div>
            )}
            {job.vehicleAccessNotes && (
              <div className="text-xs mt-0.5" style={{ color: "#6b7280" }}>{job.vehicleAccessNotes}</div>
            )}
          </div>
          <button
            onClick={() => setEditMode(true)}
            className="text-xs text-blue-600 hover:underline shrink-0"
          >
            Change
          </button>
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
        {viewWarnings.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {viewWarnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-800">
                <span className="text-amber-500 text-sm leading-none mt-0.5 flex-shrink-0">⚠</span>
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    );
  }

  // ── Edit / set mode ───────────────────────────────────────────────────────────
  return (
    <Card title="Vehicle requirements">
      {saveErr && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
          {saveErr}
        </div>
      )}

      {/* Fleet warning — shown before AI suggestion if fleet lacks required kit */}
      {suggestion?.fleetWarning && (
        <div className="mb-3 rounded-xl border border-orange-300 bg-orange-50 px-3 py-2.5 text-sm flex items-start gap-2">
          <span className="text-orange-500 text-base leading-none flex-shrink-0 mt-0.5">⚠</span>
          <p className="text-orange-800 text-xs">{suggestion.fleetWarning}</p>
        </div>
      )}

      {/* AI suggestion banner */}
      {suggestion && (
        <div className={`mb-3 rounded-xl border px-3 py-2.5 text-sm ${
          suggestion.confidence === "high"   ? "bg-green-50  border-green-200" :
          suggestion.confidence === "medium" ? "bg-blue-50   border-blue-200" :
                                               "bg-amber-50  border-amber-200"
        }`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="font-semibold">
                🤖 {VEHICLE_BUTTONS.find(b => b.value === suggestion.vehicleCategory)?.emoji}{" "}
                {VEHICLE_BUTTONS.find(b => b.value === suggestion.vehicleCategory)?.label
                  ?? BODY_CATEGORIES.find(c => c.value === suggestion.vehicleCategory)?.label
                  ?? suggestion.vehicleCategory}
              </span>
              {suggestion.suggestedBodyTypes?.length > 0 && (
                <span className="ml-2 text-xs text-slate-600">
                  + {suggestion.suggestedBodyTypes
                      .map(bt => BODY_TYPES.find(b => b.value === bt)?.label ?? bt)
                      .join(", ")}
                </span>
              )}
              <span className={`ml-2 text-xs font-medium px-1.5 py-0.5 rounded ${
                suggestion.confidence === "high"   ? "bg-green-100 text-green-700" :
                suggestion.confidence === "medium" ? "bg-blue-100  text-blue-700" :
                                                     "bg-amber-100 text-amber-700"
              }`}>
                {suggestion.confidence === "high" ? "High confidence" :
                 suggestion.confidence === "medium" ? "Medium confidence" : "Low confidence"}
              </span>
            </div>
            <button
              onClick={() => setSuggestion(null)}
              className="text-slate-400 hover:text-slate-600 text-base leading-none"
            >×</button>
          </div>
          <p className="text-xs mt-1" style={{ color: "#374151" }}>{suggestion.reasoning}</p>
          <button
            onClick={applySuggestion}
            className="mt-2 btn bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1.5"
          >
            Apply this suggestion
          </button>
        </div>
      )}

      {suggestErr && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          {suggestErr}
        </div>
      )}

      {/* Compatibility warnings — shown as soon as a category is selected */}
      {compatWarnings.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {compatWarnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-800">
              <span className="text-amber-500 text-sm leading-none mt-0.5 flex-shrink-0">⚠</span>
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* AI load ↔ vehicle check result */}
      {aiChecking && (
        <div className="mb-3 flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <span className="animate-spin inline-block">⟳</span>
          <span>Checking if this vehicle suits the load…</span>
        </div>
      )}
      {!aiChecking && aiCheck && !aiCheckDismissed && (
        <div className={`mb-3 rounded-xl border px-3 py-2.5 text-sm ${
          aiCheck.concern && aiCheck.severity === "high"   ? "bg-red-50 border-red-300"    :
          aiCheck.concern && aiCheck.severity === "medium" ? "bg-amber-50 border-amber-300":
          aiCheck.concern && aiCheck.severity === "low"    ? "bg-yellow-50 border-yellow-200":
                                                             "bg-green-50 border-green-200"
        }`}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <span className="text-base leading-none mt-0.5 flex-shrink-0">
                {aiCheck.concern
                  ? aiCheck.severity === "high" ? "🚫" : "⚠️"
                  : "✅"}
              </span>
              <div>
                <span className={`text-xs font-bold uppercase tracking-wide block mb-0.5 ${
                  aiCheck.concern && aiCheck.severity === "high"   ? "text-red-700"    :
                  aiCheck.concern && aiCheck.severity === "medium" ? "text-amber-700"  :
                  aiCheck.concern && aiCheck.severity === "low"    ? "text-yellow-700" :
                                                                     "text-green-700"
                }`}>
                  {aiCheck.concern
                    ? aiCheck.severity === "high"   ? "Not suitable for this load"
                    : aiCheck.severity === "medium" ? "Possible mismatch"
                                                    : "Worth checking"
                    : "Looks suitable"}
                </span>
                <p className={`text-xs ${
                  aiCheck.concern && aiCheck.severity === "high"   ? "text-red-800"    :
                  aiCheck.concern && aiCheck.severity === "medium" ? "text-amber-800"  :
                  aiCheck.concern                                  ? "text-yellow-800" :
                                                                     "text-green-800"
                }`}>
                  {aiCheck.message}
                </p>
                {aiCheck.suggestion && (
                  <p className="text-xs text-slate-500 mt-1">
                    <span className="font-medium">Try instead:</span> {aiCheck.suggestion}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={() => setAiCheckDismissed(true)}
              className="text-slate-400 hover:text-slate-600 text-lg leading-none flex-shrink-0 mt-0.5"
              title="Dismiss"
            >×</button>
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5">
            AI advisory — the planner makes the final decision
          </p>
        </div>
      )}

      {/* Category picker */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#94a3b8" }}>
            Vehicle type
          </span>
          <button
            onClick={handleSuggest}
            disabled={suggesting}
            className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50 flex items-center gap-1"
          >
            {suggesting ? (
              <><span className="animate-spin">⟳</span> Thinking…</>
            ) : (
              <>🤖 Suggest for this job</>
            )}
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {VEHICLE_BUTTONS.map(btn => (
            <button
              key={btn.value}
              onClick={() => { setCategory(btn.value); setBodyTypes([]); setMinGvw(""); }}
              className={`flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 py-2.5 px-1 text-center transition-all ${
                category === btn.value
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white hover:border-slate-300 text-slate-600"
              }`}
            >
              <span className="text-xl">{btn.emoji}</span>
              <span className="text-xs font-bold leading-tight">{btn.label}</span>
              <span className="text-[10px] leading-tight" style={{ color: "#9ca3af" }}>{btn.sub}</span>
            </button>
          ))}
        </div>
        {/* Specialist vehicles dropdown */}
        <div className="mt-2">
          <select
            className="input text-sm"
            value={VEHICLE_BUTTONS.some(b => b.value === category) ? "" : category}
            onChange={e => { if (e.target.value) { setCategory(e.target.value); setBodyTypes([]); setMinGvw(""); } }}
          >
            <option value="">Specialist / other vehicle…</option>
            {SPECIALIST_CATS.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Body / trailer type — grouped by category */}
      {category && availableBodyTypes.length > 0 && (() => {
        const isTrailer = TRAILER_CATEGORIES.has(category);
        // Build a map of group → items, preserving the order from availableBodyTypes
        const grouped: Record<string, { value: string; label: string }[]> = {};
        availableBodyTypes.forEach(bt => {
          const meta = BODY_TYPES.find(b => b.value === bt);
          if (!meta) return;
          if (!grouped[meta.group]) grouped[meta.group] = [];
          grouped[meta.group].push({ value: meta.value, label: meta.label });
        });
        const groups = Object.keys(grouped);
        return (
          <div className="mb-3 space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wide block" style={{ color: "#94a3b8" }}>
              {isTrailer ? "Trailer type (optional)" : "Body type (optional)"}
            </span>
            {groups.map(g => (
              <div key={g}>
                {groups.length > 1 && (
                  <div className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "#cbd5e1" }}>
                    {BODY_TYPE_GROUP_LABELS[g] ?? g}
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {grouped[g].map(bt => (
                    <button
                      key={bt.value}
                      onClick={() => toggleBodyType(bt.value)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                        bodyTypes.includes(bt.value)
                          ? "border-blue-400 bg-blue-50 text-blue-700 font-medium"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {bt.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Min GVW */}
      {availableGvw.length > 0 && (
        <div className="mb-3">
          <span className="text-xs font-semibold uppercase tracking-wide block mb-1" style={{ color: "#94a3b8" }}>
            Minimum GVW (optional)
          </span>
          <div className="flex flex-wrap gap-1.5">
            {availableGvw.map(g => (
              <button
                key={g.value}
                onClick={() => setMinGvw(prev => prev === g.value ? "" : g.value)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                  minGvw === g.value
                    ? "border-blue-400 bg-blue-50 text-blue-700 font-medium"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving || !category}
          className="btn bg-primary hover:opacity-90 text-white text-sm px-4 py-2 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save vehicle"}
        </button>
        {hasVehicle && (
          <button
            onClick={() => { setEditMode(false); setCategory(job.vehicleCategory ?? ""); setBodyTypes((job.bodyTypes as string[] | null) ?? []); setMinGvw(job.minGvwClass ?? ""); setSuggestion(null); setSaveErr(""); }}
            className="text-sm text-slate-400 hover:text-slate-700"
          >
            Cancel
          </button>
        )}
      </div>
    </Card>
  );
}
