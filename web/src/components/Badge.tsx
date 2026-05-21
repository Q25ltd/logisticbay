const LABELS: Record<string, string> = {
  // Job statuses
  draft:          "Draft",
  pending_review: "Pending review",
  ready_to_plan:  "Ready to plan",
  in_planning:    "In planning",
  planned:        "Planned",
  in_progress:    "In progress",
  completed:      "Completed",
  cancelled:      "Cancelled",
  // Legacy / other
  pending:        "Pending",
  accepted:       "Accepted",
  arrived_pickup: "At pickup",
  // Generic
  active:         "Active",
  inactive:       "Inactive",
  archived:       "Archived",
};

const COLOURS: Record<string, string> = {
  draft:          "bg-slate-100 text-slate-500",
  pending_review: "bg-amber-100 text-amber-800",
  ready_to_plan:  "bg-blue-100 text-blue-700",
  in_planning:    "bg-indigo-100 text-indigo-700",
  planned:        "bg-violet-100 text-violet-700",
  in_progress:    "bg-teal-100 text-teal-800",
  completed:      "bg-green-100 text-green-800",
  cancelled:      "bg-red-100 text-red-500",
  pending:        "bg-amber-100 text-amber-700",
  accepted:       "bg-green-100 text-green-700",
  active:         "bg-green-100 text-green-700",
  inactive:       "bg-slate-100 text-slate-500",
  archived:       "bg-slate-100 text-slate-500",
};

export function Badge({ status, label }: { status: string; label?: string }) {
  const colour = COLOURS[status] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${colour}`}>
      {label ?? LABELS[status] ?? status.replace(/_/g, " ")}
    </span>
  );
}
