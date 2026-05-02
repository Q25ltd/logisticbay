import { api } from "./client";

export interface Location {
  id:          number;
  name:        string;
  addressText: string;
  postcode:    string | null;
  notes:       string | null;
  latitude:    number | null;
  longitude:   number | null;
  createdAt:   string;
}

export async function listLocations(): Promise<Location[]> {
  const res = await api.get<{ data: Location[] }>("/locations");
  return res.data;
}

export async function createLocation(body: {
  name:        string;
  addressText: string;
  postcode?:   string;
  notes?:      string;
  latitude?:   number;
  longitude?:  number;
}): Promise<Location> {
  const res = await api.post<{ data: Location }>("/locations", body);
  return res.data;
}

export async function deleteLocation(id: number): Promise<void> {
  await api.delete(`/locations/${id}`);
}

export const locationsApi = { listLocations, createLocation, deleteLocation };
