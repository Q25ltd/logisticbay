const BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";
const tok = () => localStorage.getItem("lb_token");

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(tok() ? { Authorization: `Bearer ${tok()}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const api = {
  get:   <T>(p: string)              => req<T>("GET",    p),
  post:  <T>(p: string, b: unknown)  => req<T>("POST",   p, b),
  patch: <T>(p: string, b: unknown)  => req<T>("PATCH",  p, b),
  del:   <T>(p: string)              => req<T>("DELETE", p),
};
