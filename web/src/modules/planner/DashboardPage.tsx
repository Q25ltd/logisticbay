import { useState, useEffect, useCallback } from "react";
import { jobsApi } from "../../api/jobs";
import { driversApi } from "../../api/drivers";
import type { PlannedJob, Driver, JobTemplate } from "../../types";
import { CreateJobPanel } from "../jobs/CreateJobPanel";
import { Badge } from "../../components/Badge";

const today = () => new Date().toISOString().split("T")[0];
const fmt   = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" });

function isAtRisk(job: PlannedJob) {
  if (["completed","cancelled"].includes(job.status)) return false;
  if (job.status === "in_progress") {
    const last = job.events?.[job.events.length - 1];
    if (last && (Date.now() - new Date(last.createdAt).getTime()) / 60000 > 240) return true;
  }
  return false;
}
function hasNote(job: PlannedJob) { return job.events?.some(e => e.eventType === "note_added" && e.note) ?? false; }
function statusIcon(s: string) { return ({ pending:"⬜", accepted:"🔵", in_progress:"🟡", arrived_pickup:"🟣", completed:"✅", cancelled:"❌" }[s] ?? "⬜"); }

function Stat({ value, label, colour }: { value: number|string; label: string; colour?: string }) {
  return (
    <div className="card p-4 text-center">
      <div className={"text-3xl font-black " + (colour ?? "text-primary")}>{value}</div>
      <div className="text-xs text-muted uppercase tracking-wide mt-1">{label}</div>
    </div>
  );
}

