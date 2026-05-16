import { api } from "./client";

// ── Public (no auth) ──────────────────────────────────────────────────────────

export interface PublicLinkInfo {
  companyName:   string;
  customerName:  string | null;
  contactName:   string | null;
  contactEmail:  string | null;
  contactPhone:  string | null;
}

// Stop object — one per collection/delivery/reload/etc.
export interface RequestStop {
  type: "collection" | "delivery" | "reload" | "return" | "waypoint" | "other";
  sequence?: number;
  siteName:            string;
  street:              string;
  addressLine2?:       string;
  town:                string;
  countyRegion?:       string;
  postcode:            string;
  country?:            string;
  lat:                 number;
  lng:                 number;
  navigationInstructions: string;
  referenceNumber?:    string;
  contactName?:        string;
  contactPhone?:       string;
  contactEmail?:       string;
  bookingRequired?:    boolean;
  bookingRef?:         string;
  openingHours?:       string;
  siteRestrictions?:   string[];
  date:                string;   // YYYY-MM-DD
  earliestArrivalTime: string;   // HH:MM
  latestArrivalTime:   string;   // HH:MM
  bookedTime?:         string;
  unloadingAllowanceMinutes: number;
  stopQuantity?:           number;
  stopQuantityUnit?:       string;
  stopNotes?:              string;
  exchangeDropQty?:        number;
  exchangeCollectQty?:     number;
  exchangeUnit?:           string;
  handlingMethods?:        string[];
  proofRequirements?:      string[];
  accessRequirements?:     string[];
  loadReadiness?:          string;
  heightRestrictionValue?: string;
  weightRestrictionValue?: string;
  lengthRestrictionValue?: string;
  // Set server-side after postcode validation:
  entranceDistanceFromPostcode?: number | null;
  entranceWarningLevel?: "ok" | "warn" | "danger";
}

export interface RequesterData {
  customerCompanyName: string;
  contactName:         string;
  contactPhone:        string;
  contactEmail:        string;
  customerRef?:        string;
}

export interface LoadData {
  goodsType:              string; // pallets | machinery | building_materials | food_refrigerated | bulk_material | steel_long | vehicles | containers | general | other
  goodsTypeOther?:        string; // free text when goodsType = "other"
  goodsDescription:       string;
  quantity:               number;
  unit:                   string;
  estimatedWeight?:       number;
  // Pallets
  palletCount?:           number;
  palletType?:            string;
  palletTypeOther?:       string; // free text when palletType = "other"
  stackable?:             boolean;
  // Roll cages / yorks
  cageCount?:             number;
  cageFolded?:            boolean;
  // Building materials
  buildingMaterialType?:             string;
  buildingMaterialPalletised?:       boolean;
  buildingMaterialLongestItem?:      string;
  buildingMaterialWeatherSensitive?: boolean;
  // Liquid / tanker
  liquidProductType?:     string;
  liquidFoodGrade?:       boolean;
  // General goods
  generalPackagingType?:  string;
  generalPieceCount?:     number;
  // All types
  loadHeight?:            string;
  // Machinery
  dimensions?:            string;
  machineryPieceWeight?:  number; // kg per individual piece
  machineryLiftingPoints?: boolean;
  machinerySkidMounted?:  boolean;
  craneRequired?:         boolean;
  // Steel / long loads
  steelPieceCount?:       number;
  steelWidth?:            string; // metres — abnormal load if > 2.9m
  // Bulk
  tippingRequired?:       boolean;
  // Food / refrigerated
  temperatureRange?:      string;
  chilledFrozenAmbient?:  string;
  // Vehicles
  vehicleCount?:          number;
  vehicleMakeModel?:      string;
  vehicleKeysWithVehicle?: boolean;
  driveable?:             boolean;
  // Containers
  containerSize?:         string;
  containerSizeOther?:    string; // free text when containerSize = "other"
  loadedOrEmpty?:         string;
  containerNumber?:       string;
  // General
  loadNotes?:             string;
  canSplitShipment?:      string;
  securingRequirements?:  string[];
}

