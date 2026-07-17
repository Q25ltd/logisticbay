/**
 * Device-token registration schema (S14 notifications).
 * The driver app posts its Expo push token at login / app start.
 */
import { z } from "zod";

export const RegisterDeviceSchema = z.object({
  token:    z.string().trim().min(1, "token is required").max(200),
  platform: z.enum(["ios", "android"]).nullable().optional(),
});
