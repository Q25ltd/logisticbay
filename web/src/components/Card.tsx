import React from "react";
export function Card({ children, className="", title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <div className={"card p-5 " + className}>
      {title && <h3 className="text-sm font-bold text-primary uppercase tracking-wide mb-4">{title}</h3>}
      {children}
    </div>
  );
}
