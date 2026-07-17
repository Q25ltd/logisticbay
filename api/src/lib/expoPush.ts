/**
 * expoPush — Expo push transport (S14).
 *
 * Plain fetch against the Expo push HTTP API — no SDK dependency. Best-effort
 * by contract: NEVER throws (a push outage must never fail the business
 * operation that triggered it) and never runs inside a DB transaction. Timeout
 * follows the routing.ts precedent (every outbound fetch carries AbortSignal).
 */

export interface PushPayload {
  title: string;
  body:  string;
  data?: Record<string, unknown>;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK_SIZE    = 100; // Expo's documented max messages per request

export async function sendExpoPush(tokens: string[], payload: PushPayload): Promise<void> {
  if (tokens.length === 0) return;
  for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
    const chunk = tokens.slice(i, i + CHUNK_SIZE);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method:  'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body:    JSON.stringify(chunk.map(to => ({ to, title: payload.title, body: payload.body, data: payload.data ?? {} }))),
        signal:  AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        console.error(`[push] Expo push returned ${res.status} for ${chunk.length} token(s)`);
      }
    } catch (err) {
      console.error('[push] Expo push dispatch failed:', err instanceof Error ? err.message : err);
    }
  }
}
