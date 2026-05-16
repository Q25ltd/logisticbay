import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { runsApi } from "../../api/runs";
import type { PatchRunBody } from "../../api/runs";
import { jobsApi } from "../../api/jobs";
import { driversApi } from "../../api/drivers";
import type { Run, RunAssignment, Driver, PlannedJob, JobPart } from "../../types";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";

const RUN_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  assigned: "Assigned",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const RUN_STATUS_BADGE: Record<string, string> = {
  draft: "pending",
  assigned: "accepted",
  in_progress: "in_progress",
  completed: "completed",
  cancelled: "cancelled",
};

const STOP_TYPE_LABELS: Record<string, string> = {
  pickup: "Pickup",
  dropoff: "Drop Off",
  collection: "Collection",
  delivery: "Delivery",
  handover: "Handover",
  yard: "Yard",
  depot: "Depot",
};

const ASSIGNMENT_STATUS_BADGE: Record<string, string> = {
  pending: "pending",
  completed: "completed",
  skipped: "cancelled",
};

const END_INSTRUCTIONS = [
  { value: "", label: "— None —" },
  { value: "return_to_base", label: "Return to Base" },
  { value: "standby", label: "Standby" },
  { value: "finished", label: "Finished" },
];

// ── Add Stop panel ────────────────────────────────────────────────────────────

