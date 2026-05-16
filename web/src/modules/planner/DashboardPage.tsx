import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { dashboardApi } from "../../api/dashboard";
import { driversApi }   from "../../api/drivers";
import type { Driver, FleetTrailer, FleetUnit, PlannedJob } from "../../types";
import { Alert } from "../../components/Alert";
import type { JobContext } from "./dashboardTypes";
import {
  dayKey,
  earliestTimeRank,
  hasMissingPlanningInfo,
  isClosed,
  makeJobContext,
  riskRank,
} from "./dashboardUtils";
import JobCard from "./JobCard";
import DriverSnapshot from "./DriverSnapshot";
import FleetSnapshot from "./FleetSnapshot";
import QuickFixDrawer from "./QuickFixDrawer";
import JobDetailDrawer from "./JobDetailDrawer";

function SummaryCard({
  title,
  lead,
  detail,
  tone = "slate",
  onClick,
}: {
  title: string;
  lead: string;
  detail: string;
  tone?: "slate" | "blue" | "amber" | "green";
  onClick?: () => void;
}) {
  const toneClass = {
    slate: "border-slate-200 hover:border-slate-300",
    blue: "border-blue-200 hover:border-blue-300",
    amber: "border-amber-200 hover:border-amber-300",
    green: "border-emerald-200 hover:border-emerald-300",
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`card p-3 text-left min-h-[86px] transition-colors ${toneClass}`}
    >
      <div className="text-xs font-bold uppercase tracking-wide text-muted">{title}</div>
      <div className="mt-1 text-lg font-black text-primary leading-tight">{lead}</div>
      <div className="mt-1 text-xs text-muted leading-snug">{detail}</div>
    </button>
  );
}

