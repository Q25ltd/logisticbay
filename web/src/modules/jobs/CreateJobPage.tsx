import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { customersApi } from "../../api/customers";
import { useAuth } from "../../hooks/useAuth";
import type { Customer } from "../../types";

// ── Options ───────────────────────────────────────────────────────────────────

const SERVICE_TYPES: [string, string][] = [
  ["delivery",            "Delivery"],
  ["collection",          "Collection"],
  ["transfer",            "Transfer / Trunking"],
  ["collection_delivery", "Collection & Delivery"],
  ["trunking",            "Linehaul / Trunking"],
];

const JOB_TYPES: [string, string][] = [
  ["full_load",    "Full Load (FTL)"],
  ["part_load",    "Part Load (LTL)"],
  ["multi_drop",   "Multi-Drop"],
  ["groupage",     "Groupage"],
  ["return_load",  "Return Load"],
  ["trunking",     "Trunking / Linehaul"],
  ["abnormal",     "Abnormal / Specialist"],
];

const PRIORITY_OPTS: [string, string][] = [
  ["low",    "Low"],
  ["normal", "Normal"],
  ["high",   "High — Urgent"],
];

// ── Empty section shells (sections 2-8) ───────────────────────────────────────

const SHELLS = [
  { id: "customer", icon: "🏢", title: "Customer Details",      subtitle: "Who is this job for" },
  { id: "pickup",   icon: "📦", title: "Pickup Stop",           subtitle: "Where the load is collected from" },
  { id: "dropoff",  icon: "📍", title: "Dropoff Stop",          subtitle: "Where the load is delivered to" },
  { id: "timing",   icon: "🕐", title: "Timing",                subtitle: "Time windows, booked slots and driver schedule" },
  { id: "load",     icon: "⚖️", title: "Load Details",          subtitle: "Material type, quantity, weight and hazard class" },
  { id: "vehicle",  icon: "🚛", title: "Vehicle Requirements",  subtitle: "Vehicle class, trailer type and special equipment" },
  { id: "notes",    icon: "📝", title: "Notes & Instructions",  subtitle: "Planner notes, driver instructions and internal comments" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().split("T")[0];
const nowDisplay = () =>
  new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

// ── Sub-components ────────────────────────────────────────────────────────────

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-primary mb-1.5">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="input bg-gray-50 text-muted cursor-default select-none text-sm py-2.5">
        {value}
      </div>
    </div>
  );
}

function SectionHeader({
  num, icon, title, subtitle, active,
}: {
  num: number; icon: string; title: string; subtitle: string; active?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-gray-50/50">
      <div className="w-9 h-9 rounded-lg bg-white border border-border flex items-center justify-center text-lg shadow-sm flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-muted uppercase tracking-widest">
            {String(num).padStart(2, "0")}
          </span>
          <h2 className="text-sm font-black text-primary">{title}</h2>
        </div>
        <p className="text-xs text-muted mt-0.5 truncate">{subtitle}</p>
      </div>
      {!active && (
        <span className="text-xs text-gray-300 font-medium flex-shrink-0">Coming soon</span>
      )}
    </div>
  );
}

// ── Customer typeahead ────────────────────────────────────────────────────────

