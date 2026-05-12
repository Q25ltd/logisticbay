import { useState, useEffect, useRef } from "react";
import type { SavedLocation } from "../../types";
import type { StopState } from "./createJobTypes";
import { stopComplete, toMins, fmtMins } from "./createJobUtils";
import { FieldLabel, OptionalToggle, Toggle } from "./CreateJobFormComponents";
import { LOCATION_TYPES } from "./createJobConstants";
import { applyCase, type CaseRule } from "../../lib/textCase";

// ── Location typeahead (per stop) ─────────────────────────────────────────────

export function LocationSearch({ value, linkedId, locations, onSelect, onClear }: {
  value: string;
  linkedId: number | null;
  locations: SavedLocation[];
  onSelect: (loc: SavedLocation) => void;
  onClear: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const q = value.toLowerCase().trim();
  const filtered = !q ? [] : locations.filter(l =>
    l.name.toLowerCase().includes(q) ||
    l.locationTextSnapshot.toLowerCase().includes(q) ||
    l.town.toLowerCase().includes(q) ||
    l.postcode.toLowerCase().includes(q)
  ).slice(0, 8);

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
        <input type="text" className="input pr-8"
          placeholder="Search saved locations or type address…"
          value={value}
          onChange={e => { onClear(e.target.value); setOpen(true); }}
          onFocus={() => filtered.length > 0 && setOpen(true)}
          autoComplete="off" />
        {linkedId && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-green-500 text-sm" title="Saved location linked">✓</span>
        )}
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-border rounded-xl shadow-lg overflow-hidden">
          {filtered.map(l => (
            <button key={l.id} type="button" onMouseDown={() => { onSelect(l); setOpen(false); }}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors border-b border-border last:border-0">
              <div className="font-semibold text-primary">{l.name}</div>
              <div className="text-xs text-muted">{[l.locationTextSnapshot || l.street, l.town, l.postcode].filter(Boolean).join(", ")}</div>
            </button>
          ))}
          <div className="px-4 py-2 text-xs text-muted bg-gray-50 border-t border-border">
            Not listed? Fill in the address fields below manually
          </div>
        </div>
      )}
    </div>
  );
}

// ── Coordinates help ─────────────────────────────────────────────────────────

