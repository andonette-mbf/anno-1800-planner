// Extracts the Anno 1800 socketable specialist items — Trade Union, Town Hall,
// Harbourmaster's Office, Ship and Arctic Lodge items — from the Anno 1800 Wiki
// into src/lib/items-1800.json (M11b).
//
// Run:  node scripts/extract-items.mjs
//       node scripts/extract-items.mjs --out /tmp/probe.json   (dry run)
//
// Reuses scripts/extract-culture.mjs's fetch spine and its two hard-won
// lessons: the API (api.php) is open even though the rendered site blocks
// scrapers, and Fandom 403s a default user-agent, so UA is load-bearing.
//
// The item pages are a different shape from the culture ones: instead of one
// table per set, every item is its own `item-box` table (a template), which
// makes them MORE uniform — one parser covers all thirteen pages. Trade Union
// and Town Hall are split into five rarity pages each; the other three sockets
// are one page with rarity sections. Rarity is read off each item's own badge
// rather than the page or section it sits in, so the odd extra tier ("Quest"
// ship items, the one "Character Item") comes through as-is.
//
// Values are © Ubisoft, same provenance as data.json. Versioned like the other
// packs — bump PACK when re-extracting and keep the revision ids.
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PACK = 1;
const API = "https://anno1800.fandom.com/api.php";
const UA = "anno-1800-planner/1.0 (data extraction; contact via repo)";

const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"];

// The five sockets an item can sit in, and the wiki pages that list them.
// `noun` is what the UI calls one of them ("2 specialists", "1 item").
const SOCKETS = [
  {
    id: "tu",
    label: "Trade Union",
    noun: "specialist",
    pages: RARITIES.map((r) => `Trade Union items: ${r}`),
  },
  {
    id: "th",
    label: "Town Hall",
    noun: "specialist",
    pages: RARITIES.map((r) => `Town Hall items: ${r}`),
  },
  {
    id: "hm",
    label: "Harbourmaster's Office",
    noun: "item",
    pages: ["List of Harbourmaster's Office items"],
  },
  { id: "ship", label: "Ships", noun: "item", pages: ["List of Ship items"] },
  {
    id: "al",
    label: "Arctic Lodge",
    noun: "item",
    pages: ["List of Arctic Lodge items"],
  },
];

// Every rarity badge the boxes actually carry. Same strictness as the culture
// extractor: an unknown one is a layout change and fails loudly.
const RARITY = [
  "Common",
  "Uncommon",
  "Rare",
  "Epic",
  "Legendary",
  "Quest", // three ship items come from quests, not drops
  "Character Item", // one Harbourmaster curiosity, kept as the wiki states it
];

const args = process.argv.slice(2);
const arg = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : null;
};
const OUT = arg("--out") || resolve(ROOT, "src/lib/items-1800.json");

