// Extracts the Anno 117 specialist-items + patrons pack from the
// anno-mods/anno-117-calculator `params.js` literal into
// src/lib/items-117.json — the 117 counterpart of items-1800.json (M11c).
//
// Unlike 1800's pack this does NOT come from a wiki: the 117 wiki carries no
// item lists (checked Aug 2026 — 40 pages, nothing to extract), but upstream
// Release 3.0 ships `items` (172 specialists) and `patrons` (the 8 deities)
// alongside the production data that data-117.json is cut from. Pin the SAME
// commit as scripts/extract-117.mjs so the two packs describe one game build.
//
// Everything guid-shaped is resolved to names HERE: an item's `buffs` join
// against `buildingBuffs` to make the one-line `fx`, its `targets` against
// factories/residences to make `tgt`. The app never sees a guid.
//
// Run:  node scripts/extract-items-117.mjs                 (fetches the pinned commit)
//       node scripts/extract-items-117.mjs --src path/to/params.js
//       node scripts/extract-items-117.mjs --src <url> --pin <sha>
import { writeFileSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Bump when re-extracting from a newer upstream.
const PACK = 1;
// anno-mods/anno-117-calculator @ Release 3.0 — the same commit data-117.json
// pack 3 was cut from, so items target buildings the calculator knows.
const PINNED_SHA = "28969c3f92c1e93113bb743e66e9d321dd43fc15";
const RAW = (sha) =>
  `https://raw.githubusercontent.com/anno-mods/anno-117-calculator/${sha}/js/params.js`;

// Where items are equipped (upstream docs/gameplay.md: "placed in villas or
// guesthouses"): Latium's Villa and Albion's Guesthouse. The data carries no
// per-item socket — every item is effectScope "Radius" — so both sockets share
// the one item list, attached at load in items.ts rather than duplicated here.
const SOCKETS = [
  { id: "villa", label: "Villa", noun: "specialist" },
  { id: "gh", label: "Guesthouse", noun: "specialist" },
];

// Power order for sort/tint. Mythic is the Prophecies of Ash tier above
// Legendary; Unique is the campaign one-offs, last like 1800's "Quest".
const RARITY = ["Common", "Rare", "Epic", "Legendary", "Mythic", "Unique"];

const args = process.argv.slice(2);
const arg = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : null;
};
const sha = arg("--pin") || PINNED_SHA;
const src = arg("--src") || RAW(sha);

async function loadParams(source) {
  let text;
  if (/^https?:/.test(source)) {
    console.log(`extract-items-117: fetching ${source}`);
    const res = await fetch(source);
    if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
    text = await res.text();
  } else {
    console.log(`extract-items-117: reading ${source}`);
    text = readFileSync(resolve(source), "utf8");
  }
  const win = {};
  new Function("window", text)(win);
  if (!win.params) throw new Error("params.js did not assign window.params");
  return win.params;
}

const en = (o) => o?.locaText?.english ?? o?.name ?? null;

const params = await loadParams(src);
for (const key of ["items", "patrons", "buildingBuffs", "effects", "factories"])
  if (!Array.isArray(params[key])) throw new Error(`params.${key} missing — upstream moved?`);

// One guid → English name map across every asset list (factories, residences,
// fertilities, products, workforce, techs…). Not every target resolves: a few
// items buff warehouse-type buildings the calculator doesn't model, and those
// names simply aren't in params — the item keeps whatever targets DO resolve.
const guidName = new Map();
for (const arr of Object.values(params))
  if (Array.isArray(arr))
    for (const o of arr) if (o?.guid && en(o)) guidName.set(o.guid, en(o));
const buffById = new Map(params.buildingBuffs.map((b) => [b.guid, b]));
const effById = new Map(params.effects.map((e) => [e.guid, e]));
const dlcName = (g) => guidName.get(g) || null;

const pct = (n) => (n > 0 ? "+" : "") + n + "%";

/** One buff → compact clauses ("+20% productivity", "grants Gold Ore
 *  Deposit"…). `scale` is the patron devotion multiplier (items are ×1).
 *  fertilityPercent is a yield modifier ON the granted fertility, not an
 *  effect of its own — 100 on every plain buff, 50/75 on the fertility items. */
