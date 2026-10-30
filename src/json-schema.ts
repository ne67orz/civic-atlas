import { z } from "zod";

// Translate the subset used by our profile and narrative validators. Keep Zod as
// the final validator: Gemini does not enforce all string constraints.
export function jsonSchema(schema: z.ZodTypeAny): Record<string, any> {
  if (schema instanceof z.ZodEffects) return jsonSchema(schema.innerType());
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodDefault) return jsonSchema(schema._def.innerType);
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string,z.ZodTypeAny>;
    return {type:"object",properties:Object.fromEntries(Object.entries(shape).map(([key,value])=>[key,jsonSchema(value)])),required:Object.entries(shape).filter(([,value])=>!value.isOptional()).map(([key])=>key),additionalProperties:false};
  }
  if (schema instanceof z.ZodString) {
    const hints = schema._def.checks.map(check => {
      if(check.kind === "max") return `At most ${check.value} characters.`;
      if(check.kind === "min") return `At least ${check.value} characters.`;
      if(check.kind === "length") return `Exactly ${check.value} characters.`;
      if(check.kind === "regex") return `Must match ${check.regex.source}.`;
      if(check.kind === "url") return "An HTTPS URL.";
      return "";
    }).filter(Boolean);
    return {type:"string",...(hints.length?{description:hints.join(" ")}:{})};
  }
  if (schema instanceof z.ZodNumber) {
    const result:Record<string,any>={type:"number"};
    for(const check of schema._def.checks) {
      if(check.kind === "int") result.type="integer";
      if(check.kind === "min") result.minimum=check.value;
      if(check.kind === "max") result.maximum=check.value;
    }
    return result;
  }
  if (schema instanceof z.ZodBoolean) return {type:"boolean"};
  if (schema instanceof z.ZodEnum) return {type:"string",enum:schema.options};
  if (schema instanceof z.ZodTuple) {
    const items=schema.items.map((item:z.ZodTypeAny)=>jsonSchema(item));
    // Our ideology tuple has four identical numeric schemas.
    if (!items.every((item:unknown)=>JSON.stringify(item)===JSON.stringify(items[0]))) throw Error("Unsupported heterogeneous model tuple");
    return {type:"array",items:items[0],minItems:items.length,maxItems:items.length};
  }
  if (schema instanceof z.ZodArray) return {type:"array",items:jsonSchema(schema.element),...(schema._def.minLength?{minItems:schema._def.minLength.value}:{}),...(schema._def.maxLength?{maxItems:schema._def.maxLength.value}:{})};
  throw Error("Unsupported model response schema");
}
