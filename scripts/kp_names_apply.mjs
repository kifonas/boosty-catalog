import { readFile, writeFile } from "node:fs/promises";
import { ENTITIES, KP_DESC } from "./lib/config.mjs";

const ents = JSON.parse(await readFile(ENTITIES, "utf8"));
let store = {};
try {
  store = JSON.parse(await readFile(KP_DESC, "utf8"));
} catch {}

const hasCyr = (s) => /[а-яё]/i.test(String(s || ""));

let applied = 0,
  skipped = 0;

for (const [id, e] of Object.entries(ents)) {
  if (e.kind !== "film" && e.kind !== "series") continue;
  if (e.kpId == null) continue;
  if (!/^Q\d+$/.test(id)) continue;
  if (e.locked === true || (Array.isArray(e.locked) && e.locked.includes("titleRu"))) {
    skipped++;
    continue;
  }
  const rec = store[(e.kind === "series" ? "series" : "film") + ":" + e.kpId];
  if (!rec || !hasCyr(rec.name)) {
    skipped++;
    continue;
  }
  const name = String(rec.name).trim();
  if (e.titleRu === name) continue;
  e.titleRu = name;
  e.sources = { ...(e.sources || {}), titleRu: "kp" };
  applied++;
}

await writeFile(ENTITIES, JSON.stringify(ents, null, 1));
console.log(`titles: applied ${applied}, skipped ${skipped}`);
