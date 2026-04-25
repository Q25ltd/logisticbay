const LABELS: Record<string,string> = {
  pending:"Pending", accepted:"Accepted", in_progress:"In Progress",
  arrived_pickup:"At Pickup", completed:"Completed", cancelled:"Cancelled",
  active:"Active", inactive:"Inactive",
};
export function Badge({ status, label }: { status: string; label?: string }) {
  return <span className={"badge badge-" + status}>{label ?? LABELS[status] ?? status}</span>;
}
