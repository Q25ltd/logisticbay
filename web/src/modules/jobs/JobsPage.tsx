import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { jobsApi } from "../../api/jobs";
import { driversApi } from "../../api/drivers";
import type { PlannedJob, Driver, JobTemplate } from "../../types";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Alert } from "../../components/Alert";
import {
  ACTIVE_JOB_STATUSES,
  JOB_STATUS_FLOW,
  PENDING_JOB_STATUSES,
  PROGRESSABLE_JOB_STATUSES,
} from "../../constants/jobStatuses";

const today = () => new Date().toISOString().split("T")[0];
const fmt   = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day:"2-digit", month:"short" });

function hasStatus(statuses: readonly string[], status: string) {
  return statuses.includes(status);
}

function nextJobStatus(status: string) {
  const index = JOB_STATUS_FLOW.findIndex(value => value === status);
  return index >= 0 ? JOB_STATUS_FLOW[index + 1] : undefined;
}

function statusActionLabel(status: string) {
  switch (status) {
    case "in_progress": return "▶ Start";
    case "arrived_pickup": return "📍 At Pickup";
    case "collected": return "✅ Collected";
    case "arrived_dropoff": return "📍 At Dropoff";
    case "completed": return "✅ Complete";
    default: return status;
  }
}

function firstStopText(job: PlannedJob, type: "pickup" | "dropoff") {
  const stop = job.stops
    ?.filter(s => s.type === type)
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber)[type === "pickup" ? 0 : Math.max(0, (job.stops?.filter(s => s.type === type).length ?? 1) - 1)];
  return stop?.locationTextSnapshot || (type === "pickup" ? job.pickupTextSnapshot : job.dropoffTextSnapshot) || "—";
}

function jobMaterial(job: PlannedJob) {
  return job.loadDetails?.materialType || job.materialType || "—";
}

function jobQuantity(job: PlannedJob) {
  const quantity = job.loadDetails?.quantity ?? job.quantityExpected;
  const unit = job.loadDetails?.unit ?? job.quantityUnit;
  return quantity ? `${quantity} ${unit || ""}`.trim() : "";
}

