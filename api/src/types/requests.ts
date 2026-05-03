/**
 * Typed request body interfaces for every POST / PATCH route.
 *
 * Using these instead of `body as any` means TypeScript catches typos at
 * compile time and routes stay self-documenting.
 */

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginBody {
  email:      string;
  password:   string;
  pin?:       string;
  companyId?: string;
}

export interface RefreshBody {
  refreshToken: string;
}

export interface ChangePasswordBody {
  currentPassword: string;
  newPassword:     string;
}

// ── Company registration / management ────────────────────────────────────────

export interface RegisterCompanyBody {
  companyName:     string;
  name:            string;
  email:           string;
  password:        string;
  confirmPassword: string;
}

export interface PatchCompanyBody {
  name?:                string;
  reportEmail?:         string;
  reportEmailEnabled?:  boolean;
}

// ── Drivers ───────────────────────────────────────────────────────────────────

export interface CreateDriverBody {
  displayName:    string;
  email?:         string;
  employeeNumber?: string;
  phoneNumber?:   string;
}

export interface PatchDriverBody {
  displayName?:    string;
  employeeNumber?: string;
  phoneNumber?:    string;
}

export interface PatchDriverStatusBody {
  status: "active" | "inactive";
}

// ── Locations ─────────────────────────────────────────────────────────────────

export interface CreateLocationBody {
  name:        string;
  addressText: string;
  postcode?:   string;
  notes?:      string;
  latitude?:   number;
  longitude?:  number;
}

export interface PatchLocationBody {
  name?:        string;
  addressText?: string;
  postcode?:    string;
  notes?:       string;
}

// ── Job templates ─────────────────────────────────────────────────────────────

export interface CreateTemplateBody {
  name:                 string;
  pickupLocationId?:    number;
  dropoffLocationId?:   number;
  pickupTextSnapshot?:  string;
  dropoffTextSnapshot?: string;
  defaultReference?:    string;
  defaultNotes?:        string;
  defaultMaterialType?: string;
}

export interface PatchTemplateBody {
  name?:                string;
  defaultReference?:    string;
  defaultNotes?:        string;
  defaultMaterialType?: string;
  status?:              string;
}

// ── Jobs ──────────────────────────────────────────────────────────────────────

export interface JobStopInput {
  sequenceNumber:        number;
  type:                  string;
  savedLocationId?:      number | null;
  locationTextSnapshot:  string;
  lat?:                  number | null;
  lng?:                  number | null;
  gateLat?:              number | null;
  gateLng?:              number | null;
  timeWindowStart?:      string | null;
  timeWindowEnd?:        string | null;
  contactName?:          string;
  contactPhone?:         string;
  referenceNumber?:      string;
  instructions?:         string;
}

export interface LoadDetailsInput {
  quantity?:     number | string | null;
  unit?:         string;
  weight?:       number | string | null;
  volume?:       number | string | null;
  materialType?: string;
  hazardClass?:  string;
  notes?:        string;
}

export interface CreateJobBody {
  assignedDriverId?:     number;
  plannedDate?:          string;
  templateId?:           number;
  pickupLocationId?:     number;
  dropoffLocationId?:    number;
  pickupTextSnapshot?:   string;
  dropoffTextSnapshot?:  string;
  referenceNumber?:      string;
  materialType?:         string;
  quantityExpected?:     string;
  quantityUnit?:         string;
  plannerNotes?:         string;
  assignedTruck?:        string;
  assignedTrailer?:      string;
  vehicleClass?:         string;
  vehicleClassRequired?: string;
  trailerTypesAllowed?:  string[];
  priority?:             number;
  serviceType?:          string;
  internalNotes?:        string;
  stops?:                JobStopInput[];
  loadDetails?:          LoadDetailsInput | null;
  saveMode?:             "draft" | "ready_to_plan";
  requireCollection?:    boolean;
  requirePOD?:           boolean;
  requireDeliveryQty?:   boolean;
  sequence?:             number;
  saveAsTemplate?:       boolean;
  templateName?:         string;
}

