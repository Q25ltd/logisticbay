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
  status: "active" | "inactive";
  user?: { id: number; email: string; name: string; status?: string } | null;
}
export interface JobStop {
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
}

export interface PlannedJob {
  id: number; companyId: number; assignedDriverId: number | null;
  customerId?: number | null;
  customerName?: string;
  customer?: Customer | null;
  plannedDate: string | null; pickupTextSnapshot: string; dropoffTextSnapshot: string;
  referenceNumber: string; materialType: string; quantityExpected: string;
  quantityUnit: string; plannerNotes: string;
  assignedTruck?: string;
  assignedTrailer?: string;
  vehicleClass?: string;
  vehicleClassRequired?: string;
  trailerTypesAllowed?: string[];
  trailerTypesForbidden?: string[];
  equipmentRequired?: string[];
  driverQualificationsReq?: string[];
  priority?: "low" | "normal" | "high";
  serviceType?: string;
  jobType?: string;
  jobTitle?: string;
  customerRef?: string;
  purchaseOrderNumber?: string;
  bookingContactName?: string;
  bookingContactPhone?: string;
  bookingContactEmail?: string;
  customerInstructions?: string;
  minVehicleSize?: string;
  heightRestriction?: string;
  weightRestriction?: string;
  lengthRestriction?: string;
  vehicleAccessNotes?: string;
  failureAction?: string;
  assistancePhone?: string;
  assistanceNote?: string;
  returnDestination?: string;
  altAddress?: unknown;
  internalNotes?: string;
  requireCollection?: boolean;
  requirePOD?: boolean;
  requireDeliveryQty?: boolean;
  validationStatus?: "draft" | "needs_info" | "ready_to_plan" | "planned";
  qualityScore?: number;
  stops?: JobStop[];
  loadDetails?: LoadDetails | null;
  status: "pending" | "accepted" | "in_progress" | "arrived_pickup" | "collected" | "arrived_dropoff" | "completed" | "cancelled";
  assignedDriver?: Driver | null; events?: JobEvent[];
  createdAt: string; updatedAt: string;
}
export interface FleetUnit {
  id: number;
  registration: string;
  vehicleClass: string;
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
export interface JobTemplate {
  id: number; name: string; pickupTextSnapshot: string; dropoffTextSnapshot: string;
  defaultReference: string; defaultNotes: string; defaultMaterialType: string;
  trailerTypesAllowed?: string[];
  defaultStops?: JobStop[];
  defaultLoadDetails?: LoadDetails | null;
  qualityScore?: number;
  status: "active" | "archived";
}
export interface SavedLocation {
  id: number;
  name: string;
  siteName: string;
  unitName: string;
  addressText: string;
  street: string;
  town: string;
  postcode: string;
  latitude: number | null;
  longitude: number | null;
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
