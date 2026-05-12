import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { jobsApi } from "../../api/jobs";
import type { JobTemplate } from "../../types";
import { Alert } from "../../components/Alert";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function stopSummary(t: JobTemplate): string {
  const stops = Array.isArray(t.defaultStops) ? t.defaultStops : [];
  if (!stops.length) return "";
  const collections = stops.filter((s: Record<string, unknown>) => s.type === "collection" || s.stopType === "collection" || s.type === "pickup").length;
  const deliveries  = stops.filter((s: Record<string, unknown>) => s.type === "delivery"   || s.stopType === "delivery"   || s.type === "dropoff").length;
  const parts = [];
  if (collections) parts.push(`${collections} collection${collections > 1 ? "s" : ""}`);
  if (deliveries)  parts.push(`${deliveries} deliver${deliveries > 1 ? "ies" : "y"}`);
  return parts.join(" · ");
}

// ── Template card ─────────────────────────────────────────────────────────────

function TemplateCard({ t, onEdit, onUse, onArchive, onRestore }: {
  t: JobTemplate;
  onEdit: () => void;
  onUse: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const jd = t.defaultJobData;
  const stops = Array.isArray(t.defaultStops) ? t.defaultStops : [];
  const firstStop = stops[0] as Record<string, unknown> | undefined;
  const lastStop  = stops[stops.length - 1] as Record<string, unknown> | undefined;

  return (
    <div className={"card flex flex-col " + (t.status === "archived" ? "opacity-50" : "")}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-100 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-bold text-primary truncate">{t.name}</div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {jd?.serviceType && (
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{jd.serviceType.replace("_"," ")}</span>
            )}
            {jd?.customerName && (
              <span className="text-xs text-muted">{jd.customerName}</span>
            )}
          </div>
        </div>
        {t.status === "active" && (
          <button onClick={onUse}
            className="flex-shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors">
            Use →
          </button>
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-3 flex-1 space-y-2 text-sm text-muted">
        {/* Stops summary */}
        {stops.length > 0 && (
          <div className="space-y-1">
            {firstStop && (
              <div className="flex items-start gap-2">
                <span className="text-blue-500 flex-shrink-0">↑</span>
                <span className="truncate">{String(firstStop.siteName || firstStop.locationQuery || firstStop.town || "")}</span>
              </div>
            )}
            {stops.length > 2 && (
              <div className="flex items-start gap-2">
                <span className="text-slate-300 flex-shrink-0">·</span>
                <span className="text-xs text-muted">{stops.length - 2} intermediate stop{stops.length - 2 > 1 ? "s" : ""}</span>
              </div>
            )}
            {lastStop && stops.length > 1 && (
              <div className="flex items-start gap-2">
                <span className="text-green-500 flex-shrink-0">↓</span>
                <span className="truncate">{String(lastStop.siteName || lastStop.locationQuery || lastStop.town || "")}</span>
              </div>
            )}
          </div>
        )}
        {!stops.length && t.pickupTextSnapshot && (
          <div className="space-y-1">
            <div className="flex items-start gap-2"><span className="text-blue-500">↑</span><span>{t.pickupTextSnapshot}</span></div>
            {t.dropoffTextSnapshot && <div className="flex items-start gap-2"><span className="text-green-500">↓</span><span>{t.dropoffTextSnapshot}</span></div>}
          </div>
        )}

        {/* Stop count + material */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {stopSummary(t) && <span>🚛 {stopSummary(t)}</span>}
          {(jd?.materialDesc || t.defaultMaterialType) && (
            <span>📦 {jd?.materialDesc || t.defaultMaterialType}</span>
          )}
          {jd?.vehicleType && <span>🚚 {jd.vehicleType.replace("_"," ")}</span>}
        </div>

        {/* Variables note */}
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 leading-relaxed">
          ⚡ Open with <strong>Use →</strong> then set date, times &amp; ref numbers.
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
        <span className="text-xs text-muted">{t.updatedAt ? `Updated ${fmtDate(t.updatedAt)}` : ""}</span>
        <div className="flex gap-3">
          {t.status === "active" && (
            <button onClick={onEdit} className="text-xs text-accent hover:text-primary font-semibold transition-colors">
              Edit template
            </button>
          )}
          {t.status === "active"
            ? <button onClick={onArchive} className="text-xs text-muted hover:text-red-500 font-semibold transition-colors">Archive</button>
            : <button onClick={onRestore} className="text-xs text-muted hover:text-green-600 font-semibold transition-colors">Restore</button>
          }
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<JobTemplate[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");
  const [success,   setSuccess]   = useState("");
  const [filter,    setFilter]    = useState<"active" | "archived">("active");
  const [search,    setSearch]    = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await jobsApi.templates(filter);
      setTemplates(res.data);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Load failed"); }
    setLoading(false);
  }

  useEffect(() => { load(); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleArchive(t: JobTemplate) {
    if (!confirm(`Archive "${t.name}"? It won't appear in job creation but can be restored.`)) return;
    try {
      await jobsApi.updateTemplate(t.id, { status: "archived" });
      setSuccess(`"${t.name}" archived ✓`); load();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Failed"); }
  }

  async function handleRestore(t: JobTemplate) {
    try {
      await jobsApi.updateTemplate(t.id, { status: "active" });
      setSuccess(`"${t.name}" restored ✓`); load();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Failed"); }
  }

  const filtered = templates.filter(t =>
    !search ||
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.defaultJobData?.customerName ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (t.defaultMaterialType ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 sm:p-6 max-w-5xl">

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-black text-primary">Job Templates</h1>
          <p className="text-sm text-muted">
            {filter === "active" ? templates.length : ""}
            {filter === "active" && templates.length > 0 ? " active · " : ""}
            Pre-fill a job in seconds — only change date, times and ref numbers
          </p>
        </div>
        <button
          onClick={() => navigate("/app/jobs/new")}
          className="btn btn-primary text-sm px-4 py-2">
          + New Job
        </button>
      </div>

      {success && <Alert type="success" message={success} />}
      {error   && <Alert type="error"   message={error}   />}

      {/* Info banner for first time */}
      {!loading && templates.length === 0 && filter === "active" && (
        <div className="card p-6 mb-6 border-l-4 border-l-blue-500">
          <div className="font-bold text-primary mb-2">How templates work</div>
          <ol className="text-sm text-muted space-y-1.5 list-decimal list-inside">
            <li>Create a job as normal, then tick <strong>"Also save as new template"</strong> at the bottom</li>
            <li>Templates store everything except dates, times and reference numbers</li>
            <li>Next time: pick your template, fill in today's date + slot, done in 2 minutes</li>
          </ol>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <input
          className="input flex-1 min-w-48"
          placeholder="Search by name, customer, material…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {(["active", "archived"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={"px-3 py-1 rounded-md text-xs font-semibold transition-colors " +
                (filter === f ? "bg-white text-primary shadow-sm" : "text-muted hover:text-primary")}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-12 text-muted">Loading templates…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">📋</div>
          <div className="font-bold text-primary mb-1">
            {templates.length === 0 ? "No templates yet" : `No ${filter} templates match`}
          </div>
          <div className="text-sm text-muted">
            {templates.length === 0
              ? "Create a job and tick \"Save as template\" — it appears here instantly"
              : "Try a different search or switch filter"}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(t => (
            <TemplateCard
              key={t.id}
              t={t}
              onUse={()    => navigate(`/app/jobs/new?templateId=${t.id}`)}
              onEdit={()   => navigate(`/app/jobs/new?editTemplateId=${t.id}`)}
              onArchive={() => handleArchive(t)}
              onRestore={() => handleRestore(t)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
