export type Bindings = { SIGNALS?: KVNamespace; TURNSTILE_SECRET_KEY?: string };
export const TTL = 6 * 3600;
export const UA =
  "CivicAtlas/0.1 (educational election sandbox; bounded on-demand requests)";
export function json(value: unknown, status = 200, cache = "no-store") {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": cache,
      "X-Content-Type-Options": "nosniff",
      Vary: "Origin",
    },
  });
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}
export async function bounded(
  url: string,
  cap = 48000,
  init: RequestInit = {},
): Promise<string> {
  const res = await fetch(url, {
    ...init,
    headers: { "User-Agent": UA, ...init.headers },
    signal: AbortSignal.timeout(4500),
  });
  if (!res.ok) throw Error("Upstream unavailable");
  const reader = res.body?.getReader();
  if (!reader) throw Error("Empty body");
  let size = 0,
    text = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > cap) throw Error("Upstream response exceeded cap");
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
}
export async function read<T>(
  kv: KVNamespace | undefined,
  key: string,
): Promise<T | null> {
  try {
    return kv ? await kv.get<T>(key, "json") : null;
  } catch {
    return null;
  }
}
export async function write(
  kv: KVNamespace | undefined,
  key: string,
  value: unknown,
  ttl = TTL * 4,
) {
  try {
    await kv?.put(key, JSON.stringify(value), { expirationTtl: ttl });
  } catch {
    /* quota failure must not break the app */
  }
}
export const textOnly = (s: string) =>
  s
    .replace(/<[^>]{0,2000}>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;|&gt;/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 700);
export type Signal = {
  name: string;
  url: string;
  timestamp: string;
  status: string;
  items: { title: string; url: string }[];
  attention?: number;
  tone?: number;
};
export async function news(name = "US presidential election"): Promise<Signal> {
  const url =
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(name) +
    "&hl=en-US&gl=US&ceid=US:en";
  const xml = await bounded(url, 150000);
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .slice(0, 6)
    .map((m) => ({
      title: textOnly(m[1].match(/<title>([\s\S]*?)<\/title>/)?.[1] || ""),
      url:
        m[1].match(/<link>(https:[^<]+)<\/link>/)?.[1] ||
        "https://news.google.com",
    }));
  return {
    name: "Google News",
    url,
    timestamp: new Date().toISOString(),
    status: "available",
    items,
  };
}
export async function gdelt(): Promise<Signal> {
  const url =
    "https://api.gdeltproject.org/api/v2/doc/doc?query=US%20presidential%20election&mode=artlist&maxrecords=5&format=json&timespan=1d";
  const d = JSON.parse(await bounded(url));
  return {
    name: "GDELT",
    url,
    timestamp: new Date().toISOString(),
    status: "available",
    items: (d.articles || [])
      .slice(0, 5)
      .map((a: { title: string; url: string }) => ({
        title: textOnly(a.title),
        url: a.url,
      })),
  };
}
export async function bluesky(name: string): Promise<Signal> {
  const url =
    "https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?limit=5&q=" +
    encodeURIComponent(name);
  const d = JSON.parse(await bounded(url, 80000));
  return {
    name: "Bluesky",
    url,
    timestamp: new Date().toISOString(),
    status: "available",
    items: (d.posts || [])
      .slice(0, 5)
      .map((p: any) => ({
        title: textOnly(p.record?.text || ""),
        url:
          "https://bsky.app/profile/" +
          encodeURIComponent(p.author?.handle || "") +
          "/post/" +
          encodeURIComponent((p.uri || "").split("/").pop()),
      })),
  };
}
export async function reddit(name: string): Promise<Signal> {
  const url =
    "https://www.reddit.com/search.rss?q=" +
    encodeURIComponent(name) +
    "&limit=5";
  const s = await bounded(url);
  return {
    name: "Reddit RSS",
    url,
    timestamp: new Date().toISOString(),
    status: "available",
    items: [...s.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
      .slice(0, 5)
      .map((m) => ({
        title: textOnly(m[1].match(/<title>(.*?)<\/title>/)?.[1] || ""),
        url:
          m[1].match(/href="(https:[^"]+)"/)?.[1] || "https://www.reddit.com",
      })),
  };
}
export const xAdapter = {
  enabled: false,
  status: "disabled: paid API; not part of the free deployment",
};
