import {
  clamp,
  type County,
  type Input,
  type Result,
  type VoteResult,
} from "../schema";
import { STATES } from "../states";
export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++)
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
export function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function normal(r: () => number) {
  return (
    Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r())
  );
}
export const majority = (ev: number[]) => {
  const i = ev.findIndex((x) => x >= 270);
  return i < 0 ? null : i;
};
export function summarize(id: string, votes: number[]): VoteResult {
  const order = votes
    .map((v, i) => ({ v, i }))
    .sort((a, b) => b.v - a.v || a.i - b.i);
  const turnout = votes.reduce((a, b) => a + b, 0);
  return {
    id,
    votes,
    winner: order[0].i,
    margin: (order[0].v - order[1].v) / Math.max(1, turnout),
    turnout,
  };
}
export function allocate(
  states: VoteResult[],
  districts: VoteResult[],
  n: number,
) {
  const ev = Array(n).fill(0);
  for (const s of STATES) {
    const row = states.find((v) => v.id === s.abbr);
    if (!row) throw Error("Missing state");
    ev[row.winner] += s.abbr === "ME" || s.abbr === "NE" ? 2 : s.ev;
  }
  for (const d of districts) ev[d.winner]++;
  if (ev.reduce((a, b) => a + b, 0) !== 538)
    throw Error("Invalid electoral allocation");
  return ev;
}
export type District = { id: string; dem: number; votes: number };
export function simulate(
  input: Input,
  counties: County[],
  districtData: District[],
  trials = 1000,
  progress?: (p: number) => void,
): Result {
  const candidates = input.candidates,
    n = candidates.length,
    env = input.environment,
    random = rng(input.seed);
  const stateIndex = new Map(STATES.map((s, i) => [s.abbr, i]));
  const base = new Float64Array(counties.length * n),
    direction = candidates.map((c) =>
      c.party === "Democratic"
        ? 1
        : c.party === "Republican"
          ? -1
          : -c.ideology[0] * 0.35,
    );
  for (let k = 0; k < counties.length; k++) {
    const c = counties[k],
      d = clamp(c.dem, 0.02, 0.98);
    for (let j = 0; j < n; j++) {
      const p = candidates[j];
      const prior =
        p.party === "Democratic"
          ? Math.log(d)
          : p.party === "Republican"
            ? Math.log(1 - d)
            : Math.log(0.025);
      const inferred = [0.5 - d, 0.5 - d, 0.3 - c.education, 0.1];
      const fit = -p.ideology.reduce(
        (a, v, k) => a + Math.abs(v - inferred[k]) * 0.15 * env.salience[k],
        0,
      );
      base[k * n + j] =
        prior +
        fit +
        p.favorability * 0.3 +
        (p.recognition - 1) * 0.5 -
        p.controversy * 0.25 +
        (p.homeState === c.state ? 0.08 : 0) +
        direction[j] *
          (env.genericBallot * 0.02 +
            env.economy * 0.04 +
            (env.approval - 50) * 0.001) +
        p.appeal.education * (c.education - 0.3) * 0.2 +
        p.appeal.urban * (c.urban - 0.5) * 0.2 +
        p.appeal.young * (c.young - 0.2) * 0.2;
    }
  }
  const wins = Array(n).fill(0),
    stateOdds: Record<string, number[]> = {},
    mainCounties: VoteResult[] = [];
  for (const s of STATES) stateOdds[s.abbr] = Array(n).fill(0);
  let main: Result | undefined,
    contingent = 0;
  for (let t = 0; t < trials; t++) {
    const national = normal(random) * 0.055,
      regions = Array.from({ length: 4 }, () => normal(random) * 0.035),
      stateErrors = STATES.map(() => normal(random) * 0.045),
      demographic = normal(random) * 0.04;
    const totals = STATES.map(() => Array(n).fill(0)),
      popular = Array(n).fill(0);
    let flips = 0;
    for (let k = 0; k < counties.length; k++) {
      const c = counties[k],
        si = stateIndex.get(c.state)!;
      const err =
        national +
        regions[c.region] +
        stateErrors[si] +
        demographic * (c.education - 0.3) +
        normal(random) * 0.025;
      const weights = new Float64Array(n);
      let sum = 0;
      for (let j = 0; j < n; j++) {
        weights[j] = Math.exp(base[k * n + j] + direction[j] * err);
        sum += weights[j];
      }
      // Allocate integer votes by largest remainders, preserving total turnout exactly.
      const turnout = Math.round(
        c.votes *
          clamp(1 + env.economy * 0.02 + normal(random) * 0.015, 0.8, 1.2),
      );
      const votes = Array.from(weights, (w) => Math.floor((w / sum) * turnout));
      let remainder = turnout - votes.reduce((a, b) => a + b, 0);
      const order = Array.from(weights, (w, j) => ({
        j,
        r: (w / sum) * turnout - votes[j],
      })).sort((a, b) => b.r - a.r);
      for (let q = 0; q < remainder; q++) votes[order[q].j]++;
      for (let j = 0; j < n; j++) {
        totals[si][j] += votes[j];
        popular[j] += votes[j];
      }
      if (t === 0) {
        const row = summarize(c.fips, votes);
        mainCounties.push(row);
        const historical = c.dem > 0.5 ? "Democratic" : "Republican";
        if (candidates[row.winner].party !== historical) flips++;
      }
    }
    const states = STATES.map((s, i) => summarize(s.abbr, totals[i]));
    // District priors use actual district returns; apply the same simulated statewide swing.
    const districts = districtData.map((d) => {
      const abbr = d.id.slice(0, 2),
        si = stateIndex.get(abbr)!;
      const stateCounties = counties.filter((c) => c.state === abbr);
      const historic =
        stateCounties.reduce((a, c) => a + c.dem * c.votes, 0) /
        stateCounties.reduce((a, c) => a + c.votes, 0);
      const sw = states[si].votes.map(
        (v, j) =>
          v /
          states[si].turnout /
          Math.max(
            0.015,
            candidates[j].party === "Democratic"
              ? historic
              : candidates[j].party === "Republican"
                ? 1 - historic
                : 0.025,
          ),
      );
      const weights = sw.map(
        (v, j) =>
          v *
          (candidates[j].party === "Democratic"
            ? d.dem
            : candidates[j].party === "Republican"
              ? 1 - d.dem
              : 0.025),
      );
      const sum = weights.reduce((a, b) => a + b, 0);
      return summarize(
        d.id,
        weights.map((w) => Math.round((w / sum) * d.votes)),
      );
    });
    const ev = allocate(states, districts, n),
      winner = majority(ev);
    if (winner === null) contingent++;
    else wins[winner]++;
    for (const s of states) stateOdds[s.id][s.winner]++;
    if (t === 0) {
      let acc = 0,
        tippingPoint: string | null = null;
      if (winner !== null) {
        const units = [
          ...states.map((s) => ({
            ...s,
            ev:
              s.id === "ME" || s.id === "NE"
                ? 2
                : STATES.find((x) => x.abbr === s.id)!.ev,
          })),
          ...districts.map((d) => ({ ...d, ev: 1 })),
        ];
        for (const s of units
          .filter((s) => s.winner === winner)
          .sort((a, b) => b.margin - a.margin)) {
          acc += s.ev;
          if (acc >= 270) {
            tippingPoint = s.id;
            break;
          }
        }
      }
      main = {
        counties: mainCounties,
        states,
        districts,
        ev,
        popular,
        winner,
        tippingPoint,
        flips,
        probabilities: [],
        stateOdds,
        contingentProbability: 0,
        trials,
      };
    }
    if (t % 25 === 0) progress?.(t / trials);
  }
  for (const s of STATES)
    stateOdds[s.abbr] = stateOdds[s.abbr].map((x) => x / trials);
  progress?.(1);
  return {
    ...main!,
    probabilities: wins.map((x) => x / trials),
    contingentProbability: contingent / trials,
  };
}
