import { readFile, writeFile, mkdir, readdir, copyFile, unlink } from "node:fs/promises";

import path from "node:path";
import crypto from "node:crypto";
import { ENTITIES, POSTER_STORE, ASSETS_REPO, TEMPLATES, ASSET_NAMES } from "./lib/config.mjs";

const h8 = (buf) => crypto.createHash("sha1").update(buf).digest("hex").slice(0, 8);
const readJson = async (p, d) => JSON.parse(await readFile(p, "utf8").catch(() => JSON.stringify(d)));

const entities = await readJson(ENTITIES, {});
const refs = new Set();
for (const e of Object.values(entities)) {
  if (e.posterFile) refs.add(e.posterFile);
  if (e.perBlog) for (const f of Object.values(e.perBlog)) if (f.posterFile) refs.add(f.posterFile);
}

const repoPosters = path.join(ASSETS_REPO, "posters");
const repoAssets = path.join(ASSETS_REPO, "assets");
await mkdir(repoPosters, { recursive: true });
await mkdir(repoAssets, { recursive: true });

const storeFiles = new Set(await readdir(POSTER_STORE));
let added = 0, removed = 0, missing = 0;
for (const f of refs) {
  if (!storeFiles.has(f)) { missing++; continue; }
  if ((await readdir(repoPosters)).includes(f)) continue;
  await copyFile(path.join(POSTER_STORE, f), path.join(repoPosters, f));
  added++;
}
const present = new Set(await readdir(repoPosters));
for (const f of present) {
  if (!refs.has(f)) { await unlink(path.join(repoPosters, f)); removed++; }
}

async function putAsset(file) {
  const buf = await readFile(path.join(TEMPLATES, file));
  const ext = file.endsWith(".js") ? "js" : "css";
  const base = file.replace(/\.[^.]+$/, "");
  const name = `${base}.${h8(buf)}.${ext}`;
  await writeFile(path.join(repoAssets, name), buf);
  return name;
}
const js = await putAsset("app.js");
const css = await putAsset("styles.css");
for (const f of await readdir(repoAssets)) {
  if (f !== js && f !== css) await unlink(path.join(repoAssets, f));
}
await writeFile(ASSET_NAMES, JSON.stringify({ js, css }, null, 1), "utf8");

console.log(`assets: posters +${added} -${removed} (missing ${missing}), js=${js} css=${css}`);
