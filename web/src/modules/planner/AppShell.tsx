import { useState, useRef, useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

// The operational pipeline — the three screens a planner moves through, in order.
const PRIMARY_NAV = [
  { to: "/app/planning",  label: "Planning" },
  { to: "/app/runs",      label: "Runs"     },
  { to: "/app/dashboard", label: "Live"     },   // interim → real Live screen in Phase C
];

// Everything else, grouped by operation.
const GROUPS = [
  {
    key: "freight", label: "Freight", items: [
      { to: "/app/jobs",         icon: "📋", label: "Jobs"     },
      { to: "/app/job-requests", icon: "📥", label: "Requests" },
    ],
  },
  {
    key: "resources", label: "Resources", items: [
      { to: "/app/fleet",    icon: "🚛", label: "Fleet"    },
      { to: "/app/drivers",  icon: "👥", label: "Drivers"  },
      { to: "/app/shifts",   icon: "⏱",  label: "Shifts"   },
      { to: "/app/holidays", icon: "🌴", label: "Holidays" },
    ],
  },
];

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [openMenu, setOpenMenu] = useState<string | null>(null);   // desktop dropdowns
  const [mobileOpen, setMobileOpen] = useState(false);             // mobile drawer
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenMenu(null);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (user?.role === "driver") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface p-6">
        <div className="card p-6 max-w-md w-full text-center">
          <div className="text-lg font-black text-primary mb-2">Planner access only</div>
          <p className="text-sm text-muted mb-5">
            Driver accounts use the mobile app. This web area is limited to planners and company owners.
          </p>
          <button onClick={() => { logout(); navigate("/login"); }} className="btn btn-primary w-full">
            Sign out
          </button>
        </div>
      </div>
    );
  }

  const toggle = (key: string) => setOpenMenu(prev => (prev === key ? null : key));
  const signOut = () => { logout(); navigate("/"); setOpenMenu(null); setMobileOpen(false); };

  const dropdownItemCls = ({ isActive }: { isActive: boolean }) =>
    "flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors " +
    (isActive ? "bg-primary/8 text-primary font-semibold" : "text-slate-700 hover:bg-slate-50 hover:text-primary");

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-surface">

      {/* ── Top navigation bar ──────────────────────────────────────────────── */}
      <header ref={navRef} style={{ backgroundColor: "#0f172a" }} className="flex-shrink-0 h-14 flex items-center px-4 border-b border-white/10">
        <span className="text-base font-black text-white mr-6 flex-shrink-0">
          Logistic<span className="text-accent">Bay</span>
        </span>

        {/* Desktop nav (md+) */}
        <div className="hidden md:flex items-stretch h-14 gap-1">
          {PRIMARY_NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/app/dashboard"}
              className={({ isActive }) =>
                "flex items-center px-4 text-sm font-semibold border-b-2 transition-colors h-full " +
                (isActive ? "text-white border-accent" : "text-white/60 border-transparent hover:text-white hover:border-white/30")
              }
            >
              {item.label}
            </NavLink>
          ))}

          <span className="self-center mx-2 h-5 w-px bg-white/15" />

          {GROUPS.map(group => (
            <div key={group.key} className="relative flex items-center">
              <button
                onClick={() => toggle(group.key)}
                className={"flex items-center gap-1 px-3 h-8 self-center text-sm font-medium rounded transition-colors " +
                  (openMenu === group.key ? "bg-white/15 text-white" : "text-white/60 hover:text-white hover:bg-white/10")}
              >
                {group.label}
                <span className="text-[10px]">▾</span>
              </button>
              {openMenu === group.key && (
                <div className="absolute top-full left-0 mt-1 w-44 bg-white rounded-lg shadow-xl border border-border z-50 py-1 overflow-hidden">
                  {group.items.map(item => (
                    <NavLink key={item.to} to={item.to} onClick={() => setOpenMenu(null)} className={dropdownItemCls}>
                      <span className="text-base w-5 text-center flex-shrink-0">{item.icon}</span>
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Desktop right — date + account (md+) */}
        <div className="ml-auto hidden md:flex items-center gap-3 flex-shrink-0">
          <span className="hidden lg:inline text-xs text-white/40">
            {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </span>
          <NavLink
            to="/app/settings"
            className={({ isActive }) =>
              "flex items-center gap-1.5 px-2.5 h-8 rounded text-sm transition-colors " +
              (isActive ? "bg-white/15 text-white" : "text-white/60 hover:text-white hover:bg-white/10")
            }
          >
            <span className="text-base leading-none">⚙️</span>
            <span className="text-xs font-medium">Settings</span>
          </NavLink>
          <div className="relative">
            <button
              onClick={() => toggle("account")}
              className={"flex items-center gap-2 px-2.5 h-8 rounded transition-colors " +
                (openMenu === "account" ? "bg-white/15" : "hover:bg-white/10")}
            >
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-accent/20 text-accent text-xs font-bold">
                {(user?.name ?? "?").charAt(0).toUpperCase()}
              </span>
              <span className="hidden sm:inline text-xs text-white/70 max-w-[120px] truncate">{user?.name}</span>
              <span className="text-[10px] text-white/50">▾</span>
            </button>
            {openMenu === "account" && (
              <div className="absolute top-full right-0 mt-1 w-52 bg-white rounded-lg shadow-xl border border-border z-50 py-1 overflow-hidden">
                <div className="px-3 py-2 border-b border-border">
                  <div className="text-xs text-muted truncate">{user?.companyName}</div>
                  <div className="text-sm font-semibold text-primary truncate">{user?.name}</div>
                </div>
                <NavLink to="/app/settings" onClick={() => setOpenMenu(null)} className={dropdownItemCls}>
                  <span className="text-base w-5 text-center">⚙️</span><span>Settings</span>
                </NavLink>
                <button onClick={signOut} className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors">
                  <span className="text-base w-5 text-center">↩</span><span>Sign out</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile hamburger (< md) */}
        <button
          onClick={() => setMobileOpen(v => !v)}
          aria-label="Menu"
          className="ml-auto md:hidden flex items-center justify-center w-9 h-9 rounded text-white hover:bg-white/10 transition-colors"
        >
          <span className="text-xl leading-none">{mobileOpen ? "✕" : "☰"}</span>
        </button>
      </header>

      {/* ── Mobile drawer (< md) ─────────────────────────────────────────────── */}
      {mobileOpen && (
        <div className="md:hidden flex-shrink-0 bg-white border-b border-border shadow-lg max-h-[70vh] overflow-y-auto z-40">
          <nav className="py-2">
            {PRIMARY_NAV.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/app/dashboard"}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  "flex items-center px-4 py-3 text-sm font-semibold transition-colors " +
                  (isActive ? "bg-primary/8 text-primary" : "text-slate-800 hover:bg-slate-50")
                }
              >
                {item.label}
              </NavLink>
            ))}

            {GROUPS.map(group => (
              <div key={group.key} className="border-t border-border mt-1 pt-1">
                <div className="px-4 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-muted">{group.label}</div>
                {group.items.map(item => (
                  <NavLink key={item.to} to={item.to} onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      "flex items-center gap-3 px-4 py-3 text-sm transition-colors " +
                      (isActive ? "bg-primary/8 text-primary font-semibold" : "text-slate-700 hover:bg-slate-50")}>
                    <span className="text-base w-5 text-center">{item.icon}</span><span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            ))}

            <div className="border-t border-border mt-1 pt-2 px-4">
              <div className="text-xs text-muted truncate">{user?.companyName}</div>
              <div className="text-sm font-semibold text-primary truncate mb-2">{user?.name}</div>
              <NavLink to="/app/settings" onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  "flex items-center gap-3 py-2.5 text-sm transition-colors " +
                  (isActive ? "text-primary font-semibold" : "text-slate-700 hover:text-primary")
                }>
                <span className="text-base w-5 text-center">⚙️</span><span>Settings</span>
              </NavLink>
              <button onClick={signOut} className="flex items-center gap-3 py-2 text-sm text-red-500">
                <span className="text-base w-5 text-center">↩</span><span>Sign out</span>
              </button>
            </div>
          </nav>
        </div>
      )}

      {/* ── Content area ─────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
