import { readFile, writeFile } from "node:fs/promises";
import { enrichAll } from "./lib/enrich.mjs";
import { ENTITIES, BLOG, dataFile } from "./lib/config.mjs";

const readJson = async (p, d) => JSON.parse(await readFile(p, "utf8").catch(() => JSON.stringify(d)));
const entities = await readJson(ENTITIES, {});
const map = await readJson(dataFile("map.json"), {});
const locked = [...Object.entries(entities)].filter(([, e]) => e.locked).map(([k]) => k);

// build resolution items for entities that have a Wikidata qid (network only for new/uncached ones)
const keys = new Set();
for (const e of Object.values(map)) for (const k of e.keys || []) keys.add(k);

const items = [];
for (const key of keys) {
  const ent = entities[key];
  if (!ent || ent.locked) continue;
  if (!ent.qid) continue; // synthetic entity - data is maintained manually in entities.json
  const [blog, postId] = (() => {
    for (const [k, e] of Object.entries(map)) if ((e.keys || []).includes(key)) return [BLOG, k];
    return [BLOG, null];
  })();
  items.push({
    postId, kind: ent.kind, qid: ent.qid, key: ent.gkey || undefined, date: 0,
    titleRu: ent.titleRu, titleEn: ent.titleEn, rawTitle: ent.titleRu || ent.titleEn || "",
  });
}

const enriched = await enrichAll(items);
let updated = 0, added = 0, posters = 0;
const changedFields = {};
for (const r of enriched) {
  const key = r.key ? r.kind + ":" + r.key : r.qid;
  const ent = entities[key];
  if (!ent || ent.locked) continue;
  for (const f of ["titleRu", "titleEn", "year", "kpId", "desc"]) {
    const nv = f === "kpId" ? (r.ids?.kp != null ? Number(r.ids.kp) : null) : r[f] ?? null;
    if (nv == null || String(nv).trim() === "") continue;
    if (ent[f] == null || ent[f] === "") { ent[f] = nv; added++; changedFields[f] = (changedFields[f] || 0) + 1; }
    else if (ent.sources?.[f] === "wiki" && (f === "desc" || f === "titleRu")) {
      const better = f === "desc" ? !!r.desc : false;
      if (better) { ent[f] = nv; updated++; }
    }
  }
  for (const k of ["kinopoisk", "imdb"]) {
    if (ent.ratings[k] == null && r.ratings?.[k] != null) { ent.ratings[k] = r.ratings[k]; changedFields["ratings." + k] = (changedFields["ratings." + k] || 0) + 1; }
  }
  if (!ent.posterFile && r.posterUrl) { ent._needsPoster = r.posterUrl; posters++; }
}

await writeFile(ENTITIES, JSON.stringify(entities, null, 1), "utf8");
console.log(`[${BLOG}] entities ${Object.keys(entities).length} checked ${items.length} fields-added ${added} desc-upgraded ${updated} locked ${locked.length} posters-pending ${posters}`);
if (Object.keys(changedFields).length) console.log("changes:", JSON.stringify(changedFields));
