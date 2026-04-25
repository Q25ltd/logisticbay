import { useState } from "react";
import { Link } from "react-router-dom";
import { login } from "../../api/auth";
import { Button } from "../../components/Button";
import { Input } from "../../components/Input";
import { Alert } from "../../components/Alert";

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setLoading(true);
    try { await login(email, password); await onLogin(); }
    catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="text-2xl font-black text-primary">
            Logistic<span className="text-accent">Bay</span>
          </Link>
          <p className="text-muted mt-2 text-sm">Sign in to your account</p>
        </div>
        <div className="card p-8">
          {error && <Alert type="error" message={error} />}
          <form onSubmit={handleSubmit}>
            <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required />
            <Input label="Password / PIN" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password or 6-digit PIN" required />
            <Button type="submit" className="w-full mt-2" loading={loading}>Sign in →</Button>
          </form>
        </div>
        <p className="text-center text-sm text-muted mt-4">
          New company? <Link to="/register" className="text-accent font-semibold hover:underline">Register here</Link>
        </p>
      </div>
    </div>
  );
}
