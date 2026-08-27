// Island production ledger (M3): maps the island inventory's building names
// back to the goods they produce and sums, per island, what its ticked
// buildings make and what those buildings' own chains consume — in t/min at
// base rates (100% productivity). Silos and electricity are bolt-on counters
// on the item: `CheckItem.s` = how many of the line's farms have a silo (×2
// output, SILO_FEED t/min of feed each), `CheckItem.e` = how many are powered
// (×2, Old World only, no feed) — same multipliers as the engine's `effRate`.
//
// Building names repeat across regions (Lumberjack's Hut exists in three).
// Where the rate is identical the entries are merged — the goods share a
// display name too, so the ledger can't tell them apart and doesn't need to.
// Where the rate differs (Cattle Farm: Old World 0.5, New World 1.0) the
// non-Old-World building gets its own region-suffixed entry.
//
// M10: one index per game. 1800's is built exactly as before; 117's comes from
// data-117.json, where a producer carries its OWN inputs — Leather, Amphorae
// and Tiles take different ingredients in Latium and Albion, so inputs cannot
// be read off the good the way 1800 allows.
//
// 117's modifiers land on the variant, not the good. Its Silo is the same deal
// as 1800's (×2 output, feed per silo per minute) but only three buildings take
// one, and that is a fact about the building. Its Coal fuel has no 1800
// counterpart: a fuel-burning building eats Coal per minute of RUN time whatever
// it makes, so it is a consumption edge of its own rather than a rate modifier.
import { GOODS, SILO, SILO_FEED } from "./data";
import { FUEL_117, GOODS_117, REGIONS_117, SILO_117 } from "./data117";
import type { Game } from "./games";
import type { CheckItem } from "./store";

interface Variant {
  good: string; // produced good id
  rate: number; // t/min per building at base productivity, WITHOUT silo
  inputs: { good: string; qty: number }[]; // this producer's own chain
  silo?: boolean; // legacy "(silo)" name — implies the silo is fitted
  /** Feed good id when this building can take a silo, else undefined. */
  siloFeed?: string;
  /** Burns the game's fuel good while running (117's Coal). */
  fuel?: boolean;
}

interface Index {
  variants: Map<string, Variant>; // key: lowercased building name
  names: string[]; // display-form names, for the datalist
  primaryName: Record<string, string>; // good id -> its building's entry name
  // `${goodId}|${region}` -> entry name, for games where the producer varies by
  // region. Albion's Leather building is ALSO called "Tannery" but takes
  // different inputs, so it is registered as "Tannery (Albion)" — the entry
  // name cannot be derived from the building name alone.
  regionName: Map<string, string>;
  // good display name -> the building that makes it (first = Old World
  // preferred), so a deficit can be phrased as "build N× Grain Farm".
  producer: Record<string, { building: string; rate: number }>;
  // The same, per region: `${good display name}|${region}`. The New World's
  // Cattle Farm makes twice what the Old World's does, so the same Beef gap
  // needs half as many farms there — and the region-suffixed name. Islands
  // with no 🌍 tag fall back to `producer`.
  producerAt: Map<string, { building: string; rate: number }>;
  // Entry name -> every region that building exists in. Merged names collect
  // all their regions (Lumberjack's Hut = OW+NW+Arctic), so a region-filtered
  // datalist still offers them everywhere they're real.
  nameRegions: Map<string, Set<number>>;
  goodName: (goodId: string) => string;
  /** Is this good an end product (it has a pop tier: a need, want or
   *  construction material) rather than a chain intermediate? */
  finalGood: (goodId: string) => boolean;
  /** t/min of feed one fitted silo eats. */
  siloFeedRate: number;
  /** Good every fuel-burning building consumes, or null (1800 has none — its
   *  coal source is a rate modifier on the good, not an input edge). */
  fuelGood: string | null;
  /** t/min of fuel one burning building eats while it runs. */
  fuelPerMin: number;
  /** Region whose buildings can be electrified, or null (117 has no power). */
  elecRegion: number | null;
  options: string[];
}

