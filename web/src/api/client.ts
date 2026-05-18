const API_BASE = import.meta.env.VITE_API_URL || "http://192.168.0.45:3000";

const TOKEN_KEY = "lb_token";
const REFRESH_TOKEN_KEY = "lb_refresh_token";

type RefreshResponse = {
  accessToken: string;
  refreshToken: string;
};

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function setAuthTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

function shouldRefresh(path: string): boolean {
  return !["/auth/login", "/auth/register-company", "/auth/refresh", "/auth/logout"].includes(path);
}

async function refreshSession(): Promise<boolean> {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;

    const data = await res.json() as RefreshResponse;
    if (!data.accessToken || !data.refreshToken) return false;

    setAuthTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

const REQUEST_TIMEOUT_MS = 30_000;

async function request<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  const token = getToken();
  let res: Response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    throw new Error("Cannot connect to server. Check your connection.");
  } finally {
    clearTimeout(timeoutId);
  }
  if (res.status === 401) {
    if (retry && shouldRefresh(path) && await refreshSession()) {
      return request<T>(method, path, body, false);
    }

    clearToken();
    if (!window.location.pathname.includes("/login")) {
      window.location.href = "/login";
    }
    throw new Error("Session expired. Please sign in again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = Array.isArray(data.errors) && data.errors.length
      ? `: ${data.errors.join(", ")}`
      : Array.isArray(data.details) && data.details.length
        ? `: ${data.details.join(", ")}`
        : "";
    throw new Error(`${data.error || data.message || `Request failed (${res.status})`}${detail}`);
  }
  return data;
}

export const api = {
  get:    <T>(path: string)                => request<T>("GET",    path),
  post:   <T>(path: string, body: unknown) => request<T>("POST",   path, body),
  patch:  <T>(path: string, body: unknown) => request<T>("PATCH",  path, body),
  delete: <T>(path: string, body?: unknown) => request<T>("DELETE", path, body),
};
