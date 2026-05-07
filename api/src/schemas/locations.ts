import { z } from "zod";

const LocationFields = z.object({
  name:                  z.string().min(1, "Name is required").max(300).optional(),
  siteName:              z.string().optional(),
  unitName:              z.string().optional(),
  addressText:           z.string().optional(),
  locationTextSnapshot:  z.string().optional(),
  street:                z.string().optional(),
  town:                  z.string().optional(),
  postcode:              z.string().optional(),
  latitude:              z.number().min(-90).max(90).nullable().optional(),
  longitude:             z.number().min(-180).max(180).nullable().optional(),
  lat:                   z.number().min(-90).max(90).nullable().optional(),
  lng:                   z.number().min(-180).max(180).nullable().optional(),
  gateLat:               z.number().min(-90).max(90).nullable().optional(),
  gateLng:               z.number().min(-180).max(180).nullable().optional(),
  contactName:           z.string().optional(),
  contactPhone:          z.string().optional(),
  instructions:          z.string().optional(),
  internalNotes:         z.string().optional(),
  notes:                 z.string().optional(),
});

export const CreateLocationSchema = LocationFields.extend({
  name: z.string().min(1, "Name is required").max(300),
});

export const PatchLocationSchema = LocationFields;

export type CreateLocationBody = z.infer<typeof CreateLocationSchema>;
export type PatchLocationBody  = z.infer<typeof PatchLocationSchema>;