type IndexCore = Omit<
  Index,
  | "goodName"
  | "finalGood"
  | "siloFeedRate"
  | "fuelGood"
  | "fuelPerMin"
  | "elecRegion"
  | "options"
>;

function emptyIndex(): IndexCore {
  return {
    variants: new Map(),
    names: [],
    primaryName: {},
    regionName: new Map(),
    producer: {},
    producerAt: new Map(),
    nameRegions: new Map(),
  };
}

function build1800(): Index {
  const ix = emptyIndex();
  const noteRegion = (name: string, region: number) => {
    const k = name.toLowerCase();
    let s = ix.nameRegions.get(k);
    if (!s) ix.nameRegions.set(k, (s = new Set()));
    s.add(region);
  };
  const notePro = (good: string, region: number, building: string, rate: number) => {
    const k = `${good}|${region}`;
    if (!ix.producerAt.has(k)) ix.producerAt.set(k, { building, rate });
  };
  const register = (name: string, v: Variant, hidden = false): boolean => {
    const k = name.toLowerCase();
    if (ix.variants.has(k)) return false;
    ix.variants.set(k, v);
    if (!hidden) ix.names.push(name);
    return true;
  };

  // Old World first so it owns contested plain names.
  for (const g of Object.values(GOODS).sort(
    (a, b) => a.region - b.region || a.name.localeCompare(b.name)
  )) {
    const clash = ix.variants.get(g.building.toLowerCase());
    const name = clash && clash.rate !== g.rate ? `${g.building} (${g.regionName})` : g.building;
    // 1800's silo is a fact about the GOOD (SILO's animals), so every building
    // that makes one — primary or alt — can take a silo.
    const siloFeed = SILO[g.id] || undefined;
    if (register(name, { good: g.id, rate: g.rate, inputs: g.inputs, siloFeed }))
      ix.primaryName[g.id] = name;
    noteRegion(name, g.region);
    if (!ix.producer[g.name]) ix.producer[g.name] = { building: name, rate: g.rate };
    notePro(g.name, g.region, name, g.rate);
    for (const a of g.alts) {
      register(a.building, { good: g.id, rate: a.rate, inputs: g.inputs, siloFeed });
      noteRegion(a.building, g.region);
    }
  }
  // Legacy "(silo)" names — silos are a bolt-on toggle on the row now, so these
  // are hidden from the datalist but still parsed for items saved before the
  // change (and un-migrated sync blobs).
  for (const gid in SILO) {
    const base = ix.primaryName[gid];
    if (!base || !GOODS[SILO[gid]]) continue;
    const bv = ix.variants.get(base.toLowerCase())!;
    const name = base.endsWith(")") ? base.replace(/\)$/, ", silo)") : `${base} (silo)`;
    register(
      name,
      { good: gid, rate: bv.rate, inputs: bv.inputs, silo: true, siloFeed: SILO[gid] },
      true
    );
  }

  // Hacienda modules (Seeds of Change). A hacienda grows and brews things a New
  // World island otherwise can't — Old World crops included — and each recipe
  // is its own building in the build menu, so they are their own entries rather
  // than the plain farms with the New World added: the hacienda version is the
  // only one you can put up over there. Rates are the wiki's production cycles.
  // Every farm matches its non-hacienda twin; two of the breweries do NOT —
  // hacienda schnapps runs at half the Old World distillery's speed, and
  // hacienda beer is brewed from Grain and Corn rather than Hops and Malt.
  // Hot Sauce and Atole exist only as hacienda recipes and are already in
  // data.json under their hacienda names.
  const HACIENDA: { name: string; good: string; rate: number; inputs: string[] }[] = [
    { name: "Hacienda Sugar Cane Farm", good: "sugar_cane", rate: 2, inputs: [] },
    { name: "Hacienda Corn Farm", good: "corn", rate: 1, inputs: [] },
    { name: "Hacienda Coffee Farm", good: "coffee_beans", rate: 1, inputs: [] },
    { name: "Hacienda Caoutchouc Plantation", good: "caoutchouc", rate: 1, inputs: [] },
    { name: "Hacienda Cocoa Farm", good: "cocoa", rate: 1, inputs: [] },
    { name: "Hacienda Potato Farm", good: "potatoes", rate: 2, inputs: [] },
    { name: "Hacienda Spice Farm", good: "spices", rate: 1, inputs: [] },
    { name: "Hacienda Grain Farm", good: "grain", rate: 1, inputs: [] },
    { name: "Hacienda Rum Distillery", good: "rum", rate: 2, inputs: ["wood_nw", "sugar_cane"] },
    { name: "Hacienda Beer Brewery", good: "beer", rate: 1, inputs: ["grain", "corn"] },
    { name: "Hacienda Schnapps Distillery", good: "schnapps", rate: 1, inputs: ["potatoes"] },
  ];
  for (const h of HACIENDA) {
    register(h.name, {
      good: h.good,
      rate: h.rate,
      inputs: h.inputs.map((good) => ({ good, qty: 1 })),
    });
    noteRegion(h.name, 2);
    // Only where the New World has no other source: Corn already has its own
    // farm there, but Potatoes, Grain and Spices arrive by hacienda alone, so a
    // gap on a New World island should name the hacienda module.
    const g = GOODS[h.good];
    if (g) notePro(g.name, 2, h.name, h.rate);
  }

  // Buildings you can also put up outside their good's home region — the index
  // works the region out from the good (Coal is Old World, so the kiln was too)
  // and that hides real options. The kiln is buildable in the New World with
  // Empire of the Skies or New World Rising, and in the Arctic (The Passage)
  // where it is what feeds the heaters.
  const ALSO_IN: Record<string, number[]> = { "Charcoal Kiln": [2, 4] };
  for (const [name, regions] of Object.entries(ALSO_IN)) {
    const v = ix.variants.get(name.toLowerCase());
    for (const r of regions) {
      noteRegion(name, r);
      const g = v && GOODS[v.good];
      if (v && g) notePro(g.name, r, name, v.rate);
    }
  }

  return {
    ...ix,
    goodName: (id) => GOODS[id]?.name ?? id,
    finalGood: (id) => !!GOODS[id]?.isFinal,
    siloFeedRate: SILO_FEED,
    fuelGood: null,
    fuelPerMin: 0,
    elecRegion: 1,
    options: [...ix.names].sort(),
  };
}

