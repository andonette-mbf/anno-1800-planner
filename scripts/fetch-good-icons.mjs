// Fetch goods icons from the Anno 1800 wiki's image server into
// public/icons/goods/ and write src/lib/goodIcons.json (good display name →
// public path). Re-run any time; existing files are kept unless --force.
// MediaWiki stores "File:Steel_Beams.png" at /images/<md5[0]>/<md5[0..1]>/…,
// so we can address files by name alone; we try a couple of capitalisation
// variants per good and record misses at the end for manual mapping via
// EXTRA_NAMES below.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "public/icons/goods");
const MAP_FILE = path.join(ROOT, "src/lib/goodIcons.json");
const BASE = "https://static.wikia.nocookie.net/anno1800/images";

// Goods whose wiki file name doesn't follow from the display name.
// The remaining add-on goods (Enbesa, Old Town, New World Rising sets) have
// no goods icon on the wiki under any name we could find — they render
// without a picture until a source turns up.
const EXTRA_NAMES = {
  "Steel Beams": "Steel_beams.png",
  "Bear Furs": "Bear_Fur.png",
  Filament: "Filaments.png",
  Gramophones: "Gramophone.png",
  Jewellery: "Jewelry.png",
  Ponchos: "Poncho.png",
  Tortillas: "Tortilla.png",
  Typewriter: "Typewriters.png",
  Potatoes: "Potato.png",
  "Light Bulbs": "Light_bulb.png",
  "Pocket Watches": "Pocket_watch.png",
};

const data = JSON.parse(fs.readFileSync(path.join(ROOT, "src/lib/data.json"), "utf8"));
const names = [...new Set(data._C.g.map((t) => t[1]))].sort();

const hashPath = (file) => {
  const h = crypto.createHash("md5").update(file).digest("hex");
  return `${BASE}/${h[0]}/${h.slice(0, 2)}/${encodeURIComponent(file)}`;
};

const candidates = (name) => {
  const u = name.replace(/ /g, "_");
  const list = [];
  if (EXTRA_NAMES[name]) list.push(EXTRA_NAMES[name]);
  list.push(`${u}.png`);
  // "Steel Beams" → "Steel_beams.png" (only the first word capitalised).
  const lower = u[0] + u.slice(1).toLowerCase();
  if (lower !== u) list.push(`${lower}.png`);
  return list;
};

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

fs.mkdirSync(OUT_DIR, { recursive: true });
const force = process.argv.includes("--force");
const map = {};
const misses = [];

for (const name of names) {
  const file = path.join(OUT_DIR, `${slug(name)}.png`);
  const pub = `/icons/goods/${slug(name)}.png`;
  if (!force && fs.existsSync(file)) {
    map[name] = pub;
    continue;
  }
  let ok = false;
  for (const cand of candidates(name)) {
    const res = await fetch(hashPath(cand));
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
