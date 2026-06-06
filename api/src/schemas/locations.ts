import { z } from "zod";

const LocationFields = z.object({
  name:                  z.string().min(1, "Name is required").max(300).optional(),
  siteName:              z.string().max(200).optional(),
  unitName:              z.string().max(64).optional(),
  addressText:           z.string().max(4000).optional(),
  locationTextSnapshot:  z.string().max(4000).optional(),
  street:                z.string().max(4000).optional(),
  town:                  z.string().max(200).optional(),
  postcode:              z.string().max(16).optional(),
  latitude:              z.number().min(-90).max(90).nullable().optional(),
  longitude:             z.number().min(-180).max(180).nullable().optional(),
  lat:                   z.number().min(-90).max(90).nullable().optional(),
  lng:                   z.number().min(-180).max(180).nullable().optional(),
  gateLat:               z.number().min(-90).max(90).nullable().optional(),
  gateLng:               z.number().min(-180).max(180).nullable().optional(),
  contactName:           z.string().max(200).optional(),
  contactPhone:          z.string().max(32).optional(),
  instructions:          z.string().max(4000).optional(),
  internalNotes:         z.string().max(4000).optional(),
  notes:                 z.string().max(4000).optional(),
});

export const CreateLocationSchema = LocationFields.extend({
  name: z.string().min(1, "Name is required").max(300),
});

export const PatchLocationSchema = LocationFields;

export type CreateLocationBody = z.infer<typeof CreateLocationSchema>;
export type PatchLocationBody  = z.infer<typeof PatchLocationSchema>;
