export interface User {
  id: number; name: string; email: string;
  companyId: number; companyName: string;
  role: "company_owner" | "planner" | "driver";
}

export interface Customer {
  id: number;
  companyId: number;
  name: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
}
export interface HolidayRequest {
  id: number;
  driverProfileId: number;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  note?: string | null;
  status: string;
}

export interface Driver {
  id: number;
  companyId: number;
  userId: number | null;
  displayName: string;
  employeeNumber: string | null;
  phoneNumber: string | null;
  employmentStartDate?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  driverType?: string;
  licenceClass?: string;
  endorsements?: string[];
  canDriveCategories?: string[];
  canUseTrailer?: boolean;
  trailerTypesAllowed?: string[];
  adrAllowed?: boolean;
  hiabAllowed?: boolean;
  moffettAllowed?: boolean;
  manualHandlingAllowed?: boolean;
  preferredStartTime?: string;
  earliestStartTime?: string;
  latestFinishTime?: string;
  preferredShiftHours?: number | null;
  normalWorkingDays?: string[];
  weekendAvailable?: boolean;
  nightWorkAllowed?: boolean;
  nightsOutAllowed?: boolean;
  overtimeAllowed?: boolean;
  baseLocation?: string;
  operatingArea?: string;
  avoidAreas?: string;
  plannerNotes?: string;
  holidayAllowance?: number;
  holidayUsed?: number;
  holidayRequests?: HolidayRequest[];
  defaultTruckReg: string;
  defaultTruckClass?: string;
  defaultTrailerReg: string;
  defaultTrailerClass?: string;
  status: "active" | "inactive";
  user?: { id: number; email: string; name: string; status?: string } | null;
}
export interface JobPart {
  id?: number;
  sequenceNumber: number;
  type: "pickup" | "dropoff" | "collection" | "delivery" | "handover" | "yard" | "depot";
  savedLocationId?: number | null;
  siteName?: string;
  unitName?: string;
  street?: string;
  town?: string;
  postcode?: string;
  locationTextSnapshot: string;
  lat?: number | null;
  lng?: number | null;
  gateLat?: number | null;
  gateLng?: number | null;
  timeWindowStart?: string | null;
  timeWindowEnd?: string | null;
  bookedTime?: string | null;
  earliestArrivalMinutes?: number | null;
  unloadingAllowanceMinutes?: number | null;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  referenceNumber?: string;
  instructions?: string;
  bookingRequired?: boolean;
  bookingRef?: string;
  openingHours?: string;
  locationType?: string;
  navigationInstructions?: string;
  numPallets?: number | null;
  internalNotes?: string;
  status?: string;
  // New form-parity fields
  quantityRequired?: number | null;
  quantityUnit?: string;
  exchangeDropQty?: number | null;
  exchangeCollectQty?: number | null;
  exchangeUnit?: string;
  handlingMethods?: string[] | null;
  accessRequirements?: string[] | null;
  proofRequirements?: string[] | null;
  loadReadiness?: string;
  stopNotes?: string;
  addressLine2?: string;
  countyRegion?: string;
  country?: string;
  // Vehicle/access restrictions at this stop
  heightRestriction?: string;
  weightRestriction?: string;
  lengthRestriction?: string;
}

// LoadDetails is now merged into Job — this interface is kept only for legacy template blobs
export interface LoadDetails {
  id?: number;
  quantity?: number | string | null;
  unit?: string;
  weight?: number | string | null;
  volume?: number | string | null;
  materialType?: string;
  hazardClass?: string;
  notes?: string;
  dimensions?: string;
  fragile?: boolean;
  stackable?: boolean;
  tempControlled?: boolean;
  tempRange?: string;
  photosRequired?: boolean;
  weighbridgeRequired?: boolean;
  forkliftRequired?: boolean;
  tailLiftRequired?: boolean;
  craneRequired?: boolean;
  loadingMethod?: string;
  unloadingMethod?: string;
  goodsType?: string;
  securingRequirements?: string[] | null;
  specialRequirements?: string[] | null;
}

export interface Job {
  id:          number;
  companyId:   number;
  customerId?: number | null;
  customerName?: string;
  customer?:   Customer | null;
  jobReference?: string | null;
  templateId?: number | null;
  parentJobId?: number | null;

  // identity
  status: "draft" | "pending_review" | "ready_to_plan" | "in_planning" | "planned" | "in_progress" | "completed" | "cancelled";
  priority?: "low" | "normal" | "high" | "urgent";
  jobTitle?: string | null;

  // scheduling
  plannedDate?: string | null;
  serviceType?: string;
  jobType?:     string;
  canSplitShipment?: string;

