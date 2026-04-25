import { api } from "./client";
import type { User } from "../types";

export async function login(email: string, password: string) {
  const data = await api.post<{ accessToken: string; refreshToken: string; user: User }>(
    "/auth/login", { email, password }
  );
  localStorage.setItem("lb_token", data.accessToken);
  return data;
}

export async function registerCompany(form: {
  companyName: string; name: string; email: string; password: string; confirmPassword: string;
}) {
  const data = await api.post<{ token: string; user: User }>("/auth/register-company", form);
  localStorage.setItem("lb_token", data.token);
  return data;
}

export async function getMe(): Promise<User> { return api.get<User>("/auth/me"); }
export function logout() { localStorage.removeItem("lb_token"); }
