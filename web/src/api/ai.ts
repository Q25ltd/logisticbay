import { api } from "./client";

export interface ParsedStop {
  type:                "collection" | "delivery";
  siteName?:           string;
  street?:             string;
  addressLine2?:       string;
  town?:               string;
  postcode?:           string;
  country?:            string;
  date?:               string;
  earliestArrivalTime?: string;
  latestArrivalTime?:   string;
  bookedTime?:          string;
  contactName?:         string;
  contactPhone?:        string;
  contactEmail?:        string;
  referenceNumber?:     string;
  bookingRequired?:     boolean;
  bookingRef?:          string;
  stopNotes?:           string;
  savedLocationId?:     number;
}

export interface ParsedJobData {
  customerName?:         string;
  bookingContactName?:   string;
  bookingContactPhone?:  string;
  bookingContactEmail?:  string;
  customerRef?:          string;
  goodsType?:            string;
  goodsDescription?:     string;
  quantity?:             number;
  quantityUnit?:         string;
  weight?:               number;
  tempControlled?:       boolean;
  hazardClass?:          string;
  vehicleCategory?:      string;
  specialRequirements?:  string[];
  stops?:                ParsedStop[];
  confidence:            "high" | "medium" | "low";
  warnings:              string[];
}

export interface StopAreaHint {
  type:      string;   // "collection" | "delivery"
  areaType?: string;
  label?:    string;
}

export interface VehicleSuggestionInput {
  weight?:              number;
  quantity?:            number;
  quantityUnit?:        string;
  goodsType?:           string;
  goodsDescription?:    string;
  tempControlled?:      boolean;
  hazardClass?:         string;
  specialRequirements?: string[];
  stopCount?:           number;
  stops?:               StopAreaHint[];  // area context per stop
}

export interface VehicleSuggestion {
  vehicleCategory:    string;
  suggestedBodyTypes: string[];        // body types from the fleet that suit this load
  reasoning:          string;
  confidence:         "high" | "medium" | "low";
  fleetWarning?:      string | null;   // non-null if company fleet can't handle this job
}

export interface TrailerSuggestionInput {
  weight?:         number;
  quantity?:       number;
  quantityUnit?:   string;
  goodsType?:      string;
  tempControlled?: boolean;
  hazardClass?:    string;
  stopCount?:      number;
}

export interface TrailerSuggestion {
  trailerId:            number | null;
  trailerRegistration:  string | null;
  reasoning:            string;
  confidence:           "high" | "medium" | "low";
}

export interface LoadVehicleCheckInput {
  vehicleCategory:   string;
  bodyTypes?:        string[];
  goodsDescription?: string;
  goodsType?:        string;
  weight?:           number;
  quantity?:         number;
  quantityUnit?:     string;
  hazardClass?:      string;
  tempControlled?:   boolean;
}

export interface LoadVehicleCheckResult {
  concern:     boolean;
  severity:    "high" | "medium" | "low" | "none";
  message:     string;
  suggestion?: string;
}

export interface RunStopInput {
  sequenceNumber:   number;
  type:             string;
  locationText?:    string | null;
  postcode?:        string | null;
  lat?:             number | null;
  lng?:             number | null;
  timeWindowStart?: string | null;
  timeWindowEnd?:   string | null;
  bookedTime?:      string | null;
  customerName?:    string | null;
}

export interface RunFeasibilityResult {
  concern:     boolean;
  severity:    "high" | "medium" | "low" | "none";
  message:     string;
  suggestion?: string;
}

export type AreaType =
  | "industrial"
  | "residential"
  | "rural"
  | "urban"
  | "retail"
  | "port"
  | "unknown";

export interface AreaInfo {
  postcode:  string;
  areaType:  AreaType;
  label:     string;
  emoji:     string;
  lat?:      number;
  lng?:      number;
}

export const aiApi = {
  parseRequest:  (text: string) =>
    api.post<ParsedJobData>("/ai/parse-request", { text }),
  suggestVehicle: (input: VehicleSuggestionInput) =>
    api.post<VehicleSuggestion>("/ai/suggest-vehicle", input),
  suggestRunTrailer: (input: TrailerSuggestionInput) =>
    api.post<TrailerSuggestion>("/ai/suggest-run-trailer", input),
  checkVehicleLoad: (input: LoadVehicleCheckInput) =>
    api.post<LoadVehicleCheckResult>("/ai/check-vehicle-load", input),
  checkRun: (input: {
    stops: RunStopInput[];
    estimatedStartTime?: string | null;
    vehicle?: {
      weightT?:   number | null;  // combined GVW in tonnes
      heightM?:   number | null;
      widthM?:    number | null;
      lengthM?:   number | null;
      axleLoadT?: number | null;
    } | null;
  }) => api.post<RunFeasibilityResult>("/ai/check-run", input),
  lookupAreas:   (postcodes: string[]) =>
    api.post<AreaInfo[]>("/ai/area-lookup", { postcodes }),
  status:        () =>
    api.get<{ enabled: boolean }>("/ai/status"),
};
