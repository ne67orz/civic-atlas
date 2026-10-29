import { lookupFigure } from "../lib/figure";
import { Name } from "../../shared/schema";
import {
  json,
  sameOrigin,
  bounded,
  read,
  write,
  news,
  bluesky,
  TTL,
  type Bindings,
} from "../lib/core";
export const onRequestGet: PagesFunction<Bindings> = async (ctx) => {
  if (!sameOrigin(ctx.request))
    return json({ error: "Same-origin access only" }, 403);
  const parsed = Name.safeParse(
    new URL(ctx.request.url).searchParams.get("name"),
  );
  if (!parsed.success) return json({ error: "Invalid candidate name" }, 400);
  const token = ctx.request.headers.get("X-Turnstile-Token");
  if (!token || token.length > 2048 || !ctx.env.TURNSTILE_SECRET_KEY)
    return json(
      { error: "Bot verification unavailable. Profiles remain unverified." },
      503,
    );
  try {
    const check = JSON.parse(
      await bounded(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        12000,
        {
          method: "POST",
          body: new URLSearchParams({
            secret: ctx.env.TURNSTILE_SECRET_KEY,
            response: token,
          }),
        },
      ),
    );
    const host = new URL(ctx.request.url).hostname;
    const localTest =
      ["localhost", "127.0.0.1"].includes(host) &&
      ctx.env.TURNSTILE_SECRET_KEY === "1x0000000000000000000000000000000AA";
    if (
      !check.success ||
      (!localTest && (check.hostname !== host || check.action !== "candidate"))
    )
      return json({ error: "Bot verification failed" }, 403);
  } catch {
    return json({ error: "Bot verification unavailable" }, 503);
  }
  const name = parsed.data,
    key =
      "candidate:v3:" +
      Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(name.toLowerCase().normalize("NFKC")),
          ),
        ),
      )
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
  const cached = await read<{ timestamp: string }>(ctx.env.SIGNALS, key);
  if (cached && Date.now() - Date.parse(cached.timestamp) < TTL * 1000)
    return json(cached, 200, "private, max-age=10800");
  const sources: string[] = [],
    statuses: Record<string, string> = {};
  let figure = { resolvedName: name, summary: "", politicalEvidence: "", publicFigure: false, persona: false, minor: false, sources: [] as string[], identityStatus: "unavailable" };
  try {
    figure = await lookupFigure(name);
    sources.push(...figure.sources);
    statuses.wikipedia = figure.identityStatus;
  } catch (error) {
    statuses.wikipedia = error instanceof Error ? error.message : "unavailable";
  }
  const headlines = await news(name).catch(() => null),
    social = await bluesky(name).catch(() => null);
  if (headlines) sources.push(headlines.url);
  if (social) sources.push(social.url);
  let pageviews: number | null = null;
  try {
    const end = new Date(Date.now() - 2 * 86400000),
      start = new Date(end.getTime() - 7 * 86400000),
      fmt = (d: Date) => d.toISOString().slice(0, 10).replaceAll("-", "");
    const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(figure.resolvedName.replaceAll(" ", "_"))}/daily/${fmt(start)}/${fmt(end)}`;
    const d = JSON.parse(await bounded(url, 16000));
    pageviews =
      d.items?.reduce((a: number, x: { views: number }) => a + x.views, 0) ??
      null;
    sources.push(url);
    statuses.pageviews = "available";
  } catch {
    statuses.pageviews = "unavailable";
  }
  const value = {
    name,
    timestamp: new Date().toISOString(),
    ...figure,
    headlines: headlines?.items || [],
    social: social?.items || [],
    publicPostSampleCount: social?.items.length ?? null,
    pageviews,
    sources,
    statuses: {
      ...statuses,
      news: headlines ? "available" : "unavailable",
      bluesky: social ? "sample only" : "unavailable",
      reddit: "disabled: unreliable cloud access",
      x: "disabled: paid API",
    },
  };
  await write(ctx.env.SIGNALS, key, value);
  return json(value, 200, "private, max-age=10800");
};
