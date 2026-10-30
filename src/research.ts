import { readFigure } from "../shared/figure";
export type Match = { id: string; name: string; description: string; entity: any };
async function bounded(url: string, cap = 1500000) {
  const res = await fetch(url, { credentials: "omit", signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw Error(`Public source returned HTTP ${res.status}. Try again shortly.`);
  const reader = res.body?.getReader();
  if (!reader) throw Error("Public source returned no content.");
  let text = "", size = 0;
  const decoder = new TextDecoder();
  try { while (true) { const {done, value} = await reader.read(); if(done) break; size += value.byteLength; if(size > cap) throw Error("Source response is too large."); text += decoder.decode(value,{stream:true}); } return text + decoder.decode(); }
  finally { await reader.cancel().catch(()=>{}); }
}
const api = (params: Record<string,string>) => "https://www.wikidata.org/w/api.php?" + new URLSearchParams({format:"json",origin:"*",...params});
export async function resolveFigures(name: string): Promise<Match[]> {
  const search = JSON.parse(await bounded(api({action:"wbsearchentities",search:name,language:"en",type:"item",limit:"6"})));
  if (search.error) throw Error(`Wikidata search is temporarily unavailable (${search.error.code || "API error"}). Please retry.`);
  const ids = (search.search || []).map((s:any)=>s.id).filter((id:string)=>/^Q\d+$/.test(id));
  if(!ids.length) return [];
  const data = JSON.parse(await bounded(api({action:"wbgetentities",ids:ids.join("|"),props:"labels|descriptions|aliases|claims|sitelinks",languages:"en",sitefilter:"enwiki"})));
  if (data.error) throw Error(`Wikidata records are temporarily unavailable (${data.error.code || "API error"}). Please retry.`);
  return ids.map((id:string)=>data.entities?.[id]).filter((e:any)=>e && e.sitelinks?.enwiki && (e.claims?.P31 || []).some((c:any)=> c.rank !== "deprecated" && ["Q5","Q95074","Q15632617","Q15711870","Q1569167","Q4271324","Q201662","Q61002","Q87189273","Q55155641"].includes(c.mainsnak?.datavalue?.value?.id))).map((entity:any)=>({id:entity.id,name:entity.labels?.en?.value || entity.id,description:entity.descriptions?.en?.value || "",entity}));
}
export function automaticMatch(matches: Match[], name:string) {
  if(matches.length===1) return matches[0];
  const exact = matches.filter(m=>[m.name,...(m.entity.aliases?.en || []).map((a:any)=>a.value)].some(n=>n.toLowerCase()===name.trim().toLowerCase()));
  return exact.length===1 && matches[0]===exact[0] ? exact[0] : undefined;
}
export async function researchFigure(match: Match) {
  const figure = await readFigure(match.name,bounded,match.entity);
  return {...figure, statuses:{wikipedia:figure.identityStatus}, timestamp:new Date().toISOString()};
}
