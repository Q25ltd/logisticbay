import type { Driver, FleetTrailer, FleetUnit, PlannedJob } from "../../types";

export type PlannerStatus =
  | "draft"
  | "ready_to_plan"
  | "needs_planning"
  | "planned"
  | "active"
  | "loaded_trailer"
  | "completed"
  | "cancelled";

export type WarningLevel = "critical" | "warning" | "info";
export type QuickFixKind = "stop_phone" | "stop_time" | "stop_reference" | "return_instruction";

export type JobWarning = {
  level: WarningLevel;
  type: string;
  message: string;
  fix?: {
    kind: QuickFixKind;
    stopKey?: string;
  };
};

export type AssignmentInput = {
  assignedDriverId: number | null;
  assignedTruck: string;
  assignedTrailer: string;
};

export type JobContext = {
  job: PlannedJob;
  customer: string;
  route: string;
  load: string;
  vehicle: string;
  stopCount: string;
  timeRange: string;
  status: PlannerStatus;
  statusLabel: string;
  assignedDriver: Driver | null;
  assignedUnit: FleetUnit | null;
  assignedTrailer: FleetTrailer | null;
  loadedTrailer: FleetTrailer | null;
  isCarriedOver: boolean;
  warnings: JobWarning[];
};
