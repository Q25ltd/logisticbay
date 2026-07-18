/**
 * Live screen — monitoring & reconciliation surface (LOAD_MOVEMENT_PLAN S15).
 *
 * Left: the needs-review queue — every flagged or exception event, newest
 * first, actionable ("Mark handled"). No exception is invisible to the planner.
 * Right: the live run board — reconciled run status, per-stop execution state,
 * and where each load actually IS (latest custody).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { liveApi, ReviewQueueItem, LiveRun } from "../../api/live";

// ── Human labels (never show raw enum values in UI) ──────────────────────────

const EVENT_LABELS: Record<string, string> = {
  delay_reported:    "Delay reported",
  breakdown:         "Breakdown",
  delivery_refused:  "Delivery refused",
  damage_reported:   "Damage reported",
  damage_writeoff:   "Load written off",
  trailer_swap:      "Trailer swap",
  collected:         "Collection",
  completed:         "Delivery",
  drop_at_yard:      "Dropped at yard",
  pick_from_yard:    "Picked from yard",
  handover_offered:  "Handover offered",
  handover_accepted: "Handover accepted",
  started:           "Run started",
  arrived_pickup:    "Arrived at collection",
  arrived_dropoff:   "Arrived at delivery",
};

const REASON_LABELS: Record<string, string> = {
  delay_reported:                      "Driver reported a delay",
  damage_reported:                     "Driver reported damage",
  partial_collection:                  "Collected less than expected",
  over_collection:                     "Collected more than expected",
  partial_delivery:                    "Delivered less than expected",
  over_delivery:                       "Delivered more than expected",
  trailer_swap_new_trailer_not_in_fleet: "Swap trailer is not in the fleet",
  trailer_swap_no_new_trailer_reg:     "No new trailer registration given",
  event_older_than_7d:                 "Event is older than 7 days",
  event_future_dated:                  "Event is future-dated",
};

const EXECUTION_LABELS: Record<string, { label: string; tone: string }> = {
  not_started:      { label: "Not started",            tone: "bg-slate-100 text-slate-600" },
  en_route_pickup:  { label: "En route to collection", tone: "bg-blue-100 text-blue-700" },
  at_pickup:        { label: "At collection",          tone: "bg-blue-100 text-blue-700" },
  loaded:           { label: "Loaded",                 tone: "bg-indigo-100 text-indigo-700" },
  en_route_dropoff: { label: "En route to delivery",   tone: "bg-blue-100 text-blue-700" },
  at_dropoff:       { label: "At delivery",            tone: "bg-blue-100 text-blue-700" },
  delivered:        { label: "Done",                   tone: "bg-emerald-100 text-emerald-700" },
  exception:        { label: "Exception",              tone: "bg-red-100 text-red-700" },
};

const RUN_STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  draft:       { label: "Draft",       tone: "bg-slate-100 text-slate-600" },
  assigned:    { label: "Assigned",    tone: "bg-sky-100 text-sky-700" },
  in_progress: { label: "In progress", tone: "bg-blue-100 text-blue-700" },
  completed:   { label: "Completed",   tone: "bg-emerald-100 text-emerald-700" },
  cancelled:   { label: "Cancelled",   tone: "bg-slate-100 text-slate-500 line-through" },
};

function custodyLabel(toCustody: string): string {
  const [base, ref] = toCustody.split(":");
  const withRef = (text: string) => (ref ? `${text} (${ref})` : text);
  switch (base) {
    case "customer_origin": return "At collection site";
    case "on_vehicle":      return "On vehicle";
    case "yard":            return withRef("At yard");
    case "customer_dest":   return "Delivered";
    case "returned":        return withRef("Returned");
    case "written_off":     return "Written off";
    default:                return toCustody;
  }
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const todayIso = () => new Date().toISOString().slice(0, 10);
const shiftDate = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LivePage() {
  const [queue, setQueue]       = useState<ReviewQueueItem[]>([]);
  const [runs, setRuns]         = useState<LiveRun[]>([]);
  const [date, setDate]         = useState(todayIso());
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [resolving, setResolving] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [q, r] = await Promise.all([liveApi.needsReview(), liveApi.runs(date)]);
      setQueue(q.items);
      setRuns(r.runs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the live board");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    setLoading(true);
    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const resolve = async (id: number) => {
    setResolving(id);
    try {
      await liveApi.resolve(id);
      setQueue(prev => prev.filter(i => i.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark the item handled");
    } finally {
      setResolving(null);
    }
  };

  const attentionJobs = useMemo(
    () => new Set(runs.flatMap(r => r.stops.filter(s => s.jobStatus === "attention_needed").map(s => s.jobId))),
    [runs],
  );

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-800">Live</h1>
        <div className="flex items-center gap-1 text-sm">
          <button className="btn btn-secondary px-2 py-1" onClick={() => setDate(d => shiftDate(d, -1))}>←</button>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="border border-slate-300 rounded px-2 py-1" />
          <button className="btn btn-secondary px-2 py-1" onClick={() => setDate(d => shiftDate(d, 1))}>→</button>
          {date !== todayIso() && (
            <button className="text-sky-600 underline ml-1" onClick={() => setDate(todayIso())}>Today</button>
          )}
        </div>
        <span className="text-xs text-slate-400">Refreshes every 30s</span>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-4 items-start">

        {/* ── Needs review queue ─────────────────────────────────────────── */}
        <section className="bg-white border border-slate-200 rounded-lg">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-medium text-slate-700">Needs review</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full ${queue.length > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
              {queue.length} open
            </span>
          </div>
          {loading && queue.length === 0 ? (
            <p className="p-4 text-sm text-slate-400">Loading…</p>
          ) : queue.length === 0 ? (
            <p className="p-4 text-sm text-slate-400">Nothing waiting — all clear.</p>
          ) : (
            <ul className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
              {queue.map(item => (
                <li key={item.id} className="p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                      {EVENT_LABELS[item.eventType] ?? "Flagged event"}
                    </span>
                    <span className="text-xs text-slate-400">{fmtTime(item.occurredAt)}</span>
                  </div>
                  <div className="text-sm text-slate-700">
                    <Link to={`/app/jobs/${item.jobId}`} className="text-sky-700 hover:underline">
                      {item.jobReference ?? `Job ${item.jobId}`}
                    </Link>
                    {item.customerName && <span className="text-slate-500"> — {item.customerName}</span>}
                    {item.runReference && <span className="text-slate-400"> · {item.runReference}</span>}
                  </div>
                  {item.reviewReason && (
                    <div className="text-xs text-amber-700">{REASON_LABELS[item.reviewReason] ?? item.reviewReason.replace(/_/g, " ")}</div>
                  )}
                  {item.note && <div className="text-xs text-slate-500 italic">“{item.note}”</div>}
                  <div className="flex items-center gap-2 pt-1">
                    {item.actorName && <span className="text-xs text-slate-400">by {item.actorName}</span>}
                    <button
                      className="ml-auto text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                      disabled={resolving === item.id}
                      onClick={() => void resolve(item.id)}
                    >
                      {resolving === item.id ? "Saving…" : "Mark handled"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Live run board ─────────────────────────────────────────────── */}
        <section className="space-y-3">
          {loading && runs.length === 0 ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : runs.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-lg p-6 text-center text-sm text-slate-400">
              No runs planned for this date.
            </div>
          ) : (
            runs.map(run => {
              const rs = RUN_STATUS_LABELS[run.status] ?? { label: run.status, tone: "bg-slate-100 text-slate-600" };
              const hasAttention = run.stops.some(s => s.jobStatus === "attention_needed" || s.executionState === "exception");
              return (
                <div key={run.id} className={`bg-white border rounded-lg ${hasAttention ? "border-red-300" : "border-slate-200"}`}>
                  <div className="px-4 py-2.5 flex flex-wrap items-center gap-2 border-b border-slate-100">
                    <span className="font-medium text-slate-800">{run.runReference}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${rs.tone}`}>{rs.label}</span>
                    {!run.publishedToDriver && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Not sent to driver</span>}
                    {hasAttention && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Needs attention</span>}
                    <span className="text-sm text-slate-500 ml-auto">{run.driverName ?? "No driver"}</span>
                  </div>
                  <ul className="divide-y divide-slate-50">
                    {run.stops.map(stop => {
                      const es = EXECUTION_LABELS[stop.executionState] ?? { label: stop.executionState, tone: "bg-slate-100 text-slate-600" };
                      return (
                        <li key={stop.assignmentId} className="px-4 py-2 flex flex-wrap items-center gap-2 text-sm">
                          <span className="text-xs uppercase tracking-wide text-slate-400 w-16">
                            {stop.stopType === "collection" || stop.stopType === "pickup" ? "Collect" : "Deliver"}
                          </span>
                          <Link to={`/app/jobs/${stop.jobId}`} className="text-sky-700 hover:underline">
                            {stop.jobReference ?? `Job ${stop.jobId}`}
                          </Link>
                          {stop.customerName && <span className="text-slate-500">{stop.customerName}</span>}
                          {stop.quantity != null && stop.quantity > 0 && (
                            <span className="text-xs text-slate-400">{stop.quantity} {stop.quantityUnit ?? ""}</span>
                          )}
                          <span className={`text-xs px-2 py-0.5 rounded-full ${es.tone} ${attentionJobs.has(stop.jobId) ? "ring-1 ring-red-300" : ""}`}>
                            {es.label}
                          </span>
                          {stop.custody && (
                            <span className="text-xs text-slate-500 ml-auto" title={`As of ${fmtTime(stop.custody.timestamp)}`}>
                              📦 {custodyLabel(stop.custody.toCustody)}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}
