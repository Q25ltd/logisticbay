import { api } from "./client";
import type { Driver, FleetTrailer, FleetUnit, PlannedJob } from "../types";

export interface DashboardData {
  jobs:     PlannedJob[];
  drivers:  Driver[];
  units:    FleetUnit[];
  trailers: FleetTrailer[];
}

export const dashboardApi = {
  load: (dateFrom: string, dateTo: string) =>
    api.get<DashboardData>(`/dashboard?dateFrom=${dateFrom}&dateTo=${dateTo}`),
};
