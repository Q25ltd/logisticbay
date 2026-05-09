import { useState } from "react";
import { Link } from "react-router-dom";
import { registerCompany } from "../../api/auth";
import { Button } from "../../components/Button";
import { Input } from "../../components/Input";
import { Alert } from "../../components/Alert";

export default function RegisterPage({ onLogin }: { onLogin: () => void }) {
  const [form, setForm] = useState({
    companyName: "", ticker: "", name: "", email: "", password: "", confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [f]: e.target.value }));

  const setTicker = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, ticker: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setLoading(true);
    try { await registerCompany(form); await onLogin(); }
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
          <p className="text-muted mt-2 text-sm">Register your company — free trial</p>
        </div>
        <div className="card p-8">
          {error && <Alert type="error" message={error} />}
          <form onSubmit={handleSubmit}>
            <Input label="Company Name" value={form.companyName} onChange={set("companyName")} placeholder="Acme Haulage Ltd" required />
            <Input
              label="Company Ticker"
              value={form.ticker}
              onChange={setTicker}
              placeholder="Example: LGB"
              maxLength={5}
              hint="Used to create job reference numbers, for example LGB-26-000001."
              required
            />
            <Input label="Your Name" value={form.name} onChange={set("name")} placeholder="John Smith" required />
            <Input label="Email" type="email" value={form.email} onChange={set("email")} placeholder="john@acme.com" required />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Password" type="password" value={form.password} onChange={set("password")} placeholder="Min 8 chars" required />
              <Input label="Confirm" type="password" value={form.confirmPassword} onChange={set("confirmPassword")} placeholder="Repeat" required />
            </div>
            <Button type="submit" className="w-full mt-2" loading={loading}>Create Account →</Button>
          </form>
        </div>
        <p className="text-center text-sm text-muted mt-4">
          Already registered? <Link to="/login" className="text-accent font-semibold hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
