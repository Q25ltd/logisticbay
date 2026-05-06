import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { jobsApi } from "../../api/jobs";
import { driversApi } from "../../api/drivers";
import { fleetApi } from "../../api/fleet";
import type { Driver, FleetTrailer, FleetUnit, JobStop, PlannedJob } from "../../types";
import { Alert } from "../../components/Alert";

type PlannerStatus =
  | "draft"
  | "ready_to_plan"
  | "needs_planning"
  | "planned"
  | "active"
  | "loaded_trailer"
  | "completed"
  | "cancelled";

type WarningLevel = "critical" | "warning" | "info";
type QuickFixKind = "stop_phone" | "stop_time" | "stop_reference" | "return_instruction";

type JobWarning = {
  level: WarningLevel;
  type: string;
  message: string;
  fix?: {
    kind: QuickFixKind;
    stopKey?: string;
  };
};

type AssignmentInput = {
  assignedDriverId: number | null;
  assignedTruck: string;
  assignedTrailer: string;
};

type JobContext = {
  job: PlannedJob;
  customer: string;
  route: string;
  load: string;
  vehicle: string;
  stopCount: string;
  timeRange: string;
  status: PlannerStatus;
  statusLabel: string;
  assignedDriver: Driver | null;
  assignedUnit: FleetUnit | null;
  assignedTrailer: FleetTrailer | null;
  loadedTrailer: FleetTrailer | null;
  isCarriedOver: boolean;
  warnings: JobWarning[];
};

const ACTIVE_JOB_STATUSES = new Set(["in_progress", "arrived_pickup", "collected", "arrived_dropoff"]);
const CLOSED_JOB_STATUSES = new Set(["completed", "cancelled"]);

const STATUS_LABELS: Record<PlannerStatus, string> = {
  draft: "Draft",
  ready_to_plan: "Ready to plan",
  needs_planning: "Needs planning",
  planned: "Planned",
  active: "In progress",
  loaded_trailer: "Loaded trailer parked",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_CLASSES: Record<PlannerStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  ready_to_plan: "bg-blue-100 text-blue-800",
  needs_planning: "bg-amber-100 text-amber-800",
  planned: "bg-emerald-100 text-emerald-800",
  active: "bg-indigo-100 text-indigo-800",
  loaded_trailer: "bg-purple-100 text-purple-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-slate-100 text-slate-500",
};

const WARNING_CLASSES: Record<WarningLevel, string> = {
  critical: "bg-red-50 text-red-800 border-red-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  info: "bg-blue-50 text-blue-800 border-blue-200",
};

const today = () => new Date().toISOString().slice(0, 10);