function build117(): Index {
  const ix = emptyIndex();
  const noteRegion = (name: string, mask: number) => {
    const k = name.toLowerCase();
    let s = ix.nameRegions.get(k);
    if (!s) ix.nameRegions.set(k, (s = new Set()));
    // The pack stores a bitmask; the datalist filters on single region ids.
    for (const r of [1, 2]) if (mask & r) s.add(r);
  };
  const register = (name: string, v: Variant): boolean => {
    const k = name.toLowerCase();
    if (ix.variants.has(k)) return false;
    ix.variants.set(k, v);
    ix.names.push(name);
    return true;
  };

  // Latium first so it owns contested plain names, mirroring 1800's Old World
  // preference. A good's producers each become their own entry; where two share
  // a name but differ in rate or chain, the later one is region-suffixed.
  for (const g of Object.values(GOODS_117).sort(
    (a, b) => a.region - b.region || a.name.localeCompare(b.name)
  )) {
    for (const p of g.producers) {
      const rate = p.time ? Math.round((60 / p.time) * 1e6) / 1e6 : 0;
      const inputs = p.inputs
        ? p.inputs.split("|").map((good) => ({ good, qty: 1 }))
        : [];
      const clash = ix.variants.get(p.building.toLowerCase());
      const sameChain =
        clash &&
        clash.rate === rate &&
        clash.inputs.map((i) => i.good).join("|") === p.inputs;
      const region = REGIONS_117[p.region & 1 ? 1 : 2];
      const name = clash && !sameChain ? `${p.building} (${region})` : p.building;
      // Both modifiers are per-building here: only the three farms flagged
      // `silo` in the pack take one, and only the 23 flagged `fuel` burn Coal.
      const siloFeed = p.silo ? SILO_117.feedGood || undefined : undefined;
      const v: Variant = { good: g.id, rate, inputs, siloFeed, fuel: p.fuel };
      if (register(name, v) && !ix.primaryName[g.id]) ix.primaryName[g.id] = name;
      // Remember the entry per region, so a plan built in Albion seeds the
      // Albion entry rather than the primary (Latium) one.
      for (const r of [1, 2]) if (p.region & r) ix.regionName.set(`${g.id}|${r}`, name);
      noteRegion(name, p.region);
      if (!ix.producer[g.name]) ix.producer[g.name] = { building: name, rate };
      for (const r of [1, 2]) {
        const k = `${g.name}|${r}`;
        if (p.region & r && !ix.producerAt.has(k)) ix.producerAt.set(k, { building: name, rate });
      }
    }
  }

  return {
    ...ix,
    goodName: (id) => GOODS_117[id]?.name ?? id,
    finalGood: (id) => !!GOODS_117[id]?.isFinal,
    // The Silo's +100% productivity is the same ×2 the 1800 silo gives, so the
    // output formula below is shared; only the feed rate differs (0.2 t/min of
    // Wheat). tests/pack117 pins the +100% so a re-extraction that changes it
    // fails rather than quietly halving every silo'd farm.
    siloFeedRate: SILO_117.feedPerMin ?? 0,
    // One Coal per FUEL_117.time seconds of run time, per burning building.
    fuelGood: FUEL_117.good,
    fuelPerMin: FUEL_117.time ? 60 / FUEL_117.time : 0,
    elecRegion: null,
    options: [...ix.names].sort(),
  };
}

