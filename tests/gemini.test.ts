import { it, expect, vi, afterEach } from "vitest";
import { z } from "zod";
import { geminiCompletion, GEMINI_MODELS } from "../src/gemini";
import { redact, saveKey, readKey } from "../src/openrouter";
afterEach(()=>vi.unstubAllGlobals());
it("uses Google only, sends credentials in a header, and validates JSON", async()=>{
  const fetch=vi.fn(async()=>Response.json({candidates:[{finishReason:"STOP",content:{parts:[{text:'{"answer":"sourced"}'}]}}]}));
  vi.stubGlobal("fetch",fetch);
  const budget={calls:0,max:2};
  expect(await geminiCompletion("test-key",GEMINI_MODELS,"System","Evidence",z.object({answer:z.string()}),budget)).toEqual({answer:"sourced"});
  expect(fetch.mock.calls[0]).toBeDefined();
  expect(budget.calls).toBe(1);
  const [url,init]=fetch.mock.calls[0] as unknown as [string,RequestInit];
  expect(url).toMatch(/^https:\/\/generativelanguage.googleapis.com\//);
  expect(url).not.toContain("test-key");
  expect(init.headers).toMatchObject({"x-goog-api-key":"test-key"});
  expect(JSON.parse(init.body as string).generationConfig.responseMimeType).toBe("application/json");
});
it("does not retry quota errors or silently fall back to paid models",async()=>{
  const fetch=vi.fn(async()=>new Response("",{status:429}));vi.stubGlobal("fetch",fetch);
  await expect(geminiCompletion("key",GEMINI_MODELS,"","",z.object({}),{calls:0,max:8})).rejects.toThrow("quota");
  expect(fetch).toHaveBeenCalledTimes(1);
  await expect(geminiCompletion("key",["gemini-paid-model"],"","",z.object({}),{calls:0,max:8})).rejects.toThrow("free-tier");
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("redacts Gemini credentials from errors",()=>expect(redact("failed AIzaabcdefghijklmnopqrstuvwxy1234567890")).toBe("failed [redacted]"));

it("keeps provider keys separate and forgets only the selected provider",()=>{
 const storage=()=>{const values=new Map<string,string>();return {getItem:(k:string)=>values.get(k)||null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)};};
 vi.stubGlobal("sessionStorage",storage());vi.stubGlobal("localStorage",storage());
 saveKey("router-key",false,"openrouter");saveKey("google-key",false,"gemini");
 expect(readKey("openrouter")).toBe("router-key");expect(readKey("gemini")).toBe("google-key");
 saveKey("",false,"gemini");expect(readKey("gemini")).toBe("");expect(readKey("openrouter")).toBe("router-key");
});
it("sends the full profile schema including numeric bounds, tuple size and required fields",async()=>{
 const {ProfileSchema}=await import("../shared/schema");
 const schema=ProfileSchema.extend({politicalSummary:z.string().min(20).max(2400),politicalConfidence:z.enum(["low","medium","high"])});
 const profile={name:"Example Candidate",party:"Independent",label:"",bio:"Public biography",ideology:[0,0,0,0],appeal:{education:0,urban:0,young:0},recognition:0.5,favorability:0,controversy:0,homeState:"",isRealPublicFigure:true,sources:[],politicalSummary:"Evidence supports a cautious assessment.",politicalConfidence:"low"};
 const fetch=vi.fn(async()=>Response.json({candidates:[{finishReason:"STOP",content:{parts:[{text:JSON.stringify(profile)}]}}]}));vi.stubGlobal("fetch",fetch);
 expect(await geminiCompletion("key",GEMINI_MODELS,"","",schema,{calls:0,max:2})).toEqual(profile);
 const [,init]=fetch.mock.calls[0] as unknown as [string,RequestInit];
 const contract=JSON.parse(init.body as string).generationConfig.responseJsonSchema;
 expect(contract.required).toContain("politicalSummary");
 expect(contract.properties.ideology).toMatchObject({type:"array",minItems:4,maxItems:4,items:{minimum:-1,maximum:1}});
 expect(contract.properties.bio.description).toContain("1200");
 expect(contract.additionalProperties).toBe(false);
});
it("repairs with specific validation feedback rather than repeating the same prompt",async()=>{
 const bodies:any[]=[];
 vi.stubGlobal("fetch",async(_url:string,init:RequestInit)=>{
   bodies.push(JSON.parse(init.body as string));
   return Response.json({candidates:[{finishReason:"STOP",content:{parts:[{text:JSON.stringify({bio:bodies.length===1?"too long":"short"})}]}}]});
 });
 const budget={calls:0,max:2};
 expect(await geminiCompletion("key",GEMINI_MODELS,"","Evidence",z.object({bio:z.string().max(5)}),budget)).toEqual({bio:"short"});
 expect(bodies[1].contents[0].parts[0].text).toContain("bio:");
 expect(bodies[1].contents[0].parts[0].text).toContain("5 character");
 expect(budget.calls).toBe(2);
});
it("reports invalid fields after bounded repair attempts without weakening validation",async()=>{
 vi.stubGlobal("fetch",async()=>Response.json({candidates:[{finishReason:"STOP",content:{parts:[{text:'{"recognition":10}'}]}}]}));
 const budget={calls:0,max:2};
 await expect(geminiCompletion("key",GEMINI_MODELS,"","",z.object({recognition:z.number().max(1)}),budget)).rejects.toThrow("recognition:");
 expect(budget.calls).toBe(2);
});
