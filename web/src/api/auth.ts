import { api, setToken, clearToken } from "./client";
import type { User } from "../types";

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: User;
};

function storeAuthSession(data: AuthResponse) {
  setToken(data.accessToken);
  localStorage.setItem("lb_refresh_token", data.refreshToken);
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
}) {
  const data = await api.post<AuthResponse>("/auth/register-company", form);
  storeAuthSession(data);
  return data;
}

export async function getMe(): Promise<User> {
  return api.get<User>("/auth/me");
}

export function logout() {
  clearToken();
}
