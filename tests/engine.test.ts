import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { simulate, allocate, majority, summarize } from "../shared/engine";
import { STATES, DEFAULT_ENV } from "../shared/states";
import {
  ProfileSchema,
  InputSchema,
  type Input,
  type County,
} from "../shared/schema";
import { validNumbers } from "../shared/narrative";
import { encode, decode } from "../src/share";
export const counties = JSON.parse(
  readFileSync("public/data/counties.json", "utf8"),
) as County[];
const districts = JSON.parse(
  readFileSync("public/data/districts.json", "utf8"),
);
export const input: Input = {
  version: 1,
  dataVersion: "2024-v1",
  seed: 12345,
  environment: DEFAULT_ENV,
  narrative: "",
  candidates: ["Democratic", "Republican"].map((party, i) =>
    ProfileSchema.parse({
      name: i ? "Casey Reed" : "Jordan Ellis",
      party,
      bio: "Fictional adult candidate.",
      ideology: [0, 0, 0, 0],
      appeal: { education: 0, urban: 0, young: 0 },
      recognition: 1,
      favorability: 0,
      controversy: 0,
      homeState: "",
      isRealPublicFigure: false,
      sources: [],
    }),
  ),
};
describe("Election mechanics", () => {
  it("apportions 538 including DC three", () => {
    expect(STATES.reduce((a, s) => a + s.ev, 0)).toBe(538);
    expect(STATES.find((s) => s.abbr === "DC")?.ev).toBe(3);
  });
  it("requires 270 and leaves ties / pluralities contingent", () => {
    expect(majority([269, 269])).toBeNull();
    expect(majority([240, 230, 68])).toBeNull();
    expect(majority([270, 268])).toBe(0);
  });
  it("allocates ME and NE district splits separately", () => {
    const states = STATES.map((s) => summarize(s.abbr, [60, 40]));
    const splits = ["ME-1", "ME-2", "NE-1", "NE-2", "NE-3"].map((id) =>
      summarize(id, [40, 60]),
    );
    expect(allocate(states, splits, 2)).toEqual([533, 5]);
  });
  it("repeats identical seeds and preserves county/state/popular totals", () => {
    const r = simulate(input, counties, districts, 15);
    expect(simulate(input, counties, districts, 15)).toEqual(r);
    expect(r.ev.reduce((a, b) => a + b, 0)).toBe(538);
    for (const state of r.states) {
      for (let i = 0; i < 2; i++)
        expect(state.votes[i]).toBe(
          r.counties
            .filter(
              (c) => counties.find((x) => x.fips === c.id)?.state === state.id,
            )
            .reduce((a, c) => a + c.votes[i], 0),
        );
    }
    expect(r.popular.reduce((a, b) => a + b, 0)).toBe(
      r.counties.reduce((a, c) => a + c.turnout, 0),
    );
  });
  it("neutral matchup produces historically plausible swing-state margins", () => {
    const r = simulate(input, counties, districts, 10);
    for (const id of ["PA", "MI", "WI", "GA", "NC", "AZ", "NV"])
      expect(r.states.find((s) => s.id === id)!.margin).toBeLessThan(0.1);
    expect(r.flips).toBeLessThan(350);
  });
  it("multi-candidate draw allocates all electors and total probability", () => {
    const x = {
      ...input,
      candidates: [
        ...input.candidates,
        ProfileSchema.parse({
          ...input.candidates[0],
          name: "Taylor Lane",
          party: "Independent",
        }),
      ],
    };
    const r = simulate(x, counties, districts, 20);
    expect(r.ev.reduce((a, b) => a + b, 0)).toBe(538);
    expect(
      r.probabilities.reduce((a, b) => a + b, 0) + r.contingentProbability,
    ).toBeCloseTo(1);
  });
  it("rejects malformed model output and altered narrative numbers", () => {
    expect(
      ProfileSchema.safeParse({ ...input.candidates[0], recognition: 4 })
        .success,
    ).toBe(false);
    expect(
      ProfileSchema.safeParse({
        ...input.candidates[0],
        sources: ["javascript:alert(1)"],
      }).success,
    ).toBe(false);
    expect(validNumbers("PA margin 2.5%", "PA margin 1.5%")).toBe(false);
    expect(validNumbers("PA margin 1.5%", "PA margin 1.5%")).toBe(true);
  });
  it("shares without a key and replays identically", async () => {
    const encoded = await encode(input),
      restored = await decode(encoded);
    expect(restored).toEqual(input);
    expect(JSON.stringify(restored)).not.toContain("sk-or-");
    expect(simulate(restored, counties, districts, 2)).toEqual(
      simulate(input, counties, districts, 2),
    );
    expect(InputSchema.safeParse({ ...input, key: "secret" }).success).toBe(
      false,
    );
  });
});
