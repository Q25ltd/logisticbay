export const VEHICLE_CLASSES = [
  "Van", "Rigid", "Artic unit", "Tipper", "Grab", "Mixer", "HIAB", "Refrigerated", "Other",
];

export const TRAILER_TYPES = [
  "Curtain sider", "Flatbed", "Box", "Tipper", "Tanker", "Low loader", "Skeletal",
  "Refrigerated trailer", "Other",
];

export const UNIT_STATUSES    = ["available", "assigned", "vor"] as const;
export const TRAILER_STATUSES = ["available", "assigned", "loaded", "vor"] as const;
