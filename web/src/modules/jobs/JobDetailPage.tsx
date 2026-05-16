import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { jobsApi } from "../../api/jobs";
import type { PlannedJob } from "../../types";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Alert } from "../../components/Alert";

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

const EVENT_LABELS: Record<string, string> = {
  started:         "▶ Started",
  arrived_pickup:  "📍 Arrived at pickup",
  collected:       "✅ Collected",
  arrived_dropoff: "📍 Arrived at dropoff",
  completed:       "✅ Completed",
  cancelled:       "🚫 Cancelled",
  note_added:      "📝 Note",
  status_override: "⚙ Status override",
  driver_assigned: "👤 Driver assigned",
};

const STATUS_FLOW = [
  "pending","accepted","in_progress","arrived_pickup",
  "collected","arrived_dropoff","completed",
] as const;

const STATUS_LABELS: Record<string, string> = {
  pending:         "Pending",
  accepted:        "Accepted",
  in_progress:     "In Progress",
  arrived_pickup:  "At Pickup",
  collected:       "Collected",
  arrived_dropoff: "At Dropoff",
  completed:       "Completed",
  cancelled:       "Cancelled",
};

function StatusOverridePanel({ job, onSaved }: { job: PlannedJob; onSaved: () => void }) {
  const [status,  setStatus]  = useState<string>(job.status);
  const [note,    setNote]    = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  async function save() {
    if (status === job.status && !note.trim()) return;
    setLoading(true); setError("");
    try {
      await jobsApi.updateStatus(job.id, status, note.trim() || undefined);
      onSaved();
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="card p-4">
      <h2 className="font-bold text-primary mb-3">Status Override</h2>
      {error && <Alert type="error" message={error} />}
      <label className="block text-sm font-semibold mb-1">Status</label>
      <select className="input w-full mb-3" value={status} onChange={e => setStatus(e.target.value)}>
        {STATUS_FLOW.map(s => (
          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
        ))}
        <option value="cancelled">Cancelled</option>
      </select>
      <label className="block text-sm font-semibold mb-1">Override note (optional)</label>
      <textarea className="input w-full min-h-16 mb-3" value={note} onChange={e => setNote(e.target.value)}
        placeholder="Reason for manual override..." />
      <Button className="w-full" onClick={save} loading={loading}
        disabled={status === job.status && !note.trim()}>
        Apply Override
      </Button>
    </div>
  );
}

export default function JobDetailPage() {
  const { id }      = useParams<{ id: string }>();
  const navigate    = useNavigate();
  const [job,       setJob]     = useState<PlannedJob | null>(null);
  const [loading,   setLoading] = useState(true);
  const [error,     setError]   = useState("");
  const [success,   setSuccess] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const j = await jobsApi.get(parseInt(id!, 10));
      setJob(j);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [id]);

  function onSaved(msg = "Saved ✓") {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
    load();
  }

  if (loading) return <div className="p-6 text-center text-muted">Loading...</div>;
  if (error)   return <div className="p-6"><Alert type="error" message={error} /></div>;
  if (!job)    return null;

  const plannedQty  = job.loadDetails?.quantity ?? job.quantityExpected;
  const plannedUnit = job.loadDetails?.unit     ?? job.quantityUnit;
  const stops       = [...(job.stops ?? [])].sort((a, b) => a.sequenceNumber - b.sequenceNumber);

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <button onClick={() => navigate("/app/jobs")}
            className="text-xs text-muted hover:text-primary mb-2 block">← Back to Jobs</button>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-black text-primary">
              {job.jobReference || `Job #${job.id}`}
            </h1>
            <Badge status={job.status} />
          </div>
          {job.plannedDate && (
            <p className="text-sm text-muted mt-1">{fmtDate(job.plannedDate)}</p>
          )}
        </div>
        <Button variant="outline" onClick={() => navigate(`/app/jobs/${job.id}/edit`)}>Edit Job</Button>
      </div>

      {success && <Alert type="success" message={success} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — main info */}
        <div className="lg:col-span-2 space-y-5">

          {/* Route & load summary */}
          <div className="card p-4 space-y-3">
            <h2 className="font-bold text-primary">Job Summary</h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <span className="text-muted text-xs uppercase tracking-wide">Customer</span>
                <div className="font-medium">{job.customerName || job.customer?.name || "—"}</div>
              </div>
              <div>
                <span className="text-muted text-xs uppercase tracking-wide">Job Type</span>
                <div className="font-medium">{job.jobType || job.serviceType || "—"}</div>
              </div>
              <div>
                <span className="text-muted text-xs uppercase tracking-wide">Cust. Ref</span>
                <div className="font-medium font-mono">{job.customerRef || "—"}</div>
              </div>
              <div>
                <span className="text-muted text-xs uppercase tracking-wide">Priority</span>
                <div className="font-medium capitalize">{job.priority || "Normal"}</div>
              </div>
            </div>
          </div>

          {/* Load — planned vs actual */}
          <div className="card p-4">
            <h2 className="font-bold text-primary mb-3">Load</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted text-xs uppercase tracking-wide">Material</span>
                <div className="font-medium">
                  {job.loadDetails?.materialType || job.materialType || "—"}
                </div>
              </div>
              <div>
                <span className="text-muted text-xs uppercase tracking-wide">Planned Qty</span>
                <div className="font-medium">
                  {plannedQty ? `${plannedQty} ${plannedUnit || ""}`.trim() : "—"}
                </div>
              </div>
              {job.loadDetails?.weight && (
                <div>
                  <span className="text-muted text-xs uppercase tracking-wide">Weight</span>
                  <div className="font-medium">{job.loadDetails.weight} t</div>
                </div>
              )}
            </div>
            {job.plannerNotes && (
              <div className="mt-3 text-sm bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <span className="font-semibold text-yellow-800">Planner notes: </span>
                <span className="text-yellow-900">{job.plannerNotes}</span>
              </div>
            )}
          </div>

          {/* Stops */}
          {stops.length > 0 && (
            <div className="card p-4">
              <h2 className="font-bold text-primary mb-3">Stops</h2>
              <div className="space-y-3">
                {stops.map((stop, i) => (
                  <div key={stop.id ?? i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${
                        stop.type === "pickup" || stop.type === "collection" ? "bg-blue-500"
                        : stop.type === "dropoff" || stop.type === "delivery" ? "bg-green-500"
                        : "bg-slate-400"
                      }`}>
                        {stop.sequenceNumber}
                      </div>
                      {i < stops.length - 1 && <div className="w-0.5 bg-slate-200 flex-1 my-1" />}
                    </div>
                    <div className="flex-1 pb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                          {stop.type}
                        </span>
                        {stop.referenceNumber && (
                          <span className="text-xs font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                            {stop.referenceNumber}
                          </span>
                        )}
                        {stop.status && (
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                            stop.status === "completed" ? "bg-green-100 text-green-700"
                            : "bg-slate-100 text-slate-600"
                          }`}>
                            {stop.status}
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-medium text-primary mt-0.5">
                        {stop.siteName || stop.locationTextSnapshot}
                      </div>
                      {stop.siteName && stop.locationTextSnapshot !== stop.siteName && (
                        <div className="text-xs text-muted">{stop.locationTextSnapshot}</div>
                      )}
                      {(stop.timeWindowStart || stop.bookedTime) && (
                        <div className="text-xs text-slate-500 mt-1">
                          {stop.bookedTime && <span>Booked: {stop.bookedTime}</span>}
                          {stop.timeWindowStart && !stop.bookedTime && (
                            <span>Window: {stop.timeWindowStart}{stop.timeWindowEnd ? ` – ${stop.timeWindowEnd}` : ""}</span>
                          )}
                        </div>
                      )}
                      {stop.contactName && (
                        <div className="text-xs text-muted mt-0.5">{stop.contactName} {stop.contactPhone && `· ${stop.contactPhone}`}</div>
                      )}
                      {stop.numPallets != null && (
                        <div className="text-xs text-slate-600 mt-0.5">Pallets: {stop.numPallets}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Events timeline */}
          {job.events && job.events.length > 0 && (
            <div className="card p-4">
              <h2 className="font-bold text-primary mb-3">Activity</h2>
              <div className="space-y-2">
                {job.events.map(ev => (
                  <div key={ev.id} className="flex gap-3 text-sm">
                    <div className="text-xs text-muted w-28 flex-shrink-0 pt-0.5">
                      {fmt(ev.createdAt)}
                    </div>
                    <div>
                      <span className="font-semibold">
                        {EVENT_LABELS[ev.eventType] ?? ev.eventType}
                      </span>
                      {ev.note && <div className="text-muted text-xs mt-0.5">{ev.note}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Driver & Vehicle card */}
          <div className="card p-4">
            <h2 className="font-bold text-primary mb-2">Driver & Vehicle</h2>
            <p className="text-sm text-muted mb-3">
              Driver and vehicle assignment is managed via Runs.
            </p>
            <button
              type="button"
              onClick={() => navigate("/app/runs")}
              className="btn btn-outline w-full text-sm"
            >
              Go to Runs →
            </button>
          </div>

          <StatusOverridePanel job={job} onSaved={() => onSaved("Status updated ✓")} />

          {/* Metadata */}
          <div className="card p-4 text-xs text-muted space-y-1">
            <div>Created: {fmt(job.createdAt)}</div>
            <div>Updated: {fmt(job.updatedAt)}</div>
            <div>Job ID: #{job.id}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
