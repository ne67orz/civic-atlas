import { z } from "zod";
export const Name = z
  .string()
  .trim()
  .min(2)
  .max(70)
  .regex(
    /^[\p{L}\p{M}0-9 .,'’()\-]+$/u,
    "Use a name, not instructions or special characters",
  )
  .refine(
    (s) =>
      !/(ignore.*instructions|system prompt|developer message|override rules)/i.test(
        s,
      ),
    "Enter a candidate name, not model instructions",
  );
const unit = z.number().min(-1).max(1),
  fraction = z.number().min(0).max(1);
export const ProfileSchema = z
  .object({
    name: Name,
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    party: z.enum(["Democratic", "Republican", "Independent"]),
    label: z.string().max(60).default(""),
    bio: z.string().max(1200),
    ideology: z.tuple([unit, unit, unit, unit]),
    appeal: z.object({ education: unit, urban: unit, young: unit }).strict(),
    recognition: fraction,
    favorability: unit,
    controversy: fraction,
    homeState: z.string().regex(/^([A-Z]{2})?$/),
    isRealPublicFigure: z.boolean(),
    isPublicPersona: z.boolean().optional(),
    lookupStatus: z.string().max(500).optional(),
    politicalSummary: z.string().max(2400).optional(),
    politicalConfidence: z.enum(["low", "medium", "high"]).optional(),
    sources: z
      .array(
        z
          .string()
          .url()
          .refine((s) => s.startsWith("https://")),
      )
      .max(10),
  })
  .strict();
export type Profile = z.infer<typeof ProfileSchema>;
export const EnvironmentSchema = z
  .object({
    timestamp: z.string().datetime(),
    mode: z.enum(["live", "cached", "bundled", "neutral", "manual"]),
    approval: z.number().min(20).max(80),
    genericBallot: z.number().min(-15).max(15),
    economy: unit,
    salience: z.tuple([fraction, fraction, fraction, fraction]),
    attention: fraction,
    sources: z
      .array(
        z.object({
          name: z.string().max(100),
          url: z.string().url(),
          timestamp: z.string(),
          status: z.string().max(200),
        }),
      )
      .max(12),
  })
  .strict();
export type Environment = z.infer<typeof EnvironmentSchema>;
export const InputSchema = z
  .object({
    version: z.literal(1),
    dataVersion: z.literal("2024-v1"),
    candidates: z.array(ProfileSchema).min(2).max(6),
    environment: EnvironmentSchema,
    seed: z.number().int().min(0).max(4294967295),
    narrative: z.string().max(10000).default(""),
  })
  .strict()
  .refine(
    (x) =>
      new Set(x.candidates.map((c) => c.name.toLowerCase())).size ===
      x.candidates.length,
    "Candidate names must be distinct",
  )
  .refine(
    (x) => !/sk-or-|AIza[\w-]{20,}/.test(JSON.stringify(x)),
    "Credential-like text cannot be included in a scenario",
  );
export type Input = z.infer<typeof InputSchema>;
export type County = {
  fips: string;
  name: string;
  state: string;
  votes: number;
  dem: number;
  history?: number[];
  education: number;
  urban: number;
  young: number;
  income: number;
  white: number;
  region: number;
  dataQuality: string;
  district?: string;
};
export type State = {
  fips: string;
  abbr: string;
  name: string;
  ev: number;
  region: number;
};
export type VoteResult = {
  id: string;
  votes: number[];
  winner: number;
  margin: number;
  turnout: number;
};
export type Result = {
  counties: VoteResult[];
  states: VoteResult[];
  districts: VoteResult[];
  ev: number[];
  popular: number[];
  winner: number | null;
  tippingPoint: string | null;
  flips: number;
  probabilities: number[];
  stateOdds: Record<string, number[]>;
  contingentProbability: number;
  trials: number;
};
export const NarrativeSchema = z
  .object({
    recap: z.string().max(4000),
    states: z
      .array(
        z
          .object({ state: z.string().length(2), text: z.string().max(500) })
          .strict(),
      )
      .max(10),
  })
  .strict();
export const clamp = (n: number, a: number, b: number) =>
  Math.max(a, Math.min(b, n));
