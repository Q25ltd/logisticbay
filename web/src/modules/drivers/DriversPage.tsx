import { useState, useEffect } from "react";
import { driversApi } from "../../api/drivers";
import type { Driver } from "../../types";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Alert } from "../../components/Alert";
import { Input } from "../../components/Input";

function DriverForm({ initial, onSave, onCancel }: {
  initial?: Driver; onSave: () => void; onCancel: () => void;
}) {
  const [form, setForm] = useState({
    displayName:    initial?.displayName    ?? "",
    employeeNumber: initial?.employeeNumber ?? "",
    phoneNumber:    initial?.phoneNumber    ?? "",
    email:          initial?.user?.email    ?? "",
  });
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const [loginDetails, setLoginDetails] = useState<{ email: string; pin: string } | null>(null);
  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [f]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      if (initial) {
        await driversApi.update(initial.id, form);
        onSave();
      } else {
        const result = await driversApi.create(form) as any;
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
          placeholder="driver@company.com" hint="Driver logs into mobile app with this email + PIN" />
      )}
      <div className="flex gap-3 mt-2">
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

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await driversApi.list();
      setDrivers(res.data);
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
    <div className="p-6 max-w-5xl">
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
