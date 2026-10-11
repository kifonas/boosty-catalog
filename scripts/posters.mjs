import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { ENTITIES, POSTER_STORE } from "./lib/config.mjs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const force = process.argv.includes("--force");
const sanitize = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, "_");
const hash8 = (buf) => createHash("sha1").update(buf).digest("hex").slice(0, 8);

async function get(url) {
  for (let a = 1; a <= 3; a++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "image/*,*/*" }, signal: AbortSignal.timeout(20000) });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error("HTTP " + r.status);
      const ct = r.headers.get("content-type") || "";
      const buf = Buffer.from(await r.arrayBuffer());
      if (!ct.startsWith("image") || buf.length < 6000) return null;
      return { buf, ct };
    } catch {
      await new Promise((s) => setTimeout(s, 700 * a));
    }
  }
  return null;
}

function dims(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 8) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  if (buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP") {
    const w = buf.readUInt16LE(26) + 1, h = buf.readUInt16LE(28) + 1;
    return [w, h];
  }
  return [0, 0];
}

const KP = (id) => `https://st.kp.yandex.net/images/film_iphone/iphone360_${id}.jpg`;
async function steam(name) {
  try {
    const r = await fetch(`https://store.steampowered.com/api/storesearch/?cc=us&l=en&term=${encodeURIComponent(name)}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
    const id = (await r.json()).items?.[0]?.id;
    if (!id) return null;
    return [
      `https://steamcdn-a.akamaihd.net/steam/apps/${id}/library_600x900_2x.jpg`,
      `https://steamcdn-a.akamaihd.net/steam/apps/${id}/library_600x900.jpg`,
      `https://steamcdn-a.akamaihd.net/steam/apps/${id}/header.jpg`,
    ];
  } catch { return null; }
}
async function imdbSuggest(name) {
  try {
    const q = encodeURIComponent(name.trim());
    const r = await fetch(`https://v3.sg.media-imdb.com/suggestion/${q[0].toLowerCase()}/${q}.json`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
    return (await r.json()).d?.[0]?.i?.imageUrl || null;
  } catch { return null; }
}

const ents = JSON.parse(await readFile(ENTITIES, "utf8"));
await mkdir(POSTER_STORE, { recursive: true });
let added = 0, kept = 0, failed = 0;

for (const [gid, e] of Object.entries(ents)) {
  if (!e || !e.kind) continue;
  if (e.posterFile && !force) { kept++; continue; }
  if (e.locked === true || (Array.isArray(e.locked) && e.locked.includes("poster")) || e.sources?.poster === "manual") { kept++; continue; }

  const urls = [];
  if (e.kpId != null) urls.push(KP(e.kpId));
  if (e.kind === "game") urls.push(...((await steam(e.titleEn || e.titleRu)) || []));
  const sug = await imdbSuggest(e.titleEn || e.titleRu || gid);
  if (sug) urls.push(sug);

  let ok = null;
  for (const u of urls) { ok = await get(u); if (ok) break; if (e.kpId != null) break; }
  if (!ok) { failed++; console.log("no poster:", gid, e.titleRu || e.titleEn); continue; }

  const ext = ok.ct.includes("png") ? "png" : ok.ct.includes("webp") ? "webp" : "jpg";
  const file = `${sanitize(gid)}.${hash8(ok.buf)}.${ext}`;
  await writeFile(path.join(POSTER_STORE, file), ok.buf);
  if (e.posterFile && e.posterFile !== file) await unlink(path.join(POSTER_STORE, e.posterFile)).catch(() => {});
  const [w, h] = dims(ok.buf);
  e.posterFile = file;
  if (w && h && w / h > 1.2) e.fit = "contain"; else delete e.fit;
  (e.sources ||= {}).poster = e.kpId != null ? "kp" : e.kind === "game" ? "steam" : "imdb";
  added++;
  await new Promise((s) => setTimeout(s, 150));
}

await writeFile(ENTITIES, JSON.stringify(ents, null, 1));
console.log(`posters: added ${added}, kept ${kept}, failed ${failed}`);
