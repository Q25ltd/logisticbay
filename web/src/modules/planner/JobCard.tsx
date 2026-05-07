import type { PlannerStatus } from "./dashboardTypes";
import type { JobContext } from "./dashboardTypes";
import { STATUS_CLASSES, STATUS_LABELS } from "./dashboardConstants";
import { isClosed, loadedTrailerStandingText, warningDot } from "./dashboardUtils";

function statusBadge(status: PlannerStatus) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${STATUS_CLASSES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export default function JobCard({
  context,
  onAssign,
  onDetails,
  onQuickFix,
}: {
  context: JobContext;
  onAssign: () => void;
  onDetails: () => void;
  onQuickFix: () => void;
}) {
  const critical = context.warnings.filter((warning) => warning.level === "critical").length;
  const warnings = context.warnings.filter((warning) => warning.level === "warning").length;
  const hasFix = context.warnings.some((warning) => warning.fix);

  return (
    <div className={`card p-3 ${critical ? "border-l-4 border-l-red-500" : warnings ? "border-l-4 border-l-amber-400" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold uppercase text-slate-700">
              {context.customer}
            </span>
            {context.isCarriedOver && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-bold text-orange-800">Carried over</span>}
            {context.loadedTrailer && (
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-bold text-purple-800">
                Loaded {context.loadedTrailer.registration} | {loadedTrailerStandingText(context.loadedTrailer)}
              </span>
            )}
          </div>
          <div className="mt-1 truncate text-sm font-black text-primary">{context.route}</div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            <span>{context.load}</span>
            <span>{context.vehicle}</span>
            <span>{context.timeRange}</span>
            <span>{context.stopCount}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {statusBadge(context.status)}
            {context.assignedDriver && <span className="text-xs text-slate-600">Driver: {context.assignedDriver.displayName}</span>}
            {critical + warnings > 0 && (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${critical ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
                {critical + warnings} issue{critical + warnings > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {!isClosed(context.job) && (
            <button type="button" onClick={onAssign} className="btn btn-primary px-3 py-1.5 text-xs">
              Assign driver
            </button>
          )}
          <button type="button" onClick={onDetails} className="btn btn-outline px-3 py-1.5 text-xs">
            View details
          </button>
          {hasFix && (
            <button type="button" onClick={onQuickFix} className="text-xs font-semibold text-amber-700 hover:underline">
              Quick fix
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
