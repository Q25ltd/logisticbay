import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { runsApi } from "../../api/runs";
import { driversApi } from "../../api/drivers";
import type { Run, Driver } from "../../types";
import { Alert } from "../../components/Alert";
import { today, addDays } from "../jobs/createJobUtils";

const RUN_BADGE: Record<string, string> = {
  draft:       "pending",
  assigned:    "accepted",
  in_progress: "in_progress",
  completed:   "completed",
  cancelled:   "cancelled",
};

const RUN_LABEL: Record<string, string> = {
  draft:       "Draft",
  assigned:    "Assigned",
  in_progress: "In Progress",
  completed:   "Completed",
  cancelled:   "Cancelled",
};

const STATUS_SORT_ORDER = ["in_progress", "assigned", "draft", "completed", "cancelled"];

function statusSortKey(status: string): number {
  const idx = STATUS_SORT_ORDER.indexOf(status);
  return idx >= 0 ? idx : 99;
}

function RunStatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    draft:       "bg-slate-100 text-slate-600",
    assigned:    "bg-blue-100 text-blue-700",
    in_progress: "bg-amber-100 text-amber-700",
    completed:   "bg-green-100 text-green-700",
    cancelled:   "bg-red-100 text-red-600",
  };
  const cls = colorMap[status] ?? "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {RUN_LABEL[status] ?? status}
    </span>
  );
}

function SummaryCard({
  title,
  lead,
  detail,
  tone = "slate",
}: {
  title: string;
  lead: string;
  detail: string;
  tone?: "slate" | "blue" | "amber" | "green";
}) {
  const toneClass = {
    slate: "border-slate-200",
    blue:  "border-blue-200",
    amber: "border-amber-200",
    green: "border-emerald-200",
  }[tone];

  return (
    <div className={`card p-3 min-h-[86px] ${toneClass}`}>
      <div className="text-xs font-bold uppercase tracking-wide text-muted">{title}</div>
      <div className="mt-1 text-lg font-black text-primary leading-tight">{lead}</div>
      <div className="mt-1 text-xs text-muted leading-snug">{detail}</div>
    </div>
  );
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

export default function DashboardPage() {
  const navigate  = useNavigate();
  const [date,    setDate]    = useState(today());
  const [runs,    setRuns]    = useState<Run[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [runsRes, driversRes] = await Promise.all([
        runsApi.list({ date, limit: 100 }),
        driversApi.list("active"),
      ]);
      setRuns(runsRes.data);
      setDrivers(driversRes.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load dashboard");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const sortedRuns = [...runs].sort((a, b) => statusSortKey(a.status) - statusSortKey(b.status));

  const totalRuns     = runs.length;
  const inProgressCt  = runs.filter(r => r.status === "in_progress").length;
  const assignedCt    = runs.filter(r => r.status === "assigned").length;
  const draftCt       = runs.filter(r => r.status === "draft").length;

  function borderColor(status: string) {
    if (status === "in_progress") return "border-l-4 border-l-green-400";
    if (status === "assigned")    return "border-l-4 border-l-blue-400";
    if (status === "draft")       return "border-l-4 border-l-slate-300";
    return "";
  }

  function assignmentCount(run: Run) {
    return run.assignments?.length ?? 0;
  }

  function driverName(run: Run) {
    if (run.driver) return run.driver.displayName;
    if (run.assignedDriverId) {
      const d = drivers.find(dr => dr.id === run.assignedDriverId);
      return d?.displayName ?? `Driver #${run.assignedDriverId}`;
    }
    return "Unassigned";
  }

  // Build driver coverage: for each active driver, find their run today
  const driverCoverage = drivers.map(driver => {
    const run = runs.find(r => r.assignedDriverId === driver.id && r.status !== "cancelled");
    return { driver, run };
  });

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-muted">Loading dashboard...</div>;
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-black text-primary">Dashboard</h1>
          <p className="text-xs text-muted">Runs for {formatDate(date)}</p>
        </div>
        <div className="flex items-center gap-2 flex-nowrap">
          <button
            type="button"
            onClick={() => setDate(d => addDays(d, -1))}
            className="btn btn-outline text-sm whitespace-nowrap"
          >
            ← Prev
          </button>
          <button
            type="button"
            onClick={() => setDate(today())}
            className={`btn text-sm whitespace-nowrap ${date === today() ? "btn-primary" : "btn-outline"}`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setDate(d => addDays(d, 1))}
            className="btn btn-outline text-sm whitespace-nowrap"
          >
            Next →
          </button>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="input !py-2 text-sm w-36"
          />
          <button type="button" onClick={load} className="btn btn-outline text-sm whitespace-nowrap">Refresh</button>
          <button type="button" onClick={() => navigate("/app/jobs/create")} className="btn btn-primary text-sm whitespace-nowrap">New Job</button>
        </div>
      </div>

      {error && <Alert type="error" message={error} />}

      {/* Summary cards */}
      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <SummaryCard title="Runs Today"  lead={String(totalRuns)}   detail="total runs planned" tone="slate" />
        <SummaryCard title="In Progress" lead={String(inProgressCt)} detail="currently running"  tone="amber" />
        <SummaryCard title="Assigned"    lead={String(assignedCt)}  detail="driver assigned, not started" tone="blue" />
        <SummaryCard title="Draft"       lead={String(draftCt)}     detail="not yet assigned"    tone="slate" />
      </div>

      {/* Main layout */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr),300px]">
        {/* Runs list */}
        <main>
          <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-primary">
            Runs — {formatDate(date)}
          </h2>

          {sortedRuns.length === 0 ? (
            <div className="card p-8 text-center">
              <div className="text-sm font-bold text-primary mb-1">No runs planned for this date</div>
              <div className="text-xs text-muted mb-4">Go to Runs to create one</div>
              <button
                type="button"
                onClick={() => navigate("/app/runs")}
                className="btn btn-outline text-sm"
              >
                Go to Runs
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {sortedRuns.map(run => (
                <div
                  key={run.id}
                  onClick={() => navigate(`/app/runs/${run.id}`)}
                  className={`card p-4 cursor-pointer hover:shadow-md transition-shadow ${borderColor(run.status)} ${run.status === "completed" ? "opacity-60" : ""}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-sm text-primary">
                      {run.runReference}
                    </span>
                    <RunStatusBadge status={run.status} />
                    {run.publishedToDriver && (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                        Published
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
                    {run.plannedDate && (
                      <span>
                        📅 {new Date(run.plannedDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                      </span>
                    )}
                    <span>
                      👤 {driverName(run)}
                    </span>
                    {run.estimatedStartTime && (
                      <span>🕐 {run.estimatedStartTime}</span>
                    )}
                    <span>🗂 {assignmentCount(run)} stop{assignmentCount(run) !== 1 ? "s" : ""}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        {/* Driver coverage sidebar */}
        <aside>
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-black uppercase tracking-wide text-primary">Driver Coverage</h2>
              <button
                type="button"
                onClick={() => navigate("/app/runs")}
                className="text-xs text-accent hover:underline font-semibold"
              >
                Manage Runs →
              </button>
            </div>

            {driverCoverage.length === 0 ? (
              <p className="text-xs text-muted">No active drivers found.</p>
            ) : (
              <div className="space-y-2">
                {driverCoverage.map(({ driver, run }) => (
                  <div key={driver.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-slate-100 last:border-0">
                    <span className="text-sm text-primary font-medium truncate">{driver.displayName}</span>
                    {run ? (
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200 whitespace-nowrap">
                        {run.runReference}
                      </span>
                    ) : (
                      <span className="text-xs text-muted">No run today</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
