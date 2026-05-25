import type { JobContext } from "./dashboardTypes";
import { WARNING_CLASSES } from "./dashboardConstants";
import {
  compactArray,
  dayKey,
  isClosed,
  loadedTrailerStandingDetail,
  shortLocation,
  sortedStops,
  stopDateTimeLabel,
  stopKey,
  warningDot,
} from "./dashboardUtils";
import { BODY_TYPES, ONBOARD_EQUIPMENT } from "../../constants/vehicleTaxonomy";

const STOP_STATUS_LABELS: Record<string, string> = {
  pending:   "Pending",
  completed: "Completed",
  skipped:   "Skipped",
  failed:    "Failed",
  arrived:   "Arrived",
  loading:   "Loading",
};

function cap(s: string): string {
  const spaced = s.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 text-sm text-primary">{value || "-"}</div>
    </div>
  );
}

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-slate-100 py-4 last:border-b-0">
      <h3 className="mb-3 text-sm font-black uppercase tracking-wide text-primary">{title}</h3>
      {children}
    </section>
  );
}

function labelFor(options: readonly { value: string; label: string }[], value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function labelArray(options: readonly { value: string; label: string }[], values?: string[] | null) {
  return compactArray(values).map((value) => labelFor(options, value)).join(", ");
}

export default function JobDetailDrawer({
  context,
  onClose,
  onAssign,
  onQuickFix,
  onEditJob,
}: {
  context: JobContext;
  onClose: () => void;
  onAssign: () => void;
  onQuickFix: () => void;
  onEditJob: () => void;
}) {
  const job = context.job;
  const fixable = context.warnings.some((warning) => warning.fix);

  return (
    <div className="fixed inset-0 z-50 flex bg-black/40">
      <div className="ml-auto flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl">
        <div className="border-b border-border p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-primary">Job details</h2>
              <p className="mt-1 text-sm text-muted">{context.route}</p>
            </div>
            <button type="button" onClick={onClose} className="btn btn-outline px-3 py-1.5 text-xs">Close</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5">
          <DrawerSection title="Job summary">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <DetailRow label="Customer" value={context.customer} />
              <DetailRow label="Planning date" value={dayKey(job.plannedDate) || "Unplanned"} />
              <DetailRow label="Status" value={context.statusLabel} />
              <DetailRow label="Reference" value={job.customerRef} />
              <DetailRow label="Service type" value={job.serviceType} />
              <DetailRow label="Job type" value={job.jobType} />
              <DetailRow label="Job title" value={job.jobTitle} />
              <DetailRow label="POD required" value={job.requirePOD ? "Yes" : "No"} />
            </div>
          </DrawerSection>

          <DrawerSection title="Stops">
            <div className="space-y-2">
              {sortedStops(job).map((stop) => (
                <div key={stopKey(stop)} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold uppercase text-slate-700">{cap(stop.type)}</span>
                    <span className="text-sm font-bold text-primary">{shortLocation(stop, stop.locationTextSnapshot)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                    <DetailRow label="City/postcode" value={[stop.town, stop.postcode].filter(Boolean).join(" ")} />
                    <DetailRow label="Date/time" value={stopDateTimeLabel(stop)} />
                    <DetailRow label="Quantity" value={stop.numPallets != null ? `${stop.numPallets} pallets` : ""} />
                    <DetailRow label="Reference" value={stop.referenceNumber || stop.bookingRef} />
                    <DetailRow label="Contact phone" value={stop.contactPhone} />
                    <DetailRow label="Driver notes" value={stop.instructions ? "Yes" : "No"} />
                    <DetailRow label="Navigation notes" value={stop.navigationInstructions ? "Yes" : "No"} />
                    <DetailRow label="Status" value={stop.status ? (STOP_STATUS_LABELS[stop.status] ?? cap(stop.status)) : undefined} />
                  </div>
                </div>
              ))}
              {sortedStops(job).length === 0 && <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-muted">No structured stops available.</div>}
            </div>
          </DrawerSection>

          <DrawerSection title="Load">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <DetailRow label="Goods/material" value={job.goodsDescription || (job.goodsType ? cap(job.goodsType) : undefined)} />
              <DetailRow label="Total quantity" value={job.quantity != null ? `${job.quantity}${job.quantityUnit ? " " + cap(job.quantityUnit) : ""}` : ""} />
              <DetailRow label="Total weight" value={job.weight != null ? `${job.weight}` : ""} />
              <DetailRow label="Per-stop allocation" value={sortedStops(job).some((stop) => stop.numPallets != null) ? "Present" : "Missing/unused"} />
              <DetailRow label="POD required" value={job.requirePOD ? "Yes" : "No"} />
              <DetailRow label="Temperature" value={job.tempControlled ? job.tempRange || "Controlled" : "No"} />
            </div>
          </DrawerSection>

          <DrawerSection title="Return instructions">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <DetailRow label="Selected instruction" value={job.failureAction} />
              <DetailRow label="Assistance number" value={job.assistancePhone} />
              <DetailRow label="Assistance note" value={job.assistanceNote} />
            </div>
          </DrawerSection>

          <DrawerSection title="Vehicle/trailer requirements">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <DetailRow label="Vehicle type" value={context.vehicle} />
              <DetailRow label="Trailer allowed" value={labelArray(BODY_TYPES, job.trailersAllowed)} />
              <DetailRow label="Equipment" value={labelArray(ONBOARD_EQUIPMENT, job.equipment)} />
              <DetailRow label="Access notes" value={job.vehicleAccessNotes} />
            </div>
          </DrawerSection>

          <DrawerSection title="Assignment">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <DetailRow label="Driver" value={context.assignedDriver?.displayName} />
              <DetailRow label="Unit" value={job.assignedTruck || context.assignedUnit?.registration} />
              <DetailRow label="Linked trailer" value={context.loadedTrailer?.registration || job.assignedTrailer || context.assignedTrailer?.registration} />
              <DetailRow label="Trailer standing" value={context.loadedTrailer ? loadedTrailerStandingDetail(context.loadedTrailer) : ""} />
              <DetailRow label="Validation" value={context.warnings.length ? `${context.warnings.length} issue(s)` : "Clear"} />
            </div>
            {context.warnings.length > 0 && (
              <div className="mt-3 space-y-2">
                {context.warnings.map((warning, index) => (
                  <div key={`${warning.type}-${index}`} className={`flex items-start gap-2 rounded-lg border p-2 text-xs ${WARNING_CLASSES[warning.level]}`}>
                    {warningDot(warning.level)}
                    <span>{warning.message}</span>
                  </div>
                ))}
              </div>
            )}
          </DrawerSection>

          <DrawerSection title="Notes">
            <div className="space-y-3">
              <DetailRow label="Planner notes" value={job.plannerNotes} />
              <DetailRow label="Internal notes" value={job.internalNotes} />
              <DetailRow label="Internal notes" value={job.internalNotes} />
            </div>
          </DrawerSection>
        </div>

        <div className="border-t border-border p-5">
          <div className="flex flex-wrap justify-end gap-2">
            {!isClosed(job) && <button type="button" onClick={onAssign} className="btn btn-primary">Assign driver</button>}
            <button type="button" disabled={!fixable} onClick={onQuickFix} className="btn btn-outline">Quick fix</button>
            <button type="button" onClick={onEditJob} className="btn btn-outline">Edit full job</button>
            <button type="button" onClick={onClose} className="btn btn-outline">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
