import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readdir } from "node:fs/promises";
import { BLOGS_DIR } from "./lib/config.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const run = (file, blog) => {
  const r = spawnSync(process.execPath, [path.join(HERE, file)], {
    stdio: "inherit",
    env: { ...process.env, ...(blog ? { BOOSTY_BLOG: blog } : {}) },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run("assets.mjs");
const blogs = (await readdir(BLOGS_DIR, { withFileTypes: true }))
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
for (const blog of blogs) run("build_site.mjs", blog);
console.log("make: done");