async function parsePage(page) {
  const u = `${API}?action=parse&page=${encodeURIComponent(
    page
  )}&prop=text|revid&format=json`;
  const res = await fetch(u, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${page}: HTTP ${res.status}`);
  const j = await res.json();
  if (j.error) throw new Error(`${page}: ${j.error.info}`);
  return { html: j.parse.text["*"], revid: j.parse.revid };
}

const ENT = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
};
function unescape(s) {
  return s
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e) => {
      if (ENT[e.toLowerCase()] !== undefined) return ENT[e.toLowerCase()];
      if (e[0] === "#")
        return String.fromCodePoint(
          e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))
        );
      return m;
    })
    .replace(/ /g, " ");
}

/** Tags out, entities decoded, whitespace collapsed. */
function txt(html) {
  return unescape(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** What the item affects, read from the "Equipped in … Affects …" cell: the
 *  linked buildings ("Charcoal Kiln"), or the bold catch-all ("All Production
 *  Buildings", "Residences"). Ship items have no Affects line — null. */
function affectsIn(cellHtml) {
  const at = cellHtml.search(/Affects/);
  if (at < 0) return null;
  const tail = cellHtml.slice(at);
  const names = [];
  const seen = new Set();
  for (const m of tail.matchAll(/<(?:a|b)[^>]*>([\s\S]*?)<\/(?:a|b)>/gi)) {
    const n = txt(m[1]);
    if (!n || seen.has(n.toLowerCase())) continue;
    seen.add(n.toLowerCase());
    names.push(n);
  }
  if (names.length) return names.join(", ");
  const plain = txt(tail).replace(/^Affects\s*/i, "");
  return plain || null;
}

/** The effects cell as one compact line. The cell is prose broken by <br> and
 *  the skill <div>s, so line breaks become " · " and the leading "Effects"
 *  label goes — "When activated · Chance of Riots -40% · Duration: 50:00". */
function effectsIn(cellHtml) {
  const lines = cellHtml
    .replace(/<\/(div|p|li)>/gi, "\n")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .split("\n")
    .map((l) => txt(l))
    .filter((l) => l && !/^Effects?$/i.test(l));
  // The label sometimes shares its line with the first effect.
  if (lines[0]) lines[0] = lines[0].replace(/^Effects?\s*:?\s*/i, "");
  const out = lines.filter(Boolean).join(" · ");
  return out || null;
}

/** One item-box table → one item. Each box is header row (icon, name, rarity),
 *  a flavour-text row, and a stats row (equipped-in / effects / expedition).
 *  Expedition bonuses are dropped — this pack answers "what does the one I
 *  socketed do", not expedition planning. */
function parseBox(box, page) {
  const name = txt(/<strong class="item-box--name">([\s\S]*?)<\/strong>/i.exec(box)?.[1] ?? "");
  if (!name) throw new Error(`${page}: item-box with no name`);
  const rarity = txt(/class="rarity rarity--[^"]*"\s*>([\s\S]*?)<\/span>/i.exec(box)?.[1] ?? "");
  if (!RARITY.includes(rarity))
    throw new Error(`${page}: unknown rarity "${rarity}" for ${name}`);
  const icon = /data-image-name="([^"]+)"/.exec(box)?.[1];
  const eq = /item-box--equipped-in-cell"[^>]*>([\s\S]*?)<\/td>/i.exec(box)?.[1] ?? "";
  const fxCell = /item-box--effects-cell"[^>]*>([\s\S]*?)<\/td>/i.exec(box)?.[1] ?? "";
  const tgt = affectsIn(eq);
  const fx = effectsIn(fxCell);
  return {
    n: name,
    r: rarity,
    ...(tgt ? { tgt } : {}),
    ...(fx ? { fx } : {}),
    ...(icon ? { icon: unescape(icon).trim() } : {}),
  };
}

async function extract(s) {
  const items = [];
  const seen = new Set();
  const pages = [];
  for (const page of s.pages) {
    const { html, revid } = await parsePage(page);
    pages.push({ page, revid });
    const boxes = html.match(/<table[^>]*item-box[^>]*>[\s\S]*?<\/table>/gi) || [];
    if (!boxes.length) throw new Error(`${page}: no item boxes — layout changed?`);
    for (const box of boxes) {
      const it = parseBox(box, page);
      // The odd item is listed twice (a template hiccup); first listing wins.
      const key = it.n.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(it);
    }
  }
  return { id: s.id, label: s.label, noun: s.noun, pages, items };
}

const sockets = [];
for (const s of SOCKETS) sockets.push(await extract(s));

const pack = {
  pack: PACK,
  source: {
    wiki: "https://anno1800.fandom.com",
    note: "Item values © Ubisoft; pages transcribed by the Anno 1800 Wiki community (CC-BY-SA).",
    pages: sockets.flatMap((s) => s.pages),
  },
  rarity: RARITY,
  sockets: sockets.map(({ pages: _p, ...s }) => s),
};

writeFileSync(OUT, JSON.stringify(pack, null, 1) + "\n");

for (const s of sockets) {
  const byR = {};
  for (const i of s.items) byR[i.r] = (byR[i.r] || 0) + 1;
  console.log(
    `${s.label.padEnd(24)} ${String(s.items.length).padStart(3)} items  ` +
      RARITY.filter((r) => byR[r])
        .map((r) => `${r} ${byR[r]}`)
        .join(", ")
  );
}
console.log(`\npack ${PACK} → ${OUT}`);
