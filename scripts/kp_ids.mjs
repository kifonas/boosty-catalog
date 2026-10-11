import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ENTITIES, ROOT } from "./lib/config.mjs";

const ents = JSON.parse(await readFile(ENTITIES, "utf8"));
const map = {};
for (const [gid, e] of Object.entries(ents)) {
  if (!e || (e.kind !== "film" && e.kind !== "series") || e.kpId == null) continue;
  const key = (e.kind === "series" ? "series" : "film") + ":" + e.kpId;
  (map[key] ||= []).push({ groupId: gid, title: e.titleRu || e.titleEn || gid, year: e.year || null });
}
const out = path.join(ROOT, "data", "kp_ids.json");
await writeFile(out, JSON.stringify(map, null, 1));
console.log("kp keys:", Object.keys(map).length);
