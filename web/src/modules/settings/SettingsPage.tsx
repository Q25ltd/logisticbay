import { useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { api } from "../../api/client";
import { Button } from "../../components/Button";
import { Alert } from "../../components/Alert";
import { Input } from "../../components/Input";

export default function SettingsPage() {
  const { user } = useAuth();
  const [currentPw, setCurrentPw] = useState("");
  const [newPw,     setNewPw]     = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [loading,   setLoading]   = useState(false);
  const [success,   setSuccess]   = useState("");
  const [error,     setError]     = useState("");

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault(); setError(""); setSuccess("");
    if (newPw !== confirmPw) { setError("Passwords do not match"); return; }
    if (newPw.length < 8)    { setError("Password must be at least 8 characters"); return; }
    setLoading(true);
    try {
      await api.post("/auth/change-password", { currentPassword: currentPw, newPassword: newPw });
      setSuccess("Password changed ✓");
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="text-xl font-black text-primary">Settings</h1>
      <div className="card p-6">
        <h2 className="font-bold text-primary mb-4">Company</h2>
        <div className="space-y-2 text-sm">
          {[
            { label: "Company",   value: user?.companyName },
            { label: "Your Name", value: user?.name },
            { label: "Email",     value: user?.email },
            { label: "Role",      value: user?.role?.replace(/_/g, " ") },
          ].map(r => (
            <div key={r.label} className="flex justify-between py-2 border-b border-border last:border-0">
              <span className="text-muted">{r.label}</span>
              <span className="font-semibold text-primary capitalize">{r.value}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="card p-6">
        <h2 className="font-bold text-primary mb-4">Change Password</h2>
        {success && <Alert type="success" message={success} />}
        {error   && <Alert type="error"   message={error}   />}
        <form onSubmit={handleChangePassword}>
          <Input label="Current Password" type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="Your current password" required />
          <Input label="New Password" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Min 8 characters" required />
          <Input label="Confirm New Password" type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Repeat new password" required />
          <Button type="submit" loading={loading}>Update Password</Button>
        </form>
      </div>
      <div className="card p-6">
        <h2 className="font-bold text-primary mb-4">Platform Modules</h2>
        <div className="text-sm space-y-2">
          {[
            { name: "Planner & Dispatch", cls: "bg-green-100 text-green-800",  label: "Active" },
            { name: "Driver Mobile App",  cls: "bg-green-100 text-green-800",  label: "Active" },
            { name: "Fleet Management",   cls: "bg-orange-100 text-orange-700", label: "Next Phase" },
            { name: "Cargo Marketplace",  cls: "bg-purple-100 text-purple-700", label: "Future" },
            { name: "AI Intelligence",    cls: "bg-purple-100 text-purple-700", label: "Future" },
          ].map(m => (
            <div key={m.name} className="flex justify-between py-2 border-b border-border last:border-0">
              <span className="text-primary">{m.name}</span>
              <span className={"inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold " + m.cls}>{m.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
