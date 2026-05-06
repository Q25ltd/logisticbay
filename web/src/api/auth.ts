import { api, setToken, clearToken } from "./client";
import type { User } from "../types";

export async function login(email: string, password: string) {
  const data = await api.post<{ accessToken: string; refreshToken: string; user: User }>(
    "/auth/login", { email, password }
  );
  setToken(data.accessToken);
  localStorage.setItem("lb_refresh_token", data.refreshToken);
  return data;
}

export async function registerCompany(form: {
  companyName: string; name: string; email: string; password: string; confirmPassword: string;
}) {
  const data = await api.post<{ accessToken: string; refreshToken: string; user: User }>("/auth/register-company", form);
  setToken(data.accessToken);
  localStorage.setItem("lb_refresh_token", data.refreshToken);
  return data;
}

export async function getMe(): Promise<User> {
  return api.get<User>("/auth/me");
}

export function logout() {
  clearToken();
}
