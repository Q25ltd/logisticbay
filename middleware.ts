/**
 * Vercel Edge Middleware — Open Graph bot detection
 *
 * When a social-media crawler (Facebook, WhatsApp, Telegram, iMessage,
 * LinkedIn, Slack, Discord, Twitter/X …) fetches a /request/:token URL,
 * this middleware intercepts the request and proxies it to the Fastify API's
 * /og/request/:token endpoint, which returns fully-formed OG HTML.
 *
 * Real browsers pass straight through to the SPA as normal.
 *
 * Deploy requirement: set API_URL env var in Vercel project settings.
 * e.g. API_URL=https://api-production-cdc9.up.railway.app
 */

export const config = {
  matcher: ["/request/:token*"],
};

// ── Bot user-agent detection ────────────────────────────────────────────────

const BOT_PATTERNS = [
  "facebookexternalhit",
  "facebookcatalog",
  "whatsapp",
  "telegrambot",
  "twitterbot",
  "linkedinbot",
  "slackbot",
  "discordbot",
  "applebot",
  "skypeurfpreview",
  "viber",
  "pinterest",
  "snapchat",
  "redditbot",
  "embedly",
  "googlebot",
  "bingbot",
  "duckduckbot",
];

function isBot(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return BOT_PATTERNS.some(p => ua.includes(p));
}

// ── Middleware ─────────────────────────────────────────────────────────────

export default async function middleware(request: Request): Promise<Response | undefined> {
  const url   = new URL(request.url);
  const match = url.pathname.match(/^\/request\/([^/]+)$/);

  if (!match) return undefined;  // pass through

  const ua = request.headers.get("user-agent") ?? "";
  if (!isBot(ua)) return undefined;  // pass through for real browsers

  // Bot detected — fetch OG HTML from the Fastify API
  const token  = match[1];
  const apiUrl = (process.env.API_URL ?? "https://api-production-cdc9.up.railway.app").replace(/\/$/, "");

  try {
    // Manual 4-second timeout using Promise.race for Edge Runtime compatibility
    const controller  = new AbortController();
    const timeoutId   = setTimeout(() => controller.abort(), 4000);

    const ogRes = await fetch(`${apiUrl}/og/request/${encodeURIComponent(token)}`, {
      headers: { "User-Agent": "LogisticBay-OG-Proxy/1.0" },
      signal:  controller.signal,
    });

    clearTimeout(timeoutId);

    const html = await ogRes.text();

    return new Response(html, {
      status:  200,
      headers: {
        "Content-Type":  "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
        "X-OG-Served":   "1",
      },
    });
  } catch {
    // API unreachable — fall through to the SPA (static OG tags will still show)
    return undefined;
  }
}
