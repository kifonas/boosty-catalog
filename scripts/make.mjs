import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const run = (file, blog) => {
  const r = spawnSync(process.execPath, [path.join(HERE, file)], {
    stdio: "inherit",
    env: { ...process.env, ...(blog ? { BOOSTY_BLOG: blog } : {}) },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run("assets.mjs");
for (const blog of ["antonpower", "kuzma671games"]) run("build_site.mjs", blog);
console.log("make: done");
