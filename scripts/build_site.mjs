import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { BLOG, SITE, TEMPLATES, ENTITIES, ASSET_NAMES, CDN_BASE, META, dataFile } from "./lib/config.mjs";

const readJson = async (p, d) => JSON.parse(await readFile(p, "utf8").catch(() => JSON.stringify(d)));
const entities = await readJson(ENTITIES, {});
const map = await readJson(dataFile("map.json"), {});
const rawPosts = await readJson(dataFile("posts.json"), []);
const assets = await readJson(ASSET_NAMES, {});
const metaById = new Map(rawPosts.map((p) => [p.id, p]));

const postUrl = (id) => `https://boosty.to/${BLOG}/posts/${id}`;

function postLabel(e) {
  const t = e.rawTitle || "";
  if (e.kind === "series") {
    const en = t.match(/s\s?\d{1,2}\s?e\s?\d{1,2}(\s*\+\s*s\s?\d{1,2}\s?e\s?\d{1,2})*/i);
    if (en) return en[0].replace(/\s+/g, "").toUpperCase();
    const ru = t.match(/(\d{1,2})\s*сезон\D{0,6}(\d{1,2})(?:\s*и\s*(\d{1,2}))?\s*сери/i);
    if (ru) return `S${ru[1]}E${ru[2]}${ru[3] ? "+" + ru[3] : ""}`;
    if (e.season && e.episode) return `S${e.season}E${e.episode}`;
    if (e.episode) return `Серия ${e.episode}`;
    if (e.season) return `Сезон ${e.season}`;
    return "Серия";
  }
  if (e.kind === "game") {
    const m = t.match(/[№#]\s?(\d+)/);
    const fin = /final|финал/i.test(t);
    if (m) return `Часть ${m[1]}${fin ? " · финал" : ""}`;
    if (fin) return "Финал";
    return "Стрим";
  }
  return "Просмотр";
}

const groups = { film: new Map(), series: new Map(), game: new Map() };
const streams = [];

for (const [postId, e] of Object.entries(map)) {
  const raw = metaById.get(postId);
  const base = {
    id: postId, label: postLabel(e),
    title: (raw?.title || "").trim() || postLabel(e),
    url: postUrl(postId), date: e.date,
    hasAccess: raw?.hasAccess ?? null,
  };
  if (!e.keys || !e.keys.length) {
    streams.push({ id: postId, kind: e.kind, title: (e.rawTitle || "").trim() || "(без названия)", url: base.url, date: e.date, hasAccess: base.hasAccess });
    continue;
  }
  for (const key of e.keys) {
    const ent = entities[key];
    if (!ent || !groups[ent.kind]) continue;
    const ov = ent.perBlog?.[BLOG] || {};
    const g = groups[ent.kind].get(key) || {
      id: key, kind: ent.kind,
      titleRu: null, titleEn: null, year: null, desc: null, poster: null, fit: null, kpId: null,
      ratings: { kinopoisk: null, imdb: null, metacritic: null }, posts: [],
    };
    g.titleRu = ov.titleRu ?? ent.titleRu ?? g.titleRu;
    g.titleEn = ov.titleEn ?? ent.titleEn ?? g.titleEn;
    g.year = ov.year ?? ent.year ?? g.year;
    g.desc = ov.desc ?? ent.desc ?? g.desc;
    g.fit = ov.fit ?? ent.fit ?? g.fit;
    g.kpId = ov.kpId ?? ent.kpId ?? g.kpId;
    for (const k of ["kinopoisk", "imdb", "metacritic"]) {
      const v = ov.ratings?.[k] !== undefined ? ov.ratings[k] : ent.ratings?.[k];
      if (g.ratings[k] == null && v != null) g.ratings[k] = v;
    }
    const pf = ov.posterFile || ent.posterFile;
    if (pf) g.poster = CDN_BASE + "posters/" + pf;
    g.posts.push({ ...base });
    groups[ent.kind].set(key, g);
  }
}

function finalize(map, sorter) {
  const arr = [...map.values()];
  for (const g of arr) {
    const seen = new Set();
    g.posts = g.posts.filter((p) => (seen.has(p.id) ? false : seen.add(p.id))).sort((a, b) => a.date - b.date);
    if (!g.poster) delete g.poster;
    if (g.fit == null) delete g.fit;
    if (g.kpId == null) delete g.kpId;
    g.title = g.titleRu || g.titleEn || g.id;
  }
  return arr.sort(sorter);
}

const byYear = (a, b) => (b.year || 0) - (a.year || 0) || a.title.localeCompare(b.title, "ru");
const byTitle = (a, b) => (a.title || "").localeCompare(b.title || "", "ru");
streams.sort((a, b) => b.date - a.date);

const catalog = {
  generatedAt: new Date().toISOString(),
  blog: BLOG,
  films: finalize(groups.film, byYear),
  series: finalize(groups.series, byTitle),
  games: finalize(groups.game, byTitle),
  streams,
};
for (const g of catalog.games) if (g.ratings.imdb == null) g.ratings.imdb = "N/A";

const tpl = (name) => readFile(path.join(TEMPLATES, name), "utf8");
let indexHtml = await tpl("index.html");
indexHtml = indexHtml
  .replaceAll("%TITLE%", META.title).replaceAll("%DESC%", META.desc)
  .replaceAll("%BRAND%", META.brand).replaceAll("%TAGLINE%", META.tagline)
  .replaceAll("%CSS%", CDN_BASE + "assets/" + assets.css)
  .replaceAll("%JS%", CDN_BASE + "assets/" + assets.js);

await mkdir(SITE, { recursive: true });
await writeFile(path.join(SITE, "catalog.json"), JSON.stringify(catalog), "utf8");
await writeFile(path.join(SITE, "index.html"), indexHtml, "utf8");

const noPoster = [...catalog.films, ...catalog.series, ...catalog.games].filter((g) => !g.poster).length;
console.log(`[${BLOG}] films=${catalog.films.length} series=${catalog.series.length} games=${catalog.games.length} streams=${catalog.streams.length} noPoster=${noPoster}`);
