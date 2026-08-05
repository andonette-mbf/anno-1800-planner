// Extracts the Anno 1800 culture-item collections — Zoo animals, Museum
// artifacts, Botanical Garden plants — from the Anno 1800 Wiki into
// src/lib/culture-1800.json (M11).
//
// Run:  node scripts/extract-culture.mjs
//       node scripts/extract-culture.mjs --out /tmp/probe.json   (dry run)
//
// Why the wiki and not a data dump: unlike production rates, which came from
// the legacy app's own `_C` literal (data.json) and from anno-117-calculator
// (data-117.json), nothing in this repo has ever carried item data. The wiki's
// three "Items - …" pages are the only structured public source, and they are
// generated from templates, so the tables are consistent enough to parse.
//
// Two things about fetching it, both learned the hard way:
//   * the API (api.php) is open, even though the rendered site blocks scrapers
//     — this is the same distinction build 57 hit fetching goods pictures,
//     where the image host worked but the article host did not;
//   * Fandom 403s a default Node/Python user-agent, so UA below is required.
//
// Values are © Ubisoft, same provenance as data.json. Like the 117 pack the
// output is VERSIONED — the wiki is a moving target (new DLC, corrections), so
// bump PACK when re-extracting and keep the recorded revision ids so an old
// pack's numbers stay reproducible.
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PACK = 1;
const API = "https://anno1800.fandom.com/api.php";
const UA = "anno-1800-planner/1.0 (data extraction; contact via repo)";

// The three culture buildings, their wiki source page, and what one item in
// them is called — the noun is what the UI says ("6 animals", "3 artifacts").
const BUILDINGS = [
  { id: "zoo", label: "Zoo", noun: "animal", page: "Items - zoo" },
  { id: "museum", label: "Museum", noun: "artifact", page: "Items - museum" },
  {
    id: "garden",
    label: "Botanical Garden",
    noun: "plant",
    page: "Items - botanical garden",
  },
];

// In-game rarity ladder, worst to best. Attractiveness tracks it (10/20/30/
// 40/50) but is read off the table rather than derived — Sheet Music and
// set bonuses move the totals and the wiki is the reference for the base.
const RARITY = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
// "Quest" is not a drop tier — exactly one exhibit (The Sceptre of Capon)
// carries it, because it comes from a quest rather than an expedition. It is
// allowed through as-is rather than being forced onto the ladder, and the
// unknown-rarity guard below stays strict so a genuine layout change still
// fails loudly.
const EXTRA_RARITY = ["Quest"];

const args = process.argv.slice(2);
const arg = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : null;
};
const OUT = arg("--out") || resolve(ROOT, "src/lib/culture-1800.json");

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
    .replace(/ /g, " ");
}

