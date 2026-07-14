import { errorMessage } from "../../lib/errorMessage";
import { useState } from "react";
import { Link } from "react-router-dom";
import { forgotPassword } from "../../api/auth";
import { Button } from "../../components/Button";
import { Input } from "../../components/Input";
import { Alert } from "../../components/Alert";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      await forgotPassword(email);
      setSent(true);
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
          <p className="text-muted mt-2 text-sm">Reset your password</p>
        </div>
        <div className="card p-8">
          {sent ? (
            <div className="text-center">
              <div className="text-4xl mb-4">✉️</div>
              <h2 className="text-lg font-bold text-primary mb-2">Check your inbox</h2>
              <p className="text-sm text-muted">
                If an account exists for <strong>{email}</strong>, a reset link has been sent.
                The link expires in 1 hour.
              </p>
            </div>
          ) : (
            <>
              {error && <Alert type="error" message={error} />}
              <p className="text-sm text-muted mb-4">
                Enter your email and we'll send you a link to reset your password.
                Only company owner accounts can self-serve reset — contact your admin if you're a driver or planner.
              </p>
              <form onSubmit={handleSubmit}>
                <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required />
                <Button type="submit" className="w-full mt-2" loading={loading}>Send reset link →</Button>
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
