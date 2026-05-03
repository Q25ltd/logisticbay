import { api } from "./client";
import type { Customer } from "../types";

export const customersApi = {
  list:   (search?: string) => api.get<{ data: Customer[] }>(`/customers${search ? "?search=" + encodeURIComponent(search) : ""}`),
  get:    (id: number)      => api.get<Customer>(`/customers/${id}`),
  create: (body: { name: string; contactName?: string; contactPhone?: string; contactEmail?: string }) =>
    api.post<Customer>("/customers", body),
  update: (id: number, body: Partial<{ name: string; contactName: string; contactPhone: string; contactEmail: string; status: "active" | "archived" }>) =>
    api.patch<Customer>(`/customers/${id}`, body),
};
