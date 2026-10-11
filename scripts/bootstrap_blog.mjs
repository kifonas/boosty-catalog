import { readFile, writeFile } from "node:fs/promises";
import { ENTITIES, BLOG, dataFile } from "./lib/config.mjs";
import { parsePost } from "./lib/parse.mjs";
import { enrichAll } from "./lib/enrich.mjs";

const hasCyr = (s) => /[а-яё]/i.test(s || "");
const LIMIT = Number(process.env.LIMIT || 0);

let posts = JSON.parse(await readFile(dataFile("posts.json"), "utf8"));
if (LIMIT) posts = posts.slice(0, LIMIT);

const ents = JSON.parse(await readFile(ENTITIES, "utf8").catch(() => "{}"));
const parsed = posts.map(parsePost);

// only films and games go through Wikipedia resolution; TV shows are grouped by name
const need = parsed.filter((p) => p.kind === "game" || (p.kind === "film" && (p.quoted || p.year)));
const resolved = await enrichAll(need);
const rById = new Map(resolved.map((r) => [r.postId, r]));

const map = {};
let created = 0, existing = 0, streams = 0;
const byKind = {};

for (const p of parsed) {
  byKind[p.kind] = (byKind[p.kind] || 0) + 1;
  const entry = { keys: [], kind: p.kind, rawTitle: p.rawTitle, season: p.season ?? null, episode: p.episode ?? null, date: p.date };
  if (p.kind === "other") { map[p.postId] = entry; streams++; continue; }

  let key = null, ent = null;
  if (p.kpId) {
    key = "kp:" + p.kpId;
    ent = { kind: "series", kpId: p.kpId, titleRu: p.seriesName, titleEn: null, year: null, desc: null,
            ratings: { kinopoisk: null, imdb: null, metacritic: null }, sources: { titleRu: "manual" } };
  } else {
    const r = rById.get(p.postId);
    if (r && (r.resolved && (r.qid || r.key))) {
      key = r.key ? r.kind + ":" + r.key : r.qid;
      ent = { kind: r.kind, qid: r.qid || null, kpId: r.ids && r.ids.kp != null ? Number(r.ids.kp) : null,
              titleRu: r.titleRu || p.titleRu || null, titleEn: r.titleEn || null, year: r.year || p.year || null,
              desc: r.desc || null, ratings: r.ratings || { kinopoisk: null, imdb: null, metacritic: null },
              sources: { titleRu: "wiki", titleEn: "wiki", year: "wikidata", desc: "wiki", ratings: "kp", poster: "wiki" } };
    } else {
      const name = p.seriesName || p.titleRu || p.gameName || p.titleEn;
      if (!name) { map[p.postId] = entry; streams++; continue; }
      key = p.kind + ":" + name;
      ent = { kind: p.kind,
              titleRu: p.kind === "game" ? (hasCyr(name) ? name : null) : name,
              titleEn: p.kind === "game" ? (hasCyr(name) ? null : name) : (p.titleEn || null),
              year: p.year || null, desc: null,
              ratings: { kinopoisk: null, imdb: null, metacritic: null }, sources: {} };
    }
  }

  entry.keys = [key];
  if (!ents[key]) { ents[key] = ent; created++; } else existing++;
  map[p.postId] = entry;
}

await writeFile(ENTITIES, JSON.stringify(ents, null, 1));
await writeFile(dataFile("map.json"), JSON.stringify(map, null, 1));
console.log(`[${BLOG}] posts ${posts.length}`, JSON.stringify(byKind));
console.log(`entities: new ${created}, existing ${existing}; streams ${streams}; map ${Object.keys(map).length}`);
