import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { jobsApi } from "../../api/jobs";
import type { PlannedJob, JobTemplate } from "../../types";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Alert } from "../../components/Alert";
import {
  ACTIVE_JOB_STATUSES,
  JOB_STATUS_FLOW,
  PENDING_JOB_STATUSES,
  PROGRESSABLE_JOB_STATUSES,
} from "../../constants/jobStatuses";

// ── Formatters ────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().split("T")[0];

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "2026-05-27" or "2026-05-27T00:00:00.000Z" → "27 May" */
const fmtShort = (iso: string) =>
  new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** "2026-05-27" or "2026-05-27T00:00:00.000Z" → "Wed" */
const fmtWeekday = (iso: string) =>
  new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short" });

/** "some_snake" → "Some snake" */
function cap(s: string): string {
  const spaced = s.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// ── Constants ─────────────────────────────────────────────────────────────────

const RANGE_PRESETS = [
  { label: "Today",  back: 0,  fwd: 0  },
  { label: "← 7d",  back: 7,  fwd: 0  },
  { label: "7d →",  back: 0,  fwd: 7  },
  { label: "← 14d", back: 14, fwd: 0  },
  { label: "14d →", back: 0,  fwd: 14 },
  { label: "← 30d", back: 30, fwd: 0  },
  { label: "30d →", back: 0,  fwd: 30 },
];

const PLANNING_LABELS: Record<string, string> = {
  no_stops:          "No stops",
  not_planned:       "Not planned",
  partially_planned: "Partly planned",
  planned:           "Planned",
  partially_done:    "In progress",
  done:              "Done",
};

const PLANNING_COLORS: Record<string, string> = {
  no_stops:          "bg-slate-100 text-slate-500",
  not_planned:       "bg-red-100 text-red-700",
  partially_planned: "bg-amber-100 text-amber-700",
  planned:           "bg-blue-100 text-blue-700",
  partially_done:    "bg-purple-100 text-purple-700",
  done:              "bg-green-100 text-green-700",
};

const STATUS_OPTIONS = [
  { value: "all",            label: "All statuses"   },
  { value: "draft",          label: "Draft"          },
  { value: "pending_review", label: "Pending review" },
  { value: "ready_to_plan",  label: "Ready to plan"  },
  { value: "in_planning",    label: "In planning"    },
  { value: "planned",        label: "Planned"        },
  { value: "in_progress",    label: "In progress"    },
  { value: "completed",      label: "Completed"      },
  { value: "cancelled",      label: "Cancelled"      },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function PlanningBadge({ status }: { status?: string }) {
  if (!status) return null;
  const label = PLANNING_LABELS[status] ?? cap(status);
  const cls   = PLANNING_COLORS[status] ?? "bg-slate-100 text-slate-500";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function hasStatus(statuses: readonly string[], status: string) {
  return statuses.includes(status);
}

function nextJobStatus(status: string) {
  const index = JOB_STATUS_FLOW.findIndex(v => v === status);
  return index >= 0 ? JOB_STATUS_FLOW[index + 1] : undefined;
}

function statusActionLabel(status: string) {
  switch (status) {
    case "in_progress": return "▶ Start";
    case "completed":   return "✓ Complete";
    default:            return cap(status);
  }
}

/** Return the first/last stop for a given role, checking all relevant type names. */
function firstStop(job: PlannedJob, role: "from" | "to") {
  const types = role === "from" ? ["pickup", "collection"] : ["dropoff", "delivery"];
  const matching = (job.stops ?? [])
    .filter(s => types.includes(s.type))
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  return role === "from" ? (matching[0] ?? null) : (matching[matching.length - 1] ?? null);
}

function stopName(stop: ReturnType<typeof firstStop>): string {
  return (stop as any)?.siteName || stop?.locationTextSnapshot || (stop as any)?.town || "—";
}

function stopSubtext(stop: ReturnType<typeof firstStop>): string {
  const s = stop as any;
  return [s?.town, s?.postcode].filter(Boolean).join(" ") || "";
}

function jobMaterial(job: PlannedJob) {
  return job.goodsDescription || (job.goodsType ? cap(job.goodsType) : null);
}

function jobQuantity(job: PlannedJob) {
  return job.quantity != null ? `${job.quantity} ${job.quantityUnit || ""}`.trim() : "";
}

// ── Job row ───────────────────────────────────────────────────────────────────

function JobMenu({ job, onNote, onEdit, onDelete, onView }: {
  job: PlannedJob;
  onNote:   (id: number) => void;
  onEdit:   (id: number) => void;
  onDelete: (job: PlannedJob) => void;
  onView:   (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 text-lg leading-none"
        title="Actions"
      >
        ⋮
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-20 w-36 bg-white border border-border rounded-lg shadow-lg py-1 text-sm">
            <button onClick={() => { setOpen(false); onView(job.id); }}
              className="w-full text-left px-3 py-2 hover:bg-slate-50 text-primary font-medium">
              👁 View
            </button>
            <button onClick={() => { setOpen(false); onEdit(job.id); }}
              className="w-full text-left px-3 py-2 hover:bg-slate-50 text-primary">
              ✏️ Edit
            </button>
            <button onClick={() => { setOpen(false); onNote(job.id); }}
              className="w-full text-left px-3 py-2 hover:bg-slate-50 text-muted">
              📝 Add note
            </button>
            <div className="border-t border-slate-100 my-1" />
            <button onClick={() => { setOpen(false); onDelete(job); }}
              className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 font-medium">
              🗑 Cancel job
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function JobRow({ job, onStatusChange, onNote, onEdit, onDelete, onView }: {
  job: PlannedJob;
  onStatusChange: (id: number, status: string) => void;
  onNote:   (id: number) => void;
  onEdit:   (id: number) => void;
  onDelete: (job: PlannedJob) => void;
  onView:   (id: number) => void;
}) {
  const canProgress = hasStatus(PROGRESSABLE_JOB_STATUSES, job.status);
  const nextStatus  = nextJobStatus(job.status);
  const lastEvent   = job.events?.[job.events.length - 1];
  const hasNote     = job.events?.some(e => e.eventType === "note_added" && e.note);

  const from = firstStop(job, "from");
  const to   = firstStop(job, "to");
  const fromName = stopName(from);
  const toName   = stopName(to);
  const fromSub  = stopSubtext(from);
  const toSub    = stopSubtext(to);
  const material = jobMaterial(job);

  return (
    <tr
      className={"hover:bg-blue-50/40 transition-colors cursor-pointer " + (hasNote ? "bg-yellow-50" : "")}
      onClick={() => onView(job.id)}
    >
      {/* Date */}
      <td className="px-4 py-3 text-sm whitespace-nowrap" style={{ color: "#6b7280" }}>
        {job.plannedDate ? (
          <>
            <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#9ca3af" }}>
              {fmtWeekday(job.plannedDate)}
            </div>
            <div className="font-medium" style={{ color: "#0f172a" }}>
              {fmtShort(job.plannedDate)}
            </div>
          </>
        ) : (
          <span className="text-xs italic" style={{ color: "#9ca3af" }}>Draft</span>
        )}
      </td>

      {/* Route */}
      <td className="px-4 py-3 max-w-xs">
        <div className="text-sm font-medium truncate" style={{ color: "#0f172a" }}>{fromName}</div>
        <div className="text-xs flex items-center gap-1 mt-0.5" style={{ color: "#6b7280" }}>
          <span>→</span>
          <span className="truncate">{toName}</span>
        </div>
        {(fromSub || toSub) && (
          <div className="text-xs mt-0.5 truncate" style={{ color: "#9ca3af" }}>
            {fromSub}{fromSub && toSub ? " → " : ""}{toSub}
          </div>
        )}
      </td>

      {/* Job ref + planning */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          {job.jobReference
            ? <span className="font-mono font-semibold text-sm" style={{ color: "#0f172a" }}>{job.jobReference}</span>
            : <span className="text-xs italic" style={{ color: "#9ca3af" }}>No ref yet</span>}
          <PlanningBadge status={job.planningStatus} />
        </div>
        {job.customerName && (
          <div className="text-xs mt-0.5 truncate" style={{ color: "#6b7280" }}>{job.customerName}</div>
        )}
      </td>

      {/* Material */}
      <td className="px-4 py-3 text-sm max-w-xs">
        {material ? (
          <>
            <div className="truncate" style={{ color: "#374151" }}>{material}</div>
            {jobQuantity(job) && (
              <div className="text-xs mt-0.5" style={{ color: "#9ca3af" }}>{jobQuantity(job)}</div>
            )}
          </>
        ) : (
          <span style={{ color: "#d1d5db" }}>—</span>
        )}
      </td>

      {/* Status */}
      <td className="px-4 py-3"><Badge status={job.status} /></td>

      {/* Last update */}
      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "#9ca3af" }}>
        {lastEvent
          ? new Date(lastEvent.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
          : "—"}
        {hasNote && <span className="ml-1 text-yellow-500">●</span>}
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          {canProgress && nextStatus && (
            <button
              onClick={e => { e.stopPropagation(); onStatusChange(job.id, nextStatus); }}
              className="text-xs text-accent hover:underline font-semibold whitespace-nowrap"
            >
              {statusActionLabel(nextStatus)}
            </button>
          )}
          <JobMenu job={job} onView={onView} onEdit={onEdit} onNote={onNote} onDelete={onDelete} />
        </div>
      </td>
    </tr>
  );
}

// ── Note modal ────────────────────────────────────────────────────────────────

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
        <h3 className="font-bold text-primary mb-4">Add note to job #{jobId}</h3>
        <textarea className="input min-h-24 mb-4" value={note} onChange={e => setNote(e.target.value)}
          placeholder="Site closed, delay, issue..." autoFocus />
        <div className="flex gap-3">
          <Button className="flex-1" onClick={submit} loading={loading}>Save note</Button>
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function JobsPage() {
  const navigate = useNavigate();
  const [jobs,         setJobs]         = useState<PlannedJob[]>([]);
  const [templates,    setTemplates]    = useState<JobTemplate[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");
  const [dateRange,    setDateRange]    = useState({ from: today(), to: today() });
  const [statusFilter, setStatusFilter] = useState("all");
  const [noteJobId,    setNoteJobId]    = useState<number | null>(null);
  const [success,      setSuccess]      = useState("");

  function applyRange(back: number, fwd: number) {
    setDateRange({ from: addDays(today(), -back), to: addDays(today(), fwd) });
  }

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [j, t] = await Promise.all([
        jobsApi.listRange(dateRange.from, dateRange.to),
        jobsApi.templates(),
      ]);
      setJobs(j.data); setTemplates(t.data);
    } catch (err: any) { setError(err.message); }
    setLoading(false);
  }, [dateRange]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const i = setInterval(load, 30000); return () => clearInterval(i); }, [load]);

  async function handleStatusChange(id: number, status: string) {
    try {
      await jobsApi.updateStatus(id, status);
      setSuccess("Status updated");
      setTimeout(() => setSuccess(""), 3000);
      load();
    } catch (err: any) { alert(err.message); }
  }

  async function handleDelete(job: PlannedJob) {
    const label = job.jobReference || `job #${job.id}`;
    if (!window.confirm(`Cancel ${label}?\n\nIt will be hidden from active planning but kept for audit history.`)) return;
    try {
      await jobsApi.remove(job.id);
      setSuccess("Job cancelled");
      setTimeout(() => setSuccess(""), 3000);
      load();
    } catch (err: any) { alert(err.message); }
  }

  const filtered = jobs.filter(j => statusFilter === "all" || j.status === statusFilter);

  const stats = {
    total:     jobs.length,
    completed: jobs.filter(j => j.status === "completed").length,
    active:    jobs.filter(j => hasStatus(ACTIVE_JOB_STATUSES, j.status)).length,
    pending:   jobs.filter(j => hasStatus(PENDING_JOB_STATUSES, j.status)).length,
  };

  const rangeLabel = dateRange.from === dateRange.to
    ? fmtShort(dateRange.from)
    : `${fmtShort(dateRange.from)} – ${fmtShort(dateRange.to)}`;

  void templates;

  return (
    <div className="p-4 sm:p-6">

      {/* Header */}
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          <h1 className="text-xl font-black text-primary">Jobs</h1>
          <div className="flex items-center gap-1.5 flex-wrap mt-1">
            {([
              { n: stats.total,     label: "total"  , hi: ""                                              },
              { n: stats.completed, label: "done"   , hi: stats.completed > 0 ? "text-green-600" : ""    },
              { n: stats.active,    label: "active" , hi: stats.active    > 0 ? "text-blue-600"  : ""    },
              { n: stats.pending,   label: "pending", hi: stats.pending   > 0 ? "text-amber-600" : ""    },
            ] as { n: number; label: string; hi: string }[]).map(({ n, label, hi }, i) => (
              <React.Fragment key={label}>
                {i > 0 && <span className="text-slate-300 select-none">·</span>}
                <span className="text-sm text-muted">
                  <span className={`font-bold ${hi || "text-slate-700"}`}>{n}</span> {label}
                </span>
              </React.Fragment>
            ))}
            <span className="text-slate-300 select-none mx-0.5">·</span>
            <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{rangeLabel}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={load} className="btn btn-outline text-sm px-3" title="Refresh">↻</button>
          <Button onClick={() => navigate("/app/jobs/create")}>+ New Job</Button>
        </div>
      </div>

      {/* Date range presets */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {RANGE_PRESETS.map(({ label, back, fwd }) => {
          const isActive = dateRange.from === addDays(today(), -back) && dateRange.to === addDays(today(), fwd);
          return (
            <button key={label} type="button" onClick={() => applyRange(back, fwd)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                isActive
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-slate-600 border-slate-300 hover:border-primary hover:text-primary"
              }`}>
              {label}
            </button>
          );
        })}
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

      {/* Status filter */}
      <div className="flex items-center gap-2 mb-4">
        <select
          className="input flex-1 sm:flex-none sm:w-48 text-sm"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          {STATUS_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-12 text-muted">Loading jobs…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">📋</div>
          <div className="font-bold text-primary mb-1">No jobs for this period</div>
          <div className="text-sm text-muted mb-4">Try a different date range or create a new job</div>
          <Button onClick={() => navigate("/app/jobs/create")}>Create job</Button>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-slate-50">
                    {["Date", "Route", "Job ref / Planning", "Load", "Status", "Updated", ""].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-bold text-muted uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
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
              const nextStatus  = nextJobStatus(job.status);
              const from = firstStop(job, "from");
              const to   = firstStop(job, "to");
              const material = jobMaterial(job);
              return (
                <div key={job.id} className="card p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2 cursor-pointer" onClick={() => navigate(`/app/jobs/${job.id}`)}>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-primary truncate">{stopName(from)}</div>
                      <div className="text-xs text-muted truncate">→ {stopName(to)}</div>
                    </div>
                    <Badge status={job.status} />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted flex-wrap">
                    {job.plannedDate && <span>📅 {fmtWeekday(job.plannedDate)} {fmtShort(job.plannedDate)}</span>}
                    {material && <span>📦 {material}</span>}
                    <div className="flex items-center gap-2">
                      {job.jobReference
                        ? <span className="font-mono font-semibold text-primary">{job.jobReference}</span>
                        : <span className="italic text-muted">No ref yet</span>}
                      <PlanningBadge status={job.planningStatus} />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 pt-1 border-t border-slate-100">
                    {canProgress && nextStatus && (
                      <button onClick={() => handleStatusChange(job.id, nextStatus)}
                        className="text-xs font-semibold text-accent bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors">
                        {statusActionLabel(nextStatus)}
                      </button>
                    )}
                    <div className="ml-auto">
                      <JobMenu
                        job={job}
                        onView={id => navigate(`/app/jobs/${id}`)}
                        onEdit={id => navigate(`/app/jobs/${id}/edit`)}
                        onNote={id => setNoteJobId(id)}
                        onDelete={handleDelete}
                      />
                    </div>
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
