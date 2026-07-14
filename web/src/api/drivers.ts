import { api } from "./client";
import type { Driver } from "../types";

export interface ScheduleStopResult {
  stopIdx:         number;
  jobId:           number;
  jobReference:    string | null;
  type:            string;
  postcode:        string | null;
  earliestArrival: string | null;
  windowStart:     string | null;
  windowEnd:       string | null;
  bookedTime:      string | null;
  status:          "ok" | "tight" | "impossible" | "unknown";
  issue:           string | null;
}

export interface ScheduleLegInfo {
  fromStopIdx:   number;
  toStopIdx:     number;
  travelMinutes: number | null;
  distanceKm:    number | null;
}

export interface DayScheduleResult {
  driverId:        number;
  date:            string;
  overallStatus:   "ok" | "tight" | "impossible" | "unknown";
  stops:           ScheduleStopResult[];
  legs:            ScheduleLegInfo[];
  totalDriveMin:   number;
  totalServiceMin: number;
  warnings:        string[];
}

export const driversApi = {
  list:         (status?: string) => api.get<{ data: Driver[] }>(`/drivers${status ? "?status=" + status : ""}`),
  create:       (body: unknown) => api.post<Driver & { defaultPin: string | null; loginEmail: string; isAgencyDriver: boolean; message: string }>("/drivers", body),
  update:       (id: number, b: unknown) => api.patch<Driver>(`/drivers/${id}`, b),
  setStatus:    (id: number, status: string) => api.patch<Driver>(`/drivers/${id}/status`, { status }),
  resetPin:     (id: number) => api.post<{ ok: true; defaultPin: string; loginEmail: string; message: string }>(`/drivers/${id}/reset-password`, {}),
  getSchedule:  (id: number, date: string) => api.get<DayScheduleResult>(`/drivers/${id}/schedule?date=${date}`),
};
