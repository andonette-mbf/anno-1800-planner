// Extracts the Anno 117 game data pack from the anno-mods/anno-117-calculator
// `params.js` literal into src/lib/data-117.json — the 117 counterpart of the
// legacy `_C` extraction that produced data.json (M10 phase 2).
//
// Run:  node scripts/extract-117.mjs                 (fetches the pinned commit)
//       node scripts/extract-117.mjs --src path/to/params.js
//       node scripts/extract-117.mjs --src <url> --pin <sha>
//
// The upstream is MIT-licensed tooling; the values it carries (building names,
// consumption rates) remain © Ubisoft — same provenance as data.json. The game
// still patches rates and there is no golden reference for 117 the way
// legacy.html is for 1800, so the output is VERSIONED: bump PACK when
// re-extracting from a newer upstream and keep the old pack's numbers
// reproducible by re-running against the recorded commit.
import { writeFileSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Bump when re-extracting from a newer upstream — the pack version is what the
// app shows and what a saved 117 plan is pinned to.
const PACK = 2;
// anno-mods/anno-117-calculator @ v2.1, the commit this pack was cut from.
const PINNED_SHA = "c6a6e7525d16927f74d4f554dde5831b84fa287c";
const RAW = (sha) =>
  `https://raw.githubusercontent.com/anno-mods/anno-117-calculator/${sha}/js/params.js`;

// 117's regions are internal names on every asset; the player-facing names are
// the sessions. Numeric ids mirror data.json's `regions` map so the two packs
// index the same way.
const REGION_ID = { Roman: 1, Celtic: 2 };
const REGION_NAME = { 1: "Latium", 2: "Albion" };

// supplyWeight bands the needs into unlock waves (1 = from the first residence,
// 8 = top tier). data.json's category axis is need/want/lifestyle; 117 has four
// bands, so they get their own labels rather than being squeezed into three.
const WEIGHT_CAT = { 1: 0, 2: 1, 4: 2, 8: 3 };
const CAT_LABELS = ["basic", "wanted", "refined", "luxury"];

// 117 has no residents-per-house constant because a residence has no fixed
// capacity: its population is the SUM of the `Population` attribute of every
// need it is actually supplied (`needs[].needAttributes`, 0..3 residents each).
// Verified against the wiki's Liberti example — Porridge +2 and Sardines +1
// are quoted there as "+3 population from the food category per residence".
// 39 of the 81 needs grant 0 population and pay happiness/money instead, which
// is exactly the thing worth surfacing to a player. `pop` is pack 2's addition.
const popOf = (need) => need.needAttributes?.Population ?? 0;

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
    console.log(`extract-117: fetching ${source}`);
    const res = await fetch(source);
    if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
    text = await res.text();
  } else {
    console.log(`extract-117: reading ${source}`);
    text = readFileSync(resolve(source), "utf8");
  }
  // params.js is `if(window.params == null) window.params = {...}` — run it
  // against a bare object rather than regex-scraping the literal.
  const win = {};
  new Function("window", text)(win);
  if (!win.params) throw new Error("params.js did not assign window.params");
  return win.params;
}

const en = (o) => o?.locaText?.english ?? o?.name ?? null;

