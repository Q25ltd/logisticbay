import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AuthCtx, useAuthProvider } from "./hooks/useAuth";
import LandingPage      from "./modules/landing/LandingPage";
import LoginPage            from "./modules/auth/LoginPage";
import RegisterPage         from "./modules/auth/RegisterPage";
import ForgotPasswordPage   from "./modules/auth/ForgotPasswordPage";
import ResetPasswordPage    from "./modules/auth/ResetPasswordPage";
import VerifyEmailPage      from "./modules/auth/VerifyEmailPage";
import AppShell         from "./modules/planner/AppShell";
import DashboardPage    from "./modules/planner/DashboardPage";
import JobsPage         from "./modules/jobs/JobsPage";
import CreateJobPage    from "./modules/jobs/CreateJobPage";
import JobDetailPage   from "./modules/jobs/JobDetailPage";
import DriversPage      from "./modules/drivers/DriversPage";
import HolidaysPage     from "./modules/holidays/HolidaysPage";
import TemplatesPage    from "./modules/templates/TemplatesPage";
import LocationsPage    from "./modules/locations/LocationsPage";
import ShiftsPage       from "./modules/shifts/ShiftsPage";
import FleetPage        from "./modules/fleet/FleetPage";
import MarketplacePage  from "./modules/marketplace/MarketplacePage";
import IntelligencePage from "./modules/intelligence/IntelligencePage";
import SettingsPage          from "./modules/settings/SettingsPage";
import PublicRequestForm    from "./modules/requests/PublicRequestForm";
import JobRequestsPage      from "./modules/requests/JobRequestsPage";
import RequestLinksPage     from "./modules/requests/RequestLinksPage";
import RunsPage             from "./modules/runs/RunsPage";
import RunDetailPage        from "./modules/runs/RunDetailPage";

export default function App() {
  const auth = useAuthProvider();

  if (auth.loading) return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="text-center">
        <div className="text-2xl font-black text-primary mb-2">Logistic<span className="text-accent">Bay</span></div>
        <div className="text-muted text-sm animate-pulse">Loading...</div>
      </div>
    </div>
  );

  return (
    <AuthCtx.Provider value={auth}>
      <BrowserRouter>
        <Routes>
          <Route path="/"         element={<LandingPage />} />
          <Route path="/login"           element={auth.user ? <Navigate to="/app/dashboard" replace /> : <LoginPage onLogin={auth.refresh} />} />
          <Route path="/register"        element={auth.user ? <Navigate to="/app/dashboard" replace /> : <RegisterPage onLogin={auth.refresh} />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password"  element={<ResetPasswordPage />} />
          <Route path="/verify-email"    element={<VerifyEmailPage onLogin={auth.refresh} />} />
          {/* Public intake form — no auth required */}
          <Route path="/request/:token" element={<ErrorBoundary><PublicRequestForm /></ErrorBoundary>} />
          <Route path="/app" element={auth.user ? <ErrorBoundary><AppShell /></ErrorBoundary> : <Navigate to="/login" replace />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard"    element={<DashboardPage />} />
            <Route path="jobs"         element={<JobsPage />} />
            <Route path="jobs/create"  element={<CreateJobPage />} />
            <Route path="jobs/:id"     element={<JobDetailPage />} />
            <Route path="jobs/:id/edit" element={<CreateJobPage />} />
            <Route path="drivers"      element={<DriversPage />} />
            <Route path="holidays"     element={<HolidaysPage />} />
            <Route path="templates"    element={<TemplatesPage />} />
            <Route path="locations"    element={<LocationsPage />} />
            <Route path="shifts"       element={<ShiftsPage />} />
            <Route path="fleet"        element={<FleetPage />} />
            <Route path="marketplace"  element={<MarketplacePage />} />
            <Route path="intelligence" element={<IntelligencePage />} />
            <Route path="settings"       element={<SettingsPage />} />
            <Route path="job-requests"   element={<JobRequestsPage />} />
            <Route path="request-links"  element={<RequestLinksPage />} />
            <Route path="runs"           element={<RunsPage />} />
            <Route path="runs/:id"       element={<RunDetailPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthCtx.Provider>
  );
}
