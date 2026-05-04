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
  name?:                         string;
  reportEmail?:                  string;
  reportEmailEnabled?:           boolean;
  holidayYearResetMonth?:        number;
  holidayYearResetDay?:          number;
  holidayWarnDaysBefore?:        number;
  maxHolidaysPerDay?:            number;
  holidayCarryOverAllowed?:      boolean;
  holidayCarryOverMaxDays?:      number;
  baseHolidayAllowanceDays?:     number;
  holidaySeniorityEnabled?:      boolean;
  holidaySeniorityYears?:        number;
  holidaySeniorityExtraDays?:    number;
  holidaySeniorityMaxExtraDays?: number;
}

// ── Drivers ───────────────────────────────────────────────────────────────────

export interface DriverHolidayInput {
  startDate: string;
  endDate: string;
  reason?: string;
  note?: string;
  status?: string;
}

export interface DriverPlanningFields {
  employmentStartDate?: string | null;
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
  preferredShiftHours?: number | string | null;
  normalWorkingDays?: string[];
  weekendAvailable?: boolean;
  nightWorkAllowed?: boolean;
  nightsOutAllowed?: boolean;
  overtimeAllowed?: boolean;
  baseLocation?: string;
  operatingArea?: string;
  avoidAreas?: string;
  plannerNotes?: string;
  holidayAllowance?: number | string;
  holidayRequests?: DriverHolidayInput[];
}

export interface CreateDriverBody extends DriverPlanningFields {
  displayName:      string;
  email?:           string;
  employeeNumber?:  string;
  phoneNumber?:     string;
  defaultTruckReg?: string;
}

export interface PatchDriverBody extends DriverPlanningFields {
  displayName?:      string;
  employeeNumber?:   string;
  phoneNumber?:      string;
  defaultTruckReg?:  string;
}

export interface PatchDriverStatusBody {
  status: "active" | "inactive";
}

// ── Locations ─────────────────────────────────────────────────────────────────

export interface CreateLocationBody {
  name:                  string;
  siteName?:              string;
  unitName?:              string;
  locationTextSnapshot?:  string;
  addressText?:           string; // compatibility alias for locationTextSnapshot
  street?:                string;
  town?:                  string;
  postcode?:              string;
  lat?:                   number | null;
  lng?:                   number | null;
  latitude?:              number | null; // compatibility alias for lat
  longitude?:             number | null; // compatibility alias for lng
  gateLat?:               number | null;
  gateLng?:               number | null;
  contactName?:           string;
  contactPhone?:          string;
  instructions?:          string;
  internalNotes?:         string;
  notes?:                 string; // compatibility alias for internalNotes
}

export interface PatchLocationBody {
  name?:                  string;
  siteName?:              string;
  unitName?:              string;
  locationTextSnapshot?:  string;
  addressText?:           string; // compatibility alias for locationTextSnapshot
  street?:                string;
  town?:                  string;
  postcode?:              string;
  lat?:                   number | null;
  lng?:                   number | null;
  latitude?:              number | null; // compatibility alias for lat
  longitude?:             number | null; // compatibility alias for lng
  gateLat?:               number | null;
  gateLng?:               number | null;
  contactName?:           string;
  contactPhone?:          string;
  instructions?:          string;
  internalNotes?:         string;
  notes?:                 string; // compatibility alias for internalNotes
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
  siteName?:             string;
  unitName?:             string;
  street?:               string;
  town?:                 string;
  postcode?:             string;
  locationTextSnapshot:  string;
  lat?:                  number | null;
  lng?:                  number | null;
  gateLat?:              number | null;
  gateLng?:              number | null;
  timeWindowStart?:      string | null;
  timeWindowEnd?:        string | null;
  bookedTime?:           string | null;
  earliestArrivalMinutes?: number | null;
  unloadingAllowanceMinutes?: number | null;
  standingChargeNote?:   string;
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
  customerId?:           number | null;
  customerName?:         string;
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
  priority?:             "low" | "normal" | "high";
  serviceType?:          "delivery" | "collection" | "transfer" | string;
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
  customerId?:           number | null;
  customerName?:         string;
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
  priority?:             "low" | "normal" | "high";
  serviceType?:          "delivery" | "collection" | "transfer" | string;
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
