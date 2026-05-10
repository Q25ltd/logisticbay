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

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const RANGE_PRESETS = [
  { label: "Today",  back: 0,  fwd: 0  },
  { label: "← 7d",  back: 7,  fwd: 0  },
  { label: "7d →",  back: 0,  fwd: 7  },
  { label: "← 14d", back: 14, fwd: 0  },
  { label: "14d →", back: 0,  fwd: 14 },
  { label: "← 30d", back: 30, fwd: 0  },
  { label: "30d →", back: 0,  fwd: 30 },
];

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

function AssignModal({ job, drivers, onClose, onSaved }: {
  job: PlannedJob;
  drivers: Driver[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [driverId,      setDriverId]      = useState<string>(job.assignedDriverId ? String(job.assignedDriverId) : "");
  const [trailer,       setTrailer]       = useState(job.assignedTrailer ?? "");
  const [truck,         setTruck]         = useState(job.assignedTruck   ?? "");
  const [loadingNote,   setLoadingNote]   = useState("");
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState("");

  const selectedDriver = drivers.find(d => String(d.id) === driverId);

  async function save() {
    if (!driverId) { setError("Select a driver"); return; }
    setSaving(true); setError("");
    try {
      await jobsApi.allocate(job.id, {
        assignedDriverId: parseInt(driverId, 10),
        assignedTrailer:  trailer.trim() || selectedDriver?.defaultTrailerReg || "",
        assignedTruck:    truck.trim()   || selectedDriver?.defaultTruckReg   || "",
        overrideReason:   loadingNote.trim() || undefined,
      });
      onSaved();
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  }

  async function unassign() {
    if (!window.confirm("Remove driver from this job?")) return;
    setSaving(true); setError("");
    try {
      await jobsApi.allocate(job.id, { assignedDriverId: null });
      onSaved();
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h3 className="font-bold text-primary mb-1">
          {job.assignedDriverId ? "Reassign Driver" : "Assign Driver"}
        </h3>
        <p className="text-xs text-muted mb-4">
          {job.jobReference || `Job #${job.id}`} · {job.plannedDate || "No date set"}
        </p>

        {error && <div className="text-xs text-red-600 bg-red-50 rounded-lg p-2 mb-3">{error}</div>}

        {/* 1 — Driver */}
        <label className="block text-sm font-semibold mb-1">Driver *</label>
        <select className="input w-full mb-4" value={driverId} onChange={e => {
          const d = drivers.find(dr => String(dr.id) === e.target.value);
          setDriverId(e.target.value);
          if (d) { setTrailer(d.defaultTrailerReg ?? ""); setTruck(d.defaultTruckReg ?? ""); }
        }}>
          <option value="">Select driver...</option>
          {drivers.map(d => <option key={d.id} value={d.id}>{d.displayName}</option>)}
        </select>

        {/* 2 — Trailer */}
        <label className="block text-sm font-semibold mb-1">Trailer</label>
        <input className="input w-full mb-3" value={trailer} onChange={e => setTrailer(e.target.value)}
          placeholder={selectedDriver?.defaultTrailerReg || "Registration (optional)"} />

        {/* 3 — Truck */}
        <label className="block text-sm font-semibold mb-1">Truck</label>
        <input className="input w-full mb-4" value={truck} onChange={e => setTruck(e.target.value)}
          placeholder={selectedDriver?.defaultTruckReg || "Registration"} />

        {/* 4 — Loading / unloading note */}
        <label className="block text-sm font-semibold mb-1">Loading / unloading note</label>
        <textarea className="input w-full min-h-16 mb-4" value={loadingNote} onChange={e => setLoadingNote(e.target.value)}
          placeholder="Any special instructions for this assignment..." />

        <div className="flex gap-2">
          <Button className="flex-1" onClick={save} loading={saving}>Assign</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {job.assignedDriverId && (
            <Button variant="outline" onClick={unassign} loading={saving}
              className="text-red-600 border-red-300 hover:bg-red-50">Unassign</Button>
          )}
        </div>
      </div>
    </div>
  );
}

function JobRow({ job, onStatusChange, onNote, onEdit, onAssign, onDelete, onView }: {
  job: PlannedJob;
  onStatusChange: (id: number, status: string) => void;
  onNote: (id: number) => void;
  onEdit: (id: number) => void;
  onAssign: (job: PlannedJob) => void;
  onDelete: (job: PlannedJob) => void;
  onView: (id: number) => void;
}) {
  const canProgress = hasStatus(PROGRESSABLE_JOB_STATUSES, job.status);
  const nextStatus  = nextJobStatus(job.status);
  const lastEvent   = job.events?.[job.events.length - 1];
  const hasNote     = job.events?.some(e => e.eventType === "note_added" && e.note);

  return (
    <tr className={"hover:bg-gray-50 transition-colors " + (hasNote ? "bg-yellow-50" : "")}>
      <td className="px-4 py-3 text-sm text-primary">{job.plannedDate ? fmt(job.plannedDate) : "Draft"}</td>
      <td className="px-4 py-3 cursor-pointer" onClick={() => onView(job.id)}>
        <div className="text-sm font-medium text-primary truncate max-w-48 hover:underline">{firstStopText(job, "pickup")}</div>
        <div className="text-xs text-muted">→ {firstStopText(job, "dropoff")}</div>
      </td>
      <td className="px-4 py-3 text-sm text-muted">{job.assignedDriver?.displayName ?? "—"}</td>
      <td className="px-4 py-3 text-sm font-mono">
        {job.jobReference
          ? <span className="text-primary font-semibold">{job.jobReference}</span>
          : <span className="text-muted italic text-xs">Assigned when ready</span>}
      </td>
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
          <button onClick={() => onAssign(job)}
            className={`text-xs font-semibold whitespace-nowrap ${job.assignedDriverId ? "text-muted hover:text-primary" : "text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded hover:bg-green-100"}`}>
            {job.assignedDriverId ? "Reassign" : "Assign"}
          </button>
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
  const [dateRange,     setDateRange]     = useState({ from: today(), to: today() });
  const [statusFilter,  setStatusFilter]  = useState("all");
  const [driverFilter,  setDriverFilter]  = useState("all");
  const [noteJobId,     setNoteJobId]     = useState<number|null>(null);
  const [assignJob,     setAssignJob]     = useState<PlannedJob|null>(null);
  const [success,       setSuccess]       = useState("");

  function applyRange(back: number, fwd: number) {
    setDateRange({ from: addDays(today(), -back), to: addDays(today(), fwd) });
  }

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [j, d, t] = await Promise.all([
        jobsApi.listRange(dateRange.from, dateRange.to),
        driversApi.list("active"),
        jobsApi.templates(),
      ]);
      setJobs(j.data); setDrivers(d.data); setTemplates(t.data);
    } catch (err: any) { setError(err.message); }
    setLoading(false);
  }, [dateRange]);

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
    if (!window.confirm(`Cancel ${label}? It will be hidden from active planning but kept for audit/history.`)) return;
    try {
      await jobsApi.remove(job.id);
      setSuccess("Job cancelled ✓");
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

  const rangeLabel = dateRange.from === dateRange.to ? dateRange.from : `${dateRange.from} → ${dateRange.to}`;

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          <h1 className="text-xl font-black text-primary">Jobs</h1>
          <p className="text-sm text-muted mt-0.5">
            {stats.total} total · {stats.completed} done · {stats.active} active · {stats.pending} pending · {rangeLabel}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={load} className="btn btn-outline text-sm px-3">↻</button>
          <Button onClick={() => navigate("/app/jobs/create")}>+ New Job</Button>
        </div>
      </div>

      {/* Quick range pills */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {RANGE_PRESETS.map(({ label, back, fwd }) => {
          const isActive = dateRange.from === addDays(today(), -back) && dateRange.to === addDays(today(), fwd);
          return (
            <button key={label} type="button" onClick={() => applyRange(back, fwd)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                isActive ? "bg-primary text-white border-primary" : "bg-white text-slate-600 border-slate-300 hover:border-primary hover:text-primary"
              }`}>
              {label}
            </button>
          );
        })}
        {/* Manual from/to */}
        <div className="flex items-center gap-1 ml-1">
          <input type="date" value={dateRange.from}
            onChange={e => setDateRange(prev => ({ ...prev, from: e.target.value }))}
            className="input py-1 text-xs w-36" />
          <span className="text-xs text-muted">→</span>
          <input type="date" value={dateRange.to}
            onChange={e => setDateRange(prev => ({ ...prev, to: e.target.value }))}
            className="input py-1 text-xs w-36" />
        </div>
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
          <div className="font-bold text-primary mb-1">No jobs for this period</div>
          <div className="text-sm text-muted mb-4">Create a job or select a different date range</div>
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
                    {["Date","Route","Driver","Job Ref","Cust Ref","Material","Status","Last Update","Actions"].map(h => (
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
                      onView={id => navigate(`/app/jobs/${id}`)}
                      onEdit={id => navigate(`/app/jobs/${id}/edit`)}
                      onAssign={setAssignJob}
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
                  <div className="flex items-start justify-between gap-2 cursor-pointer" onClick={() => navigate(`/app/jobs/${job.id}`)}>
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
                    {job.jobReference
                      ? <span className="font-mono font-semibold text-primary">{job.jobReference}</span>
                      : <span className="italic text-muted">Assigned when ready</span>}
                    {job.referenceNumber && <span className="text-muted">#{job.referenceNumber}</span>}
                  </div>
                  <div className="flex items-center gap-3 pt-1 border-t border-slate-100 flex-wrap">
                    {canProgress && nextStatus && (
                      <button onClick={() => handleStatusChange(job.id, nextStatus)}
                        className="text-xs font-semibold text-accent bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors">
                        {statusActionLabel(nextStatus)}
                      </button>
                    )}
                    <button onClick={() => setAssignJob(job)}
                      className={`text-xs font-semibold ${job.assignedDriverId ? "text-muted" : "text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded"}`}>
                      {job.assignedDriverId ? "Reassign" : "Assign"}
                    </button>
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
      {assignJob && (
        <AssignModal
          job={assignJob}
          drivers={drivers}
          onClose={() => setAssignJob(null)}
          onSaved={() => {
            setAssignJob(null);
            setSuccess("Driver assigned ✓");
            setTimeout(() => setSuccess(""), 3000);
            load();
          }}
        />
      )}
    </div>
  );
}
