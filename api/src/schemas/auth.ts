import { z } from "zod";

export const LoginSchema = z.object({
  email:     z.string().max(320).email("Invalid email address"),
  password:  z.string().max(200).min(1, "Password is required"),
  pin:       z.string().max(64).optional(),
  companyId: z.string().max(200).optional(),
});

export const RefreshSchema = z.object({
  refreshToken: z.string().max(64).min(1, "Refresh token is required"),
});

export const LogoutSchema = z.object({
  refreshToken: z.string().max(64).min(1, "Refresh token is required"),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().max(200).min(1, "Current password is required"),
  newPassword:     z.string().max(200).min(1, "New password is required").refine(
    v => /^\d{6}$/.test(v) || v.length >= 8,
    "PIN must be exactly 6 digits, or a password of at least 8 characters"
  ),
});

export const RegisterCompanySchema = z.object({
  companyName:     z.string().min(1).max(200),
  ticker:          z.string().min(2).max(5).regex(/^[A-Z]{2,5}$/, "Ticker must be 2–5 letters only, for example LGB."),
  name:            z.string().min(1).max(200),
  email:           z.string().max(320).email(),
  password:        z.string().max(200).min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().max(200).min(1),
}).refine(d => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export const ForgotPasswordSchema = z.object({
  email: z.string().max(320).email("Invalid email address"),
});

export const ResetPasswordSchema = z.object({
  token:       z.string().max(64).min(1, "Token is required"),
  newPassword: z.string().max(200).min(1, "New password is required").refine(
    v => /^\d{6}$/.test(v) || v.length >= 8,
    "Password must be at least 8 characters"
  ),
});

export const VerifyEmailSchema = z.object({
  token: z.string().max(64).min(1, "Token is required"),
});

export type LoginBody            = z.infer<typeof LoginSchema>;
export type RefreshBody          = z.infer<typeof RefreshSchema>;
export type LogoutBody           = z.infer<typeof LogoutSchema>;
export type ChangePasswordBody   = z.infer<typeof ChangePasswordSchema>;
export type RegisterCompanyBody  = z.infer<typeof RegisterCompanySchema>;
export type ForgotPasswordBody   = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordBody    = z.infer<typeof ResetPasswordSchema>;
export type VerifyEmailBody      = z.infer<typeof VerifyEmailSchema>;
