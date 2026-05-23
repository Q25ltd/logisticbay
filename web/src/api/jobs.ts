import { api } from "./client";
import type { PlannedJob, JobTemplate, SavedLocation } from "../types";

export const jobsApi = {
  list:           (date?: string) => api.get<{ data: PlannedJob[] }>(`/jobs${date ? "?date=" + date : ""}`),
  listRange:      (from: string, to: string) => api.get<{ data: PlannedJob[] }>(`/jobs?dateFrom=${from}&dateTo=${to}`),
  get:            (id: number) => api.get<PlannedJob>(`/jobs/${id}`),
  create:         (body: unknown) => api.post<PlannedJob>("/jobs", body),
  update:         (id: number, b: unknown) => api.patch<PlannedJob>(`/jobs/${id}`, b),
  remove:         (id: number) => api.delete<{ cancelled?: true; warnings?: string[]; affectedRunIds?: number[] } | Record<string, never>>(`/jobs/${id}`),
  allocate:       (id: number, b: unknown) => api.patch<PlannedJob>(`/jobs/${id}/allocate`, b),
  updateStatus:   (id: number, status: string, note?: string) => api.patch(`/jobs/${id}/status`, { status, note }),
  addNote:        (id: number, note: string) => api.post(`/jobs/${id}/note`, { note }),
  templates:      (status?: string) => api.get<{ data: JobTemplate[] }>(`/job-templates${status ? "?status=" + status : ""}`),
  createTemplate: (body: unknown) => api.post<JobTemplate>("/job-templates", body),
  updateTemplate: (id: number, b: unknown) => api.patch<JobTemplate>(`/job-templates/${id}`, b),
  deleteTemplate: (id: number) => api.delete<{ ok: boolean }>(`/job-templates/${id}`),
  locations:      () => api.get<{ data: SavedLocation[] }>("/locations"),
  createLocation: (body: unknown) => api.post<SavedLocation>("/locations", body),
};
