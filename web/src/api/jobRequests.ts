import { api } from "./client";

// ── Public (no auth) ──────────────────────────────────────────────────────────

export interface PublicLinkInfo {
  companyName:   string;
  customerName:  string | null;
  contactName:   string | null;
  contactEmail:  string | null;
  contactPhone:  string | null;
  templateData:  Record<string, unknown> | null;
}

// Stop object — one per collection/delivery/reload/etc.
export interface RequestStop {
  type: "collection" | "delivery" | "reload" | "return" | "waypoint" | "other";
  sequenceNumber:      number;
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
  timeWindowStart?:    string;   // ISO datetime
  timeWindowEnd?:      string;   // ISO datetime
  bookedTime?:         string;   // ISO datetime
  unloadingAllowanceMinutes: number;
  quantityRequired?:       number;
  quantityUnit?:           string;
  stopNotes?:              string;
  exchangeDropQty?:        number;
  exchangeCollectQty?:     number;
  exchangeUnit?:           string;
  handlingMethods?:        string[];
  proofRequirements?:      string[];
  accessRequirements?:     string[];
  loadReadiness?:          string;
  heightRestriction?:      string;
  weightRestriction?:      string;
  lengthRestriction?:      string;
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
  liquidVolumeLitres?:    number;
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
  foodPreCooled?:         boolean;
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
  // Pallets extra
  weightPerUnit?:         number;
  palletDimL?:            number;
  palletDimW?:            number;
  ispm15Required?:        boolean;
  // Waste
  isWaste?:               boolean;
  ewcCode?:               string;
  wasteTrnNumber?:        string;
  // Container extras
  containerIsoType?:      string;
  containerBookingRef?:   string;
  containerTerminal?:     string;
  containerCutOff?:       string;
  containerSealNumber?:   string;
  // Food extras
  foodCleanVehicle?:      boolean;
  foodHaccp?:             boolean;
  foodAllergenFree?:      boolean;
  foodTempLogger?:        boolean;
  // ADR extras
  adrProperShippingName?: string;
  adrSubsidiaryRisk?:     string;
  adrFlashPoint?:         string;
  adrEmsCode?:            string;
  adrEmergencyContact?:   string;
  // Oversized / STGO
  stgoCategory?:          string;
  movementOrderNumber?:   string;
  // Cross-border
  crossBorderData?:       Record<string, unknown>;
  // Transport
  subcontractingAllowed?: string;
  driverQualifications?:  Record<string, unknown>;
}

export interface SpecialRequirementsData {
  items?:                       string[]; // dangerous_goods | fragile | high_value | oversized | secure_transport_required | escort_required
  adrClass?:                    string;
  unNumber?:                    string;
  packingGroup?:                string;
  hazardousQuantityKg?:         number;
  hazardousPaperworkAvailable?: boolean;
  oversizedWidth?:              string;
  oversizedHeight?:             string;
  oversizedLength?:             string;
}

export interface TransportRequirementsData {
  plannerDecides?:      boolean;
  reqBodyCategory?:     string;
  reqBodyTypes?:        string[];
  reqEquipment?:        string[];
  trailerTypesAllowed?: string[];
}

export interface NotesData {
  driverNoteChips?:    string[];
  driverVisibleNotes?: string;
  safetyInstructions?: string;
  customerNotes?:      string;
}

export interface ExceptionPolicyData {
  rejectionAction?:               string;
  alternativeReturnSiteName?:              string;
  alternativeReturnAddress?:               string;
  alternativeReturnAddressLine2?:          string;
  alternativeReturnTown?:                  string;
  alternativeReturnCounty?:               string;
  alternativeReturnPostcode?:              string;
  alternativeReturnCountry?:               string;
  alternativeReturnLat?:                   number;
  alternativeReturnLng?:                   number;
  alternativeReturnNavigationInstructions?: string;
  alternativeReturnContactName?:           string;
  alternativeReturnContactPhone?:          string;
  approvalContactName?:           string;
  approvalContactPhone?:          string;
  photosRequiredOnRejection?:     boolean;
  rejectionSignatureRequired?:    boolean;
  rejectionNotes?:                string;
}

