import type {
  ValidationResult,
  CreateJobBody,
  CreateTemplateBody,
  CreateLocationBody,
  CreateDriverBody,
  LoginBody,
  RegisterCompanyBody,
  ChangePasswordBody,
  UpdateJobStatusBody,
  HolidayRequestBody,
  PatchHolidayBody,
  PatchDriverStatusBody,
  CreateSegmentBody,
  CheckItem,
} from "./types/requests.js";

// ── Shared helpers ────────────────────────────────────────────────────────────

function ok(errors: string[]): ValidationResult {
  return { valid: errors.length === 0, errors };
}

function requireString(value: unknown, name: string, errors: string[]): void {
  if (!value || typeof value !== "string" || !value.trim()) {
    errors.push(`${name} is required`);
  }
}

function requireStringMinLength(value: unknown, name: string, min: number, errors: string[]): void {
  if (!value || typeof value !== "string") {
    errors.push(`${name} is required`);
  } else if (value.length < min) {
    errors.push(`${name} must be at least ${min} characters`);
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export function validateLogin(body: LoginBody): ValidationResult {
  const errors: string[] = [];
  requireString(body.email,    "email",    errors);
  requireString(body.password, "password", errors);
  return ok(errors);
}

export function validateRegisterCompany(body: RegisterCompanyBody): ValidationResult {
  const errors: string[] = [];
  requireString(body.companyName, "companyName", errors);
  requireString(body.name,        "name",        errors);
  requireString(body.email,       "email",       errors);
  requireStringMinLength(body.password, "password", 8, errors);
  if (body.password !== body.confirmPassword) errors.push("passwords do not match");
  return ok(errors);
}

export function validateChangePassword(body: ChangePasswordBody): ValidationResult {
  const errors: string[] = [];
  requireString(body.currentPassword, "currentPassword", errors);
  requireStringMinLength(body.newPassword, "newPassword", 8, errors);
  return ok(errors);
}

// kept for backwards compat — real driver creation validation uses validateCreateDriver below
export function validateCompanyRegister(body: any): ValidationResult {
  return validateRegisterCompany(body as RegisterCompanyBody);
}

// ── Drivers ───────────────────────────────────────────────────────────────────

export function validateCreateDriver(body: CreateDriverBody): ValidationResult {
  const errors: string[] = [];
  requireString(body.displayName, "displayName", errors);
  return ok(errors);
}

export function validatePatchDriverStatus(body: PatchDriverStatusBody): ValidationResult {
  const errors: string[] = [];
  if (!["active", "inactive"].includes(body.status)) {
    errors.push("status must be 'active' or 'inactive'");
  }
  return ok(errors);
}

// ── Locations ─────────────────────────────────────────────────────────────────

export function validateCreateLocation(body: CreateLocationBody): ValidationResult {
  const errors: string[] = [];
  requireString(body.name,        "name",        errors);
  requireString(body.addressText, "addressText", errors);
  return ok(errors);
}

// ── Job templates ─────────────────────────────────────────────────────────────

export function validateCreateTemplate(body: CreateTemplateBody): ValidationResult {
  const errors: string[] = [];
  requireString(body.name, "name", errors);
  const hasPickup  = body.pickupLocationId  || body.pickupTextSnapshot?.trim();
  const hasDropoff = body.dropoffLocationId || body.dropoffTextSnapshot?.trim();
  if (!hasPickup)  errors.push("pickup location is required");
  if (!hasDropoff) errors.push("dropoff location is required");
  return ok(errors);
}

// ── Jobs ──────────────────────────────────────────────────────────────────────

export function validateCreateJob(body: CreateJobBody): ValidationResult {
  const errors: string[] = [];
  if (body.plannedDate !== undefined && !body.plannedDate.trim()) {
    errors.push("plannedDate must not be empty");
  }
  if (!body.plannedDate && body.saveMode !== "draft") errors.push("plannedDate is required");
  return ok(errors);
}

const VALID_JOB_STATUSES = [
  "pending", "accepted", "in_progress", "arrived_pickup",
  "collected", "arrived_dropoff", "completed", "cancelled",
];

export function validateUpdateJobStatus(body: UpdateJobStatusBody): ValidationResult {
  const errors: string[] = [];
  if (!body.status) {
    errors.push("status is required");
  } else if (!VALID_JOB_STATUSES.includes(body.status)) {
    errors.push(`status must be one of: ${VALID_JOB_STATUSES.join(", ")}`);
  }
  return ok(errors);
}

export function validateAddJobNote(body: { note?: string }): ValidationResult {
  const errors: string[] = [];
  requireString(body.note, "note", errors);
  return ok(errors);
}

// ── Shifts ────────────────────────────────────────────────────────────────────

export function validateSegmentChecks(
  checks: CheckItem[],
  allowedKeys: string[],
  name: string,
): string[] {
  const errors: string[] = [];
  if (!Array.isArray(checks)) {
    errors.push(`${name} must be an array`);
    return errors;
  }
  checks.forEach((c, i) => {
    if (!allowedKeys.includes(c.key)) {
      errors.push(`${name}[${i}]: unknown key "${c.key}"`);
    }
    const isFail = c.result === "fail" || c.ok === false;
    if (isFail && !c.note?.trim()) {
      errors.push(`${name}[${i}]: note required when check fails (${c.key})`);
    }
  });
  return errors;
}

export function validateCreateSegment(body: CreateSegmentBody): ValidationResult {
  const errors: string[] = [];
  if (!body.truckReg?.trim()) errors.push("truckReg is required");
  return ok(errors);
}

// ── Availability ──────────────────────────────────────────────────────────────

export function validateHolidayRequest(body: HolidayRequestBody): ValidationResult {
  const errors: string[] = [];
  if (!body.startDate) errors.push("startDate is required");
  if (!body.endDate)   errors.push("endDate is required");
  if (body.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(body.startDate)) errors.push("startDate must be YYYY-MM-DD");
  if (body.endDate   && !/^\d{4}-\d{2}-\d{2}$/.test(body.endDate))   errors.push("endDate must be YYYY-MM-DD");
  if (body.startDate && body.endDate && body.startDate > body.endDate) errors.push("startDate must be on or before endDate");
  return ok(errors);
}

export function validatePatchHoliday(body: PatchHolidayBody): ValidationResult {
  const errors: string[] = [];
  if (!["approved", "rejected"].includes(body.status)) {
    errors.push("status must be 'approved' or 'rejected'");
  }
  return ok(errors);
}
