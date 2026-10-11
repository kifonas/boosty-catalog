import { readFile, writeFile, access } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { net } from "./net.mjs";
import { dataFile, IMDB_GZ } from "./config.mjs";

const CACHE_PATH = dataFile("cache.json");

const FILM_TYPES = new Set([
  "Q11424", "Q202866", "Q24869", "Q24862", "Q93204", "Q29168811",
  "Q506240", "Q18011172", "Q17517379", "Q430525", "Q838795", "Q1146335",
]);
const SERIES_TYPES = new Set(["Q5398426", "Q15416", "Q526877", "Q581714", "Q1259759", "Q63952888", "Q1261214"]);
const GAME_TYPES = new Set(["Q7889", "Q865493", "Q160127", "Q7058673", "Q189118", "Q1051274", "Q1224999"]);
const TYPE_SETS = { film: FILM_TYPES, series: SERIES_TYPES, game: GAME_TYPES };

const wikiApi = (lang, params) => `https://${lang}.wikipedia.org/w/api.php?format=json&${new URLSearchParams(params)}`;
const wdApi = (params) => `https://www.wikidata.org/w/api.php?format=json&${new URLSearchParams(params)}`;

let cache = {};
export async function loadCache() {
  try { cache = JSON.parse(await readFile(CACHE_PATH, "utf8")); } catch { cache = {}; }
}
let dirty = 0;
async function flush(force = false) {
  dirty++;
  if (force || dirty % 5 === 0) await writeFile(CACHE_PATH, JSON.stringify(cache), "utf8");
}

const hasCyr = (s) => /[а-яё]/i.test(s || "");

const norm = (s) => String(s || "").toLowerCase().replace(/ё/g, "е")
  .replace(/\([^)]*\)/g, " ").replace(/[^a-zа-я0-9 ]+/gi, " ").replace(/\s+/g, " ").trim();
function nameScore(query, title) {
  const nq = norm(query), nt = norm(title);
  if (!nq || !nt) return 0;
  if (nq === nt) return 100;
  if (nt.startsWith(nq) || nq.startsWith(nt)) return 85;
  const qt = nq.split(" ").filter((w) => w.length > 1);
  const tt = nt.split(" ").filter((w) => w.length > 1);
  if (!qt.length) return 0;
  let hit = 0;
  for (const w of qt) {
    const stem = w.slice(0, Math.min(4, w.length));
    if (tt.some((x) => x.startsWith(stem))) hit++;
  }
  return Math.round((hit / qt.length) * 70);
}

async function searchRich(lang, query, limit = 8) {
  if (!query) return [];
  const url = wikiApi(lang, {
    action: "query", generator: "search", gsrsearch: query, gsrlimit: String(limit),
    prop: "pageprops|extracts|pageimages", ppprop: "wikibase_item",
    exintro: "1", explaintext: "1", exlimit: "max", piprop: "thumbnail|original", pithumbsize: "400", redirects: "1",
  });
  const d = await net.json(url);
  const pages = Object.values(d?.query?.pages || {});
  pages.sort((a, b) => (a.index ?? 1e9) - (b.index ?? 1e9));
  return pages.map((p) => ({
    wiki: lang, title: p.title, rank: p.index ?? null,
    qid: p.pageprops?.wikibase_item || null,
    extract: p.extract || null,
    image: p.thumbnail?.source || p.original?.source || null,
  }));
}

async function getEntities(ids) {
  const map = {};
  const uniq = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < uniq.length; i += 40) {
    const url = wdApi({ action: "wbgetentities", ids: uniq.slice(i, i + 40).join("|"), props: "claims|sitelinks" });
    const d = await net.json(url);
    Object.assign(map, d?.entities || {});
  }
  return map;
}

const claimValues = (ent, prop) => (ent?.claims?.[prop] || []).map((c) => c.mainsnak?.datavalue?.value).filter((v) => v != null);
const entityTypes = (ent) => claimValues(ent, "P31").map((v) => v.id).filter(Boolean);
function entityYear(ent) {
  const pick = (prop) => claimValues(ent, prop).map((v) => String(v.time || "").match(/^[+-]?(\d{4,})/)?.[1]).filter(Boolean).map(Number);
  const years = [pick("P577"), pick("P580"), pick("P571")].find((a) => a.length) || [];
  return years.length ? Math.min(...years) : null;
}
const firstString = (ent, prop) => { const v = claimValues(ent, prop)[0]; return typeof v === "string" ? v : null; };

async function wikiWikitext(lang, title) {
  if (!title) return null;
  const url = wikiApi(lang, { action: "query", prop: "revisions", rvprop: "content", rvslots: "main", titles: title, redirects: "1" });
  const d = await net.json(url);
  const p = Object.values(d?.query?.pages || {})[0];
  return p?.revisions?.[0]?.slots?.main?.["*"] || null;
}

