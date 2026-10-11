import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { ENTITIES, BLOGS_DIR } from "./lib/config.mjs";

const ents = JSON.parse(await readFile(ENTITIES, "utf8"));
const slugs = (await readdir(BLOGS_DIR)).filter((s) => s !== "snailkick.bak");
const used = new Set();
const perBlog = new Map();

for (const slug of slugs) {
  let map;
  try {
    map = JSON.parse(await readFile(path.join(BLOGS_DIR, slug, "map.json"), "utf8"));
  } catch {
    continue;
  }
  const mine = new Set();
  for (const entry of Object.values(map)) {
    for (const key of entry.keys || []) {
      used.add(key);
      mine.add(key);
    }
  }
  perBlog.set(slug, mine);
}

let removed = 0;
for (const key of Object.keys(ents)) {
  if (used.has(key)) continue;
  delete ents[key];
  removed++;
}

await writeFile(ENTITIES, JSON.stringify(ents, null, 1));
console.log(`orphans removed: ${removed}; entities left: ${Object.keys(ents).length}`);
for (const [slug, mine] of perBlog) console.log(`  ${slug}: ${mine.size} keys`);
