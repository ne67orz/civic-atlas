import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { writeFile } from "node:fs/promises";
const out: Record<string, Record<string, number>> = {};
for (const [file, table] of [
  ["education", "B15003"],
  ["race", "B03002"],
  ["income", "B19013"],
  ["age", "B01001"],
]) {
  let headers: string[] = [];
  for await (const line of createInterface({
    input: createReadStream(`work/raw/${file}.dat`),
  })) {
    if (!headers.length) {
      headers = line.split("|");
      continue;
    }
    if (!line.startsWith("0500000US")) continue;
    const values = line.split("|"),
      id = values[0].slice(-5),
      r = Object.fromEntries(headers.map((h, i) => [h, Number(values[i])]));
    out[id] ??= {};
    if (table === "B15003")
      out[id].education =
        [22, 23, 24, 25].reduce((a, n) => a + r[`B15003_E0${n}`], 0) /
        r.B15003_E001;
    else if (table === "B03002") out[id].white = r.B03002_E003 / r.B03002_E001;
    else if (table === "B01001")
      out[id].young =
        [7, 8, 9, 10, 11, 12, 31, 32, 33, 34, 35, 36].reduce(
          (a, n) => a + r["B01001_E" + String(n).padStart(3, "0")],
          0,
        ) / r.B01001_E001;
    else out[id].income = Math.max(0, r.B19013_E001);
  }
}
await writeFile("public/data/acs-source.json", JSON.stringify(out));
console.log("ACS county records", Object.keys(out).length);
