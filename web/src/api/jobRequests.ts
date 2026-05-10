import { api } from "./client";

// ── Public (no auth) ──────────────────────────────────────────────────────────

export interface PublicLinkInfo {
  companyName:  string;
  customerName: string | null;
  contactName:  string | null;
  contactEmail: string | null;
  contactPhone: string | null;
}

export interface PickupDataInput {
  referenceNumber?: string;   // per-stop reference (warehouse release, booking ref, etc.)
  siteName:       string;
  unitName?:      string;
  addressLine1:   string;
  addressLine2?:  string;
  townCity:       string;
  countyRegion?:  string;
  postcode:       string;
  country?:       string;
  entranceLat:    number;
  entranceLng:    number;
  entranceInstructions: string;
  contactName?:   string;
  contactPhone?:  string;
  contactEmail?:  string;
  bookingRequired?: boolean;
  bookingReference?: string;
  openingHours?:  string;
  siteRestrictions?: string;
  pickupDate:     string;       // YYYY-MM-DD
  earliestTime:   string;       // HH:MM
  latestTime:     string;       // HH:MM
  estimatedLoadingMinutes: number;
}

export interface DeliveryDataInput {
  referenceNumber?: string;   // per-stop reference (goods-in booking, PO, etc.)
  siteName:       string;
  unitName?:      string;
  addressLine1:   string;
  addressLine2?:  string;
  townCity:       string;
  countyRegion?:  string;
  postcode:       string;
  country?:       string;
  entranceLat:    number;
  entranceLng:    number;
  entranceInstructions: string;
  contactName?:   string;
  contactPhone?:  string;
  contactEmail?:  string;
  bookingRequired?: boolean;
  bookingReference?: string;
  openingHours?:  string;
  siteRestrictions?: string;
  deliveryDate:   string;       // YYYY-MM-DD
  earliestTime:   string;       // HH:MM
  latestTime:     string;       // HH:MM
  estimatedUnloadingMinutes: number;
}

export interface LoadDataInput {
  goodsDescription: string;
  quantity:         number;
  unit:             string;
  otherUnitDescription?: string;
  estimatedWeight?: number;
  palletCount?:     number;
  dimensions?:      string;
  volume?:          number;
  hazardousGoods?:  boolean;
  adrClass?:        string;
  temperatureControlled?: boolean;
  temperatureRange?: string;
  fragile?:         boolean;
  stackable?:       boolean;
  forkliftRequired?: boolean;
  tailLiftRequired?: boolean;
  craneRequired?:    boolean;
  loadingMethod?:   string;
  unloadingMethod?: string;
  loadNotes?:       string;
}

export interface SubmitRequestBody {
  customerCompanyName: string;
  contactName:         string;
  contactPhone:        string;
  contactEmail:        string;
  collectionReference: string;
  deliveryReference:   string;
  purchaseOrderNumber?: string;
  billingReference?:   string;
  declaredGoodsValue?: number;
  currency?:           string;
  pickupData:          PickupDataInput[];   // one or more collection stops
  deliveryData:        DeliveryDataInput[]; // one or more delivery stops
  loadData:            LoadDataInput;
  reqBodyCategory?:    string;
  reqBodyType?:        string;
  reqEquipment?:       string[];
  trailerTypesAllowed?: string[];
  minimumVehicleSize?: string;
  heightRestriction?:  string;
  weightRestriction?:  string;
  lengthRestriction?:  string;
  accessRestrictionNotes?: string;
  driverQualificationRequired?: string;
  proofOfDeliveryRequired?:   boolean;
  photosRequired?:            boolean;
  weighbridgeTicketRequired?: boolean;
  driverVisibleNotes?:  string;
  customerNotes?:       string;
  specialInstructions?: string;
  safetyInstructions?:  string;
}

export interface JobRequest {
  id:                  number;
  companyId:           number;
  source:              string;
  status:              string;
  customerCompanyName: string;
  contactName:         string;
  contactPhone:        string;
  contactEmail:        string;
  collectionReference: string;
  deliveryReference:   string;
  purchaseOrderNumber: string | null;
  billingReference:    string | null;
  declaredGoodsValue:  number | null;
  currency:            string;
  pricingType:         string;
  pickupData:          Record<string, unknown>;
  deliveryData:        Record<string, unknown>;
  loadData:            Record<string, unknown>;
  reqBodyCategory:     string | null;
  reqBodyType:         string | null;
  reqEquipment:        string[] | null;
  trailerTypesAllowed: string[] | null;
  minimumVehicleSize:  string | null;
  heightRestriction:   string | null;
  weightRestriction:   string | null;
  lengthRestriction:   string | null;
  proofOfDeliveryRequired:   boolean;
  photosRequired:            boolean;
  weighbridgeTicketRequired: boolean;
  driverVisibleNotes:  string | null;
  customerNotes:       string | null;
  specialInstructions: string | null;
  safetyInstructions:  string | null;
  internalOfficeNotes: string | null;
  reviewedAt:          string | null;
  rejectionReason:     string | null;
  reviewNotes:         string | null;
  convertedJobId:      number | null;
  convertedJob:        { id: number; jobReference: string | null; status: string } | null;
  requestLink:         { id: number; name: string } | null;
  createdAt:           string;
  updatedAt:           string;
}

export interface RequestLink {
  id:          number;
  companyId:   number;
  customerId:  number | null;
  name:        string;
  tokenHash:   string;
  isActive:    boolean;
  expiresAt:   string | null;
  lastUsedAt:  string | null;
  usageCount:  number;
  createdAt:   string;
  customer:    { id: number; name: string } | null;
  rawToken?:   string; // only returned on create
}

// Public (no-auth) calls — same base URL as the authenticated client
const API_BASE = import.meta.env.VITE_API_URL || "http://192.168.0.45:3000";

async function publicGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  return res.json() as Promise<T>;
}

async function publicPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? res.statusText), { errors: data.errors });
  return data as T;
}

export const jobRequestsPublicApi = {
  getLinkInfo: (token: string) =>
    publicGet<PublicLinkInfo>(`/public/request/${token}`),
  submit: (token: string, body: SubmitRequestBody) =>
    publicPost<{ id: number; warnings: string[] }>(`/public/request/${token}`, body),
};

// Internal (auth required) calls — use the normal api client
export const jobRequestsApi = {
  // Request links
  listLinks:   ()                      => api.get<{ data: RequestLink[] }>("/request-links"),
  createLink:  (body: { name: string; customerId?: number; expiresAt?: string }) =>
    api.post<RequestLink>("/request-links", body),
  updateLink:  (id: number, body: { name?: string; isActive?: boolean; expiresAt?: string | null }) =>
    api.patch<RequestLink>(`/request-links/${id}`, body),

  // Job requests
  list:        (status?: string, page?: number) =>
    api.get<{ data: JobRequest[]; total: number; page: number; pages: number }>(
      `/job-requests?${new URLSearchParams({ ...(status ? { status } : {}), ...(page ? { page: String(page) } : {}) }).toString()}`,
    ),
  get:         (id: number) => api.get<JobRequest>(`/job-requests/${id}`),
  accept:      (id: number, plannerNotes?: string) =>
    api.post<{ ok: boolean; jobId: number; jobReference: string | null }>(`/job-requests/${id}/accept`, { plannerNotes }),
  reject:      (id: number, reason: string, notes?: string) =>
    api.post<{ ok: true }>(`/job-requests/${id}/reject`, { reason, notes }),
};
