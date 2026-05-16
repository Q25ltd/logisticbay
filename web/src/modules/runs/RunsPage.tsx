import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { runsApi } from "../../api/runs";
import type { CreateRunBody } from "../../api/runs";
import { driversApi } from "../../api/drivers";
import type { Run, Driver } from "../../types";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";

const today = () => new Date().toISOString().slice(0, 10);

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

type StatusFilter = "all" | "draft" | "assigned" | "in_progress" | "completed" | "cancelled";

function NewRunModal({
  drivers,
  onClose,
  onCreated,
}: {
  drivers: Driver[];
  onClose: () => void;
  onCreated: (run: Run) => void;
}) {
  const [plannedDate, setPlannedDate] = useState(today());
  const [driverId, setDriverId] = useState("");
  const [estimatedStartTime, setEstimatedStartTime] = useState("");
  const [plannerNotes, setPlannerNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!plannedDate) { setError("Planned date is required"); return; }
    setSaving(true);
    setError("");
    try {
      const body: CreateRunBody = {
        plannedDate,
        assignedDriverId: driverId ? Number(driverId) : null,
        estimatedStartTime: estimatedStartTime || null,
        plannerNotes: plannerNotes || undefined,
      };
      const run = await runsApi.create(body);
      onCreated(run);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create run");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-primary">New Run</h2>
          <button onClick={onClose} className="text-muted hover:text-primary text-2xl leading-none w-8 h-8 flex items-center justify-center">×</button>
        </div>
        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-primary mb-1">Planned Date <span className="text-red-500">*</span></label>
            <input
              type="date"
              className="input w-full"
              value={plannedDate}
              onChange={e => setPlannedDate(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-primary mb-1">Driver <span className="text-muted text-xs">(optional)</span></label>
            <select className="input w-full" value={driverId} onChange={e => setDriverId(e.target.value)}>
              <option value="">— No driver assigned —</option>
              {drivers.filter(d => d.status === "active").map(d => (
                <option key={d.id} value={d.id}>{d.displayName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-primary mb-1">Estimated Start Time <span className="text-muted text-xs">(optional)</span></label>
            <input
              type="time"
              className="input w-full"
              value={estimatedStartTime}
              onChange={e => setEstimatedStartTime(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-primary mb-1">Planner Notes <span className="text-muted text-xs">(optional)</span></label>
            <textarea
              className="input w-full"
              rows={3}
              value={plannerNotes}
              onChange={e => setPlannerNotes(e.target.value)}
              placeholder="Any notes for planning this run..."
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" className="flex-1" loading={saving}>Create Run</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function RunsPage() {
  const navigate = useNavigate();
  const [date, setDate] = useState(today());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [runs, setRuns] = useState<Run[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params: { date: string; status?: string } = { date };
      if (statusFilter !== "all") params.status = statusFilter;
      const res = await runsApi.list(params);
      setRuns(res.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load runs");
    } finally {
      setLoading(false);
    }
  }, [date, statusFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    driversApi.list("active").then(res => setDrivers(res.data)).catch(() => {});
  }, []);

  const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
    { label: "All", value: "all" },
    { label: "Draft", value: "draft" },
    { label: "Assigned", value: "assigned" },
    { label: "In Progress", value: "in_progress" },
    { label: "Completed", value: "completed" },
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-primary">Runs</h1>
          <p className="text-muted text-sm mt-0.5">Plan and manage driver runs</p>
        </div>
        <Button variant="primary" onClick={() => setShowNewModal(true)}>+ New Run</Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <input
          type="date"
          className="input"
          value={date}
          onChange={e => setDate(e.target.value)}
          style={{ width: "auto" }}
        />
        <div className="flex gap-1 flex-wrap">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={
                "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors " +
                (statusFilter === f.value
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-muted border-border hover:border-primary hover:text-primary")
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      {/* Loading */}
      {loading && (
        <div className="text-center py-12 text-muted">Loading runs...</div>
      )}

      {/* Empty state */}
      {!loading && runs.length === 0 && (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🚛</div>
          <p className="text-primary font-semibold mb-1">No runs found</p>
          <p className="text-muted text-sm mb-6">Create a run to start planning</p>
          <Button variant="primary" onClick={() => setShowNewModal(true)}>+ New Run</Button>
        </div>
      )}

      {/* Run cards */}
      {!loading && runs.length > 0 && (
        <div className="space-y-3">
          {runs.map(run => (
            <div
              key={run.id}
              className="card p-4 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/app/runs/${run.id}`)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-bold text-primary">{run.runReference}</span>
                    <Badge status={RUN_STATUS_BADGE[run.status] ?? run.status} label={RUN_STATUS_LABELS[run.status] ?? run.status} />
                    {run.publishedToDriver && (
                      <span className="badge badge-completed text-xs">Published</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted">
                    {run.plannedDate && (
                      <span>📅 {new Date(run.plannedDate + "T12:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span>
                    )}
                    {run.driver && <span>👤 {run.driver.displayName}</span>}
                    {!run.driver && run.assignedDriverId && <span className="text-amber-600">Driver assigned</span>}
                    {run.assignments && (
                      <span>🛑 {run.assignments.length} stop{run.assignments.length !== 1 ? "s" : ""}</span>
                    )}
                  </div>
                </div>
                <span className="text-muted text-lg flex-shrink-0">›</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNewModal && (
        <NewRunModal
          drivers={drivers}
          onClose={() => setShowNewModal(false)}
          onCreated={run => {
            setShowNewModal(false);
            navigate(`/app/runs/${run.id}`);
          }}
        />
      )}
    </div>
  );
}
