import { api, setAuthTokens, clearToken } from "./client";
import type { User } from "../types";

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: User;
};

type RegisterResponse =
  | { requiresVerification: true; email: string; companyId: number; userId: number }
  | (AuthResponse & { companyId: number; userId: number });

function storeAuthSession(data: AuthResponse) {
  setAuthTokens(data.accessToken, data.refreshToken);
}

export async function login(email: string, password: string) {
  const data = await api.post<AuthResponse>(
    "/auth/login", { email, password }
  );
  storeAuthSession(data);
  return data;
}

export async function registerCompany(form: {
  companyName: string; ticker: string; name: string; email: string; password: string; confirmPassword: string;
}): Promise<RegisterResponse> {
  const data = await api.post<RegisterResponse>("/auth/register-company", form);
  if ("accessToken" in data) storeAuthSession(data);
  return data;
}

export async function forgotPassword(email: string): Promise<void> {
  await api.post("/auth/forgot-password", { email });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await api.post("/auth/reset-password", { token, newPassword });
}

export async function verifyEmail(token: string): Promise<AuthResponse & { ok: boolean }> {
  const data = await api.post<AuthResponse & { ok: boolean }>("/auth/verify-email", { token });
  storeAuthSession(data);
  return data;
}

export async function getMe(): Promise<User> {
  return api.get<User>("/auth/me");
}

export function logout() {
  clearToken();
}
