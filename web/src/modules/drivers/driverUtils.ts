import type { Driver } from "../../types";
import type { HolidayPolicySettings } from "./driverTypes";

export function calculateHolidayAllowance(driver: Driver, policy: HolidayPolicySettings) {
  if (driver.driverType && driver.driverType !== "permanent") return 0;

  const startDateRaw = driver.employmentStartDate;
  if (!policy.holidaySeniorityEnabled || !startDateRaw) return policy.baseHolidayAllowanceDays;

  const start = new Date(startDateRaw);
  if (Number.isNaN(start.getTime())) return policy.baseHolidayAllowanceDays;

  const today = new Date();
  let years = today.getFullYear() - start.getFullYear();
  const hasHadAnniversary =
    today.getMonth() > start.getMonth() ||
    (today.getMonth() === start.getMonth() && today.getDate() >= start.getDate());

  if (!hasHadAnniversary) years -= 1;

  const steps = policy.holidaySeniorityYears > 0 ? Math.floor(Math.max(0, years) / policy.holidaySeniorityYears) : 0;
  const extraDays = Math.min(policy.holidaySeniorityMaxExtraDays, steps * policy.holidaySeniorityExtraDays);

  return policy.baseHolidayAllowanceDays + extraDays;
}

export function nextHolidayResetDate(policy: HolidayPolicySettings) {
  const today = new Date();
  const reset = new Date(today.getFullYear(), policy.holidayYearResetMonth - 1, policy.holidayYearResetDay);
  reset.setHours(12, 0, 0, 0);

  if (reset < today) {
    reset.setFullYear(reset.getFullYear() + 1);
  }

  return reset;
}

export function daysUntil(date: Date) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}