function CustomerSearch({
  value, linkedId, onChange,
}: {
  value: string;
  linkedId: number | null;
  onChange: (name: string, id: number | null) => void;
}) {
  const [suggestions, setSuggestions] = useState<Customer[]>([]);
  const [open,        setOpen]        = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef  = useRef<HTMLDivElement>(null);

  function handleInput(text: string) {
    onChange(text, null); // clear linked id when typing
    if (debounce.current) clearTimeout(debounce.current);
    if (!text.trim()) { setSuggestions([]); setOpen(false); return; }
    debounce.current = setTimeout(async () => {
      try {
        const res = await customersApi.list(text.trim());
        setSuggestions(res.data.slice(0, 8));
        setOpen(res.data.length > 0);
      } catch { setSuggestions([]); }
    }, 220);
  }

  function pick(c: Customer) {
    onChange(c.name, c.id);
    setSuggestions([]);
    setOpen(false);
  }

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input
          type="text"
          className="input pr-8"
          placeholder="Start typing customer name…"
          value={value}
          onChange={e => handleInput(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          autoComplete="off"
        />
        {linkedId && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-green-500 text-sm" title="Linked to existing customer">✓</span>
        )}
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-border rounded-xl shadow-lg overflow-hidden">
          {suggestions.map(c => (
            <button
              key={c.id}
              type="button"
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors border-b border-border last:border-0"
              onMouseDown={() => pick(c)}
            >
              <span className="font-semibold text-primary">{c.name}</span>
              {c.contactName && <span className="text-muted ml-2 text-xs">· {c.contactName}</span>}
            </button>
          ))}
          <div className="px-4 py-2 text-xs text-muted bg-gray-50 border-t border-border">
            Not listed? Just keep typing — name will be saved as entered
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CreateJobPage() {
  const navigate   = useNavigate();
  const { user }   = useAuth();
  const [saving,   setSaving]   = useState<"draft" | "ready" | null>(null);
  const [showOpts, setShowOpts] = useState(false);

  // Form — Job Basics
  const [customerName,        setCustomerName]        = useState("");
  const [customerId,          setCustomerId]          = useState<number | null>(null);
  const [plannedDate,         setPlannedDate]         = useState(today());
  const [serviceType,         setServiceType]         = useState("");
  const [jobType,             setJobType]             = useState("");
  // Optional
  const [jobTitle,            setJobTitle]            = useState("");
  const [referenceNumber,     setReferenceNumber]     = useState("");
  const [customerRef,         setCustomerRef]         = useState("");
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState("");
  const [priority,            setPriority]            = useState("normal");

  // Quality score placeholder — will compute properly once all sections are wired
  const basicsComplete = customerName.trim() && plannedDate && serviceType && jobType;
  const MISSING = [
    !customerName.trim() && "Customer",
    !plannedDate         && "Work date",
    !serviceType         && "Service type",
    !jobType             && "Job type",
    "Pickup address",
    "Dropoff address",
    "Material type",
  ].filter(Boolean) as string[];

  function handleSaveDraft() {
    setSaving("draft");
    setTimeout(() => setSaving(null), 1200);
  }

  function handleSaveReady() {
    setSaving("ready");
    setTimeout(() => setSaving(null), 1200);
  }

  return (
    <div className="min-h-screen bg-surface pb-32">

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-border px-6 py-5">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="text-muted hover:text-primary transition-colors text-xl leading-none"
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

        {/* ── Quality score ─────────────────────────────────────────────────── */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs font-bold text-muted uppercase tracking-widest mb-1">Job Quality</div>
              <div className="text-3xl font-black text-primary">0%</div>
              <div className="text-xs text-muted mt-0.5">Live score — coming soon</div>
            </div>
            <div className="w-16 h-16 rounded-full border-4 border-gray-100 flex items-center justify-center">
              <span className="text-sm font-black text-gray-300">0%</span>
            </div>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
            <div className="h-2 bg-gray-200 rounded-full" style={{ width: "0%" }} />
          </div>
          <div className="border-t border-border pt-3">
            <div className="text-xs font-semibold text-muted mb-2">Missing required fields</div>
            <div className="flex flex-wrap gap-2">
              {MISSING.map(f => (
                <span key={f} className="inline-flex items-center gap-1 text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-1 rounded-full">
                  <span className="text-red-400">●</span> {f}
                </span>
              ))}
              {MISSING.length === 0 && (
                <span className="text-xs text-green-700 font-semibold">✓ All required fields filled</span>
              )}
            </div>
          </div>
        </div>

        {/* ── Template selector placeholder ─────────────────────────────────── */}
        <div className="card p-5">
          <div className="text-xs font-bold text-muted uppercase tracking-widest mb-3">Start from Template</div>
          <div className="flex items-center gap-3 p-4 bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl justify-center cursor-not-allowed opacity-50">
            <span className="text-2xl">📄</span>
            <div className="text-left">
              <div className="text-sm font-semibold text-primary">Select a template</div>
              <div className="text-xs text-muted">Autofill from a saved job template — coming soon</div>
            </div>
          </div>
        </div>

        {/* ── Section 01 — Job Basics ───────────────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader num={1} icon="📋" title="Job Basics" subtitle="Date, service type and job type" active />

          <div className="px-5 pt-5 pb-4 space-y-4">

            {/* Customer */}
            <div>
              <FieldLabel required>Customer</FieldLabel>
              <CustomerSearch
                value={customerName}
                linkedId={customerId}
                onChange={(name, id) => { setCustomerName(name); setCustomerId(id); }}
              />
            </div>

            {/* Work date */}
            <div>
              <FieldLabel required>Work Date</FieldLabel>
              <input
                type="date"
                className="input"
                value={plannedDate}
                onChange={e => setPlannedDate(e.target.value)}
              />
            </div>

            {/* Service type + Job type — side by side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel required>Service Type</FieldLabel>
                <select className="input" value={serviceType} onChange={e => setServiceType(e.target.value)}>
                  <option value="">— Select —</option>
                  {SERVICE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel required>Job Type</FieldLabel>
                <select className="input" value={jobType} onChange={e => setJobType(e.target.value)}>
                  <option value="">— Select —</option>
                  {JOB_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>

            {/* Optional details toggle */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowOpts(o => !o)}
                className="text-xs font-semibold text-accent hover:underline flex items-center gap-1.5"
              >
                <span className="text-base leading-none">{showOpts ? "▾" : "▸"}</span>
                {showOpts ? "Hide optional job details" : "+ Add optional job details"}
              </button>
            </div>

            {/* Optional fields */}
            {showOpts && (
              <div className="space-y-4 pt-1 border-t border-border">

                {/* Job title */}
                <div>
                  <FieldLabel>Job Title / Short Description</FieldLabel>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Overnight trunking — Manchester to London"
                    value={jobTitle}
                    onChange={e => setJobTitle(e.target.value)}
                  />
                </div>

                {/* References row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <FieldLabel>Job Reference No.</FieldLabel>
                    <input
                      type="text"
                      className="input"
                      placeholder="JB-00123"
                      value={referenceNumber}
                      onChange={e => setReferenceNumber(e.target.value)}
                    />
                  </div>
                  <div>
                    <FieldLabel>Customer Reference No.</FieldLabel>
                    <input
                      type="text"
                      className="input"
                      placeholder="CUST-REF-456"
                      value={customerRef}
                      onChange={e => setCustomerRef(e.target.value)}
                    />
                  </div>
                  <div>
                    <FieldLabel>Purchase Order No.</FieldLabel>
                    <input
                      type="text"
                      className="input"
                      placeholder="PO-789"
                      value={purchaseOrderNumber}
                      onChange={e => setPurchaseOrderNumber(e.target.value)}
                    />
                  </div>
                </div>

                {/* Priority */}
                <div className="max-w-xs">
                  <FieldLabel>Priority</FieldLabel>
                  <select className="input" value={priority} onChange={e => setPriority(e.target.value)}>
                    {PRIORITY_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>

                {/* Read-only audit fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ReadOnlyField label="Created By" value={user?.name ?? "—"} />
                  <ReadOnlyField label="Created At" value={nowDisplay()} />
                </div>

              </div>
            )}

          </div>

          {/* Section footer — completion indicator */}
          <div className={
            "px-5 py-2.5 border-t border-border text-xs font-semibold flex items-center gap-2 " +
            (basicsComplete ? "text-green-700 bg-green-50" : "text-muted bg-gray-50")
          }>
            {basicsComplete
              ? <><span>✓</span> Job basics complete</>
              : <><span className="text-red-400">●</span> Fill in all required fields above</>
            }
          </div>
        </div>

        {/* ── Sections 02-08 — empty shells ────────────────────────────────── */}
        {SHELLS.map((s, i) => (
          <div key={s.id} className="card overflow-hidden">
            <SectionHeader num={i + 2} icon={s.icon} title={s.title} subtitle={s.subtitle} />
            <div className="px-5 py-8 flex items-center justify-center">
              <div className="text-center">
                <div className="text-2xl mb-2 opacity-10">{s.icon}</div>
                <div className="text-xs text-gray-300 font-medium">Fields for {s.title} will be added here</div>
              </div>
            </div>
          </div>
        ))}

      </div>

      {/* ── Sticky save bar ───────────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-border shadow-lg z-40">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="btn btn-outline text-sm px-4 py-2.5">
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
