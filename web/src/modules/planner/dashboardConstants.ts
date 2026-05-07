import type { PlannerStatus, WarningLevel } from "./dashboardTypes";

export const ACTIVE_JOB_STATUSES = new Set(["in_progress", "arrived_pickup", "collected", "arrived_dropoff"]);
export const CLOSED_JOB_STATUSES = new Set(["completed", "cancelled"]);

export const STATUS_LABELS: Record<PlannerStatus, string> = {
  draft: "Draft",
  ready_to_plan: "Ready to plan",
  needs_planning: "Needs planning",
  planned: "Planned",
  active: "In progress",
  loaded_trailer: "Loaded trailer parked",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const STATUS_CLASSES: Record<PlannerStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  ready_to_plan: "bg-blue-100 text-blue-800",
  needs_planning: "bg-amber-100 text-amber-800",
  planned: "bg-emerald-100 text-emerald-800",
  active: "bg-indigo-100 text-indigo-800",
  loaded_trailer: "bg-purple-100 text-purple-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-slate-100 text-slate-500",
};

export const WARNING_CLASSES: Record<WarningLevel, string> = {
  critical: "bg-red-50 text-red-800 border-red-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  info: "bg-blue-50 text-blue-800 border-blue-200",
};
