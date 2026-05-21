import { useState, useEffect, createContext, useContext } from "react";
import type { User } from "../types";
import { getMe, logout as apiLogout } from "../api/auth";
import { getToken, setAuthTokens } from "../api/client";

interface AuthContext {
  user: User | null; loading: boolean;
  logout: () => void; refresh: () => Promise<void>;
}

export const AuthCtx = createContext<AuthContext>({
  user: null, loading: true, logout: () => {}, refresh: async () => {},
});

export function useAuth() { return useContext(AuthCtx); }

/** Decode JWT expiry without a library — returns seconds until expiry, or 0 if invalid/expired */
function secondsUntilExpiry(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (!payload.exp) return 0;
    return Math.max(0, payload.exp - Math.floor(Date.now() / 1000));
  } catch {
    return 0;
  }
}

const REFRESH_BEFORE_EXPIRY_S = 30 * 60; // refresh when <30 min left

export function useAuthProvider(): AuthContext {
  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const token = getToken();
    if (!token) { setUser(null); setLoading(false); return; }
    try { setUser(await getMe()); }
    catch { setUser(null); apiLogout(); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    refresh();

    // Proactive silent refresh: check every 5 minutes, refresh when <30 min left
    const interval = setInterval(async () => {
      const token = getToken();
      if (!token) return;
      if (secondsUntilExpiry(token) < REFRESH_BEFORE_EXPIRY_S) {
        const refreshToken = localStorage.getItem("lb_refresh_token");
        if (!refreshToken) return;
        try {
          const API_BASE = import.meta.env.VITE_API_URL || "http://192.168.0.45:3000";
          const res = await fetch(`${API_BASE}/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken }),
          });
          if (res.ok) {
            const data = await res.json() as { accessToken: string; refreshToken: string };
            if (data.accessToken && data.refreshToken) {
              setAuthTokens(data.accessToken, data.refreshToken);
            }
          }
        } catch { /* silent — will retry in 5 min */ }
      }
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  function logout() { apiLogout(); setUser(null); }
  return { user, loading, logout, refresh };
}