function JobRow({ job, onStatusChange, onNote, onEdit, onDelete }: {
  job: PlannedJob;
  onStatusChange: (id: number, status: string) => void;
  onNote: (id: number) => void;
  onEdit: (id: number) => void;
  onDelete: (job: PlannedJob) => void;
}) {
  const canProgress = hasStatus(PROGRESSABLE_JOB_STATUSES, job.status);
  const nextStatus  = nextJobStatus(job.status);
  const lastEvent   = job.events?.[job.events.length - 1];
  const hasNote     = job.events?.some(e => e.eventType === "note_added" && e.note);

  return (
    <tr className={"hover:bg-gray-50 transition-colors " + (hasNote ? "bg-yellow-50" : "")}>
      <td className="px-4 py-3 text-sm text-primary">{job.plannedDate ? fmt(job.plannedDate) : "Draft"}</td>
      <td className="px-4 py-3">
        <div className="text-sm font-medium text-primary truncate max-w-48">{firstStopText(job, "pickup")}</div>
        <div className="text-xs text-muted">→ {firstStopText(job, "dropoff")}</div>
      </td>
      <td className="px-4 py-3 text-sm text-muted">{job.assignedDriver?.displayName ?? "—"}</td>
      <td className="px-4 py-3 text-sm text-muted">{job.referenceNumber || "—"}</td>
      <td className="px-4 py-3 text-sm text-muted">
        <div>{jobMaterial(job)}</div>
        {jobQuantity(job) && <div className="text-xs text-muted">⚖️ {jobQuantity(job)}</div>}
      </td>
      <td className="px-4 py-3"><Badge status={job.status} /></td>
      <td className="px-4 py-3 text-xs text-muted">
        {lastEvent ? new Date(lastEvent.createdAt).toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" }) : "—"}
        {hasNote && <span className="ml-1 text-yellow-600">⚠</span>}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {canProgress && nextStatus && (
            <button onClick={() => onStatusChange(job.id, nextStatus)}
              className="text-xs text-accent hover:underline font-semibold whitespace-nowrap">
              {statusActionLabel(nextStatus)}
            </button>
          )}
          <button onClick={() => onNote(job.id)} className="text-xs text-muted hover:text-primary">+ Note</button>
          <button onClick={() => onEdit(job.id)} className="text-xs text-muted hover:text-primary">Edit</button>
          <button onClick={() => onDelete(job)} className="text-xs text-red-500 hover:underline font-semibold">Delete</button>
        </div>
      </td>
    </tr>
  );
}

function NoteModal({ jobId, onClose }: { jobId: number; onClose: () => void }) {
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!note.trim()) return;
    setLoading(true);
    try { await jobsApi.addNote(jobId, note.trim()); onClose(); }
    catch (err: any) { alert(err.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h3 className="font-bold text-primary mb-4">Add Note to Job #{jobId}</h3>
        <textarea className="input min-h-24 mb-4" value={note} onChange={e => setNote(e.target.value)}
          placeholder="Site closed, delay, issue..." autoFocus />
        <div className="flex gap-3">
          <Button className="flex-1" onClick={submit} loading={loading}>Send Note</Button>
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}


export default function JobsPage() {
  const navigate = useNavigate();
  const [jobs,          setJobs]          = useState<PlannedJob[]>([]);
  const [drivers,       setDrivers]       = useState<Driver[]>([]);
  const [templates,     setTemplates]     = useState<JobTemplate[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState("");
  const [date,          setDate]          = useState(today());
  const [statusFilter,  setStatusFilter]  = useState("all");
  const [driverFilter,  setDriverFilter]  = useState("all");
  const [noteJobId,     setNoteJobId]     = useState<number|null>(null);
  const [success,       setSuccess]       = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [j,d,t] = await Promise.all([
        jobsApi.list(date),
        driversApi.list("active"),
        jobsApi.templates(),
      ]);
      setJobs(j.data); setDrivers(d.data); setTemplates(t.data);
    } catch (err: any) { setError(err.message); }
    setLoading(false);
  }, [date]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const i = setInterval(load, 30000); return () => clearInterval(i); }, [load]);

  async function handleStatusChange(id: number, status: string) {
    try {
      await jobsApi.updateStatus(id, status);
      setSuccess(`Job updated ✓`);
      setTimeout(() => setSuccess(""), 3000);
      load();
    } catch (err: any) { alert(err.message); }
  }

  async function handleDelete(job: PlannedJob) {
    const label = job.referenceNumber || `job #${job.id}`;
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;

    try {
      await jobsApi.remove(job.id);
      setSuccess("Job deleted ✓");
      setTimeout(() => setSuccess(""), 3000);
      load();
    } catch (err: any) { alert(err.message); }
  }

  const filtered = jobs
    .filter(j => statusFilter === "all" || j.status === statusFilter)
    .filter(j => driverFilter === "all" || String(j.assignedDriverId) === driverFilter);

  const stats = {
    total:     jobs.length,
    completed: jobs.filter(j => j.status === "completed").length,
    active:    jobs.filter(j => hasStatus(ACTIVE_JOB_STATUSES, j.status)).length,
    pending:   jobs.filter(j => hasStatus(PENDING_JOB_STATUSES, j.status)).length,
  };

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-start justify-between mb-5 gap-4">
        <div>
          <h1 className="text-xl font-black text-primary">Jobs</h1>
          <p className="text-sm text-muted mt-0.5">
            {stats.total} total · {stats.completed} done · {stats.active} active · {stats.pending} pending
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="input w-auto text-sm hidden sm:block"/>
          <button onClick={load} className="btn btn-outline text-sm px-3">↻</button>
          <Button onClick={() => navigate("/app/jobs/create")}>+ New Job</Button>
        </div>
      </div>

      {/* Mobile date picker */}
      <div className="sm:hidden mb-4">
        <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="input w-full text-sm"/>
      </div>

      {success && <Alert type="success" message={success} />}
      {error   && <Alert type="error"   message={error}   />}

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <select className="input flex-1 sm:flex-none sm:w-auto text-sm" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="accepted">Accepted</option>
          <option value="in_progress">In Progress</option>
          <option value="arrived_pickup">At Pickup</option>
          <option value="collected">Collected</option>
          <option value="arrived_dropoff">At Dropoff</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select className="input flex-1 sm:flex-none sm:w-auto text-sm" value={driverFilter} onChange={e=>setDriverFilter(e.target.value)}>
          <option value="all">All drivers</option>
          {drivers.map(d => <option key={d.id} value={d.id}>{d.displayName}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted">Loading jobs...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">📋</div>
          <div className="font-bold text-primary mb-1">No jobs for this date</div>
          <div className="text-sm text-muted mb-4">Create a job or select a different date</div>
          <Button onClick={() => navigate("/app/jobs/create")}>Create Job</Button>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-slate-50">
                    {["Date","Route","Driver","Reference","Material","Status","Last Update","Actions"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-bold text-muted uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(job => (
                    <JobRow
                      key={job.id}
                      job={job}
                      onStatusChange={handleStatusChange}
                      onNote={id => setNoteJobId(id)}
                      onEdit={id => navigate(`/app/jobs/${id}/edit`)}
                      onDelete={handleDelete}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {filtered.map(job => {
              const canProgress = hasStatus(PROGRESSABLE_JOB_STATUSES, job.status);
              const nextStatus = nextJobStatus(job.status);
              return (
                <div key={job.id} className="card p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-primary truncate">{firstStopText(job, "pickup")}</div>
                      <div className="text-xs text-muted truncate">→ {firstStopText(job, "dropoff")}</div>
                    </div>
                    <Badge status={job.status} />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted flex-wrap">
                    {job.plannedDate && <span>📅 {fmt(job.plannedDate)}</span>}
                    {job.assignedDriver && <span>👤 {job.assignedDriver.displayName}</span>}
                    {jobMaterial(job) !== "—" && <span>📦 {jobMaterial(job)}</span>}
                    {job.referenceNumber && <span>#{job.referenceNumber}</span>}
                  </div>
                  <div className="flex items-center gap-3 pt-1 border-t border-slate-100">
                    {canProgress && nextStatus && (
                      <button onClick={() => handleStatusChange(job.id, nextStatus)}
                        className="text-xs font-semibold text-accent bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors">
                        {statusActionLabel(nextStatus)}
                      </button>
                    )}
                    <button onClick={() => setNoteJobId(job.id)}
                      className="text-xs text-muted hover:text-primary ml-auto">+ Note</button>
                    <button onClick={() => navigate(`/app/jobs/${job.id}/edit`)}
                      className="text-xs text-muted hover:text-primary">Edit</button>
                    <button onClick={() => handleDelete(job)}
                      className="text-xs font-semibold text-red-500 hover:underline">Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {noteJobId && (
        <NoteModal jobId={noteJobId} onClose={() => { setNoteJobId(null); load(); }} />
      )}
    </div>
  );
}
