import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { verifyEmail } from "../../api/auth";

export default function VerifyEmailPage({ onLogin }: { onLogin: () => void }) {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMessage("Missing verification token — please use the link from your email.");
      return;
    }

    verifyEmail(token)
      .then(async () => {
        setStatus("success");
        await onLogin();
      })
      .catch((err: any) => {
        setStatus("error");
        setErrorMessage(err.message || "Verification failed. The link may have expired.");
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="text-2xl font-black text-primary mb-6">
          Logistic<span className="text-accent">Bay</span>
        </div>
        <div className="card p-8">
          {status === "verifying" && (
            <>
              <div className="text-4xl mb-4 animate-pulse">🔗</div>
              <h2 className="text-lg font-bold text-primary mb-2">Verifying your email…</h2>
              <p className="text-sm text-muted">Please wait a moment.</p>
            </>
          )}
          {status === "success" && (
            <>
              <div className="text-4xl mb-4">✅</div>
              <h2 className="text-lg font-bold text-primary mb-2">Email verified!</h2>
              <p className="text-sm text-muted">Your account is now active. Taking you to your dashboard…</p>
            </>
          )}
          {status === "error" && (
            <>
              <div className="text-4xl mb-4">⚠️</div>
              <h2 className="text-lg font-bold text-primary mb-2">Verification failed</h2>
              <p className="text-sm text-muted mb-4">{errorMessage}</p>
              <Link to="/register" className="text-accent font-semibold hover:underline text-sm">Register again</Link>
            </>
          )}
        </div>
        {status === "error" && (
          <p className="text-center text-sm text-muted mt-4">
            <Link to="/login" className="text-accent font-semibold hover:underline">Back to sign in</Link>
          </p>
        )}
      </div>
    </div>
  );
}