const INDEX: Record<Game, Index> = {
  anno1800: build1800(),
  anno117: build117(),
};

const ix = (game: Game = "anno1800") => INDEX[game];

/** Every building name the inventory understands, for the datalist. */
export function buildingOptions(game: Game = "anno1800"): string[] {
  return ix(game).options;
}

/** Datalist names for one region — 1800: 1 OW, 2 NW, 4 Arctic, 5 Enbesa;
 *  117: 1 Latium, 2 Albion. An island with no region set gets the full list. */
export function buildingOptionsFor(region?: number, game: Game = "anno1800"): string[] {
  const I = ix(game);
  if (!region) return I.options;
  return I.options.filter((n) => I.nameRegions.get(n.toLowerCase())?.has(region));
}

/** Can this inventory item take a silo module? Animal farms in both games —
 *  1800's SILO goods, and 117's Sheep Farm / Pig Farm / Horse Breeder. */
export function siloCapable(itemName: string, game: Game = "anno1800"): boolean {
  const v = ix(game).variants.get(itemName.trim().toLowerCase());
  return !!v && !v.silo && !!v.siloFeed;
}

/** Can this inventory item be electrified? Same rule as the calculator
 *  (`electrifiable`): Old World production buildings, ×2 when powered.
 *  117 has no electricity, so this is always false there. */
export function elecCapable(itemName: string, game: Game = "anno1800"): boolean {
  const I = ix(game);
  if (I.elecRegion == null) return false;
  const v = I.variants.get(itemName.trim().toLowerCase());
  if (!v) return false;
  const good = game === "anno117" ? GOODS_117[v.good] : GOODS[v.good];
  return !!good && good.region === I.elecRegion;
}

/** The inventory item name for a produced good — the ledger's own entry, so a
 *  seeded line parses straight back into the ledger (region-suffixed where the
 *  rates or the inputs differ, e.g. "Cattle Farm (New World)", "Tannery
 *  (Albion)"). Pass the region a 117 plan is built in; 1800 has no per-region
 *  producers, so it ignores the argument. */
