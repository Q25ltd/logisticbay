import { useNavigate } from "react-router-dom";

const MODULES = [
  { icon:"🏗️", name:"Cargo Marketplace",       desc:"Clients post loads. Hauliers bid. Winning load becomes a planned job.",    badge:"Future",   badgeClass:"badge-future"  },
  { icon:"📋", name:"Planner & Dispatch",       desc:"Create jobs, assign drivers, monitor operations in real time.",            badge:"Live MVP", badgeClass:"badge-mvp"    },
  { icon:"📱", name:"Driver App",               desc:"Drivers see jobs, complete checks, update status and submit shifts.",      badge:"Live MVP", badgeClass:"badge-mvp"    },
  { icon:"🚛", name:"Fleet & Equipment",        desc:"Track trucks, trailers, VOR status and maintenance schedules.",            badge:"Next",     badgeClass:"badge-soon"   },
  { icon:"🤖", name:"Operational Intelligence", desc:"AI learns your routes and delays to suggest smarter daily plans.",         badge:"Future",   badgeClass:"badge-future" },
];

export default function LandingPage() {
  const nav = useNavigate();
  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-border sticky top-0 bg-white/95 backdrop-blur z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="text-xl font-black">Logistic<span className="text-accent">Bay</span></div>
          <div className="flex gap-3">
            <button className="btn btn-ghost" onClick={() => nav("/login")}>Sign in</button>
            <button className="btn btn-primary" onClick={() => nav("/register")}>Register Free</button>
          </div>
        </div>
      </nav>

      <section className="max-w-7xl mx-auto px-6 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 bg-blue-50 text-accent text-xs font-bold px-3 py-1.5 rounded-full mb-6 uppercase tracking-wide">
          Phase 2 MVP — Planner & Driver App Live
        </div>
        <h1 className="text-5xl md:text-6xl font-black text-primary mb-6 leading-tight">
          The Logistics Operating<br/><span className="text-accent">System for Modern Haulage</span>
        </h1>
        <p className="text-xl text-muted max-w-2xl mx-auto mb-10 leading-relaxed">
          One platform for dispatch, drivers, fleet and the future load marketplace.
          Built to replace spreadsheets and WhatsApp.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <button className="btn btn-primary text-base px-8 py-3" onClick={() => nav("/register")}>Start Free Trial →</button>
          <button className="btn btn-outline text-base px-8 py-3" onClick={() => nav("/login")}>Sign in</button>
        </div>
        <p className="text-sm text-muted mt-4">No credit card required · Free during MVP phase</p>
      </section>

      <section className="bg-primary text-white py-10">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[["2 min","Setup time"],["5","Platform modules"],["Live","Real-time updates"],["Free","MVP phase"]].map(([v,l]) => (
            <div key={l}><div className="text-3xl font-black text-accent">{v}</div><div className="text-sm text-gray-400 mt-1">{l}</div></div>
          ))}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-black text-primary mb-3">Five Integrated Modules</h2>
          <p className="text-muted max-w-xl mx-auto">Start with what you need today. Each module connects to the others.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {MODULES.map(m => (
            <div key={m.name} className="card p-6 hover:shadow-md transition-shadow">
              <div className="text-3xl mb-4">{m.icon}</div>
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-bold text-primary text-lg">{m.name}</h3>
                <span className={m.badgeClass + " badge"}>{m.badge}</span>
              </div>
              <p className="text-sm text-muted leading-relaxed">{m.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-primary py-20">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-4xl font-black text-white mb-4">Replace WhatsApp and spreadsheets today</h2>
          <p className="text-gray-400 mb-8 text-lg">Free during MVP phase. No credit card. Your data stays yours.</p>
          <button className="btn btn-primary text-lg px-10 py-4" onClick={() => nav("/register")}>Register Your Company →</button>
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between text-sm text-muted">
          <div className="font-black text-primary">Logistic<span className="text-accent">Bay</span></div>
          <div>© 2026 LogisticBay</div>
        </div>
      </footer>
    </div>
  );
}