function DriverCard({ driver, jobs, onAdd }: { driver: Driver; jobs: PlannedJob[]; onAdd: () => void }) {
  const done   = jobs.filter(j => j.status === "completed").length;
  const active = jobs.filter(j => ["in_progress","arrived_pickup"].includes(j.status));
  const risk   = jobs.some(isAtRisk);
  const notes  = jobs.some(hasNote);
  const border = risk ? "border-red-500" : notes ? "border-yellow-500" : active.length ? "border-accent" : "border-border";

  return (
    <div className={"card border-l-4 " + border + " p-4 min-w-72 flex-shrink-0"}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="font-bold text-primary">{driver.displayName}</div>
          {driver.employeeNumber && <div className="text-xs text-muted">{driver.employeeNumber}</div>}
          {driver.phoneNumber && <a href={"tel:" + driver.phoneNumber} className="text-xs text-accent">📞 {driver.phoneNumber}</a>}
        </div>
        <div className="text-right">
          <div className={"text-xs font-bold px-2 py-1 rounded-full " + (active.length ? "bg-blue-100 text-blue-800" : done ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600")}>
            {active.length ? "Active" : done ? "Done" : "Idle"}
          </div>
          {jobs.length > 0 && <div className="text-xs text-muted mt-1">{done}/{jobs.length}</div>}
        </div>
      </div>

      {jobs.length === 0
        ? <div className="text-xs text-muted italic py-3 text-center border border-dashed border-border rounded">No jobs today</div>
        : <div className="space-y-1.5">
            {jobs.map(job => (
              <div key={job.id} className={"flex items-start gap-2 p-2 rounded text-xs " + (isAtRisk(job) ? "bg-red-50" : hasNote(job) ? "bg-yellow-50" : "bg-gray-50")}>
                <span className="flex-shrink-0 mt-0.5">{statusIcon(job.status)}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-primary truncate">{job.pickupTextSnapshot} → {job.dropoffTextSnapshot}</div>
                  {job.referenceNumber && <div className="text-muted">📋 {job.referenceNumber}</div>}
                  {job.events && job.events.length > 0 && <div className="text-muted">Last: {fmt(job.events[job.events.length-1].createdAt)}</div>}
                  {isAtRisk(job) && <div className="text-red-700 font-semibold">🔴 Stuck — check driver</div>}
                  {hasNote(job)  && <div className="text-yellow-700 font-semibold">⚠ Driver note</div>}
                </div>
                <Badge status={job.status} />
              </div>
            ))}
          </div>
      }
      <button onClick={onAdd} className="mt-3 w-full text-xs text-accent border border-dashed border-accent/40 hover:border-accent hover:bg-blue-50 rounded py-1.5 transition-colors">+ Add Job</button>
    </div>
  );
}


export default function DashboardPage() {
  const [date,    setDate]    = useState(today());
  const [jobs,    setJobs]    = useState<PlannedJob[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [tpls,    setTpls]    = useState<JobTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createFor,  setCreateFor]  = useState<number|undefined>();
  const [refreshed,  setRefreshed]  = useState(new Date());

  const load = useCallback(async () => {
    try {
      const [j,d,t] = await Promise.all([jobsApi.list(date), driversApi.list("active"), jobsApi.templates()]);
      setJobs(j.data); setDrivers(d.data); setTpls(t.data); setRefreshed(new Date());
    } catch {}
    setLoading(false);
  }, [date]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const i = setInterval(load, 30000); return () => clearInterval(i); }, [load]);

  const total     = jobs.length;
  const completed = jobs.filter(j => j.status === "completed").length;
  const active    = jobs.filter(j => ["in_progress","arrived_pickup"].includes(j.status)).length;
  const pending   = jobs.filter(j => ["pending","accepted"].includes(j.status)).length;
  const atRisk    = jobs.filter(isAtRisk).length;
  const withNotes = jobs.filter(hasNote).length;

  const byDriver = drivers.reduce<Record<number,PlannedJob[]>>((acc,d) => { acc[d.id]=jobs.filter(j=>j.assignedDriverId===d.id); return acc; }, {});
  const unassigned = jobs.filter(j => !drivers.find(d => d.id === j.assignedDriverId));

  const alerts: { icon:string; text:string; cls:string }[] = [];
  if (unassigned.length) alerts.push({ icon:"⚠️", text:`${unassigned.length} job(s) not assigned`, cls:"bg-yellow-50 text-yellow-800" });
  jobs.filter(isAtRisk).forEach(j => alerts.push({ icon:"🔴", text:`Stuck: ${j.pickupTextSnapshot} → ${j.dropoffTextSnapshot}`, cls:"bg-red-50 text-red-800" }));
  jobs.filter(hasNote).forEach(j => { const n=j.events?.filter(e=>e.eventType==="note_added").pop(); alerts.push({ icon:"💬", text:`Note on job #${j.id}: "${n?.note??""}"`, cls:"bg-orange-50 text-orange-800" }); });
  drivers.filter(d=>!jobs.find(j=>j.assignedDriverId===d.id)).forEach(d => alerts.push({ icon:"👤", text:`${d.displayName} has no jobs today`, cls:"bg-blue-50 text-blue-800" }));
  if (!alerts.length) alerts.push({ icon:"✅", text:"All clear — no alerts", cls:"bg-green-50 text-green-800" });

  if (loading) return <div className="flex items-center justify-center h-64 text-muted">Loading dispatch board...</div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-black text-primary">Dispatch Board</h1>
          <p className="text-xs text-muted">Refreshed {refreshed.toLocaleTimeString("en-GB")}</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="input w-auto text-sm"/>
          <button onClick={load} className="btn btn-outline text-sm">↻ Refresh</button>
          <button onClick={()=>{ setCreateFor(undefined); setShowCreate(true); }} className="btn btn-primary text-sm">+ Create Job</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
        <Stat value={total}     label="Total"      />
        <Stat value={completed} label="Completed"  colour="text-green-600"  />
        <Stat value={active}    label="Active"     colour="text-accent"     />
        <Stat value={pending}   label="Pending"    colour="text-yellow-600" />
        <Stat value={atRisk}    label="At Risk"    colour={atRisk    ? "text-red-600"    : "text-muted"} />
        <Stat value={drivers.length} label="Drivers" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr,288px] gap-6">
        <div className="overflow-x-auto">
          <div className="flex gap-4 pb-2" style={{ minWidth:"max-content" }}>
            {drivers.map(d => (
              <DriverCard key={d.id} driver={d} jobs={byDriver[d.id]??[]} onAdd={()=>{ setCreateFor(d.id); setShowCreate(true); }}/>
            ))}
            {unassigned.length > 0 && (
              <div className="card border-l-4 border-red-500 p-4 min-w-72 flex-shrink-0">
                <div className="font-bold text-red-600 mb-3">⚠ Unassigned</div>
                {unassigned.map(j => (
                  <div key={j.id} className="bg-red-50 p-2 rounded text-xs mb-2">
                    <div className="font-medium">{j.pickupTextSnapshot} → {j.dropoffTextSnapshot}</div>
                    {j.referenceNumber && <div className="text-muted">📋 {j.referenceNumber}</div>}
                  </div>
                ))}
              </div>
            )}
            {drivers.length === 0 && (
              <div className="card p-8 text-center text-muted min-w-72">
                <div className="text-4xl mb-3">👥</div>
                <div className="font-semibold">No active drivers</div>
                <div className="text-sm mt-1">Add drivers in the Drivers section</div>
              </div>
            )}
          </div>
        </div>

        <div className="card p-4 h-fit">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-primary uppercase tracking-wide">Action Queue</h3>
            {(atRisk + withNotes) > 0 && <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded-full font-bold">{atRisk+withNotes} urgent</span>}
          </div>
          <div className="space-y-2">
            {alerts.map((a,i) => (
              <div key={i} className={"flex items-start gap-2 p-2.5 rounded text-xs " + a.cls}>
                <span>{a.icon}</span><span>{a.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showCreate && (
        <CreateJobPanel
          drivers={drivers}
          templates={tpls}
          date={date}
          initialDriverId={createFor}
          onClose={() => setShowCreate(false)}
          onCreated={load}
        />
      )}
    </div>
  );
}
