import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { api } from "../../api/client";
import { planningApi, type DepotLocation, type SavedLocationOption } from "../../api/planning";
import { Button } from "../../components/Button";
import { Alert } from "../../components/Alert";
import { Input } from "../../components/Input";

// ── Depot setup sub-component ─────────────────────────────────────────────────

function DepotSection({ initial }: { initial: DepotLocation | null }) {
  const [depot,        setDepot]        = useState<DepotLocation | null>(initial);
  const [mode,         setMode]         = useState<"idle" | "create" | "pick">("idle");
  const [savedLocs,    setSavedLocs]    = useState<SavedLocationOption[] | null>(null);
  const [locsLoading,  setLocsLoading]  = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [success,      setSuccess]      = useState("");
  const [error,        setError]        = useState("");

  // Create-new fields
  const [locName,     setLocName]     = useState("");
  const [locStreet,   setLocStreet]   = useState("");
  const [locTown,     setLocTown]     = useState("");
  const [locPostcode, setLocPostcode] = useState("");

  // Pick-existing
  const [pickedId, setPickedId] = useState<number | "">("");

  function startChange() {
    setSuccess(""); setError("");
    // Try to load saved locations to decide which mode to show
    if (savedLocs === null) {
      setLocsLoading(true);
      planningApi.getLocations()
        .then(res => {
          setSavedLocs(res.data);
          setMode(res.data.length > 0 ? "pick" : "create");
        })
        .catch(() => setMode("create"))
        .finally(() => setLocsLoading(false));
    } else {
      setMode(savedLocs.length > 0 ? "pick" : "create");
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!locName.trim() || !locStreet.trim()) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      // 1. Create the SavedLocation
      const newLoc = await api.post<any>("/locations", {
        name:   locName.trim(),
        street: locStreet.trim(),
        town:   locTown.trim() || undefined,
        postcode: locPostcode.trim() || undefined,
      });
      // 2. Set it as the company depot
      const updated = await api.patch<any>("/company", { depotLocationId: newLoc.id });
      setDepot(updated.depotLocation ?? { id: newLoc.id, name: newLoc.name, siteName: newLoc.siteName, town: newLoc.town, postcode: newLoc.postcode, lat: newLoc.lat, lng: newLoc.lng });
      setSavedLocs(prev => [...(prev ?? []), { id: newLoc.id, name: newLoc.name, siteName: newLoc.siteName, town: newLoc.town, postcode: newLoc.postcode }]);
      setSuccess("Depot saved ✓");
      setMode("idle");
      setLocName(""); setLocStreet(""); setLocTown(""); setLocPostcode("");
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  }

  async function handlePick(e: React.FormEvent) {
    e.preventDefault();
    if (!pickedId) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const updated = await api.patch<any>("/company", { depotLocationId: Number(pickedId) });
      setDepot(updated.depotLocation ?? null);
      setSuccess("Depot saved ✓");
      setMode("idle");
      setPickedId("");
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  }

  function cancel() { setMode("idle"); setError(""); setSuccess(""); }

  return (
    <div>
      {success && <Alert type="success" message={success} />}
      {error   && <Alert type="error"   message={error}   />}

      {/* Current depot badge */}
      {depot ? (
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 flex items-center gap-2 rounded bg-blue-50 border border-blue-100 px-3 py-2 text-sm">
            <span>🏭</span>
            <span className="font-medium text-blue-800">
              {depot.siteName ?? depot.name}
              {depot.town ? ` · ${depot.town}` : ""}
              {depot.postcode ? ` · ${depot.postcode}` : ""}
            </span>
          </div>
          {mode === "idle" && (
            <button
              onClick={startChange}
              disabled={locsLoading}
              className="text-sm text-accent hover:underline whitespace-nowrap"
            >
              {locsLoading ? "Loading…" : "Change"}
            </button>
          )}
        </div>
      ) : (
        mode === "idle" && (
          <p className="text-sm mb-3" style={{ color: "#6b7280" }}>
            No depot set yet.{" "}
            <button onClick={startChange} disabled={locsLoading} className="text-accent underline">
              {locsLoading ? "Loading…" : "Set up depot"}
            </button>
          </p>
        )
      )}

      {/* Pick from existing locations */}
      {mode === "pick" && savedLocs && (
        <form onSubmit={handlePick} className="space-y-3">
          <div>
            <label className="label">Pick from saved locations</label>
            <select
              className="input"
              value={pickedId}
              onChange={e => setPickedId(e.target.value ? Number(e.target.value) : "")}
              required
            >
              <option value="">— select a location —</option>
              {savedLocs.map(l => (
                <option key={l.id} value={l.id}>
                  {l.siteName ? `${l.siteName} (${l.name})` : l.name}
                  {l.town ? ` · ${l.town}` : ""}
                  {l.postcode ? ` · ${l.postcode}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button type="submit" loading={saving} disabled={!pickedId}>Save</Button>
            <button type="button" onClick={() => setMode("create")} className="text-sm text-accent hover:underline">
              Add new location instead
            </button>
            <button type="button" onClick={cancel} className="text-sm text-muted hover:underline ml-auto">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Create new location and set as depot */}
      {mode === "create" && (
        <form onSubmit={handleCreate} className="space-y-3 rounded border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-muted">Enter your depot / yard address — it will be saved as a location for future use.</p>
          <div className="grid grid-cols-1 gap-2">
            <div>
              <label className="label text-xs">Name <span className="text-red-400">*</span></label>
              <input className="input text-sm" value={locName} onChange={e => setLocName(e.target.value)} placeholder="e.g. Main Yard" required />
            </div>
            <div>
              <label className="label text-xs">Street address <span className="text-red-400">*</span></label>
              <input className="input text-sm" value={locStreet} onChange={e => setLocStreet(e.target.value)} placeholder="e.g. 12 Industrial Way" required />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label text-xs">Town / City</label>
                <input className="input text-sm" value={locTown} onChange={e => setLocTown(e.target.value)} placeholder="e.g. Leeds" />
              </div>
              <div>
                <label className="label text-xs">Postcode</label>
                <input className="input text-sm" value={locPostcode} onChange={e => setLocPostcode(e.target.value.toUpperCase())} placeholder="e.g. LS1 2AB" />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" loading={saving} disabled={!locName.trim() || !locStreet.trim()}>
              Save as depot
            </Button>
            {savedLocs && savedLocs.length > 0 && (
              <button type="button" onClick={() => setMode("pick")} className="text-sm text-accent hover:underline">
                Pick existing instead
              </button>
            )}
            <button type="button" onClick={cancel} className="text-sm text-muted hover:underline ml-auto">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

const ROLE_LABELS: Record<string, string> = {
  company_owner: "Company Owner",
  planner:       "Planner",
  driver:        "Driver",
  manager:       "Manager",
  job_creator:   "Job Creator",
};

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

  // Depot / planning — loaded once from GET /company, passed to DepotSection
  const [depotLocation, setDepotLocation] = useState<DepotLocation | null>(null);

  // Password change
  const [currentPw, setCurrentPw] = useState("");
  const [newPw,     setNewPw]     = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSuccess, setPwSuccess] = useState("");
  const [pwError,   setPwError]   = useState("");

  // Load company settings only — no locations fetch on mount
  useEffect(() => {
    api.get<any>("/company").then(data => {
      setReportEmail(data.reportEmail ?? "");
      setReportEmailEnabled(data.reportEmailEnabled ?? true);
      setCompanyName(data.name ?? "");
      setTicker(data.ticker ?? "");
      setDepotLocation(data.depotLocation ?? null);
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
            { label: "Role",      value: user?.role ? (ROLE_LABELS[user.role] ?? user.role) : undefined },
          ].map(r => (
            <div key={r.label} className="flex justify-between py-2 border-b border-border last:border-0">
              <span style={{ color: "#6b7280" }}>{r.label}</span>
              <span className="font-semibold" style={{ color: "#0f172a" }}>{r.value}</span>
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

      {/* Planning — depot location */}
      <div className="card p-6">
        <h2 className="font-bold mb-1" style={{ color: "#0f172a" }}>Planning — Home Depot / Yard</h2>
        <p className="text-sm mb-4" style={{ color: "#6b7280" }}>
          The starting and ending point for all runs. Used to calculate distances and run availability.
        </p>
        <DepotSection initial={depotLocation} />
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
