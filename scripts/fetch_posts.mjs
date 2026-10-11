import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { BLOG, dataFile } from "./lib/config.mjs";

const OUT = dataFile("posts.json");
const LIMIT = Number(process.env.LIMIT || 50);
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  Accept: "application/json",
};

function buildUrl(offset) {
  const params = new URLSearchParams({
    limit: String(LIMIT),
    comments_limit: "0",
    reply_limit: "0",
  });
  if (offset) params.set("offset", offset);
  return `https://api.boosty.to/v1/blog/${BLOG}/post/?${params.toString()}`;
}

async function fetchJson(url, attempt = 1) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    if (attempt < 4) {
      await new Promise((r) => setTimeout(r, 800 * attempt));
      return fetchJson(url, attempt + 1);
    }
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

async function main() {
  const all = [];
  let offset = null;
  let page = 0;
  for (;;) {
    page++;
    const json = await fetchJson(buildUrl(offset));
    const batch = json.data || [];
    all.push(...batch);
    process.stdout.write(`page ${page}: +${batch.length} (total ${all.length})\n`);
    const extra = json.extra || {};
    if (extra.isLast || batch.length === 0) break;
    offset = extra.offset;
    if (!offset) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(all, null, 2), "utf8");
  process.stdout.write(`Saved ${all.length} posts -> ${OUT}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
