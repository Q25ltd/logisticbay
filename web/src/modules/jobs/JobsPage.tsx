import { useState, useEffect, useCallback } from "react";
import { jobsApi } from "../../api/jobs";
import { driversApi } from "../../api/drivers";
import type { PlannedJob, Driver, JobTemplate } from "../../types";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Alert } from "../../components/Alert";

const today = () => new Date().toISOString().split("T")[0];

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day:"2-digit", month:"short" });
}

const STATUS_FLOW = ["pending","accepted","in_progress","arrived_pickup","completed","cancelled"];

// ─── Job row ──────────────────────────────────────────────────────────────────
function JobRow({ job, onStatusChange, onNote }: {
  job: PlannedJob;
  onStatusChange: (id: number, status: string) => void;
  onNote: (id: number) => void;
}) {
  const canProgress = ["pending","accepted","in_progress","arrived_pickup"].includes(job.status);
  const nextStatus = STATUS_FLOW[STATUS_FLOW.indexOf(job.status) + 1];
  const lastEvent = job.events?.[job.events.length - 1];

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 text-sm font-medium text-primary">{fmt(job.plannedDate)}</td>
      <td className="px-4 py-3">
        <div className="text-sm font-medium text-primary truncate max-w-48">
          {job.pickupTextSnapshot || "—"}
        </div>
        <div className="text-xs text-muted">→ {job.dropoffTextSnapshot || "—"}</div>
      </td>
      <td className="px-4 py-3 text-sm text-muted">{job.assignedDriver?.displayName ?? "—"}</td>
      <td className="px-4 py-3 text-sm text-muted">{job.referenceNumber || "—"}</td>
      <td className="px-4 py-3 text-sm text-muted">{job.materialType || "—"}</td>
      <td className="px-4 py-3"><Badge status={job.status} /></td>
      <td className="px-4 py-3 text-xs text-muted">
        {lastEvent ? new Date(lastEvent.createdAt).toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" }) : "—"}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {canProgress && nextStatus && (
            <button
              onClick={() => onStatusChange(job.id, nextStatus)}
              className="text-xs text-accent hover:underline font-semibold whitespace-nowrap"
            >
              {nextStatus === "in_progress"    ? "▶ Start"    :
               nextStatus === "arrived_pickup" ? "📍 Arrive"  :
               nextStatus === "completed"      ? "✅ Complete" : nextStatus}
            </button>
          )}
          <button onClick={() => onNote(job.id)} className="text-xs text-muted hover:text-primary">+ Note</button>
        </div>
      </td>
    </tr>
  );
}

