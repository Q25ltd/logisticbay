import { useState, useEffect } from "react";
import { Button } from "../../components/Button";
import { Alert } from "../../components/Alert";
import { Input } from "../../components/Input";
import { api } from "../../api/client";

interface Template {
  id: number; name: string; pickupTextSnapshot: string;
  dropoffTextSnapshot: string; defaultReference: string;
  defaultNotes: string; defaultMaterialType: string;
  status: "active" | "archived";
}

function TemplateForm({ initial, onSave, onCancel }: {
  initial?: Template; onSave: () => void; onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name:                initial?.name                ?? "",
    pickupTextSnapshot:  initial?.pickupTextSnapshot  ?? "",
    dropoffTextSnapshot: initial?.dropoffTextSnapshot ?? "",
    defaultReference:    initial?.defaultReference    ?? "",
    defaultMaterialType: initial?.defaultMaterialType ?? "",
    defaultNotes:        initial?.defaultNotes        ?? "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [f]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      if (initial) { await api.patch(`/job-templates/${initial.id}`, form); }
      else         { await api.post("/job-templates", form); }
      onSave();
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <Alert type="error" message={error} />}
      <Input label="Template Name *" value={form.name} onChange={set("name")} placeholder="Depot A to Site X" required />
      <Input label="Pickup Address *" value={form.pickupTextSnapshot} onChange={set("pickupTextSnapshot")} placeholder="15 Arden Place, LU2 7YE" required />
      <Input label="Dropoff Address *" value={form.dropoffTextSnapshot} onChange={set("dropoffTextSnapshot")} placeholder="34 Dunelm Road, TS29 6PX" required />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Default Reference" value={form.defaultReference} onChange={set("defaultReference")} placeholder="REF001" />
        <Input label="Material Type" value={form.defaultMaterialType} onChange={set("defaultMaterialType")} placeholder="Type 1..." />
      </div>
      <div className="mb-4">
        <label className="label">Default Notes</label>
        <textarea className="input min-h-16" value={form.defaultNotes} onChange={set("defaultNotes")} placeholder="Call site before arrival..." />
      </div>
      <div className="flex gap-3">
        <Button type="submit" loading={loading} className="flex-1">{initial ? "Save Changes" : "Create Template →"}</Button>
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
      </div>
    </form>
  );
}

export default function TemplatesPage() {
  const [templates,    setTemplates]    = useState<Template[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");
  const [showForm,     setShowForm]     = useState(false);
  const [editTemplate, setEditTemplate] = useState<Template | undefined>();
  const [filter,       setFilter]       = useState<"active" | "archived">("active");
  const [search,       setSearch]       = useState("");
  const [success,      setSuccess]      = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await api.get<{ data: Template[] }>(`/job-templates?status=${filter}`);
      setTemplates(res.data);
    } catch (err: any) { setError(err.message); }
    setLoading(false);
  }

  useEffect(() => { load(); }, [filter]);

  async function handleArchive(t: Template) {
    const action = t.status === "active" ? "archive" : "restore";
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} "${t.name}"?`)) return;
    try {
      await api.patch(`/job-templates/${t.id}`, { status: t.status === "active" ? "archived" : "active" });
      setSuccess(`Template ${action}d ✓`); load();
    } catch (err: any) { alert(err.message); }
  }

  const filtered = templates.filter(t =>
    !search ||
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.pickupTextSnapshot.toLowerCase().includes(search.toLowerCase()) ||
    t.dropoffTextSnapshot.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-black text-primary">Job Templates</h1>
          <p className="text-sm text-muted">Reuse common routes to create jobs faster</p>
        </div>
        <div className="text-xs text-muted text-right">
          Create templates from the structured job form using “Save as template”.
        </div>
      </div>
      {success && <Alert type="success" message={success} />}
      {error   && <Alert type="error"   message={error}   />}
      {showForm && editTemplate && (
        <div className="card p-6 mb-6">
          <h2 className="font-bold text-primary mb-4">Edit — {editTemplate.name}</h2>
          <TemplateForm
            initial={editTemplate}
            onSave={() => { setShowForm(false); setEditTemplate(undefined); setSuccess("Template saved ✓"); load(); }}
            onCancel={() => { setShowForm(false); setEditTemplate(undefined); }}
          />
        </div>
      )}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input className="input flex-1 min-w-48" placeholder="Search templates..." value={search} onChange={e => setSearch(e.target.value)} />
        <div className="flex gap-1">
          {(["active","archived"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={"px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors " + (filter === f ? "bg-primary text-white" : "bg-white border border-border text-muted hover:text-primary")}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="text-center py-12 text-muted">Loading templates...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">📄</div>
          <div className="font-bold text-primary mb-1">{templates.length === 0 ? "No templates yet" : "No templates match"}</div>
          <div className="text-sm text-muted mb-4">Create templates to speed up job creation</div>
          {templates.length === 0 && (
            <div className="text-xs text-muted">Create a job and tick “Save as template” to add your first template.</div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(t => (
            <div key={t.id} className={"card p-4 " + (t.status === "archived" ? "opacity-60" : "")}>
              <div className="flex items-start justify-between mb-3">
                <div className="font-bold text-primary">{t.name}</div>
                <div className="flex gap-3 ml-4 flex-shrink-0">
                  <button onClick={() => { setEditTemplate(t); setShowForm(true); }} className="text-xs text-accent hover:underline font-semibold">Edit</button>
                  <button onClick={() => handleArchive(t)} className="text-xs text-muted hover:underline font-semibold">{t.status === "active" ? "Archive" : "Restore"}</button>
                </div>
              </div>
              <div className="text-sm text-muted space-y-1">
                <div className="flex items-start gap-2"><span className="text-green-600">↑</span><span>{t.pickupTextSnapshot}</span></div>
                <div className="flex items-start gap-2"><span className="text-red-500">↓</span><span>{t.dropoffTextSnapshot}</span></div>
                {t.defaultMaterialType && <div>📦 {t.defaultMaterialType}</div>}
                {t.defaultReference    && <div>📋 {t.defaultReference}</div>}
                {t.defaultNotes        && <div className="text-xs italic">💬 {t.defaultNotes}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
