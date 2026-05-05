import { useState, useEffect } from "react";
import { driversApi } from "../../api/drivers";
import { api } from "../../api/client";
import type { Driver } from "../../types";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Alert } from "../../components/Alert";
import { Input } from "../../components/Input";

type HolidayPolicySettings = {
  baseHolidayAllowanceDays: number;
  holidayYearResetMonth: number;
  holidayYearResetDay: number;
  holidayWarnDaysBefore: number;
  holidayCarryOverAllowed: boolean;
  holidayCarryOverMaxDays: number;
  holidaySeniorityEnabled: boolean;
  holidaySeniorityYears: number;
  holidaySeniorityExtraDays: number;
  holidaySeniorityMaxExtraDays: number;
};

const defaultHolidayPolicy: HolidayPolicySettings = {
  baseHolidayAllowanceDays: 28,
  holidayYearResetMonth: 1,
  holidayYearResetDay: 1,
  holidayWarnDaysBefore: 30,
  holidayCarryOverAllowed: false,
  holidayCarryOverMaxDays: 0,
  holidaySeniorityEnabled: true,
  holidaySeniorityYears: 5,
  holidaySeniorityExtraDays: 1,
  holidaySeniorityMaxExtraDays: 5,
};

function calculateHolidayAllowance(driver: Driver, policy: HolidayPolicySettings) {
  if (driver.driverType && driver.driverType !== "permanent") return 0;

  const startDateRaw = driver.employmentStartDate;
  if (!policy.holidaySeniorityEnabled || !startDateRaw) return policy.baseHolidayAllowanceDays;

  const start = new Date(startDateRaw);
  if (Number.isNaN(start.getTime())) return policy.baseHolidayAllowanceDays;

  const today = new Date();
  let years = today.getFullYear() - start.getFullYear();
  const hasHadAnniversary =
    today.getMonth() > start.getMonth() ||
    (today.getMonth() === start.getMonth() && today.getDate() >= start.getDate());

  if (!hasHadAnniversary) years -= 1;

  const steps = policy.holidaySeniorityYears > 0 ? Math.floor(Math.max(0, years) / policy.holidaySeniorityYears) : 0;
  const extraDays = Math.min(policy.holidaySeniorityMaxExtraDays, steps * policy.holidaySeniorityExtraDays);

  return policy.baseHolidayAllowanceDays + extraDays;
}

function nextHolidayResetDate(policy: HolidayPolicySettings) {
  const today = new Date();
  const reset = new Date(today.getFullYear(), policy.holidayYearResetMonth - 1, policy.holidayYearResetDay);
  reset.setHours(12, 0, 0, 0);

  if (reset < today) {
    reset.setFullYear(reset.getFullYear() + 1);
  }

  return reset;
}

function daysUntil(date: Date) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}