// ─── Note modal ───────────────────────────────────────────────────────────────
function NoteModal({ jobId, onClose }: { jobId: number; onClose: () => void }) {
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!note.trim()) return;
    setLoading(true);
    try {
      await jobsApi.addNote(jobId, note.trim());
      onClose();
    } catch (err: any) { alert(err.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h3 className="font-bold text-primary mb-4">Add Note to Job #{jobId}</h3>
        <textarea
          className="input min-h-24 mb-4"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Site closed, delay, issue..."
          autoFocus
        />
        <div className="flex gap-3">
          <Button className="flex-1" onClick={submit} loading={loading}>Send Note</Button>
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Create job panel ─────────────────────────────────────────────────────────
function CreatePanel({ drivers, templates, date, onClose, onCreated }: {
  drivers: Driver[]; templates: JobTemplate[]; date: string;
  onClose: () => void; onCreated: () => void;
}) {
  const [f, setF] = useState({
    assignedDriverId:"", plannedDate:date, templateId:"",
    pickupTextSnapshot:"", dropoffTextSnapshot:"",
    referenceNumber:"", materialType:"", plannerNotes:"",
    saveAsTemplate:false, templateName:"",
  });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  function applyTpl(id: string) {
    const t = templates.find(t => String(t.id) === id);
    if (!t) return;
    setF(p => ({ ...p, templateId:id, pickupTextSnapshot:t.pickupTextSnapshot, dropoffTextSnapshot:t.dropoffTextSnapshot, referenceNumber:t.defaultReference||p.referenceNumber, materialType:t.defaultMaterialType||p.materialType, plannerNotes:t.defaultNotes||p.plannerNotes }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setLoading(true);
    try {
      await jobsApi.create({ ...f, templateId:f.templateId?parseInt(f.templateId):null, assignedDriverId:parseInt(f.assignedDriverId) });
      onCreated(); onClose();
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose}/>
      <div className="w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-border px-6 py-4 flex items-center justify-between">
          <h2 className="font-bold text-primary">Create Job</h2>
          <button onClick={onClose} className="text-muted hover:text-primary text-xl">✕</button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-3">
          {err && <Alert type="error" message={err} />}
          <div><label className="label">Template</label><select className="input" value={f.templateId} onChange={e=>{setF(p=>({...p,templateId:e.target.value}));applyTpl(e.target.value);}}><option value="">— Manual —</option>{templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
          <div><label className="label">Driver *</label><select className="input" value={f.assignedDriverId} onChange={e=>setF(p=>({...p,assignedDriverId:e.target.value}))} required><option value="">Select...</option>{drivers.map(d=><option key={d.id} value={d.id}>{d.displayName}</option>)}</select></div>
          <div><label className="label">Date *</label><input className="input" type="date" value={f.plannedDate} onChange={e=>setF(p=>({...p,plannedDate:e.target.value}))} required/></div>
          <div><label className="label">Pickup *</label><input className="input" value={f.pickupTextSnapshot} onChange={e=>setF(p=>({...p,pickupTextSnapshot:e.target.value}))} placeholder="15 Arden Place, LU2 7YE" required/></div>
          <div><label className="label">Dropoff *</label><input className="input" value={f.dropoffTextSnapshot} onChange={e=>setF(p=>({...p,dropoffTextSnapshot:e.target.value}))} placeholder="34 Dunelm Road, TS29 6PX" required/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Reference</label><input className="input" value={f.referenceNumber} onChange={e=>setF(p=>({...p,referenceNumber:e.target.value}))} placeholder="REF001"/></div>
            <div><label className="label">Material</label><input className="input" value={f.materialType} onChange={e=>setF(p=>({...p,materialType:e.target.value}))} placeholder="Type 1..."/></div>
          </div>
          <div><label className="label">Notes</label><textarea className="input min-h-16" value={f.plannerNotes} onChange={e=>setF(p=>({...p,plannerNotes:e.target.value}))} placeholder="Call site before arrival..."/></div>
          <div className="flex items-center gap-2"><input type="checkbox" id="st" checked={f.saveAsTemplate} onChange={e=>setF(p=>({...p,saveAsTemplate:e.target.checked}))}/><label htmlFor="st" className="text-sm cursor-pointer">Save as template</label></div>
          {f.saveAsTemplate && <div><label className="label">Template Name</label><input className="input" value={f.templateName} onChange={e=>setF(p=>({...p,templateName:e.target.value}))} placeholder="Depot A to Site X"/></div>}
          <button type="submit" disabled={loading} className="btn btn-primary w-full mt-2">{loading?"Creating...":"Create Job →"}</button>
        </form>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function JobsPage() {
  const [jobs,       setJobs]       = useState<PlannedJob[]>([]);
  const [drivers,    setDrivers]    = useState<Driver[]>([]);
  const [templates,  setTemplates]  = useState<JobTemplate[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [date,       setDate]       = useState(today());
  const [statusFilter, setStatusFilter] = useState("all");
  const [driverFilter, setDriverFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [noteJobId,  setNoteJobId]  = useState<number | null>(null);
  const [success,    setSuccess]    = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [j, d, t] = await Promise.all([
        jobsApi.list(date),
        driversApi.list("active"),
        jobsApi.templates(),
      ]);
      setJobs(j.data);
      setDrivers(d.data);
      setTemplates(t.data);
    } catch {}
    setLoading(false);
  }, [date]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const i = setInterval(load, 30000); return () => clearInterval(i); }, [load]);

  async function handleStatusChange(id: number, status: string) {
    try {
      await jobsApi.updateStatus(id, status);
      setSuccess(`Job updated to ${status.replace("_"," ")} ✓`);
      load();
    } catch (err: any) { alert(err.message); }
  }

  const filtered = jobs
    .filter(j => statusFilter === "all" || j.status === statusFilter)
    .filter(j => driverFilter === "all" || String(j.assignedDriverId) === driverFilter);

  const stats = {
    total:     jobs.length,
    completed: jobs.filter(j=>j.status==="completed").length,
    active:    jobs.filter(j=>["in_progress","arrived_pickup"].includes(j.status)).length,
    pending:   jobs.filter(j=>["pending","accepted"].includes(j.status)).length,
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-black text-primary">Jobs</h1>
          <p className="text-sm text-muted">{stats.total} total · {stats.completed} done · {stats.active} active · {stats.pending} pending</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="input w-auto text-sm"/>
          <button onClick={load} className="btn btn-outline text-sm">↻</button>
          <Button onClick={()=>setShowCreate(true)}>+ Create Job</Button>
        </div>
      </div>

      {success && <Alert type="success" message={success} />}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <select className="input w-auto" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="arrived_pickup">At Pickup</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select className="input w-auto" value={driverFilter} onChange={e=>setDriverFilter(e.target.value)}>
          <option value="all">All drivers</option>
          {drivers.map(d => <option key={d.id} value={d.id}>{d.displayName}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-muted">Loading jobs...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">📋</div>
          <div className="font-bold text-primary mb-1">No jobs for this date</div>
          <div className="text-sm text-muted mb-4">Create a job or select a different date</div>
          <Button onClick={()=>setShowCreate(true)}>Create Job</Button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-bold text-muted uppercase tracking-wide">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-muted uppercase tracking-wide">Route</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-muted uppercase tracking-wide">Driver</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-muted uppercase tracking-wide">Reference</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-muted uppercase tracking-wide">Material</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-muted uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-muted uppercase tracking-wide">Last Update</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-muted uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(job => (
                  <JobRow
                    key={job.id}
                    job={job}
                    onStatusChange={handleStatusChange}
                    onNote={id => setNoteJobId(id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCreate && (
        <CreatePanel
          drivers={drivers}
          templates={templates}
          date={date}
          onClose={()=>setShowCreate(false)}
          onCreated={()=>{ load(); setSuccess("Job created ✓"); }}
        />
      )}

      {noteJobId && (
        <NoteModal jobId={noteJobId} onClose={()=>{ setNoteJobId(null); load(); }} />
      )}
    </div>
  );
}
