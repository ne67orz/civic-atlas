/// <reference lib="webworker" />
import { simulate, type District } from "../shared/engine";
import {
  InputSchema,
  ProfileSchema,
  NarrativeSchema,
  type County,
  type Profile,
} from "../shared/schema";
import { completion, MOCK, redact } from "./openrouter";
import {
  facts,
  validNumbers,
  fallbackNarrative,
  validateRecap,
} from "../shared/narrative";
self.onmessage = async ({ data }) => {
  try {
    if (data.type === "profiles") {
      const budget = { calls: 0, max: 8 };
      const profiles: Profile[] = [];
      for (const item of data.items) {
        if (
          /\b(minor|child|teenager|kill|rape|nude|sexual|genocide)\b/i.test(
            item.name + " " + item.label,
          )
        )
          throw Error(
            "Use adult public figures or neutral fictional candidates. Profiles describing minors or abusive content are not supported.",
          );
        const unknown = !item.signals?.publicFigure;
        const base: Profile = {
          name: item.name,
          party: item.party,
          label: item.label || "",
          bio: unknown
            ? "Hypothetical candidate. No verified public-figure source was retrieved."
            : "Profile based on retrieved public sources.",
          ideology:
            item.party === "Democratic"
              ? [-0.45, -0.45, 0, -0.1]
              : item.party === "Republican"
                ? [0.45, 0.45, 0.1, 0.2]
                : [0, 0, 0.2, 0],
          appeal: { education: 0, urban: 0, young: 0 },
          recognition: unknown ? 0.5 : 0.9,
          favorability: 0,
          controversy: 0,
          homeState: "",
          isRealPublicFigure: !unknown,
          sources: item.signals?.sources || [],
        };
        if (item.signals?.minor)
          throw Error("Profiles for minors are not supported.");
        // Unknown names remain explicitly fictional; never infer facts about private people.
        const profile =
          MOCK || unknown
            ? base
            : await completion(
                data.key,
                data.models,
                "Write a neutral profile of a verified adult public figure only, solely from the supplied evidence. No invented quotes, misconduct, scandals, private details, hateful or sexual content. Use the provided JSON keys exactly; ideology has four values in [-1,1], appeal values in [-1,1], recognition and controversy in [0,1], favorability in [-1,1]. Keep name and party unchanged.",
                JSON.stringify({
                  template: base,
                  evidence: `<untrusted_material>${JSON.stringify(item.signals)}</untrusted_material>`,
                }),
                ProfileSchema,
                budget,
              );
        profiles.push({
          ...profile,
          color: item.color,
          label: profile.label || "",
          name: item.name,
          party: item.party,
          sources: base.sources,
          isRealPublicFigure: !unknown,
        });
        self.postMessage({
          type: "progress",
          value: profiles.length / data.items.length,
        });
      }
      self.postMessage({ type: "profiles", profiles, calls: budget.calls });
    } else {
      const input = InputSchema.parse(data.input);
      const counties = (await fetch("/data/counties.json").then((r) =>
        r.json(),
      )) as County[];
      const districts = (await fetch("/data/districts.json").then((r) =>
        r.json(),
      )) as District[];
      const result = simulate(
        input,
        counties,
        districts,
        data.trials || 1000,
        (value) => self.postMessage({ type: "progress", value }),
      );
      let narrative =
          input.narrative && validateRecap(input.narrative, input, result)
            ? input.narrative
            : fallbackNarrative(input, result),
        warning = "";
      if (data.key && !MOCK && !input.narrative) {
        try {
          const evidence = facts(input, result),
            budget = { calls: 0, max: Math.min(2, data.remainingCalls ?? 2) };
          const n = await completion(
            data.key,
            data.models,
            "Write a neutral election-night recap and up to ten state blurbs as JSON {recap:string,states:[{state:string,text:string}]}. Recap must contain no numeric figures. Use only supplied facts, no new claims. Every state blurb may use only numbers supplied for that state.",
            evidence,
            NarrativeSchema,
            budget,
          );
          if (!validNumbers(n.recap, ""))
            throw Error("Narrative numbers failed validation");
          for (const row of n.states) {
            const line = evidence
              .split("\n")
              .find((l) => l.startsWith(row.state + ":"));
            if (!line || !validNumbers(row.text, line))
              throw Error("Narrative numbers failed validation");
          }
          narrative =
            n.recap +
            "\n\n" +
            n.states.map((s) => s.state + ": " + s.text).join("\n");
        } catch {
          warning =
            "AI recap unavailable or failed fact validation. Showing a deterministic recap.";
        }
      }
      self.postMessage({
        type: "result",
        result,
        input: { ...input, narrative },
        warning,
      });
    }
  } catch (e) {
    self.postMessage({
      type: "error",
      message:
        e instanceof Error
          ? redact(e.message)
          : "The pipeline could not complete. Check profiles and local data.",
    });
  }
};