function buffFx(b, scale = 1) {
  const c = [];
  const s = (v) => Math.round(v * scale);
  if (b.productivityUpgrade) c.push(`${pct(s(b.productivityUpgrade))} productivity`);
  if (b.fuelDurationPercent) c.push(`${pct(s(b.fuelDurationPercent))} fuel duration`);
  if (b.workforceMaintenanceFactorUpgrade)
    c.push(`${pct(s(b.workforceMaintenanceFactorUpgrade))} workforce upkeep`);
  if (b.addedFertility) {
    // The fertility asset's own name already says what it is ("Lavender
    // Fertility", "Gold Ore Deposit") — don't append a category word.
    const n = guidName.get(b.addedFertility) || `fertility ${b.addedFertility}`;
    c.push(`grants ${n}` + (b.fertilityPercent < 100 ? ` at ${b.fertilityPercent}% yield` : ""));
  }
  for (const o of b.additionalOutputs || [])
    c.push(
      `+${o.amount} extra output every ${o.additionalOutputCycle} cycles` +
        (o.product && !o.forceProductSameAsFactoryOutput
          ? ` (${guidName.get(o.product) || o.product})`
          : "")
    );
  if (b.replaceWorkforce?.newWorkforce)
    c.push(
      `staffed by ${guidName.get(b.replaceWorkforce.newWorkforce)} instead of ${guidName.get(b.replaceWorkforce.oldWorkforce)}`
    );
  for (const w of b.additionalWorkforces || [])
    c.push(`also employs ${guidName.get(w) || w}`);
  for (const r of b.replaceInputs || [])
    c.push(`uses ${guidName.get(r.newInput)} instead of ${guidName.get(r.oldInput)}`);
  for (const g of b.goodConsumptionUpgrade || [])
    if (g.amountInPercent)
      c.push(`${pct(g.amountInPercent)} ${guidName.get(g.product) || g.product} consumption`);
  if (b.consumptionModifierInPercent) c.push(`${pct(b.consumptionModifierInPercent)} consumption`);
  if (b.population) c.push(`+${s(b.population)} population`);
  return c.join(", ");
}

/** Unique resolved target names, deduped across regions (Flax Farm exists in
 *  both and appears once). Capped: past 6 names nobody reads the datalist
 *  line, and one Legendary buffs 115 buildings — that's "all production". */
function targetLine(targets) {
  const names = [...new Set(targets.map((t) => guidName.get(t)).filter(Boolean))];
  if (!names.length) return null;
  if (names.length >= 50) return "All production buildings";
  if (names.length > 6) return `${names.slice(0, 6).join(", ")} +${names.length - 6} more`;
  return names.join(", ");
}

// --- items ----------------------------------------------------------------
const items = params.items.map((it) => {
  if (it.buffs.length !== 1)
    throw new Error(`${en(it)}: ${it.buffs.length} buffs — the one-buff assumption broke`);
  const b = buffById.get(it.buffs[0]);
  if (!b) throw new Error(`${en(it)}: buff ${it.buffs[0]} not in buildingBuffs`);
  if (!RARITY.includes(it.rarity)) throw new Error(`${en(it)}: new rarity "${it.rarity}"`);
  const fx = buffFx(b);
  const tgt = targetLine(it.targets);
  const dlc = it.dlcUnlocks.map(dlcName).filter(Boolean).join(" + ");
  return {
    n: en(it),
    r: it.rarity,
    ...(tgt ? { tgt } : {}),
    ...(fx ? { fx } : {}),
    ...(dlc ? { dlc } : {}),
  };
});
// Rarity bands then name — the datalist reads as a ladder.
items.sort(
  (a, b) => RARITY.indexOf(a.r) - RARITY.indexOf(b.r) || a.n.localeCompare(b.n)
);

// --- patrons --------------------------------------------------------------
// One deity per island (117's Religion system). Each local effect's buff
// values scale with devotion milestones — the line quotes the ceiling, so the
// player reads what full devotion pays. Mercury-Lugus genuinely has no
// production effects in the data (trade deity); he stays pickable, plain.
const patrons = params.patrons.map((p) => {
  const fx = p.localEffects.map((le) => {
    const e = effById.get(le.effect);
    if (!e) throw new Error(`${en(p)}: effect ${le.effect} not in effects`);
    const maxScale = Math.max(...le.milestones.map((m) => m.buffScaling));
    const clauses = (e.buffs || [])
      .map((g) => buffById.get(g))
      .filter(Boolean)
      .map((b) => buffFx(b, maxScale))
      .filter(Boolean)
      .join(", ");
    const tgt = targetLine(e.targets);
    return (
      `${le.title.english} — up to ${clauses} at full devotion` + (tgt ? ` · ${tgt}` : "")
    );
  });
  const dlc = p.dlcUnlocks.map(dlcName).filter(Boolean).join(" + ");
  const wonder = p.wonder ? guidName.get(p.wonder) : null;
  return {
    n: en(p),
    fx,
    ...(wonder ? { wonder } : {}),
    ...(dlc ? { dlc } : {}),
  };
});

// --- write ----------------------------------------------------------------
const out = {
  pack: PACK,
  source: {
    upstream: "https://github.com/anno-mods/anno-117-calculator",
    commit: sha,
    note:
      "Item and patron values © Ubisoft; data assembled by the anno-mods " +
      "calculator project (MIT). Same commit as data-117.json's pack.",
  },
  rarity: RARITY,
  sockets: SOCKETS,
  items,
  patrons,
};
const dest = resolve(ROOT, "src/lib/items-117.json");
writeFileSync(dest, JSON.stringify(out, null, 1) + "\n");
const noFx = items.filter((i) => !i.fx).length;
const noTgt = items.filter((i) => !i.tgt).length;
console.log(
  `extract-items-117: pack ${PACK} — ${items.length} items ` +
    `(${noFx} without fx, ${noTgt} without resolvable targets), ` +
    `${patrons.length} patrons → ${dest}`
);
