/**
 * proposeRunsService — Phase A3 "never start with a blank page".
 *
 * Deterministic, ADVISORY proposal engine: turns loose unplanned stops into
 * candidate runs grouped by the brief's three questions —
 *   1. what can travel together (compatibility, reuse checkLoadMixing)
 *   2. same direction / corridor (greedy geographic grouping)
 *   3. (feasibility/confidence is scored later by check-run at the route layer)
 * Each candidate is tagged with a movement strategy and a one-line "why".
 *
 * No solver, no ML — good candidates, not a globally optimal plan. The planner
 * accepts (materialises a run via the existing endpoints) or ignores. The core
 * `buildProposals` is pure + unit-testable; scoring is added by the route.
 */

import { haversineKm } from "../lib/geo.js";
import { checkLoadMixing, type MixPart, type MixResult } from "../lib/loadMixing.js";

export interface ProposalStop {
  jobId:           number;
  jobPartId:       number;
  type:            string;            // collection | pickup | delivery | dropoff
  customerName?:   string | null;
  postcode?:       string | null;
  lat?:            number | null;
  lng?:            number | null;
  hazardous?:      boolean | null;
  tempControlled?: boolean | null;
  tempRange?:      string | null;
  oversized?:      boolean | null;
  goodsType?:      string | null;
}

export type MovementStrategy = "direct" | "multi_drop" | "groupage";

export interface RunProposal {
  strategy:      MovementStrategy;
  jobIds:        number[];
  stops:         ProposalStop[];      // collections first, then deliveries
  compatibility: MixResult;
  why:           string;
}

const CORRIDOR_RADIUS_KM = 30;

const isCollection = (t: string) => t === "collection" || t === "pickup";
const isDelivery   = (t: string) => t === "delivery"   || t === "dropoff";

interface JobUnit {
  jobId:        number;
  collects:     ProposalStop[];
  delivers:     ProposalStop[];
  load:         MixPart;                       // representative load requirement
  dropCoord:    { lat: number; lng: number } | null;
  dropArea:     string | null;                 // postcode outward code fallback
}

function outwardCode(postcode?: string | null): string | null {
  if (!postcode) return null;
  const m = postcode.trim().toUpperCase().match(/^[A-Z]{1,2}\d/);
  return m ? m[0] : null;
}

/** Shape raw stops into per-job units. */
function toJobUnits(stops: ProposalStop[]): JobUnit[] {
  const byJob = new Map<number, ProposalStop[]>();
  for (const s of stops) {
    const arr = byJob.get(s.jobId);
    if (arr) arr.push(s); else byJob.set(s.jobId, [s]);
  }

  const units: JobUnit[] = [];
  for (const [jobId, js] of byJob) {
    const collects = js.filter(s => isCollection(s.type));
    const delivers = js.filter(s => isDelivery(s.type));
    const rep = collects[0] ?? delivers[0] ?? js[0];
    const drop = delivers.find(s => s.lat != null && s.lng != null);
    units.push({
      jobId,
      collects, delivers,
      load: {
        type:           "collection",
        hazardous:      js.some(s => s.hazardous),
        tempControlled: js.some(s => s.tempControlled),
        tempRange:      js.find(s => s.tempRange)?.tempRange ?? null,
        oversized:      js.some(s => s.oversized),
        goodsType:      rep.goodsType ?? null,
      },
      dropCoord: drop ? { lat: drop.lat!, lng: drop.lng! } : null,
      dropArea:  outwardCode((delivers[0] ?? rep).postcode),
    });
  }
  return units;
}

/** Greedy corridor clustering of job units by delivery location. */
function clusterByCorridor(units: JobUnit[]): JobUnit[][] {
  const clusters: { centroid: { lat: number; lng: number } | null; area: string | null; members: JobUnit[] }[] = [];

  for (const u of units) {
    let target = clusters.find(c => {
      if (u.dropCoord && c.centroid) return haversineKm(c.centroid.lat, c.centroid.lng, u.dropCoord.lat, u.dropCoord.lng) <= CORRIDOR_RADIUS_KM;
      if (!u.dropCoord && u.dropArea) return c.area != null && c.area === u.dropArea;
      return false;
    });
    if (!target) {
      target = { centroid: u.dropCoord ? { ...u.dropCoord } : null, area: u.dropArea, members: [] };
      clusters.push(target);
    }
    target.members.push(u);
  }
  return clusters.map(c => c.members);
}

/** Within a corridor, split into compatibility-safe groups (no high conflict). */
function splitByCompatibility(units: JobUnit[]): JobUnit[][] {
  const groups: JobUnit[][] = [];
  for (const u of units) {
    let placed = false;
    for (const g of groups) {
      const trial = checkLoadMixing([...g.map(x => x.load), u.load]);
      if (!trial.conflicts.some(c => c.severity === "high")) { g.push(u); placed = true; break; }
    }
    if (!placed) groups.push([u]);
  }
  return groups;
}

function detectStrategy(group: JobUnit[]): MovementStrategy {
  const collects = group.flatMap(u => u.collects);
  const delivers = group.flatMap(u => u.delivers);
  if (group.length === 1 && collects.length <= 1 && delivers.length <= 1) return "direct";
  // single shared collection origin, several deliveries → multi-drop
  const collectKeys = new Set(collects.map(c => c.postcode ?? `${c.lat},${c.lng}`));
  if (collectKeys.size <= 1 && delivers.length > 1) return "multi_drop";
  return "groupage";
}

function describe(strategy: MovementStrategy, group: JobUnit[], compat: MixResult): string {
  const drops = group.flatMap(u => u.delivers).length;
  const area  = group.find(u => u.dropArea)?.dropArea ?? "the same area";
  const base =
    strategy === "direct"     ? `Direct run — single collection and delivery.` :
    strategy === "multi_drop" ? `Multi-drop — one collection, ${drops} deliveries around ${area}.` :
                                `Groupage — ${group.length} compatible loads heading to ${area}.`;
  const warn = compat.conflicts.length ? ` Note: ${compat.conflicts[0].reason}` : "";
  return base + warn;
}

/**
 * Pure proposal builder. Groups stops into candidate runs (corridor +
 * compatibility) and tags each with a strategy + reason. Feasibility/confidence
 * is added later by the route via check-run.
 */
export function buildProposals(stops: ProposalStop[]): RunProposal[] {
  const units = toJobUnits(stops);
  if (units.length === 0) return [];

  const proposals: RunProposal[] = [];
  for (const corridor of clusterByCorridor(units)) {
    for (const group of splitByCompatibility(corridor)) {
      const compatibility = checkLoadMixing(group.map(u => u.load));
      const strategy = detectStrategy(group);
      proposals.push({
        strategy,
        jobIds: group.map(u => u.jobId),
        stops:  [...group.flatMap(u => u.collects), ...group.flatMap(u => u.delivers)],
        compatibility,
        why:    describe(strategy, group, compatibility),
      });
    }
  }
  return proposals;
}
