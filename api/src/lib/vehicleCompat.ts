import { DRIVER_LICENCE_CLASSES } from "../constants/jobCreation.js";

export function legacyVehicleToRequirement(value: unknown) {
  const source = typeof value === "string" ? value.trim() : "";
  const v = source.toLowerCase();
  if (v === "van") return { bodyCategory: "van", bodyType: "panel", equipment: [] as string[], licenceClass: "B" };
  if (v === "artic" || /^class\s*1$/.test(v)) return { bodyCategory: "tractor", bodyType: "", equipment: [] as string[], licenceClass: "CE" };
  if (/^class\s*2$/.test(v) || v === "rigid") return { bodyCategory: "rigid", bodyType: "", equipment: [] as string[], licenceClass: "C" };
  if (v === "tipper") return { bodyCategory: "rigid", bodyType: "tipper", equipment: [] as string[], licenceClass: "C" };
  if (v === "grab") return { bodyCategory: "rigid", bodyType: "tipper", equipment: ["hiab_crane"], licenceClass: "C" };
  if (v === "mixer") return { bodyCategory: "rigid", bodyType: "mixer", equipment: [] as string[], licenceClass: "C" };
  if (v === "hiab") return { bodyCategory: "rigid", bodyType: "flatbed", equipment: ["hiab_crane"], licenceClass: "C" };
  if (v === "refrigerated") return { bodyCategory: "rigid", bodyType: "fridge", equipment: ["fridge_unit"], licenceClass: "C" };
  if (v === "other" || v.startsWith("other:")) return { bodyCategory: "rigid", bodyType: "other", equipment: [] as string[], licenceClass: "C" };
  return { bodyCategory: "", bodyType: "", equipment: [] as string[], licenceClass: "" };
}

export function normalizeEquipment(values: unknown, fallback: string[] = []): string[] {
  const list = Array.isArray(values) ? values : fallback;
  const map: Record<string, string> = {
    crane: "hiab_crane",
    tail_lift: "tail_lift",
    forklift: "forklift",
    pallet_truck: "pallet_truck",
    straps: "straps",
    chains: "chains",
    sheeting: "sheeting",
    pump: "pump",
  };
  return [...new Set(list.map(v => map[String(v)] ?? String(v)).filter(Boolean))];
}

export function normalizeShiftVehicleClass(value: unknown): string {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "van") return "van";
  if (text === "rigid" || /^class\s*2$/.test(text)) return "rigid";
  if (text === "tractor" || text === "artic" || /^class\s*1$/.test(text)) return "tractor";
  return "tractor";
}

export function canDriveCategoriesForLicence(licenceClass: unknown): string[] {
  if (typeof licenceClass !== "string" || !licenceClass) return [];
  return [...(DRIVER_LICENCE_CLASSES.find(l => l.value === licenceClass)?.drives ?? [])];
}
