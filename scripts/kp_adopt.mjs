import { readFile, writeFile } from "node:fs/promises";
import { ENTITIES, BLOGS_DIR, KP_DESC } from "./lib/config.mjs";
import { net } from "./lib/net.mjs";
import path from "node:path";

const KP_ID = process.argv[2];
const BLOG = process.argv[3];
const OLD_KEY = process.argv[4];
if (!KP_ID || !BLOG || !OLD_KEY) {
  console.error("usage: node kp_adopt.mjs <kpId> <blog> <oldKey>");
  process.exit(1);
}

const wd = await net.json(
  "https://www.wikidata.org/w/api.php?action=query&list=search&srsearch=" +
    encodeURIComponent(`haswbstatement:"P2603=${KP_ID}"`) +
    "&srnamespace=0&srlimit=5&format=json"
);
const hit = wd?.query?.search?.[0]?.title;
let newKey = null;
let wdEn = null;
let wdYear = null;
if (hit) {
  const ent = await net.json(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${hit}&props=labels|claims|sitelinks&languages=ru|en&sitefilter=ruwiki|enwiki&format=json`
  );
  const e = ent?.entities?.[hit];
  if (e) {
    newKey = hit;
    wdEn = e.labels?.en?.value || null;
    const times = (e.claims?.P577 || []).map((c) => c.mainsnak?.datavalue?.value?.time).filter(Boolean);
    const years = times.map((t) => Number(String(t).slice(1, 5))).filter((y) => y > 1800);
    if (years.length) wdYear = Math.min(...years);
  }
}

const store = JSON.parse(await readFile(KP_DESC, "utf8"));
const rec = store["film:" + KP_ID] || store["series:" + KP_ID] || {};
if (!newKey) newKey = "kp:" + KP_ID;

const widget = await net.text(`https://rating.kinopoisk.ru/${KP_ID}.xml`);
const kp = widget ? (widget.match(/<kp_rating[^>]*>([\d.]+)</) || [])[1] : null;
const imdb = widget ? (widget.match(/<imdb_rating[^>]*>([\d.]+)</) || [])[1] : null;

const ents = JSON.parse(await readFile(ENTITIES, "utf8"));
const old = ents[OLD_KEY] || {};
const entity = {
  kind: "film",
  qid: /^Q\d+$/.test(newKey) ? newKey : null,
  kpId: Number(KP_ID),
  titleRu: rec.name || old.titleRu || null,
  titleEn: wdEn || old.titleEn || null,
  year: wdYear || old.year || null,
  desc: rec.desc || old.desc || null,
  ratings: { kinopoisk: kp ? Number(kp) : null, imdb: imdb ? Number(imdb) : null, metacritic: null },
  posterFile: old.posterFile || null,
  sources: { titleRu: "kp", titleEn: "wiki", year: "wiki", desc: "kp", poster: "kp", ratings: "kp" },
};
delete ents[OLD_KEY];
ents[newKey] = { ...(ents[newKey] || {}), ...entity };

const mapPath = path.join(BLOGS_DIR, BLOG, "map.json");
const map = JSON.parse(await readFile(mapPath, "utf8"));
let moved = 0;
for (const entry of Object.values(map)) {
  if ((entry.keys || []).includes(OLD_KEY)) {
    entry.keys = entry.keys.map((k) => (k === OLD_KEY ? newKey : k));
    moved++;
  }
}

await writeFile(ENTITIES, JSON.stringify(ents, null, 1));
await writeFile(mapPath, JSON.stringify(map, null, 1));
console.log(JSON.stringify({ kpId: KP_ID, oldKey: OLD_KEY, newKey, moved, titleRu: entity.titleRu, kp: entity.ratings.kinopoisk, imdb: entity.ratings.imdb, descLen: String(entity.desc || "").length }));
