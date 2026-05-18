import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
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
  const [ticker,             setTicker]             = useState("");
  const [companySaving,      setCompanySaving]      = useState(false);
  const [companySuccess,     setCompanySuccess]     = useState("");
  const [companyError,       setCompanyError]       = useState("");

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
      setTicker(data.ticker ?? "");
    }).catch(() => {});
  }, []);

  async function handleSaveCompany(e: React.FormEvent) {
    e.preventDefault();
    setCompanyError(""); setCompanySuccess(""); setCompanySaving(true);
    try {
      await api.patch("/company", {
        name: companyName,
        ticker: ticker.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || undefined,
        reportEmail,
        reportEmailEnabled,
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
    <div className="p-4 sm:p-6 max-w-2xl space-y-6">
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
            <label className="label">Job Reference Ticker</label>
            <input
              className="input font-mono uppercase tracking-widest max-w-xs"
              value={ticker}
              onChange={e => setTicker(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
              placeholder="e.g. LGB"
              maxLength={6}
            />
            <p className="text-xs mt-1" style={{ color: "#6b7280" }}>
              Used to auto-generate job references, e.g. <span className="font-mono">{ticker || "LGB"}-26-000001</span>. 3–4 letters recommended. Must be unique.
            </p>
          </div>

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

          <Button type="submit" loading={companySaving}>Save Settings</Button>
        </form>
      </div>

      {/* Holiday policy — managed on the Holidays page */}
      <div className="card p-6 flex items-center justify-between">
        <div>
          <h2 className="font-bold" style={{ color: "#0f172a" }}>Holiday Policy</h2>
          <p className="text-sm mt-1" style={{ color: "#6b7280" }}>
            Allowance, carry-over, seniority, and daily limits are configured on the Holidays page.
          </p>
        </div>
        <Link
          to="/app/holidays"
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:opacity-90 transition-opacity whitespace-nowrap"
        >
          Go to Holidays →
        </Link>
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
