import { InputSchema, type Input } from "../shared/schema";
export async function encode(input: Input) {
  const clean = InputSchema.parse(input);
  const stream = new Blob([JSON.stringify(clean)])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
export async function decode(encoded: string) {
  if (encoded.length > 200000) throw Error("Result link is too large");
  const bytes = Uint8Array.from(
    atob(encoded.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );
  const reader = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"))
    .getReader();
  let size = 0,
    text = "";
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 150000) {
      await reader.cancel();
      throw Error("Result expands beyond the allowed size");
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return InputSchema.parse(JSON.parse(text));
}
export async function shareUrl(input: Input) {
  let data = await encode(input);
  if (data.length > 7800) data = await encode({ ...input, narrative: "" });
  if (data.length > 7800)
    throw Error(
      "This scenario is too large for a link. Download result JSON instead.",
    );
  return location.origin + location.pathname + "#result=" + data;
}