  // customer
  customerRef?:        string;
  purchaseOrderNumber?: string;
  billingReference?:   string | null;
  declaredGoodsValue?: string | null;
  billingNotes?:       string;
  bookingContactName?:  string;
  bookingContactPhone?: string;
  bookingContactEmail?: string;
  custRefRequired?: boolean;
  poRequired?:      boolean;

  // planner
  plannerNotes?:       string;
  internalNotes?:      string;
  driverNoteChips?:    string[] | null;
  driverVisibleNotes?: string | null;
  safetyInstructions?: string | null;

  // load (merged from LoadDetails)
  goodsType?:           string;
  goodsDescription?:    string;
  quantity?:            number | null;
  quantityUnit?:        string;
  weight?:              number | null;
  volume?:              number | null;
  dimensions?:          string;
  fragile?:             boolean;
  stackable?:           boolean;
  tempControlled?:      boolean;
  tempRange?:           string;
  hazardClass?:         string;
  photosRequired?:      boolean;
  weighbridgeRequired?: boolean;
  securingRequirements?: string[] | null;
  specialRequirements?:  string[] | null;
  loadData?:             Record<string, unknown> | null;

  // vehicle requirements (what the job NEEDS — matched against fleet at assignment)
  vehicleCategory?:    string;
  bodyTypes?:          string[] | null;   // array — each value matches FleetUnit.bodyType
  minGvwClass?:        string;
  equipment?:          string[] | null;
  trailersAllowed?:    string[] | null;
  vehicleAccessNotes?: string;

  // exception policy
  failureAction?:                 string;
  assistancePhone?:               string;
  assistanceNote?:                string;
  approvalContactName?:           string | null;
  approvalContactPhone?:          string | null;
  alternativeReturnAddress?:      string | null;
  alternativeReturnPostcode?:     string | null;
  alternativeReturnContactName?:  string | null;
  alternativeReturnContactPhone?: string | null;

  // proof / quality
  requirePOD?:                  boolean;
  photosRequiredOnRejection?:   boolean;
  validationStatus?: string;
  qualityScore?:     number;

  // override close
  overrideClosed?:              boolean;
  overrideReason?:              string | null;
  overrideQuantityDelivered?:   number | null;
  closedAt?:                    string | null;

  stops?:  JobPart[];
  events?: JobEvent[];
  createdAt: string;
  updatedAt: string;

  // Planning status — computed from RunAssignments, not stored
  planningStatus?: "no_stops" | "not_planned" | "partially_planned" | "planned" | "partially_done" | "done";

  // Kept for UI components that haven't migrated to Run yet
  /** @deprecated Use Run.assignedDriverId */  assignedDriverId?: number | null;
  /** @deprecated Use Run.assignedDriverId */  assignedDriver?:   Driver | null;
  /** @deprecated Use Run.assignedTruckId */   assignedTruck?:    string;
  /** @deprecated Use Run.assignedTrailerId */ assignedTrailer?:  string;
}

/** @deprecated Use Job */
export type PlannedJob = Job;

// ── Run — execution container (independent of Job) ────────────────────────────
export interface Run {
  id:              number;
  companyId:       number;
  runReference:    string;
  status:          "draft" | "assigned" | "in_progress" | "completed" | "cancelled";
  assignedDriverId?: number | null;
  assignedTruckId?:  number | null;
  assignedTrailerId?: number | null;
  plannedDate?:       string | null;
  estimatedStartTime?: string | null;
  estimatedEndTime?:   string | null;
  actualStartTime?:    string | null;
  actualEndTime?:      string | null;
  publishedToDriver:   boolean;
  plannerNotes?:       string | null;
  endInstruction?:     string | null;
  endInstructionNote?: string | null;
  returnToBase:        boolean;
  returnToBaseNote?:   string | null;
  returningAt?:        string | null;
  arrivedBaseAt?:      string | null;
  // Derived requirements
  requiredTrailerType?: string | null;
  requiredEquipment?:   string[] | null;
  maxLoadWeight?:       number | null;
  hasHazardous:         boolean;
  hasTemperatureLoad:   boolean;
  hasOversized:         boolean;
  // Compatibility
  trailerCompatible:           boolean;
  vehicleCompatible:           boolean;
  compatibilityOverridden:     boolean;
  compatibilityOverrideReason?: string | null;
  createdBy:  number;
  createdAt:  string;
  updatedAt:  string;
  // Relations (included on detail views)
  driver?:      Driver | null;
  assignments?: RunAssignment[];
}

