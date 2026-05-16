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
}

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

export interface PlannedJob {
  id:          number;
  companyId:   number;
  customerId?: number | null;
  customerName?: string;
  customer?:   Customer | null;
  jobReference?: string | null;
  templateId?: number | null;
  plannedDate: string | null;
  materialType:    string;
  quantityExpected: string;
  quantityUnit:    string;
  plannerNotes:    string;
  reqBodyCategory?: string;
  reqGvwMin?:       string;
  reqBodyType?:     string;
  reqEquipment?:    string[];
  reqLicenceClass?: string;
  trailerTypesAllowed?: string[];
  equipmentRequired?:   string[];
  driverQualificationsReq?: string[];
  priority?:           "low" | "normal" | "high";
  serviceType?:        string;
  customerRef?:        string;
  purchaseOrderNumber?: string;
  billingNotes?:       string;
  customerInstructions?: string;
  custRefRequired?: boolean;
  poRequired?:      boolean;
  minVehicleSize?:  string;
  lengthRestriction?: string;
  vehicleAccessNotes?: string;
  failureAction?:   string;
  assistancePhone?: string;
  assistanceNote?:  string;
  internalNotes?:   string;
  requirePOD?:      boolean;
  canSplitShipment?: string;
  validationStatus?: "draft" | "needs_info" | "ready_to_plan" | "ready_for_planner" | "planned";
  qualityScore?:    number;
  // Vehicle/trailer requirement sources
  vehicleRequirementSource?: string;
  trailerRequirementSource?: string;
  customerVehicleType?:      string | null;
  customerTrailerTypes?:     string[] | null;
  derivedVehicleType?:       string | null;
  derivedTrailerTypes?:      string[] | null;
  finalVehicleType?:         string | null;
  finalTrailerTypes?:        string[] | null;
  // Override close
  overrideClosed?:              boolean;
  overrideReason?:              string | null;
  overrideQuantityDelivered?:   number | null;
  closedAt?:                    string | null;
  stops?:       JobPart[];
  loadDetails?: LoadDetails | null;
  events?:      JobEvent[];
  status: "draft" | "accepted" | "in_progress" | "arrived_pickup" | "collected" | "arrived_dropoff" | "completed" | "cancelled";
  createdAt: string;
  updatedAt: string;

  // Planning status — computed from RunAssignments, not stored
  planningStatus?: "no_stops" | "not_planned" | "partially_planned" | "planned" | "partially_done" | "done";

  // ── Fields removed from DB (Phase 1) — kept here so web UI compiles ──────
  // These are no longer returned by the API. UI components should migrate to
  // reading assignedDriverId/assignedTruck/assignedTrailer from Run instead.
  /** @deprecated Use Run.assignedDriverId */       assignedDriverId?: number | null;
  /** @deprecated Use Run.assignedDriverId */       assignedDriver?:   Driver | null;
  /** @deprecated Use Run.assignedTruckId */        assignedTruck?:    string;
  /** @deprecated Use Run.assignedTrailerId */      assignedTrailer?:  string;
  /** @deprecated Field removed */                  vehicleClass?:     string;
  /** @deprecated Use reqBodyCategory */            vehicleClassRequired?: string;
  /** @deprecated Removed — use JobPart.referenceNumber */ referenceNumber?: string;
  /** @deprecated Removed */                        bookingContactName?:  string;
  /** @deprecated Removed */                        bookingContactPhone?: string;
  /** @deprecated Removed */                        bookingContactEmail?: string;
  /** @deprecated Removed */                        jobType?:            string;
  /** @deprecated Removed */                        jobTitle?:           string;
  /** @deprecated Removed */                        heightRestriction?:  string;
  /** @deprecated Removed */                        weightRestriction?:  string;
  /** @deprecated Removed */                        returnDestination?:  string;
  /** @deprecated Removed */                        requireCollection?:  boolean;
  /** @deprecated Removed */                        requireDeliveryQty?: boolean;
  /** @deprecated Removed — use first/last JobPart.locationTextSnapshot */ pickupTextSnapshot?:  string;
  /** @deprecated Removed — use first/last JobPart.locationTextSnapshot */ dropoffTextSnapshot?: string;
}

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
  job?: Pick<PlannedJob, "id" | "jobReference" | "customerName" | "plannedDate" | "status" | "materialType" | "plannerNotes">;
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
  createdAt: string;
  updatedAt: string;
}

export interface JobEvent {
  id: number; jobId: number; eventType: string; note: string; createdAt: string;
}
export interface TemplateJobData {
  customerId?: number | null;
  customerName?: string;
  serviceType?: string;
  jobType?: string;
  jobTitle?: string;
  priority?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  billingNotes?: string;
  // canonical names
  customerInstructions?: string;
  requirePOD?: boolean;
  materialType?: string;
  quantity?: string;
  unit?: string;
  unitOther?: string;
  weight?: string;
  forkliftRequired?: boolean;
  tailLiftRequired?: boolean;
  craneRequired?: boolean;
  weighbridgeRequired?: boolean;
  vehicleClass?: string;
  vehicleClassOther?: string;
  trailerTypesAllowed?: string[];
  vehicleAccessNotes?: string;
  // legacy names kept for backward compat reading of old templates
  custInstructions?: string;
  custRefRequired?: boolean;
  poRequired?: boolean;
  materialDesc?: string;
  totalQty?: string;
  qtyUnit?: string;
  qtyUnitOther?: string;
  totalWeight?: string;
  forkliftReq?: boolean;
  tailLiftReq?: boolean;
  craneReq?: boolean;
  weighbridgeReq?: boolean;
  podRequired?: boolean;
  vehicleType?: string;
  vehicleTypeOther?: string;
  minSize?: string;
  trailersAllowed?: string[];
  equipmentReq?: string[];
  driverQuals?: string[];
  accessNotes?: string;
  // always present
  volume?: string;
  dimensions?: string;
  adrClass?: string;
  fragile?: boolean;
  stackable?: boolean;
  tempControlled?: boolean;
  tempRange?: string;
  loadingMethod?: string;
  unloadingMethod?: string;
  loadNotes?: string;
  photosRequired?: boolean;
  reqBodyCategory?: string;
  reqGvwMin?: string;
  reqBodyType?: string;
  reqEquipment?: string[];
  reqLicenceClass?: string;
  reqEndorsements?: string[];
  trailerLength?: string;
  heightRestriction?: string;
  weightRestriction?: string;
  lengthRestriction?: string;
  assignedTruck?: string;
  assignedTrailer?: string;
  failureAction?: string;
  assistancePhone?: string;
  assistanceNote?: string;
  returnDestination?: string;
  altAddress?: Record<string, unknown> | null;
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
