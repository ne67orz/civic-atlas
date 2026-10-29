import { it, expect, vi, afterEach } from "vitest";
import { onRequestGet as environment } from "../functions/api/environment";
import { onRequestGet as candidate } from "../functions/api/candidate-signals";
import { bounded, write, read } from "../functions/lib/core";
afterEach(() => vi.unstubAllGlobals());
const kv = () => ({ get: vi.fn(async (_key: string) => null), put: vi.fn(async () => {}) });
it("environment refreshes at most one source with bounded operations and no LLM", async () => {
  const store = kv(),
    waits: Promise<unknown>[] = [];
  const fetch = vi.fn(
    async () =>
      new Response(
        "<rss><item><title>Election news</title><link>https://example.com/a</link></item></rss>",
      ),
  );
  vi.stubGlobal("fetch", fetch);
  const start = performance.now();
  const response = await (environment as any)({
    request: new Request("https://demo.pages.dev/api/environment"),
    env: { SIGNALS: store },
    waitUntil: (p: Promise<unknown>) => waits.push(p),
  });
  await Promise.all(waits);
  expect(response.status).toBe(200);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(store.get).toHaveBeenCalledTimes(3);
  expect(store.put).toHaveBeenCalledTimes(2);
  expect(performance.now() - start).toBeLessThan(200);
});
it("quota failures fail open and cross-origin requests are rejected", async () => {
  const broken = {
    get: () => Promise.reject(Error("quota")),
    put: () => Promise.reject(Error("quota")),
  };
  expect(await read(broken as any, "a")).toBeNull();
  await expect(write(broken as any, "a", 1)).resolves.toBeUndefined();
  const res = await (environment as any)({
    request: new Request("https://demo.pages.dev/api/environment", {
      headers: { Origin: "https://evil.test" },
    }),
  });
  expect(res.status).toBe(403);
});
it("candidate verifies token even on cache hits; cold upstream ceiling is six", async () => {
  const fetch = vi.fn(async (url: string) => {
    if (url.includes("siteverify"))
      return Response.json({
        success: true,
        hostname: "demo.pages.dev",
        action: "candidate",
      });
    if (url.includes("wikipedia")) return Response.json({ query: { pages: [{ title: "Test Candidate", pageprops: { wikibase_item: "Q123" }, extract: "Public figure" }] } });
    if (url.includes("wikidata")) return Response.json({ entities: { Q123: { claims: { P31: [{ mainsnak: { datavalue: { value: { id: "Q5" } } } }] } } } });
    if (url.includes("news.google")) return new Response("<rss/>");
    if (url.includes("bsky")) return Response.json({ posts: [] });
    return Response.json({ items: [] });
  });
  vi.stubGlobal("fetch", fetch);
  const store = kv();
  const response = await (candidate as any)({
    request: new Request(
      "https://demo.pages.dev/api/candidate-signals?name=Test%20Candidate",
      { headers: { "X-Turnstile-Token": "test" } },
    ),
    env: { SIGNALS: store, TURNSTILE_SECRET_KEY: "test" },
  });
  expect(response.status).toBe(200);
  expect(fetch).toHaveBeenCalledTimes(6);
  expect(store.put).toHaveBeenCalledTimes(1);
});
it("caps upstream bodies before parsing", async () => {
  vi.stubGlobal("fetch", async () => new Response("x".repeat(1000)));
  await expect(bounded("https://example.com", 500)).rejects.toThrow("cap");
});
it.each(["Mayor of New York City", "American rapper and record producer", "Internet personality", "Chess grandmaster"])("recognizes %s and bypasses older cached classifications", async (description) => {
  vi.stubGlobal("fetch", async (url: string) => {
    if (url.includes("siteverify")) return Response.json({ success: true, hostname: "demo.pages.dev", action: "candidate" });
    if (url.includes("wikipedia")) return Response.json({ query: { pages: [{ title: "Test Mayor", pageprops: { wikibase_item: "Q123" }, extract: "Public figure" }] } });
    if (url.includes("wikidata")) return Response.json({ entities: { Q123: { descriptions: { en: { value: description } }, claims: { P31: [{ mainsnak: { datavalue: { value: { id: "Q5" } } } }] } } } });
    if (url.includes("news.google")) return new Response("<rss/>");
    return Response.json({ posts: [], items: [] });
  });
  const store = kv();
  const response = await (candidate as any)({
    request: new Request("https://demo.pages.dev/api/candidate-signals?name=Test%20Mayor", { headers: { "X-Turnstile-Token": "test" } }),
    env: { SIGNALS: store, TURNSTILE_SECRET_KEY: "test" },
  });
  expect((await response.json()).publicFigure).toBe(true);
  expect(store.get.mock.calls[0][0]).toMatch(/^candidate:v3:/);
});
