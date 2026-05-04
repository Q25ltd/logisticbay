import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { jobsApi } from "../../api/jobs";
import { driversApi } from "../../api/drivers";
import type { PlannedJob, Driver, JobTemplate } from "../../types";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Alert } from "../../components/Alert";

const today = () => new Date().toISOString().split("T")[0];
const fmt   = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day:"2-digit", month:"short" });

const STATUS_FLOW = ["pending","accepted","in_progress","arrived_pickup","collected","arrived_dropoff","completed","cancelled"];

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

function JobRow({ job, onStatusChange, onNote }: {
  job: PlannedJob;
  onStatusChange: (id: number, status: string) => void;
  onNote: (id: number) => void;
}) {
  const canProgress = ["pending","accepted","in_progress","arrived_pickup","collected","arrived_dropoff"].includes(job.status);
  const nextStatus  = STATUS_FLOW[STATUS_FLOW.indexOf(job.status) + 1];
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
              {nextStatus === "in_progress"     ? "▶ Start"         :
               nextStatus === "arrived_pickup"  ? "📍 At Pickup"   :
               nextStatus === "collected"       ? "✅ Collected"    :
               nextStatus === "arrived_dropoff" ? "📍 At Dropoff"  :
               nextStatus === "completed"       ? "✅ Complete"     : nextStatus}
            </button>
          )}
          <button onClick={() => onNote(job.id)} className="text-xs text-muted hover:text-primary">+ Note</button>
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

  const filtered = jobs
    .filter(j => statusFilter === "all" || j.status === statusFilter)
    .filter(j => driverFilter === "all" || String(j.assignedDriverId) === driverFilter);

  const stats = {
    total:     jobs.length,
    completed: jobs.filter(j => j.status === "completed").length,
    active:    jobs.filter(j => ["in_progress","arrived_pickup","collected","arrived_dropoff"].includes(j.status)).length,
    pending:   jobs.filter(j => ["pending","accepted"].includes(j.status)).length,
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-black text-primary">Jobs</h1>
          <p className="text-sm text-muted">
            {stats.total} total · {stats.completed} done · {stats.active} active · {stats.pending} pending
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="input w-auto text-sm"/>
          <button onClick={load} className="btn btn-outline text-sm">↻</button>
          <Button onClick={() => navigate("/app/jobs/create")}>+ Create Job</Button>
        </div>
      </div>

      {success && <Alert type="success" message={success} />}
      {error   && <Alert type="error"   message={error}   />}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <select className="input w-auto" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
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
        <select className="input w-auto" value={driverFilter} onChange={e=>setDriverFilter(e.target.value)}>
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
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {["Date","Route","Driver","Reference","Material","Status","Last Update","Actions"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-muted uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(job => (
                  <JobRow key={job.id} job={job} onStatusChange={handleStatusChange} onNote={id => setNoteJobId(id)} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {noteJobId && (
        <NoteModal jobId={noteJobId} onClose={() => { setNoteJobId(null); load(); }} />
      )}
    </div>
  );
}