async function restSummary(lang, title) {
  if (!title) return null;
  try {
    return await net.json(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`);
  } catch { return null; }
}

async function posterFallback(c) {
  const r = await restSummary("ru", c.titleRu);
  if (r?.thumbnail?.source) return r.thumbnail.source;
  if (r?.originalimage?.source) return r.originalimage.source;
  const e = await restSummary("en", c.titleEn);
  if (e?.thumbnail?.source) return e.thumbnail.source;
  if (e?.originalimage?.source) return e.originalimage.source;
  return null;
}

export function parseMetacritic(text) {
  if (!text) return null;
  const pats = [
    /metacritic\s*=\s*(\d{1,3})/i,
    /Metacritic[^.\n]{0,200}?(\d{1,3})\s*\/\s*100/i,
    /Metacritic[^.\n]{0,200}?(\d{1,3})\s*(?:out of|\u0438\u0437)\s*100/i,
    /Metacritic[^.\n]{0,200}?score of (\d{1,3})/i,
    /Metacritic[^.\n]{0,140}?(\d{1,3})\s*(?:\u0431\u0430\u043b\u043b|point)/i,
  ];
  for (const p of pats) {
    const m = text.match(p);
    if (m) { const n = Number(m[1]); if (n >= 1 && n <= 100) return n; }
  }
  return null;
}

async function kpWidget(kpId) {
  if (!kpId) return null;
  try {
    const txt = await net.text(`https://rating.kinopoisk.ru/${kpId}.xml`, { headers: { Accept: "application/xml,text/xml,*/*" } });
    const kp = txt?.match(/<kp_rating[^>]*>([\d.]+)<\/kp_rating>/)?.[1];
    const imdb = txt?.match(/<imdb_rating[^>]*>([\d.]+)<\/imdb_rating>/)?.[1];
    if (!kp && !imdb) return null;
    return { kinopoisk: kp ? Number(kp) : null, imdb: imdb ? Number(imdb) : null };
  } catch { return null; }
}

let imdbMap = null;
async function imdbRating(tconst) {
  if (!tconst) return null;
  if (!imdbMap) {
    try { await access(IMDB_GZ); }
    catch {
      try {
        const res = await fetch("https://datasets.imdbws.com/title.ratings.tsv.gz", { headers: { "User-Agent": "Mozilla/5.0" } });
        await writeFile(IMDB_GZ, Buffer.from(await res.arrayBuffer()));
      } catch { imdbMap = new Map(); return null; }
    }
    const raw = gunzipSync(await readFile(IMDB_GZ)).toString("utf8");
    imdbMap = new Map();
    for (const line of raw.split("\n")) { const [t, r] = line.split("\t"); if (t && r) imdbMap.set(t, Number(r)); }
  }
  return imdbMap.get(tconst) ?? null;
}

function queriesFor(item) {
  const q = [];
  const push = (wiki, query) => { if (query) q.push({ wiki, query }); };
  if (item.kind === "film") {
    const t = item.titleEn || item.titleRu;
    if (item.titleRu) push(hasCyr(item.titleRu) ? "ru" : "en", item.titleRu);
    if (item.titleEn) push("en", item.titleEn);
    if (t) push(hasCyr(t) ? "ru" : "en", `${t} ${hasCyr(t) ? "\u0444\u0438\u043b\u044c\u043c" : "film"}`);
    if (t && hasCyr(t)) push("ru", `${t} (\u0444\u0438\u043b\u044c\u043c)`);
    if (item.year) {
      if (t) push(hasCyr(t) ? "ru" : "en", `${t} ${item.year} ${hasCyr(t) ? "\u0444\u0438\u043b\u044c\u043c" : "film"}`);
    }
  } else if (item.kind === "series") {
    const n = item.seriesName;
    if (n) { push(hasCyr(n) ? "ru" : "en", n); push(hasCyr(n) ? "en" : "ru", n); }
  } else if (item.kind === "game") {
    if (item.gameName) { push(hasCyr(item.gameName) ? "ru" : "en", item.gameName); push(hasCyr(item.gameName) ? "en" : "ru", item.gameName); }
  }
  const seen = new Set();
  return q.filter((x) => { const k = x.wiki + "|" + x.query.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

const resolveKey = (item) => item.key ? `k:${item.kind}:${item.key}:${item.qid || ""}` : (item.qid ? `q:${item.qid}` : [item.kind, (item.titleRu || item.titleEn || item.seriesName || item.gameName || "").toLowerCase(), item.year || ""].join("~"));
const round = (n) => (n == null ? null : Number(n));

async function buildFromEntity(item, ent) {
  const ruTitle = ent.sitelinks?.ruwiki?.title || null;
  const enTitle = ent.sitelinks?.enwiki?.title || null;
  let desc = null, posterUrl = null;
  const rs = await restSummary("ru", ruTitle);
  if (rs) { desc = rs.extract || null; posterUrl = rs.thumbnail?.source || rs.originalimage?.source || null; }
  if (!desc || !posterUrl) {
    const es = await restSummary("en", enTitle);
    if (es) { desc = desc || es.extract || null; posterUrl = posterUrl || es.thumbnail?.source || es.originalimage?.source || null; }
  }
  const p18 = firstString(ent, "P18");
  if (!posterUrl && p18) posterUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(p18)}?width=500`;
  const kpId = firstString(ent, "P2603");
  const imdbId = firstString(ent, "P345");
  let kp = null, imdb = null;
  const w = await kpWidget(kpId);
  if (w) { kp = round(w.kinopoisk); imdb = round(w.imdb); }
  if (imdb == null && imdbId) imdb = round(await imdbRating(imdbId));
  const metacritic = null;
  const res = {
    resolved: true, qid: item.qid,
    titleRu: ruTitle || (hasCyr(item.titleRu || "") ? item.titleRu : null),
    titleEn: enTitle || item.titleEn || null,
    year: entityYear(ent) || item.year || null,
    desc, posterUrl,
    ratings: { kinopoisk: kp, imdb, metacritic },
    ids: { kp: kpId, imdb: imdbId },
  };
  if (item.fixTitle) {
    if (item.titleRu) res.titleRu = item.titleRu;
    if (item.titleEn != null) res.titleEn = item.titleEn || null;
  }
  if (item.key) res.key = item.key;
  return res;
}

async function resolveEntity(item) {
  const key = resolveKey(item);
  if (item.forceUnresolved) {
    const r = { resolved: false };
    cache[key] = r;
    await flush();
    return r;
  }
  if (cache[key]) {
    const c = cache[key];
    if (c.resolved && !c.posterUrl) {
      c.posterUrl = await posterFallback(c);
      await flush();
    }
    return c;
  }
  const want = TYPE_SETS[item.kind];
  const pageByQid = new Map();
  const nameQ = item.titleRu || item.titleEn || item.seriesName || item.gameName || "";
  let best = null;

  if (item.qid) {
    const ents = await getEntities([item.qid]);
    const ent = ents[item.qid];
    if (ent) {
      const res = await buildFromEntity(item, ent);
      cache[key] = res; await flush();
      return res;
    }
  }

  for (const { wiki, query } of queriesFor(item)) {
    const results = await searchRich(wiki, query);
    for (const r of results) if (r.qid) pageByQid.set(r.qid, r);
    const ents = await getEntities(results.map((r) => r.qid));
    let rank = 0;
    for (const r of results) {
      rank++;
      const ent = ents[r.qid];
      if (!ent) continue;
      if (!entityTypes(ent).some((t) => want.has(t))) continue;
      const yr = entityYear(ent);
      const diff = item.year && yr ? Math.abs(item.year - yr) : (item.year ? 3 : 0);
      if (item.year && yr && diff > 2) continue;
      const ns = nameScore(nameQ, r.title);
      const score = 100 - diff * 10 + (wiki === "ru" ? 1 : 0);
      const k = ns * 1000 + score;
      if (!best || k > best.k) best = { k, ns, score, rank, qid: r.qid, ent, year: yr };
    }
  }
  if (best && best.ns < 40 && best.rank > 1) best = null;

  if (!best) {
    const res = { resolved: false };
    cache[key] = res; await flush();
    return res;
  }

  const ent = best.ent;
  const ruTitle = ent.sitelinks?.ruwiki?.title || null;
  const enTitle = ent.sitelinks?.enwiki?.title || null;
  const kpId = firstString(ent, "P2603");
  const imdbId = firstString(ent, "P345");
  const p18 = firstString(ent, "P18");

  const ruPage = [...pageByQid.values()].find((p) => p.wiki === "ru" && p.qid === best.qid);
  const enPage = [...pageByQid.values()].find((p) => p.wiki === "en" && p.qid === best.qid);
  let desc = ruPage?.extract || enPage?.extract || null;
  let posterUrl = ruPage?.image || enPage?.image || null;
  if (!posterUrl && p18) posterUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(p18)}?width=500`;
  if (!posterUrl) posterUrl = await posterFallback({ titleRu: ruTitle, titleEn: enTitle });

  let kp = null, imdb = null;
  const w = await kpWidget(kpId);
  if (w) { kp = round(w.kinopoisk); imdb = round(w.imdb); }
  if (imdb == null && imdbId) imdb = round(await imdbRating(imdbId));

  let metacritic = parseMetacritic(enTitle ? await wikiWikitext("en", enTitle) : null);
  if (metacritic == null) metacritic = parseMetacritic(ruTitle ? await wikiWikitext("ru", ruTitle) : null);

  const res = {
    resolved: true, qid: best.qid,
    titleRu: ruTitle || (hasCyr(item.titleRu || "") ? item.titleRu : null),
    titleEn: enTitle || item.titleEn || null,
    year: best.year || item.year || null,
    desc, posterUrl,
    ratings: { kinopoisk: kp, imdb, metacritic },
    ids: { kp: kpId, imdb: imdbId },
  };
  cache[key] = res; await flush();
  return res;
}

export async function enrichAll(parsed) {
  await loadCache();
  const out = [];
  let i = 0;
  for (const item of parsed) {
    i++;
    if (item.kind === "other") { out.push({ ...item, resolved: false }); continue; }
    out.push({ ...item, ...(await resolveEntity(item)) });
    if (i % 25 === 0) process.stdout.write(`  enriched ${i}/${parsed.length}\n`);
  }
  await flush(true);
  return out;
}
