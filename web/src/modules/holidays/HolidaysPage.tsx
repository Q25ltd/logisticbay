import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { Button } from "../../components/Button";
import { Alert } from "../../components/Alert";
import { Badge } from "../../components/Badge";

type HolidayRequest = {
  id: number;
  driverProfileId: number;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  note: string;
  status: "pending" | "approved" | "rejected" | string;
  plannerNote: string;
  approvedAt?: string | null;
  createdAt: string;
  driverProfile?: {
    id: number;
    displayName: string;
    holidayAllowance?: number;
    holidayUsed?: number;
  };
};

function fmt(date: string) {
  return new Date(date).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function statusBadge(status: string) {
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  return "warning";
}

export default function HolidaysPage() {
  const [requests, setRequests] = useState<HolidayRequest[]>([]);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [plannerNotes, setPlannerNotes] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const query = filter === "all" ? "" : `?status=${filter}`;
      const res = await api.get<{ data: HolidayRequest[] }>(`/holiday-requests${query}`);
      setRequests(res.data ?? []);
      setPlannerNotes(
        Object.fromEntries((res.data ?? []).map((r) => [r.id, r.plannerNote ?? ""]))
      );
    } catch (err: any) {
      setError(err.message ?? "Failed to load holiday requests");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [filter]);

  async function updateStatus(id: number, status: "approved" | "rejected") {
    setSavingId(id);
    setError("");
    setSuccess("");

    try {
      await api.patch(`/holiday-requests/${id}`, {
        status,
        plannerNote: plannerNotes[id] ?? "",
      });
      setSuccess(status === "approved" ? "Holiday approved ✓" : "Holiday declined ✓");
      await load();
    } catch (err: any) {
      setError(err.message ?? "Failed to update holiday request");
    } finally {
      setSavingId(null);
    }
  }

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="p-4 sm:p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-black text-primary">Holiday Requests</h1>
          <p className="text-sm text-muted">
            Approve or decline driver holiday/unavailable requests. Approved days block planning.
          </p>
        </div>
        <div className="text-sm font-semibold text-amber-700">
          {pendingCount} pending
        </div>
      </div>

      {success && <Alert type="success" message={success} />}
      {error && <Alert type="error" message={error} />}

      <div className="flex gap-2 mb-4 flex-wrap">
        {(["pending", "approved", "rejected", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={
              "px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors " +
              (filter === f
                ? "bg-primary text-white"
                : "bg-white border border-border text-muted hover:text-primary")
            }
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted">Loading holiday requests...</div>
      ) : requests.length === 0 ? (
        <div className="card p-8 text-center text-muted">No holiday requests found.</div>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <div key={request.id} className="card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="font-bold text-primary">
                      {request.driverProfile?.displayName ?? `Driver #${request.driverProfileId}`}
                    </div>
                    <Badge status={statusBadge(request.status) as any} />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-muted">
                    <div>
                      <div className="text-xs font-semibold text-slate-500">Dates</div>
                      <div>{fmt(request.startDate)} → {fmt(request.endDate)}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-500">Working days</div>
                      <div>{request.totalDays}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-500">Reason</div>
                      <div>{request.reason || "Holiday"}</div>
                    </div>
                  </div>

                  {request.status === "pending" && (
                    <div className="mt-3 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3">
                      <span className="font-semibold">Limit check:</span> Check daily holiday capacity before approving. Approval can exceed the company limit only as a planner exception.
                    </div>
                  )}

                  {request.note && (
                    <div className="mt-3 text-sm bg-slate-50 border border-border rounded-lg p-3">
                      <span className="font-semibold">Driver note:</span> {request.note}
                    </div>
                  )}

                  <div className="mt-3">
                    <label className="label">Planner note</label>
                    <textarea
                      className="input w-full min-h-[70px]"
                      value={plannerNotes[request.id] ?? ""}
                      onChange={(e) =>
                        setPlannerNotes((prev) => ({ ...prev, [request.id]: e.target.value }))
                      }
                      placeholder="Optional note for approval/decline..."
                      disabled={request.status !== "pending"}
                    />
                  </div>
                </div>

                {request.status === "pending" && (
                  <div className="flex flex-col gap-2 min-w-[130px]">
                    <Button
                      type="button"
                      loading={savingId === request.id}
                      onClick={() => updateStatus(request.id, "approved")}
                    >
                      Approve
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      loading={savingId === request.id}
                      onClick={() => updateStatus(request.id, "rejected")}
                    >
                      Decline
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
