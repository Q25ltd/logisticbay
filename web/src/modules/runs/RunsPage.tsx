import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { runsApi } from "../../api/runs";
import type { Run } from "../../types";
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

export default function RunsPage() {
  const navigate = useNavigate();
  const [date, setDate] = useState(today());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
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
          <p className="text-muted text-sm mt-0.5">View and manage driver runs</p>
        </div>
        <Link to="/app/planning">
          <Button variant="primary">📅 Plan runs</Button>
        </Link>
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
          <p className="text-primary font-semibold mb-1">No runs found for this date</p>
          <p className="text-muted text-sm mb-6">Use the Planning Board to build runs from today's jobs</p>
          <Link to="/app/planning">
            <Button variant="primary">📅 Go to Planning Board</Button>
          </Link>
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

    </div>
  );
}
