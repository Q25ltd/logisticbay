/**
 * Single source of truth for job status display data — web/planner.
 *
 * When a new status is added to the backend, update this file.
 * The mobile equivalent lives at mobile/src/constants/jobStatuses.ts.
 */

export const JOB_STATUS_LABELS: Record<string, string> = {
  pending:         "Pending",
  accepted:        "Accepted",
  in_progress:     "En Route to Pickup",
  arrived_pickup:  "At Pickup",
  collected:       "Collected",
  arrived_dropoff: "At Drop-off",
  completed:       "Delivered",
  cancelled:       "Cancelled",
};

/** Tailwind class pairs for each status — use with className */
export const JOB_STATUS_CLASSES: Record<string, { bg: string; text: string }> = {
  pending:         { bg: "bg-amber-100",   text: "text-amber-800"  },
  accepted:        { bg: "bg-blue-100",    text: "text-blue-800"   },
  in_progress:     { bg: "bg-yellow-100",  text: "text-yellow-800" },
  arrived_pickup:  { bg: "bg-indigo-100",  text: "text-indigo-800" },
  collected:       { bg: "bg-pink-100",    text: "text-pink-800"   },
  arrived_dropoff: { bg: "bg-purple-100",  text: "text-purple-800" },
  completed:       { bg: "bg-green-100",   text: "text-green-800"  },
  cancelled:       { bg: "bg-gray-100",    text: "text-gray-600"   },
};

/** Driver/company status labels */
export const DRIVER_STATUS_LABELS: Record<string, string> = {
  active:   "Active",
  inactive: "Inactive",
  trial:    "Trial",
};
