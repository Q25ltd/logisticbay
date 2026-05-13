import { postcodeToCoords } from "./routing.js";

export function distanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function checkEntranceDistance(postcode: string, lat: number, lng: number) {
  const center = await postcodeToCoords(postcode).catch(() => null);
  if (!center) return { distanceMiles: null as number | null, warningLevel: "ok" as const };
  const miles = distanceMiles(center.lat, center.lng, lat, lng);
  return {
    distanceMiles: Math.round(miles * 10) / 10,
    warningLevel:  (miles > 3 ? "danger" : miles > 1 ? "warn" : "ok") as "ok" | "warn" | "danger",
  };
}
