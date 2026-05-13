// UK bank holidays England & Wales 2025–2026 (mirrors mobile constant)
export const BANK_HOLIDAYS = new Set([
  "2025-01-01","2025-04-18","2025-04-21","2025-05-05","2025-05-26",
  "2025-08-25","2025-12-25","2025-12-26",
  "2026-01-01","2026-04-03","2026-04-06","2026-05-04","2026-05-25",
  "2026-08-31","2026-12-25","2026-12-28",
]);

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isWorkingDay(d: Date): boolean {
  const day = d.getDay();
  if (day === 0 || day === 6) return false;
  return !BANK_HOLIDAYS.has(toISODate(d));
}

export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function checkRestPeriod(lastShiftEnd: Date, requestedStart: Date): {
  allowed: boolean;
  restHours: number;
  isReduced: boolean;
  message: string;
} {
  const restMs    = requestedStart.getTime() - lastShiftEnd.getTime();
  const restHours = restMs / (1000 * 60 * 60);

  if (restHours >= 11) {
    return { allowed: true, restHours, isReduced: false, message: "" };
  }
  if (restHours >= 9) {
    return {
      allowed:   true,
      restHours,
      isReduced: true,
      message:   `Reduced rest period (${restHours.toFixed(1)}h). Maximum 3 per week.`,
    };
  }
  return {
    allowed:   false,
    restHours,
    isReduced: false,
    message:   `Insufficient rest. You need at least 9 hours between shifts. Last shift ended at ${lastShiftEnd.toLocaleTimeString("en-GB")}. Earliest start: ${new Date(lastShiftEnd.getTime() + 9 * 60 * 60 * 1000).toLocaleTimeString("en-GB")}.`,
  };
}

export function holidayDates(input: { startDate: string; endDate: string }) {
  const start = new Date(input.startDate);
  const end   = new Date(input.endDate);
  const dates: string[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    dates.push(toISODate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  const workingDays = dates.filter(d => isWorkingDay(new Date(d)));
  return { start, end, dates, workingDays };
}
