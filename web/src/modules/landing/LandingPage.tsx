import { useNavigate } from "react-router-dom";

const FEATURES = [
  {
    icon: "📋",
    name: "Planner & Dispatch",
    desc: "Create jobs, assign drivers, and monitor your entire operation in real time from one screen.",
    badge: "Live",
    color: "from-blue-500 to-blue-600",
    bg: "bg-blue-50",
  },
  {
    icon: "📱",
    name: "Driver App",
    desc: "Drivers receive jobs on their phone, complete vehicle checks, update status, and submit digital shift reports.",
    badge: "Live",
    color: "from-green-500 to-emerald-600",
    bg: "bg-green-50",
  },
  {
    icon: "🚛",
    name: "Fleet & Equipment",
    desc: "Track trucks, trailers, VOR status, and upcoming maintenance schedules automatically.",
    badge: "Live",
    color: "from-orange-400 to-orange-500",
    bg: "bg-orange-50",
  },
  {
    icon: "🤖",
    name: "AI Intelligence",
    desc: "AI learns your routes and delays to suggest smarter daily plans and cut wasted time.",
    badge: "Future",
    color: "from-purple-500 to-indigo-600",
    bg: "bg-purple-50",
  },
  {
    icon: "🏗️",
    name: "Load Marketplace",
    desc: "Clients post loads, hauliers bid, and winning loads automatically become planned jobs.",
    badge: "Future",
    color: "from-rose-500 to-pink-600",
    bg: "bg-rose-50",
  },
];

const STEPS = [
  { n: "1", title: "Register your company", body: "Create a free account in under 2 minutes. No credit card needed." },
  { n: "2", title: "Add drivers & vehicles", body: "Import your team in seconds. Drivers download the app and are ready to go." },
  { n: "3", title: "Run your first shift", body: "Plan jobs, dispatch drivers, and get live shift reports straight to your inbox." },
];

const PAIN_POINTS = [
  { old: "WhatsApp group chaos", icon: "💬" },
  { old: "Paper timesheets", icon: "📄" },
  { old: "Excel spreadsheets", icon: "📊" },
  { old: "Phone calls for updates", icon: "📞" },
];

