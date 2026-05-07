import { z } from "zod";

const Pref = z.enum(["normal", "early", "late", "short", "overtime", "unavailable"]).or(z.string());

export const SetAvailabilitySchema = z.object({
  weekStart: z.string().optional(),
  monPref:   Pref.optional(), tuePref: Pref.optional(), wedPref: Pref.optional(),
  thuPref:   Pref.optional(), friPref: Pref.optional(), satPref: Pref.optional(),
  sunPref:   Pref.optional(),
  monNote:   z.string().optional(), tueNote: z.string().optional(), wedNote: z.string().optional(),
  thuNote:   z.string().optional(), friNote: z.string().optional(), satNote: z.string().optional(),
  sunNote:   z.string().optional(),
});

export const SetShiftPreferenceSchema = z.object({
  preferenceType:  z.string().optional(),
  requestedHours:  z.number().min(0).max(24).optional(),
  finishByTime:    z.string().optional(),
  shortDayReason:  z.string().optional(),
  shortDayNote:    z.string().optional(),
  overtimeHours:   z.number().min(0).max(24).optional(),
  startTime:       z.string().optional(),
  gpsLat:          z.number().min(-90).max(90).optional(),
  gpsLng:          z.number().min(-180).max(180).optional(),
});

export const HolidayRequestSchema = z.object({
  startDate: z.string().min(1, "Start date is required"),
  endDate:   z.string().min(1, "End date is required"),
  reason:    z.string().optional(),
  note:      z.string().optional(),
});

export const PatchHolidaySchema = z.object({
  status:      z.enum(["approved", "rejected"]),
  plannerNote: z.string().optional(),
});

export type SetAvailabilityBody     = z.infer<typeof SetAvailabilitySchema>;
export type SetShiftPreferenceBody  = z.infer<typeof SetShiftPreferenceSchema>;
export type HolidayRequestBody      = z.infer<typeof HolidayRequestSchema>;
export type PatchHolidayBody        = z.infer<typeof PatchHolidaySchema>;
