import { api } from "./client";
import type { PlannedJob, SavedLocation } from "../types";

export const jobsApi = {
  list:         (date?: string) => api.get<{ data: PlannedJob[] }>(`/jobs${date ? "?date=" + date : ""}`),
  listRange:    (from: string, to: string) => api.get<{ data: PlannedJob[] }>(`/jobs?dateFrom=${from}&dateTo=${to}`),
  get:          (id: number) => api.get<PlannedJob>(`/jobs/${id}`),
  create:       (body: unknown) => api.post<PlannedJob>("/jobs", body),
  update:       (id: number, b: unknown) => api.patch<PlannedJob>(`/jobs/${id}`, b),
  remove:       (id: number) => api.delete<{ cancelled?: true; warnings?: string[]; affectedRunIds?: number[] } | Record<string, never>>(`/jobs/${id}`),
  updateStatus: (id: number, status: string, note?: string) => api.patch<{ id: number; status: string; from: string; warnings?: string[] }>(`/jobs/${id}/status`, { status, note }),
  addNote:      (id: number, note: string, clientEventId: string) => api.post(`/jobs/${id}/note`, { note, clientEventId }),
  repeat:       (id: number, body: unknown) => api.post<PlannedJob>(`/jobs/${id}/repeat`, body),
  locations:    () => api.get<{ data: SavedLocation[] }>("/locations"),
};
