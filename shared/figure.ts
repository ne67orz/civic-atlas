

// Resolve encyclopedia redirects (including stage names) and use structured identity,
// rather than a list of occupations, to distinguish people from places and topics.
export async function readFigure(name: string, bounded: (url: string, cap: number) => Promise<string>, selectedEntity?: any) {
  const params = new URLSearchParams({ action: "query", format: "json", formatversion: "2", origin: "*", redirects: "1", prop: "extracts|pageprops", explaintext: "1", titles: selectedEntity?.sitelinks?.enwiki?.title || name });
  const data = JSON.parse(await bounded("https://en.wikipedia.org/w/api.php?" + params, 240000));
  const page = data.query?.pages?.[0];
  if (!page || page.missing || page.pageprops?.disambiguation !== undefined)
    throw Error("Name not found or ambiguous. Try the full name or a more specific Wikipedia title.");
  const id = page.pageprops?.wikibase_item;
  if (!/^Q\d+$/.test(id || "")) throw Error("No structured identity found.");
  if (selectedEntity && selectedEntity.id !== id) throw Error("Wikipedia identity does not match the selected person.");
  const entityData = selectedEntity ? null : JSON.parse(await bounded(`https://www.wikidata.org/wiki/Special:EntityData/${id}.json`, 500000));
  const entity = selectedEntity || entityData.entities?.[id];
  const claims = (property: string) => (entity?.claims?.[property] || []).filter((c: any) => c.rank !== "deprecated").map((c: any) => c.mainsnak?.datavalue?.value);
  const classes = claims("P31").map((v: any) => v?.id);
  const human = classes.includes("Q5");
  const description = String(entity?.descriptions?.en?.value || "");
  const persona = !human && (classes.some((c: string) => ["Q95074", "Q15632617", "Q15711870", "Q1569167", "Q4271324", "Q201662", "Q61002", "Q87189273", "Q55155641"].includes(c)) || /\b(fictional|character|persona|pseudonym|alter ego|vtuber)\b/i.test(description));
  const now = new Date();
  const cutoff = new Date(Date.UTC(now.getUTCFullYear() - 18, now.getUTCMonth(), now.getUTCDate()));
  const minor = human && claims("P569").some((v: any) => {
    const date = /^\+(\d{4})-(\d{2})-(\d{2})/.exec(v?.time || "");
    if (!date) return false;
    return Date.UTC(+date[1], Math.max(1, +date[2]) - 1, Math.max(1, +date[3])) > cutoff.getTime();
  });
  const article = String(page.extract || "");
  const political = article.split(/\n+/).filter((line: string) => /politic|ideolog|policy|policies|campaign|endors|election|socialis|capitalis|tax|housing|healthcare|abortion|immigra|foreign policy|civil rights|climate|conservativ|liberal|progressiv|libertarian|democra|republican/i.test(line));
  const url = "https://en.wikipedia.org/wiki/" + encodeURIComponent(String(page.title).replaceAll(" ", "_"));
  return {
    resolvedName: page.title as string,
    summary: article.slice(0, 3000),
    politicalEvidence: political.join("\n\n").slice(0, 14000),
    publicFigure: human && !minor,
    persona,
    minor,
    sources: [url, `https://www.wikidata.org/wiki/${id}`],
    identityStatus: minor ? "minor" : human ? "public figure" : persona ? "public persona" : "not a person or persona",
  };
}
