/// <reference lib="webworker" />
import { z } from "zod";
import { simulate, type District } from "../shared/engine";
import {
  InputSchema,
  ProfileSchema,
  NarrativeSchema,
  type County,
  type Profile,
} from "../shared/schema";
import { geminiCompletion } from "./gemini";
import { completion, MOCK, redact } from "./openrouter";
import {
  facts,
  validNumbers,
  fallbackNarrative,
  validateRecap,
} from "../shared/narrative";
self.onmessage = async ({ data }) => {
  try {
    const complete = data.provider === "gemini" ? geminiCompletion : completion;
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
        const unknown = !item.signals?.publicFigure && !item.signals?.persona;
        const base: Profile = {
          name: item.name,
          party: item.party,
          label: item.label || "",
          bio: unknown
            ? "Unverified profile. Identity verification did not complete. News or social links alone do not verify identity. These are editable simulation assumptions, not biographical facts. Enable live sources and generate profiles to retry verification."
            : String(item.signals?.summary || "Profile based on retrieved public sources.").slice(0, 1200),
          ideology: [0, 0, 0, 0],
          appeal: { education: 0, urban: 0, young: 0 },
          recognition: unknown ? 0.5 : 0.9,
          favorability: 0,
          controversy: 0,
          homeState: "",
          isRealPublicFigure: !!item.signals?.publicFigure,
          isPublicPersona: !!item.signals?.persona,
          lookupStatus: String(item.signals?.statuses?.wikipedia || "Live identity lookup was not run.").slice(0, 500),
          politicalSummary: !unknown && !data.key && item.signals?.politicalEvidence
            ? "Public sources were retrieved. Connect your AI provider and generate profiles again to summarize political ideals. Slider values have not yet been estimated."
            : "Political positions have not been established from retrieved evidence. Slider values are simulation assumptions.",
          politicalConfidence: "low",
          sources: item.signals?.sources || [],
        };
        if (item.signals?.minor)
          throw Error("Profiles for minors are not supported.");
        // Missing evidence does not establish that a person is fictional. Do not invent a biography.
        const profile =
          MOCK || unknown || !data.key
            ? base
            : await complete(
                data.key,
                data.models,
                "Write a neutral profile of the identified adult public figure or public persona solely from supplied evidence. For fictional personas, discuss only fictional/canonical positions and clearly label them; never attribute a persona’s views to its performer. No invented quotes, misconduct, scandals, private details, hateful or sexual content. Use the provided JSON keys exactly; ideology has four values in [-1,1], appeal values in [-1,1], recognition and controversy in [0,1], favorability in [-1,1]. Keep name and party unchanged; party is the user’s scenario choice, not evidence of actual beliefs. politicalSummary must describe documented political ideals and positions with source URLs from the supplied sources, noting dates, changes, conflicts and gaps; maximum 2400 characters. politicalConfidence is low, medium or high based on the available political evidence, not fame. Do not infer politics from occupation, identity, religion, popularity, headlines or social posts. Use politicalEvidence as the main basis. Ideology axes in order: economic left (-1) to right (+1), socially progressive (-1) to conservative (+1), establishment (-1) to populist (+1), dovish (-1) to hawkish (+1). Read the supplied Wikipedia biography and political passages, synthesize a clear conclusion about the candidate’s political outlook, and explain which documented positions support your assessment. You may draw reasonable, explicitly labeled inferences from those positions rather than only copying ideology labels. Explain these numeric estimates as simulation assumptions; use 0 for unsupported axes. If no relevant evidence exists, say political views are unknown, set all ideology axes to 0 and politicalConfidence to low. Do not invent policy positions or treat model memory as retrieved evidence.",
                JSON.stringify({
                  template: base,
                  evidence: `<untrusted_material>${JSON.stringify(item.signals)}</untrusted_material>`,
                }),
                ProfileSchema.extend({
                  politicalSummary: z.string().min(20).max(2400),
                  politicalConfidence: z.enum(["low", "medium", "high"]),
                }),
                budget,
              );
        profiles.push({
          ...profile,
          color: item.color,
          label: profile.label || "",
          name: item.name,
          party: item.party,
          sources: base.sources,
          isRealPublicFigure: !!item.signals?.publicFigure,
          isPublicPersona: !!item.signals?.persona,
          lookupStatus: String(item.signals?.statuses?.wikipedia || "Live identity lookup was not run.").slice(0, 500),
          ...(!item.signals?.politicalEvidence ? {
            ideology: [0, 0, 0, 0] as Profile["ideology"],
            politicalSummary: base.politicalSummary,
            politicalConfidence: "low" as const,
          } : {}),
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
          const n = await complete(
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
