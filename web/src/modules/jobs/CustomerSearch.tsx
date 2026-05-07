import { useState, useEffect, useRef } from "react";
import { customersApi } from "../../api/customers";
import type { Customer } from "../../types";

// ── Customer typeahead ────────────────────────────────────────────────────────

export default function CustomerSearch({ value, linkedId, onChange }: {
  value: string;
  linkedId: number | null;
  onChange: (name: string, id: number | null, customer?: Customer) => void;
}) {
  const [suggestions, setSuggestions] = useState<Customer[]>([]);
  const [open,        setOpen]        = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef  = useRef<HTMLDivElement>(null);

  function handleInput(text: string) {
    onChange(text, null);
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
    onChange(c.name, c.id, c);
    setSuggestions([]);
    setOpen(false);
  }

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
        <input type="text" className="input pr-8" placeholder="Start typing customer name…"
          value={value} onChange={e => handleInput(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)} autoComplete="off" />
        {linkedId && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-green-500 text-sm" title="Linked to existing customer">✓</span>
        )}
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-border rounded-xl shadow-lg overflow-hidden">
          {suggestions.map(c => (
            <button key={c.id} type="button" onMouseDown={() => pick(c)}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors border-b border-border last:border-0">
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