export function itemNameForGood(
  goodId: string,
  game: Game = "anno1800",
  region = 0
): string | null {
  const I = ix(game);
  if (region) {
    const byRegion = I.regionName.get(`${goodId}|${region}`);
    if (byRegion) return byRegion;
  }
  return I.primaryName[goodId] ?? null;
}

/** Good id an inventory item name produces, or null if it's not a building
 *  the calculator knows (landmark chips, free-text items). */
export function itemGood(itemName: string, game: Game = "anno1800"): string | null {
  return ix(game).variants.get(itemName.trim().toLowerCase())?.good ?? null;
}

export interface LedgerRow {
  name: string; // good display name (regions merged: Wood is Wood)
  produced: number; // t/min made by ticked buildings
  used: number; // t/min consumed by ticked buildings (inputs + silo feed)
  net: number;
  // End product (pop need/want or construction material) rather than a chain
  // intermediate — the UI dims these so the rows that should balance to 0
  // stand out. A final can still be consumed locally (Soap → shampoo).
  final?: boolean;
  // Set when net is negative: how many of the good's producer (or equivalent)
  // would cover the shortfall. 5 silo farms × 0.2 feed = 1× Grain Farm.
  fix?: { building: string; count: number };
  // Trade (build 96): what arrives from / departs to other islands, with the
  // t/min actually moved. Amounts are allocated by applyTrade; a covered
  // deficit's numbers move too (imports count into `produced`, exports into
  // `used`), so net keeps meaning makes − uses.
  imp?: { from: string; tpm: number }[];
  exp?: { to: string; tpm: number }[];
}

/** The flows applyTrade reads: explicit links (ticked on a ledger row) and
 *  ship routes, which imply the same when from/to/cargo are all filled in. */
export interface TradeFlow {
  good: string;
  from: string;
  to: string;
}

/** "Build N× X" for a deficit, priced in the island's own region. */
function priceFix(
  I: Index,
  name: string,
  region: number,
  deficit: number
): LedgerRow["fix"] {
  const pr = (region ? I.producerAt.get(`${name}|${region}`) : null) ?? I.producer[name];
  if (!pr) return undefined;
  return { building: pr.building, count: Math.ceil(deficit / pr.rate - 1e-9) };
}

/** Move goods along the trade flows, across ALL islands' ledgers at once.
 *
 *  Each flow transfers min(source surplus, destination deficit) of its good —
 *  in flow order, so several importers split one surplus first-come and a
 *  second link takes what the first left. The moved t/min lands in the
 *  destination's `produced` and the source's `used` (net stays makes − uses),
 *  and both rows grow a chip (`imp`/`exp`) naming the other end and the
 *  amount — 0 when the link exists but nothing is spare to send. Every `fix`
 *  is then re-priced on the remaining deficit, so a partly-covered island
 *  asks for the remainder only.
 *
 *  `ledgers` and `regions` are keyed by island name; matching is
 *  case-insensitive on both islands and goods. Rows are annotated in place. */
export function applyTrade(
  ledgers: Record<string, LedgerRow[]>,
  regions: Record<string, number>,
  flows: TradeFlow[],
  game: Game = "anno1800"
): void {
  const I = ix(game);
  const byIsle = new Map<string, { rows: LedgerRow[]; name: string }>();
  for (const [name, rows] of Object.entries(ledgers))
    byIsle.set(name.trim().toLowerCase(), { rows, name });
  const rowOf = (isle: string, good: string) =>
    byIsle
      .get(isle.trim().toLowerCase())
      ?.rows.find((r) => r.name.toLowerCase() === good.trim().toLowerCase());
  for (const f of flows) {
    if (!f.good || !f.from || !f.to) continue;
    const src = rowOf(f.from, f.good);
    const dst = rowOf(f.to, f.good);
    // No consumer row on the destination → the link has nothing to say there,
    // and without it we can't even name the good's display form. Skip.
    if (!dst && !src) continue;
    const spare = src ? Math.max(0, src.net) : 0;
    const lack = dst ? Math.max(0, -dst.net) : 0;
    const amt = Math.min(spare, lack);
    if (src) {
      src.used += amt;
      src.net -= amt;
      (src.exp ??= []).push({ to: f.to.trim(), tpm: amt });
    }
    if (dst) {
      dst.produced += amt;
      dst.net += amt;
      (dst.imp ??= []).push({ from: f.from.trim(), tpm: amt });
    }
  }
  // Re-price every shortfall on what trade left uncovered. An imported row
  // that is still short keeps a fix for the remainder; a fully covered one
  // loses it. A row that only EXPORTED into deficit would be self-inflicted —
  // amounts are capped at the surplus, so that cannot happen.
  for (const { rows, name } of byIsle.values()) {
    const region = regions[name] || 0;
    for (const r of rows) {
      delete r.fix;
      if (r.net < -1e-9) r.fix = priceFix(I, r.name, region, -r.net);
    }
  }
}