export default function LandingPage() {
  const nav = useNavigate();

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">

      {/* ── NAV ── */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="text-xl font-black tracking-tight">
            Logistic<span className="text-blue-500">Bay</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              className="hidden sm:inline-flex text-sm font-semibold text-gray-600 hover:text-gray-900 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
              onClick={() => nav("/login")}
            >
              Sign in
            </button>
            <button
              className="inline-flex items-center gap-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors shadow-sm"
              onClick={() => nav("/register")}
            >
              Start Free →
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white overflow-hidden">
        {/* background decoration */}
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: "radial-gradient(circle at 20% 50%, #3b82f6 0%, transparent 50%), radial-gradient(circle at 80% 20%, #6366f1 0%, transparent 40%)"
        }} />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-20 sm:pt-24 sm:pb-28">
          {/* pill badge */}
          <div className="inline-flex items-center gap-2 bg-blue-500/20 border border-blue-500/30 text-blue-300 text-xs font-bold px-3 py-1.5 rounded-full mb-6 uppercase tracking-wider">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
            Planner &amp; Driver App — Live Now
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black leading-tight mb-6">
            Run your haulage<br />
            <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
              without the chaos
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-300 max-w-xl mb-8 leading-relaxed">
            LogisticBay replaces WhatsApp groups, paper timesheets, and spreadsheets with one smart platform built for UK haulage.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 mb-8">
            <button
              className="inline-flex items-center justify-center bg-blue-500 hover:bg-blue-400 text-white font-bold text-base px-7 py-3.5 rounded-xl transition-colors shadow-lg shadow-blue-500/30"
              onClick={() => nav("/register")}
            >
              Register Free — No Card Needed
            </button>
            <button
              className="inline-flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-base px-7 py-3.5 rounded-xl transition-colors"
              onClick={() => nav("/login")}
            >
              Sign In
            </button>
          </div>

          <p className="text-slate-400 text-sm">
            ✓ Free during MVP &nbsp;·&nbsp; ✓ Setup in 2 minutes &nbsp;·&nbsp; ✓ Your data stays yours
          </p>
        </div>
      </section>

      {/* ── REPLACE THESE ── */}
      <section className="bg-slate-800 py-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <p className="text-center text-slate-400 text-xs font-bold uppercase tracking-widest mb-6">
            LogisticBay replaces
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {PAIN_POINTS.map(p => (
              <div key={p.old} className="flex flex-col items-center gap-2 bg-slate-700/50 rounded-xl px-4 py-5 text-center">
                <span className="text-2xl opacity-60">{p.icon}</span>
                <span className="text-sm text-slate-400 line-through">{p.old}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="bg-blue-500 py-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center text-white">
            {[
              { v: "2 min", l: "to set up" },
              { v: "100%", l: "paperless shifts" },
              { v: "Live", l: "real-time updates" },
              { v: "Free", l: "MVP phase" },
            ].map(({ v, l }) => (
              <div key={l}>
                <div className="text-3xl sm:text-4xl font-black">{v}</div>
                <div className="text-blue-100 text-sm mt-1">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-3">
              Everything in one place
            </h2>
            <p className="text-slate-500 max-w-lg mx-auto">
              Five integrated modules. Start with what you need today — each one connects to the rest.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(f => (
              <div
                key={f.name}
                className="group relative bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl ${f.bg} text-2xl mb-4`}>
                  {f.icon}
                </div>

                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-bold text-slate-900 text-base">{f.name}</h3>
                  <span className={`ml-2 shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                    f.badge === "Live"
                      ? "bg-green-100 text-green-700"
                      : f.badge === "Coming Soon"
                      ? "bg-orange-100 text-orange-700"
                      : "bg-purple-100 text-purple-700"
                  }`}>
                    {f.badge === "Live" ? "● " : ""}{f.badge}
                  </span>
                </div>

                <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>

                <div className={`absolute bottom-0 left-0 right-0 h-0.5 rounded-b-2xl bg-gradient-to-r ${f.color} opacity-0 group-hover:opacity-100 transition-opacity`} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DRIVER APP HIGHLIGHT ── */}
      <section className="bg-gradient-to-br from-slate-900 to-slate-800 py-20 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto flex flex-col lg:flex-row items-center gap-12">
          <div className="flex-1 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 bg-green-500/20 border border-green-500/30 text-green-300 text-xs font-bold px-3 py-1.5 rounded-full mb-5 uppercase tracking-wider">
              ✓ Live Now
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-white mb-4 leading-tight">
              Your drivers stay<br />connected from their phone
            </h2>
            <p className="text-slate-300 text-lg mb-6 leading-relaxed">
              The LogisticBay driver app lets every driver receive jobs, complete vehicle safety checks, track mileage, and submit a digital shift report — all without paper.
            </p>
            <ul className="space-y-3 text-slate-300 text-sm mb-8">
              {[
                "Digital vehicle safety checks — truck & trailer",
                "Real-time job status updates",
                "Automatic odometer & mileage tracking",
                "Shift reports emailed to office as PDF",
                "Works offline — syncs when connected",
              ].map(item => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5 shrink-0">✓</span>
                  {item}
                </li>
              ))}
            </ul>
            <button
              className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-400 text-white font-bold px-6 py-3 rounded-xl transition-colors"
              onClick={() => nav("/register")}
            >
              Get Started Free →
            </button>
          </div>

          {/* phone mockup */}
          <div className="flex-shrink-0 relative">
            <div className="w-56 sm:w-64 bg-slate-700 rounded-3xl border-4 border-slate-600 shadow-2xl overflow-hidden">
              <div className="bg-slate-800 px-4 pt-5 pb-3">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white font-black text-sm">Logistic<span className="text-blue-400">Bay</span></span>
                  <span className="w-2 h-2 bg-green-400 rounded-full" />
                </div>
                <div className="bg-blue-500 text-white text-xs font-bold px-3 py-2 rounded-lg mb-2">
                  🚛 Today — 3 jobs assigned
                </div>
              </div>
              <div className="px-4 pb-5 space-y-2">
                {["Pickup — Manchester", "Delivery — Leeds", "Return — Depot"].map((j, i) => (
                  <div key={j} className="bg-slate-800/80 rounded-lg px-3 py-2.5 flex items-center justify-between">
                    <span className="text-slate-200 text-xs">{j}</span>
                    <span className={`text-xs font-bold ${i === 0 ? "text-green-400" : i === 1 ? "text-blue-400" : "text-slate-400"}`}>
                      {i === 0 ? "Done" : i === 1 ? "Active" : "Pending"}
                    </span>
                  </div>
                ))}
                <div className="bg-green-500/20 border border-green-500/40 rounded-lg px-3 py-2 mt-3">
                  <span className="text-green-300 text-xs font-bold">✓ Shift report submitted</span>
                </div>
              </div>
            </div>
            {/* glow */}
            <div className="absolute inset-0 -z-10 blur-3xl opacity-20 bg-blue-500 rounded-full scale-110" />
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-20 px-4 sm:px-6 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-3">Up and running in minutes</h2>
            <p className="text-slate-500">No training needed. No IT team required.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
            {STEPS.map((s, i) => (
              <div key={s.n} className="relative text-center sm:text-left">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-500 text-white font-black text-lg mb-4">
                  {s.n}
                </div>
                {i < STEPS.length - 1 && (
                  <div className="hidden sm:block absolute top-5 left-10 right-0 h-px bg-gradient-to-r from-blue-300 to-transparent" />
                )}
                <h3 className="font-bold text-slate-900 text-base mb-2">{s.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-4">
            Ready to ditch the spreadsheets?
          </h2>
          <p className="text-slate-500 text-lg mb-8">
            Free during MVP phase. Full access. No credit card. Cancel anytime.
          </p>
          <button
            className="inline-flex items-center justify-center w-full sm:w-auto bg-blue-500 hover:bg-blue-600 text-white font-black text-lg px-10 py-4 rounded-2xl transition-colors shadow-xl shadow-blue-500/30"
            onClick={() => nav("/register")}
          >
            Register Your Company Free →
          </button>
          <p className="text-slate-400 text-sm mt-4">
            Already have an account?{" "}
            <button className="text-blue-500 hover:underline font-semibold" onClick={() => nav("/login")}>
              Sign in
            </button>
          </p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-gray-100 py-8 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-slate-400">
          <div className="font-black text-slate-700 text-base">
            Logistic<span className="text-blue-500">Bay</span>
          </div>
          <div className="flex items-center gap-4">
            <span>© 2026 LogisticBay</span>
            <span className="text-slate-200">·</span>
            <span>Built for UK haulage</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
