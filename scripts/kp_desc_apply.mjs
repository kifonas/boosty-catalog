import { readFile, writeFile } from "node:fs/promises";
import { ENTITIES, KP_DESC } from "./lib/config.mjs";

const JUNK = /Подробная информация о (фильме|сериале|игре)/;
const store = JSON.parse(await readFile(KP_DESC, "utf8"));
const ents = JSON.parse(await readFile(ENTITIES, "utf8"));
let applied = 0, missing = 0, lockedSkip = 0;

for (const [gid, e] of Object.entries(ents)) {
  if (!e || (e.kind !== "film" && e.kind !== "series") || e.kpId == null) continue;
  const rec = store[(e.kind === "series" ? "series" : "film") + ":" + e.kpId];
  const desc = rec && rec.desc ? rec.desc.trim() : "";
  if (!desc || desc.length < 90 || JUNK.test(desc)) { missing++; continue; }
  if (e.locked === true || (Array.isArray(e.locked) && e.locked.includes("desc")) || e.sources?.desc === "manual") {
    lockedSkip++;
    continue;
  }
  if (e.desc !== desc) { e.desc = desc; applied++; }
  (e.sources ||= {}).desc = "kp";
}

await writeFile(ENTITIES, JSON.stringify(ents, null, 1));
console.log(`desc: applied ${applied}, no-kp-plot ${missing}, locked-skipped ${lockedSkip}`);
