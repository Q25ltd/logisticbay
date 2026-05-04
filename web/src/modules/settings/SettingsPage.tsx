import { useState, useEffect } from "react";
import { useAuth } from "../../hooks/useAuth";
import { api } from "../../api/client";
import { Button } from "../../components/Button";
import { Alert } from "../../components/Alert";
import { Input } from "../../components/Input";

export default function SettingsPage() {
  const { user } = useAuth();

  // Company settings
  const [reportEmail,        setReportEmail]        = useState("");
  const [reportEmailEnabled, setReportEmailEnabled] = useState(true);
  const [companyName,        setCompanyName]        = useState(user?.companyName ?? "");
  const [companySaving,      setCompanySaving]      = useState(false);
  const [companySuccess,     setCompanySuccess]     = useState("");
  const [companyError,       setCompanyError]       = useState("");

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

  // Password change
  const [currentPw, setCurrentPw] = useState("");
  const [newPw,     setNewPw]     = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSuccess, setPwSuccess] = useState("");
  const [pwError,   setPwError]   = useState("");

  // Load company settings
  useEffect(() => {
    api.get<any>("/company").then(data => {
      setReportEmail(data.reportEmail ?? "");
      setReportEmailEnabled(data.reportEmailEnabled ?? true);
      setCompanyName(data.name ?? "");
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

  async function handleSaveCompany(e: React.FormEvent) {
    e.preventDefault();
    setCompanyError(""); setCompanySuccess(""); setCompanySaving(true);
    try {
      await api.patch("/company", {
        name: companyName,
        reportEmail,
        reportEmailEnabled,
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
      setCompanySuccess("Settings saved ✓");
    } catch (err: any) { setCompanyError(err.message); }
    finally { setCompanySaving(false); }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault(); setPwError(""); setPwSuccess("");
    if (newPw !== confirmPw) { setPwError("Passwords do not match"); return; }
    if (newPw.length < 8)    { setPwError("Password must be at least 8 characters"); return; }
    setPwLoading(true);
    try {
      await api.post("/auth/change-password", { currentPassword: currentPw, newPassword: newPw });
      setPwSuccess("Password changed ✓");
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    } catch (err: any) { setPwError(err.message); }
    finally { setPwLoading(false); }
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="text-xl font-black" style={{ color: "#0f172a" }}>Settings</h1>

      {/* Company info */}
      <div className="card p-6">
        <h2 className="font-bold mb-4" style={{ color: "#0f172a" }}>Company</h2>
        <div className="space-y-2 text-sm mb-4">
          {[
            { label: "Your Name", value: user?.name },
            { label: "Email",     value: user?.email },
            { label: "Role",      value: user?.role?.replace(/_/g, " ") },
          ].map(r => (
            <div key={r.label} className="flex justify-between py-2 border-b border-border last:border-0">
              <span style={{ color: "#6b7280" }}>{r.label}</span>
              <span className="font-semibold capitalize" style={{ color: "#0f172a" }}>{r.value}</span>
            </div>
          ))}
        </div>

        {/* Company settings form */}
        {companySuccess && <Alert type="success" message={companySuccess} />}
        {companyError   && <Alert type="error"   message={companyError}   />}
        <form onSubmit={handleSaveCompany}>
          <Input
            label="Company Name"
            value={companyName}
            onChange={e => setCompanyName(e.target.value)}
            placeholder="Acme Haulage Ltd"
          />

          <div className="mb-4">
            <label className="label">Shift Report Email</label>
            <input
              className="input"
              type="email"
              value={reportEmail}
              onChange={e => setReportEmail(e.target.value)}
              placeholder="manager@company.com"
            />
            <p className="text-xs mt-1" style={{ color: "#6b7280" }}>
              PDF shift reports will be emailed here when drivers submit shifts
            </p>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <input
              type="checkbox"
              id="reportEnabled"
              checked={reportEmailEnabled}
              onChange={e => setReportEmailEnabled(e.target.checked)}
            />
            <label htmlFor="reportEnabled" className="text-sm cursor-pointer" style={{ color: "#0f172a" }}>
              Send automatic email reports when shifts are submitted
            </label>
          </div>

          <div className="border-t border-border pt-4 mt-5">
            <h3 className="font-bold mb-3" style={{ color: "#0f172a" }}>Holiday policy</h3>

            <div className="grid grid-cols-2 gap-3">
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
              Pending and approved holiday requests count against this daily planning limit. Planners can still approve over the limit as an exception, but the system warns them.
            </p>

            <div className="grid grid-cols-2 gap-3">
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
              <div className="grid grid-cols-3 gap-3">
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

            <p className="text-xs mt-2" style={{ color: "#6b7280" }}>
              Paid holiday allowance applies to permanent drivers only. Agency/subcontractor drivers can still mark unavailable dates from the mobile app.
            </p>
          </div>

          <Button type="submit" loading={companySaving}>Save Settings</Button>
        </form>
      </div>

      {/* Change password */}
      <div className="card p-6">
        <h2 className="font-bold mb-4" style={{ color: "#0f172a" }}>Change Password</h2>
        {pwSuccess && <Alert type="success" message={pwSuccess} />}
        {pwError   && <Alert type="error"   message={pwError}   />}
        <form onSubmit={handleChangePassword}>
          <Input label="Current Password" type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="Your current password" required />
          <Input label="New Password" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Min 8 characters" required />
          <Input label="Confirm New Password" type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Repeat new password" required />
          <Button type="submit" loading={pwLoading}>Update Password</Button>
        </form>
      </div>

      {/* Platform status */}
      <div className="card p-6">
        <h2 className="font-bold mb-4" style={{ color: "#0f172a" }}>Platform Modules</h2>
        <div className="text-sm space-y-2">
          {[
            { name: "Planner & Dispatch", cls: "bg-green-100 text-green-800",   label: "Active" },
            { name: "Driver Mobile App",  cls: "bg-green-100 text-green-800",   label: "Active" },
            { name: "Fleet Management",   cls: "bg-orange-100 text-orange-700", label: "Next Phase" },
            { name: "Cargo Marketplace",  cls: "bg-purple-100 text-purple-700", label: "Future" },
            { name: "AI Intelligence",    cls: "bg-purple-100 text-purple-700", label: "Future" },
          ].map(m => (
            <div key={m.name} className="flex justify-between py-2 border-b border-border last:border-0">
              <span style={{ color: "#0f172a" }}>{m.name}</span>
              <span className={"inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold " + m.cls}>{m.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
