import { z } from "zod";

const Pref = z.enum(["normal", "early", "late", "short", "overtime", "unavailable"]).or(z.string().max(200));

export const SetAvailabilitySchema = z.object({
  weekStart: z.string().max(200).optional(),
  monPref:   Pref.optional(), tuePref: Pref.optional(), wedPref: Pref.optional(),
  thuPref:   Pref.optional(), friPref: Pref.optional(), satPref: Pref.optional(),
  sunPref:   Pref.optional(),
  monNote:   z.string().max(4000).optional(), tueNote: z.string().max(4000).optional(), wedNote: z.string().max(4000).optional(),
  thuNote:   z.string().max(4000).optional(), friNote: z.string().max(4000).optional(), satNote: z.string().max(4000).optional(),
  sunNote:   z.string().max(4000).optional(),
});

export const SetShiftPreferenceSchema = z.object({
  preferenceType:  z.string().max(64).optional(),
  requestedHours:  z.number().min(0).max(24).optional(),
  finishByTime:    z.string().max(200).optional(),
  shortDayReason:  z.string().max(4000).optional(),
  shortDayNote:    z.string().max(4000).optional(),
  overtimeHours:   z.number().min(0).max(24).optional(),
  startTime:       z.string().max(200).optional(),
  gpsLat:          z.number().min(-90).max(90).optional(),
  gpsLng:          z.number().min(-180).max(180).optional(),
});

export const HolidayRequestSchema = z.object({
  startDate: z.string().max(200).min(1, "Start date is required"),
  endDate:   z.string().max(200).min(1, "End date is required"),
  reason:    z.string().max(4000).optional(),
  note:      z.string().max(4000).optional(),
});

export const PatchHolidaySchema = z.object({
  status:      z.enum(["approved", "rejected"]),
  plannerNote: z.string().max(4000).optional(),
});

export type SetAvailabilityBody     = z.infer<typeof SetAvailabilitySchema>;
export type SetShiftPreferenceBody  = z.infer<typeof SetShiftPreferenceSchema>;
export type HolidayRequestBody      = z.infer<typeof HolidayRequestSchema>;
export type PatchHolidayBody        = z.infer<typeof PatchHolidaySchema>;
