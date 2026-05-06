import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

const NAV = [
  { to:"/app/dashboard",    icon:"🏠", label:"Dashboard",    active:true  },
  { to:"/app/jobs",         icon:"📋", label:"Jobs",         active:true  },
  { to:"/app/templates",    icon:"📄", label:"Templates",    active:true  },
  { to:"/app/drivers",      icon:"👥", label:"Drivers",      active:true  },
  { to:"/app/holidays",     icon:"🌴", label:"Holidays",     active:true  },
  { to:"/app/locations",    icon:"📍", label:"Locations",    active:true  },
  { to:"/app/shifts",       icon:"⏱",  label:"Shifts",       active:true  },
  { to:"/app/fleet",        icon:"🚛", label:"Fleet",        active:true  },
  { to:"/app/marketplace",  icon:"🏗️", label:"Marketplace",  active:false },
  { to:"/app/intelligence", icon:"🤖", label:"Intelligence", active:false },
  { to:"/app/settings",     icon:"⚙️", label:"Settings",     active:true  },
];

function NavItems({ onClose }: { onClose?: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <>
      <nav className="flex-1 py-3 overflow-y-auto">
        {NAV.map(item => item.active ? (
          <NavLink key={item.to} to={item.to} onClick={onClose}
            className={({ isActive }) =>
              "flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors " +
              (isActive
                ? "bg-white/15 text-white border-r-2 border-accent"
                : "text-white/60 hover:text-white hover:bg-white/8")}>
            <span className="text-base w-5 text-center flex-shrink-0">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ) : (
          <div key={item.to}
            className="flex items-center gap-3 px-4 py-3 text-sm text-white/25 cursor-not-allowed">
            <span className="text-base w-5 text-center flex-shrink-0">{item.icon}</span>
            <span>{item.label} <span className="text-xs opacity-50">soon</span></span>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-4 flex-shrink-0">
        <div className="text-xs text-white/40 truncate mb-0.5">{user?.companyName}</div>
        <div className="text-sm font-semibold text-white truncate">{user?.name}</div>
        <button
          onClick={() => { logout(); navigate("/"); onClose?.(); }}
          className="text-xs text-white/40 hover:text-red-400 transition-colors mt-1">
          Sign out
        </button>
      </div>
    </>
  );
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [drawer, setDrawer] = useState(false);

  if (user?.role === "driver") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface p-6">
        <div className="card p-6 max-w-md w-full text-center">
          <div className="text-lg font-black text-primary mb-2">Planner access only</div>
          <p className="text-sm text-muted mb-5">
            Driver accounts use the mobile app. This web area is limited to planners and company owners.
          </p>
          <button
            onClick={() => { logout(); navigate("/login"); }}
            className="btn btn-primary w-full">
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface">

      {/* ── Desktop sidebar ──────────────────────────────────────────────────── */}
      <aside
        className="hidden sm:flex flex-col flex-shrink-0"
        style={{ width: 224, backgroundColor: "#0f172a" }}>
        <div className="h-14 flex items-center px-5 border-b border-white/10 flex-shrink-0">
          <span className="text-lg font-black text-white">
            Logistic<span className="text-accent">Bay</span>
          </span>
        </div>
        <NavItems />
      </aside>

      {/* ── Mobile drawer ────────────────────────────────────────────────────── */}
      {drawer && (
        <div className="sm:hidden fixed inset-0 z-50 flex">
          <div
            className="w-72 flex flex-col h-full"
            style={{ backgroundColor: "#0f172a" }}>
            <div className="h-14 flex items-center justify-between px-5 border-b border-white/10 flex-shrink-0">
              <span className="text-base font-black text-white">
                Logistic<span className="text-blue-400">Bay</span>
              </span>
              <button
                onClick={() => setDrawer(false)}
                className="text-white/50 hover:text-white text-2xl leading-none w-8 h-8 flex items-center justify-center">
                ×
              </button>
            </div>
            <NavItems onClose={() => setDrawer(false)} />
          </div>
          <div
            className="flex-1 bg-black/60"
            onClick={() => setDrawer(false)} />
        </div>
      )}

      {/* ── Content area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Mobile top bar */}
        <div
          className="sm:hidden h-14 flex items-center gap-3 px-4 border-b border-white/10 flex-shrink-0"
          style={{ backgroundColor: "#0f172a" }}>
          <button
            onClick={() => setDrawer(true)}
            className="text-white/60 hover:text-white p-1 flex-shrink-0"
            aria-label="Menu">
            <svg viewBox="0 0 18 14" className="w-5 h-4" fill="currentColor">
              <rect y="0"  width="18" height="2" rx="1"/>
              <rect y="6"  width="18" height="2" rx="1"/>
              <rect y="12" width="18" height="2" rx="1"/>
            </svg>
          </button>
          <span className="text-sm font-black text-white flex-1">
            Logistic<span className="text-blue-400">Bay</span>
          </span>
          <span className="text-xs text-white/50 truncate max-w-[120px]">{user?.name}</span>
        </div>

        {/* Desktop top bar */}
        <header className="hidden sm:flex h-14 bg-white border-b border-border items-center justify-between px-6 flex-shrink-0">
          <div className="text-sm text-muted">
            {new Date().toLocaleDateString("en-GB", {
              weekday: "long", day: "numeric", month: "long", year: "numeric",
            })}
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs bg-green-100 text-green-800 px-2.5 py-1 rounded-full font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Live
            </span>
            <span className="text-sm font-semibold text-primary">{user?.companyName}</span>
            <span className="text-slate-200">|</span>
            <span className="text-sm text-muted">{user?.name}</span>
            <button
              onClick={() => { logout(); navigate("/"); }}
              className="text-sm text-red-500 hover:text-red-700 font-semibold ml-1">
              Sign out
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
