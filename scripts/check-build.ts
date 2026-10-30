import { readFile, readdir, stat } from "node:fs/promises";
import assert from "node:assert/strict";
const headers = await readFile("dist/_headers", "utf8");
for (const expected of [
  "default-src 'self'",
  "connect-src 'self' https://openrouter.ai",
  "https://generativelanguage.googleapis.com",
  "https://www.wikidata.org",
  "https://en.wikipedia.org",
  "script-src 'self' https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
])
  assert(headers.includes(expected));
let count = 0;
async function walk(dir: string) {
  for (const file of await readdir(dir)) {
    const path = dir + "/" + file,
      s = await stat(path);
    if (s.isDirectory()) await walk(path);
    else {
      count++;
      assert(s.size < 25 * 1024 * 1024, `Asset too large: ${path}`);
    }
  }
}
await walk("dist");
assert(count < 20000);
assert((await readFile("dist/_routes.json", "utf8")).includes("/api/*"));
for (const file of ["src/main.tsx", "src/pipeline.worker.ts"]) {
  const source = await readFile(file, "utf8");
  assert(
    !source.includes('Authorization'),
    "Local requests may not carry authorization",
  );
}
console.log(
  `CSP and static routes verified; ${count} assets, all under 25 MiB.`,
);