function AddStopPanel({
  run,
  onClose,
  onAdded,
}: {
  run: Run;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [date, setDate] = useState(run.plannedDate ?? new Date().toISOString().slice(0, 10));
  const [jobs, setJobs] = useState<PlannedJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [expandedJobId, setExpandedJobId] = useState<number | null>(null);
  const [addingPart, setAddingPart] = useState<number | null>(null);
  const [error, setError] = useState("");

  const assignedPartIds = new Set(run.assignments?.map(a => a.jobPartId) ?? []);
  const nextSeq = (run.assignments?.length ?? 0) + 1;

  const loadJobs = useCallback(async () => {
    setLoadingJobs(true);
    setError("");
    try {
      const res = await jobsApi.listRange(date, date);
      setJobs(res.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load jobs");
    } finally {
      setLoadingJobs(false);
    }
  }, [date]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  async function addStop(job: PlannedJob, stop: JobPart) {
    if (!stop.id) return;
    setAddingPart(stop.id);
    setError("");
    try {
      await runsApi.addAssignment(run.id, {
        jobPartId: stop.id,
        jobId: job.id,
        sequenceNumber: nextSeq,
        quantityAssigned: 0,
        quantityUnit: job.quantityUnit || "",
      });
      onAdded();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add stop");
    } finally {
      setAddingPart(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} />
      {/* Panel */}
      <div className="w-full max-w-lg bg-white shadow-xl flex flex-col h-full overflow-hidden">
        {/* Panel header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-lg font-bold text-primary">Add Stop</h2>
          <button onClick={onClose} className="text-muted hover:text-primary text-2xl leading-none w-8 h-8 flex items-center justify-center">×</button>
        </div>

        {/* Date picker */}
        <div className="px-5 py-3 border-b border-border flex-shrink-0">
          <label className="block text-sm font-medium text-primary mb-1">Date</label>
          <input
            type="date"
            className="input w-full"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>

        {error && (
          <div className="mx-5 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}

        {/* Jobs list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          {loadingJobs && <div className="text-center py-8 text-muted">Loading jobs...</div>}
          {!loadingJobs && jobs.length === 0 && (
            <div className="text-center py-8 text-muted">No jobs found for this date</div>
          )}
          {!loadingJobs && jobs.map(job => (
            <div key={job.id} className="border border-border rounded-lg overflow-hidden">
              {/* Job header */}
              <button
                className="w-full flex items-center justify-between p-3 bg-surface hover:bg-slate-50 transition-colors text-left"
                onClick={() => setExpandedJobId(expandedJobId === job.id ? null : job.id)}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-primary">{job.jobReference ?? `Job #${job.id}`}</span>
                    <Badge status={job.status} />
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    {job.customerName || "—"} · {job.stops?.length ?? 0} stop{(job.stops?.length ?? 0) !== 1 ? "s" : ""}
                  </div>
                </div>
                <span className="text-muted text-sm ml-2">{expandedJobId === job.id ? "▲" : "▼"}</span>
              </button>

              {/* Expanded stops */}
              {expandedJobId === job.id && (
                <div className="border-t border-border divide-y divide-border">
                  {(!job.stops || job.stops.length === 0) && (
                    <div className="px-3 py-3 text-sm text-muted">No stops on this job</div>
                  )}
                  {job.stops?.map(stop => {
                    const alreadyIn = stop.id !== undefined && assignedPartIds.has(stop.id);
                    return (
                      <div key={stop.id ?? stop.sequenceNumber} className="px-3 py-2 flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold text-muted">#{stop.sequenceNumber}</span>
                            <span className="badge badge-pending text-xs">{STOP_TYPE_LABELS[stop.type] ?? stop.type}</span>
                          </div>
                          <div className="text-sm text-primary mt-0.5 truncate">{stop.locationTextSnapshot || "—"}</div>
                          {(stop.timeWindowStart || stop.bookedTime) && (
                            <div className="text-xs text-muted">
                              {stop.bookedTime ?? `${stop.timeWindowStart}–${stop.timeWindowEnd}`}
                            </div>
                          )}
                        </div>
                        {alreadyIn ? (
                          <span className="text-xs text-muted bg-slate-100 rounded px-2 py-1 flex-shrink-0">Already in run</span>
                        ) : (
                          <Button
                            variant="outline"
                            className="flex-shrink-0 text-xs py-1 px-2"
                            loading={addingPart === stop.id}
                            disabled={addingPart !== null}
                            onClick={() => addStop(job, stop)}
                          >
                            + Add
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── RunDetailPage ─────────────────────────────────────────────────────────────

export default function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const runId = Number(id);

  const [run, setRun] = useState<Run | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showAddStop, setShowAddStop] = useState(false);

  // Form state
  const [plannedDate, setPlannedDate] = useState("");
  const [driverId, setDriverId] = useState("");
  const [estimatedStartTime, setEstimatedStartTime] = useState("");
  const [estimatedEndTime, setEstimatedEndTime] = useState("");
  const [plannerNotes, setPlannerNotes] = useState("");
  const [endInstruction, setEndInstruction] = useState("");
  const [endInstructionNote, setEndInstructionNote] = useState("");

  const loadRun = useCallback(async () => {
    setError("");
    try {
      const r = await runsApi.get(runId);
      setRun(r);
      setPlannedDate(r.plannedDate ?? "");
      setDriverId(r.assignedDriverId ? String(r.assignedDriverId) : "");
      setEstimatedStartTime(r.estimatedStartTime ?? "");
      setEstimatedEndTime(r.estimatedEndTime ?? "");
      setPlannerNotes(r.plannerNotes ?? "");
      setEndInstruction(r.endInstruction ?? "");
      setEndInstructionNote(r.endInstructionNote ?? "");
      setDirty(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load run");
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => { loadRun(); }, [loadRun]);

  useEffect(() => {
    driversApi.list("active").then(res => setDrivers(res.data)).catch(() => {});
  }, []);

  function markDirty() { setDirty(true); }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const body: PatchRunBody = {
        plannedDate: plannedDate || null,
        assignedDriverId: driverId ? Number(driverId) : null,
        estimatedStartTime: estimatedStartTime || null,
        estimatedEndTime: estimatedEndTime || null,
        plannerNotes: plannerNotes || undefined,
        endInstruction: endInstruction || null,
        endInstructionNote: endInstructionNote || undefined,
      };
      const updated = await runsApi.update(runId, body);
      setRun(updated);
      setDirty(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save run");
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!run) return;
    setPublishing(true);
    setError("");
    try {
      const updated = await runsApi.publish(runId);
      setRun(updated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to publish run");
    } finally {
      setPublishing(false);
    }
  }

  async function handleCancel() {
    if (!run) return;
    if (!window.confirm("Are you sure you want to cancel this run?")) return;
    setCancelling(true);
    setError("");
    try {
      await runsApi.remove(runId);
      navigate("/app/runs");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to cancel run");
      setCancelling(false);
    }
  }

  async function handleDelete() {
    if (!run) return;
    if (!window.confirm("Permanently delete this cancelled run? This cannot be undone.")) return;
    setCancelling(true);
    setError("");
    try {
      await runsApi.remove(runId);
      navigate("/app/runs");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete run");
      setCancelling(false);
    }
  }

  async function handleRemoveAssignment(assignment: RunAssignment) {
    if (!run) return;
    try {
      await runsApi.removeAssignment(runId, assignment.id);
      loadRun();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to remove stop");
    }
  }

  async function handleMoveAssignment(assignment: RunAssignment, direction: "up" | "down") {
    if (!run || !run.assignments) return;
    const sorted = [...run.assignments].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    const idx = sorted.findIndex(a => a.id === assignment.id);
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === sorted.length - 1) return;

    const swapWith = direction === "up" ? sorted[idx - 1] : sorted[idx + 1];
    try {
      // Build new order: swap the two elements
      const newOrder = sorted.map(a => a.id);
      newOrder[idx] = swapWith.id;
      newOrder[direction === "up" ? idx - 1 : idx + 1] = assignment.id;
      await runsApi.resequence(runId, newOrder);
      loadRun();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to reorder stops");
    }
  }

  if (loading) return <div className="p-6 text-center text-muted">Loading run...</div>;
  if (!run) return <div className="p-6 text-center text-red-600">{error || "Run not found"}</div>;

  const sortedAssignments = [...(run.assignments ?? [])].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  const hasRequirements = run.assignments && run.assignments.length > 0 &&
    (run.hasHazardous || run.hasTemperatureLoad || run.hasOversized || run.requiredTrailerType || (run.requiredEquipment && run.requiredEquipment.length > 0) || run.maxLoadWeight);

  return (
    <div className="p-6 max-w-4xl">
      {/* Back link */}
      <Link to="/app/runs" className="text-sm text-muted hover:text-primary flex items-center gap-1 mb-4">
        ← Runs
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-primary">{run.runReference}</h1>
            <Badge status={RUN_STATUS_BADGE[run.status] ?? run.status} label={RUN_STATUS_LABELS[run.status] ?? run.status} />
            {run.publishedToDriver && <span className="badge badge-completed text-xs">Published</span>}
          </div>
          {dirty && <p className="text-xs text-amber-600 mt-1">Unsaved changes</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {dirty && (
            <Button variant="primary" loading={saving} onClick={handleSave}>Save Changes</Button>
          )}
          {!dirty && (
            <Button variant="outline" loading={saving} onClick={handleSave}>Save</Button>
          )}
          {run.status !== "cancelled" && !run.publishedToDriver && (
            <Button variant="success" loading={publishing} onClick={handlePublish}>Publish to Driver</Button>
          )}
          {run.status !== "cancelled" && (
            <Button variant="danger" loading={cancelling} onClick={handleCancel}>Cancel Run</Button>
          )}
          {run.status === "cancelled" && (
            <Button variant="danger" loading={cancelling} onClick={handleDelete}>Delete Run</Button>
          )}
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      {/* Details card */}
      <div className="card p-5 mb-5">
        <h2 className="text-base font-semibold text-primary mb-4">Run Details</h2>
        <div className="space-y-4">
          {/* Planned date */}
          <div>
            <label className="block text-sm font-medium text-primary mb-1">Planned Date</label>
            <input
              type="date"
              className="input w-full max-w-xs"
              value={plannedDate}
              onChange={e => { setPlannedDate(e.target.value); markDirty(); }}
            />
          </div>

          {/* Driver */}
          <div>
            <label className="block text-sm font-medium text-primary mb-1">Driver</label>
            <select
              className="input w-full max-w-sm"
              value={driverId}
              onChange={e => { setDriverId(e.target.value); markDirty(); }}
            >
              <option value="">— No driver assigned —</option>
              {drivers.filter(d => d.status === "active").map(d => (
                <option key={d.id} value={d.id}>{d.displayName}</option>
              ))}
            </select>
          </div>

          {/* Start / End time */}
          <div className="grid grid-cols-2 gap-4 max-w-sm">
            <div>
              <label className="block text-sm font-medium text-primary mb-1">Est. Start Time</label>
              <input
                type="time"
                className="input w-full"
                value={estimatedStartTime}
                onChange={e => { setEstimatedStartTime(e.target.value); markDirty(); }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-primary mb-1">Est. End Time</label>
              <input
                type="time"
                className="input w-full"
                value={estimatedEndTime}
                onChange={e => { setEstimatedEndTime(e.target.value); markDirty(); }}
              />
            </div>
          </div>

          {/* Planner notes */}
          <div>
            <label className="block text-sm font-medium text-primary mb-1">Planner Notes</label>
            <textarea
              className="input w-full"
              rows={3}
              value={plannerNotes}
              onChange={e => { setPlannerNotes(e.target.value); markDirty(); }}
              placeholder="Notes for this run..."
            />
          </div>

          {/* End instruction */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-primary mb-1">End Instruction</label>
              <select
                className="input w-full"
                value={endInstruction}
                onChange={e => { setEndInstruction(e.target.value); markDirty(); }}
              >
                {END_INSTRUCTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-primary mb-1">End Instruction Note</label>
              <textarea
                className="input w-full"
                rows={2}
                value={endInstructionNote}
                onChange={e => { setEndInstructionNote(e.target.value); markDirty(); }}
                placeholder="Additional instructions..."
              />
            </div>
          </div>
        </div>
      </div>

      {/* Assignments / Stops */}
      <div className="card p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-primary">Stops</h2>
          <Button variant="outline" onClick={() => setShowAddStop(true)}>+ Add Stop</Button>
        </div>

        {sortedAssignments.length === 0 && (
          <div className="text-center py-10 text-muted">
            <div className="text-3xl mb-2">🛑</div>
            <p className="text-sm">No stops added yet — click Add Stop to begin</p>
          </div>
        )}

        {sortedAssignments.length > 0 && (
          <div className="space-y-2">
            {sortedAssignments.map((assignment, idx) => {
              const part = assignment.jobPart;
              const job = assignment.job;
              return (
                <div key={assignment.id} className="flex items-start gap-3 p-3 border border-border rounded-lg">
                  {/* Sequence circle */}
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold">
                    {assignment.sequenceNumber}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <span className="font-semibold text-sm text-primary">{job?.jobReference ?? `Job #${assignment.jobId}`}</span>
                      {job?.customerName && <span className="text-xs text-muted">{job.customerName}</span>}
                      {part && <span className="badge badge-pending text-xs">{STOP_TYPE_LABELS[part.type] ?? part.type}</span>}
                      <Badge status={ASSIGNMENT_STATUS_BADGE[assignment.status] ?? assignment.status} label={assignment.status} />
                    </div>
                    {part && (
                      <div className="text-sm text-muted truncate">{part.locationTextSnapshot || "—"}</div>
                    )}
                    {(assignment.quantityAssigned !== undefined && assignment.quantityUnit) && (
                      <div className="text-xs text-muted mt-0.5">
                        {assignment.quantityAssigned} {assignment.quantityUnit}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => navigate(`/app/jobs/${assignment.jobId}`)}
                      className="w-7 h-7 flex items-center justify-center rounded border border-border text-muted hover:text-blue-600 hover:border-blue-300 text-xs font-bold"
                      title="View job"
                    >
                      ↗
                    </button>
                    <button
                      onClick={() => handleMoveAssignment(assignment, "up")}
                      disabled={idx === 0}
                      className="w-7 h-7 flex items-center justify-center rounded border border-border text-muted hover:text-primary hover:border-primary disabled:opacity-30 disabled:cursor-not-allowed text-sm"
                      title="Move up"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => handleMoveAssignment(assignment, "down")}
                      disabled={idx === sortedAssignments.length - 1}
                      className="w-7 h-7 flex items-center justify-center rounded border border-border text-muted hover:text-primary hover:border-primary disabled:opacity-30 disabled:cursor-not-allowed text-sm"
                      title="Move down"
                    >
                      ▼
                    </button>
                    <button
                      onClick={() => handleRemoveAssignment(assignment)}
                      className="w-7 h-7 flex items-center justify-center rounded border border-border text-muted hover:text-red-600 hover:border-red-300 text-base"
                      title="Remove stop"
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Requirements summary */}
      {hasRequirements && (
        <div className="card p-5 mb-5">
          <h2 className="text-base font-semibold text-primary mb-3">Run Requirements</h2>
          <div className="space-y-3">
            {/* Flags */}
            <div className="flex flex-wrap gap-2">
              {run.hasHazardous && <span className="badge badge-cancelled">Hazardous</span>}
              {run.hasTemperatureLoad && <span className="badge badge-pending">Temperature Controlled</span>}
              {run.hasOversized && <span className="badge badge-pending">Oversized</span>}
            </div>

            {/* Details */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              {run.maxLoadWeight && (
                <div>
                  <span className="text-muted block text-xs">Max Load Weight</span>
                  <span className="font-medium text-primary">{run.maxLoadWeight} kg</span>
                </div>
              )}
              {run.requiredTrailerType && (
                <div>
                  <span className="text-muted block text-xs">Required Trailer</span>
                  <span className="font-medium text-primary">{run.requiredTrailerType}</span>
                </div>
              )}
              {run.requiredEquipment && run.requiredEquipment.length > 0 && (
                <div>
                  <span className="text-muted block text-xs">Required Equipment</span>
                  <span className="font-medium text-primary">{run.requiredEquipment.join(", ")}</span>
                </div>
              )}
            </div>

            {/* Compatibility */}
            <div className="flex gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 text-sm">
                <span className={run.trailerCompatible ? "text-green-600" : "text-red-600"}>
                  {run.trailerCompatible ? "✓" : "✗"}
                </span>
                <span className="text-muted">Trailer compatible</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm">
                <span className={run.vehicleCompatible ? "text-green-600" : "text-red-600"}>
                  {run.vehicleCompatible ? "✓" : "✗"}
                </span>
                <span className="text-muted">Vehicle compatible</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Stop panel */}
      {showAddStop && (
        <AddStopPanel
          run={run}
          onClose={() => setShowAddStop(false)}
          onAdded={() => {
            setShowAddStop(false);
            loadRun();
          }}
        />
      )}
    </div>
  );
}
