import { useState, useEffect } from "react";
import { api } from "../../api/client";

interface Shift {
  id: number; driverName: string; shiftDate: string;
  startTime: string; endTime: string; totalHours: string;
  status: string; fuelDrawn: string; nightOut: boolean;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short", day: "2-digit", month: "short", year: "numeric"
  });
}

export default function ShiftsPage() {
  const [shifts,  setShifts]  = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [search,  setSearch]  = useState("");
  const [status,  setStatus]  = useState("all");

  useEffect(() => {
    api.get<{ data: Shift[] }>("/shifts")
      .then(r => setShifts(r.data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = shifts
    .filter(s => status === "all" || s.status === status)
    .filter(s => !search || s.driverName.toLowerCase().includes(search.toLowerCase()));

  const submitted = shifts.filter(s => s.status === "submitted").length;
  const draft     = shifts.filter(s => s.status === "draft").length;

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-black text-primary">Shift History</h1>
          <p className="text-sm text-muted">{shifts.length} total · {submitted} submitted · {draft} draft</p>
        </div>
      </div>
      {error && <div className="bg-red-50 border-l-4 border-red-500 text-red-800 p-3 text-sm rounded mb-4">{error}</div>}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input className="input flex-1 min-w-48" placeholder="Search by driver name..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="input w-auto" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="submitted">Submitted</option>
          <option value="draft">Draft</option>
        </select>
      </div>
      {loading ? (
        <div className="text-center py-12 text-muted">Loading shifts...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">⏱</div>
          <div className="font-bold text-primary mb-1">{shifts.length === 0 ? "No shifts yet" : "No shifts match"}</div>
          <div className="text-sm text-muted">Shifts appear here when drivers submit from the mobile app</div>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    {["Date","Driver","Start","Finish","Hours","Fuel","Night Out","Status"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-bold text-muted uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm">{fmt(s.shiftDate)}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-primary">{s.driverName}</td>
                      <td className="px-4 py-3 text-sm text-muted">{s.startTime || "—"}</td>
                      <td className="px-4 py-3 text-sm text-muted">{s.endTime   || "—"}</td>
                      <td className="px-4 py-3 text-sm font-bold">{s.totalHours || "—"}</td>
                      <td className="px-4 py-3 text-sm text-muted">{s.fuelDrawn || "—"}</td>
                      <td className="px-4 py-3 text-sm">{s.nightOut ? "✓ Yes" : "No"}</td>
                      <td className="px-4 py-3">
                        <span className={"inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold " + (s.status === "submitted" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800")}>
                          {s.status === "submitted" ? "Submitted" : s.status === "draft" ? "Draft" : s.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {filtered.map(s => (
              <div key={s.id} className="card p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="font-bold text-primary">{s.driverName}</span>
                  <span className={"inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold " + (s.status === "submitted" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800")}>
                    {s.status === "submitted" ? "Submitted" : s.status === "draft" ? "Draft" : s.status}
                  </span>
                </div>
                <div className="text-sm text-muted mb-1">{fmt(s.shiftDate)}</div>
                <div className="flex items-center gap-4 text-sm flex-wrap">
                  {(s.startTime || s.endTime) && (
                    <span className="text-slate-700">
                      {s.startTime || "—"} → {s.endTime || "—"}
                      {s.totalHours && <span className="ml-1 font-semibold text-primary">({s.totalHours}h)</span>}
                    </span>
                  )}
                  {s.fuelDrawn && <span className="text-muted">⛽ {s.fuelDrawn}</span>}
                  {s.nightOut  && <span className="text-muted">🌙 Night out</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