function DriverForm({ initial, onSave, onCancel }: {
  initial?: Driver; onSave: () => void; onCancel: () => void;
}) {
  const [form, setForm] = useState({
    displayName: initial?.displayName ?? "",
    employeeNumber: initial?.employeeNumber ?? "",
    phoneNumber: initial?.phoneNumber ?? "",
    email: initial?.user?.email ?? "",
    employmentStartDate: initial?.employmentStartDate ? String(initial.employmentStartDate).slice(0, 10) : "",
    driverType: initial?.driverType ?? "permanent",
    licenceClass: initial?.licenceClass ?? "",
    canUseTrailer: Boolean(initial?.canUseTrailer),
    trailerTypesAllowed: Array.isArray(initial?.trailerTypesAllowed) ? initial.trailerTypesAllowed : [] as string[],
    adrAllowed: Boolean(initial?.adrAllowed),
    hiabAllowed: Boolean(initial?.hiabAllowed),
    moffettAllowed: Boolean(initial?.moffettAllowed),
    manualHandlingAllowed: Boolean(initial?.manualHandlingAllowed),
    preferredStartTime: initial?.preferredStartTime ?? "",
    earliestStartTime: initial?.earliestStartTime ?? "",
    latestFinishTime: initial?.latestFinishTime ?? "",
    preferredShiftHours: initial?.preferredShiftHours == null ? "" : String(initial.preferredShiftHours),
    normalWorkingDays: Array.isArray(initial?.normalWorkingDays) ? initial.normalWorkingDays : [] as string[],
    weekendAvailable: Boolean(initial?.weekendAvailable),
    nightWorkAllowed: Boolean(initial?.nightWorkAllowed),
    nightsOutAllowed: Boolean(initial?.nightsOutAllowed),
    overtimeAllowed: Boolean(initial?.overtimeAllowed),
    baseLocation: initial?.baseLocation ?? "",
    operatingArea: initial?.operatingArea ?? "",
    avoidAreas: initial?.avoidAreas ?? "",
    plannerNotes: initial?.plannerNotes ?? "",
    holidayAllowance: initial?.holidayAllowance == null ? "28" : String(initial.holidayAllowance),
    holidayRequests: (initial?.holidayRequests ?? []).map((h) => ({
      startDate: String(h.startDate).slice(0, 10),
      endDate: String(h.endDate).slice(0, 10),
      reason: h.reason ?? "holiday",
      note: h.note ?? "",
      status: h.status ?? "approved",
    })),
  });
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const [loginDetails, setLoginDetails] = useState<{ email: string; pin: string } | null>(null);
  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [f]: e.target.value }));

  const setBool = (f: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [f]: e.target.checked }));

  function toggleList(field: "normalWorkingDays" | "trailerTypesAllowed", value: string) {
    setForm((p) => {
      const current = p[field] as string[];
      return {
        ...p,
        [field]: current.includes(value)
          ? current.filter((item) => item !== value)
          : [...current, value],
      };
    });
  }

  function addHoliday() {
    setForm((p) => ({
      ...p,
      holidayRequests: [
        ...p.holidayRequests,
        { startDate: "", endDate: "", reason: "holiday", note: "", status: "approved" },
      ],
    }));
  }

  function updateHoliday(index: number, field: string, value: string) {
    setForm((p) => ({
      ...p,
      holidayRequests: p.holidayRequests.map((h, i) => i === index ? { ...h, [field]: value } : h),
    }));
  }

  function removeHoliday(index: number) {
    setForm((p) => ({
      ...p,
      holidayRequests: p.holidayRequests.filter((_, i) => i !== index),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setLoading(true);
    const payload = {
      ...form,
      preferredShiftHours: form.preferredShiftHours === "" ? null : Number(form.preferredShiftHours),
      holidayAllowance: form.holidayAllowance === "" ? 28 : Number(form.holidayAllowance),
      holidayRequests: form.holidayRequests.filter((h) => h.startDate && h.endDate),
    };

    try {
      if (initial) {
        await driversApi.update(initial.id, payload);
        onSave();
      } else {
        const result = await driversApi.create(payload) as any;
        if (result.defaultPin) {
          setLoginDetails({ email: result.loginEmail, pin: result.defaultPin });
          return;
        }
        onSave();
      }
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  if (loginDetails) return (
    <div>
      <div className="bg-green-50 border-2 border-green-500 rounded-xl p-5 mb-4">
        <div className="font-bold text-green-800 mb-3">📱 Driver Login Details — share with driver</div>
        <div className="bg-white rounded-lg p-4 font-mono text-sm space-y-2">
          <div><span className="font-bold">Email:</span> {loginDetails.email}</div>
          <div className="flex items-center gap-3">
            <span className="font-bold">PIN:</span>
            <span className="text-2xl font-black tracking-widest bg-yellow-100 px-3 py-1 rounded">{loginDetails.pin}</span>
          </div>
        </div>
        <p className="text-xs text-green-700 mt-3">⚠ Driver must change PIN on first login. Save these details now.</p>
      </div>
      <Button className="w-full" onClick={onSave}>Done →</Button>
    </div>
  );

  return (
    <form onSubmit={handleSubmit}>
      {error && <Alert type="error" message={error} />}
      <Input label="Full Name *" value={form.displayName} onChange={set("displayName")} placeholder="John Smith" required />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Employee No." value={form.employeeNumber} onChange={set("employeeNumber")} placeholder="D001" />
        <Input label="Phone" value={form.phoneNumber} onChange={set("phoneNumber")} placeholder="07700 000000" />
      </div>
      {!initial && (
        <Input label="Email (creates login)" type="email" value={form.email} onChange={set("email")}
          placeholder="driver@company.com" hint="Driver logs into mobile app with this email + PIN (default PIN: 123456 — must change on first login)" />
      )}

      <div className="mt-5 border-t pt-4">
        <h3 className="font-bold text-primary mb-3">Planner profile</h3>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold">
            Driver type
            <select className="input mt-1 w-full" value={form.driverType} onChange={set("driverType")}>
              <option value="permanent">Permanent</option>
              <option value="agency">Agency</option>
              <option value="subcontractor">Subcontractor</option>
            </select>
          </label>

          <Input label="Licence class" value={form.licenceClass} onChange={set("licenceClass")} placeholder="Class 1 / CE" />
        </div>

        <div className="grid grid-cols-2 gap-3 mt-3">
          <Input label="Employment start date" type="date" value={form.employmentStartDate} onChange={set("employmentStartDate")} />
          <div className="text-xs rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-600">
            Used to calculate permanent driver holiday increases after years worked. Agency/subcontractor drivers still use unavailable dates only.
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-3">
          <Input label="Preferred start" type="time" value={form.preferredStartTime} onChange={set("preferredStartTime")} />
          <Input label="Earliest start" type="time" value={form.earliestStartTime} onChange={set("earliestStartTime")} />
          <Input label="Latest finish" type="time" value={form.latestFinishTime} onChange={set("latestFinishTime")} />
        </div>

        <div className="grid grid-cols-2 gap-3 mt-3">
          <Input label="Preferred shift hours" type="number" value={form.preferredShiftHours} onChange={set("preferredShiftHours")} placeholder="9" />
          {form.driverType === "permanent" ? (
            <Input label="Paid holiday allowance days" type="number" value={form.holidayAllowance} onChange={set("holidayAllowance")} placeholder="28" />
          ) : (
            <div className="text-sm rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-yellow-800">
              Agency/subcontractor drivers can still add unavailable holiday dates, but paid holiday allowance does not apply.
            </div>
          )}
        </div>

        <div className="mt-3">
          <div className="text-sm font-semibold mb-2">Normal working days</div>
          <div className="flex flex-wrap gap-2">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
              <label key={day} className="flex items-center gap-2 border rounded-lg px-3 py-2 text-sm">
                <input type="checkbox" checked={form.normalWorkingDays.includes(day)} onChange={() => toggleList("normalWorkingDays", day)} />
                {day}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.weekendAvailable} onChange={setBool("weekendAvailable")} /> Weekend available</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.nightWorkAllowed} onChange={setBool("nightWorkAllowed")} /> Night work allowed</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.nightsOutAllowed} onChange={setBool("nightsOutAllowed")} /> Nights out allowed</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.overtimeAllowed} onChange={setBool("overtimeAllowed")} /> Overtime allowed</label>
        </div>
      </div>

      <div className="mt-5 border-t pt-4">
        <h3 className="font-bold text-primary mb-3">Capabilities</h3>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.canUseTrailer} onChange={setBool("canUseTrailer")} /> Can use trailer</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.adrAllowed} onChange={setBool("adrAllowed")} /> ADR allowed</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.hiabAllowed} onChange={setBool("hiabAllowed")} /> HIAB</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.moffettAllowed} onChange={setBool("moffettAllowed")} /> Moffett / forklift</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.manualHandlingAllowed} onChange={setBool("manualHandlingAllowed")} /> Manual handling</label>
        </div>

        <div className="mt-3">
          <div className="text-sm font-semibold mb-2">Trailer types allowed</div>
          <div className="flex flex-wrap gap-2">
            {["curtain", "box", "flatbed", "fridge", "low-loader", "tipper", "tanker"].map((type) => (
              <label key={type} className="flex items-center gap-2 border rounded-lg px-3 py-2 text-sm">
                <input type="checkbox" checked={form.trailerTypesAllowed.includes(type)} onChange={() => toggleList("trailerTypesAllowed", type)} />
                {type}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 border-t pt-4">
        <h3 className="font-bold text-primary mb-3">Base / area</h3>
        <Input label="Base location" value={form.baseLocation} onChange={set("baseLocation")} placeholder="Depot / home base" />
        <Input label="Operating area" value={form.operatingArea} onChange={set("operatingArea")} placeholder="North West, Liverpool, Manchester..." />
        <Input label="Avoid areas" value={form.avoidAreas} onChange={set("avoidAreas")} placeholder="Areas to avoid if possible" />
      </div>

      <div className="mt-5 border-t pt-4">
        <h3 className="font-bold text-primary mb-3">Unavailable / holiday dates</h3>
        {form.holidayRequests.map((holiday, index) => (
          <div key={index} className="border rounded-xl p-3 mb-3 bg-slate-50">
            <div className="grid grid-cols-2 gap-3">
              <Input label="From" type="date" value={holiday.startDate} onChange={(e) => updateHoliday(index, "startDate", e.target.value)} />
              <Input label="To" type="date" value={holiday.endDate} onChange={(e) => updateHoliday(index, "endDate", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <label className="block text-sm font-semibold">
                Reason
                <select className="input mt-1 w-full" value={holiday.reason} onChange={(e) => updateHoliday(index, "reason", e.target.value)}>
                  <option value="holiday">Holiday</option>
                  <option value="sickness">Sickness</option>
                  <option value="training">Training</option>
                  <option value="personal">Personal</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <Input label="Note" value={holiday.note} onChange={(e) => updateHoliday(index, "note", e.target.value)} placeholder="Optional" />
            </div>
            <Button type="button" variant="outline" className="mt-2" onClick={() => removeHoliday(index)}>Remove date</Button>
          </div>
        ))}
        <Button type="button" variant="outline" onClick={addHoliday}>+ Add unavailable dates</Button>
      </div>

      <div className="mt-5 border-t pt-4">
        <h3 className="font-bold text-primary mb-3">Planner notes</h3>
        <textarea className="input w-full min-h-[90px]" value={form.plannerNotes} onChange={set("plannerNotes")} placeholder="Anything planners need to know before assigning work..." />
      </div>

      <div className="flex gap-3 mt-5">
        <Button type="submit" loading={loading} className="flex-1">{initial ? "Save Changes" : "Add Driver →"}</Button>
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
      </div>
    </form>
  );
}

function PinResetModal({ details, onClose }: { details: { email: string; pin: string; name: string }; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h3 className="font-bold text-primary text-lg mb-4">PIN Reset — {details.name}</h3>
        <div className="bg-green-50 border-2 border-green-500 rounded-xl p-4 mb-4">
          <div className="font-mono text-sm space-y-2">
            <div><span className="font-bold">Email:</span> {details.email}</div>
            <div className="flex items-center gap-3">
              <span className="font-bold">New PIN:</span>
              <span className="text-2xl font-black tracking-widest bg-yellow-100 px-3 py-1 rounded">{details.pin}</span>
            </div>
          </div>
          <p className="text-xs text-green-700 mt-3">Driver must change PIN on next login.</p>
        </div>
        <Button className="w-full" onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}

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
    <div className="p-4 sm:p-6 max-w-5xl">
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

                  <div className="mt-3 text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
                    <span>Type: {driver.driverType || "permanent"}</span>
                    <span>Licence: {driver.licenceClass || "not set"}</span>
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
                  <button onClick={() => { setEditDriver(driver); setShowForm(true); }} className="text-xs text-accent hover:underline font-semibold">Edit</button>
                  {driver.user && <button onClick={() => handleResetPin(driver)} className="text-xs text-orange-600 hover:underline font-semibold">Reset PIN</button>}
                  <button onClick={() => handleToggleStatus(driver)}
                    className={"text-xs font-semibold hover:underline " + (driver.status === "active" ? "text-red-500" : "text-green-600")}>
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
