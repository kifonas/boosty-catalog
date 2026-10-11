import { readFile, writeFile } from "node:fs/promises";
import { ENTITIES, CONFLICTS } from "./lib/config.mjs";

const KEYWORDS = "фильм|мультфильм|игра|сериал|телесериал|кино|film|movie|tv|television|series|video game|novel|book|album|song|character|disambiguation|remake|animated";
const RE = new RegExp(`\\s*\\((?=[^)]*(?:1[89]\\d{2}|20\\d{2}|${KEYWORDS}))[^)]*\\)`, "gi");

const clean = (s) => {
  if (!s) return s;
  let out = String(s).replace(RE, " ").replace(/\s{2,}/g, " ").trim();
  return out || s;
};

const entities = JSON.parse(await readFile(ENTITIES, "utf8"));
let titles = 0, perBlog = 0, dropped = 0;
for (const ent of Object.values(entities)) {
  for (const f of ["titleRu", "titleEn"]) {
    const nv = clean(ent[f]);
    if (nv !== ent[f]) { ent[f] = nv; titles++; }
  }
  if (!ent.perBlog) continue;
  for (const slug of Object.keys(ent.perBlog)) {
    const ov = ent.perBlog[slug];
    for (const f of ["titleRu", "titleEn"]) {
      if (ov[f]) { const nv = clean(ov[f]); if (nv !== ov[f]) { ov[f] = nv; perBlog++; } }
    }
    for (const f of Object.keys(ov)) {
      if (["titleRu", "titleEn"].includes(f) && ov[f] === ent[f]) { delete ov[f]; dropped++; }
    }
    if (!Object.keys(ov).length) { delete ent.perBlog[slug]; }
  }
  if (!Object.keys(ent.perBlog).length) { delete ent.perBlog; }
}
await writeFile(ENTITIES, JSON.stringify(entities, null, 1), "utf8");

// refresh conflicts list (all perBlog entries are the remaining, deliberate exceptions)
const conflicts = JSON.parse(await readFile(CONFLICTS, "utf8").catch(() => "[]"));
const still = new Set([...Object.values(entities)].flatMap((e) => (e.perBlog ? Object.keys(e.perBlog).map((s) => Object.keys(e.perBlog[s]).map((f) => `${f}`)) : []).flat()));
const kept = [];
for (const c of conflicts) {
  const ent = entities[c.key];
  const ov = ent?.perBlog?.[Object.keys(ent.perBlog)[0]] || {};
  if (ov[c.field] !== undefined) kept.push(c);
}
await writeFile(CONFLICTS, JSON.stringify(kept, null, 1), "utf8");

const left = () => Object.entries(entities).filter(([, e]) => ["titleRu", "titleEn"].some((f) => e[f] && e[f].includes("(")));
console.log(`cleaned titles=${titles} perBlog=${perBlog} dropped=${dropped}; remaining parens=${left().length}`);
for (const [k, e] of left()) console.log("  ", k, e.titleRu, "|", e.titleEn);
console.log("conflicts left:", kept.length, kept.map((c) => `${c.key}.${c.field}`).join(", "));
