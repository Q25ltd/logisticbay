import { errorMessage } from "../../lib/errorMessage";
import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { resetPassword } from "../../api/auth";
import { Button } from "../../components/Button";
import { Input } from "../../components/Input";
import { Alert } from "../../components/Alert";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (newPassword !== confirm) { setError("Passwords do not match"); return; }
    if (!token) { setError("Missing reset token — please use the link from your email"); return; }
    setLoading(true);
    try {
      await resetPassword(token, newPassword);
      setDone(true);
      setTimeout(() => navigate("/login"), 2500);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="text-2xl font-black text-primary">
            Logistic<span className="text-accent">Bay</span>
          </Link>
          <p className="text-muted mt-2 text-sm">Set a new password</p>
        </div>
        <div className="card p-8">
          {done ? (
            <div className="text-center">
              <div className="text-4xl mb-4">✅</div>
              <h2 className="text-lg font-bold text-primary mb-2">Password updated</h2>
              <p className="text-sm text-muted">All your sessions have been signed out. Redirecting to sign in…</p>
            </div>
          ) : (
            <>
              {error && <Alert type="error" message={error} />}
              {!token && <Alert type="error" message="Invalid reset link — please request a new one." />}
              <form onSubmit={handleSubmit}>
                <Input label="New Password" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min 8 chars or 6-digit PIN" required />
                <Input label="Confirm Password" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat" required />
                <Button type="submit" className="w-full mt-2" loading={loading} disabled={!token}>Set new password →</Button>
              </form>
            </>
          )}
        </div>
        <p className="text-center text-sm text-muted mt-4">
          <Link to="/login" className="text-accent font-semibold hover:underline">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
