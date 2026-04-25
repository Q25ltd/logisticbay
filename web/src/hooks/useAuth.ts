import { useState, useEffect, createContext, useContext } from "react";
import type { User } from "../types";
import { getMe, logout as apiLogout } from "../api/auth";

interface AuthContext {
  user: User | null; loading: boolean;
  logout: () => void; refresh: () => Promise<void>;
}

export const AuthCtx = createContext<AuthContext>({
  user: null, loading: true, logout: () => {}, refresh: async () => {},
});

export function useAuth() { return useContext(AuthCtx); }

export function useAuthProvider(): AuthContext {
  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try { setUser(await getMe()); }
    catch { setUser(null); apiLogout(); }
    finally { setLoading(false); }
  }

  useEffect(() => { refresh(); }, []);
  function logout() { apiLogout(); setUser(null); }
  return { user, loading, logout, refresh };
}
