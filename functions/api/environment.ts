import { DEFAULT_ENV } from "../../shared/states";
import {
  json,
  sameOrigin,
  read,
  write,
  news,
  gdelt,
  TTL,
  type Signal,
  type Bindings,
} from "../lib/core";
export const onRequestGet: PagesFunction<Bindings> = async (ctx) => {
  if (!sameOrigin(ctx.request))
    return json({ error: "Same-origin access only" }, 403);
  const entries = await Promise.all(
    ["news", "gdelt"].map((k) => read<Signal>(ctx.env.SIGNALS, "env:" + k)),
  );
  // One source refreshed per invocation. KV locks are best effort, not atomic.
  const stale = entries.findIndex(
    (x) => !x || Date.now() - Date.parse(x.timestamp) > TTL * 1000,
  );
  if (stale >= 0)
    ctx.waitUntil(
      (async () => {
        const key = ["news", "gdelt"][stale];
        if (await read(ctx.env.SIGNALS, "lock:" + key)) return;
        await write(ctx.env.SIGNALS, "lock:" + key, true, 60);
        try {
          const value = await (stale === 0 ? news() : gdelt());
          await write(ctx.env.SIGNALS, "env:" + key, value);
        } catch {
          /* preserve last good data */
        }
      })(),
    );
  const signals = entries.filter((x): x is Signal => !!x);
  // News volume is attention only. Approval, generic ballot and economy remain a labeled manual baseline.
  return json(
    {
      ...DEFAULT_ENV,
      mode: signals.length ? "cached" : "bundled",
      attention: signals.length
        ? Math.min(1, signals.reduce((a, x) => a + x.items.length, 0) / 12)
        : 0.5,
      sources: [
        ...DEFAULT_ENV.sources,
        ...["news", "gdelt"].map((key, i) =>
          entries[i]
            ? {
                name: entries[i]!.name,
                url: entries[i]!.url,
                timestamp: entries[i]!.timestamp,
                status:
                  Date.now() - Date.parse(entries[i]!.timestamp) > TTL * 1000
                    ? "stale; refreshing lazily"
                    : "cached",
              }
            : {
                name: key,
                url: i
                  ? "https://www.gdeltproject.org/"
                  : "https://news.google.com/",
                timestamp: DEFAULT_ENV.timestamp,
                status: "unavailable; bundled baseline",
              },
        ),
      ],
    },
    200,
    "public, max-age=1800",
  );
};