function dayKey(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function dateInputToTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function dateInputToShortDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function dateTimeInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDateTimeInput(value: string) {
  if (!value.trim()) return null;
  return new Date(value).toISOString();
}

function compact(value?: string | null, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function compactArray(value?: string[] | null) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function asNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function elapsedSince(value?: string | null) {
  if (!value) return "";
  const started = new Date(value).getTime();
  if (!Number.isFinite(started)) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - started) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours ? `${days}d ${remainingHours}h` : `${days}d`;
}

function loadedTrailerStandingText(trailer: FleetTrailer) {
  const elapsed = elapsedSince(trailer.updatedAt);
  return elapsed ? `standing ${elapsed}` : "standing time unknown";
}

function loadedTrailerStandingDetail(trailer: FleetTrailer) {
  const since = dateInputToShortDateTime(trailer.updatedAt);
  const elapsed = elapsedSince(trailer.updatedAt);
  if (since && elapsed) return `Standing since ${since} (${elapsed})`;
  return "Standing time unknown";
}

function sortedStops(job: PlannedJob) {
  return [...(job.stops ?? [])].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
}

function stopKey(stop: JobStop) {
  return stop.id ? `id:${stop.id}` : `seq:${stop.sequenceNumber}`;
}

function isSameStop(stop: JobStop, key?: string) {
  if (!key) return false;
  return stopKey(stop) === key;
}

function isPickup(stop: JobStop) {
  return stop.type === "pickup" || stop.type === "collection";
}

function isDropoff(stop: JobStop) {
  return stop.type === "dropoff" || stop.type === "delivery";
}

function shortLocation(stop: JobStop | undefined, fallback: string) {
  if (!stop) return compact(fallback);
  const site = compact(stop.siteName || stop.unitName || stop.locationTextSnapshot, "");
  const town = compact(stop.town, "");
  const postcode = compact(stop.postcode, "");
  if (site && town && !site.toLowerCase().includes(town.toLowerCase())) return `${site} ${town}`;
  if (site) return site;
  return town || postcode || compact(fallback);
}

function routeSummary(job: PlannedJob) {
  const stops = sortedStops(job);
  const pickups = stops.filter(isPickup);
  const dropoffs = stops.filter(isDropoff);
  const pickup = shortLocation(pickups[0], job.pickupTextSnapshot);

  if (dropoffs.length === 0) return `${pickup} -> ${compact(job.dropoffTextSnapshot)}`;

  const dropLabels = dropoffs.map((stop) => shortLocation(stop, job.dropoffTextSnapshot));
  const uniqueDropLabels = Array.from(new Set(dropLabels));
  if (dropoffs.length > 1 && uniqueDropLabels.length === 1) {
    return `${pickup} -> ${uniqueDropLabels[0]} (${dropoffs.length})`;
  }
  if (uniqueDropLabels.length > 2) {
    return `${pickup} -> ${uniqueDropLabels.slice(0, 2).join(" -> ")} (+${uniqueDropLabels.length - 2})`;
  }
  return `${pickup} -> ${uniqueDropLabels.join(" -> ")}`;
}

function stopCountLabel(job: PlannedJob) {
  const stops = sortedStops(job);
  const collections = stops.filter(isPickup).length || (job.pickupTextSnapshot ? 1 : 0);
  const deliveries = stops.filter(isDropoff).length || (job.dropoffTextSnapshot ? 1 : 0);
  return `${collections}C->${deliveries}D`;
}

function loadSummary(job: PlannedJob) {
  const quantity = job.loadDetails?.quantity ?? job.quantityExpected;
  const unit = job.loadDetails?.unit ?? job.quantityUnit;
  const material = job.loadDetails?.materialType || job.materialType;
  const amount = quantity ? `${quantity} ${unit || ""}`.trim() : "";
  if (amount && material) return `${amount} ${material}`.trim();
  return amount || material || "Load not set";
}

function vehicleRequirement(job: PlannedJob) {
  return job.vehicleClassRequired || job.vehicleClass || job.minVehicleSize || "Vehicle not set";
}

function requiresTrailer(job: PlannedJob) {
  const vehicle = normalizeVehicle(vehicleRequirement(job));
  return vehicle === "artic" || compactArray(job.trailerTypesAllowed).length > 0 || !!job.assignedTrailer;
}

function timeRange(job: PlannedJob) {
  const stops = sortedStops(job);
  const times = stops
    .flatMap((stop) => [stop.timeWindowStart, stop.timeWindowEnd, stop.bookedTime])
    .filter((value): value is string => !!value)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  if (times.length === 0) return "No time set";
  const start = dateInputToTime(times[0]);
  const end = dateInputToTime(times[times.length - 1]);
  return start === end ? start : `${start}-${end}`;
}

function stopTimeLabel(stop: JobStop) {
  if (stop.bookedTime) return `Booked ${dateInputToTime(stop.bookedTime)}`;
  const start = dateInputToTime(stop.timeWindowStart);
  const end = dateInputToTime(stop.timeWindowEnd);
  if (start && end && start !== end) return `${start}-${end}`;
  return start || end || "No time set";
}

function stopDateTimeLabel(stop: JobStop) {
  if (stop.bookedTime) return dateInputToShortDateTime(stop.bookedTime);
  const date = dayKey(stop.timeWindowStart ?? stop.timeWindowEnd);
  const time = stopTimeLabel(stop);
  return time === "No time set" ? "" : [date, time].filter(Boolean).join(" ");
}

function customerName(job: PlannedJob) {
  return job.customerName || job.customer?.name || "No customer";
}

function normalizeRegistration(value?: string | null) {
  return String(value ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

function normalizeVehicle(value?: string | null) {
  const text = String(value ?? "").toLowerCase();
  if (text.includes("class1") || text.includes("class 1") || text.includes("artic")) return "artic";
  if (text.includes("class2") || text.includes("class 2") || text.includes("rigid")) return "rigid";
  if (text.includes("van")) return "van";
  if (text.includes("tipper")) return "tipper";
  if (text.includes("grab")) return "grab";
  if (text.includes("mixer")) return "mixer";
  if (text.includes("hiab")) return "hiab";
  if (!text.trim() || text === "vehicle not set") return "";
  return text.trim();
}

function normalizeTrailer(value?: string | null) {
  const text = String(value ?? "").toLowerCase();
  if (text.includes("refrigerated") || text.includes("fridge") || text.includes("reefer")) return "refrigerated";
  if (text.includes("curtain")) return "curtain";
  if (text.includes("box")) return "box";
  if (text.includes("flat")) return "flat";
  if (text.includes("low")) return "low-loader";
  if (text.includes("tipper")) return "tipper";
  if (!text.trim()) return "";
  return text.trim();
}

function unitMatchesRequirement(job: PlannedJob, unit: FleetUnit | null) {
  const required = normalizeVehicle(vehicleRequirement(job));
  if (!required || !unit) return true;
  return normalizeVehicle(unit.vehicleClass) === required;
}

function trailerMatchesRequirement(job: PlannedJob, trailer: FleetTrailer | null) {
  const allowed = compactArray(job.trailerTypesAllowed).map(normalizeTrailer).filter(Boolean);
  if (!allowed.length || !trailer) return true;
  return allowed.includes(normalizeTrailer(trailer.trailerType));
}

function assignedDriver(job: PlannedJob, drivers: Driver[], driverId = job.assignedDriverId) {
  if (driverId == null) return null;
  return drivers.find((driver) => driver.id === driverId) ?? job.assignedDriver ?? null;
}

function unitByRegistration(units: FleetUnit[], registration?: string | null) {
  const target = normalizeRegistration(registration);
  return target ? units.find((unit) => normalizeRegistration(unit.registration) === target) ?? null : null;
}

function trailerByRegistration(trailers: FleetTrailer[], registration?: string | null) {
  const target = normalizeRegistration(registration);
  return target ? trailers.find((trailer) => normalizeRegistration(trailer.registration) === target) ?? null : null;
}

function loadedTrailerForJob(job: PlannedJob, trailers: FleetTrailer[]) {
  return trailers.find((trailer) => (
    trailer.status === "loaded"
    && (trailer.linkedJobId === job.id || normalizeRegistration(trailer.registration) === normalizeRegistration(job.assignedTrailer))
  )) ?? null;
}

function selectedTrailerForJob(job: PlannedJob, trailers: FleetTrailer[], assignment?: AssignmentInput) {
  const assignedTrailer = assignment?.assignedTrailer ?? job.assignedTrailer;
  return trailerByRegistration(trailers, assignedTrailer) ?? loadedTrailerForJob(job, trailers);
}

function isClosed(job: PlannedJob) {
  return CLOSED_JOB_STATUSES.has(job.status);
}

function isCarriedOver(job: PlannedJob, date: string) {
  const planned = dayKey(job.plannedDate);
  if (!planned || planned >= date || isClosed(job)) return false;
  // Only carry over jobs from the last 14 days — older than that are stale/abandoned
  const daysDiff = (new Date(date).getTime() - new Date(planned).getTime()) / 86_400_000;
  return daysDiff <= 14;
}

function hasMissingPlanningInfo(warning: JobWarning) {
  return warning.type.startsWith("missing_") || warning.type === "load_split_missing" || warning.type === "no_customer";
}

function buildWarnings(
  job: PlannedJob,
  drivers: Driver[],
  units: FleetUnit[],
  trailers: FleetTrailer[],
  assignment?: AssignmentInput,
) {
  const warnings: JobWarning[] = [];
  if (isClosed(job)) return warnings;

  const driverId = assignment?.assignedDriverId ?? job.assignedDriverId;
  const truckReg = assignment?.assignedTruck ?? job.assignedTruck ?? "";
  const trailerReg = assignment?.assignedTrailer ?? job.assignedTrailer ?? "";
  const driver = assignedDriver(job, drivers, driverId);
  const unit = unitByRegistration(units, truckReg);
  const trailer = selectedTrailerForJob(job, trailers, assignment);
  const linkedLoadedTrailer = loadedTrailerForJob(job, trailers);
  const stops = sortedStops(job);
  const pickupStops = stops.filter(isPickup);
  const dropoffStops = stops.filter(isDropoff);

  if (!job.customerId && !job.customerName && !job.customer?.name) {
    warnings.push({ level: "warning", type: "no_customer", message: "No customer assigned." });
  }

  if (stops.length < 2 || pickupStops.length === 0 || dropoffStops.length === 0) {
    warnings.push({ level: "critical", type: "missing_stops", message: "Collection/drop-off stops are incomplete." });
  }

  if (!job.vehicleClassRequired && !job.vehicleClass && !job.minVehicleSize) {
    warnings.push({ level: "warning", type: "missing_vehicle", message: "Vehicle type requirement is missing." });
  }

  if (!job.loadDetails?.quantity && !job.quantityExpected && !job.loadDetails?.materialType && !job.materialType) {
    warnings.push({ level: "warning", type: "missing_load", message: "Load summary is missing." });
  }

  if (driverId == null) {
    warnings.push({ level: "critical", type: "no_driver", message: "No driver assigned." });
  } else if (!driver || driver.status !== "active" || driver.user?.status === "inactive") {
    warnings.push({ level: "critical", type: "driver_unavailable", message: "Assigned driver is unavailable." });
  }

  if (!truckReg.trim()) {
    warnings.push({ level: "critical", type: "no_unit", message: "No unit/truck assigned." });
  } else if (!unit) {
    warnings.push({ level: "warning", type: "unit_unknown", message: "Assigned unit is not in the fleet list." });
  } else {
    if (unit.status === "vor") {
      warnings.push({ level: "critical", type: "unit_vor", message: `${unit.registration} is VOR.` });
    } else if (unit.status !== "available") {
      warnings.push({ level: "warning", type: "unit_unavailable", message: `${unit.registration} is marked ${unit.status}.` });
    }
    if (!unitMatchesRequirement(job, unit)) {
      warnings.push({
        level: "warning",
        type: "vehicle_mismatch",
        message: `Job requires ${vehicleRequirement(job)}. Selected unit is ${unit.vehicleClass}.`,
      });
    }
  }

  if (linkedLoadedTrailer) {
    warnings.push({
      level: "warning",
      type: "loaded_trailer_waiting",
      message: `Loaded trailer ${linkedLoadedTrailer.registration} is waiting${linkedLoadedTrailer.yardLocation ? ` at ${linkedLoadedTrailer.yardLocation}` : ""} (${loadedTrailerStandingText(linkedLoadedTrailer)}).`,
    });
  }

  if (requiresTrailer(job)) {
    if (!trailerReg.trim() && !linkedLoadedTrailer) {
      warnings.push({
        level: "info",
        type: "no_trailer_selected",
        message: "No trailer selected. Driver can confirm/select trailer at job start.",
      });
    } else if (trailerReg.trim() && !trailer) {
      warnings.push({ level: "warning", type: "trailer_unknown", message: "Selected trailer is not in the fleet list." });
    } else if (trailer) {
      if (trailer.status === "vor") {
        warnings.push({ level: "critical", type: "trailer_vor", message: `${trailer.registration} is VOR.` });
      }
      if (trailer.status === "loaded" && trailer.linkedJobId && trailer.linkedJobId !== job.id) {
        warnings.push({ level: "critical", type: "trailer_loaded_other_job", message: `${trailer.registration} is loaded for another job.` });
      }
      if (!trailerMatchesRequirement(job, trailer)) {
        warnings.push({
          level: "warning",
          type: "trailer_mismatch",
          message: `Job requires ${compactArray(job.trailerTypesAllowed).join(", ")} trailer. Selected trailer is ${trailer.trailerType}.`,
        });
      }
    }
  }

  const missingPhones = stops.filter((stop) => !compact(stop.contactPhone, ""));
  if (missingPhones.length > 0) {
    warnings.push({
      level: "info",
      type: "missing_contact_phone",
      message: `${missingPhones.length} stop${missingPhones.length > 1 ? "s" : ""} missing contact phone.`,
      fix: { kind: "stop_phone", stopKey: stopKey(missingPhones[0]) },
    });
  }

  const missingTimes = stops.filter((stop) => !stop.timeWindowStart && !stop.bookedTime);
  if (missingTimes.length > 0) {
    warnings.push({
      level: "info",
      type: "missing_stop_timing",
      message: `${missingTimes.length} stop${missingTimes.length > 1 ? "s" : ""} missing timing.`,
      fix: { kind: "stop_time", stopKey: stopKey(missingTimes[0]) },
    });
  }

  const missingRefs = stops.filter((stop) => !compact(stop.referenceNumber, ""));
  if (missingRefs.length > 0) {
    warnings.push({
      level: "info",
      type: "missing_stop_reference",
      message: `${missingRefs.length} stop${missingRefs.length > 1 ? "s" : ""} missing stop reference.`,
      fix: { kind: "stop_reference", stopKey: stopKey(missingRefs[0]) },
    });
  }

  const loadQty = asNumber(job.loadDetails?.quantity ?? job.quantityExpected);
  const allocatedPallets = stops.reduce((sum, stop) => sum + (asNumber(stop.numPallets) ?? 0), 0);
  if (dropoffStops.length > 1 && loadQty && allocatedPallets === 0) {
    warnings.push({ level: "warning", type: "load_split_missing", message: "Multi-drop job has no per-stop load split." });
  } else if (loadQty && allocatedPallets > 0 && Math.abs(allocatedPallets - loadQty) > 0.001) {
    warnings.push({ level: "warning", type: "load_split_mismatch", message: "Stop quantities do not match total load." });
  }

  if (job.failureAction === "finish_then_return" && !job.returnDestination) {
    warnings.push({
      level: "warning",
      type: "missing_return_instruction",
      message: "Return instruction is missing.",
      fix: { kind: "return_instruction" },
    });
  }

  return warnings;
}

function deriveStatus(job: PlannedJob, warnings: JobWarning[], loadedTrailer: FleetTrailer | null): PlannerStatus {
  if (job.status === "completed") return "completed";
  if (job.status === "cancelled") return "cancelled";
  if (loadedTrailer) return "loaded_trailer";
  if (ACTIVE_JOB_STATUSES.has(job.status)) return "active";
  if (job.assignedDriverId && job.assignedTruck) return "planned";
  if (job.validationStatus === "draft") return "draft";
  if (warnings.some(hasMissingPlanningInfo)) return "needs_planning";
  if (job.validationStatus === "ready_to_plan") return "ready_to_plan";
  return "ready_to_plan";
}

function makeJobContext(
  job: PlannedJob,
  drivers: Driver[],
  units: FleetUnit[],
  trailers: FleetTrailer[],
  date: string,
): JobContext {
  const warnings = buildWarnings(job, drivers, units, trailers);
  const loadedTrailer = loadedTrailerForJob(job, trailers);
  const status = deriveStatus(job, warnings, loadedTrailer);
  return {
    job,
    customer: customerName(job),
    route: routeSummary(job),
    load: loadSummary(job),
    vehicle: vehicleRequirement(job),
    stopCount: stopCountLabel(job),
    timeRange: timeRange(job),
    status,
    statusLabel: STATUS_LABELS[status],
    assignedDriver: assignedDriver(job, drivers),
    assignedUnit: unitByRegistration(units, job.assignedTruck),
    assignedTrailer: selectedTrailerForJob(job, trailers),
    loadedTrailer,
    isCarriedOver: isCarriedOver(job, date),
    warnings,
  };
}

function statusBadge(status: PlannerStatus) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${STATUS_CLASSES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function warningDot(level: WarningLevel) {
  const cls = level === "critical" ? "bg-red-500" : level === "warning" ? "bg-amber-500" : "bg-blue-500";
  return <span className={`mt-1 h-2 w-2 rounded-full ${cls}`} />;
}

function riskRank(context: JobContext) {
  if (context.warnings.some((warning) => warning.level === "critical")) return 0;
  if (context.status === "needs_planning") return 1;
  if (context.status === "ready_to_plan" || context.status === "draft") return 2;
  if (context.status === "loaded_trailer") return 3;
  if (context.status === "planned") return 4;
  if (context.status === "active") return 5;
  if (context.status === "completed") return 8;
  return 9;
}

function earliestTimeRank(job: PlannedJob) {
  const times = sortedStops(job)
    .flatMap((stop) => [stop.timeWindowStart, stop.bookedTime, stop.timeWindowEnd])
    .filter((value): value is string => !!value)
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);
  return times.length ? Math.min(...times) : Number.MAX_SAFE_INTEGER;
}

function appendPlannerReason(existing: string, reason: string) {
  const cleanReason = reason.trim();
  if (!cleanReason) return existing;
  const stamp = new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  return [existing?.trim(), `[Planner override ${stamp}] ${cleanReason}`].filter(Boolean).join("\n");
}

function SummaryCard({
  title,
  lead,
  detail,
  tone = "slate",
  onClick,
}: {
  title: string;
  lead: string;
  detail: string;
  tone?: "slate" | "blue" | "amber" | "green";
  onClick?: () => void;
}) {
  const toneClass = {
    slate: "border-slate-200 hover:border-slate-300",
    blue: "border-blue-200 hover:border-blue-300",
    amber: "border-amber-200 hover:border-amber-300",
    green: "border-emerald-200 hover:border-emerald-300",
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`card p-3 text-left min-h-[86px] transition-colors ${toneClass}`}
    >
      <div className="text-xs font-bold uppercase tracking-wide text-muted">{title}</div>
      <div className="mt-1 text-lg font-black text-primary leading-tight">{lead}</div>
      <div className="mt-1 text-xs text-muted leading-snug">{detail}</div>
    </button>
  );
}

function FilterPill({ active, children, onClick }: { active: boolean; children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
        active ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-blue-300"
      }`}
    >
      {children}
    </button>
  );
}

function JobCard({
  context,
  onAssign,
  onDetails,
  onQuickFix,
}: {
  context: JobContext;
  onAssign: () => void;
  onDetails: () => void;
  onQuickFix: () => void;
}) {
  const critical = context.warnings.filter((warning) => warning.level === "critical").length;
  const warnings = context.warnings.filter((warning) => warning.level === "warning").length;
  const hasFix = context.warnings.some((warning) => warning.fix);

  return (
    <div className={`card p-3 ${critical ? "border-l-4 border-l-red-500" : warnings ? "border-l-4 border-l-amber-400" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold uppercase text-slate-700">
              {context.customer}
            </span>
            {context.isCarriedOver && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-bold text-orange-800">Carried over</span>}
            {context.loadedTrailer && (
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-bold text-purple-800">
                Loaded {context.loadedTrailer.registration} | {loadedTrailerStandingText(context.loadedTrailer)}
              </span>
            )}
          </div>
          <div className="mt-1 truncate text-sm font-black text-primary">{context.route}</div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            <span>{context.load}</span>
            <span>{context.vehicle}</span>
            <span>{context.timeRange}</span>
            <span>{context.stopCount}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {statusBadge(context.status)}
            {context.assignedDriver && <span className="text-xs text-slate-600">Driver: {context.assignedDriver.displayName}</span>}
            {critical + warnings > 0 && (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${critical ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
                {critical + warnings} issue{critical + warnings > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {!isClosed(context.job) && (
            <button type="button" onClick={onAssign} className="btn btn-primary px-3 py-1.5 text-xs">
              Assign driver
            </button>
          )}
          <button type="button" onClick={onDetails} className="btn btn-outline px-3 py-1.5 text-xs">
            View details
          </button>
          {hasFix && (
            <button type="button" onClick={onQuickFix} className="text-xs font-semibold text-amber-700 hover:underline">
              Quick fix
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function FleetStatus({ status }: { status: string }) {
  const cls = status === "vor"
    ? "bg-red-100 text-red-800"
    : status === "loaded"
      ? "bg-purple-100 text-purple-800"
      : status === "assigned"
        ? "bg-blue-100 text-blue-800"
        : "bg-green-100 text-green-800";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${cls}`}>{status === "vor" ? "VOR" : status}</span>;
}

function DriverSnapshot({
  drivers,
  contexts,
  units,
  trailers,
  onAssignDriver,
  onPickJobForDriver,
  onViewMore,
  onMarkUnavailable,
}: {
  drivers: Driver[];
  contexts: JobContext[];
  units: FleetUnit[];
  trailers: FleetTrailer[];
  onAssignDriver: (driver: Driver) => void;
  onPickJobForDriver: (driver: Driver) => void;
  onViewMore: () => void;
  onMarkUnavailable: (driver: Driver) => void;
}) {
  const openContexts = contexts.filter((context) => !isClosed(context.job));
  const assignedIds = new Set(openContexts.map((context) => context.job.assignedDriverId).filter((id): id is number => id != null));

  // A driver has a vehicle if their profile has a default truck OR any open job has a truck assigned to them
  function driverHasVehicle(driver: Driver): boolean {
    if (driver.defaultTruckReg) return true;
    return openContexts.some((ctx) => ctx.job.assignedDriverId === driver.id && !!ctx.job.assignedTruck);
  }

  // The effective unit reg to display for a driver
  function driverUnitReg(driver: Driver): string {
    if (driver.defaultTruckReg) return driver.defaultTruckReg;
    const jobWithTruck = openContexts.find((ctx) => ctx.job.assignedDriverId === driver.id && !!ctx.job.assignedTruck);
    return jobWithTruck?.job.assignedTruck ?? "";
  }

  // Sort: needs-attention first (free with no vehicle, or free), then busy, then unavailable
  function driverSortKey(driver: Driver) {
    if (driver.status !== "active") return 3;
    const hasJob = assignedIds.has(driver.id);
    const hasVehicle = driverHasVehicle(driver);
    if (!hasJob && !hasVehicle) return 0; // no job + no vehicle — top priority
    if (!hasJob) return 1;               // no job but has vehicle
    return 2;                            // assigned
  }

  const sortedDrivers = [...drivers].sort((a, b) => driverSortKey(a) - driverSortKey(b));

  // Show all active drivers who need attention (no job or no vehicle)
  const needsAttentionDrivers = sortedDrivers.filter((d) => d.status === "active" && (!assignedIds.has(d.id) || !driverHasVehicle(d)));
  const otherDrivers = sortedDrivers.filter((d) => !(d.status === "active" && (!assignedIds.has(d.id) || !driverHasVehicle(d))));
  const visibleDrivers = [...needsAttentionDrivers, ...otherDrivers].slice(0, 8);

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wide text-primary">Drivers</h2>
          <p className="text-xs text-muted">
            {needsAttentionDrivers.length > 0
              ? `${needsAttentionDrivers.length} need${needsAttentionDrivers.length === 1 ? "s" : ""} attention`
              : "All active drivers assigned"}
          </p>
        </div>
        <button type="button" onClick={onViewMore} className="text-xs font-semibold text-accent hover:underline">View all</button>
      </div>

      <div className="space-y-2">
        {visibleDrivers.map((driver) => {
          const driverJobs = openContexts.filter((context) => context.job.assignedDriverId === driver.id);
          const activeJob = driverJobs.find((context) => context.status === "active" || context.status === "loaded_trailer");
          const freeSoon = driver.status === "active" && !!activeJob && ["collected", "arrived_dropoff"].includes(activeJob.job.status);
          const hasJob = assignedIds.has(driver.id);
          const isActive = driver.status === "active";
          const hasVehicle = driverHasVehicle(driver);
          const unitReg = driverUnitReg(driver);
          const defaultUnit = unitByRegistration(units, unitReg);
          const currentTrailer = defaultUnit?.currentTrailerId
            ? trailers.find((trailer) => trailer.id === defaultUnit.currentTrailerId)
            : null;
          const noJob = isActive && !hasJob;
          const noVehicle = isActive && !hasVehicle;
          const needsAttention = noJob || noVehicle;

          return (
            <div key={driver.id} className={`rounded-lg border p-2.5 ${needsAttention ? "border-orange-200 bg-orange-50" : "border-slate-200 bg-white"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-primary">{driver.displayName}</div>
                  {/* Status tags */}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {!isActive && (
                      <span className="rounded px-1.5 py-0.5 text-[11px] font-bold bg-slate-100 text-slate-500">Unavailable</span>
                    )}
                    {isActive && noJob && (
                      <span className="rounded px-1.5 py-0.5 text-[11px] font-bold bg-red-100 text-red-700">No job assigned</span>
                    )}
                    {isActive && hasJob && freeSoon && (
                      <span className="rounded px-1.5 py-0.5 text-[11px] font-bold bg-blue-100 text-blue-700">Free soon</span>
                    )}
                    {isActive && hasJob && !freeSoon && (
                      <span className="rounded px-1.5 py-0.5 text-[11px] font-bold bg-amber-100 text-amber-700">
                        {driverJobs.length} job{driverJobs.length !== 1 ? "s" : ""}
                      </span>
                    )}
                    {isActive && noVehicle && (
                      <span className="rounded px-1.5 py-0.5 text-[11px] font-bold bg-red-100 text-red-700">No vehicle</span>
                    )}
                    {isActive && hasVehicle && (
                      <span className="rounded px-1.5 py-0.5 text-[11px] font-bold bg-slate-100 text-slate-600">
                        {unitReg}
                        {currentTrailer ? ` + ${currentTrailer.registration}` : ""}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {isActive && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {noJob && (
                    <button type="button" onClick={() => onAssignDriver(driver)} className="text-xs font-semibold text-accent hover:underline">
                      Assign job →
                    </button>
                  )}
                  {!noJob && (
                    <button type="button" onClick={() => onPickJobForDriver(driver)} className="text-xs font-semibold text-slate-500 hover:text-accent">
                      Assign another →
                    </button>
                  )}
                  <button type="button" onClick={() => onMarkUnavailable(driver)} className="text-xs text-slate-400 hover:text-red-600">
                    Mark unavailable
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {visibleDrivers.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-muted">No drivers yet.</div>
        )}
      </div>
    </section>
  );
}

function fleetStatusRank(status: string) {
  if (status === "available") return 0;
  if (status === "vor") return 2;
  return 1; // in_use, loaded, assigned, etc.
}

function FleetSnapshot({
  units,
  trailers,
  drivers,
  openContexts,
  onViewMore,
}: {
  units: FleetUnit[];
  trailers: FleetTrailer[];
  drivers: Driver[];
  openContexts: JobContext[];
  onViewMore: () => void;
}) {
  // Sort: available → assigned/in_use → vor
  const sortedUnits = [...units].sort((a, b) =>
    fleetStatusRank(a.status) - fleetStatusRank(b.status) || a.registration.localeCompare(b.registration)
  );
  const sortedTrailers = [...trailers].sort((a, b) =>
    fleetStatusRank(a.status) - fleetStatusRank(b.status) || a.registration.localeCompare(b.registration)
  );

  // Find which driver/job has each unit reg
  function unitDriver(reg: string): Driver | null {
    const job = openContexts.find((ctx) => ctx.job.assignedTruck?.toUpperCase() === reg.toUpperCase() && ctx.job.assignedDriverId);
    if (job?.job.assignedDriverId) return drivers.find((d) => d.id === job.job.assignedDriverId) ?? null;
    return drivers.find((d) => d.defaultTruckReg?.toUpperCase() === reg.toUpperCase()) ?? null;
  }

  // Find attached trailer for a unit
  function unitTrailer(unit: FleetUnit): FleetTrailer | null {
    if (unit.currentTrailerId) return trailers.find((t) => t.id === unit.currentTrailerId) ?? null;
    // Also check job context
    const job = openContexts.find((ctx) => ctx.job.assignedTruck?.toUpperCase() === unit.registration.toUpperCase() && ctx.job.assignedTrailer);
    if (job?.job.assignedTrailer) return trailers.find((t) => t.registration.toUpperCase() === job.job.assignedTrailer!.toUpperCase()) ?? null;
    return null;
  }

  function unitBg(status: string) {
    if (status === "available") return "bg-green-50 border-green-200";
    if (status === "vor") return "bg-red-50 border-red-200";
    return "bg-amber-50 border-amber-200";
  }

  function trailerBg(status: string) {
    if (status === "available") return "bg-green-50 border-green-200";
    if (status === "vor") return "bg-red-50 border-red-200";
    return "bg-amber-50 border-amber-200";
  }

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wide text-primary">Fleet Snapshot</h2>
          <p className="text-xs text-muted">Available → assigned → VOR. Full management in Fleet.</p>
        </div>
        <button type="button" onClick={onViewMore} className="text-xs font-semibold text-accent hover:underline">View fleet</button>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Units</div>
          <div className="space-y-1.5">
            {sortedUnits.map((unit) => {
              const driver = unitDriver(unit.registration);
              const trailer = unitTrailer(unit);
              return (
                <div key={unit.id} className={`rounded-lg border px-2.5 py-2 text-xs ${unitBg(unit.status)}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-bold text-primary">{unit.registration}</span>
                      <span className="ml-2 text-muted">{unit.vehicleClass}</span>
                    </div>
                    <FleetStatus status={unit.status} />
                  </div>
                  {(driver || trailer) && (
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      {driver && <span>Driver: {driver.displayName}</span>}
                      {driver && trailer && <span className="mx-1">·</span>}
                      {trailer && (
                        <span>
                          Trailer: {trailer.registration}
                          {trailer.status === "available" && <span className="ml-1 text-green-600">●</span>}
                          {trailer.status === "vor" && <span className="ml-1 text-red-600">●</span>}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {sortedUnits.length === 0 && <div className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-muted">No units.</div>}
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Trailers</div>
          <div className="space-y-1.5">
            {sortedTrailers.map((trailer) => (
              <div key={trailer.id} className={`rounded-lg border px-2.5 py-2 text-xs ${trailerBg(trailer.status)}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-bold text-primary">{trailer.registration}</span>
                    <span className="ml-2 text-muted">{trailer.trailerType}</span>
                  </div>
                  <FleetStatus status={trailer.status} />
                </div>
                {(trailer.linkedJobId || trailer.yardLocation || trailer.status === "loaded") && (
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    {trailer.linkedJobId && <span>Job #{trailer.linkedJobId}</span>}
                    {trailer.linkedJobId && trailer.yardLocation && <span className="mx-1">·</span>}
                    {trailer.yardLocation && <span>{trailer.yardLocation}</span>}
                    {trailer.status === "loaded" && <span className="ml-1 text-purple-700">| {loadedTrailerStandingText(trailer)}</span>}
                  </div>
                )}
              </div>
            ))}
            {sortedTrailers.length === 0 && <div className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-muted">No trailers.</div>}
          </div>
        </div>
      </div>
    </section>
  );
}

function AssignDrawer({
  context,
  allContexts,
  drivers,
  units,
  trailers,
  date,
  presetDriverId,
  onClose,
  onSaved,
}: {
  context: JobContext;
  allContexts: JobContext[];
  drivers: Driver[];
  units: FleetUnit[];
  trailers: FleetTrailer[];
  date: string;
  presetDriverId?: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const linkedLoadedTrailer = loadedTrailerForJob(context.job, trailers);
  const initialDriver = presetDriverId ?? context.job.assignedDriverId ?? null;
  const [driverId, setDriverId] = useState(initialDriver ? String(initialDriver) : "");
  const [unitReg, setUnitReg] = useState(context.job.assignedTruck || "");
  const [trailerReg, setTrailerReg] = useState(linkedLoadedTrailer?.registration || context.job.assignedTrailer || "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Stop timing state — keyed by stopId
  const [stopTimes, setStopTimes] = useState<Record<number, {
    bookedDate: string; bookedTime: string;
    earliestArrival: string; unloading: string;
  }>>(() => {
    const init: Record<number, { bookedDate: string; bookedTime: string; earliestArrival: string; unloading: string }> = {};
    for (const stop of sortedStops(context.job)) {
      if (stop.id == null) continue;
      let bDate = "", bTime = "";
      if (stop.bookedTime) {
        const d = new Date(stop.bookedTime);
        if (!Number.isNaN(d.getTime())) {
          bDate = d.toISOString().slice(0, 10);
          bTime = d.toISOString().slice(11, 16);
        }
      }
      init[stop.id] = {
        bookedDate: bDate,
        bookedTime: bTime,
        earliestArrival: stop.earliestArrivalMinutes != null ? String(stop.earliestArrivalMinutes) : "",
        unloading:        stop.unloadingAllowanceMinutes != null ? String(stop.unloadingAllowanceMinutes) : "",
      };
    }
    return init;
  });

  function setStopField(stopId: number, field: string, value: string) {
    setStopTimes(prev => ({ ...prev, [stopId]: { ...prev[stopId], [field]: value } }));
  }

  const selectedDriver = drivers.find((driver) => String(driver.id) === driverId) ?? null;

  function changeDriver(value: string) {
    setDriverId(value);
    const driver = drivers.find((item) => String(item.id) === value);
    if (driver?.defaultTruckReg && !unitReg.trim()) {
      setUnitReg(driver.defaultTruckReg);
    }
  }

  const assignment: AssignmentInput = {
    assignedDriverId: driverId ? Number(driverId) : null,
    assignedTruck: unitReg,
    assignedTrailer: trailerReg,
  };

  const openOthers = allContexts.filter((ctx) => ctx.job.id !== context.job.id && !isClosed(ctx.job));

  // Swap detection
  const driverOnOtherJob = driverId
    ? openOthers.find((ctx) => ctx.job.assignedDriverId === Number(driverId))
    : null;
  const truckOnOtherJob = unitReg.trim()
    ? openOthers.find((ctx) => ctx.job.assignedTruck?.toUpperCase() === unitReg.trim().toUpperCase())
    : null;
  const trailerOnOtherJob = trailerReg.trim() && !linkedLoadedTrailer
    ? openOthers.find((ctx) => ctx.job.assignedTrailer?.toUpperCase() === trailerReg.trim().toUpperCase())
    : null;

  const warnings = buildWarnings(context.job, drivers, units, trailers, assignment);
  const nonInfoWarnings = warnings.filter((warning) => warning.level !== "info");
  // A unit cannot be assigned without a driver — a truck doesn't drive itself
  const unitWithoutDriver = !!unitReg.trim() && !driverId;
  const hardBlocked = unitWithoutDriver || warnings.some((warning) => ["no_driver", "no_unit", "driver_unavailable"].includes(warning.type));
  const needsReason = nonInfoWarnings.length > 0 && !hardBlocked;
  const selectedUnit = unitByRegistration(units, unitReg);
  const selectedTrailer = selectedTrailerForJob(context.job, trailers, assignment);

  async function save() {
    setSaving(true);
    setError("");
    try {
      // Build stopTimes payload
      const stopTimesPayload = sortedStops(context.job)
        .filter((stop) => stop.id != null)
        .map((stop) => {
          const t = stopTimes[stop.id!];
          if (!t) return null;
          const bookedIso = t.bookedDate && t.bookedTime
            ? `${t.bookedDate}T${t.bookedTime}:00.000Z`
            : (t.bookedDate || t.bookedTime ? null : undefined);
          return {
            stopId: stop.id!,
            ...(bookedIso !== undefined ? { bookedTime: bookedIso } : {}),
            ...(t.earliestArrival !== "" ? { earliestArrivalMinutes: parseInt(t.earliestArrival, 10) } : {}),
            ...(t.unloading !== "" ? { unloadingAllowanceMinutes: parseInt(t.unloading, 10) } : {}),
          };
        })
        .filter(Boolean);

      await jobsApi.allocate(context.job.id, {
        assignedDriverId: driverId ? Number(driverId) : null,
        assignedTruck:    unitReg.trim(),
        assignedTrailer:  trailerReg.trim(),
        ...(stopTimesPayload.length > 0 ? { stopTimes: stopTimesPayload } : {}),
      });
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save allocation");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-black/40">
      <div className="ml-auto flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        <div className="border-b border-border p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-primary">Allocate job</h2>
              <p className="mt-1 text-sm text-muted">{context.route}</p>
              {context.job.referenceNumber && (
                <p className="text-xs text-muted">Ref: {context.job.referenceNumber}</p>
              )}
            </div>
            <button type="button" onClick={onClose} className="btn btn-outline px-3 py-1.5 text-xs">Close</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && <Alert type="error" message={error} />}

          {/* ── Stop timing ──────────────────────────────────────── */}
          {sortedStops(context.job).length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
              <div className="text-xs font-bold uppercase tracking-wide text-muted">Stop times</div>
              {sortedStops(context.job).map((stop) => {
                if (stop.id == null) return null;
                const t = stopTimes[stop.id] ?? { bookedDate: "", bookedTime: "", earliestArrival: "", unloading: "" };
                return (
                  <div key={stop.id} className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className={`rounded px-2 py-0.5 text-[11px] font-bold uppercase ${isPickup(stop) ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"}`}>
                        {isPickup(stop) ? "Collection" : "Delivery"}
                      </span>
                      <span className="text-sm font-semibold text-primary truncate">{shortLocation(stop, stop.locationTextSnapshot)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="label text-[11px]">Booked date</label>
                        <input type="date" className="input text-sm"
                          value={t.bookedDate}
                          onChange={(e) => setStopField(stop.id!, "bookedDate", e.target.value)} />
                      </div>
                      <div>
                        <label className="label text-[11px]">Booked time</label>
                        <input type="time" className="input text-sm"
                          value={t.bookedTime}
                          onChange={(e) => setStopField(stop.id!, "bookedTime", e.target.value)} />
                      </div>
                      <div>
                        <label className="label text-[11px]">Earliest arrival (mins before)</label>
                        <input type="number" min="0" max="480" className="input text-sm"
                          placeholder="e.g. 30"
                          value={t.earliestArrival}
                          onChange={(e) => setStopField(stop.id!, "earliestArrival", e.target.value)} />
                      </div>
                      <div>
                        <label className="label text-[11px]">{isPickup(stop) ? "Loading" : "Unloading"} allowance (mins)</label>
                        <input type="number" min="0" max="480" className="input text-sm"
                          placeholder="e.g. 60"
                          value={t.unloading}
                          onChange={(e) => setStopField(stop.id!, "unloading", e.target.value)} />
                      </div>
                    </div>
                    {stop.contactPhone && (
                      <p className="text-xs text-muted">Contact: {stop.contactPhone}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Driver ───────────────────────────────────────────── */}
          <div className="rounded-xl border border-slate-200 p-4 space-y-3">
            <div className="text-xs font-bold uppercase tracking-wide text-muted">Driver</div>
            <div>
              <select className="input" value={driverId} onChange={(event) => changeDriver(event.target.value)}>
                <option value="">— No driver —</option>
                {drivers.map((driver) => {
                  const onOther = openOthers.find((ctx) => ctx.job.assignedDriverId === driver.id);
                  return (
                    <option key={driver.id} value={driver.id}>
                      {driver.displayName}
                      {driver.status !== "active" ? " (unavailable)" : ""}
                      {onOther ? ` — on ${onOther.route}` : ""}
                    </option>
                  );
                })}
              </select>
              {selectedDriver && (
                <p className="mt-1 text-xs text-muted">
                  {selectedDriver.status !== "active" ? "⚠ Driver marked unavailable" :
                    selectedDriver.defaultTruckReg ? `Default unit: ${selectedDriver.defaultTruckReg}` : "No default unit set"}
                </p>
              )}
              {driverOnOtherJob && (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  ⚠ This driver is currently on <strong>{driverOnOtherJob.route}</strong> (Job #{driverOnOtherJob.job.id}). Saving will move them to this job.
                </div>
              )}
            </div>
          </div>

          {/* ── Unit / truck ─────────────────────────────────────── */}
          <div className="rounded-xl border border-slate-200 p-4 space-y-3">
            <div className="text-xs font-bold uppercase tracking-wide text-muted">Unit / truck</div>
            <div>
              <input
                className="input"
                list="unit-suggestions"
                value={unitReg}
                onChange={(e) => setUnitReg(e.target.value.toUpperCase())}
                placeholder="Type or select registration…"
              />
              <datalist id="unit-suggestions">
                {units.map((unit) => (
                  <option key={unit.id} value={unit.registration}>
                    {unit.registration} — {unit.vehicleClass} — {unit.status}
                  </option>
                ))}
              </datalist>
              <p className="mt-1 text-xs text-muted">
                {selectedUnit
                  ? `${selectedUnit.vehicleClass} | ${selectedUnit.status}${selectedUnit.yardLocation ? ` | ${selectedUnit.yardLocation}` : ""}`
                  : unitReg.trim() ? "Not in fleet list — will be saved as entered." : "Type any reg or pick from fleet."}
              </p>
              {unitWithoutDriver && (
                <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                  A unit must have a driver assigned — select a driver first.
                </div>
              )}
              {truckOnOtherJob && !unitWithoutDriver && (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  ⚠ Unit <strong>{unitReg}</strong> is currently assigned to <strong>{truckOnOtherJob.route}</strong> (Job #{truckOnOtherJob.job.id}).
                </div>
              )}
            </div>
          </div>

          {/* ── Trailer ──────────────────────────────────────────── */}
          <div className="rounded-xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wide text-muted">Trailer</div>
              {requiresTrailer(context.job) && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-800">Required</span>
              )}
            </div>
            {linkedLoadedTrailer ? (
              <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm text-purple-900">
                <div className="font-bold">{linkedLoadedTrailer.registration} — loaded trailer waiting</div>
                {linkedLoadedTrailer.yardLocation && <div className="mt-0.5 text-xs">Location: {linkedLoadedTrailer.yardLocation}</div>}
                <div className="mt-0.5 text-xs text-purple-700">{loadedTrailerStandingDetail(linkedLoadedTrailer)}</div>
              </div>
            ) : (
              <div>
                <input
                  className="input"
                  list="trailer-suggestions"
                  value={trailerReg}
                  onChange={(e) => setTrailerReg(e.target.value.toUpperCase())}
                  placeholder="Registration… (leave blank = driver confirms)"
                />
                <datalist id="trailer-suggestions">
                  {trailers.map((trailer) => (
                    <option key={trailer.id} value={trailer.registration}>
                      {trailer.registration} — {trailer.trailerType} — {trailer.status}{trailer.yardLocation ? ` @ ${trailer.yardLocation}` : ""}
                    </option>
                  ))}
                </datalist>
                <p className="mt-1 text-xs text-muted">
                  {selectedTrailer
                    ? `${selectedTrailer.trailerType} | ${selectedTrailer.status}${selectedTrailer.yardLocation ? ` | ${selectedTrailer.yardLocation}` : ""}${selectedTrailer.status === "loaded" ? ` | ${loadedTrailerStandingText(selectedTrailer)}` : ""}`
                    : trailerReg.trim() ? "Not in fleet list — saved as entered." : "Leave blank if driver will confirm at job start."}
                </p>
                {trailerOnOtherJob && (
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    ⚠ Trailer <strong>{trailerReg}</strong> is currently on <strong>{trailerOnOtherJob.route}</strong> (Job #{trailerOnOtherJob.job.id}).
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── System checks ────────────────────────────────────── */}
          {warnings.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wide text-muted">System checks</div>
              {warnings.map((warning, index) => (
                <div key={`${warning.type}-${index}`} className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${WARNING_CLASSES[warning.level]}`}>
                  {warningDot(warning.level)}
                  <span>{warning.message}</span>
                </div>
              ))}
            </div>
          )}

          {needsReason && (
            <div>
              <label className="label">Reason for override</label>
              <textarea
                className="input min-h-16"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Explain why this mismatch is acceptable…"
              />
            </div>
          )}
        </div>

        <div className="border-t border-border p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted">
              {driverOnOtherJob || truckOnOtherJob || trailerOnOtherJob
                ? "Resources will be swapped from the other job on save."
                : "Changes apply immediately on save."}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="btn btn-outline">Cancel</button>
              <button
                type="button"
                disabled={saving || hardBlocked || (needsReason && !reason.trim())}
                onClick={save}
                className="btn btn-primary"
              >
                {saving ? "Saving…" : (driverOnOtherJob || truckOnOtherJob || trailerOnOtherJob) ? "Swap & save" : "Save allocation"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickFixDrawer({
  context,
  onClose,
  onSaved,
}: {
  context: JobContext;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fixable = context.warnings.filter((warning) => warning.fix);
  const [selectedType, setSelectedType] = useState(fixable[0]?.type ?? "");
  const selectedWarning = fixable.find((warning) => warning.type === selectedType) ?? fixable[0];
  const selectedStop = sortedStops(context.job).find((stop) => isSameStop(stop, selectedWarning?.fix?.stopKey));
  const [value, setValue] = useState(() => {
    if (!selectedWarning?.fix) return "";
    if (selectedWarning.fix.kind === "stop_time") return dateTimeInput(selectedStop?.timeWindowStart ?? selectedStop?.bookedTime ?? null);
    if (selectedWarning.fix.kind === "return_instruction") return context.job.returnDestination ?? "";
    if (selectedWarning.fix.kind === "stop_reference") return selectedStop?.referenceNumber ?? "";
    return selectedStop?.contactPhone ?? "";
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function changeIssue(type: string) {
    const nextWarning = fixable.find((warning) => warning.type === type) ?? fixable[0];
    const nextStop = sortedStops(context.job).find((stop) => isSameStop(stop, nextWarning?.fix?.stopKey));
    setSelectedType(type);
    if (!nextWarning?.fix) setValue("");
    else if (nextWarning.fix.kind === "stop_time") setValue(dateTimeInput(nextStop?.timeWindowStart ?? nextStop?.bookedTime ?? null));
    else if (nextWarning.fix.kind === "return_instruction") setValue(context.job.returnDestination ?? "");
    else if (nextWarning.fix.kind === "stop_reference") setValue(nextStop?.referenceNumber ?? "");
    else setValue(nextStop?.contactPhone ?? "");
  }

  async function save() {
    if (!selectedWarning?.fix) return;
    setSaving(true);
    setError("");
    try {
      if (selectedWarning.fix.kind === "return_instruction") {
        await jobsApi.update(context.job.id, {
          returnDestination: value,
          saveMode: "draft",
        });
      } else {
        const stops = sortedStops(context.job).map((stop) => {
          if (!isSameStop(stop, selectedWarning.fix?.stopKey)) return stop;
          if (selectedWarning.fix?.kind === "stop_phone") return { ...stop, contactPhone: value.trim() };
          if (selectedWarning.fix?.kind === "stop_reference") return { ...stop, referenceNumber: value.trim() };
          return {
            ...stop,
            timeWindowStart: fromDateTimeInput(value),
            timeWindowEnd: stop.timeWindowEnd ?? fromDateTimeInput(value),
          };
        });
        await jobsApi.update(context.job.id, { stops, saveMode: "draft" });
      }
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save quick fix");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-black/40">
      <div className="ml-auto flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
        <div className="border-b border-border p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-primary">Quick fix</h2>
              <p className="mt-1 text-sm text-muted">{context.route}</p>
            </div>
            <button type="button" onClick={onClose} className="btn btn-outline px-3 py-1.5 text-xs">Close</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error && <Alert type="error" message={error} />}

          {fixable.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-muted">
              No small quick-fix fields are available for this job. Use full job editing when that route is available.
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="label">Issue</label>
                <select className="input" value={selectedType} onChange={(event) => changeIssue(event.target.value)}>
                  {fixable.map((warning) => (
                    <option key={warning.type} value={warning.type}>{warning.message}</option>
                  ))}
                </select>
              </div>

              {selectedStop && (
                <div className="rounded-lg bg-slate-50 p-3 text-xs text-muted">
                  Stop {selectedStop.sequenceNumber}: {shortLocation(selectedStop, selectedStop.locationTextSnapshot)}
                </div>
              )}

              {selectedWarning?.fix?.kind === "return_instruction" ? (
                <div>
                  <label className="label">Return instruction</label>
                  <select className="input" value={value} onChange={(event) => setValue(event.target.value)}>
                    <option value="">Select return instruction</option>
                    <option value="depot">Return to depot</option>
                    <option value="collection">Return to collection point</option>
                    <option value="alternative">Return to alternative address</option>
                  </select>
                </div>
              ) : selectedWarning?.fix?.kind === "stop_time" ? (
                <div>
                  <label className="label">Stop time</label>
                  <input className="input" type="datetime-local" value={value} onChange={(event) => setValue(event.target.value)} />
                </div>
              ) : (
                <div>
                  <label className="label">{selectedWarning?.fix?.kind === "stop_reference" ? "Stop reference" : "Contact phone"}</label>
                  <input className="input" value={value} onChange={(event) => setValue(event.target.value)} />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-border p-5">
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn btn-outline">Cancel</button>
            <button type="button" disabled={!fixable.length || saving || !value.trim()} onClick={save} className="btn btn-primary">
              {saving ? "Saving..." : "Save fix"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 text-sm text-primary">{value || "-"}</div>
    </div>
  );
}

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-slate-100 py-4 last:border-b-0">
      <h3 className="mb-3 text-sm font-black uppercase tracking-wide text-primary">{title}</h3>
      {children}
    </section>
  );
}

function JobDetailDrawer({
  context,
  onClose,
  onAssign,
  onQuickFix,
  onEditJob,
}: {
  context: JobContext;
  onClose: () => void;
  onAssign: () => void;
  onQuickFix: () => void;
  onEditJob: () => void;
}) {
  const job = context.job;
  const fixable = context.warnings.some((warning) => warning.fix);

  return (
    <div className="fixed inset-0 z-50 flex bg-black/40">
      <div className="ml-auto flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl">
        <div className="border-b border-border p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-primary">Job details</h2>
              <p className="mt-1 text-sm text-muted">{context.route}</p>
            </div>
            <button type="button" onClick={onClose} className="btn btn-outline px-3 py-1.5 text-xs">Close</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5">
          <DrawerSection title="Job summary">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <DetailRow label="Customer" value={context.customer} />
              <DetailRow label="Planning date" value={dayKey(job.plannedDate) || "Unplanned"} />
              <DetailRow label="Status" value={context.statusLabel} />
              <DetailRow label="Reference" value={job.referenceNumber || job.customerRef} />
              <DetailRow label="Service type" value={job.serviceType} />
              <DetailRow label="Job type" value={job.jobType} />
              <DetailRow label="Job title" value={job.jobTitle} />
              <DetailRow label="POD required" value={job.requirePOD ? "Yes" : "No"} />
            </div>
          </DrawerSection>

          <DrawerSection title="Stops">
            <div className="space-y-2">
              {sortedStops(job).map((stop) => (
                <div key={stopKey(stop)} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold uppercase text-slate-700">{stop.type}</span>
                    <span className="text-sm font-bold text-primary">{shortLocation(stop, stop.locationTextSnapshot)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                    <DetailRow label="City/postcode" value={[stop.town, stop.postcode].filter(Boolean).join(" ")} />
                    <DetailRow label="Date/time" value={stopDateTimeLabel(stop)} />
                    <DetailRow label="Quantity" value={stop.numPallets != null ? `${stop.numPallets} pallets` : ""} />
                    <DetailRow label="Reference" value={stop.referenceNumber || stop.bookingRef} />
                    <DetailRow label="Contact phone" value={stop.contactPhone} />
                    <DetailRow label="Driver notes" value={stop.instructions ? "Yes" : "No"} />
                    <DetailRow label="Navigation notes" value={stop.navigationInstructions ? "Yes" : "No"} />
                    <DetailRow label="Status" value={stop.status} />
                  </div>
                </div>
              ))}
              {sortedStops(job).length === 0 && <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-muted">No structured stops available.</div>}
            </div>
          </DrawerSection>

          <DrawerSection title="Load">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <DetailRow label="Goods/material" value={job.loadDetails?.materialType || job.materialType} />
              <DetailRow label="Total quantity" value={job.loadDetails?.quantity ? `${job.loadDetails.quantity} ${job.loadDetails.unit || ""}` : `${job.quantityExpected || ""} ${job.quantityUnit || ""}`.trim()} />
              <DetailRow label="Total weight" value={job.loadDetails?.weight ? `${job.loadDetails.weight}` : ""} />
              <DetailRow label="Per-stop allocation" value={sortedStops(job).some((stop) => stop.numPallets != null) ? "Present" : "Missing/unused"} />
              <DetailRow label="POD required" value={job.requirePOD ? "Yes" : "No"} />
              <DetailRow label="Temperature" value={job.loadDetails?.tempControlled ? job.loadDetails.tempRange || "Controlled" : "No"} />
              <DetailRow label="Tail lift" value={job.loadDetails?.tailLiftRequired ? "Required" : "No"} />
              <DetailRow label="Forklift" value={job.loadDetails?.forkliftRequired ? "Required" : "No"} />
            </div>
          </DrawerSection>

          <DrawerSection title="Return instructions">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <DetailRow label="Selected instruction" value={job.returnDestination || job.failureAction} />
              <DetailRow label="Assistance number" value={job.assistancePhone} />
              <DetailRow label="Assistance note" value={job.assistanceNote} />
            </div>
          </DrawerSection>

          <DrawerSection title="Vehicle/trailer requirements">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <DetailRow label="Vehicle type" value={context.vehicle} />
              <DetailRow label="Trailer allowed" value={compactArray(job.trailerTypesAllowed).join(", ")} />
              <DetailRow label="Trailer forbidden" value={compactArray(job.trailerTypesForbidden).join(", ")} />
              <DetailRow label="Equipment" value={compactArray(job.equipmentRequired).join(", ")} />
              <DetailRow label="Height limit" value={job.heightRestriction} />
              <DetailRow label="Weight limit" value={job.weightRestriction} />
              <DetailRow label="Length limit" value={job.lengthRestriction} />
              <DetailRow label="Access notes" value={job.vehicleAccessNotes} />
            </div>
          </DrawerSection>

          <DrawerSection title="Assignment">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <DetailRow label="Driver" value={context.assignedDriver?.displayName} />
              <DetailRow label="Unit" value={job.assignedTruck || context.assignedUnit?.registration} />
              <DetailRow label="Linked trailer" value={context.loadedTrailer?.registration || job.assignedTrailer || context.assignedTrailer?.registration} />
              <DetailRow label="Trailer standing" value={context.loadedTrailer ? loadedTrailerStandingDetail(context.loadedTrailer) : ""} />
              <DetailRow label="Validation" value={context.warnings.length ? `${context.warnings.length} issue(s)` : "Clear"} />
            </div>
            {context.warnings.length > 0 && (
              <div className="mt-3 space-y-2">
                {context.warnings.map((warning, index) => (
                  <div key={`${warning.type}-${index}`} className={`flex items-start gap-2 rounded-lg border p-2 text-xs ${WARNING_CLASSES[warning.level]}`}>
                    {warningDot(warning.level)}
                    <span>{warning.message}</span>
                  </div>
                ))}
              </div>
            )}
          </DrawerSection>

          <DrawerSection title="Notes">
            <div className="space-y-3">
              <DetailRow label="Planner notes" value={job.plannerNotes} />
              <DetailRow label="Internal notes" value={job.internalNotes} />
              <DetailRow label="Customer instructions" value={job.customerInstructions} />
            </div>
          </DrawerSection>
        </div>

        <div className="border-t border-border p-5">
          <div className="flex flex-wrap justify-end gap-2">
            {!isClosed(job) && <button type="button" onClick={onAssign} className="btn btn-primary">Assign driver</button>}
            <button type="button" disabled={!fixable} onClick={onQuickFix} className="btn btn-outline">Quick fix</button>
            <button type="button" onClick={onEditJob} className="btn btn-outline">Edit full job</button>
            <button type="button" onClick={onClose} className="btn btn-outline">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [date, setDate] = useState(today());
  const [jobs, setJobs] = useState<PlannedJob[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [units, setUnits] = useState<FleetUnit[]>([]);
  const [trailers, setTrailers] = useState<FleetTrailer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [refreshed, setRefreshed] = useState(new Date());

  const [statusFilter, setStatusFilter] = useState("default");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [driverFilter, setDriverFilter] = useState("all");
  const [warningOnly, setWarningOnly] = useState(false);
  const [loadedOnly, setLoadedOnly] = useState(false);
  const [carriedOnly, setCarriedOnly] = useState(false);

  const [assigning, setAssigning] = useState<{ context: JobContext; presetDriverId?: number } | null>(null);
  const [pickingForDriver, setPickingForDriver] = useState<Driver | null>(null);
  const [details, setDetails] = useState<JobContext | null>(null);
  const [quickFix, setQuickFix] = useState<JobContext | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      // Load jobs for selected date + open jobs from other dates (carry-over / unplanned)
      const [jobDateRes, jobOpenRes, driverRes, unitRes, trailerRes] = await Promise.all([
        jobsApi.list(date),
        jobsApi.list(),   // all jobs for carry-over detection (open jobs from past dates)
        driversApi.list(),
        fleetApi.units.list(),
        fleetApi.trailers.list(),
      ]);
      // Merge: jobs for selected date + open jobs not on selected date (carry-over / unplanned)
      const dateJobIds = new Set(jobDateRes.data.map((j) => j.id));
      const extra = jobOpenRes.data.filter((j) => !dateJobIds.has(j.id) && !CLOSED_JOB_STATUSES.has(j.status));
      setJobs([...jobDateRes.data, ...extra]);
      setDrivers(driverRes.data);
      setUnits(unitRes.data);
      setTrailers(trailerRes.data);
      setRefreshed(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load dashboard");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const contexts = useMemo(() => {
    return jobs
      .map((job) => makeJobContext(job, drivers, units, trailers, date))
      .filter((context) => {
        const planned = dayKey(context.job.plannedDate);
        // Show: jobs planned for selected date, carried-over jobs (last 14 days),
        // and unplanned (no date) jobs — but only when viewing today
        return planned === date
          || context.isCarriedOver
          || (!planned && date === today() && !isClosed(context.job));
      });
  }, [jobs, drivers, units, trailers, date]);

  const filteredContexts = useMemo(() => {
    return contexts
      .filter((context) => {
        if (statusFilter === "default" && ["draft", "completed", "cancelled"].includes(context.status)) return false;
        if (statusFilter !== "default" && context.status !== statusFilter) return false;
        if (customerFilter !== "all" && context.customer !== customerFilter) return false;
        if (vehicleFilter !== "all" && context.vehicle !== vehicleFilter) return false;
        if (driverFilter !== "all" && String(context.job.assignedDriverId ?? "unassigned") !== driverFilter) return false;
        if (warningOnly && !context.warnings.some((w) => w.level === "critical" || w.level === "warning")) return false;
        if (loadedOnly && !context.loadedTrailer) return false;
        if (carriedOnly && !context.isCarriedOver) return false;
        return true;
      })
      .sort((a, b) => (
        riskRank(a) - riskRank(b)
        || earliestTimeRank(a.job) - earliestTimeRank(b.job)
        || a.route.localeCompare(b.route)
      ));
  }, [contexts, statusFilter, customerFilter, vehicleFilter, driverFilter, warningOnly, loadedOnly, carriedOnly]);

  const customerOptions = useMemo(() => Array.from(new Set(contexts.map((context) => context.customer))).sort(), [contexts]);
  const vehicleOptions = useMemo(() => Array.from(new Set(contexts.map((context) => context.vehicle))).sort(), [contexts]);

  const openContexts = contexts.filter((context) => !isClosed(context.job));
  const completedContexts = contexts.filter((context) => context.status === "completed");
  const needsPlanning = contexts.filter((context) => ["needs_planning", "ready_to_plan", "draft"].includes(context.status)).length;
  const planned = contexts.filter((context) => context.status === "planned").length;
  const active = contexts.filter((context) => context.status === "active").length;
  const criticalIssues = contexts.flatMap((context) => context.warnings).filter((warning) => warning.level === "critical").length;
  const allWarnings = contexts.flatMap((context) => context.warnings);
  const missingInfo = allWarnings.filter(hasMissingPlanningInfo).length;
  const mismatches = allWarnings.filter((warning) => warning.type.includes("mismatch")).length;
  const unavailableDrivers = drivers.filter((driver) => driver.status !== "active" || driver.user?.status === "inactive").length;
  const loadedTrailers = trailers.filter((trailer) => trailer.status === "loaded").length;
  const carriedOver = contexts.filter((context) => context.isCarriedOver).length;
  const assignedDriverIds = new Set(openContexts.map((context) => context.job.assignedDriverId).filter((id): id is number => id != null));
  const activeDrivers = drivers.filter((driver) => driver.status === "active");
  const freeDrivers = activeDrivers.filter((driver) => !assignedDriverIds.has(driver.id)).length;
  const unitsFree = units.filter((unit) => unit.status === "available").length;
  const trailersFree = trailers.filter((trailer) => trailer.status === "available").length;
  const fleetVor = units.filter((unit) => unit.status === "vor").length + trailers.filter((trailer) => trailer.status === "vor").length;

  function resetToggles() {
    setWarningOnly(false);
    setLoadedOnly(false);
    setCarriedOnly(false);
  }

  function assignFirstJobToDriver(driver: Driver) {
    const target = filteredContexts.find((context) => !isClosed(context.job) && !context.job.assignedDriverId)
      ?? contexts.find((context) => !isClosed(context.job) && !context.job.assignedDriverId);
    if (target) {
      setAssigning({ context: target, presetDriverId: driver.id });
    } else {
      setSuccess("No unassigned dashboard jobs are available for that driver.");
      setTimeout(() => setSuccess(""), 3000);
    }
  }

  async function markDriverUnavailable(driver: Driver) {
    const affected = contexts.filter((context) => !isClosed(context.job) && context.job.assignedDriverId === driver.id);
    const message = affected.length
      ? `${driver.displayName} has ${affected.length} open dashboard job(s). Mark unavailable and remove the driver from those assignments?`
      : `Mark ${driver.displayName} unavailable?`;
    if (!window.confirm(message)) return;

    setError("");
    try {
      await driversApi.setStatus(driver.id, "inactive");
      await Promise.all(affected.map((context) => jobsApi.update(context.job.id, {
        assignedDriverId: null,
        plannerNotes: appendPlannerReason(
          context.job.plannerNotes,
          `${driver.displayName} marked unavailable. Job needs replanning. Unit/trailer values were left unchanged.`,
        ),
        saveMode: "draft",
      })));
      setSuccess(affected.length
        ? `${driver.displayName} is unavailable. ${affected.length} job(s) need replanning.`
        : `${driver.displayName} is unavailable.`);
      setTimeout(() => setSuccess(""), 4000);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not mark driver unavailable");
    }
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-muted">Loading planner dashboard...</div>;
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-primary">Dashboard</h1>
          <p className="text-xs text-muted">
            Planner view for {date} | Refreshed {refreshed.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="input w-auto text-sm" />
          <button type="button" onClick={load} className="btn btn-outline text-sm">Refresh</button>
          <button type="button" onClick={() => navigate("/app/jobs/create")} className="btn btn-primary text-sm">New job</button>
        </div>
      </div>

      {error && <Alert type="error" message={error} />}
      {success && <Alert type="success" message={success} />}

      <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Jobs"
          lead={`${contexts.length} jobs`}
          detail={`${needsPlanning} need planning | ${planned} planned | ${active} active | ${completedContexts.length} done`}
          onClick={() => { setStatusFilter("default"); resetToggles(); }}
        />
        <SummaryCard
          title="Attention"
          lead={`${criticalIssues + allWarnings.filter((warning) => warning.level === "warning").length} issues`}
          detail={`${missingInfo} missing info | ${mismatches} mismatches | ${loadedTrailers} loaded | ${carriedOver} carried`}
          tone={criticalIssues ? "amber" : "slate"}
          onClick={() => { setWarningOnly(true); setStatusFilter("default"); }}
        />
        <SummaryCard
          title="Drivers"
          lead={`${drivers.length} drivers`}
          detail={`${freeDrivers} free | ${assignedDriverIds.size} assigned | ${unavailableDrivers} unavailable`}
          tone="blue"
          onClick={() => navigate("/app/drivers")}
        />
        <SummaryCard
          title="Fleet"
          lead={`${unitsFree} units free`}
          detail={`${trailersFree} trailers free | ${loadedTrailers} loaded | ${fleetVor} VOR`}
          tone="green"
          onClick={() => navigate("/app/fleet")}
        />
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-full sm:w-auto" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="default">Default action view</option>
            <option value="needs_planning">Needs planning</option>
            <option value="ready_to_plan">Ready to plan</option>
            <option value="draft">Draft</option>
            <option value="planned">Planned</option>
            <option value="active">In progress</option>
            <option value="loaded_trailer">Loaded trailer parked</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select className="input w-full sm:w-auto" value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)}>
            <option value="all">All customers</option>
            {customerOptions.map((customer) => <option key={customer} value={customer}>{customer}</option>)}
          </select>
          <select className="input w-full sm:w-auto" value={vehicleFilter} onChange={(event) => setVehicleFilter(event.target.value)}>
            <option value="all">All vehicle types</option>
            {vehicleOptions.map((vehicle) => <option key={vehicle} value={vehicle}>{vehicle}</option>)}
          </select>
          <select className="input w-full sm:w-auto" value={driverFilter} onChange={(event) => setDriverFilter(event.target.value)}>
            <option value="all">All drivers</option>
            <option value="unassigned">Unassigned</option>
            {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.displayName}</option>)}
          </select>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <FilterPill active={warningOnly} onClick={() => setWarningOnly((value) => !value)}>Has warnings</FilterPill>
          <FilterPill active={loadedOnly} onClick={() => setLoadedOnly((value) => !value)}>Loaded trailer</FilterPill>
          <FilterPill active={carriedOnly} onClick={() => setCarriedOnly((value) => !value)}>Carried over</FilterPill>
          <button
            type="button"
            onClick={() => {
              setStatusFilter("default");
              setCustomerFilter("all");
              setVehicleFilter("all");
              setDriverFilter("all");
              resetToggles();
            }}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-primary"
          >
            Clear filters
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr),380px]">
        <main>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-black uppercase tracking-wide text-primary">Job Quick List</h2>
              <p className="text-xs text-muted">
                {filteredContexts.length} shown. Completed jobs are hidden in the default action view.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {filteredContexts.map((context) => (
              <JobCard
                key={context.job.id}
                context={context}
                onAssign={() => setAssigning({ context })}
                onDetails={() => setDetails(context)}
                onQuickFix={() => setQuickFix(context)}
              />
            ))}

            {filteredContexts.length === 0 && (
              <div className="card p-8 text-center">
                <div className="text-sm font-bold text-primary">No dashboard jobs match these filters</div>
                <div className="mt-1 text-sm text-muted">Try clearing filters or choosing another planning date.</div>
              </div>
            )}
          </div>

          {statusFilter === "default" && completedContexts.length > 0 && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-muted">
              {completedContexts.length} completed job{completedContexts.length > 1 ? "s are" : " is"} collapsed in this action view.
            </div>
          )}
        </main>

        <aside className="space-y-5">
          <DriverSnapshot
            drivers={drivers}
            contexts={contexts}
            units={units}
            trailers={trailers}
            onAssignDriver={assignFirstJobToDriver}
            onPickJobForDriver={setPickingForDriver}
            onViewMore={() => navigate("/app/drivers")}
            onMarkUnavailable={markDriverUnavailable}
          />
          <FleetSnapshot
            units={units}
            trailers={trailers}
            drivers={drivers}
            openContexts={openContexts}
            onViewMore={() => navigate("/app/fleet")}
          />
        </aside>
      </div>

      {/* ── Job picker — "Assign another" on a driver card ── */}
      {pickingForDriver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-base font-black text-primary">Pick a job for {pickingForDriver.displayName}</h2>
              <p className="mt-0.5 text-xs text-muted">Select any open job to open the allocation panel.</p>
            </div>
            <div className="max-h-96 overflow-y-auto p-3 space-y-1.5">
              {contexts
                .filter((ctx) => !isClosed(ctx.job))
                .sort((a, b) => {
                  // Unassigned first
                  const aAssigned = !!a.job.assignedDriverId;
                  const bAssigned = !!b.job.assignedDriverId;
                  if (aAssigned !== bAssigned) return aAssigned ? 1 : -1;
                  return a.route.localeCompare(b.route);
                })
                .map((ctx) => {
                  const assignedDriver = ctx.job.assignedDriverId
                    ? drivers.find((d) => d.id === ctx.job.assignedDriverId)
                    : null;
                  return (
                    <button
                      key={ctx.job.id}
                      type="button"
                      onClick={() => {
                        setPickingForDriver(null);
                        setAssigning({ context: ctx, presetDriverId: pickingForDriver.id });
                      }}
                      className="w-full text-left rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 px-3 py-2.5 transition-colors"
                    >
                      <div className="text-sm font-semibold text-primary truncate">{ctx.route}</div>
                      <div className="text-xs text-muted mt-0.5">
                        {ctx.job.referenceNumber && <span className="mr-2">Ref: {ctx.job.referenceNumber}</span>}
                        {assignedDriver
                          ? <span className="text-amber-700">Driver: {assignedDriver.displayName} — will be swapped</span>
                          : <span className="text-green-700">No driver — free to assign</span>}
                      </div>
                    </button>
                  );
                })}
              {contexts.filter((ctx) => !isClosed(ctx.job)).length === 0 && (
                <p className="py-6 text-center text-sm text-muted">No open jobs today.</p>
              )}
            </div>
            <div className="border-t border-border px-5 py-3 flex justify-end">
              <button type="button" onClick={() => setPickingForDriver(null)} className="btn btn-outline text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {assigning && (
        <AssignDrawer
          context={assigning.context}
          allContexts={contexts}
          drivers={drivers}
          units={units}
          trailers={trailers}
          date={date}
          presetDriverId={assigning.presetDriverId}
          onClose={() => setAssigning(null)}
          onSaved={load}
        />
      )}

      {quickFix && (
        <QuickFixDrawer
          context={quickFix}
          onClose={() => setQuickFix(null)}
          onSaved={load}
        />
      )}

      {details && (
        <JobDetailDrawer
          context={details}
          onClose={() => setDetails(null)}
          onAssign={() => { setAssigning({ context: details }); setDetails(null); }}
          onQuickFix={() => { setQuickFix(details); setDetails(null); }}
          onEditJob={() => { setDetails(null); navigate(`/app/jobs/${details.job.id}/edit`); }}
        />
      )}
    </div>
  );
}
