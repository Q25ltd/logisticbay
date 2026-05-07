export function statusBadgeClass(status: string): string {
  switch (status) {
    case "available": return "badge badge-active";
    case "assigned":  return "badge badge-accepted";
    case "loaded":    return "badge badge-in_progress";
    case "vor":       return "badge badge-cancelled";
    default:          return "badge badge-cancelled";
  }
}

export function statusLabel(status: string): string {
  return status === "vor" ? "VOR" : status.charAt(0).toUpperCase() + status.slice(1);
}
