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
