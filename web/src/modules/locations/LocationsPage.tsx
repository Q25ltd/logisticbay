import { useState, useEffect } from "react";
import { jobsApi } from "../../api/jobs";
import type { SavedLocation } from "../../types";
import { Button } from "../../components/Button";
import { Alert } from "../../components/Alert";
import { Input } from "../../components/Input";

function LocationForm({ initial, onSave, onCancel }: {
  initial?: SavedLocation; onSave: () => void; onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name:        initial?.name        ?? "",
    addressText: initial?.addressText ?? "",
    postcode:    initial?.postcode    ?? "",
    notes:       initial?.notes       ?? "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [f]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      await jobsApi.createLocation(form);
      onSave();
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <Alert type="error" message={error} />}
      <Input label="Location Name *" value={form.name} onChange={set("name")} placeholder="Arden Place Yard" required />
      <Input label="Address *" value={form.addressText} onChange={set("addressText")} placeholder="15 Arden Place, Luton" required />
      <Input label="Postcode" value={form.postcode} onChange={set("postcode")} placeholder="LU2 7YE" />
      <div className="mb-4">
        <label className="label">Notes</label>
        <textarea className="input min-h-16" value={form.notes} onChange={set("notes")} placeholder="Use gate 3, call ahead..." />
      </div>
      <div className="flex gap-3">
        <Button type="submit" loading={loading} className="flex-1">
          {initial ? "Save Changes" : "Add Location →"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
      </div>
    </form>
  );
}

export default function LocationsPage() {
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [search,    setSearch]    = useState("");
  const [success,   setSuccess]   = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await jobsApi.locations();
      setLocations(res.data);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = locations.filter(l =>
    !search ||
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    l.addressText.toLowerCase().includes(search.toLowerCase()) ||
    l.postcode.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-black text-primary">Saved Locations</h1>
          <p className="text-sm text-muted">Reusable pickup and dropoff addresses</p>
        </div>
        <Button onClick={() => setShowForm(true)}>+ Add Location</Button>
      </div>

      {success && <Alert type="success" message={success} />}

      {showForm && (
        <div className="card p-6 mb-6">
          <h2 className="font-bold text-primary mb-4">New Location</h2>
          <LocationForm
            onSave={() => { setShowForm(false); setSuccess("Location saved ✓"); load(); }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      <div className="mb-4">
        <input className="input" placeholder="Search locations..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted">Loading locations...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">📍</div>
          <div className="font-bold text-primary mb-1">{locations.length === 0 ? "No locations yet" : "No locations match"}</div>
          <div className="text-sm text-muted mb-4">Save common addresses to speed up job and template creation</div>
          {locations.length === 0 && <Button onClick={() => setShowForm(true)}>Add First Location</Button>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(loc => (
            <div key={loc.id} className="card p-4">
              <div className="font-bold text-primary mb-2">{loc.name}</div>
              <div className="text-sm text-muted space-y-1">
                <div>📍 {loc.addressText}</div>
                {loc.postcode && <div className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded inline-block">{loc.postcode}</div>}
                {loc.notes    && <div className="text-xs italic mt-2">💬 {loc.notes}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
