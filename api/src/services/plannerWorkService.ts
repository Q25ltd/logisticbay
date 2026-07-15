/**
 * plannerWorkService.ts
 *
 * Returns a sorted, grouped list of unplanned job parts for the planning board.
 *
 * Core rule: sort by NEXT REQUIRED MOVEMENT, not the original job request.
 * If a load is already at a location (per LoadTrack), that location becomes the
 * current location for planning purposes — not the original collection address.
 */

import type { PrismaClient } from "../generated/client.js";
import { custodyBaseOf } from "../constants/loadVocab.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlannerWorkItem {
  jobId:            number;
  jobPartId:        number;
  jobReference:     string | null;
  customerName:     string | null;
  nextAction:       string;
  currentLocation:  string | null;
  currentPostcode:  string | null;
  finalDestination: string | null;
  finalPostcode:    string | null;
  timeWindowStart:  string | null;  // ISO
  timeWindowEnd:    string | null;  // ISO
  bookedTime:       string | null;  // ISO
  vehicleCategory:  string | null;
  goodsType:        string | null;
  goodsDescription: string | null;
  weight:           number | null;
  quantity:         number | null;
  quantityUnit:     string | null;
  // Quantity ledger — how much of this part is already on active runs.
  // remainingQuantity > 0 with assignedQuantity > 0 = a partial/multi-trip
  // remainder still to plan ("4 of 30 remaining").
  assignedQuantity:  number;
  remainingQuantity: number | null;
  hasHazardous:     boolean;
  hasTempControl:   boolean;
  riskLevel:        "high" | "medium" | "low" | "none";
  warnings:         string[];
  sortScore:        number;
  groupKey:         string;
  postcodeDistrict: string | null;  // UK outward code e.g. "LS27", "M1", "SW1A"
  // In-custody (yard storage): where the load is parked + when it got there.
  custodyLocation:  string | null;  // e.g. "yard:7" — the load's current custody ref
  inCustodySince:   string | null;  // ISO — when it entered custody (for "N days at yard")
}

// ── UK postcode district extraction ──────────────────────────────────────────
//
// UK postcodes look like "LS27 8QT", "M1 1AA", "SW1A 2AA", "EC1A 1BB".
// The outward code (district) is everything before the space.
// If there's no space (data quality issue), strip the last 3 chars (inward code).

function extractPostcodeDistrict(postcode: string | null | undefined): string | null {
  if (!postcode) return null;
  const t = postcode.trim().toUpperCase();
  const spaceIdx = t.indexOf(" ");
  if (spaceIdx > 0) return t.slice(0, spaceIdx);
  // No space — strip inward code (last 3 chars)
  return t.length > 3 ? t.slice(0, -3).trim() || null : null;
}

// ── UK postcode area → direction region ──────────────────────────────────────

const LONDON_AREAS = new Set([
  "E","EC","N","NW","SE","SW","W","WC",
  "BR","CR","DA","EN","HA","IG","KT","RM","SM","TW","UB","WD",
]);

const MIDLANDS_AREAS = new Set([
  "B","CV","DE","LE","NN","NG","ST","WS","WV","DY",
]);

const NORTH_AREAS = new Set([
  "BD","DN","HD","HG","HU","HX","LS","S","WF","YO",
  "BB","BL","CA","CH","CW","FY","LA","M","OL","PR","SK","WA","WN",
  "DH","DL","NE","SR","TS",
]);

const EAST_AREAS = new Set([
  "CB","CM","CO","IP","NR","PE","SS",
]);

const WEST_WALES_AREAS = new Set([
  "BA","BS","CF","GL","HR","NP","SA","SN","SP","SY","WR",
]);

const SCOTLAND_AREAS = new Set([
  "AB","DD","DG","EH","FK","G","HS","IV","KA","KW","KY","ML","PA","PH","TD","ZE",
]);

