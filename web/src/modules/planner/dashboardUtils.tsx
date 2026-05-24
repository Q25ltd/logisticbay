import type { Driver, FleetTrailer, FleetUnit, JobPart, PlannedJob } from "../../types";
import type { AssignmentInput, JobContext, JobWarning, PlannerStatus, WarningLevel } from "./dashboardTypes";
import { ACTIVE_JOB_STATUSES, CLOSED_JOB_STATUSES, STATUS_LABELS } from "./dashboardConstants";
import { BODY_CATEGORIES, BODY_TYPES, bodyCategoryNeedsTrailer, isBodyCategory } from "../../constants/vehicleTaxonomy";

function taxonomyLabel(options: readonly { value: string; label: string }[], value?: string | null) {
  return value ? options.find((option) => option.value === value)?.label ?? value : "";
}

function bodyTypeList(values?: string[] | null) {
  return compactArray(values).map((value) => taxonomyLabel(BODY_TYPES, value)).join(", ");
}

function unitRequirementLabel(unit: FleetUnit) {
  return [
    taxonomyLabel(BODY_CATEGORIES, unit.bodyCategory || unit.vehicleClass),
    unit.gvwClass,
    taxonomyLabel(BODY_TYPES, unit.bodyType),
  ].filter(Boolean).join(" / ");
}

function trailerRequirementLabel(trailer: FleetTrailer) {
  return taxonomyLabel(BODY_TYPES, trailer.bodyType || trailer.trailerType);
}