/** "Olive Oil" -> "olive_oil"; ids are stable slugs like data.json's. */
function slug(name) {
  return String(name)
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const P = await loadParams(src);

// ---------- products ----------
// Abstract products are the public-service buildings a residence "needs"
// (Market, Baths). They carry no rate and nothing produces them, so they are
// kept out of `g` and listed separately as services.
const products = new Map(P.products.map((p) => [p.guid, p]));
const factoryFor = new Map(); // product guid -> the factory that makes it
for (const f of P.factories) for (const o of f.outputs || []) if (!factoryFor.has(o.product)) factoryFor.set(o.product, f);

// Slug ids, disambiguated where a name repeats across regions.
const idFor = new Map(); // product guid -> id
const usedIds = new Map(); // id -> guid
for (const p of P.products) {
  if (p.isAbstract) continue;
  let id = slug(en(p));
  if (!id) continue;
  if (usedIds.has(id) && usedIds.get(id) !== p.guid) {
    const f = factoryFor.get(p.guid);
    const region = (f?.associatedRegions || p.associatedRegions || [])[0];
    id = region ? `${id}_${slug(region)}` : `${id}_${p.guid}`;
  }
  usedIds.set(id, p.guid);
  idFor.set(p.guid, id);
}

// ---------- needs ----------
const needs = new Map(P.needs.map((n) => [n.guid, n]));
const levels = new Map(P.populationLevels.map((l) => [l.guid, l]));

// Group order is the progression order (Liberti -> Patricians), which the flat
// populationLevels array is not in.
const levelOrder = new Map();
const levelRegion = new Map();
for (const g of P.populationGroups) {
  (g.populationLevels || []).forEach((guid, i) => {
    levelOrder.set(guid, i);
    levelRegion.set(guid, REGION_ID[g.region] ?? 0);
  });
}

// residenceBuildings is the join: population level -> the needs it consumes and
// the per-resident t/min rate for each. A null rate means a service need.
const POP = {};
const tierOrder = {};
const tierLabels = {};
// good id -> the earliest population level that needs it (data.json's `tier`).
const firstNeedOf = new Map();

const residences = [...P.residenceBuildings].sort(
  (a, b) => (levelOrder.get(a.populationLevel) ?? 99) - (levelOrder.get(b.populationLevel) ?? 99)
);

for (const rb of residences) {
  const lvl = levels.get(rb.populationLevel);
  if (!lvl) continue;
  const tid = slug(en(lvl));
  const region = levelRegion.get(rb.populationLevel) ?? REGION_ID[(rb.associatedRegions || [])[0]] ?? 0;
  const n = {};
  const services = [];
  for (const entry of rb.needsList || []) {
    const need = needs.get(entry.need);
    if (!need) continue;
    const cat = WEIGHT_CAT[need.supplyWeight] ?? 0;
    if (need.isBuilding || entry.needConsumptionRate == null) {
      const svc = products.get(need.needProduct);
      // Wonders are flagged, not dropped: they grant population like any other
      // need (the Colosseum is +3/house) but they are one-per-island
      // megaprojects rather than per-settlement infrastructure, so the UI
      // counts them separately from markets and taverns.
      if (svc)
        services.push({
          id: slug(en(svc)),
          lbl: en(svc),
          cat,
          pop: popOf(need),
          ...(need.needCategory === "Wonders" ? { wonder: true } : {}),
        });
      continue;
    }
    const gid = idFor.get(need.needProduct);
    if (!gid) continue;
    n[gid] = [entry.needConsumptionRate, cat, popOf(need)];
    const rank = levelOrder.get(rb.populationLevel) ?? 99;
    const prev = firstNeedOf.get(gid);
    if (!prev || rank < prev.rank) firstNeedOf.set(gid, { tid, rank });
  }
  POP[tid] = {
    lbl: en(lvl),
    region,
    // There is deliberately no residents-per-house field: in 117 a residence
    // has no fixed capacity, so it is the sum of `pop` over the needs actually
    // supplied (see popOf above). Deriving it in the app keeps one source of
    // truth and lets the figure follow the player's needs band.
    workforceFactor: lvl.populationToWorkforceFactor ?? null,
    workforce: lvl.connectedWorkforce ?? null,
    n,
    services,
  };
  tierOrder[tid] = levelOrder.get(rb.populationLevel) ?? 99;
  tierLabels[tid] = en(lvl);
}

// ---------- goods ----------
// A good can have several producers, and they are not interchangeable:
//   - most are the same building in both regions (Bakery), identical rate and
//     inputs — one good, region mask covers both;
//   - some differ by region in rate or building (Flour: Grain Mill 30s in
//     Latium, Donkey Mill 60s in Albion) or in inputs (Leather, Amphorae,
//     Tiles take a different hide/clay in each region);
//   - some are a genuine same-region choice (Coal: Charcoal Burner or Coal
//     Mine; Gold Ore: Gold Mine or Gold Washer) — 1800's coal-source pick.
// So every producer is kept in `producers`, and `g` carries the primary one in
// data.json's familiar tuple shape. `region` is a BITMASK (1 Latium, 2 Albion,
// 3 both), unlike data.json's single-region ids.
const producersOf = new Map(); // product guid -> factory[]
for (const f of P.factories)
  for (const o of f.outputs || []) {
    if (!producersOf.has(o.product)) producersOf.set(o.product, []);
    producersOf.get(o.product).push(f);
  }

const fertNames = new Map(P.fertilities.map((x) => [x.guid, en(x)]));
const inputsOf = (f) =>
  (f.inputs || [])
    .map((i) => idFor.get(i.product))
    .filter(Boolean)
    .join("|");

// Which buildings accept a Silo. NOT derivable from modulesLimit — that counts
// module SLOTS, so every crop farm's fields qualify and the Ochs Farm (5 pasture
// slots, no silo) would too. The real link is `additionalModule`, the one bolt-on
// a factory can take: it points at the Silo for the Sheep Farm, Pig Farm and
// Horse Breeder, in both regions, and at nothing for everything else.
const siloModuleGuids = new Set(P.modules.filter((m) => /silo/i.test(en(m) || "")).map((m) => m.guid));
const takesSilo = (f) => siloModuleGuids.has(f.additionalModule);

const g = [];
const producers = {};

// A few products no factory makes: Denarii, permits and garrison units (not
// goods at all) and Obsidian, which is GATHERED from island deposits via the
// Obsidian Gathering/Mining buffs. Obsidian is a real chain input, so it is
// kept as a raw leaf with no building; the rest are dropped.
const consumedSomewhere = new Set(P.factories.flatMap((f) => (f.inputs || []).map((i) => i.product)));
const gathered = [];

for (const p of P.products) {
  const id = idFor.get(p.guid);
  if (!id) continue;
  const list = producersOf.get(p.guid);
  if (!list?.length) {
    // Keep it only if something actually consumes it — otherwise it is a
    // currency/permit, not a good.
    if (!consumedSomewhere.has(p.guid)) continue;
    const region = (p.associatedRegions || []).reduce((m, r) => m | (REGION_ID[r] ?? 0), 0) || 3;
    g.push([id, en(p), region, firstNeedOf.get(id)?.tid ?? "", null, 0, ""]);
    producers[id] = [];
    gathered.push(id);
    continue;
  }

  // Collapse producers that agree on everything, OR-ing their regions: the
  // Bakery in Latium and the Bakery in Albion are one entry with mask 3.
  const merged = new Map();
  for (const f of list) {
    const inputs = inputsOf(f);
    const key = `${en(f)}|${f.cycleTime}|${inputs}`;
    const bit = REGION_ID[(f.associatedRegions || [])[0]] ?? 0;
    const prev = merged.get(key);
    if (prev) {
      prev.region |= bit;
      // Flags are outside the merge key, so OR them in rather than letting the
      // first region's variant speak for both.
      if (f.needsFuelInput) prev.fuel = true;
      if (takesSilo(f)) prev.silo = true;
      continue;
    }
    merged.set(key, {
      building: en(f),
      time: f.cycleTime,
      inputs,
      region: bit,
      ...(f.needsFuelInput ? { fuel: true } : {}),
      // Takes a Silo module: ×2 output for SILO.feedPerMin of feed. Three
      // buildings only — see `takesSilo`, and do not confuse with modulesLimit.
      ...(takesSilo(f) ? { silo: true } : {}),
      // Max module SLOTS, not silos: a farm's fields are modules too, which is
      // why these run to 80/140/180. A Silo occupies slots like anything else.
      ...(f.modulesLimit > 0 ? { modulesLimit: f.modulesLimit } : {}),
      ...(f.neededFertility ? { fertility: fertNames.get(f.neededFertility) ?? true } : {}),
    });
  }

  // Primary = Latium where available (data.json prefers the Old World the same
  // way), then the fastest, so the pick is deterministic across re-extractions.
  const variants = [...merged.values()].sort(
    (a, b) => (b.region & 1) - (a.region & 1) || a.time - b.time || a.building.localeCompare(b.building)
  );
  const primary = variants[0];
  const region = variants.reduce((m, v) => m | v.region, 0);
  const tier = firstNeedOf.get(id)?.tid ?? "";
  g.push([id, en(p), region, tier, primary.building, primary.time, primary.inputs]);
  producers[id] = variants;
}
g.sort((a, b) => a[0].localeCompare(b[0]));

// ---------- modifiers ----------
// The 117 analogues of data.json's silo/coal-source edges. Numbers only — how
// they fold into a rate is the calculator's job (M10 phase 3), not the pack's.
const siloModule = P.modules.find((m) => /silo/i.test(en(m) || ""));
const siloBuff = siloModule
  ? P.buildingBuffs.find((b) => (siloModule.buffs || []).includes(b.guid))
  : null;
const fuelProduct = products.get(P.constants.fuelProduct);

const out = {
  _C: {
    version: `117 pack ${PACK}`,
    game: "anno117",
    g,
    alts: {}, // no alternative producers in the upstream pack
    POP,
    tierOrder,
    tierLabels,
    regions: REGION_NAME,
    catLabels: CAT_LABELS,
  },
  // Every producer of every good, primary first. A variant carries its own
  // region mask, inputs and modifier flags (`fuel`, `modules`, `fertility`),
  // because those differ per region for several goods. An empty list means the
  // good is gathered, not built (see `gathered`).
  producers,
  // Raw leaves with no producing building — gathered from an island deposit.
  // Treat as supplied, the way a trade-only import is.
  gathered,
  // Buildings burn fuel (Coal) alongside their inputs: one unit per `time`
  // seconds, so a building on a `cycleTime` loop burns cycleTime/time per cycle.
  fuel: {
    good: fuelProduct ? idFor.get(fuelProduct.guid) : null,
    time: P.constants.fuelProductionTime,
  },
  // Silo module: a bolt-on that eats Wheat and raises productivity, the direct
  // counterpart of 1800's silo. Which buildings accept one is a per-building
  // fact, so it rides on the variant as `silo: true` (see `takesSilo`).
  silo: {
    feedGood: siloModule ? idFor.get((siloModule.inputs || [])[0]?.product) : null,
    feedPerMin: siloModule ? 60 / siloModule.cycleTime : null,
    productivityUpgrade: siloBuff?.productivityUpgrade ?? null,
  },
  presets: [],
  source: {
    repo: "anno-mods/anno-117-calculator",
    commit: sha,
    upstreamVersion: "2.1",
    licence: "MIT (tooling); game values © Ubisoft",
    extractedBy: "scripts/extract-117.mjs",
  },
};

const dest = resolve(ROOT, "src/lib/data-117.json");
writeFileSync(dest, JSON.stringify(out, null, 1) + "\n");

const all = Object.values(producers).flat();
const inMask = (m) => g.filter((x) => x[2] & m).length;
const count = (k) => all.filter((v) => v[k]).length;
console.log(
  `extract-117: pack ${PACK} -> src/lib/data-117.json\n` +
    `  goods     ${g.length} (Latium ${inMask(1)}, Albion ${inMask(2)}, both ${g.filter((x) => x[2] === 3).length})\n` +
    `  producers ${all.length} across ${P.factories.length} factories\n` +
    `  tiers     ${Object.keys(POP).length} (${Object.keys(POP).join(", ")})\n` +
    `  fuel      ${count("fuel")} buildings burn ${en(fuelProduct)}\n` +
    `  silo      ${count("silo")} buildings take a Silo\n` +
    `  modules   ${count("modulesLimit")} buildings take modules (fields/silo)\n` +
    `  fertility ${count("fertility")} buildings need one`
);
