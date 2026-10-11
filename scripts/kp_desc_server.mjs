import http from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { KP_DESC, ROOT } from "./lib/config.mjs";

const IDS = path.join(ROOT, "data", "kp_ids.json");
let store = {};
try { store = JSON.parse(await readFile(KP_DESC, "utf8")); } catch {}
let dirty = false;

async function flush() {
  if (!dirty) return;
  dirty = false;
  await writeFile(KP_DESC, JSON.stringify(store, null, 1));
}
setInterval(() => flush().catch(() => {}), 2000);
process.on("SIGINT", () => flush().catch(() => {}).finally(() => process.exit(0)));

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};
const json = (res, obj) => {
  res.writeHead(200, { ...cors, "content-type": "application/json" });
  res.end(JSON.stringify(obj));
};

const srv = http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  if (req.method === "POST" && url === "/save") {
    let body = "";
    for await (const c of req) body += c;
    try {
      const j = JSON.parse(body);
      for (const it of (Array.isArray(j) ? j : [j])) {
        if (it && it.key) { store[it.key] = { name: it.name || null, desc: it.desc || "" }; dirty = true; }
      }
    } catch {}
    return json(res, { count: Object.keys(store).length });
  }
  let keys = [];
  try { keys = Object.keys(JSON.parse(await readFile(IDS, "utf8"))); } catch {}
  if (url === "/ids") return json(res, { keys });
  if (url === "/missing") {
    const missing = keys.filter((k) => !store[k] || !store[k].desc);
    return json(res, { missing: missing.length, keys: missing.slice(0, 60) });
  }
  await flush().catch(() => {});
  json(res, { count: Object.keys(store).length });
});
srv.listen(8123, "127.0.0.1", () => console.log("kp_desc_server http://127.0.0.1:8123 store", Object.keys(store).length));
