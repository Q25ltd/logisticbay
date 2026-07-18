import { api } from "./client";
import type { Run, RunAssignment } from "../types";

export interface RunsListParams {
  date?:     string;
  dateFrom?: string;
  dateTo?:   string;
  driverId?: number;
  status?:   string;
  limit?:    number;
  cursor?:   number;
}

export interface RunsListResponse {
  data:       Run[];
  pagination: { limit: number; nextCursor: number | null; hasNextPage: boolean };
}

export interface CreateRunBody {
  assignedDriverId?:   number | null;
  assignedTruckId?:    number | null;
  assignedTrailerId?:  number | null;
  plannedDate?:        string | null;
  estimatedStartTime?: string | null;
  estimatedEndTime?:   string | null;
  plannerNotes?:       string;
  endInstruction?:     string | null;
  endInstructionNote?: string | null;
  returnToBase?:       boolean;
  returnToBaseNote?:   string | null;
}

export interface PatchRunBody extends Partial<CreateRunBody> {
  status?:                      string;
  compatibilityOverridden?:     boolean;
  compatibilityOverrideReason?: string | null;
}

export interface AddAssignmentBody {
  jobPartId:         number;
  jobId:             number;
  sequenceNumber?:   number;
  quantityAssigned?: number;
  quantityUnit?:     string;
  notes?:            string;
}

export interface PatchAssignmentBody {
  sequenceNumber?:   number;
  quantityAssigned?: number;
  quantityUnit?:     string;
  status?:           string;
  notes?:            string | null;
}

function buildQuery(params: RunsListParams): string {
  const q = new URLSearchParams();
  if (params.date)     q.set("date",     params.date);
  if (params.dateFrom) q.set("dateFrom", params.dateFrom);
  if (params.dateTo)   q.set("dateTo",   params.dateTo);
  if (params.driverId) q.set("driverId", String(params.driverId));
  if (params.status)   q.set("status",   params.status);
  if (params.limit)    q.set("limit",    String(params.limit));
  if (params.cursor)   q.set("cursor",   String(params.cursor));
  const s = q.toString();
  return s ? "?" + s : "";
}

type ReadinessStatus = "pass" | "warn" | "fail" | "unknown" | "na";
interface ReadinessCheck {
  key:     string;
  label:   string;
  status:  ReadinessStatus;
  hard:    boolean;
  reason?: string;
  /** Where the information is born / fixed (four intake gates + this screen). */
  source?: "allocation" | "driver" | "fleet" | "job";
}
export interface RunReadiness {
  ready:     boolean;
  blockers:  string[];
  resources: { checks: ReadinessCheck[]; passed: number; total: number };
  assigned:  { driver: string | null; truck: string | null; trailer: string | null };
}

export interface Candidate {
  id:          number;
  label:       string;
  available:   boolean;
  busyOn:      string | null;
  suitable:    boolean;
  reasons:     string[];
  recommended: boolean;
  note?:         string;    // informational: "Dave's usual unit" / "usually Bob's unit"
  preloaded?:    boolean;   // trailer already carrying THIS run's job
  driversUsual?: boolean;
}
export interface RunCandidates {
  drivers:  Candidate[];
  trailers: Candidate[];
  trucks:   Candidate[];
}

export const runsApi = {
  /** List runs — filter by date, driverId, status */
  list:   (params: RunsListParams = {}) =>
    api.get<RunsListResponse>(`/runs${buildQuery(params)}`),

  /** Resource readiness + publish gate for a run (Runs B1) */
  readiness: (id: number) =>
    api.get<RunReadiness>(`/runs/${id}/readiness`),

  /** Available + suitable assets to allocate to a run (Runs B4) */
  candidates: (id: number) =>
    api.get<RunCandidates>(`/runs/${id}/candidates`),

  /** Get a single run with full assignment detail */
  get:    (id: number) =>
    api.get<Run>(`/runs/${id}`),

  /** Create a new run (draft) */
  create: (body: CreateRunBody) =>
    api.post<Run>("/runs", body),

  /** Update run metadata / assignment */
  update: (id: number, body: PatchRunBody) =>
    api.patch<Run>(`/runs/${id}`, body),

  /** Cancel a run (soft delete) */
  remove: (id: number) =>
    api.delete<void>(`/runs/${id}`),

  /** Publish run to assigned driver */
  publish: (id: number) =>
    api.post<Run>(`/runs/${id}/publish`, {}),

  /** Add a JobPart to the run */
  addAssignment: (runId: number, body: AddAssignmentBody) =>
    api.post<RunAssignment>(`/runs/${runId}/assignments`, body),

  /** Update an assignment (sequence, quantity, status) */
  updateAssignment: (runId: number, assignmentId: number, body: PatchAssignmentBody) =>
    api.patch<RunAssignment>(`/runs/${runId}/assignments/${assignmentId}`, body),

  /** Remove an assignment from the run */
  removeAssignment: (runId: number, assignmentId: number, reason?: string) =>
    api.delete<void>(`/runs/${runId}/assignments/${assignmentId}`, reason ? { reason } : undefined),

  /** Reorder all assignments in one shot */
  resequence: (runId: number, order: number[]) =>
    api.post<Run>(`/runs/${runId}/assignments/resequence`, { order }),
};