// ── RunAssignment — bridge between JobPart and Run ───────────────────────────
export interface RunAssignment {
  id:               number;
  companyId:        number;
  runId:            number;
  jobPartId:        number;
  jobId:            number;
  sequenceNumber:   number;
  quantityAssigned: number;
  quantityUnit:     string;
  status:           "pending" | "completed" | "skipped";
  addedAt:          string;
  addedBy:          number;
  removedAt?:       string | null;
  removedBy?:       number | null;
  removalReason?:   string | null;
  notes?:           string | null;
  // Relations (included on detail views)
  jobPart?: JobPart;
  job?: Pick<Job, "id" | "jobReference" | "customerName" | "plannedDate" | "status" | "goodsDescription" | "plannerNotes">;
}
export interface FleetUnit {
  id: number;
  registration: string;
  vehicleClass: string;
  vehicleClassLegacy?: string;
  bodyCategory?: string;
  gvwClass?: string;
  bodyType?: string;
  onboardEquipment?: string[];
  status: string;
  notes?: string | null;
  assignedDriverId?: number | null;
  currentTrailerId?: number | null;
  yardLocation?: string | null;
  heightM?:   number | null;
  widthM?:    number | null;
  lengthM?:   number | null;
  axleLoadT?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface FleetTrailer {
  id: number;
  registration: string;
  trailerType: string;
  bodyType?: string;
  trailerLength?: string;
  decks?: number;
  compartments?: number | null;
  onboardEquipment?: string[];
  status: string;
  notes?: string | null;
  attachedUnitId?: number | null;
  linkedJobId?: number | null;
  yardLocation?: string | null;
  heightM?:   number | null;
  widthM?:    number | null;
  lengthM?:   number | null;
  axleLoadT?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobEvent {
  id: number; jobId: number; eventType: string; note: string; createdAt: string;
}
/** Canonical shape for Job template defaultJobData blobs.
 *  All field names match Job column names exactly.
 *  Run api/scripts/migrate_template_job_data.ts to backfill old templates. */
export interface TemplateJobData {
  // Identity / customer
  customerId?:          number | null;
  customerName?:        string;
  customerRef?:         string;
  serviceType?:         string;
  jobType?:             string;
  jobTitle?:            string;
  priority?:            string;
  // Booking contact
  bookingContactName?:  string;
  bookingContactPhone?: string;
  bookingContactEmail?: string;
  billingNotes?:        string;
  custRefRequired?:     boolean;
  poRequired?:          boolean;
  // Load
  goodsDescription?:    string;
  goodsType?:           string;
  quantity?:            string;
  quantityUnit?:        string;
  weight?:              string;
  volume?:              string;
  dimensions?:          string;
  fragile?:             boolean;
  stackable?:           boolean;
  tempControlled?:      boolean;
  tempRange?:           string;
  hazardClass?:         string;
  photosRequired?:      boolean;
  weighbridgeRequired?: boolean;
  securingRequirements?: string[];
  specialRequirements?:  string[];
  // Vehicle
  vehicleCategory?:     string;
  bodyTypes?:           string[];
  minGvwClass?:         string;
  equipment?:           string[];
  trailersAllowed?:     string[];
  vehicleAccessNotes?:  string;
  // Notes
  requirePOD?:          boolean;
  driverVisibleNotes?:  string;
  internalNotes?:       string;
  // Exception policy
  failureAction?:                  string;
  assistancePhone?:                string;
  assistanceNote?:                 string;
  approvalContactName?:            string;
  approvalContactPhone?:           string;
  alternativeReturnAddress?:       string;
  alternativeReturnPostcode?:      string;
  alternativeReturnContactName?:   string;
  alternativeReturnContactPhone?:  string;
}

export interface JobTemplate {
  id: number;
  name: string;
  pickupTextSnapshot: string;
  dropoffTextSnapshot: string;
  defaultReference: string;
  defaultNotes: string;
  defaultMaterialType: string;
  trailerTypesAllowed?: string[];
  defaultStops?: Record<string, unknown>[];
  defaultLoadDetails?: LoadDetails | null;
  defaultJobData?: TemplateJobData | null;
  qualityScore?: number;
  status: "active" | "archived";
  createdAt?: string;
  updatedAt?: string;
}
export interface SavedLocation {
  id: number;
  name: string;
  siteName: string;
  unitName: string;
  locationTextSnapshot: string;
  street: string;
  town: string;
  postcode: string;
  lat: number | null;
  lng: number | null;
  gateLat?: number | null;
  gateLng?: number | null;
  contactName: string;
  contactPhone: string;
  instructions: string;
  internalNotes: string;
  accessType?: string;
  accessConfidence?: string;
  createdAt?: string;
  updatedAt?: string;
}