function directionGroup(postcode: string | null | undefined): string {
  if (!postcode) return "direction_local";
  // Extract the outward code area: letters only from the start
  const area = postcode.trim().toUpperCase().replace(/\s.*$/, "").replace(/\d.*$/, "");
  if (LONDON_AREAS.has(area))     return "direction_london";
  if (MIDLANDS_AREAS.has(area))   return "direction_midlands";
  if (NORTH_AREAS.has(area))      return "direction_north";
  if (EAST_AREAS.has(area))       return "direction_east";
  if (WEST_WALES_AREAS.has(area)) return "direction_west_wales";
  if (SCOTLAND_AREAS.has(area))   return "direction_scotland";
  return "direction_local";
}

// ── Vehicle / goods → vehicle group ──────────────────────────────────────────

function vehicleGroup(vehicleCategory: string | null | undefined, goodsType: string | null | undefined): string | null {
  if (!vehicleCategory) return null;
  const vc = vehicleCategory.toLowerCase();
  const gt = (goodsType ?? "").toLowerCase();

  // ADR takes precedence
  if (gt.includes("adr") || gt.includes("hazard") || gt.includes("dangerous")) return "vehicle_adr";
  if (vc.includes("hiab"))    return "vehicle_hiab";
  if (vc.includes("flatbed")) return "vehicle_flatbed";
  if (vc.includes("taillift") || vc.includes("tail_lift") || vc.includes("tail lift")) return "vehicle_taillift";

  if (vc.includes("artic") || vc.includes("tractor")) {
    if (gt.includes("fridge") || gt.includes("refrigerat") || gt.includes("temp") || gt.includes("food_refrigerated")) {
      return "vehicle_artic_fridge";
    }
    return "vehicle_artic_curtainsider";
  }
  if (vc.includes("rigid")) return "vehicle_rigid";
  if (vc.includes("van"))   return "vehicle_van";
  return null;
}

// ── Group priority order ──────────────────────────────────────────────────────

const GROUP_PRIORITY: Record<string, number> = {
  needs_attention:            0,
  in_custody:                 1,
  today:                      2,
  vehicle_van:               10,
  vehicle_rigid:             11,
  vehicle_artic_curtainsider:12,
  vehicle_artic_fridge:      13,
  vehicle_flatbed:           14,
  vehicle_taillift:          15,
  vehicle_hiab:              16,
  vehicle_adr:               17,
  direction_london:          20,
  direction_midlands:        21,
  direction_north:           22,
  direction_east:            23,
  direction_west_wales:      24,
  direction_scotland:        25,
  direction_local:           26,
  future:                    99,
};

function resolveGroupKey(
  riskLevel: "high" | "medium" | "low" | "none",
  inCustody: boolean,
  hasTimeToday: boolean,
  vehicleCategory: string | null | undefined,
  goodsType: string | null | undefined,
  finalPostcode: string | null | undefined,
): string {
  if (riskLevel === "high") return "needs_attention";
  if (inCustody)            return "in_custody";
  if (hasTimeToday)         return "today";

  const vg = vehicleGroup(vehicleCategory, goodsType);
  if (vg) return vg;

  return directionGroup(finalPostcode);
}

// ── Sort score ────────────────────────────────────────────────────────────────

function sortScore(
  inCustodyNoDelivery: boolean,
  bookedTime: Date | null,
  timeWindowStart: Date | null,
  now: Date,
): number {
  if (inCustodyNoDelivery) return 0;

  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const tomorrowEnd = new Date(todayEnd);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

  if (bookedTime) {
    const minsUntil = (bookedTime.getTime() - now.getTime()) / 60000;
    if (bookedTime <= todayEnd)    return 100 + Math.max(0, minsUntil);
    if (bookedTime <= tomorrowEnd) return 200 + Math.max(0, minsUntil);
  }
  if (timeWindowStart) {
    const minsUntil = (timeWindowStart.getTime() - now.getTime()) / 60000;
    if (timeWindowStart <= todayEnd)    return 300 + Math.max(0, minsUntil);
    if (timeWindowStart <= tomorrowEnd) return 400 + Math.max(0, minsUntil);
  }

  return 9000;
}

