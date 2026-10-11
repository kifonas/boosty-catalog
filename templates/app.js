const TABS = [
  ["films", "Фильмы"],
  ["series", "Сериалы"],
  ["games", "Игры"],
  ["streams", "Стримы и прочее"],
];
const state = { tab: "films", q: "", sort: "default" };
let catalog = null;
let VER = "";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = (ts) => {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
};
const r1 = (n) => (typeof n === "number" ? (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, "") : String(n));

function badge(kind, label, value) {
  if (value == null) return "";
  return `<span class="badge ${kind}"><span class="lbl">${label}</span><span class="val">${r1(value)}</span></span>`;
}

function posterHtml(g) {
  const ph = esc((g.title || "?").replace(/[«»"']/g, "").slice(0, 1).toUpperCase());
  const src = g.poster ? `${esc(g.poster)}${g.poster.includes("?") ? "&" : "?"}v=${encodeURIComponent(VER)}` : "";
  const img = g.poster
    ? `<img loading="lazy" src="${src}" alt="${esc(g.title)}" onerror="this.parentNode.innerHTML='<span class=&quot;ph&quot;>${ph}</span>'">`
    : `<span class="ph">${ph}</span>`;
  const year = g.year ? `<span class="yearbadge">${g.year}</span>` : "";
  return `<div class="poster${g.fit ? " " + g.fit : ""}">${img}${year}</div>`;
}

function cardHtml(g) {
  const en = g.titleEn && g.titleEn !== g.title ? `<div class="title-en">${esc(g.titleEn)}</div>` : "";
  const badges = [
    badge("kp", "КИНОПОИСК", g.ratings.kinopoisk),
    badge("imdb", "IMDb", g.ratings.imdb),
  ].join("");
  return `<a class="card" data-id="${esc(g.id)}" href="#/g/${encodeURIComponent(g.id)}">
    ${posterHtml(g)}
    <div class="body">
      <h2 class="title">${esc(g.title)}</h2>
      ${en}
      <div class="badges">${badges || '<span class="badge none"></span>'}</div>
    </div>
  </a>`;
}

function streamRow(s) {
  const tag = s.kind === "other" ? "стрим" : s.kind;
  return `<div class="stream-row">
    <span class="tag">${esc(tag)}</span>
    <span class="st">${esc(s.title)}</span>
    <span class="dt">${fmtDate(s.date)}</span>
    <a class="chip${s.hasAccess === false ? " paid" : ""}" href="${esc(s.url)}" target="_blank" rel="noopener">Открыть</a>
  </div>`;
}

function latestDate(g) {
  if (g.posts && g.posts.length) return Math.max(...g.posts.map((p) => p.date || 0));
  return g.date || 0;
}

function sortList(list) {
  const arr = list.slice();
  const s = state.sort;
  if (s === "year") arr.sort((a, b) => (b.year || 0) - (a.year || 0) || (a.title || "").localeCompare(b.title || "", "ru"));
  else if (s === "title") arr.sort((a, b) => (a.title || "").localeCompare(b.title || "", "ru"));
  else if (s === "rating") arr.sort((a, b) => (b.ratings.kinopoisk || 0) - (a.ratings.kinopoisk || 0));
  else if (s === "imdb") arr.sort((a, b) => (b.ratings.imdb || 0) - (a.ratings.imdb || 0));
  else if (s === "default") arr.sort((a, b) => latestDate(b) - latestDate(a));
  return arr;
}

function matches(g) {
  if (!state.q) return true;
  const q = state.q.toLowerCase();
  return (g.title || "").toLowerCase().includes(q) || (g.titleEn || "").toLowerCase().includes(q) || (g.titleRu || "").toLowerCase().includes(q);
}

function routeId() {
  const h = location.hash.replace(/^#\/?/, "");
  const m = h.match(/^g\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : "";
}

function findGroup(id) {
  for (const k of ["films", "series", "games"]) {
    const g = (catalog[k] || []).find((x) => x.id === id);
    if (g) return g;
  }
  return null;
}

function postRow(p) {
  return `<a class="post-row" href="${esc(p.url)}" target="_blank" rel="noopener">
    <span class="pr-date">${fmtDate(p.date)}</span>
    <span class="pr-title">${esc(p.title || p.label)}</span>
  </a>`;
}

function kpHtml(g) {
  if (g.kind === "game" || !g.kpId) return "";
  const type = g.kind === "series" ? "series" : "film";
  return `<a class="kp-link" href="https://www.kinopoisk.ru/${type}/${g.kpId}/" target="_blank" rel="noopener">Страница на Кинопоиске &rarr;</a>`;
}

function detailHtml(g) {
  const en = g.titleEn && g.titleEn !== g.title ? `<div class="title-en">${esc(g.titleEn)}</div>` : "";
  const badgeList = [badge("kp", "КИНОПОИСК", g.ratings.kinopoisk), badge("imdb", "IMDb", g.ratings.imdb)].join("");
  const badges = badgeList ? `<div class="badges">${badgeList}</div>` : "";
  const poster = posterHtml(g).replace('<div class="poster', '<div class="detail-poster poster');
  const posts = (g.posts || []).slice().sort((a, b) => (a.date || 0) - (b.date || 0));
  return `<div class="detail">
    <a class="back" href="#/">&larr; Назад к каталогу</a>
    <div class="detail-head">
      ${poster}
      <div class="detail-info">
        <h1 class="detail-title">${esc(g.title)}</h1>
        ${en}
        ${badges}
        ${g.desc ? `<p class="detail-desc">${esc(g.desc)}</p>` : ""}
        ${kpHtml(g)}
      </div>
    </div>
    <div class="detail-posts">
      <h2 class="posts-head">Записи с Boosty (${posts.length})</h2>
      <div class="post-list">${posts.map(postRow).join("")}</div>
    </div>
  </div>`;
}

function renderTabs() {
  $("#tabs").innerHTML = TABS.map(([k, label]) => {
    const n = k === "streams" ? catalog.streams.length : catalog[k].length;
    return `<button class="tab${state.tab === k ? " active" : ""}" data-tab="${k}">${label}<span class="count">${n}</span></button>`;
  }).join("");
}

function render() {
  renderTabs();
  const grid = $("#grid");
  const empty = $("#empty");
  const rid = routeId();
  if (rid) {
    const g = findGroup(rid);
    if (g) {
      grid.className = "detail";
      grid.innerHTML = detailHtml(g);
      empty.hidden = true;
      return;
    }
  }
  if (state.tab === "streams") {
    grid.className = "streams-list";
    const list = catalog.streams.filter((s) => !state.q || s.title.toLowerCase().includes(state.q.toLowerCase()));
    if (state.sort === "default") list.sort((a, b) => (b.date || 0) - (a.date || 0));
    grid.innerHTML = list.map(streamRow).join("");
    empty.hidden = list.length > 0;
    return;
  }
  grid.className = "grid";
  const list = sortList(catalog[state.tab].filter(matches));
  grid.innerHTML = list.map(cardHtml).join("");
  empty.hidden = list.length > 0;
}

function wire() {
  $("#tabs").addEventListener("click", (e) => {
    const b = e.target.closest(".tab");
    if (!b) return;
    state.tab = b.dataset.tab;
    if (routeId()) location.hash = "#/"; else render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  $("#search").addEventListener("input", (e) => { state.q = e.target.value.trim(); if (routeId()) location.hash = "#/"; else render(); });
  $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; if (routeId()) location.hash = "#/"; else render(); });
  window.addEventListener("hashchange", () => { render(); window.scrollTo({ top: 0 }); });
  $("#grid").addEventListener("click", (e) => {
    if (e.target.closest("a")) return;
    const card = e.target.closest(".card");
    if (card && card.dataset.id) location.hash = "#/g/" + encodeURIComponent(card.dataset.id);
  });
}

fetch("catalog.json?v=" + Date.now(), { cache: "no-store" }).then((r) => r.json()).then((data) => {
  catalog = data;
  VER = data.generatedAt || "";
  $("#gen").textContent = new Date(data.generatedAt).toLocaleString("ru-RU");
  wire();
  render();
}).catch(() => {
  $("#grid").innerHTML = '<div class="empty">Не удалось загрузить каталог.</div>';
});
