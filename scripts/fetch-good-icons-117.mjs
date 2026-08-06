// Fetch goods icons from the Anno 117 wiki's image server into
// public/icons/goods-117/ and write src/lib/goodIcons117.json (good display
// name → public path). The 1800 sibling of this script is
// scripts/fetch-good-icons.mjs; the two are kept apart because the games'
// goods share 24 display names (Beer, Bread, Coal, Wood…) with completely
// different art, so one map keyed by name would show 1800 paintings next to
// Roman goods. Re-run any time; existing files are kept unless --force.
//
// Same MediaWiki addressing trick as the 1800 script — "File:Icon_Wine.png"
// lives at /images/<md5[0]>/<md5[0..1]>/… — but the 117 originals are 36–53KB
// each, so we ask the CDN for a 64px thumbnail (the UI renders them at 18px).
// Fandom 403s a default user-agent; the UA header is load-bearing.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "public/icons/goods-117");
const MAP_FILE = path.join(ROOT, "src/lib/goodIcons117.json");
const BASE = "https://static.wikia.nocookie.net/anno117/images";
const WIDTH = 64;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

// Goods whose wiki file name doesn't follow from the display name. Most are
// the wiki using the singular, an in-game synonym, or a plain typo
// ("Handmirros"). The four picked by eye, because the name alone would have
// chosen the wrong picture:
//   Marble / Uncut Marble — the wiki's "Icon_Marble" is the raw rock and
//   "Icon_Marble_Blocks" the cut block, i.e. the opposite way round from our
//   names. Granite is the same pair with our two names inverted again, so
//   both stone pairs are mapped by their place in the chain (quarry output =
//   rough rock, cutter output = stacked slabs) rather than by name.
//   Head Piece — "Icon_Wig_Base" is the flax-and-resin cap the Wig Maker
//   builds on, not the finished Wigs.
//   Sandarac Wood — sandarac comes from a cypress; "Icon_Cypress_Wood" is
//   plain figured wood with no gilding, so it's the raw good, not Ornate Wood.
const EXTRA_NAMES = {
  Armour: "Icon_Armory.png",
  "Bird Tongues in Aspic": "Icon_Tongue_In_Aspic.png",
  Brooches: "Icon_Brooch.png",
  Coal: "Icon_Charcoal.png",
  "Drinking Horns": "Icon_Drinkhorns.png",
  Granite: "Icon_Granite_Block.png",
  "Granite Block": "Icon_Granite.png",
  Handmirrors: "Icon_Handmirros.png",
  "Head Piece": "Icon_Wig_Base.png",
  Marble: "Icon_Marble_Blocks.png",
  Ochs: "Icon_Auroch.png",
  "Oysters with Caviar": "Icon_Oysters_And_Caviar.png",
  "Sandarac Wood": "Icon_Cypress_Wood.png",
  Saltwort: "Icon_Samphire.png",
  Soap: "Icon_Lavender_Soap.png",
  "Standing Lyres": "Icon_String_Instrument.png",
  "Uncut Marble": "Icon_Marble.png",
  "Writing Tablets": "Icon_Wax_Tablets.png",
};

const data = JSON.parse(fs.readFileSync(path.join(ROOT, "src/lib/data-117.json"), "utf8"));
const names = [...new Set(data._C.g.map((t) => t[1]))].sort();

const hashPath = (file) => {
  const h = crypto.createHash("md5").update(file).digest("hex");
  return `${BASE}/${h[0]}/${h.slice(0, 2)}/${encodeURIComponent(file)}/revision/latest/scale-to-width-down/${WIDTH}`;
};

const candidates = (name) => {
  const u = name.replace(/ /g, "_");
  const list = [];
  if (EXTRA_NAMES[name]) list.push(EXTRA_NAMES[name]);
  list.push(`Icon_${u}.png`);
  // The wiki titles most goods in the singular: "Icon_Lounger" for Loungers,
  // "Icon_Sturgeon" for Sturgeon. Try the obvious de-pluralisations.
  if (/ies$/.test(u)) list.push(`Icon_${u.replace(/ies$/, "y")}.png`);
  if (/s$/.test(u)) list.push(`Icon_${u.slice(0, -1)}.png`);
  // …and pluralises a few where we don't: Rope → "Icon_Ropes", Sturgeon →
  // "Icon_Sturgeons".
  else list.push(`Icon_${u}s.png`);
  // "Wattle_&_Daub" style names keep their punctuation; also try each word
  // capitalised, which is how the wiki writes multi-word files.
  const title = u.replace(/\b[a-z]/g, (c) => c.toUpperCase());
  if (title !== u) list.push(`Icon_${title}.png`);
  return [...new Set(list)];
};

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

fs.mkdirSync(OUT_DIR, { recursive: true });
const force = process.argv.includes("--force");
const map = {};
const misses = [];

for (const name of names) {
  const file = path.join(OUT_DIR, `${slug(name)}.png`);
  const pub = `/icons/goods-117/${slug(name)}.png`;
  if (!force && fs.existsSync(file)) {
    map[name] = pub;
    continue;
  }
  let ok = false;
  for (const cand of candidates(name)) {
    const res = await fetch(hashPath(cand), { headers: { "User-Agent": UA } });
    if (res.ok) {
      fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      map[name] = pub;
      ok = true;
      break;
    }
  }
  if (!ok) misses.push(name);
  await new Promise((r) => setTimeout(r, 120)); // be polite
}

fs.writeFileSync(MAP_FILE, JSON.stringify(map, null, 2) + "\n");
console.log(`icons: ${Object.keys(map).length}/${names.length} goods`);
if (misses.length) console.log("missing:", misses.join(", "));
