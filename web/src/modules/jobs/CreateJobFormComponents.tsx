import React from "react";
import { applyCase, autoCapitalizeFor, type CaseRule } from "../../lib/textCase";

// ── Shared sub-components ─────────────────────────────────────────────────────

export function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-bold text-slate-600 mb-1.5 tracking-wide">
      {children}{required && <span className="text-blue-500 ml-0.5">*</span>}
    </label>
  );
}

export function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="input bg-gray-50 text-muted cursor-default select-none text-sm py-2.5">{value}</div>
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  caseRule = "none",
  required,
  hint,
  placeholder,
  type = "text",
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  caseRule?: CaseRule;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  type?: "text" | "email" | "tel" | "number" | "date" | "time";
  className?: string;
}) {
  return (
    <label className="block">
      <FieldLabel required={required}>{label}</FieldLabel>
      <input
        className={`input mt-1 w-full ${className}`}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={event => onChange(event.target.value)}
        onBlur={event => {
          const next = applyCase(event.target.value, caseRule);
          if (next !== value) onChange(next);
        }}
        autoCapitalize={autoCapitalizeFor(caseRule)}
      />
      {hint && <div className="text-xs text-muted mt-1">{hint}</div>}
    </label>
  );
}

export function StatusDot({ complete, started }: { complete?: boolean; started?: boolean }) {
  if (complete) return (
    <span className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 shadow-sm">
      <svg viewBox="0 0 10 10" className="w-3 h-3" fill="none">
        <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </span>
  );
  if (started) return (
    <span className="w-5 h-5 rounded-full bg-blue-400 flex-shrink-0 shadow-sm animate-pulse" />
  );
  return <span className="w-5 h-5 rounded-full border-2 border-gray-300 bg-white flex-shrink-0" />;
}

export function SectionHeader({ num, icon, title, subtitle, active, collapsed, summary, onToggle, complete, started, optional }: {
  num: number; icon: string; title: string; subtitle: string;
  active?: boolean; collapsed?: boolean; summary?: string; onToggle?: () => void;
  complete?: boolean; started?: boolean; optional?: boolean;
}) {
  const accent =
    complete ? "border-l-green-500" :
    started  ? "border-l-blue-400"  : "border-l-transparent";
  const bg =
    complete && collapsed ? "bg-green-50/60" :
    !collapsed            ? "bg-white"        : "bg-slate-50/70";

  return (
    <div
      className={`flex items-center gap-3 px-5 py-4 border-b border-border border-l-4 ${accent} ${bg} ${onToggle ? "cursor-pointer select-none" : ""} transition-colors duration-200`}
      onClick={onToggle}
    >
      <StatusDot complete={complete} started={started} />
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0 transition-all duration-200 ${complete ? "bg-green-50 border border-green-200" : started ? "bg-blue-50 border border-blue-200" : "bg-white border border-slate-200 shadow-sm"}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-bold uppercase tracking-widest ${complete ? "text-green-600" : started ? "text-blue-500" : "text-muted"}`}>
            {String(num).padStart(2, "0")}
          </span>
          <h2 className="text-sm font-black text-primary">{title}</h2>
          {optional && !complete && (
            <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">optional</span>
          )}
        </div>
        {collapsed && summary
          ? <p className="text-xs text-accent font-semibold mt-0.5 truncate">{summary}</p>
          : <p className="text-xs text-muted mt-0.5 truncate">{subtitle}</p>
        }
      </div>
      {!active && <span className="text-xs text-slate-300 font-medium flex-shrink-0">Coming soon</span>}
      {onToggle && (
        <span className={`text-xl flex-shrink-0 ml-1 font-bold transition-transform duration-200 ${collapsed ? "text-muted" : "text-accent rotate-0"}`}>
          {collapsed ? "›" : "⌄"}
        </span>
      )}
    </div>
  );
}

export function SectionFooter({ complete, label, onCollapse }: { complete: boolean; label: string; onCollapse?: () => void }) {
  return (
    <div className={
      "px-5 py-3 border-t text-sm font-semibold flex items-center gap-2.5 " +
      (complete
        ? "text-green-700 bg-green-50/80 border-green-100"
        : "text-amber-700 bg-amber-50/80 border-amber-100")
    }>
      {/* Collapse arrow — left side */}
      {onCollapse && (
        <button
          type="button"
          onClick={onCollapse}
          title="Collapse section"
          className={
            "flex-shrink-0 w-6 h-6 rounded flex items-center justify-center transition-colors mr-1 " +
            (complete
              ? "text-green-600 hover:bg-green-100"
              : "text-amber-600 hover:bg-amber-100")
          }
        >
          <svg viewBox="0 0 10 10" className="w-3.5 h-3.5" fill="none">
            <path d="M2 7l3-3 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
      {complete ? (
        <>
          <span className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 10 10" className="w-3 h-3" fill="none">
              <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
          {label} complete
        </>
      ) : (
        <>
          <span className="w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center flex-shrink-0 text-white text-xs font-black leading-none">!</span>
          Fill in the required fields above
        </>
      )}
    </div>
  );
}

export function OptionalToggle({ open, onToggle, label = "optional details" }: {
  open: boolean; onToggle: () => void; label?: string;
}) {
  return (
    <div className="pt-1">
      <button type="button" onClick={onToggle}
        className={`text-xs font-semibold flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all ${
          open
            ? "text-slate-600 bg-slate-100 border-slate-200 hover:bg-slate-200"
            : "text-blue-600 bg-blue-50 border-blue-200 hover:bg-blue-100"
        }`}>
        <span className="text-sm leading-none">{open ? "−" : "+"}</span>
        {open ? `Hide ${label}` : `Show ${label}`}
      </button>
    </div>
  );
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!value)} className="flex items-center gap-3 group w-fit">
      <div className={"relative w-11 h-6 rounded-full transition-all duration-200 flex-shrink-0 " + (value ? "bg-blue-500" : "bg-slate-200")}>
        <span className={"absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 " + (value ? "translate-x-5" : "translate-x-0")} />
      </div>
      <span className={"text-sm font-medium transition-colors " + (value ? "text-slate-900" : "text-slate-500")}>{label}</span>
    </button>
  );
}

export function MultiCheck({ options, value, onChange }: {
  options: [string, string][];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  function toggle(key: string) {
    onChange(value.includes(key) ? value.filter(x => x !== key) : [...value, key]);
  }
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([key, label]) => {
        const on = value.includes(key);
        return (
          <button key={key} type="button" onClick={() => toggle(key)}
            className={"text-sm px-4 py-2.5 min-h-[44px] rounded-full border font-medium transition-colors " +
              (on ? "bg-accent text-white border-accent" : "bg-white text-muted border-border hover:border-gray-400")}>
            {label}
          </button>
        );
      })}
    </div>
  );
}
