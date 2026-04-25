export interface User {
  id: number; name: string; email: string;
  companyId: number; companyName: string;
  role: "company_owner" | "planner" | "driver";
}
export interface Driver {
  id: number; companyId: number; userId: number | null;
  displayName: string; employeeNumber: string | null;
  phoneNumber: string | null; status: "active" | "inactive";
  user?: { id: number; email: string; name: string } | null;
}
export interface PlannedJob {
  id: number; companyId: number; assignedDriverId: number;
  plannedDate: string; pickupTextSnapshot: string; dropoffTextSnapshot: string;
  referenceNumber: string; materialType: string; quantityExpected: string;
  quantityUnit: string; plannerNotes: string;
  status: "pending" | "accepted" | "in_progress" | "arrived_pickup" | "completed" | "cancelled";
  assignedDriver?: Driver; events?: JobEvent[];
  createdAt: string; updatedAt: string;
}
export interface JobEvent {
  id: number; jobId: number; eventType: string; note: string; createdAt: string;
}
export interface JobTemplate {
  id: number; name: string; pickupTextSnapshot: string; dropoffTextSnapshot: string;
  defaultReference: string; defaultNotes: string; defaultMaterialType: string;
  status: "active" | "archived";
}
export interface SavedLocation {
  id: number; name: string; addressText: string; postcode: string; notes: string;
}
