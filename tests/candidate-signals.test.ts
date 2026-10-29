import { it, expect, vi, afterEach } from "vitest";
import { candidateSignals } from "../src/candidate-signals";
import { SIGNALS_VERSION } from "../shared/signals-version";
afterEach(() => vi.unstubAllGlobals());
it("bypasses browser cache and uses a versioned URL for fresh Wikipedia evidence", async () => {
  const value = { schemaVersion: SIGNALS_VERSION, publicFigure: true, persona: false, summary: "Biography", politicalEvidence: "Housing policy", statuses: { wikipedia: "public figure" } };
  const fetch = vi.fn(async () => Response.json(value));
  vi.stubGlobal("fetch", fetch);
  expect(await candidateSignals("Zohran Mamdani", "token")).toEqual(value);
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("v=5"), expect.objectContaining({ cache: "no-store" }));
});
it("rejects the legacy available-but-unverified response instead of generating placeholders", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ publicFigure: false, summary: "Retrieved biography", statuses: { wikipedia: "available" } }));
  await expect(candidateSignals("Zohran Mamdani", "token")).rejects.toThrow("outdated or incomplete");
});