export interface SpecialRequirementsData {
  items?:                       string[]; // dangerous_goods | temperature_controlled | fragile | high_value | oversized | secure_transport_required | escort_required | temperature_monitored
  adrClass?:                    string;
  unNumber?:                    string;
  packingGroup?:                string;
  hazardousPaperworkAvailable?: boolean;
}

export interface TransportRequirementsData {
  plannerDecides?:      boolean;
  reqBodyCategory?:     string;
  reqBodyTypes?:        string[];
  reqEquipment?:        string[];
  trailerTypesAllowed?: string[];
}

export interface BillingData {
  pricingType?:        string; // quote_required | agreed_rate_exists | contract_rate_exists | to_be_confirmed
  declaredGoodsValue?: number;
  currency?:           string;
  purchaseOrderNumber?: string;
  billingReference?:   string;
  vatRegistered?:      boolean;
  vatNumber?:          string;
}

export interface NotesData {
  driverNoteChips?:    string[];
  driverVisibleNotes?: string;
  safetyInstructions?: string;
  customerNotes?:      string;
}

export interface ExceptionPolicyData {
  rejectionAction?:               string;
  alternativeReturnAddress?:      string;
  alternativeReturnPostcode?:     string;
  alternativeReturnContactName?:  string;
  alternativeReturnContactPhone?: string;
  approvalContactName?:           string;
  approvalContactPhone?:          string;
  photosRequiredOnRejection?:     boolean;
  rejectionSignatureRequired?:    boolean;
  rejectionNotes?:                string;
}

export interface SubmitRequestBody {
  requesterData:             RequesterData;
  stops:                     RequestStop[];
  loadData:                  LoadData;
  specialRequirementsData?:  SpecialRequirementsData;
  transportRequirementsData?: TransportRequirementsData;
  billingData?:              BillingData;
  notesData?:                NotesData;
  exceptionPolicyData?:      ExceptionPolicyData;
}

export interface JobRequest {
  id:            number;
  companyId:     number;
  requestLinkId: number | null;
  customerId:    number | null;
  source:        string;
  status:        string;
  customerName:  string;
  contactName:   string;
  contactPhone:  string;
  contactEmail:  string;
  pricingType:   string;
  // JSON blobs
  requesterData:             RequesterData;
  stops:                     RequestStop[];
  loadData:                  LoadData;
  specialRequirementsData:   SpecialRequirementsData;
  transportRequirementsData: TransportRequirementsData;
  billingData:               BillingData;
  notesData:                 NotesData;
  reviewData:                Record<string, unknown> | null;
  // Review
  internalOfficeNotes: string | null;
  reviewedAt:          string | null;
  rejectionReason:     string | null;
  reviewNotes:         string | null;
  // Conversion
  convertedJobId: number | null;
  convertedJob:   { id: number; jobReference: string | null; status: string } | null;
  requestLink:    { id: number; name: string } | null;
  createdAt:      string;
  updatedAt:      string;
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

// ── Public (no-auth) helpers ──────────────────────────────────────────────────

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

// ── Internal (auth required) ──────────────────────────────────────────────────

export const jobRequestsApi = {
  listLinks:   ()  => api.get<{ data: RequestLink[] }>("/request-links"),
  createLink:  (body: { name: string; customerId?: number; expiresAt?: string }) =>
    api.post<RequestLink>("/request-links", body),
  updateLink:  (id: number, body: { name?: string; isActive?: boolean; expiresAt?: string | null }) =>
    api.patch<RequestLink>(`/request-links/${id}`, body),

  list:    (status?: string, page?: number) =>
    api.get<{ data: JobRequest[]; total: number; page: number; pages: number }>(
      `/job-requests?${new URLSearchParams({ ...(status ? { status } : {}), ...(page ? { page: String(page) } : {}) })}`,
    ),
  get:     (id: number) => api.get<JobRequest>(`/job-requests/${id}`),
  accept:  (id: number, plannerNotes?: string) =>
    api.post<{ ok: boolean; jobId: number; jobReference: string | null }>(`/job-requests/${id}/accept`, { plannerNotes }),
  reject:  (id: number, reason: string, notes?: string) =>
    api.post<{ ok: true }>(`/job-requests/${id}/reject`, { reason, notes }),
};
