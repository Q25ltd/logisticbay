import React from "react";
import { applyCase, autoCapitalizeFor, type CaseRule } from "../lib/textCase";

interface Props extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  caseRule?: CaseRule;
}

export function Input({ label, hint, error, className = "", caseRule = "none", onBlur, onChange, autoCapitalize, ...props }: Props) {
  function handleBlur(event: React.FocusEvent<HTMLInputElement>) {
    const next = applyCase(event.currentTarget.value, caseRule);
    if (next !== event.currentTarget.value && onChange) {
      event.currentTarget.value = next;
      onChange(event as unknown as React.ChangeEvent<HTMLInputElement>);
    }
    onBlur?.(event);
  }

  return (
    <div className="mb-4">
      {label && <label className="label">{label}</label>}
      <input
        className={"input " + (error ? "border-red-500 " : "") + className}
        onBlur={handleBlur}
        onChange={onChange}
        autoCapitalize={autoCapitalize ?? autoCapitalizeFor(caseRule)}
        {...props}
      />
      {hint && <p className="text-xs text-muted mt-1">{hint}</p>}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
interface SelProps extends React.SelectHTMLAttributes<HTMLSelectElement> { label?: string; children: React.ReactNode; }
export function Select({ label, children, className="", ...props }: SelProps) {
  return (
    <div className="mb-4">
      {label && <label className="label">{label}</label>}
      <select className={"input " + className} {...props}>{children}</select>
    </div>
  );
}