/** Sum one island's checklist into per-good makes/uses/net rows.
 *  Unticked (broken) buildings and non-building items are skipped.
 *  `region` is the island's 🌍 tag as a region number (0 = untagged); it only
 *  affects which building a shortfall suggests. */
export function islandLedger(
  items: CheckItem[],
  game: Game = "anno1800",
  region = 0
): LedgerRow[] {
  const I = ix(game);
  const produced: Record<string, number> = {};
  const used: Record<string, number> = {};
  // Display names of end-product goods seen on this island. Kept by name, not
  // id, because rows merge regions (wood/wood_nw are both "Wood") — the
  // regional twins agree on finality, so any id can speak for the name.
  const finals = new Set<string>();
  const note = (goodId: string, name: string) => {
    if (I.finalGood(goodId)) finals.add(name);
  };
  for (const c of items) {
    if (!c.done) continue;
    const v = I.variants.get(c.t.trim().toLowerCase());
    if (!v) continue;
    const n = Math.max(1, c.n || 1);
    const feedGood = v.siloFeed ?? null;
    // sc of the line's n farms have a silo (make ×2, eat feed) — a line can
    // be part-silo'd. Legacy "(silo)" names mean all of them.
    const sc = feedGood ? (v.silo ? n : Math.min(Math.max(0, c.s || 0), n)) : 0;
    // ec of them are powered (×2, Old World only, no feed edge — same rule as
    // the engine's `electrifiable`). Where a building has both, the two
    // multipliers stack to ×4, as in `effRate`; with both counters partial the
    // powered ones are taken to be the silo'd ones first.
    const ec = elecCapable(c.t, game) ? Math.min(Math.max(0, c.e || 0), n) : 0;
    const out = (n + sc + ec + Math.min(sc, ec)) * v.rate;
    const gname = I.goodName(v.good);
    produced[gname] = (produced[gname] || 0) + out;
    note(v.good, gname);
    for (const inp of v.inputs) {
      const nm = I.goodName(inp.good);
      used[nm] = (used[nm] || 0) + out * inp.qty;
      note(inp.good, nm);
    }
    if (sc > 0 && feedGood) {
      const nm = I.goodName(feedGood);
      used[nm] = (used[nm] || 0) + sc * I.siloFeedRate;
      note(feedGood, nm);
    }
    // Fuel (117's Coal) is burnt per minute of RUN time, not per ton made, so
    // it scales with the building count and NOT with the silo/power multipliers
    // — unlike the chain inputs above, which scale with output.
    if (v.fuel && I.fuelGood) {
      const nm = I.goodName(I.fuelGood);
      used[nm] = (used[nm] || 0) + n * I.fuelPerMin;
      note(I.fuelGood, nm);
    }
  }
  return [...new Set([...Object.keys(produced), ...Object.keys(used)])]
    .sort()
    .map((name) => {
      const p = produced[name] || 0;
      const u = used[name] || 0;
      const row: LedgerRow = { name, produced: p, used: u, net: p - u };
      if (finals.has(name)) row.final = true;
      if (row.net < -1e-9) row.fix = priceFix(I, name, region, u - p);
      return row;
    });
}
