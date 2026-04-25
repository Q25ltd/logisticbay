import { api } from "./client";
import type { Driver } from "../types";

export const driversApi = {
  list:      (status?: string) => api.get<{ data: Driver[] }>(`/drivers${status ? "?status=" + status : ""}`),
  create:    (body: unknown) => api.post<Driver>("/drivers", body),
  update:    (id: number, b: unknown) => api.patch<Driver>(`/drivers/${id}`, b),
  setStatus: (id: number, status: string) => api.patch<Driver>(`/drivers/${id}/status`, { status }),
  resetPin:  (id: number) => api.post(`/drivers/${id}/reset-password`, {}),
};
