import { useState } from "react";
import { Link } from "react-router-dom";
import { login } from "../../api/auth";
import { Button } from "../../components/Button";
import { Input } from "../../components/Input";
import { Alert } from "../../components/Alert";

type Company = { companyId: number; companyName: string; role: string };

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState<Company[] | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const data = await login(email, password);
      if ("requiresCompanySelection" in data) {
        setCompanies(data.companies);
      } else {
        await onLogin();
      }
    }
    catch (err: unknown) { setError(err instanceof Error ? err.message : "Login failed"); }
    finally { setLoading(false); }
  }

  async function selectCompany(companyId: number) {
    setError(""); setLoading(true);
    try {
      await login(email, password, companyId);
      await onLogin();
    }
    catch (err: unknown) { setError(err instanceof Error ? err.message : "Login failed"); }
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

          {companies ? (
            <div>
              <p className="text-sm text-muted mb-4">Select the account you want to sign in to:</p>
              <div className="flex flex-col gap-2">
                {companies.map(c => (
                  <button
                    key={c.companyId}
                    onClick={() => selectCompany(c.companyId)}
                    disabled={loading}
                    className="flex items-center justify-between w-full px-4 py-3 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-colors text-left disabled:opacity-50"
                  >
                    <div>
                      <div className="font-semibold text-sm text-primary">{c.companyName}</div>
                      <div className="text-xs text-muted capitalize">{c.role.replace("_", " ")}</div>
                    </div>
                    <span className="text-muted text-sm">→</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setCompanies(null)}
                className="mt-4 text-xs text-muted hover:text-primary w-full text-center"
              >
                ← Back
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required />
              <Input label="Password / PIN" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password or 6-digit PIN" required />
              <div className="text-right mb-2">
                <Link to="/forgot-password" className="text-xs text-muted hover:text-accent">Forgot password?</Link>
              </div>
              <Button type="submit" className="w-full mt-2" loading={loading}>Sign in →</Button>
            </form>
          )}
        </div>
        <p className="text-center text-sm text-muted mt-4">
          New company? <Link to="/register" className="text-accent font-semibold hover:underline">Register here</Link>
        </p>
      </div>
    </div>
  );
}