function FilterPill({ active, children, onClick }: { active: boolean; children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
        active ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-blue-300"
      }`}
    >
      {children}
    </button>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

export default function DashboardPage() {
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState({ from: today(), to: today() });

  function addDays(dateStr: string, n: number) {
    const d = new Date(dateStr + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function applyRange(back: number, forward: number) {
    setDateRange({ from: addDays(today(), -back), to: addDays(today(), forward) });
  }
  const [jobs, setJobs] = useState<PlannedJob[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [units, setUnits] = useState<FleetUnit[]>([]);
  const [trailers, setTrailers] = useState<FleetTrailer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [refreshed, setRefreshed] = useState(new Date());

  const [statusFilter, setStatusFilter] = useState("default");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [warningOnly, setWarningOnly] = useState(false);
  const [loadedOnly, setLoadedOnly] = useState(false);
  const [carriedOnly, setCarriedOnly] = useState(false);

  const [details, setDetails] = useState<JobContext | null>(null);
  const [quickFix, setQuickFix] = useState<JobContext | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await dashboardApi.load(dateRange.from, dateRange.to);
      setJobs(res.jobs);
      setDrivers(res.drivers);
      setUnits(res.units);
      setTrailers(res.trailers);
      setRefreshed(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load dashboard");
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const contexts = useMemo(() => {
    return jobs
      .map((job) => makeJobContext(job, drivers, units, trailers, today()))
      .filter((context) => {
        // Closed jobs only show if planned within the selected range
        if (isClosed(context.job)) {
          const planned = dayKey(context.job.plannedDate);
          return !!planned && planned >= dateRange.from && planned <= dateRange.to;
        }
        // All open jobs always show
        return true;
      });
  }, [jobs, drivers, units, trailers, dateRange]);

  const filteredContexts = useMemo(() => {
    return contexts
      .filter((context) => {
        if (statusFilter === "default" && ["draft", "completed", "cancelled"].includes(context.status)) return false;
        if (statusFilter !== "default" && context.status !== statusFilter) return false;
        if (customerFilter !== "all" && context.customer !== customerFilter) return false;
        if (vehicleFilter !== "all" && context.vehicle !== vehicleFilter) return false;
        if (warningOnly && !context.warnings.some((w) => w.level === "critical" || w.level === "warning")) return false;
        if (loadedOnly && !context.loadedTrailer) return false;
        if (carriedOnly && !context.isCarriedOver) return false;
        return true;
      })
      .sort((a, b) => (
        riskRank(a) - riskRank(b)
        || earliestTimeRank(a.job) - earliestTimeRank(b.job)
        || a.route.localeCompare(b.route)
      ));
  }, [contexts, statusFilter, customerFilter, vehicleFilter, warningOnly, loadedOnly, carriedOnly]);

  const customerOptions = useMemo(() => Array.from(new Set(contexts.map((context) => context.customer))).sort(), [contexts]);
  const vehicleOptions = useMemo(() => Array.from(new Set(contexts.map((context) => context.vehicle))).sort(), [contexts]);

  const openContexts = contexts.filter((context) => !isClosed(context.job));
  const completedContexts = contexts.filter((context) => context.status === "completed");
  const needsPlanning = contexts.filter((context) => ["needs_planning", "ready_to_plan", "draft"].includes(context.status)).length;
  const planned = contexts.filter((context) => context.status === "planned").length;
  const active = contexts.filter((context) => context.status === "active").length;
  const criticalIssues = contexts.flatMap((context) => context.warnings).filter((warning) => warning.level === "critical").length;
  const allWarnings = contexts.flatMap((context) => context.warnings);
  const missingInfo = allWarnings.filter(hasMissingPlanningInfo).length;
  const mismatches = allWarnings.filter((warning) => warning.type.includes("mismatch")).length;
  const unavailableDrivers = drivers.filter((driver) => driver.status !== "active" || driver.user?.status === "inactive").length;
  const loadedTrailers = trailers.filter((trailer) => trailer.status === "loaded").length;
  const carriedOver = contexts.filter((context) => context.isCarriedOver).length;
  const unitsFree = units.filter((unit) => unit.status === "available").length;
  const trailersFree = trailers.filter((trailer) => trailer.status === "available").length;
  const fleetVor = units.filter((unit) => unit.status === "vor").length + trailers.filter((trailer) => trailer.status === "vor").length;

  function resetToggles() {
    setWarningOnly(false);
    setLoadedOnly(false);
    setCarriedOnly(false);
  }

  async function markDriverUnavailable(driver: Driver) {
    if (!window.confirm(`Mark ${driver.displayName} unavailable?`)) return;

    setError("");
    try {
      await driversApi.setStatus(driver.id, "inactive");
      setSuccess(`${driver.displayName} is unavailable.`);
      setTimeout(() => setSuccess(""), 4000);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not mark driver unavailable");
    }
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-muted">Loading planner dashboard...</div>;
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-primary">Dashboard</h1>
          <p className="text-xs text-muted">
            {dateRange.from === dateRange.to ? dateRange.from : `${dateRange.from} → ${dateRange.to}`} | Refreshed {refreshed.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick range pills */}
          {([
            { label: "Today",   back: 0,  fwd: 0  },
            { label: "← 7d",   back: 7,  fwd: 0  },
            { label: "7d →",   back: 0,  fwd: 7  },
            { label: "← 14d",  back: 14, fwd: 0  },
            { label: "14d →",  back: 0,  fwd: 14 },
            { label: "← 30d",  back: 30, fwd: 0  },
            { label: "30d →",  back: 0,  fwd: 30 },
          ] as { label: string; back: number; fwd: number }[]).map(({ label, back, fwd }) => {
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
          {/* Manual from/to inputs */}
          <div className="flex items-center gap-1 text-xs text-muted">
            <input type="date" value={dateRange.from}
              onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
              className="input py-1 text-xs w-36" />
            <span>→</span>
            <input type="date" value={dateRange.to}
              onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
              className="input py-1 text-xs w-36" />
          </div>
          <button type="button" onClick={load} className="btn btn-outline text-sm">Refresh</button>
          <button type="button" onClick={() => navigate("/app/jobs/create")} className="btn btn-primary text-sm">New job</button>
        </div>
      </div>

      {error && <Alert type="error" message={error} />}
      {success && <Alert type="success" message={success} />}

      <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Jobs"
          lead={`${contexts.length} jobs`}
          detail={`${needsPlanning} need planning | ${planned} planned | ${active} active | ${completedContexts.length} done`}
          onClick={() => { setStatusFilter("default"); resetToggles(); }}
        />
        <SummaryCard
          title="Attention"
          lead={`${criticalIssues + allWarnings.filter((warning) => warning.level === "warning").length} issues`}
          detail={`${missingInfo} missing info | ${mismatches} mismatches | ${loadedTrailers} loaded | ${carriedOver} carried`}
          tone={criticalIssues ? "amber" : "slate"}
          onClick={() => { setWarningOnly(true); setStatusFilter("default"); }}
        />
        <SummaryCard
          title="Drivers"
          lead={`${drivers.length} drivers`}
          detail={`${unavailableDrivers} unavailable today`}
          tone="blue"
          onClick={() => navigate("/app/drivers")}
        />
        <SummaryCard
          title="Fleet"
          lead={`${unitsFree} units free`}
          detail={`${trailersFree} trailers free | ${loadedTrailers} loaded | ${fleetVor} VOR`}
          tone="green"
          onClick={() => navigate("/app/fleet")}
        />
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-full sm:w-auto" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="default">Default action view</option>
            <option value="needs_planning">Needs planning</option>
            <option value="ready_to_plan">Ready to plan</option>
            <option value="draft">Draft</option>
            <option value="planned">Planned</option>
            <option value="active">In progress</option>
            <option value="loaded_trailer">Loaded trailer parked</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select className="input w-full sm:w-auto" value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)}>
            <option value="all">All customers</option>
            {customerOptions.map((customer) => <option key={customer} value={customer}>{customer}</option>)}
          </select>
          <select className="input w-full sm:w-auto" value={vehicleFilter} onChange={(event) => setVehicleFilter(event.target.value)}>
            <option value="all">All vehicle types</option>
            {vehicleOptions.map((vehicle) => <option key={vehicle} value={vehicle}>{vehicle}</option>)}
          </select>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <FilterPill active={warningOnly} onClick={() => setWarningOnly((value) => !value)}>Has warnings</FilterPill>
          <FilterPill active={loadedOnly} onClick={() => setLoadedOnly((value) => !value)}>Loaded trailer</FilterPill>
          <FilterPill active={carriedOnly} onClick={() => setCarriedOnly((value) => !value)}>Carried over</FilterPill>
          <button
            type="button"
            onClick={() => {
              setStatusFilter("default");
              setCustomerFilter("all");
              setVehicleFilter("all");
              resetToggles();
            }}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-primary"
          >
            Clear filters
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr),380px]">
        <main>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-black uppercase tracking-wide text-primary">Job Quick List</h2>
              <p className="text-xs text-muted">
                {filteredContexts.length} shown — all open jobs (today, past, unplanned, in progress). Completed &amp; cancelled hidden by default.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {filteredContexts.map((context) => (
              <JobCard
                key={context.job.id}
                context={context}
                onAssign={() => navigate("/app/runs")}
                onDetails={() => setDetails(context)}
                onQuickFix={() => setQuickFix(context)}
              />
            ))}

            {filteredContexts.length === 0 && (
              <div className="card p-8 text-center">
                <div className="text-sm font-bold text-primary">
                  {contexts.length ? "Jobs are loaded but hidden by filters" : "No dashboard jobs loaded"}
                </div>
                <div className="mt-1 text-sm text-muted">
                  {contexts.length
                    ? `${contexts.length} job${contexts.length > 1 ? "s are" : " is"} available in this dashboard range. Clear filters or choose a status like Draft/Completed to show hidden work.`
                    : "Try another planning date range or refresh after the API restarts."}
                </div>
                {contexts.length > 0 && (
                  <div className="mt-4 flex justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setStatusFilter("default");
                        setCustomerFilter("all");
                        setVehicleFilter("all");
                        resetToggles();
                      }}
                      className="btn btn-outline text-sm"
                    >
                      Clear filters
                    </button>
                    {contexts.some((context) => context.status === "draft") && (
                      <button type="button" onClick={() => setStatusFilter("draft")} className="btn btn-outline text-sm">
                        Show drafts
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {statusFilter === "default" && completedContexts.length > 0 && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-muted">
              {completedContexts.length} completed job{completedContexts.length > 1 ? "s are" : " is"} collapsed in this action view.
            </div>
          )}
        </main>

        <aside className="space-y-5">
          <DriverSnapshot
            drivers={drivers}
            contexts={contexts}
            units={units}
            trailers={trailers}
            onAssignDriver={() => navigate("/app/runs")}
            onPickJobForDriver={() => navigate("/app/runs")}
            onViewMore={() => navigate("/app/drivers")}
            onMarkUnavailable={markDriverUnavailable}
            onUnitTrailerSaved={load}
          />
          <FleetSnapshot
            units={units}
            trailers={trailers}
            drivers={drivers}
            openContexts={openContexts}
            onViewMore={() => navigate("/app/fleet")}
          />
        </aside>
      </div>

      {quickFix && (
        <QuickFixDrawer
          context={quickFix}
          onClose={() => setQuickFix(null)}
          onSaved={load}
        />
      )}

      {details && (
        <JobDetailDrawer
          context={details}
          onClose={() => setDetails(null)}
          onAssign={() => { navigate("/app/runs"); setDetails(null); }}
          onQuickFix={() => { setQuickFix(details); setDetails(null); }}
          onEditJob={() => { setDetails(null); navigate(`/app/jobs/${details.job.id}/edit`); }}
        />
      )}
    </div>
  );
}