export function CoordsHelp() {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-xs">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="text-muted hover:text-primary flex items-center gap-1 transition-colors">
        <span>{open ? "▾" : "▸"}</span>
        <span>How to find entrance coordinates in Google Maps</span>
      </button>
      {open && (
        <div className="mt-2 p-3 bg-blue-50 border border-blue-100 rounded-lg space-y-3 leading-relaxed text-blue-900">
          <p><strong>1.</strong> Open <span className="font-mono">maps.google.com</span> and search for the site.</p>
          <p><strong>2.</strong> Navigate to the <strong>entrance gate or loading bay</strong> — not the building centre.</p>
          <p><strong>3.</strong> Right-click on the exact entrance point — a menu appears.</p>
          <p><strong>4.</strong> Click the coordinates at the <strong>top of the menu</strong> — they copy automatically.</p>
          <p><strong>5.</strong> Paste the first number into Latitude, the second into Longitude.</p>

          {/* SVG illustration of the Google Maps right-click menu */}
          <div className="rounded-xl overflow-hidden border border-blue-200 bg-white mt-2">
            <svg viewBox="0 0 340 210" xmlns="http://www.w3.org/2000/svg" className="w-full">
              {/* Map background */}
              <rect width="340" height="210" fill="#e8e0d5"/>
              {/* Roads */}
              <rect x="0" y="88" width="340" height="14" fill="#fff" opacity="0.7"/>
              <rect x="140" y="0" width="12" height="210" fill="#fff" opacity="0.7"/>
              <rect x="0" y="150" width="340" height="8" fill="#fff" opacity="0.5"/>
              <rect x="80" y="0" width="6" height="210" fill="#fff" opacity="0.4"/>
              <rect x="230" y="0" width="6" height="210" fill="#fff" opacity="0.4"/>
              {/* Buildings */}
              <rect x="20" y="30" width="50" height="48" rx="2" fill="#d4c9b8"/>
              <rect x="80" y="20" width="48" height="60" rx="2" fill="#c8bfb0"/>
              <rect x="162" y="20" width="55" height="58" rx="2" fill="#d4c9b8"/>
              <rect x="228" y="30" width="40" height="45" rx="2" fill="#c8bfb0"/>
              <rect x="280" y="20" width="48" height="60" rx="2" fill="#d4c9b8"/>
              <rect x="20" y="112" width="42" height="52" rx="2" fill="#c8bfb0"/>
              <rect x="74" y="108" width="54" height="52" rx="2" fill="#d4c9b8"/>
              <rect x="162" y="112" width="60" height="52" rx="2" fill="#c8bfb0"/>
              <rect x="234" y="108" width="88" height="52" rx="2" fill="#d4c9b8"/>
              <rect x="20" y="172" width="100" height="30" rx="2" fill="#c8bfb0"/>
              <rect x="162" y="172" width="70" height="30" rx="2" fill="#d4c9b8"/>
              <rect x="244" y="172" width="78" height="30" rx="2" fill="#c8bfb0"/>

              {/* Pin at entrance */}
              <circle cx="146" cy="93" r="7" fill="#EA4335"/>
              <path d="M146 100 L143 108 L146 106 L149 108 Z" fill="#EA4335"/>

              {/* Cursor / right-click indicator */}
              <polygon points="146,93 156,100 152,101 154,107 151,108 149,102 146,105" fill="#333" opacity="0.85"/>

              {/* Context menu */}
              <rect x="152" y="60" width="168" height="142" rx="4" fill="white"
                filter="url(#shadow)" stroke="#dadce0" strokeWidth="0.5"/>
              <defs>
                <filter id="shadow" x="-10%" y="-10%" width="130%" height="130%">
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0003"/>
                </filter>
              </defs>

              {/* Coords row — highlighted, clickable */}
              <rect x="152" y="60" width="168" height="30" rx="4" fill="#e8f0fe"/>
              <rect x="152" y="76" width="168" height="14" fill="#e8f0fe"/>
              <text x="162" y="79" fontSize="9.5" fontFamily="monospace" fill="#1a73e8" fontWeight="bold">51.5074, -0.1278</text>
              <text x="162" y="89" fontSize="7.5" fontFamily="sans-serif" fill="#5f6368">Click to copy</text>

              {/* Divider */}
              <line x1="152" y1="90" x2="320" y2="90" stroke="#e0e0e0" strokeWidth="0.5"/>

              {/* Menu items */}
              {[
                { y: 105, label: "Directions to here" },
                { y: 120, label: "Directions from here" },
                { y: 135, label: "What's here?" },
                { y: 150, label: "Add a missing place" },
                { y: 165, label: "Save" },
                { y: 180, label: "Share" },
              ].map(item => (
                <text key={item.y} x="162" y={item.y} fontSize="9" fontFamily="sans-serif" fill="#3c4043">
                  {item.label}
                </text>
              ))}

              {/* Arrow pointing to coords row */}
              <line x1="108" y1="75" x2="148" y2="75" stroke="#1a73e8" strokeWidth="1.5" markerEnd="url(#arr)"/>
              <defs>
                <marker id="arr" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill="#1a73e8"/>
                </marker>
              </defs>
              <text x="10" y="68" fontSize="8" fontFamily="sans-serif" fill="#1a73e8" fontWeight="bold">Click</text>
              <text x="10" y="78" fontSize="8" fontFamily="sans-serif" fill="#1a73e8" fontWeight="bold">coords</text>
              <text x="10" y="88" fontSize="8" fontFamily="sans-serif" fill="#1a73e8" fontWeight="bold">here</text>
            </svg>
          </div>

          <p className="text-blue-700">⚠ Always pin the <strong>entrance gate</strong>, not the postcode centre — drivers use this to navigate to the right gate.</p>
        </div>
      )}
    </div>
  );
}

