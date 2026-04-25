import React from "react";
interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary"|"outline"|"ghost"|"danger"|"success"; loading?: boolean;
}
export function Button({ variant="primary", loading, children, className="", ...props }: Props) {
  const v: Record<string,string> = { primary:"btn-primary", outline:"btn-outline", ghost:"btn-ghost", danger:"btn-danger", success:"btn-success" };
  return (
    <button className={"btn " + v[variant] + " " + className} disabled={!!(loading || props.disabled)} {...props}>
      {loading && <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/></svg>}
      {children}
    </button>
  );
}
