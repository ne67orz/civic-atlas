import { it, expect, vi, afterEach } from "vitest";
import { completion } from "../src/openrouter";
vi.mock("../src/openrouter", () => ({ completion: vi.fn(), MOCK: false, redact: (s: string) => s }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
async function generate(signals: unknown, key = "") {
  vi.resetModules();
  const postMessage = vi.fn();
  const worker = { onmessage: undefined as any, postMessage };
  vi.stubGlobal("self", worker);
  await import("../src/pipeline.worker");
  await worker.onmessage({ data: { type: "profiles", key, models: ["openrouter/free"], items: [{ name: "Zohran Mamdani", party: "Democratic", label: "", signals }] } });
  return postMessage.mock.calls.find(([m]) => m.type === "profiles")![0];
}
it("missing sources produce unverified assumptions, never a claim that the person is fictional", async () => {
  const result = await generate(null);
  expect(result.profiles[0].bio).toContain("Unverified profile");
  expect(result.profiles[0].bio).not.toMatch(/hypothetical|fictional/i);
  expect(result.profiles[0].isRealPublicFigure).toBe(false);
  expect(result.profiles[0].ideology).toEqual([0, 0, 0, 0]);
  expect(result.calls).toBe(0);
});
it("preserves sourced political analysis and passes political excerpts to the model", async () => {
  vi.mocked(completion).mockImplementation(async (_k, _m, _s, prompt) => ({ ...JSON.parse(prompt).template, politicalSummary: "Documented housing policy; economic score is an estimate.", politicalConfidence: "medium", ideology: [-0.6, 0, 0, 0] }));
  const result = await generate({ publicFigure: true, politicalEvidence: "Campaign housing policy", sources: ["https://en.wikipedia.org/wiki/Example"] }, "test");
  expect(result.profiles[0].politicalConfidence).toBe("medium");
  expect(result.profiles[0].ideology[0]).toBe(-0.6);
  expect(vi.mocked(completion).mock.calls[0][3]).toContain("Campaign housing policy");
});
it("overrides unsupported model politics when political evidence is missing", async () => {
  vi.mocked(completion).mockImplementation(async (_k, _m, _s, prompt) => ({ ...JSON.parse(prompt).template, politicalSummary: "Invented position", politicalConfidence: "high", ideology: [1, 1, 1, 1] }));
  const result = await generate({ publicFigure: true, politicalEvidence: "", sources: [] }, "test");
  expect(result.profiles[0].politicalConfidence).toBe("low");
  expect(result.profiles[0].ideology).toEqual([0, 0, 0, 0]);
  expect(result.profiles[0].politicalSummary).not.toContain("Invented");
});

it("explains when identity and evidence succeeded but AI is not connected", async () => {
  const result = await generate({ publicFigure: true, politicalEvidence: "Documented campaign policies", sources: ["https://en.wikipedia.org/wiki/Example"] });
  expect(result.profiles[0].isRealPublicFigure).toBe(true);
  expect(result.profiles[0].politicalSummary).toContain("Connect your AI provider");
  expect(completion).not.toHaveBeenCalled();
});