// ── Duration input (hours + minutes) ─────────────────────────────────────────

function DurationInput({ value, onChange, label, hint }: {
  value: string;
  onChange: (val: string) => void;
  label: string;
  hint?: string;
}) {
  // Value stored as "HH:MM" duration string (e.g. "01:30" = 1 h 30 min)
  const parts = value.match(/^(\d+):(\d{2})$/);
  const hVal = parts ? String(parseInt(parts[1], 10)) : "";
  const mVal = parts ? String(parseInt(parts[2], 10)) : "";

  function update(newH: string, newM: string) {
    if (newH === "" && newM === "") { onChange(""); return; }
    const hNum = newH === "" ? 0 : Math.max(0, parseInt(newH, 10) || 0);
    const mNum = newM === "" ? 0 : Math.min(59, Math.max(0, parseInt(newM, 10) || 0));
    onChange(`${String(hNum).padStart(2, "0")}:${String(mNum).padStart(2, "0")}`);
  }

  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <div className="relative" style={{ width: "5.5rem" }}>
          <input type="number" min="0" max="99" inputMode="numeric"
            className="input pr-7 w-full" placeholder="0"
            value={hVal}
            onChange={e => update(e.target.value, mVal)} />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">h</span>
        </div>
        <div className="relative" style={{ width: "5.5rem" }}>
          <input type="number" min="0" max="59" inputMode="numeric"
            className="input pr-10 w-full" placeholder="0"
            value={mVal}
            onChange={e => update(hVal, e.target.value)} />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">min</span>
        </div>
      </div>
      {hint && <p className="text-xs text-muted mt-1">{hint}</p>}
    </div>
  );
}

