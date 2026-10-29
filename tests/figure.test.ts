import { it, expect, vi, afterEach } from "vitest";
import { lookupFigure } from "../functions/lib/figure";
afterEach(() => vi.unstubAllGlobals());
const claim = (value: unknown) => ({ mainsnak: { datavalue: { value } } });
function upstream(page: unknown, claims: unknown) {
  vi.stubGlobal("fetch", async (url: string) => url.includes("wikipedia")
    ? Response.json({ query: { pages: [page] } })
    : Response.json({ entities: { Q123: { claims } } }));
}
it("follows the canonical identity and retrieves political passages beyond the introduction", async () => {
  upstream({ title: "Canonical Name", pageprops: { wikibase_item: "Q123" }, extract: "Biography.\n" + "Career details. ".repeat(300) + "\nIn 2020 their campaign proposed a housing policy." }, { P31: [claim({ id: "Q5" })] });
  const result = await lookupFigure("Stage Name");
  expect(result.publicFigure).toBe(true);
  expect(result.resolvedName).toBe("Canonical Name");
  expect(result.politicalEvidence).toContain("housing policy");
  expect(result.sources[0]).toContain("Canonical_Name");
});
it("does not confuse a place with a person", async () => {
  upstream({ title: "Paris", pageprops: { wikibase_item: "Q123" } }, { P31: [claim({ id: "Q515" })] });
  expect((await lookupFigure("Paris")).publicFigure).toBe(false);
});
it("labels a fictional persona separately from real public figures", async () => {
  upstream({ title: "Example Character", pageprops: { wikibase_item: "Q123" } }, { P31: [claim({ id: "Q95074" })] });
  const result = await lookupFigure("Example Character");
  expect(result.persona).toBe(true);
  expect(result.publicFigure).toBe(false);
});
it("does not silently pick an ambiguous name", async () => {
  upstream({ title: "Alex", pageprops: { disambiguation: "" } }, {});
  await expect(lookupFigure("Alex")).rejects.toThrow("ambiguous");
});
it("rejects a minor from structured birth evidence", async () => {
  upstream({ title: "Example", pageprops: { wikibase_item: "Q123" } }, { P31: [claim({ id: "Q5" })], P569: [claim({ time: "+2020-01-01T00:00:00Z" })] });
  const result = await lookupFigure("Example");
  expect(result.minor).toBe(true);
  expect(result.publicFigure).toBe(false);
});
it("allows recognizable persona names and disambiguated article titles", async () => {
  const { Name } = await import("../shared/schema");
  expect(Name.parse("R2-D2")).toBe("R2-D2");
  expect(Name.parse("John Smith (explorer)")).toBe("John Smith (explorer)");
});
