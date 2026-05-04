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
  user?: { id: number; email: string; name: string } | null;
}
export interface JobStop {
  id?: number;
  sequenceNumber: number;
  type: "pickup" | "dropoff" | "handover" | "yard" | "depot";
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
  contactName?: string;
  contactPhone?: string;
  referenceNumber?: string;
  instructions?: string;
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
  priority?: "low" | "normal" | "high";
  serviceType?: string;
  internalNotes?: string;
  validationStatus?: "draft" | "needs_info" | "ready_to_plan" | "planned";
  qualityScore?: number;
  stops?: JobStop[];
  loadDetails?: LoadDetails | null;
  status: "pending" | "accepted" | "in_progress" | "arrived_pickup" | "collected" | "arrived_dropoff" | "completed" | "cancelled";
  assignedDriver?: Driver | null; events?: JobEvent[];
  createdAt: string; updatedAt: string;
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
