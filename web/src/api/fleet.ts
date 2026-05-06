import { api } from "./client";
import type { FleetUnit, FleetTrailer } from "../types";

export const fleetApi = {
  units: {
    list:   (status?: string) => api.get<{ data: FleetUnit[] }>(`/fleet/units${status ? "?status=" + status : ""}`),
    create: (body: unknown)   => api.post<FleetUnit>("/fleet/units", body),
    update: (id: number, body: unknown) => api.patch<FleetUnit>(`/fleet/units/${id}`, body),
    remove: (id: number)      => api.delete(`/fleet/units/${id}`),
  },
  trailers: {
    list:   (status?: string) => api.get<{ data: FleetTrailer[] }>(`/fleet/trailers${status ? "?status=" + status : ""}`),
    create: (body: unknown)   => api.post<FleetTrailer>("/fleet/trailers", body),
    update: (id: number, body: unknown) => api.patch<FleetTrailer>(`/fleet/trailers/${id}`, body),
    remove: (id: number)      => api.delete(`/fleet/trailers/${id}`),
  },
};