// ── Location summary helpers ──────────────────────────────────────────────────

function locationText(part: {
  locationTextSnapshot?: string | null;
  siteName?: string | null;
  street?: string | null;
  town?: string | null;
  postcode?: string | null;
}): string | null {
  return part.locationTextSnapshot?.trim() || part.siteName?.trim() ||
    [part.street, part.town, part.postcode].filter(Boolean).join(", ") || null;
}

// ── Main service function ─────────────────────────────────────────────────────

export async function getPlannerWorkItems(
  prisma: PrismaClient,
  companyId: number,
  dateFrom: string,
  dateTo: string,
): Promise<PlannerWorkItem[]> {
  const now   = new Date();
  const gte   = new Date(`${dateFrom}T00:00:00.000Z`);
  const lte   = new Date(`${dateTo}T23:59:59.999Z`);

  // ── 1. Fetch unplanned job parts ──────────────────────────────────────────
  //
  // We mirror the date-range logic from /planning/unplanned.
  // Two sub-queries: timeWindowStart in range, bookedTime in range (E.2 — plannedDate removed).

  // A part belongs on the board when NOTHING is assigned — or when only part
  // of its quantity is on runs (split leg removed / partial assignment): the
  // REMAINDER must stay visible or cargo silently disappears from planning.
  const baseWhere = {
    companyId,
    job: { status: { in: ["ready_to_plan", "in_planning"] as string[] } },
  };

  const jobSelect = {
    id: true, jobReference: true, customerName: true,
    goodsType: true, goodsDescription: true,
    quantity: true, quantityUnit: true, weight: true,
    vehicleCategory: true, tempControlled: true,
    hazardClass: true,
  } as const;

  const partInclude = {
    job: { select: jobSelect },
    runAssignments: { where: { removedAt: null as null }, select: { quantityAssigned: true } },
  } as const;

  const [withWindowAll, withBookedTimeAll] = await Promise.all([
    prisma.jobPart.findMany({
      where: { ...baseWhere, timeWindowStart: { gte, lte } },
      include: partInclude,
    }),
    prisma.jobPart.findMany({
      where: { ...baseWhere, timeWindowStart: null, bookedTime: { gte, lte } },
      include: partInclude,
    }),
  ]);

  // Quantity ledger per part: total (form-born) vs Σ assigned on active runs.
  type PartWithLedger = typeof withWindowAll[number];
  const ledgerOf = (p: PartWithLedger) => {
    const total    = p.quantityRequired != null ? Number(p.quantityRequired)
                   : p.job.quantity     != null ? Number(p.job.quantity) : null;
    const assigned = p.runAssignments.reduce((s, a) => s + Number(a.quantityAssigned), 0);
    const remaining = total != null ? Math.max(total - assigned, 0) : null;
    return { total, assigned, remaining };
  };
  const needsPlanning = (p: PartWithLedger) => {
    if (p.runAssignments.length === 0) return true;                  // nothing assigned
    const { total, remaining } = ledgerOf(p);
    return total != null && (remaining ?? 0) > 0;                    // partial — remainder to plan
  };
  const withWindow     = withWindowAll.filter(needsPlanning);
  const withBookedTime = withBookedTimeAll.filter(needsPlanning);

  // ── 1b. In-custody loads parked at a yard — DATE-INDEPENDENT ───────────────
  //
  // A load collected and dropped at a yard (relay / DC / swap) has status
  // `collected` — excluded from the date-scoped query above — and may sit for
  // days. It must NEVER fall out of view, so we fetch it on its own: latest
  // custody base = yard, onward (delivery) leg not yet on an active run.
  const latestByJob = await prisma.loadTrack.findMany({
    where:    { companyId, deletedAt: null },
    orderBy:  [{ jobId: "asc" }, { timestamp: "desc" }],
    distinct: ["jobId"],
    select:   { jobId: true, toCustody: true, timestamp: true },
  });
  const yardByJob = new Map<number, Date>();
  for (const r of latestByJob) {
    if (custodyBaseOf(r.toCustody) === "yard") yardByJob.set(r.jobId, r.timestamp);
  }
  const custodyParts = yardByJob.size > 0
    ? await prisma.jobPart.findMany({
        where: {
          companyId,
          jobId:          { in: [...yardByJob.keys()] },
          type:           { in: ["delivery", "dropoff"] },          // the onward leg
          runAssignments: { none: { removedAt: null as null } },    // not yet on an active run
          job:            { status: { notIn: ["completed", "cancelled"] } },
        },
        include: partInclude,
      })
    : [];

  // De-duplicate by id (date-scoped parts + custody parts)
  const seen = new Set<number>();
  const allParts: typeof withWindow = [];
  for (const p of [...withWindow, ...withBookedTime, ...custodyParts]) {
    if (!seen.has(p.id)) { seen.add(p.id); allParts.push(p); }
  }

  if (allParts.length === 0) return [];

  // ── 2. Fetch LoadTrack entries for all relevant jobs ──────────────────────

  const jobIds = [...new Set(allParts.map(p => p.jobId))];

  // Get the most recent LoadTrack entry per jobId (to find current custody)
  const loadTracks = await prisma.loadTrack.findMany({
    where:   { companyId, jobId: { in: jobIds }, deletedAt: null },
    orderBy: [{ jobId: "asc" }, { timestamp: "desc" }],
  });

  // Build a map: jobId → latest LoadTrack
  const latestTrackByJob = new Map<number, typeof loadTracks[0]>();
  for (const lt of loadTracks) {
    if (!latestTrackByJob.has(lt.jobId)) {
      latestTrackByJob.set(lt.jobId, lt);
    }
  }

  // Also check for standing-trailer condition: loadTrack with trailerId set
  // and no assigned run completed after it (approximate: trailerId is non-empty).
  // We flag this as high risk below.

  // ── 3. Group job parts by jobId to understand the full job context ─────────

  // For each jobId, collect all parts to detect collection/delivery pairs
  const partsByJob = new Map<number, typeof allParts>();
  for (const p of allParts) {
    if (!partsByJob.has(p.jobId)) partsByJob.set(p.jobId, []);
    partsByJob.get(p.jobId)!.push(p);
  }

  // ── 4. Build one PlannerWorkItem per JobPart ──────────────────────────────

  const items: PlannerWorkItem[] = [];

  for (const part of allParts) {
    const job        = part.job;
    const track      = latestTrackByJob.get(part.jobId);
    const jobParts   = partsByJob.get(part.jobId) ?? [];

    const isCollection = part.type === "collection";
    const isDelivery   = part.type === "delivery";

    const jobHasCollection = jobParts.some(p => p.type === "collection");
    const jobHasDelivery   = jobParts.some(p => p.type === "delivery");
    const collectionPart   = jobParts.find(p => p.type === "collection");
    const deliveryPart     = jobParts.find(p => p.type === "delivery");

    // ── Determine current location ─────────────────────────────────────────
    //
    // If a LoadTrack exists and has toCustody data → the load has moved.
    // Use the GPS from the latest track, or fall back to the collection part address.

    let currentLocation: string | null = null;
    let currentPostcode: string | null = null;
    const hasLoadTrack = !!track;

    if (hasLoadTrack && track) {
      // If GPS available, we don't have a location name from LoadTrack directly.
      // Use toCustody as a hint; if it references "depot" use depot concept.
      // In practice, fall back to the collection stop address since LoadTrack
      // doesn't store a location name.
      // Current postcode: use GPS lookup if we had a geocoder, but for now we
      // use the job part's postcode where the load was physically handled.
      if (collectionPart) {
        currentLocation = locationText(collectionPart);
        currentPostcode = collectionPart.postcode ?? null;
      }
    } else if (collectionPart) {
      currentLocation = locationText(collectionPart);
      currentPostcode = collectionPart.postcode ?? null;
    }

    // ── Final destination ──────────────────────────────────────────────────

    let finalDestination: string | null = null;
    let finalPostcode:    string | null = null;

    if (deliveryPart) {
      finalDestination = locationText(deliveryPart);
      finalPostcode    = deliveryPart.postcode ?? null;
    } else if (isDelivery) {
      finalDestination = locationText(part);
      finalPostcode    = part.postcode ?? null;
    } else if (!isDelivery && !deliveryPart) {
      // This is a collection-only part with no delivery planned
      finalDestination = null;
      finalPostcode    = null;
    }

    // ── Next action label ──────────────────────────────────────────────────

    let nextAction: string;
    if (isCollection) {
      const dest = locationText(part) ?? "collection point";
      nextAction = `Collect from ${dest}`;
    } else if (isDelivery) {
      const dest = locationText(part) ?? "delivery point";
      nextAction = `Deliver to ${dest}`;
    } else {
      const dest = locationText(part) ?? "stop";
      nextAction = `Stop at ${dest}`;
    }

    // ── Custody / in-custody detection ────────────────────────────────────

    // A load is "in custody" when its latest custody base is on a vehicle or in
    // a yard (i.e. held, not yet at the customer destination). Base-aware per
    // loadVocab CUSTODY_BASES — replaces the old free-text .includes() heuristic.
    const toBase     = track ? custodyBaseOf(track.toCustody) : null;
    const inCustody  = hasLoadTrack && (toBase === "on_vehicle" || toBase === "yard");

    // ── Warnings ──────────────────────────────────────────────────────────

    const warnings: string[] = [];

    // Missing vehicle category
    if (!job.vehicleCategory) {
      warnings.push("No vehicle type specified — add a vehicle requirement before planning");
    }

    // Missing collection address
    if (jobHasCollection && collectionPart) {
      if (!collectionPart.street && !collectionPart.locationTextSnapshot && !collectionPart.town) {
        warnings.push("Collection address is incomplete");
      }
    }

    // Missing delivery address
    if (jobHasDelivery && deliveryPart) {
      if (!deliveryPart.street && !deliveryPart.locationTextSnapshot && !deliveryPart.town) {
        warnings.push("Delivery address is incomplete");
      }
    }

    // Delivery planned but load not collected
    if (isDelivery && !hasLoadTrack) {
      warnings.push("Load not yet collected — delivery cannot proceed");
    }

    // Load collected but no delivery stop planned
    if (inCustody && isCollection && !jobHasDelivery) {
      warnings.push("Load is in custody but no delivery stop has been planned");
    }

    // Time window checks
    if (part.timeWindowEnd && part.timeWindowEnd < now) {
      warnings.push("Delivery time window has already passed");
    } else if (part.timeWindowStart) {
      const minsUntil = (part.timeWindowStart.getTime() - now.getTime()) / 60000;
      if (minsUntil >= 0 && minsUntil <= 120) {
        warnings.push("Time window opens within the next 2 hours — urgent");
      }
    } else if (part.bookedTime) {
      const minsUntil = (part.bookedTime.getTime() - now.getTime()) / 60000;
      if (minsUntil >= 0 && minsUntil <= 120) {
        warnings.push("Booking time is within the next 2 hours — urgent");
      } else if (part.bookedTime < now) {
        warnings.push("Booked time has already passed");
      }
    }

    // Standing trailer risk: load is on a trailer with no active run
    // Detect via: LoadTrack exists, trailerId is non-empty, load has not been delivered
    if (track && track.trailerId && track.trailerId.trim() !== "" && !track.runId) {
      warnings.push("Load is on a standing trailer with no run assigned — action required");
    }

    // ── Risk level ─────────────────────────────────────────────────────────

    let riskLevel: "high" | "medium" | "low" | "none" = "none";

    const highRiskConditions = [
      !job.vehicleCategory,
      warnings.some(w => w.includes("Load not yet collected")),
      warnings.some(w => w.includes("time has already passed") || w.includes("window has already passed")),
      warnings.some(w => w.includes("standing trailer")),
    ];

    const mediumRiskConditions = [
      warnings.some(w => w.includes("within the next 2 hours")),
      warnings.some(w => w.includes("no delivery stop has been planned")),
    ];

    if (highRiskConditions.some(Boolean))   riskLevel = "high";
    else if (mediumRiskConditions.some(Boolean)) riskLevel = "medium";
    else if (warnings.length > 0)           riskLevel = "low";

    // ── Time window checks for grouping ───────────────────────────────────

    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const hasTimeToday =
      (part.bookedTime     != null && part.bookedTime     <= todayEnd) ||
      (part.timeWindowStart != null && part.timeWindowStart <= todayEnd) ||
      (part.timeWindowEnd  != null && part.timeWindowEnd  <= todayEnd);

    // ── Group key ──────────────────────────────────────────────────────────

    const inCustodyNoDelivery = inCustody && isCollection && !jobHasDelivery;

    const groupKey = resolveGroupKey(
      riskLevel,
      inCustody, // load is in custody — could be awaiting delivery or re-planning
      hasTimeToday,
      job.vehicleCategory,
      job.goodsType,
      finalPostcode,
    );

    // ── Sort score ─────────────────────────────────────────────────────────

    const score = sortScore(
      inCustodyNoDelivery,
      part.bookedTime   ? new Date(part.bookedTime)   : null,
      part.timeWindowStart ? new Date(part.timeWindowStart) : null,
      now,
    );

    // postcodeDistrict: the stop's own address is the most useful geographic anchor
    // (where the driver needs to go for this specific stop).
    const partPostcode   = part.postcode ?? null;
    const postcodeDistrict = extractPostcodeDistrict(partPostcode) ??
                             extractPostcodeDistrict(finalPostcode) ??
                             extractPostcodeDistrict(currentPostcode);

    items.push({
      jobId:            part.jobId,
      jobPartId:        part.id,
      jobReference:     job.jobReference,
      customerName:     job.customerName,
      nextAction,
      currentLocation,
      currentPostcode,
      finalDestination,
      finalPostcode,
      timeWindowStart:  part.timeWindowStart  ? part.timeWindowStart.toISOString()  : null,
      timeWindowEnd:    part.timeWindowEnd    ? part.timeWindowEnd.toISOString()    : null,
      bookedTime:       part.bookedTime       ? part.bookedTime.toISOString()       : null,
      vehicleCategory:  job.vehicleCategory,
      goodsType:        job.goodsType,
      goodsDescription: job.goodsDescription,
      weight:           job.weight    != null ? Number(job.weight)    : null,
      quantity:         job.quantity  != null ? Number(job.quantity)  : null,
      quantityUnit:     job.quantityUnit,
      assignedQuantity:  ledgerOf(part).assigned,
      remainingQuantity: ledgerOf(part).remaining,
      hasHazardous:     !!job.hazardClass,
      hasTempControl:   job.tempControlled || false,
      riskLevel,
      warnings,
      sortScore:        score,
      groupKey,
      postcodeDistrict,
      custodyLocation:  inCustody && track ? track.toCustody : null,
      inCustodySince:   inCustody && track ? track.timestamp.toISOString() : null,
    });
  }

  // ── 5. Sort items ─────────────────────────────────────────────────────────

  items.sort((a, b) => {
    const pa = GROUP_PRIORITY[a.groupKey] ?? 50;
    const pb = GROUP_PRIORITY[b.groupKey] ?? 50;
    if (pa !== pb) return pa - pb;
    return a.sortScore - b.sortScore;
  });

  return items;
}
