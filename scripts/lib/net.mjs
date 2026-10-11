const UA = "BoostyCatalogBot/1.0 (personal catalog; contact: antonpower catalog) Mozilla/5.0";

let active = 0;
const waiters = [];
const MAX = 1;
const MIN_SPACING = 750;
let lastStart = 0;
function acquire() {
  return new Promise((res) => {
    if (active < MAX) { active++; res(); }
    else waiters.push(res);
  });
}
function release() {
  const n = waiters.shift();
  if (n) n();
  else active--;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function throttle() {
  const now = Date.now();
  const wait = lastStart + MIN_SPACING - now;
  lastStart = now + Math.max(0, wait);
  if (wait > 0) await sleep(wait);
}

async function doFetch(url, { asJson, method, body, headers }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  let res;
  try {
    res = await fetch(url, {
      method,
      body,
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA,
        "Accept-Language": "ru,en;q=0.8",
        ...(asJson ? { Accept: "application/json" } : {}),
        ...headers,
      },
    });
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 404) return null;
  if (res.status === 429) {
    const e = new Error("HTTP 429");
    e.retryAfter = Number(res.headers.get("retry-after")) * 1000 || 0;
    throw e;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return asJson ? res.json() : res.text();
}

async function request(url, opt = {}, attempt = 1) {
  const full = { asJson: true, method: "GET", body: undefined, headers: {}, ...opt };
  await acquire();
  await throttle();
  let result, err;
  try {
    result = await doFetch(url, full);
  } catch (e) {
    err = e;
  } finally {
    release();
  }
  if (err) {
    if (attempt < 6) {
      const backoff = err.retryAfter || Math.min(3000, 500 * attempt * attempt);
      await sleep(backoff);
      return request(url, opt, attempt + 1);
    }
    throw err;
  }
  return result;
}

export const net = {
  json: (url, opt) => request(url, { ...opt, asJson: true }),
  text: (url, opt) => request(url, { ...opt, asJson: false }),
  sleep,
};