/** Tags out, entities decoded, whitespace collapsed. */
function txt(html) {
  return unescape(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** The DLC an item or set needs, from the first "… DLC" article link. */
function dlcIn(html) {
  const m = /<a href="\/wiki\/[^"]*"[^>]*title="([^"]*?) DLC"/.exec(html);
  return m ? unescape(m[1]).trim() : null;
}

/** The wiki's file name for an item's icon, so a later pass can fetch the
 *  pictures the way scripts/fetch-good-icons.mjs does for goods. The first
 *  image in a row is the item; DLC badges come after the name. */
function iconIn(html) {
  const m = /data-image-name="([^"]+)"/.exec(html);
  return m ? unescape(m[1]).trim() : null;
}

function slug(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** The mechanical payoff for completing the set — the whole reason a player
 *  cares which pieces are missing.
 *
 *  Three shapes on the wiki, all of them "<b>…Effect…</b> then prose to the
 *  end of the paragraph":
 *    Zoo/Museum      <b>Effect</b>: …
 *    Botanical       <b>Old World Effect: </b>… and a New World one after it
 *    multi-line      the effect continues past <br>, e.g. Arctic Tundra's
 *                    "Applies to: Public Moorings / +100 / Increased Visits"
 *  So the unit is the paragraph, not the line — stopping at the first <br>
 *  silently truncated a third of them. Italics are the flavour text and go. */
function effectIn(html) {
  const out = [];
  for (const [, p] of html.matchAll(/<p>([\s\S]*?)<\/p>/gi)) {
    const b = /<b>\s*([\s\S]*?)\s*<\/b>/i.exec(p);
    if (!b) continue;
    const label = txt(b[1]).replace(/:\s*$/, "");
    if (!/(^|\s)Effects?$/i.test(label)) continue; // one set says "Effects"
    const body = txt(p.slice(b.index + b[0].length).replace(/<i>[\s\S]*?<\/i>/gi, ""))
      .replace(/^:\s*/, "")
      .trim();
    if (!body) continue;
    // "Old World Effect" keeps its qualifier; a bare "Effect" needs none.
    const qual = label.replace(/\s*Effects?$/i, "").trim();
    out.push(qual ? `${qual}: ${body}` : body);
  }
  return out.length ? out.join(" · ") : null;
}

function parseItems(sectionHtml, seen, page) {
  const table = /<table[^>]*>([\s\S]*?)<\/table>/i.exec(sectionHtml);
  if (!table) return [];
  const out = [];
  for (const [, row] of table[1].matchAll(/<tr>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row.matchAll(/<t([hd])[^>]*>([\s\S]*?)<\/t\1>/gi)].map((m) => m[2]);
    if (cells.length < 3) continue;
    // The name cell is "<icon> <b>Name</b> (<dlc icon>)"; <b> is the reliable
    // handle, since the parenthesised DLC badge is otherwise indistinguishable
    // from a name that legitimately contains brackets.
    const bold = /<b>([\s\S]*?)<\/b>/i.exec(cells[0]);
    const name = txt(bold ? bold[1] : cells[0]).replace(/\s*\(\s*\)\s*$/, "");
    const rarity = txt(cells[1]);
    const attr = Number(txt(cells[2]).replace(/[^\d.-]/g, ""));
    // The header row's label differs per building (Animal / Exhibit / Plant),
    // so it is spotted by its Rarity column rather than by name.
    if (!name || /^rarity$/i.test(rarity)) continue;
    if (!RARITY.includes(rarity) && !EXTRA_RARITY.includes(rarity))
      throw new Error(`${page}: unknown rarity "${rarity}" for ${name}`);
    if (!Number.isFinite(attr))
      throw new Error(`${page}: unreadable attractiveness for ${name}`);
    // A handful of items appear in the wiki's non-set table AND in a set;
    // the set listing wins, and the duplicate is dropped rather than
    // silently double-counted in the totals.
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const dlc = dlcIn(cells[0]);
    const icon = iconIn(cells[0]);
    out.push({
      n: name,
      r: rarity,
      a: attr,
      ...(dlc ? { dlc } : {}),
      ...(icon ? { icon } : {}),
    });
  }
  return out;
}

async function extract(b) {
  const { html, revid } = await parsePage(b.page);
  // Sections are <h2>-delimited: one per set, plus a trailing "Non-set …".
  const chunks = html.split(/<h2[^>]*>/i).slice(1);
  const sets = [];
  const loose = [];
  const seen = new Set();
  for (const c of chunks) {
    const head = /<span class="mw-headline"[^>]*>([\s\S]*?)<\/span>/i.exec(c);
    if (!head) continue;
    const title = txt(head[1]);
    const isSet = /^Set:/i.test(title);
    if (!isSet && !/^Non-set/i.test(title)) continue;
    const items = parseItems(c, seen, b.page);
    if (!items.length) continue;
    if (!isSet) {
      loose.push(...items);
      continue;
    }
    const label = title.replace(/^Set:\s*/i, "").trim();
    // Read the set's DLC from the intro only — past the table every row's own
    // DLC badge is a link too, and the first of those is not the set's.
    const intro = c.slice(0, c.indexOf("<table"));
    const dlc = dlcIn(intro);
    const effect = effectIn(c);
    sets.push({
      id: slug(label),
      label,
      ...(dlc ? { dlc } : {}),
      ...(effect ? { effect } : {}),
      items,
    });
  }
  if (!sets.length) throw new Error(`${b.page}: no sets parsed — page layout changed?`);
  return { id: b.id, label: b.label, noun: b.noun, page: b.page, revid, sets, loose };
}

const buildings = [];
for (const b of BUILDINGS) buildings.push(await extract(b));

const pack = {
  pack: PACK,
  source: {
    wiki: "https://anno1800.fandom.com",
    note: "Item values © Ubisoft; tables transcribed by the Anno 1800 Wiki community (CC-BY-SA).",
    pages: buildings.map((b) => ({ page: b.page, revid: b.revid })),
  },
  rarity: [...RARITY, ...EXTRA_RARITY],
  buildings: buildings.map(({ page: _p, revid: _r, ...b }) => b),
};

writeFileSync(OUT, JSON.stringify(pack, null, 1) + "\n");

for (const b of buildings) {
  const inSets = b.sets.reduce((n, s) => n + s.items.length, 0);
  console.log(
    `${b.label.padEnd(18)} ${String(b.sets.length).padStart(2)} sets, ` +
      `${String(inSets).padStart(3)} in sets, ${String(b.loose.length).padStart(3)} loose ` +
      `(rev ${b.revid})`
  );
}
console.log(`\npack ${PACK} → ${OUT}`);
