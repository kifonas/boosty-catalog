import { BLOG } from "./config.mjs";

const GAME_NAMES = [
  "Mafia: Definitive Edition", "Mafia II", "Mafia III",
  "Resident Evil Requiem", "Resident Evil 7", "Resident Evil Village", "Resident Evil 4",
  "Resident Evil 3", "Resident Evil 2", "Resident Evil: Biohazard", "Resident Evil",
  "Grand Theft Auto: Vice City", "GTA: Vice City", "Grand Theft Auto", "GTA",
  "Detroit: Become Human", "Heavy Rain", "The Quarry", "Until Dawn",
  "The Dark Pictures Anthology", "Half-Life 2", "Half-Life",
  "RoboCop: Rogue City", "Contraband Police", "The Last of Us",
  "No, I’m not a Human", "No, I'm not a Human", "The Casting of Frank Stone",
  "Directive 8020", "007 First Light", "My Summer Car", "My winter car", "My Winter Car",
  "Euro Truck Simulator", "ETS2", "BeamNg", "BeamNG", "Minecraft", "Counter-Strike",
  "Дальнобойщики",
];
const SERIES_CANON = {
  supernatural: "Supernatural", "twin peaks": "Twin Peaks",
  sopranos: "The Sopranos", "the sopranos": "The Sopranos",
  "breaking bad": "Breaking Bad", "better call saul": "Better Call Saul",
  columbo: "Columbo", "бандитский петербург": "Бандитский Петербург",
  "game of thrones": "Game of Thrones", "игра престолов": "Игра престолов",
};
const OTHER_MARKERS = [
  "Киноаукцион", "Киноаук", "Земский Собор", "Земский собор",
  "ЗАПРЕЩЕНКА", "Ваши рабочие места",
];
const PREFIXES = [
  "Смотрим", "Смотрим:", "Проходим", "Продолжаем", "Начинаем", "Начали", "Играем в",
  "Запись стрима", "Трансляция", "Избранные серии", "Selected episodes",
  "VHS", "DVD-салон", "DVD салон", "Аналитика", "СТРИМ", "Стартует", "Старт", "START",
  "Новый сезон", "NEW SEASON", "Final", "ФИНАЛ", "Финал", "продолжаем",
];

const stripQuotes = (s) => s.replace(/[«»“”„]/g, '"').trim();
const clean = (s) => s.replace(/\s+/g, " ").replace(/^[\s\-–—+|.,]+|[\s\-–—+|.,]+$/g, "").trim();
const hasCyr = (s) => /[а-яё]/i.test(s);
const hasLat = (s) => /[a-z]/i.test(s);
const fixDash = (s) => s.replace(/\s*[–—]\s*/g, " - ");

function stripPrefixes(s) {
  let out = s;
  for (let i = 0; i < 4; i++) {
    let changed = false;
    for (const p of PREFIXES) {
      const re = new RegExp("^\\s*" + p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\s:.!-]*", "i");
      if (re.test(out)) { out = out.replace(re, ""); changed = true; }
    }
    if (!changed) break;
  }
  return clean(out);
}

