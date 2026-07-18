import { api } from "./client";

// ── Types (S15 live monitoring & reconciliation surface) ─────────────────────

export interface ReviewQueueItem {
  id:           number;
  eventType:    string;
  reviewReason: string | null;
  note:         string;
  occurredAt:   string;
  receivedAt:   string;
  gpsLat:       number | null;
  gpsLng:       number | null;
  jobId:        number;
  jobReference: string | null;
  customerName: string | null;
  jobStatus:    string | null;
  runId:        number | null;
  runReference: string | null;
  actorName:    string | null;
}

interface LiveStop {
  assignmentId:   number;
  executionState: string;
  stopType:       string;
  quantity:       number | null;
  quantityUnit:   string | null;
  jobId:          number;
  jobReference:   string | null;
  customerName:   string | null;
  jobStatus:      string | null;
  custody:        { toCustody: string; transactionType: string; timestamp: string } | null;
}

export interface LiveRun {
  id:                number;
  runReference:      string;
  status:            string;
  publishedToDriver: boolean;
  driverName:        string | null;
  actualStartTime:   string | null;
  actualEndTime:     string | null;
  dependsOnRunId:    number | null;
  stops:             LiveStop[];
}

// ── Fetchers ──────────────────────────────────────────────────────────────────

export const liveApi = {
  needsReview: () =>
    api.get<{ items: ReviewQueueItem[]; openCount: number }>("/live/needs-review"),
  resolve: (id: number) =>
    api.post<{ ok: boolean }>(`/live/needs-review/${id}/resolve`, {}),
  runs: (date?: string) =>
    api.get<{ date: string; runs: LiveRun[] }>(`/live/runs${date ? `?date=${date}` : ""}`),
};
