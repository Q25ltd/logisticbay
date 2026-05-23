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

export const aiApi = {
  parseRequest: (text: string) =>
    api.post<ParsedJobData>("/ai/parse-request", { text }),
  status: () =>
    api.get<{ enabled: boolean }>("/ai/status"),
};