export function dayKey(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function dateInputToTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function dateInputToShortDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function dateTimeInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDateTimeInput(value: string) {
  if (!value.trim()) return null;
  return new Date(value).toISOString();
}

export function compact(value?: string | null, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

export function compactArray(value?: string[] | null) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

export function asNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function elapsedSince(value?: string | null) {
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

export function loadedTrailerStandingText(trailer: FleetTrailer) {
  const elapsed = elapsedSince(trailer.updatedAt);
  return elapsed ? `standing ${elapsed}` : "standing time unknown";
}

export function loadedTrailerStandingDetail(trailer: FleetTrailer) {
  const since = dateInputToShortDateTime(trailer.updatedAt);
  const elapsed = elapsedSince(trailer.updatedAt);
  if (since && elapsed) return `Standing since ${since} (${elapsed})`;
  return "Standing time unknown";
}

export function sortedStops(job: PlannedJob) {
  return [...(job.stops ?? [])].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
}

export function stopKey(stop: JobPart) {
  return stop.id ? `id:${stop.id}` : `seq:${stop.sequenceNumber}`;
}

export function isSameStop(stop: JobPart, key?: string) {
  if (!key) return false;
  return stopKey(stop) === key;
}

export function isPickup(stop: JobPart) {
  return stop.type === "pickup" || stop.type === "collection";
}

export function isDropoff(stop: JobPart) {
  return stop.type === "dropoff" || stop.type === "delivery";
}

export function shortLocation(stop: JobPart | undefined, fallback: string) {
  if (!stop) return compact(fallback);
  const site = compact(stop.siteName || stop.unitName || stop.locationTextSnapshot, "");
  const town = compact(stop.town, "");
  const postcode = compact(stop.postcode, "");
  if (site && town && !site.toLowerCase().includes(town.toLowerCase())) return `${site} ${town}`;
  if (site) return site;
  return town || postcode || compact(fallback);
}

export function routeSummary(job: PlannedJob) {
  const stops = sortedStops(job);
  const pickups = stops.filter(isPickup);
  const dropoffs = stops.filter(isDropoff);
  const pickup = shortLocation(pickups[0], "");

  if (dropoffs.length === 0) return pickup || "Route unknown";

  const dropLabels = dropoffs.map((stop) => shortLocation(stop, ""));
  const uniqueDropLabels = Array.from(new Set(dropLabels));
  if (dropoffs.length > 1 && uniqueDropLabels.length === 1) {
    return `${pickup} -> ${uniqueDropLabels[0]} (${dropoffs.length})`;
  }
  if (uniqueDropLabels.length > 2) {
    return `${pickup} -> ${uniqueDropLabels.slice(0, 2).join(" -> ")} (+${uniqueDropLabels.length - 2})`;
  }
  return `${pickup} -> ${uniqueDropLabels.join(" -> ")}`;
}

export function stopCountLabel(job: PlannedJob) {
  const stops = sortedStops(job);
  const collections = stops.filter(isPickup).length;
  const deliveries = stops.filter(isDropoff).length;
  return `${collections}C->${deliveries}D`;
}

export function loadSummary(job: PlannedJob) {
  const quantity = job.quantity;
  const unit = job.quantityUnit;
  const material = job.goodsDescription || job.goodsType;
  const amount = quantity != null ? `${quantity} ${unit || ""}`.trim() : "";
  if (amount && material) return `${amount} ${material}`.trim();
  return amount || material || "Load not set";
}

export function vehicleRequirement(job: PlannedJob) {
  const category = BODY_CATEGORIES.find(c => c.value === job.vehicleCategory)?.label ?? job.vehicleCategory;
  const btLabels = compactArray(job.bodyTypes).map(bt => BODY_TYPES.find(t => t.value === bt)?.label ?? bt);
  return [category, job.minGvwClass, ...btLabels].filter(Boolean).join(" / ")
    || "Vehicle not set";
}

export function requiresTrailer(job: PlannedJob) {
  return (isBodyCategory(job.vehicleCategory) && bodyCategoryNeedsTrailer(job.vehicleCategory))
    || compactArray(job.trailersAllowed).length > 0
    || !!job.assignedTrailer;
}

export function timeRange(job: PlannedJob) {
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

export function stopTimeLabel(stop: JobPart) {
  if (stop.bookedTime) return `Booked ${dateInputToTime(stop.bookedTime)}`;
  const start = dateInputToTime(stop.timeWindowStart);
  const end = dateInputToTime(stop.timeWindowEnd);
  if (start && end && start !== end) return `${start}-${end}`;
  return start || end || "No time set";
}

export function stopDateTimeLabel(stop: JobPart) {
  if (stop.bookedTime) return dateInputToShortDateTime(stop.bookedTime);
  const date = dayKey(stop.timeWindowStart ?? stop.timeWindowEnd);
  const time = stopTimeLabel(stop);
  return time === "No time set" ? "" : [date, time].filter(Boolean).join(" ");
}

export function customerName(job: PlannedJob) {
  return job.customerName || job.customer?.name || "No customer";
}

export function normalizeRegistration(value?: string | null) {
  return String(value ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

export function normalizeVehicle(value?: string | null) {
  const text = String(value ?? "").toLowerCase();
  if (text.includes("tractor") || text.includes("artic")) return "tractor";
  if (text.includes("rigid")) return "rigid";
  if (text.includes("van")) return "van";
  if (text.includes("tipper")) return "rigid";
  if (text.includes("grab")) return "rigid";
  if (text.includes("mixer")) return "rigid";
  if (text.includes("hiab")) return "rigid";
  if (!text.trim() || text === "vehicle not set") return "";
  return text.trim();
}

export function normalizeTrailer(value?: string | null) {
  const text = String(value ?? "").toLowerCase();
  if (text.includes("refrigerated") || text.includes("fridge") || text.includes("reefer")) return "fridge";
  if (text.includes("curtain")) return "curtain_sider";
  if (text.includes("box")) return "box";
  if (text.includes("flat")) return "flatbed";
  if (text.includes("low")) return "low_loader";
  if (text.includes("tipper")) return "tipper";
  if (!text.trim()) return "";
  return text.trim();
}

export function unitMatchesRequirement(job: PlannedJob, unit: FleetUnit | null) {
  const required = job.vehicleCategory || normalizeVehicle(vehicleRequirement(job));
  if (!required || !unit) return true;
  return (unit.bodyCategory || normalizeVehicle(unit.vehicleClass)) === required;
}

export function trailerMatchesRequirement(job: PlannedJob, trailer: FleetTrailer | null) {
  const allowed = compactArray(job.trailersAllowed).map(normalizeTrailer).filter(Boolean);
  if (!allowed.length || !trailer) return true;
  return allowed.includes(trailer.bodyType || normalizeTrailer(trailer.trailerType));
}

export function assignedDriver(job: PlannedJob, drivers: Driver[], driverId = job.assignedDriverId) {
  if (driverId == null) return null;
  return drivers.find((driver) => driver.id === driverId) ?? job.assignedDriver ?? null;
}

export function unitByRegistration(units: FleetUnit[], registration?: string | null) {
  const target = normalizeRegistration(registration);
  return target ? units.find((unit) => normalizeRegistration(unit.registration) === target) ?? null : null;
}

export function trailerByRegistration(trailers: FleetTrailer[], registration?: string | null) {
  const target = normalizeRegistration(registration);
  return target ? trailers.find((trailer) => normalizeRegistration(trailer.registration) === target) ?? null : null;
}

export function loadedTrailerForJob(job: PlannedJob, trailers: FleetTrailer[]) {
  return trailers.find((trailer) => (
    trailer.status === "loaded"
    && (trailer.linkedJobId === job.id || normalizeRegistration(trailer.registration) === normalizeRegistration(job.assignedTrailer))
  )) ?? null;
}

export function selectedTrailerForJob(job: PlannedJob, trailers: FleetTrailer[], assignment?: AssignmentInput) {
  const assignedTrailer = assignment?.assignedTrailer ?? job.assignedTrailer;
  return trailerByRegistration(trailers, assignedTrailer) ?? loadedTrailerForJob(job, trailers);
}

export function isClosed(job: PlannedJob) {
  return CLOSED_JOB_STATUSES.has(job.status);
}

export function isCarriedOver(job: PlannedJob, date: string) {
  const planned = dayKey(job.plannedDate);
  // Carried over = open job planned for a past date (no day limit — if it's open, it needs attention)
  if (!planned || planned >= date || isClosed(job)) return false;
  return true;
}

export function hasMissingPlanningInfo(warning: JobWarning) {
  return warning.type.startsWith("missing_") || warning.type === "load_split_missing" || warning.type === "no_customer";
}

export function hasMissingAssignment(warning: JobWarning) {
  return ["no_driver", "driver_unavailable", "no_unit", "unit_vor"].includes(warning.type);
}

export function buildWarnings(
  job: PlannedJob,
  drivers: Driver[],
  units: FleetUnit[],
  trailers: FleetTrailer[],
  assignment?: AssignmentInput,
): JobWarning[] {
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

  if (!job.vehicleCategory && !job.bodyTypes?.length) {
    warnings.push({ level: "warning", type: "missing_vehicle", message: "Vehicle type requirement is missing." });
  }

  if (!job.quantity && !job.goodsDescription && !job.goodsType) {
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
      warnings.push({ level: "warning", type: "unit_unavailable", message: `${unit.registration} is marked ${({"off_road":"Off Road","loaded":"Loaded","in_use":"In Use","repair":"In Repair","decommissioned":"Decommissioned"} as Record<string,string>)[unit.status] ?? unit.status}.` });
    }
    if (!unitMatchesRequirement(job, unit)) {
      warnings.push({
        level: "warning",
        type: "vehicle_mismatch",
        message: `Job requires ${vehicleRequirement(job)}. Selected unit is ${unitRequirementLabel(unit) || unit.registration}.`,
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
          message: `Job requires ${bodyTypeList(job.trailersAllowed)} trailer. Selected trailer is ${trailerRequirementLabel(trailer) || trailer.registration}.`,
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

  const loadQty = asNumber(job.quantity);
  const allocatedPallets = stops.reduce((sum, stop) => sum + (asNumber(stop.numPallets) ?? 0), 0);
  if (dropoffStops.length > 1 && loadQty && allocatedPallets === 0) {
    warnings.push({ level: "warning", type: "load_split_missing", message: "Multi-drop job has no per-stop load split." });
  } else if (loadQty && allocatedPallets > 0 && Math.abs(allocatedPallets - loadQty) > 0.001) {
    warnings.push({ level: "warning", type: "load_split_mismatch", message: "Stop quantities do not match total load." });
  }

  if (job.failureAction === "finish_then_return" && !job.alternativeReturnAddress) {
    warnings.push({
      level: "warning",
      type: "missing_return_instruction",
      message: "Return instruction is missing.",
      fix: { kind: "return_instruction" },
    });
  }

  return warnings;
}

export function deriveStatus(job: PlannedJob, warnings: JobWarning[], loadedTrailer: FleetTrailer | null): PlannerStatus {
  if (job.status === "completed") return "completed";
  if (job.status === "cancelled") return "cancelled";
  if (ACTIVE_JOB_STATUSES.has(job.status)) return "active";
  if (warnings.some(hasMissingAssignment)) return "needs_planning";
  if (warnings.some(hasMissingPlanningInfo)) return "needs_planning";
  if (loadedTrailer) return "loaded_trailer";
  if (job.assignedDriverId && job.assignedTruck) return "planned";
  if (job.validationStatus === "draft") return "draft";
  if (job.validationStatus === "ready_to_plan") return "ready_to_plan";
  return "ready_to_plan";
}

export function makeJobContext(
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

export function warningDot(level: WarningLevel) {
  const cls = level === "critical" ? "bg-red-500" : level === "warning" ? "bg-amber-500" : "bg-blue-500";
  return <span className={`mt-1 h-2 w-2 rounded-full ${cls}`} />;
}

export function riskRank(context: JobContext) {
  if (context.warnings.some((warning) => warning.level === "critical")) return 0;
  if (context.status === "needs_planning") return 1;
  if (context.status === "ready_to_plan" || context.status === "draft") return 2;
  if (context.status === "loaded_trailer") return 3;
  if (context.status === "planned") return 4;
  if (context.status === "active") return 5;
  if (context.status === "completed") return 8;
  return 9;
}

export function earliestTimeRank(job: PlannedJob) {
  const times = sortedStops(job)
    .flatMap((stop) => [stop.timeWindowStart, stop.bookedTime, stop.timeWindowEnd])
    .filter((value): value is string => !!value)
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);
  return times.length ? Math.min(...times) : Number.MAX_SAFE_INTEGER;
}

export function appendPlannerReason(existing: string, reason: string) {
  const cleanReason = reason.trim();
  if (!cleanReason) return existing;
  const stamp = new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  return [existing?.trim(), `[Planner override ${stamp}] ${cleanReason}`].filter(Boolean).join("\n");
}
