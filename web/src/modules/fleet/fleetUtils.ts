export function statusBadgeClass(status: string): string {
  switch (status) {
    case "available": return "badge badge-active";
    case "assigned":  return "badge badge-accepted";
    case "loaded":    return "badge badge-in_progress";
    case "vor":       return "badge badge-cancelled";
    default:          return "badge badge-cancelled";
  }
}

const FLEET_STATUS_LABELS: Record<string, string> = {
  available:      "Available",
  assigned:       "Assigned",
  off_road:       "Off Road",
  vor:            "VOR",
  loaded:         "Loaded",
  in_use:         "In Use",
  repair:         "In Repair",
  decommissioned: "Decommissioned",
};

export function statusLabel(status: string): string {
  return FLEET_STATUS_LABELS[status] ?? (status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " "));
}
