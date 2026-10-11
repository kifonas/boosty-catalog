import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "..", ".."); // engine repo root
export const WORKSPACE = path.resolve(ROOT, ".."); // where the site/asset repos live
export const BLOG = process.env.BOOSTY_BLOG || "antonpower";
export const BLOGS_DIR = path.join(ROOT, "blogs");
export const DATA = path.join(BLOGS_DIR, BLOG);
export const SITE = path.join(WORKSPACE, `${BLOG}-boosty-catalog`);
export const TEMPLATES = path.join(ROOT, "templates");
export const ENTITIES = path.join(ROOT, "data", "entities.json");
export const POSTER_STORE = path.join(ROOT, "data", "posters");
export const CONFLICTS = path.join(ROOT, "data", "conflicts.json");
export const IMDB_GZ = path.join(ROOT, "data", "imdb_ratings.tsv.gz");
export const KP_DESC = path.join(ROOT, "data", "kp_descriptions.json");
export const ASSETS_REPO = path.join(WORKSPACE, "boosty-catalog-assets");
export const ASSET_NAMES = path.join(ROOT, "data", "assets.json");
export const CDN_BASE = "https://kifonas.github.io/boosty-catalog-assets/";
export const dataFile = (...p) => path.join(DATA, ...p);

export const BLOG_META = {
  antonpower: {
    title: 'Каталог Boosty Anton "Rock" Vlasov',
    brand: 'Каталог Boosty Anton "Rock" Vlasov',
    desc: 'Каталог фильмов, сериалов и игр из Boosty-блога Anton "Rock" Vlasov: постеры, оценки Кинопоиск/IMDb и ссылки на записи.',
    tagline:
      'Фильмы, сериалы и игры из <a href="https://boosty.to/antonpower" target="_blank" rel="noopener">Boosty</a> — с постерами, оценками и ссылками на записи просмотров.',
  },
  kuzma671games: {
    title: "Каталог Boosty Kuzma671",
    brand: "Каталог Boosty Kuzma671",
    desc: "Каталог фильмов, сериалов и игр из Boosty-блога Kuzma671: постеры, оценки Кинопоиск/IMDb и ссылки на записи.",
    tagline:
      'Фильмы, сериалы и игры из <a href="https://boosty.to/kuzma671games" target="_blank" rel="noopener">Boosty</a> — с постерами, оценками и ссылками на записи просмотров.',
  },
  snailkick: {
    title: "Каталог Boosty SNAILKICK",
    brand: "Каталог Boosty SNAILKICK",
    desc: "Каталог фильмов, сериалов и игр из Boosty-блога SNAILKICK: постеры, оценки Кинопоиск/IMDb и ссылки на записи.",
    tagline:
      'Фильмы, сериалы и игры из <a href="https://boosty.to/snailkick" target="_blank" rel="noopener">Boosty</a> — с постерами, оценками и ссылками на записи просмотров.',
  },
};

export const META = BLOG_META[BLOG] || {
  title: `Каталог Boosty ${BLOG}`,
  brand: `Каталог Boosty ${BLOG}`,
  desc: `Каталог записей Boosty-блога ${BLOG}.`,
  tagline: `Записи из <a href="https://boosty.to/${BLOG}" target="_blank" rel="noopener">Boosty</a>.`,
};

export const readData = async (name) => JSON.parse(await readFile(dataFile(name), "utf8").catch(() => "{}"));
