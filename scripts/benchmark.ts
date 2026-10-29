import { readFileSync, writeFileSync } from "node:fs";
import { simulate } from "../shared/engine";
import { ProfileSchema } from "../shared/schema";
import { DEFAULT_ENV } from "../shared/states";
const candidates = ["Democratic", "Republican"].map((party, i) =>
  ProfileSchema.parse({
    name: i ? "Casey Reed" : "Jordan Ellis",
    party,
    bio: "Fictional adult.",
    ideology: [0, 0, 0, 0],
    appeal: { education: 0, urban: 0, young: 0 },
    recognition: 1,
    favorability: 0,
    controversy: 0,
    homeState: "",
    isRealPublicFigure: false,
    sources: [],
  }),
);
const input = {
  version: 1 as const,
  dataVersion: "2024-v1" as const,
  seed: 12345,
  environment: DEFAULT_ENV,
  narrative: "",
  candidates,
};
const counties = JSON.parse(readFileSync("public/data/counties.json", "utf8")),
  districts = JSON.parse(readFileSync("public/data/districts.json", "utf8"));
const t = performance.now();
const result = simulate(input, counties, districts, 1000);
const report = {
  measuredAt: new Date().toISOString(),
  runtime: process.version,
  units: counties.length,
  trials: 1000,
  elapsedMs: Math.round(performance.now() - t),
  ev: result.ev,
  probabilities: result.probabilities,
  networkDuringSimulation: 0,
  kvDuringSimulation: 0,
};
console.log(report);
writeFileSync("public/data/benchmark.json", JSON.stringify(report, null, 2));