export interface PatchJobBody {
  assignedDriverId?:     number | null;
  plannedDate?:          string;
  pickupTextSnapshot?:   string;
  dropoffTextSnapshot?:  string;
  referenceNumber?:      string;
  materialType?:         string;
  quantityExpected?:     string;
  quantityUnit?:         string;
  plannerNotes?:         string;
  assignedTruck?:        string;
  assignedTrailer?:      string;
  vehicleClass?:         string;
  vehicleClassRequired?: string;
  trailerTypesAllowed?:  string[];
  priority?:             number;
  serviceType?:          string;
  internalNotes?:        string;
  stops?:                JobStopInput[];
  loadDetails?:          LoadDetailsInput | null;
  saveMode?:             "draft" | "ready_to_plan";
  requireCollection?:    boolean;
  requirePOD?:           boolean;
  requireDeliveryQty?:   boolean;
  sequence?:             number;
}

export interface UpdateJobStatusBody {
  status:           string;
  note?:            string;
  actualQuantity?:  string;
  actualUnit?:      string;
  collectionNote?:  string;
  podNumber?:       string;
  deliveryNote?:    string;
  clientTimestamp?: string;
  gpsLat?:          number;
  gpsLng?:          number;
}

export interface AddJobNoteBody {
  note: string;
}

// ── Shifts ────────────────────────────────────────────────────────────────────

export interface CreateShiftBody {
  shiftDate?: string;
  startTime?: string;
}

export interface CreateSegmentBody {
  truckReg:          string;
  trailerReg?:       string;
  vehicleClass?:     string;
  odometerStart?:    number;
  truckChecks?:      CheckItem[];
  trailerChecks?:    CheckItem[];
  needsTruckCheck?:  boolean;
  needsTrailerCheck?: boolean;
  prevOdometerEnd?:  number;
}

export interface CheckItem {
  key:     string;
  label?:  string;
  result?: "pass" | "fail";
  ok?:     boolean;
  note?:   string;
}

export interface CreateDeliveryBody {
  materials?:   string;
  collectFrom?: string;
  deliverTo?:   string;
  ticketNo?:    string;
  startTime?:   string;
  finishTime?:  string;
  hours?:       string;
  mileage?:     string;
  tonnes?:      string;
  kgs?:         string;
  notes?:       string;
  loadType?:    string;
  pallets?:     string;
}

export interface SubmitShiftBody {
  odometerEnd?:  number;
  segmentNotes?: string;
  nightOut?:     boolean;
  expenses?:     string;
  delaysNote?:   string;
  defectsNote?:  string;
  endTime?:      string;
  totalHours?:   string;
  breakMins?:    string | number;
  poaMins?:      string | number;
  workingMins?:  string | number;
  fuelDrawn?:    string;
  adBlueDrawn?:  string;
}

// ── Availability ──────────────────────────────────────────────────────────────

export interface SetAvailabilityBody {
  weekStart?: string;
  monPref?: string; tuePref?: string; wedPref?: string; thuPref?: string;
  friPref?: string; satPref?: string; sunPref?: string;
  monNote?: string; tueNote?: string; wedNote?: string; thuNote?: string;
  friNote?: string; satNote?: string; sunNote?: string;
}

export interface SetShiftPreferenceBody {
  preferenceType?:  string;
  requestedHours?:  number;
  finishByTime?:    string;
  shortDayReason?:  string;
  shortDayNote?:    string;
  overtimeHours?:   number;
  startTime?:       string;
  gpsLat?:          number;
  gpsLng?:          number;
}

export interface HolidayRequestBody {
  startDate: string;
  endDate:   string;
  reason?:   string;
  note?:     string;
}

export interface PatchHolidayBody {
  status:       "approved" | "rejected";
  plannerNote?: string;
}

// ── Shared ────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid:  boolean;
  errors: string[];
}
