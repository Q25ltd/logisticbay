export type HolidayPolicySettings = {
  baseHolidayAllowanceDays: number;
  holidayYearResetMonth: number;
  holidayYearResetDay: number;
  holidayWarnDaysBefore: number;
  holidayCarryOverAllowed: boolean;
  holidayCarryOverMaxDays: number;
  holidaySeniorityEnabled: boolean;
  holidaySeniorityYears: number;
  holidaySeniorityExtraDays: number;
  holidaySeniorityMaxExtraDays: number;
};

export const defaultHolidayPolicy: HolidayPolicySettings = {
  baseHolidayAllowanceDays: 28,
  holidayYearResetMonth: 1,
  holidayYearResetDay: 1,
  holidayWarnDaysBefore: 30,
  holidayCarryOverAllowed: false,
  holidayCarryOverMaxDays: 0,
  holidaySeniorityEnabled: true,
  holidaySeniorityYears: 5,
  holidaySeniorityExtraDays: 1,
  holidaySeniorityMaxExtraDays: 5,
};
