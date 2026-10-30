import { it, expect, vi, afterEach } from "vitest";
import { automaticMatch, resolveFigures, researchFigure, type Match } from "../src/research";
afterEach(()=>vi.unstubAllGlobals());
const entity=(id:string,name:string)=>({id,labels:{en:{value:name}},descriptions:{en:{value:"Public figure"}},sitelinks:{enwiki:{title:name}},claims:{P31:[{mainsnak:{datavalue:{value:{id:"Q5"}}}}]}});
it("asks for a choice between namesakes and recognizes a unique leading alias",()=>{
 const matches=[{id:"Q1",name:"Ye",description:"",entity:{aliases:{en:[{value:"Kanye West"}]}}},{id:"Q2",name:"Another",description:"",entity:{}}] as Match[];
 expect(automaticMatch(matches,"Kanye West")?.id).toBe("Q1");
 expect(automaticMatch(matches,"Unknown")).toBeUndefined();
});
it("searches Wikidata then reads the selected Wikipedia page without a key or Turnstile",async()=>{
 const e=entity("Q123","Example Person");
 const fetch=vi.fn(async(url:string)=>{
   if(url.includes("wbsearchentities")) return Response.json({search:[{id:"Q123"}]});
   if(url.includes("wbgetentities")) return Response.json({entities:{Q123:e}});
   return Response.json({query:{pages:[{title:"Example Person",pageprops:{wikibase_item:"Q123"},extract:"Biography.\nTheir campaign proposed housing policies."}]}});
 });vi.stubGlobal("fetch",fetch);
 const matches=await resolveFigures("Example");
 const result=await researchFigure(matches[0]);
 expect(result.publicFigure).toBe(true);
 expect(result.politicalEvidence).toContain("housing");
 expect(fetch).toHaveBeenCalledTimes(3);
 for(const [url] of fetch.mock.calls) expect(new URL(url).searchParams.get("origin")).toBe("*");
});