function parseAntonpower(post) {
  const raw = stripQuotes(post.title || "");
  const base = { postId: post.id, rawTitle: post.title || "", date: post.publishTime };
  if (!raw) return { ...base, kind: "other", reason: "no-title" };

  const low = raw.toLowerCase();
  const otherMarker = OTHER_MARKERS.find((m) => low.includes(m.toLowerCase()));
  if (otherMarker) return { ...base, kind: "other", reason: "marker:" + otherMarker };

  // ---- Series ----
  const seasonEq = raw.match(/\bs\s?(\d{1,2})\s?e\s?(\d{1,2})\b/i);
  const knownSeries = Object.keys(SERIES_CANON).find((k) => low.includes(k));
  if (seasonEq || knownSeries) {
    let seriesName = knownSeries ? SERIES_CANON[knownSeries] : null;
    if (!seriesName) {
      let name = raw.split(/\bs\s?\d{1,2}\s?e\s?\d{1,2}\b/i)[0];
      name = stripPrefixes(name).replace(/"[^"]*"/g, " ");
      seriesName = clean(name);
    }
    return {
      ...base, kind: "series", seriesName,
      season: seasonEq ? Number(seasonEq[1]) : null,
      episode: seasonEq ? Number(seasonEq[2]) : null,
      reason: seasonEq ? "sXXeYY" : "known-series",
    };
  }

  // ---- Games ----
  let work = stripPrefixes(raw);
  const gameHit = GAME_NAMES.find((g) => raw.toLowerCase().includes(g.toLowerCase()));
  const streamWord = /\b(Стрим|Stream|Прохождение|Проходим|Играем)\b/i.test(raw);
  if (gameHit || streamWord || /№\s?\d|\bPart\b/i.test(raw) || /#[1-9]\b/.test(raw)) {
    let name = work
      .replace(/\b(Стрим|Stream|Прохождение|№\s?\d.*|#\s?\d.*|Stream\s?№?\s?\d.*)\b.*$/gi, " ")
      .replace(/\b(Final|ФИНАЛ|Финал|The Definitive Edition|Definitive Edition)\b/gi, " ");
    name = clean(name.replace(/\s*[+:,–-]\s*$/g, ""));
    return { ...base, kind: "game", gameName: gameHit || name || raw, reason: gameHit ? "game-name" : "stream-word" };
  }

  // ---- Films ----
  const yearM = raw.match(/\b(19\d{2}|20[0-2]\d)\b/);
  const quoted = [...raw.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (yearM || quoted.length) {
    let text = stripPrefixes(raw).replace(/\b(19\d{2}|20[0-2]\d)\b/g, " ").replace(/\b(US|JP|RU|DVD|VHS)\b/gi, " ");
    const inside = [...text.matchAll(/"([^"]+)"/g)].map((m) => clean(m[1]));
    const outside = clean(text.replace(/"[^"]*"/g, " ").replace(/\s*\((?:|)\)/g, " "));
    const allCand = [...inside, outside].filter(Boolean);
    const ru = allCand.find((c) => hasCyr(c)) || null;
    const en = allCand.find((c) => hasLat(c) && !hasCyr(c)) || allCand.find((c) => hasLat(c)) || null;
    return {
      ...base, kind: "film",
      titleRu: ru || clean(outside) || null,
      titleEn: en && en !== ru ? en : null,
      year: yearM ? Number(yearM[0]) : null,
      reason: yearM ? "year" : "quoted",
    };
  }

  return { ...base, kind: "other", reason: "no-signal" };
}

const hasWord = (low, w) => new RegExp(`(^|[^а-яёa-z0-9])${w}([^а-яёa-z0-9]|$)`).test(low);

const KUZMA_SERIES = [
  { re: /бандитский петербург[^а-яё]*адвокат/, name: "Бандитский Петербург: Адвокат" },
  { re: /бандитский петербург[^а-яё]*барон|бандитский петербург\s*\(барон\)/, name: "Бандитский Петербург: Барон" },
  { re: /бандитский петербург/, name: "Бандитский Петербург" },
  { re: /отчаянные домохозяйки/, name: "Отчаянные домохозяйки" },
  { re: /(^|[^а-яё])сопрано/, name: "Клан Сопрано" },
  { re: /(^|[^а-яё])прослушк/, name: "Прослушка" },
  { re: /(^|[^а-яё])братва([^а-яё]|$)/, name: "Братва" },
  { re: /(^|[^а-яё])бригад/, name: "Бригада" },
  { re: /охотник за разумом/, name: "Охотник за разумом" },
  { re: /настоящий детектив/, name: "Настоящий детектив" },
  { re: /южн(ый|ого) парк/, name: "Южный парк" },
  { re: /твин пикс/, name: "Твин Пикс" },
  { re: /(^|[^а-яё])рим([^а-яё]|$)/, name: "Рим" },
  { re: /клиник/, name: "Клиника" },
  { re: /h2o/, name: "H2O: Просто добавь воды" },
];

const KUZMA_GAMES = [
  "Euro Truck Simulator", "ETS2", "Дальнобойщик", "Земский Собор", "Земский собор",
  "BeamNG", "Майнкрафт", "Minecraft", "Grand Theft Auto", "GTA",
];

const KUZMA_OTHER = [
  "киномарафон", "киномесяц", "голосование", "выбираем новые фильмы",
  "что смотрим", "анонс", "записи киностримов", "снято", "роуд", "кузьма про",
  "в виде киноаука", "марафон по", "новый киномесяц", "начало киномарафона",
];

function stripKuzmaPrefixes(t) {
  let s = String(t || "").trim();
  const pat = /^(?:[Cc]?[СсCc][Мм][Оо][Тт][Рр][Ии][Мм]|[Cc]?[Фф][Ии][Лл][Ьь][Мм]|[Cc]?[Хx][/\-][Фф])(?:[:\s\-–—]+|$)/i;
  for (let i = 0; i < 4 && s; i++) {
    const n = s.replace(pat, "");
    if (n === s) break;
    s = n.trim();
  }
  return s;
}

function parseKuzma(post) {
  const base = { postId: post.id, rawTitle: post.title || "", date: post.publishTime };
  const raw = clean(stripQuotes(post.title || ""));
  if (!raw) return { ...base, kind: "other", reason: "no-title" };
  const low = raw.toLowerCase();

  const other = KUZMA_OTHER.find((m) => low.includes(m));
  if (other) return { ...base, kind: "other", reason: "marker:" + other };

  const game = KUZMA_GAMES.find((g) => low.includes(g.toLowerCase()));
  if (game) return { ...base, kind: "game", gameName: game, reason: "game-name" };

  const seasonM = raw.match(/(\d{1,2})\s*сезон/i);
  const epM = raw.match(/(\d{1,2})\s*сери[ийяю]/i);
  const seM = raw.match(/\bs\s?(\d{1,2})\s?e\s?(\d{1,2})\b/i);
  const known = KUZMA_SERIES.find((s) => s.re.test(low));

  if (seasonM || epM || seM || known) {
    let name = stripKuzmaPrefixes(raw);
    name = name.replace(/"[^"]*"/g, " ").replace(/\([^)]*\)/g, " ");
    name = name.replace(/^\s*\d{1,2}\s*сери[ийяю]\b[:\s\-–—]*/i, " ");
    name = name.replace(/\b\d{1,2}\s*сезон\b.*$/i, " ");
    name = name.replace(/[,\-–—+\s]*\d{1,2}(\s*[,+и–\-]\s*\d{1,2})*\s*сери[ийяю].*$/i, " ");
    name = name.replace(/\bs\s?\d{1,2}\s?e\s?\d{1,2}.*$/i, " ");
    name = clean(name);
    const season = seasonM ? Number(seasonM[1]) : seM ? Number(seM[1]) : null;
    const episode = seM ? Number(seM[2]) : epM ? Number(epM[1]) : null;
    return { ...base, kind: "series", seriesName: known ? known.name : name || raw, season, episode, reason: "kuzma-series" };
  }

  let t = stripKuzmaPrefixes(raw);
  const yearM = t.match(/\b(19\d{2}|20[0-2]\d)\b/);
  t = t.replace(/\([^)]*\)/g, " ").replace(/\b(19\d{2}|20[0-2]\d)\b\s*г?\.?/gi, " ");
  t = clean(t);
  return { ...base, kind: "film", titleRu: t || raw, titleEn: null, year: yearM ? Number(yearM[0]) : null, reason: "kuzma-film" };
}

const SNAIL_KP = [
  { re: /необычайн[а-яё]*\s+сильн[а-яё]*\s+сказк/, name: "Необычайно сильные сказки", kpId: 5509905 },
  { re: /обычн[а-яё]*\s+сказк/, name: "Обычные сказки", kpId: 467943 },
  { re: /(^|[^а-яё])днк([^а-яё]|$)/, name: "ДНК", kpId: 10180510 },
  { re: /пусть\s+говорят/, name: "Пусть говорят", kpId: 928982 },
  { re: /ждул/, name: "Ждули", kpId: 11611536 },
  { re: /кое[\s-]?что\s+в\s*1/, name: "Кое-что в 1 и 6", kpId: 5208553 },
  { re: /(^|[^а-яё])(мж|mj)([^а-яё]|$)|мужское\s*(и|\/)\s*женское|(^|[^а-яё])м\s+и\s+ж([^а-яё]|$)/, name: "MJ или МЖ", kpId: 5451177 },
];

const SNAIL_SERIES = [
  { re: /мама\s+в\s+16/, name: "Мама в 16" },
  { re: /беремен[а-яё]*\s+в\s+16/, name: "Беременна в 16" },
  { re: /беремен[а-яё]*\s+в\s+45/, name: "Беременна в 45" },
  { re: /четыре\s+свадьбы/, name: "Четыре свадьбы" },
  { re: /гадалк/, name: "Гадалка" },
  { re: /порча/, name: "Порча" },
  { re: /не\s+ври\s+мне/, name: "Не ври мне" },
  { re: /криминальная\s+россия/, name: "Криминальная Россия" },
  { re: /остров\b/, name: "Остров" },
  { re: /чадо\s+из\s+ада/, name: "Чадо из ада" },
  { re: /маменькин\s+сынок/, name: "Маменькин сынок" },
  { re: /особняк\s+милф/, name: "Особняк милф" },
  { re: /(^|[^а-яё])экс[ыа]([^а-яё]|$)/, name: "Эксы" },
  { re: /зв[её]зды\s+под\s+капельницей/, name: "Звёзды под капельницей" },
  { re: /слепая/, name: "Слепая" },
  { re: /детективы/, name: "Детективы" },
  { re: /один\s+за\s+всех/, name: "Один за всех" },
  { re: /неравный\s+брак/, name: "Неравный брак" },
  { re: /обмен\s+женами/, name: "Обмен женами" },
  { re: /супермама/, name: "Супермама" },
  { re: /вагитна/, name: "Вагитна у 16" },
  { re: /сказк[аиу]?\s+на\s+ноч/, name: "Сказки на ночь" },
  { re: /голые\s+и\s+напуганные/, name: "Голые и напуганные" },
  { re: /беремен[а-яё]*\s+по\s+обману/, name: "Беременна по обману" },
  { re: /фактор\s+страха/, name: "Фактор страха" },
  { re: /идущие\s+к\s+ч[её]рту/, name: "Идущие к чёрту" },
];

const SNAIL_OTHER = [
  /^с\s+наступающим/, /^с\s+праздником/, /^с\s+пасхой/, /^завтра\b/, /^скоро\b/,
  /^привет\b/, /^мне\s+\d+/, /болит\s+ушко/, /текстовые\s+посты/, /уровни\s+подписок/,
  /обновление\s+суммы/, /отпуск/, /я\s+вернулся/, /приболел/, /пиздунов/, /вайбовости/,
  /финал\s+страшных\s+сказок/, /боишься\s+сказок/, /^теги$/, /что\s+не\s+устраивает/,
  /^дед\s+запустил\s+стрим/, /^топ\s+10/, /^как\s+мы\s+анимэ/, /^всем\s+кто/,
  /^ну\s+что,\s+эксклюзив/, /^обновление$/, /джонни\s+депп/, /озвучка\s+snailkick/,
  /так\s+выглядит\s+озвученный/, /^я\s+немного/, /^контент\s+во\s+время/,
  /не\s+работает/, /озвуч/, /^продолжаем\b/, /^объявля/, /^анонс/, /^итоги/,
  /^розыгрыш/, /^важные\s+новости/,
  /^скоро\b/, /будет\s+только\s+стрим/, /^аукцион$/, /^аук\b/, /^расписание/,
];

const stripSnailPrefixes = (t) => {
  let s = String(t || "").trim();
  const pat = /^(?:[Сс][Мм][Оо][Тт][Рр][Ии][Мм][Аа]?[Ее]?[Мм]?|[Нн]ачинаем|[Ии]граем(?:\s+с\s+[^\s"]+)?(?:\s+в)?|[Ии]граю(?:\s+в)?|[Сс]мотрим)(?:[:\s\-–—]+|$)/i;
  for (let i = 0; i < 3 && s; i++) {
    const n = s.replace(pat, "");
    if (n === s) break;
    s = n.trim();
  }
  return s;
};

function titleCase(s) {
  return clean(String(s || "")).replace(/([A-Za-zА-Яа-яЁё])([A-Za-zА-Яа-яЁё'’]*)/g,
    (_, a, b) => a.toUpperCase() + b.toLowerCase());
}

function parseSnailkick(post) {
  const base = { postId: post.id, rawTitle: post.title || "", date: post.publishTime };
  const raw = clean(String(post.title || "").replace(/[«»“”„]/g, '"'));
  if (!raw) return { ...base, kind: "other", reason: "no-title" };
  const low = raw.toLowerCase();

  if (SNAIL_OTHER.some((re) => re.test(low))) return { ...base, kind: "other", reason: "marker" };

  // ---- games ----
  const gameM = raw.match(/играем(?:\s+с\s+[^\s"]+)?(?:\s+в)?\s*[:\-–—]?\s*(.+)$/i) || raw.match(/играю(?:\s+в)?\s*[:\-–—]?\s*(.+)$/i);
  if (gameM) {
    let name = gameM[1].replace(/"[^"]*"/g, (m) => m).trim();
    const q = name.match(/"([^"]+)"/);
    name = q ? q[1] : stripSnailPrefixes(name);
    name = clean(name.replace(/^(?:в|и|ч\.?|часть)\s+/i, "").replace(/\s+(?:часть|ч\.?)\s*\d+.*$/i, "").replace(/\s+\d+\s*ч\.?$/i, "").replace(/\s+с\s+\w+$/i, ""));
    if (name) return { ...base, kind: "game", gameName: titleCase(name), reason: "game" };
  }

  // ---- known shows with Kinopoisk id ----
  const kpShow = SNAIL_KP.find((s) => s.re.test(low));
  if (kpShow) return { ...base, kind: "series", seriesName: kpShow.name, kpId: kpShow.kpId, reason: "kp-show" };

  // ---- other recurring shows ----
  const show = SNAIL_SERIES.find((s) => s.re.test(low));
  if (show) return { ...base, kind: "series", seriesName: show.name, reason: "show" };

  const quotes = [...raw.matchAll(/"([^"]+)"/g)].map((m) => clean(m[1]));
  const inside = quotes.join(" ");
  const epRe = /(\d{1,2}\s*сезон|\d{1,2}\s*сери[яйю]|\d{1,2}\s*выпуск|выпуск\s*\d{1,2}|часть\s*\d|серия\s*\d|\d{1,2}\s*часть|финал)/i;
  if (epRe.test(raw)) {
    let name = (quotes.find((q) => epRe.test(q)) || inside || stripSnailPrefixes(raw))
      .replace(epRe, " ")
      .replace(/[|,.\-–—+\s]+$/g, "")
      .replace(/\s*\d{1,2}\s*$/g, "");
    name = clean(name.replace(/^[|,.\-–—+\s]+/g, ""));
    if (!name) name = clean(stripSnailPrefixes(raw).replace(epRe, " "));
    if (name) return { ...base, kind: "series", seriesName: name, reason: "episode" };
  }

  // ---- films ----
  let t = stripSnailPrefixes(raw);
  const yearM = t.match(/\b(19\d{2}|20[0-2]\d)\b/);
  if (yearM) t = t.replace(/\b(19\d{2}|20[0-2]\d)\b\s*(?:г\.?)?/gi, " ");
  const qm = t.match(/"([^"]+)"/);
  let name = qm ? clean(qm[1]) : clean(t);
  name = clean(name
    .replace(/\b(?:с|со)\s+(?:донатами|аукцион\w*|ауком)\b.*$/i, "")
    .replace(/\b(?:и|плюс)\s+(?:аукцион\w*|аук)\b.*$/i, "")
    .replace(/\+\s*(?:аукцион|аук).*$/i, "")
    .replace(/\b(?:и\s+это\s+прекрасно|и\s+маленько\s+хохочем|и\s+пугаемся|и\s+хохочем)\b.*$/i, "")
    .replace(/\s*\|.*$/, "")
    .replace(/\s*(?:серия|выпуск)\s*\d+.*$/i, ""));
  if (!name) return { ...base, kind: "other", reason: "no-signal" };
  const hasCyrName = hasCyr(name);
  return {
    ...base, kind: "film",
    titleRu: hasCyrName ? name : null,
    titleEn: hasCyrName ? null : name,
    year: yearM ? Number(yearM[0]) : null,
    quoted: Boolean(qm),
    reason: "film",
  };
}

export function parsePost(post) {
  if (BLOG === "kuzma671games") return parseKuzma(post);
  if (BLOG === "snailkick") return parseSnailkick(post);
  return parseAntonpower(post);
}
