import { z } from "zod";

export const LoginSchema = z.object({
  email:     z.string().email("Invalid email address"),
  password:  z.string().min(1, "Password is required"),
  pin:       z.string().optional(),
  companyId: z.string().optional(),
});

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

export const LogoutSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword:     z.string().min(8, "New password must be at least 8 characters"),
});

export const RegisterCompanySchema = z.object({
  companyName:     z.string().min(1).max(200),
  ticker:          z.string().min(2).max(5).regex(/^[A-Z]{2,5}$/, "Ticker must be 2–5 letters only, for example LGB."),
  name:            z.string().min(1).max(200),
  email:           z.string().email(),
  password:        z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1),
}).refine(d => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export type LoginBody            = z.infer<typeof LoginSchema>;
export type RefreshBody          = z.infer<typeof RefreshSchema>;
export type LogoutBody           = z.infer<typeof LogoutSchema>;
export type ChangePasswordBody   = z.infer<typeof ChangePasswordSchema>;
export type RegisterCompanyBody  = z.infer<typeof RegisterCompanySchema>;
