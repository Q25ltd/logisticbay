import { useState, useEffect } from "react";
import { driversApi } from "../../api/drivers";
import { api } from "../../api/client";
import type { Driver } from "../../types";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Alert } from "../../components/Alert";
import { defaultHolidayPolicy } from "./driverTypes";
import type { HolidayPolicySettings } from "./driverTypes";
import { calculateHolidayAllowance, nextHolidayResetDate, daysUntil } from "./driverUtils";
import DriverForm from "./DriverForm";
import PinResetModal from "./PinResetModal";

export default function DriversPage() {
  const [drivers,    setDrivers]    = useState<Driver[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [showForm,   setShowForm]   = useState(false);
  const [editDriver, setEditDriver] = useState<Driver | undefined>();
  const [filter,     setFilter]     = useState<"all"|"active"|"inactive">("all");
  const [search,     setSearch]     = useState("");
  const [pinReset,   setPinReset]   = useState<{ email: string; pin: string; name: string } | null>(null);
  const [success,    setSuccess]    = useState("");
  const [holidayPolicy, setHolidayPolicy] = useState<HolidayPolicySettings>(defaultHolidayPolicy);

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await driversApi.list();
      setDrivers(res.data);

      const company = await api.get<any>("/company");
      setHolidayPolicy({
        baseHolidayAllowanceDays: Number(company.baseHolidayAllowanceDays ?? 28),
        holidayYearResetMonth: Number(company.holidayYearResetMonth ?? 1),
        holidayYearResetDay: Number(company.holidayYearResetDay ?? 1),
        holidayWarnDaysBefore: Number(company.holidayWarnDaysBefore ?? 30),
        holidayCarryOverAllowed: Boolean(company.holidayCarryOverAllowed ?? false),
        holidayCarryOverMaxDays: Number(company.holidayCarryOverMaxDays ?? 0),
        holidaySeniorityEnabled: Boolean(company.holidaySeniorityEnabled ?? true),
        holidaySeniorityYears: Number(company.holidaySeniorityYears ?? 5),
        holidaySeniorityExtraDays: Number(company.holidaySeniorityExtraDays ?? 1),
        holidaySeniorityMaxExtraDays: Number(company.holidaySeniorityMaxExtraDays ?? 5),
      });
    } catch (err: any) { setError(err.message); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleToggleStatus(driver: Driver) {
    const next = driver.status === "active" ? "inactive" : "active";
    if (next === "inactive" && !confirm(`Deactivate ${driver.displayName}?`)) return;
    try {
      await driversApi.setStatus(driver.id, next);
      setSuccess(`${driver.displayName} ${next === "active" ? "activated" : "deactivated"} ✓`);
      load();
    } catch (err: any) { alert(err.message); }
  }

  async function handleResetPin(driver: Driver) {
    if (!confirm(`Reset PIN for ${driver.displayName}?`)) return;
    try {
      const res = await driversApi.resetPin(driver.id) as any;
      setPinReset({ email: res.loginEmail, pin: res.defaultPin, name: driver.displayName });
    } catch (err: any) { alert(err.message); }
  }

  const filtered = drivers
    .filter(d => filter === "all" || d.status === filter)
    .filter(d =>
      !search ||
      d.displayName.toLowerCase().includes(search.toLowerCase()) ||
      (d.employeeNumber ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (d.user?.email ?? "").toLowerCase().includes(search.toLowerCase())
    );

  const active   = drivers.filter(d => d.status === "active").length;
  const inactive = drivers.filter(d => d.status === "inactive").length;

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-black text-primary">Drivers</h1>
          <p className="text-sm text-muted">{active} active · {inactive} inactive</p>
        </div>
        <Button onClick={() => { setEditDriver(undefined); setShowForm(true); }}>+ Add Driver</Button>
      </div>

      {success && <Alert type="success" message={success} />}
      {error   && <Alert type="error"   message={error}   />}

      {showForm && (
        <div className="card p-6 mb-6">
          <h2 className="font-bold text-primary mb-4">{editDriver ? `Edit — ${editDriver.displayName}` : "Add New Driver"}</h2>
          <DriverForm
            initial={editDriver}
            onSave={() => { setShowForm(false); setEditDriver(undefined); setSuccess("Driver saved ✓"); load(); }}
            onCancel={() => { setShowForm(false); setEditDriver(undefined); }}
          />
        </div>
      )}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input className="input flex-1 min-w-48" placeholder="Search by name, employee no, email..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <div className="flex gap-1">
          {(["all","active","inactive"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={"px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors " +
                (filter === f ? "bg-primary text-white" : "bg-white border border-border text-muted hover:text-primary")}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted">Loading drivers...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">👥</div>
          <div className="font-bold text-primary mb-1">{drivers.length === 0 ? "No drivers yet" : "No drivers match"}</div>
          <div className="text-sm text-muted mb-4">{drivers.length === 0 ? "Add your first driver to get started" : "Try a different search or filter"}</div>
          {drivers.length === 0 && <Button onClick={() => setShowForm(true)}>Add First Driver</Button>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(driver => (
            <div key={driver.id} className={"card p-4 " + (driver.status === "inactive" ? "opacity-60" : "")}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-primary">{driver.displayName}</span>
                    <Badge status={driver.status} />
                  </div>
                  <div className="text-sm text-muted space-y-0.5">
                    {driver.employeeNumber && <div>🪪 {driver.employeeNumber}</div>}
                    {driver.phoneNumber    && <a href={"tel:" + driver.phoneNumber} className="block hover:text-accent">📞 {driver.phoneNumber}</a>}
                    {driver.user?.email    && <div>✉️ {driver.user.email}</div>}
                    {!driver.user?.email   && <div className="text-xs text-yellow-700 bg-yellow-50 px-2 py-1 rounded inline-block">No login account</div>}
                  </div>

                  <div className="mt-3 text-sm text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
                    <span>Type: {({"permanent":"Permanent","agency":"Agency","subcontractor":"Subcontractor"} as Record<string,string>)[driver.driverType ?? "permanent"] ?? (driver.driverType ?? "Permanent")}</span>
                    <span>Licence: {driver.licenceClass ? driver.licenceClass.replace(/_/g, " ").toUpperCase() : "Not set"}</span>
                    <span>Preferred start: {driver.preferredStartTime || "not set"}</span>
                    <span>Days: {driver.normalWorkingDays?.length ? driver.normalWorkingDays.join(", ") : "not set"}</span>
                    <span>Trailer: {driver.canUseTrailer ? "yes" : "no"}</span>
                    {driver.holidayRequests?.length ? (
                      <span className="text-amber-700 font-semibold">{driver.holidayRequests.length} unavailable period(s)</span>
                    ) : null}
                    {(!driver.driverType || driver.driverType === "permanent") ? (() => {
                      const allowance = calculateHolidayAllowance(driver, holidayPolicy);
                      const used = Number(driver.holidayUsed ?? 0);
                      const unused = Math.max(0, allowance - used);
                      const resetDate = nextHolidayResetDate(holidayPolicy);
                      const resetDays = daysUntil(resetDate);
                      const shouldWarn = unused > 0 && resetDays <= holidayPolicy.holidayWarnDaysBefore;

                      return (
                        <>
                          <span>Paid holiday: {used}/{allowance} used</span>
                          {shouldWarn ? (
                            <span className="text-red-700 font-semibold">
                              {unused} unused holiday day(s), reset in {resetDays} day(s)
                              {holidayPolicy.holidayCarryOverAllowed
                                ? ` · carry-over max ${holidayPolicy.holidayCarryOverMaxDays}`
                                : " · no carry-over"}
                            </span>
                          ) : null}
                        </>
                      );
                    })() : (
                      <span className="text-slate-500">Unavailable dates only — no paid holiday allowance</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2 ml-4 text-right">
                  <button onClick={() => { setEditDriver(driver); setShowForm(true); }} className="text-sm text-accent border border-accent/30 rounded-lg px-3 py-1.5 font-semibold hover:bg-blue-50 transition-colors">Edit</button>
                  {driver.user && <button onClick={() => handleResetPin(driver)} className="text-sm text-orange-600 border border-orange-200 rounded-lg px-3 py-1.5 font-semibold hover:bg-orange-50 transition-colors">Reset PIN</button>}
                  <button onClick={() => handleToggleStatus(driver)}
                    className={"text-sm font-semibold rounded-lg px-3 py-1.5 border transition-colors " + (driver.status === "active" ? "text-red-500 border-red-200 hover:bg-red-50" : "text-green-600 border-green-200 hover:bg-green-50")}>
                    {driver.status === "active" ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {pinReset && <PinResetModal details={pinReset} onClose={() => setPinReset(null)} />}
    </div>
  );
}
