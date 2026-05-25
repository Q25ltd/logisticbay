import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { Button } from "../../components/Button";
import { Alert } from "../../components/Alert";
import { Badge } from "../../components/Badge";
import { Input } from "../../components/Input";

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

  // Holiday policy
  const [policyOpen, setPolicyOpen] = useState(false);
  const [baseHolidayAllowanceDays, setBaseHolidayAllowanceDays] = useState("28");
  const [holidayYearResetMonth, setHolidayYearResetMonth] = useState("1");
  const [holidayYearResetDay, setHolidayYearResetDay] = useState("1");
  const [holidayWarnDaysBefore, setHolidayWarnDaysBefore] = useState("30");
  const [maxHolidaysPerDay, setMaxHolidaysPerDay] = useState("2");
  const [holidayCarryOverAllowed, setHolidayCarryOverAllowed] = useState(false);
  const [holidayCarryOverMaxDays, setHolidayCarryOverMaxDays] = useState("0");
  const [holidaySeniorityEnabled, setHolidaySeniorityEnabled] = useState(true);
  const [holidaySeniorityYears, setHolidaySeniorityYears] = useState("5");
  const [holidaySeniorityExtraDays, setHolidaySeniorityExtraDays] = useState("1");
  const [holidaySeniorityMaxExtraDays, setHolidaySeniorityMaxExtraDays] = useState("5");
  const [policySaving, setPolicySaving] = useState(false);
  const [policySuccess, setPolicySuccess] = useState("");
  const [policyError, setPolicyError] = useState("");

  useEffect(() => {
    api.get<any>("/company").then(data => {
      setBaseHolidayAllowanceDays(String(data.baseHolidayAllowanceDays ?? 28));
      setHolidayYearResetMonth(String(data.holidayYearResetMonth ?? 1));
      setHolidayYearResetDay(String(data.holidayYearResetDay ?? 1));
      setHolidayWarnDaysBefore(String(data.holidayWarnDaysBefore ?? 30));
      setMaxHolidaysPerDay(String(data.maxHolidaysPerDay ?? 2));
      setHolidayCarryOverAllowed(Boolean(data.holidayCarryOverAllowed ?? false));
      setHolidayCarryOverMaxDays(String(data.holidayCarryOverMaxDays ?? 0));
      setHolidaySeniorityEnabled(Boolean(data.holidaySeniorityEnabled ?? true));
      setHolidaySeniorityYears(String(data.holidaySeniorityYears ?? 5));
      setHolidaySeniorityExtraDays(String(data.holidaySeniorityExtraDays ?? 1));
      setHolidaySeniorityMaxExtraDays(String(data.holidaySeniorityMaxExtraDays ?? 5));
    }).catch(() => {});
  }, []);

  async function handleSavePolicy(e: React.FormEvent) {
    e.preventDefault();
    setPolicyError(""); setPolicySuccess(""); setPolicySaving(true);
    try {
      await api.patch("/company", {
        baseHolidayAllowanceDays: Number(baseHolidayAllowanceDays),
        holidayYearResetMonth: Number(holidayYearResetMonth),
        holidayYearResetDay: Number(holidayYearResetDay),
        holidayWarnDaysBefore: Number(holidayWarnDaysBefore),
        maxHolidaysPerDay: Number(maxHolidaysPerDay),
        holidayCarryOverAllowed,
        holidayCarryOverMaxDays: Number(holidayCarryOverMaxDays),
        holidaySeniorityEnabled,
        holidaySeniorityYears: Number(holidaySeniorityYears),
        holidaySeniorityExtraDays: Number(holidaySeniorityExtraDays),
        holidaySeniorityMaxExtraDays: Number(holidaySeniorityMaxExtraDays),
      });
      setPolicySuccess("Policy saved ✓");
    } catch (err: any) { setPolicyError(err.message); }
    finally { setPolicySaving(false); }
  }

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
    <div className="p-4 sm:p-6 max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-primary">Holiday Requests</h1>
          <p className="text-sm text-muted">
            Approve or decline driver holiday/unavailable requests. Approved days block planning.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm font-semibold text-amber-700">
            {pendingCount} pending
          </div>
          <button
            type="button"
            onClick={() => { setPolicyOpen(o => !o); setPolicySuccess(""); setPolicyError(""); }}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-border bg-white text-muted hover:text-primary transition-colors"
          >
            {policyOpen ? "Close policy ↑" : "Holiday policy ↓"}
          </button>
        </div>
      </div>

      {/* Holiday policy panel */}
      {policyOpen && (
        <div className="card p-5">
          <h2 className="font-bold text-primary mb-4">Holiday Policy</h2>
          {policySuccess && <Alert type="success" message={policySuccess} />}
          {policyError && <Alert type="error" message={policyError} />}
          <form onSubmit={handleSavePolicy}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Base holiday days"
                type="number"
                value={baseHolidayAllowanceDays}
                onChange={e => setBaseHolidayAllowanceDays(e.target.value)}
                placeholder="28"
              />
              <Input
                label="Warn before reset (days)"
                type="number"
                value={holidayWarnDaysBefore}
                onChange={e => setHolidayWarnDaysBefore(e.target.value)}
                placeholder="30"
              />
            </div>

            <Input
              label="Max drivers off per day"
              type="number"
              value={maxHolidaysPerDay}
              onChange={e => setMaxHolidaysPerDay(e.target.value)}
              placeholder="2"
            />
            <p className="text-xs -mt-2 mb-4" style={{ color: "#6b7280" }}>
              Pending and approved requests count against this limit. Planners can still approve over the limit as an exception.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Holiday reset month"
                type="number"
                value={holidayYearResetMonth}
                onChange={e => setHolidayYearResetMonth(e.target.value)}
                placeholder="1"
              />
              <Input
                label="Holiday reset day"
                type="number"
                value={holidayYearResetDay}
                onChange={e => setHolidayYearResetDay(e.target.value)}
                placeholder="1"
              />
            </div>

            <div className="flex items-center gap-3 mb-4">
              <input
                type="checkbox"
                id="holidayCarryOverAllowed"
                checked={holidayCarryOverAllowed}
                onChange={e => setHolidayCarryOverAllowed(e.target.checked)}
              />
              <label htmlFor="holidayCarryOverAllowed" className="text-sm cursor-pointer" style={{ color: "#0f172a" }}>
                Allow unused holidays to transfer to next holiday year
              </label>
            </div>

            {holidayCarryOverAllowed && (
              <Input
                label="Maximum carry-over days"
                type="number"
                value={holidayCarryOverMaxDays}
                onChange={e => setHolidayCarryOverMaxDays(e.target.value)}
                placeholder="5"
              />
            )}

            <div className="flex items-center gap-3 mb-4">
              <input
                type="checkbox"
                id="holidaySeniorityEnabled"
                checked={holidaySeniorityEnabled}
                onChange={e => setHolidaySeniorityEnabled(e.target.checked)}
              />
              <label htmlFor="holidaySeniorityEnabled" className="text-sm cursor-pointer" style={{ color: "#0f172a" }}>
                Increase holiday allowance by employment length
              </label>
            </div>

            {holidaySeniorityEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input
                  label="After years"
                  type="number"
                  value={holidaySeniorityYears}
                  onChange={e => setHolidaySeniorityYears(e.target.value)}
                  placeholder="5"
                />
                <Input
                  label="Extra days each step"
                  type="number"
                  value={holidaySeniorityExtraDays}
                  onChange={e => setHolidaySeniorityExtraDays(e.target.value)}
                  placeholder="1"
                />
                <Input
                  label="Max extra days"
                  type="number"
                  value={holidaySeniorityMaxExtraDays}
                  onChange={e => setHolidaySeniorityMaxExtraDays(e.target.value)}
                  placeholder="5"
                />
              </div>
            )}

            <p className="text-xs mb-4" style={{ color: "#6b7280" }}>
              Paid holiday allowance applies to permanent drivers only. Agency/subcontractor drivers can still mark unavailable dates from the mobile app.
            </p>

            <Button type="submit" loading={policySaving}>Save Policy</Button>
          </form>
        </div>
      )}

      {success && <Alert type="success" message={success} />}
      {error && <Alert type="error" message={error} />}

      <div className="flex gap-2 flex-wrap">
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
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
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
                  <div className="flex sm:flex-col gap-2 sm:min-w-[130px]">
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
