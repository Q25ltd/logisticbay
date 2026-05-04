import { useState } from "react";
import { useNavigate } from "react-router-dom";

const SECTIONS = [
  {
    id: "basics",
    icon: "📋",
    title: "Job Basics",
    subtitle: "Date, reference number, service type and priority",
  },
  {
    id: "customer",
    icon: "🏢",
    title: "Customer Details",
    subtitle: "Who is this job for",
  },
  {
    id: "pickup",
    icon: "📦",
    title: "Pickup Stop",
    subtitle: "Where the load is collected from",
  },
  {
    id: "dropoff",
    icon: "📍",
    title: "Dropoff Stop",
    subtitle: "Where the load is delivered to",
  },
  {
    id: "timing",
    icon: "🕐",
    title: "Timing",
    subtitle: "Time windows, booked slots and driver schedule",
  },
  {
    id: "load",
    icon: "⚖️",
    title: "Load Details",
    subtitle: "Material type, quantity, weight and hazard class",
  },
  {
    id: "vehicle",
    icon: "🚛",
    title: "Vehicle Requirements",
    subtitle: "Vehicle class, trailer type and special equipment",
  },
  {
    id: "notes",
    icon: "📝",
    title: "Notes & Instructions",
    subtitle: "Planner notes, driver instructions and internal comments",
  },
];

const MISSING_FIELDS = [
  "Pickup address",
  "Dropoff address",
  "Planned date",
  "Material type",
];

export default function CreateJobPage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState<"draft" | "ready" | null>(null);

  function handleSaveDraft() {
    setSaving("draft");
    setTimeout(() => setSaving(null), 1000);
  }

  function handleSaveReady() {
    setSaving("ready");
    setTimeout(() => setSaving(null), 1000);
  }

  return (
    <div className="min-h-screen bg-surface pb-32">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-border px-6 py-5">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="text-muted hover:text-primary transition-colors text-lg leading-none"
            title="Back"
          >
            ←
          </button>
          <div>
            <h1 className="text-xl font-black text-primary">Create Job</h1>
            <p className="text-sm text-muted mt-0.5">
              Fill in the sections below — save as draft any time, mark ready when complete
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-6 space-y-4">

        {/* ── Quality score ────────────────────────────────────────────────── */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs font-bold text-muted uppercase tracking-widest mb-1">
                Job Quality
              </div>
              <div className="text-3xl font-black text-primary">0%</div>
            </div>
            <div className="w-20 h-20 rounded-full border-4 border-gray-100 flex items-center justify-center relative">
              <span className="text-lg font-black text-gray-300">0%</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
            <div className="h-2 bg-gray-200 rounded-full" style={{ width: "0%" }} />
          </div>

          {/* Missing fields */}
          <div className="border-t border-border pt-3">
            <div className="text-xs font-semibold text-muted mb-2">Missing required fields</div>
            <div className="flex flex-wrap gap-2">
              {MISSING_FIELDS.map(f => (
                <span
                  key={f}
                  className="inline-flex items-center gap-1 text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-1 rounded-full"
                >
                  <span className="text-red-400">●</span> {f}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── Template selector placeholder ───────────────────────────────── */}
        <div className="card p-5">
          <div className="text-xs font-bold text-muted uppercase tracking-widest mb-3">
            Start from Template
          </div>
          <div className="flex items-center gap-3 p-4 bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl text-center justify-center cursor-not-allowed opacity-60">
            <span className="text-2xl">📄</span>
            <div className="text-left">
              <div className="text-sm font-semibold text-primary">Select a template</div>
              <div className="text-xs text-muted">Autofill from a saved job template — coming soon</div>
            </div>
          </div>
        </div>

        {/* ── 8 sections ──────────────────────────────────────────────────── */}
        {SECTIONS.map((section, idx) => (
          <div key={section.id} className="card overflow-hidden">
            {/* Section header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-gray-50/50">
              <div className="w-9 h-9 rounded-lg bg-white border border-border flex items-center justify-center text-lg shadow-sm flex-shrink-0">
                {section.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-muted uppercase tracking-widest">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <h2 className="text-sm font-black text-primary">{section.title}</h2>
                </div>
                <p className="text-xs text-muted mt-0.5 truncate">{section.subtitle}</p>
              </div>
              <span className="text-xs text-gray-300 font-medium flex-shrink-0">Coming soon</span>
            </div>

            {/* Empty body — fields go here section by section */}
            <div className="px-5 py-8 flex items-center justify-center">
              <div className="text-center">
                <div className="text-2xl mb-2 opacity-20">{section.icon}</div>
                <div className="text-xs text-gray-300 font-medium">
                  Fields for {section.title} will be added here
                </div>
              </div>
            </div>
          </div>
        ))}

      </div>

      {/* ── Sticky save bar ─────────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-border shadow-lg z-40">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="btn btn-outline text-sm px-4 py-2.5"
          >
            Cancel
          </button>
          <div className="flex-1" />
          <button
            onClick={handleSaveDraft}
            disabled={saving !== null}
            className="btn btn-outline text-sm px-5 py-2.5 font-semibold"
          >
            {saving === "draft" ? "Saving…" : "Save Draft"}
          </button>
          <button
            onClick={handleSaveReady}
            disabled={saving !== null}
            className="btn btn-primary text-sm px-5 py-2.5 font-semibold"
          >
            {saving === "ready" ? "Saving…" : "Save — Ready for Planner →"}
          </button>
        </div>
      </div>

    </div>
  );
}
