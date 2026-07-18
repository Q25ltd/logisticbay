/**
 * App.tsx — route structure + auth context scoping.
 *
 * TASK 0.6 fix (Commandment / CLAUDE.md public-route hygiene):
 *   AuthCtx.Provider and useAuthProvider() now mount ONLY under /app/*.
 *   Public routes (/, /login, /register, /request/:token, etc.) never
 *   trigger /auth/me or the 5-minute refresh poll.
 *
 * Architecture:
 *   BrowserRouter
 *     AppRoutes                 ← useNavigate lives here
 *       /                       public
 *       /login, /register …     public — onLogin navigates to /app/dashboard
 *       /request/:token         public — no auth context at all
 *       /app  → <AuthLayout />  mounts useAuthProvider(); guards all /app/* routes
 *         /app/dashboard …      staff-only; reads auth via useAuth() context consumer
 */

import { BrowserRouter, Routes, Route, Navigate, Outlet, useNavigate } from "react-router-dom";
import { Analytics }            from "@vercel/analytics/react";
import { ErrorBoundary }        from "./components/ErrorBoundary";
import { AuthCtx, useAuthProvider } from "./hooks/useAuth";
import { getToken }             from "./api/client";
import LandingPage              from "./modules/landing/LandingPage";
import LoginPage                from "./modules/auth/LoginPage";
import RegisterPage             from "./modules/auth/RegisterPage";
import ForgotPasswordPage       from "./modules/auth/ForgotPasswordPage";
import ResetPasswordPage        from "./modules/auth/ResetPasswordPage";
import VerifyEmailPage          from "./modules/auth/VerifyEmailPage";
import AppShell                 from "./modules/planner/AppShell";
import DashboardPage            from "./modules/planner/DashboardPage";
import JobsPage                 from "./modules/jobs/JobsPage";
import CreateJobPage            from "./modules/jobs/CreateJobPage";
import JobDetailPage            from "./modules/jobs/JobDetailPage";
import DriversPage              from "./modules/drivers/DriversPage";
import HolidaysPage             from "./modules/holidays/HolidaysPage";
import ShiftsPage               from "./modules/shifts/ShiftsPage";
import FleetPage                from "./modules/fleet/FleetPage";
import MarketplacePage          from "./modules/marketplace/MarketplacePage";
import IntelligencePage         from "./modules/intelligence/IntelligencePage";
import SettingsPage             from "./modules/settings/SettingsPage";
import PublicRequestForm        from "./modules/requests/PublicRequestForm";
import JobRequestsPage          from "./modules/requests/JobRequestsPage";
import RunsPage                 from "./modules/runs/RunsPage";
import PlanningBoardPage        from "./modules/planning/PlanningBoardPage";
import LivePage                 from "./modules/live/LivePage";

// ── AuthLayout — mounts auth context for /app/* only ─────────────────────────
//
// useAuthProvider() starts the 5-minute refresh interval and calls /auth/me.
// By placing it here it only runs when the user is on a /app/* route.
// Public visitors and end customers on /request/:token are never affected.

function AuthLayout() {
  const auth = useAuthProvider();

  if (auth.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="text-center">
          <div className="text-2xl font-black text-primary mb-2">
            Logistic<span className="text-accent">Bay</span>
          </div>
          <div className="text-muted text-sm animate-pulse">Loading…</div>
        </div>
      </div>
    );
  }

  if (!auth.user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <AuthCtx.Provider value={auth}>
      <Outlet />
    </AuthCtx.Provider>
  );
}

// ── AppRoutes — needs to be a child of BrowserRouter to use useNavigate ───────

function AppRoutes() {
  const navigate = useNavigate();
  // Called by login / register / verify-email after a successful auth action.
  // Navigating to /app triggers AuthLayout which loads the user via /auth/me.
  const goToApp = () => navigate("/app/dashboard", { replace: true });

  // Synchronous token check — if a token exists in localStorage, the user is
  // likely already authenticated; redirect them away from auth pages immediately
  // without waiting for an async /auth/me call.
  const alreadyAuthed = !!getToken();

  return (
    <Routes>
      {/* ── Public routes — no auth context ── */}
      <Route path="/"                element={<LandingPage />} />
      <Route path="/login"           element={alreadyAuthed ? <Navigate to="/app/dashboard" replace /> : <LoginPage onLogin={goToApp} />} />
      <Route path="/register"        element={alreadyAuthed ? <Navigate to="/app/dashboard" replace /> : <RegisterPage onLogin={goToApp} />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password"  element={<ResetPasswordPage />} />
      <Route path="/verify-email"    element={<VerifyEmailPage onLogin={goToApp} />} />

      {/* Public intake form — end-customer facing; must never send a Bearer token */}
      <Route path="/request/:token"  element={<ErrorBoundary><PublicRequestForm /></ErrorBoundary>} />

      {/* ── Staff routes — AuthLayout mounts auth context here ── */}
      <Route path="/app" element={<ErrorBoundary><AuthLayout /></ErrorBoundary>}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route element={<AppShell />}>
          <Route path="dashboard"    element={<DashboardPage />} />
          <Route path="jobs"         element={<JobsPage />} />
          <Route path="jobs/create"  element={<CreateJobPage />} />
          <Route path="jobs/:id"     element={<JobDetailPage />} />
          <Route path="jobs/:id/edit" element={<CreateJobPage />} />
          <Route path="drivers"      element={<DriversPage />} />
          <Route path="holidays"     element={<HolidaysPage />} />
          <Route path="shifts"       element={<ShiftsPage />} />
          <Route path="fleet"        element={<FleetPage />} />
          <Route path="marketplace"  element={<MarketplacePage />} />
          <Route path="intelligence" element={<IntelligencePage />} />
          <Route path="settings"     element={<SettingsPage />} />
          <Route path="job-requests" element={<JobRequestsPage />} />
          <Route path="runs"         element={<RunsPage />} />
          <Route path="planning"     element={<PlanningBoardPage />} />
          <Route path="live"         element={<LivePage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
      <Analytics />
    </BrowserRouter>
  );
}
