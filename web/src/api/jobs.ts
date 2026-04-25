import { api } from "./client";
import type { PlannedJob, JobTemplate, SavedLocation } from "../types";

export const jobsApi = {
  list:           (date?: string) => api.get<{ data: PlannedJob[] }>(`/jobs${date ? "?date=" + date : ""}`),
  create:         (body: unknown) => api.post<PlannedJob>("/jobs", body),
  update:         (id: number, b: unknown) => api.patch<PlannedJob>(`/jobs/${id}`, b),
  updateStatus:   (id: number, status: string, note?: string) => api.patch(`/jobs/${id}/status`, { status, note }),
  addNote:        (id: number, note: string) => api.post(`/jobs/${id}/note`, { note }),
  templates:      () => api.get<{ data: JobTemplate[] }>("/job-templates"),
  createTemplate: (body: unknown) => api.post<JobTemplate>("/job-templates", body),
  updateTemplate: (id: number, b: unknown) => api.patch<JobTemplate>(`/job-templates/${id}`, b),
  locations:      () => api.get<{ data: SavedLocation[] }>("/locations"),
  createLocation: (body: unknown) => api.post<SavedLocation>("/locations", body),
};
