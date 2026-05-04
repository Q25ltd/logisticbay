import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

const NAV = [
  { to:"/app/dashboard",    icon:"🏠", label:"Dashboard",   active:true  },
  { to:"/app/jobs",         icon:"📋", label:"Jobs",        active:true  },
  { to:"/app/templates",    icon:"📄", label:"Templates",   active:true  },
  { to:"/app/drivers",      icon:"👥", label:"Drivers",     active:true  },
  { to:"/app/holidays",     icon:"🌴", label:"Holidays",    active:true  },
  { to:"/app/locations",    icon:"📍", label:"Locations",   active:true  },
  { to:"/app/shifts",       icon:"⏱",  label:"Shifts",      active:true  },
  { to:"/app/fleet",        icon:"🚛", label:"Fleet",       active:false },
  { to:"/app/marketplace",  icon:"🏗️", label:"Marketplace", active:false },
  { to:"/app/intelligence", icon:"🤖", label:"Intelligence",active:false },
  { to:"/app/settings",     icon:"⚙️", label:"Settings",    active:true  },
];

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const open = true; // always open

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <aside style={{ width: "224px", minWidth: "224px", overflow: "hidden", backgroundColor: "#0f172a", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div className="h-14 flex items-center px-4 border-b border-white/10 flex-shrink-0">
          {open ? <span className="text-lg font-black text-white">Logistic<span className="text-accent">Bay</span></span>
                : <span className="text-lg font-black text-accent">LB</span>}
        </div>
        <nav className="flex-1 py-3 overflow-y-auto">
          {NAV.map(item => item.active ? (
            <NavLink key={item.to} to={item.to}
              className={({ isActive }) => "flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors " +
                (isActive ? "bg-white/15 text-white border-r-2 border-accent" : "text-white/60 hover:text-white hover:bg-white/10")}>
              <span className="text-base w-5 text-center flex-shrink-0">{item.icon}</span>
              {open && <span>{item.label}</span>}
            </NavLink>
          ) : (
            <div key={item.to} className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/25 cursor-not-allowed" title="Coming soon">
              <span className="text-base w-5 text-center flex-shrink-0">{item.icon}</span>
              {open && <span>{item.label} <span className="text-xs opacity-50">soon</span></span>}
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3 flex-shrink-0">
          {open ? (
            <div>
              <div className="text-xs text-white/40 truncate">{user?.companyName}</div>
              <div className="text-sm font-semibold text-white truncate">{user?.name}</div>
              <button onClick={() => { logout(); navigate("/"); }} className="text-xs text-white/40 hover:text-white mt-1">Sign out</button>
            </div>
          ) : (
            <button onClick={() => { logout(); navigate("/"); }} className="text-white/40 hover:text-white text-lg w-full text-center" title="Sign out">↩</button>
          )}
        </div>

      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 bg-white border-b border-border flex items-center justify-between px-6 flex-shrink-0">
          <div className="text-sm text-muted">
            {new Date().toLocaleDateString("en-GB", { weekday:"long", day:"numeric", month:"long", year:"numeric" })}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full font-semibold">● Live</span>
            <span className="text-sm font-medium text-gray-900">{user?.companyName}</span>
            <span className="text-gray-300">|</span>
            <span className="text-sm text-gray-600">{user?.name}</span>
            <button onClick={() => { logout(); navigate("/"); }} className="text-sm text-red-500 hover:text-red-700 font-semibold ml-2">Sign out</button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto"><Outlet /></main>
      </div>
    </div>
  );
}
