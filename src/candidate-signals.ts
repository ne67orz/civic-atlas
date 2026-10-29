import { z } from "zod";
import { SIGNALS_VERSION } from "../shared/signals-version";
const Signals = z.object({
  schemaVersion: z.literal(SIGNALS_VERSION),
  publicFigure: z.boolean(),
  persona: z.boolean(),
  summary: z.string(),
  politicalEvidence: z.string(),
  statuses: z.object({ wikipedia: z.string() }).passthrough(),
}).passthrough();
export async function candidateSignals(name: string, token: string) {
  const response = await fetch(`/api/candidate-signals?${new URLSearchParams({ name, v: String(SIGNALS_VERSION) })}`, {
    cache: "no-store",
    headers: { "X-Turnstile-Token": token },
    signal: AbortSignal.timeout(40000),
  });
  if (!response.ok) throw Error(`Live lookup failed for ${name} (HTTP ${response.status}). Check the Turnstile configuration and try again.`);
  const parsed = Signals.safeParse(await response.json());
  if (!parsed.success) throw Error("The lookup server returned an outdated or incomplete response. Deploy the latest frontend and Pages Functions together, then generate profiles again.");
  return parsed.data;
}