function fmtHHMM(totalMins: number): string {
  const safe = ((totalMins % 1440) + 1440) % 1440; // wrap midnight
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ── Stop quantities & timing block ───────────────────────────────────────────

export function StopTimingBlock({ stop, onChange }: {
  stop: StopState;
  onChange: (patch: Partial<StopState>) => void;
  set: (f: keyof StopState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
}) {
  // Booked / window anchor in minutes-since-midnight
  const bookedMins =
    stop.timeType === "exact"  ? toMins(stop.exactTime) :
    stop.timeType === "window" ? toMins(stop.windowStart) : null;
  const windowEndMins = stop.timeType === "window" ? toMins(stop.windowEnd) : null;

  // Durations — stored as "HH:MM" strings
  const earliestDuration  = toMins(stop.earliestArrival);  // how far before booking driver may arrive
  const unloadingDuration = toMins(stop.unloadingTime);    // time spent on-site

  // Computed clock times
  const earliestArrivalTime =
    bookedMins !== null && earliestDuration !== null ? bookedMins - earliestDuration : null;
  const releaseTime =
    bookedMins !== null && unloadingDuration !== null ? bookedMins + unloadingDuration : null;

  const warnings: string[] = [];
  if (releaseTime !== null && windowEndMins !== null && releaseTime > windowEndMins) {
    warnings.push(
      `Unloading (${fmtMins(unloadingDuration!)}) would finish at ${fmtHHMM(releaseTime)}, ` +
      `after the window closes at ${stop.windowEnd}.`
    );
  }

  const showInfo = bookedMins !== null && (earliestArrivalTime !== null || releaseTime !== null);

  return (
    <div>
      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Quantities & Stop Timing</div>
      <div className="space-y-3">

        {/* Pallets + quantity */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Number of Pallets</FieldLabel>
            <input type="number" min="0" inputMode="numeric" className="input" placeholder="e.g. 26"
              value={stop.numPallets} onChange={e => onChange({ numPallets: e.target.value })} />
            <p className="text-xs text-muted mt-1">Will total across all stops in Load Details</p>
          </div>
          <div>
            <FieldLabel>Quantity / Weight</FieldLabel>
            <input type="text" className="input" placeholder="e.g. 14.5t / 3 cages"
              value={stop.quantity} onChange={e => onChange({ quantity: e.target.value })} />
          </div>
        </div>

        {/* Duration inputs */}
        <div className="grid grid-cols-2 gap-3">
          <DurationInput
            label="Earliest Arrival (before booking)"
            value={stop.earliestArrival}
            onChange={val => onChange({ earliestArrival: val })}
            hint={
              stop.timeType === "exact"  ? `How long before ${stop.exactTime || "booked time"} driver may arrive` :
              stop.timeType === "window" ? `How long before window start (${stop.windowStart || "—"}) driver may arrive` :
              "How early before the booking the driver may arrive"
            }
          />
          <DurationInput
            label="Loading / Unloading Time"
            value={stop.unloadingTime}
            onChange={val => onChange({ unloadingTime: val })}
            hint="How long the driver will be held in the yard"
          />
        </div>

        {/* Computed arrival / release info */}
        {showInfo && (
          <div className="flex flex-wrap gap-3 text-xs">
            {earliestArrivalTime !== null && (
              <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-blue-800">
                <span>🕐</span>
                <span>Arrive from <strong>{fmtHHMM(earliestArrivalTime)}</strong></span>
              </div>
            )}
            {releaseTime !== null && (
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700">
                <span>🏁</span>
                <span>Expected release <strong>{fmtHHMM(releaseTime)}</strong></span>
              </div>
            )}
          </div>
        )}

        {/* Timing conflict warnings */}
        {warnings.length > 0 && (
          <div className="space-y-1">
            {warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <span className="flex-shrink-0 mt-0.5">⚠</span>
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

// ── Stop card ─────────────────────────────────────────────────────────────────

export default function StopCard({ stop, index, total, locations, onChange, onRemove, triedSave = false }: {
  stop: StopState;
  index: number;
  total: number;
  locations: SavedLocation[];
  onChange: (patch: Partial<StopState>) => void;
  onRemove: () => void;
  triedSave?: boolean;
}) {
  const set = (field: keyof StopState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    onChange({ [field]: e.target.value });
  const setCase = (field: keyof StopState, rule: CaseRule) => (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const next = applyCase(e.currentTarget.value, rule);
    if (next !== e.currentTarget.value) onChange({ [field]: next });
  };

  function applyLocation(loc: SavedLocation) {
    onChange({
      locationQuery:   loc.name,
      savedLocationId: loc.id,
      siteName:        loc.siteName  || loc.name,
      street:          loc.street    || loc.locationTextSnapshot,
      town:            loc.town,
      postcode:        loc.postcode,
      country:         "United Kingdom",
      lat:             loc.lat  != null ? String(loc.lat)  : "",
      lng:             loc.lng  != null ? String(loc.lng)  : "",
      unitName:        loc.unitName  || "",
      contactName:     loc.contactName  || "",
      contactPhone:    loc.contactPhone || "",
      instructions:    loc.instructions || "",
      internalNotes:   loc.internalNotes || "",
    });
  }

  const dateLabel = stop.type === "collection" ? "Collection Date" : "Delivery Date";
  const complete  = stopComplete(stop);

  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden" style={{boxShadow: '0 1px 3px rgba(15,23,42,0.06)'}}>

      {/* Stop header — clickable to collapse */}
      <div className={`flex items-center justify-between px-4 py-3 border-b border-slate-100 cursor-pointer select-none transition-colors ${complete ? "bg-green-50/70" : "bg-slate-50/80"}`}
        onClick={() => onChange({ collapsed: !stop.collapsed })}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm font-black text-primary flex-shrink-0">Stop {index + 1}</span>
          {stop.type && (
            <span className={
              "text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 " +
              (stop.type === "collection" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700")
            }>
              {stop.type === "collection" ? "Collection" : "Delivery"}
            </span>
          )}
          {complete && <span className="text-xs text-green-600 font-semibold flex-shrink-0">✓</span>}
          {stop.collapsed && stop.siteName && (
            <span className="text-xs text-accent truncate ml-1">{[stop.siteName, stop.town].filter(Boolean).join(", ")}</span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-2">
          {total > 1 && (
            <button type="button" onClick={e => { e.stopPropagation(); onRemove(); }}
              className="text-xs text-red-400 hover:text-red-600 font-semibold transition-colors">
              Remove
            </button>
          )}
          <span className="text-primary text-xl font-bold">{stop.collapsed ? "›" : "⌄"}</span>
        </div>
      </div>

      {!stop.collapsed && <div className="p-4 space-y-4">

        {/* Stop type */}
        <div>
          <FieldLabel required>Stop Type</FieldLabel>
          <div className="flex gap-3">
            {(["collection", "delivery"] as const).map(t => (
              <button key={t} type="button"
                onClick={() => onChange({ type: t })}
                className={
                  "flex-1 py-3 min-h-[48px] rounded-lg border text-sm font-semibold transition-colors " +
                  (stop.type === t
                    ? t === "collection"
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-green-600 text-white border-green-600"
                    : "bg-white text-muted border-border hover:border-gray-400")
                }>
                {t === "collection" ? "📦 Collection" : "📍 Delivery"}
              </button>
            ))}
          </div>
        </div>

        {/* ── Location ─────────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest pt-1 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Location</div>

          <div>
            <FieldLabel>Address / Saved Location</FieldLabel>
            <LocationSearch
              value={stop.locationQuery}
              linkedId={stop.savedLocationId}
              locations={locations}
              onSelect={applyLocation}
              onClear={text => onChange({ locationQuery: text, savedLocationId: null })}
            />
            {stop.savedLocationId && (
              <button type="button" onClick={() => onChange({
                locationQuery: "", savedLocationId: null,
                siteName: "", street: "", town: "", postcode: "", country: "United Kingdom",
                lat: "", lng: "",
                unitName: "", contactName: "", contactPhone: "",
                instructions: "", internalNotes: "",
              })}
                className="text-xs text-muted hover:text-red-500 mt-1 transition-colors">
                ✕ Clear saved location
              </button>
            )}
          </div>

          <div>
            <FieldLabel required>Company / Site Name</FieldLabel>
            <input type="text" className="input" placeholder="Acme Distribution Centre"
              value={stop.siteName} onChange={set("siteName")} onBlur={setCase("siteName", "proper_name")} autoCapitalize="words" />
          </div>

          <div>
            <FieldLabel required>Address Line 1 / Street</FieldLabel>
            <input type="text" className="input" placeholder="1 Example Street"
              value={stop.street} onChange={set("street")} onBlur={setCase("street", "address_line")} autoCapitalize="words" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel required>Town / City</FieldLabel>
              <input type="text" className="input" placeholder="Sampletown"
                value={stop.town} onChange={set("town")} onBlur={setCase("town", "proper_name")} autoCapitalize="words" />
            </div>
            <div>
              <FieldLabel required>Postcode</FieldLabel>
              <input type="text" className="input placeholder:uppercase" placeholder="EX1 1AA"
                value={stop.postcode} onChange={set("postcode")} onBlur={setCase("postcode", "upper")} autoCapitalize="characters" />
            </div>
          </div>

          <div>
            <FieldLabel required>Country</FieldLabel>
            <input type="text" className="input" placeholder="United Kingdom"
              value={stop.country} onChange={set("country")} onBlur={setCase("country", "proper_name")} autoCapitalize="words" />
          </div>

          {/* Lat / Lng — required */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel required>Latitude</FieldLabel>
              <input
                type="text" inputMode="decimal"
                className={`input font-mono ${triedSave && !stop.lat.trim() ? "border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-200" : ""}`}
                placeholder="51.5074"
                value={stop.lat} onChange={set("lat")}
              />
              {triedSave && !stop.lat.trim() && (
                <p className="text-xs text-red-500 mt-1">Latitude is required</p>
              )}
            </div>
            <div>
              <FieldLabel required>Longitude</FieldLabel>
              <input
                type="text" inputMode="decimal"
                className={`input font-mono ${triedSave && !stop.lng.trim() ? "border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-200" : ""}`}
                placeholder="-0.1278"
                value={stop.lng} onChange={set("lng")}
              />
              {triedSave && !stop.lng.trim() && (
                <p className="text-xs text-red-500 mt-1">Longitude is required</p>
              )}
            </div>
          </div>
          <CoordsHelp />
        </div>

        {/* ── Timing ───────────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest pt-1 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Timing</div>

          <div>
            <FieldLabel required>{dateLabel}</FieldLabel>
            <input type="date" className="input" value={stop.date} onChange={set("date")} />
          </div>

          <div>
            <FieldLabel required>Time Type</FieldLabel>
            <div className="flex gap-2">
              {(["anytime", "exact", "window"] as const).map(t => (
                <button key={t} type="button"
                  onClick={() => onChange({ timeType: t })}
                  className={
                    "flex-1 py-2.5 min-h-[44px] rounded-lg border text-xs font-semibold transition-colors " +
                    (stop.timeType === t
                      ? "bg-slate-700 text-white border-slate-700"
                      : "bg-white text-muted border-border hover:border-gray-400")
                  }>
                  {t === "anytime" ? "Any time" : t === "exact" ? "Exact time" : "Time window"}
                </button>
              ))}
            </div>
          </div>

          {stop.timeType === "exact" && (
            <div className="max-w-xs">
              <FieldLabel required>Time</FieldLabel>
              <input type="time" className="input" value={stop.exactTime} onChange={set("exactTime")} />
            </div>
          )}

          {stop.timeType === "window" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel required>Start Time</FieldLabel>
                <input type="time" className="input" value={stop.windowStart} onChange={set("windowStart")} />
              </div>
              <div>
                <FieldLabel required>End Time</FieldLabel>
                <input type="time" className="input" value={stop.windowEnd} onChange={set("windowEnd")} />
              </div>
            </div>
          )}
        </div>

        {/* ── Optional toggle ───────────────────────────────────────────────── */}
        <OptionalToggle open={stop.showOptional} onToggle={() => onChange({ showOptional: !stop.showOptional })} label="stop details" />

        {stop.showOptional && (
          <div className="space-y-4 pt-1 border-t border-border">

            {/* Address clarity */}
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Address Clarity</div>
              <div className="space-y-3">
                <div>
                  <FieldLabel>Unit / Building</FieldLabel>
                  <input type="text" className="input" placeholder="Unit 4 / Gatehouse"
                    value={stop.unitName} onChange={set("unitName")} onBlur={setCase("unitName", "address_line")} autoCapitalize="words" />
                </div>
                <div>
                  <FieldLabel>Address Line 2</FieldLabel>
                  <input type="text" className="input" placeholder="Industrial estate, zone B"
                    value={stop.addressLine2} onChange={set("addressLine2")} onBlur={setCase("addressLine2", "address_line")} autoCapitalize="words" />
                </div>
                <div>
                  <FieldLabel>County / Region</FieldLabel>
                  <input type="text" className="input" placeholder="Exampleshire"
                    value={stop.countyRegion} onChange={set("countyRegion")} onBlur={setCase("countyRegion", "proper_name")} autoCapitalize="words" />
                </div>
              </div>
            </div>

            {/* Quantities & stop timing */}
            <StopTimingBlock stop={stop} onChange={onChange} set={set} />

            {/* Contact */}
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Contact</div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel>Contact Name</FieldLabel>
                    <input type="text" className="input" placeholder="Goods In"
                      value={stop.contactName} onChange={set("contactName")} onBlur={setCase("contactName", "proper_name")} autoCapitalize="words" />
                  </div>
                  <div>
                    <FieldLabel>Contact Phone</FieldLabel>
                    <input type="tel" className="input" placeholder="07700 900123"
                      value={stop.contactPhone} onChange={set("contactPhone")} />
                  </div>
                </div>
                <div>
                  <FieldLabel>Contact Email</FieldLabel>
                  <input type="email" className="input" placeholder="goodsin@example.com"
                    value={stop.contactEmail} onChange={set("contactEmail")} onBlur={setCase("contactEmail", "lower")} autoCapitalize="off" />
                </div>
              </div>
            </div>

            {/* Reference / booking */}
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Reference / Booking</div>
              <div className="space-y-3">
                <div>
                  <FieldLabel>Reference Number</FieldLabel>
                  <input type="text" className="input" placeholder="REF-00123"
                    value={stop.referenceNumber} onChange={set("referenceNumber")} />
                </div>
                <div>
                  <Toggle value={stop.bookingRequired} onChange={v => onChange({ bookingRequired: v })} label="Booking required" />
                </div>
                {stop.bookingRequired && (
                  <div>
                    <FieldLabel>Booking Reference</FieldLabel>
                    <input type="text" className="input" placeholder="BK-456789"
                      value={stop.bookingRef} onChange={set("bookingRef")} />
                  </div>
                )}
              </div>
            </div>

            {/* Location support */}
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Location Support</div>
              <div className="space-y-3">
                <div>
                  <FieldLabel>Opening Hours</FieldLabel>
                  <input type="text" className="input" placeholder="Mon–Fri 06:00–18:00, Sat 07:00–13:00"
                    value={stop.openingHours} onChange={set("openingHours")} />
                </div>
                <div>
                  <FieldLabel>Location Type</FieldLabel>
                  <select className="input" value={stop.locationType} onChange={set("locationType")}>
                    <option value="">— Select —</option>
                    {LOCATION_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Driver */}
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Driver</div>
              <div className="space-y-3">
                <div>
                  <FieldLabel>Driver Notes / Instructions</FieldLabel>
                  <textarea className="input min-h-16 resize-none" placeholder="Use gate 3, call ahead 30 min before arrival…"
                    value={stop.instructions} onChange={set("instructions")} onBlur={setCase("instructions", "sentence")} />
                </div>
                <div>
                  <FieldLabel>Navigation Instructions</FieldLabel>
                  <input type="text" className="input" placeholder="Paste Google Maps or Waze link…"
                    value={stop.navigationInstructions} onChange={set("navigationInstructions")} onBlur={setCase("navigationInstructions", "sentence")} autoCapitalize="sentences" />
                </div>
              </div>
            </div>

            {/* Internal */}
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Internal</div>
              <div>
                <FieldLabel>Internal Notes</FieldLabel>
                <textarea className="input min-h-16 resize-none" placeholder="Not shown to driver — planner only…"
                  value={stop.internalNotes} onChange={set("internalNotes")} onBlur={setCase("internalNotes", "sentence")} />
              </div>
            </div>

          </div>
        )}

      </div>}

      {/* Stop footer — always visible */}
      <div className={`px-4 py-2.5 border-t text-xs font-semibold flex items-center gap-2 ${complete ? "text-green-700 bg-green-50/80 border-green-100" : "text-amber-700 bg-amber-50/80 border-amber-100"}`}>
        {complete ? (
          <><span className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0"><svg viewBox="0 0 10 10" className="w-2.5 h-2.5" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg></span> Stop {index + 1} complete</>
        ) : (
          <><span className="w-4 h-4 rounded-full bg-amber-400 flex items-center justify-center flex-shrink-0 text-white text-xs font-black leading-none">!</span> Fill in address and date above</>
        )}
      </div>

    </div>
  );
}