export interface SubmitRequestBody {
  // Customer
  customerName:         string;
  bookingContactName?:  string;
  bookingContactPhone?: string;
  bookingContactEmail?: string;
  customerRef?:         string;
  // Stops
  stops: RequestStop[];
  // Load
  goodsType?:              string;
  goodsDescription?:       string;
  quantity?:               number;
  quantityUnit?:           string;
  weight?:                 number;
  stackable?:              boolean;
  tempControlled?:         boolean;
  tempRange?:              string;
  fragile?:                boolean;
  hazardClass?:            string;
  tunnelCode?:             string;
  securingRequirements?:   string[];
  specialRequirements?:    string[];
  dimensions?:             string;
  canSplitShipment?:       string;
  // Vehicle requirements
  vehicleCategory?:        string;
  bodyTypes?:              string[];
  equipment?:              string[];
  trailersAllowed?:        string[];
  // Billing
  declaredGoodsValue?:     string;
  purchaseOrderNumber?:    string;
  billingReference?:       string;
  // Notes
  driverVisibleNotes?:     string;
  driverNoteChips?:        string[];
  safetyInstructions?:     string;
  // Exception policy
  failureAction?:               string;
  approvalContactName?:         string;
  approvalContactPhone?:        string;
  alternativeReturnAddress?:    string;
  alternativeReturnPostcode?:   string;
  alternativeReturnContactName?:  string;
  alternativeReturnContactPhone?: string;
  // Extended alternative return address
  alternativeReturnSiteName?:              string;
  alternativeReturnAddressLine2?:          string;
  alternativeReturnTown?:                  string;
  alternativeReturnCounty?:                string;
  alternativeReturnCountry?:               string;
  alternativeReturnLat?:                   number;
  alternativeReturnLng?:                   number;
  alternativeReturnNavigationInstructions?: string;
  // Rejection policy
  photosRequiredOnRejection?:              boolean;
  rejectionSignatureRequired?:             boolean;
  rejectionNotes?:                         string;
  // Goods sub-type details blob
  loadData?:                               Record<string, unknown>;
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
  id:           number;
  companyId:    number;
  customerId:   number | null;
  name:         string;
  tokenHash:    string;
  rawToken:     string | null;
  isMain:       boolean;
  isActive:     boolean;
  expiresAt:    string | null;
  lastUsedAt:   string | null;
  usageCount:   number;
  createdAt:    string;
  customer:     { id: number; name: string } | null;
  templateData: Record<string, unknown> | null;
}

// ── Public (no-auth) helpers ──────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL || "http://192.168.0.45:3000";

const PUBLIC_TIMEOUT_MS = 30_000;

async function publicGet<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PUBLIC_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${path}`, { signal: controller.signal });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
    return res.json() as Promise<T>;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw new Error("Request timed out. Please try again.");
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function publicPost<T>(path: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PUBLIC_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
      signal:  controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error ?? res.statusText), { errors: data.errors });
    return data as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw new Error("Request timed out. Please try again.");
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const jobRequestsPublicApi = {
  getLinkInfo: (token: string) =>
    publicGet<PublicLinkInfo>(`/public/request/${token}`),
  submit: (token: string, body: SubmitRequestBody) =>
    publicPost<{ id: number; warnings: string[] }>(`/public/request/${token}`, body),
};

// ── Internal (auth required) ──────────────────────────────────────────────────

export const jobRequestsApi = {
  listLinks:   ()  => api.get<{ data: RequestLink[]; companySlug: string | null }>("/request-links"),
  updateLink:  (id: number, body: { name?: string; isActive?: boolean; expiresAt?: string | null; templateData?: Record<string, unknown> | null }) =>
    api.patch<RequestLink>(`/request-links/${id}`, body),
  regenerateLink: (id: number) =>
    api.post<RequestLink>(`/request-links/${id}/regenerate`, {}),

  list:    (status?: string, page?: number) =>
    api.get<{ data: import("../types").Job[]; total: number; page: number; pages: number }>(
      `/job-requests?${new URLSearchParams({ ...(status ? { status } : {}), ...(page ? { page: String(page) } : {}) })}`,
    ),
  get:     (id: number) => api.get<import("../types").Job>(`/job-requests/${id}`),
  /** plannedDate is required. vehicleCategory required if not already on the job. */
  accept:  (id: number, plannedDate: string, plannerNotes?: string, vehicleCategory?: string) =>
    api.post<{ ok: true; jobId: number; jobReference: string | null }>(`/job-requests/${id}/accept`, { plannedDate, plannerNotes, vehicleCategory }),
  reject:  (id: number, reason: string, notes?: string) =>
    api.post<{ ok: true }>(`/job-requests/${id}/reject`, { reason, notes }),
};
