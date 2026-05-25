import { api } from "./client";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UnplannedStop {
  id:             number;
  jobId:          number;
  jobReference:   string | null;
  customerName:   string | null;
  type:           string;
  sequenceNumber: number;
  siteName:       string | null;
  town:           string | null;
  locationText:   string | null;
  postcode:       string | null;
  lat:            number | null;
  lng:            number | null;
  timeWindowStart?: string | null;
  timeWindowEnd?:   string | null;
  bookedTime?:      string | null;
  goodsType:      string | null;
  weight:         number | null;
  quantity:       number | null;
  quantityUnit:   string | null;
  plannedDate?:   string | null;
}

export interface SavedLocationOption {
  id:       number;
  name:     string;
  siteName: string | null;
  town:     string | null;
  postcode: string | null;
}

export interface StopCluster {
  id:            string;
  label:         string;
  postcodeArea:  string;
  centLat:       number;
  centLng:       number;
  stops:         UnplannedStop[];
  totalWeightKg:   number;
  totalQty:        number;
  primaryQtyUnit:  string | null;
  hasTimeWindows:  boolean;
  earliestWindow:  string | null;
  latestWindow:    string | null;
}

export interface PlanningRun {
  id:               number;
  companyId:        number;
  runReference:     string;
  status:           string;
  runType:          string | null;
  dependsOnRunId:   number | null;
  assignedDriverId: number | null;
  assignedTruckId:  number | null;
  assignedTrailerId:number | null;
  plannedDate:      string | null;
  estimatedStartTime?: string | null;
  estimatedEndTime?:   string | null;
  publishedToDriver:   boolean;
  plannerNotes?:       string | null;
  hasHazardous:        boolean;
  hasTemperatureLoad:  boolean;
  hasOversized:        boolean;
  requiredTrailerType?: string | null;
  maxLoadWeight?:      number | null;
  createdAt:           string;
  driver?: {
    id: number;
    displayName: string;
    user?: { id: number; name: string; email: string } | null;
  } | null;
  dependsOn?:  { id: number; runReference: string; status: string } | null;
  dependents?: { id: number; runReference: string; status: string }[];
  assignments: PlanningAssignment[];
  waypoints:   RunWaypoint[];
}

export interface PlanningAssignment {
  id:               number;
  runId:            number;
  jobPartId:        number;
  jobId:            number;
  sequenceNumber:   number;
  quantityAssigned: number;
  quantityUnit:     string;
  status:           string;
  jobPart: {
    id:             number;
    type:           string;
    sequenceNumber: number;
    locationTextSnapshot: string | null;
    postcode?:      string | null;
    lat?:           number | null;
    lng?:           number | null;
    timeWindowStart?: string | null;
    timeWindowEnd?:   string | null;
    job: {
      id:           number;
      jobReference: string | null;
      customerName: string | null;
      goodsType:    string | null;
      goodsDescription: string | null;
      quantity:     number | null;
      quantityUnit: string | null;
      weight:       number | null;
    };
  };
}

export interface FleetTrailer {
  id:           number;
  registration: string;
  trailerType:  string;
  bodyType:     string;
  status:       string;
  notes?:       string | null;
}

export interface FleetUnit {
  id:           number;
  registration: string;
  status:       string;
  category?:    string | null;
}

export interface RunWaypoint {
  id:             number;
  runId:          number;
  sequenceNumber: number;
  waypointType:   string;   // depot_start | yard_pickup | hub_drop | return_to_base | custom
  locationId?:    number | null;
  locationText?:  string | null;
  postcode?:      string | null;
  lat?:           number | null;
  lng?:           number | null;
  scheduledTime?: string | null;
  notes?:         string | null;
  location?: {
    id:       number;
    name:     string;
    siteName: string | null;
    postcode: string | null;
    lat:      number | null;
    lng:      number | null;
  } | null;
}

export interface PlanningDriver {
  id:          number;
  displayName: string;
  status:      string;
  user?: { id: number; name: string; email: string } | null;
}

// ── API calls ─────────────────────────────────────────────────────────────────

export const planningApi = {
  getUnplanned: (dateFrom: string, dateTo?: string) => {
    const to = dateTo ?? dateFrom;
    const qs = dateFrom === to
      ? `date=${dateFrom}`
      : `dateFrom=${dateFrom}&dateTo=${to}`;
    return api.get<{ clusters: StopCluster[]; total: number }>(`/planning/unplanned?${qs}`);
  },

  getRuns: (date: string) =>
    api.get<{ runs: PlanningRun[] }>(`/planning/runs?date=${date}`),

  createRun: (body: {
    date: string;
    runType?: string;
    plannerNotes?: string;
    assignedTrailerId?: number;
    assignedDriverId?: number;
    dependsOnRunId?: number;
  }) => api.post<PlanningRun>("/planning/runs", body),

  patchRun: (id: number, body: {
    runType?:           string | null;
    dependsOnRunId?:    number | null;
    assignedTrailerId?: number | null;
    assignedDriverId?:  number | null;
    assignedTruckId?:   number | null;
    plannerNotes?:      string | null;
    estimatedStartTime?: string | null;
    status?:            string;
  }) => api.patch<PlanningRun>(`/planning/runs/${id}`, body),

  addStop: (runId: number, jobPartId: number, quantityAssigned?: number) =>
    api.post<{ assignment: PlanningAssignment; run: PlanningRun }>(
      `/planning/runs/${runId}/assignments`,
      { jobPartId, quantityAssigned },
    ),

  removeStop: (runId: number, assignmentId: number) =>
    api.delete<PlanningRun>(`/planning/runs/${runId}/assignments/${assignmentId}`),

  publish: (runId: number) =>
    api.post<PlanningRun>(`/planning/runs/${runId}/publish`, {}),

  addWaypoint: (runId: number, body: {
    waypointType?:  string;
    locationId?:    number | null;
    locationText?:  string;
    postcode?:      string;
    scheduledTime?: string;
    notes?:         string;
    sequenceNumber?: number;
  }) => api.post<RunWaypoint>(`/planning/runs/${runId}/waypoints`, body),

  removeWaypoint: (runId: number, waypointId: number) =>
    api.delete<void>(`/planning/runs/${runId}/waypoints/${waypointId}`),

  getFleet: () =>
    api.get<{ trailers: FleetTrailer[]; trucks: FleetUnit[] }>("/planning/fleet"),

  getDrivers: (date: string) =>
    api.get<{ drivers: PlanningDriver[] }>(`/planning/drivers?date=${date}`),

  getLocations: () =>
    api.get<{ data: SavedLocationOption[] }>("/locations"),
};
