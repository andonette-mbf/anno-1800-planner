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
// M10: one index per game. 1800's is built exactly as before; every other
// game's is derived from its `Dataset` (M12) — the same seam the calculator
// reads — where `recipe()` already resolves a producer per region with its
// OWN inputs (Leather, Amphorae and Tiles take different ingredients in
// Latium and Albion, so inputs cannot be read off the good the way 1800
// allows).
//
// 117's modifiers land on the variant, not the good. Its Silo is the same deal
// as 1800's (×2 output, feed per silo per minute) but only three buildings take
// one, and that is a fact about the building. Its Coal fuel has no 1800
// counterpart: a fuel-burning building eats Coal per minute of RUN time whatever
// it makes, so it is a consumption edge of its own rather than a rate modifier.
import { GOODS, SILO, SILO_FEED } from "./data";
import { DATASETS, type Dataset, type DatasetState } from "./dataset";
import { DEFAULT_STATE, popTargets, type CalcState } from "./engine";
import { GAMES, GAME_CONTENT, type Game } from "./games";
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
  options: string[];
}

type IndexCore = Omit<
  Index,
  "goodName" | "finalGood" | "siloFeedRate" | "fuelGood" | "fuelPerMin" | "options"
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
    options: [...ix.names].sort(),
  };
}

/** Any game with a data pack gets its index from the game's `Dataset` — no
 *  code here to add for a new game. `recipe()` resolves a producer exactly the
 *  way the calculator planning in that region would, so the ledger and the
 *  calculator can never disagree; silo, fuel and the feed/fuel rates all ride
 *  the same object. Assumes the pack's region ids are single bits of the
 *  goods' `region` bitmask (117: 1 Latium / 2 Albion) — the M12 contract for
 *  new packs, since a producer has to be resolvable per region. */
function buildFromDataset(D: Dataset): Index {
  const ix = emptyIndex();
  const noteRegion = (name: string, region: number) => {
    const k = name.toLowerCase();
    let s = ix.nameRegions.get(k);
    if (!s) ix.nameRegions.set(k, (s = new Set()));
    s.add(region);
  };
  const register = (name: string, v: Variant): boolean => {
    const k = name.toLowerCase();
    if (ix.variants.has(k)) return false;
    ix.variants.set(k, v);
    ix.names.push(name);
    return true;
  };
  // A state pinned to one region, which is all recipe() reads beyond the id.
  const stateIn = (region: number): DatasetState => ({
    game: D.game,
    regionFilter: region,
    coalTime: DEFAULT_STATE.coalTime,
    lifestyle: false,
    pop: {},
  });

  // Ascending region order, so the first region owns contested plain names —
  // Latium before Albion, mirroring 1800's Old World preference. Where two
  // regions' producers share a name but differ in rate or chain, the later
  // one is region-suffixed; where they agree entirely, the entries merge.
  for (const r of Object.keys(D.regions)
    .map(Number)
    .sort((a, b) => a - b)) {
    const st = stateIn(r);
    for (const g of Object.values(D.goods)
      .filter((gd) => gd.region & r)
      .sort((a, b) => a.name.localeCompare(b.name))) {
      // Every producer buildable here, the calculator's pick first — a good
      // gathered from a deposit (117's Obsidian) has none and registers
      // nothing: there is no building to count.
      for (const rec of D.recipes(st, g.id)) {
        const clash = ix.variants.get(rec.building.toLowerCase());
        const sameChain =
          clash &&
          clash.rate === rec.rate &&
          clash.inputs.map((i) => i.good).join("|") === rec.inputs.map((i) => i.good).join("|");
        const name = clash && !sameChain ? `${rec.building} (${D.regions[r]})` : rec.building;
        const v: Variant = {
          good: g.id,
          rate: rec.rate,
          inputs: rec.inputs,
          siloFeed: rec.siloFeed ?? undefined,
          fuel: rec.fuel || undefined,
        };
        if (register(name, v) && !ix.primaryName[g.id]) ix.primaryName[g.id] = name;
        // Remember the entry per region, so a plan built in Albion seeds the
        // Albion entry rather than the primary (Latium) one.
        ix.regionName.set(`${g.id}|${r}`, name);
        noteRegion(name, r);
        if (!ix.producer[g.name]) ix.producer[g.name] = { building: name, rate: rec.rate };
        const k = `${g.name}|${r}`;
        if (!ix.producerAt.has(k)) ix.producerAt.set(k, { building: name, rate: rec.rate });
      }
    }
  }

  return {
    ...ix,
    goodName: (id) => D.goods[id]?.name ?? id,
    finalGood: (id) => !!D.goods[id]?.isFinal,
    siloFeedRate: D.siloFeedRate,
    fuelGood: D.fuelGood,
    fuelPerMin: D.fuelPerMin,
    options: [...ix.names].sort(),
  };
}

// One index per game. 1800's build stays bespoke for good — its legacy
// "(silo)" entry names, hacienda modules and ALSO_IN regions predate the
// dataset and exist in no pack; everything since reads its Dataset.
const INDEX = Object.fromEntries(
  GAMES.map((g) => [g.id, g.id === "anno1800" ? build1800() : buildFromDataset(DATASETS[g.id])])
) as Record<Game, Index>;

const ix = (game: Game = "anno1800") => INDEX[game];

// ------------------------------------------------- taught recipes (M13)

/** A production fact typed in as the player learns it from the game — for
 *  games that ship NO data pack (the four Tracker-only Annos). There are no
 *  pack ids to key on, so the good's display name IS its id (`goodName` in
 *  the taught index is identity), and inputs follow the packs' one-ton-per-
 *  ton convention. `building` matches the inventory entry by name, exactly
 *  like a pack building. */
export interface UserRecipe {
  building: string;
  /** Display name of the good it makes. */
  good: string;
  /** Seconds one production cycle takes — what the game shows on the tile. */
  time: number;
  /** Tons per cycle (default 1). */
  amount?: number;
  /** Display names of the goods it eats, one ton each per ton made. */
  inputs?: string[];
}

/** t/min a taught recipe works out to, rounded the way the packs round. */
export function userRate(r: UserRecipe): number {
  return r.time > 0 ? Math.round((((r.amount ?? 1) * 60) / r.time) * 1e6) / 1e6 : 0;
}

/** An index built purely from taught rows. Every entry is registered in ALL
 *  of the game's regions — the player is the region rule here, and hiding a
 *  taught building from a tagged island's datalist would just look broken. */
function buildTaught(game: Game, rows: UserRecipe[]): Index {
  const ixc = emptyIndex();
  const regions = Object.values(GAME_CONTENT[game].regionNum);
  for (const r of rows) {
    const name = r.building.trim();
    const good = r.good.trim();
    const rate = userRate(r);
    const k = name.toLowerCase();
    if (!name || !good || rate <= 0 || ixc.variants.has(k)) continue;
    ixc.variants.set(k, {
      good,
      rate,
      inputs: (r.inputs ?? [])
        .map((g) => g.trim())
        .filter(Boolean)
        .map((g) => ({ good: g, qty: 1 })),
    });
    ixc.names.push(name);
    if (!ixc.primaryName[good]) ixc.primaryName[good] = name;
    if (!ixc.producer[good]) ixc.producer[good] = { building: name, rate };
    for (const rn of regions) {
      let s = ixc.nameRegions.get(k);
      if (!s) ixc.nameRegions.set(k, (s = new Set()));
      s.add(rn);
      if (!ixc.producerAt.has(`${good}|${rn}`))
        ixc.producerAt.set(`${good}|${rn}`, { building: name, rate });
    }
  }
  return {
    ...ixc,
    goodName: (id) => id,
    finalGood: () => false,
    siloFeedRate: 0,
    fuelGood: null,
    fuelPerMin: 0,
    options: [...ixc.names].sort(),
  };
}

// Rebuilds are keyed on the rows' JSON so render-time calls are effectively
// free; per game, so switching games never sheds another game's teaching.
const taughtSig: Partial<Record<Game, string>> = {};

/** Point a PACKLESS game's ledger index at the save's taught recipes (M13).
 *  Called by the store provider on every render, so everything downstream —
 *  datalists, `itemGood`, `islandLedger`, trade — sees the taught buildings
 *  with no further wiring. A game WITH a pack ignores this entirely: its
 *  numbers are canonical, and teaching is for filling the void, not
 *  overriding the packs. */
export function teachRecipes(game: Game, rows: UserRecipe[]): void {
  if (DATASETS[game].hasCalc) return;
  const sig = JSON.stringify(rows);
  if (taughtSig[game] === sig) return;
  taughtSig[game] = sig;
  INDEX[game] = buildTaught(game, rows);
}

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

/** Farms take no power in the game — their boosts are silos, fertiliser and
 *  tractors — so the chip stays off field growers, livestock, fisheries and
 *  hacienda buildings, which the pack only knows by name. The dataset rules
 *  stay good-based (the calculator's over-broad electricity contract); this
 *  name test is the ledger's own refinement on top. */
const FARMISH =
  /\b(farm|plantation|orchard|vineyard|pasture|garden|apiary|fishery|hunting|whaling)\b|^(hacienda |saltpeter works)/i;

/** How can this inventory item be powered? "elec" is the calculator's
 *  `electrifiable` rule verbatim (1800's Old World, nothing in 117); "fuel"
 *  is the dataset's `fuelStation` rule (New World Rising's ⛽, the same ×2,
 *  Tracker-only — the legacy calculator predates the DLC). Farms: never. */
export function powerKind(
  itemName: string,
  game: Game = "anno1800"
): "elec" | "fuel" | null {
  const n = itemName.trim().toLowerCase();
  const v = ix(game).variants.get(n);
  if (!v || FARMISH.test(n)) return null;
  if (DATASETS[game].electrifiable(v.good)) return "elec";
  if (DATASETS[game].fuelStation?.(v.good)) return "fuel";
  return null;
}

/** Can this inventory item be powered at all (electricity or fuel station)?
 *  The ledger's ×2 maths is identical for both. */
export function elecCapable(itemName: string, game: Game = "anno1800"): boolean {
  return powerKind(itemName, game) !== null;
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
  // How much of `used` is residents eating (M8) — the 👥 counts × per-resident
  // need rates. Absent when no residents consume this good here.
  res?: number;
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
  /** Cap: at most this many t/min ride the link (both passes together).
   *  Absent means uncapped — the link takes whatever is spare. 0 is a real
   *  cap: the link stands but ships nothing, keeping the surplus home. */
  tpm?: number;
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
 *  Exported means GONE. Two passes:
 *
 *  1. Tracked shortfalls first, in flow order — each link ships
 *     min(remaining surplus, what its destination is short of, its cap's
 *     remaining room), so several importers split one surplus first-come.
 *  2. Whatever the source still has spare ships anyway, along the good's
 *     links in flow order: a capped link takes up to its remaining room, the
 *     first uncapped link takes everything left — a route carries the spare
 *     whether or not the other end's consumers are tracked (cotton sent to
 *     Cape Trelawney for furs is spoken for even though no tracked building
 *     eats it). It lands as stock on the destination, whose row is created
 *     if it has no local maker or user of the good. When EVERY link is
 *     capped, what the caps don't take stays home — that is how an island
 *     retains a buffer of its own surplus.
 *
 *  Moved t/min lands in the destination's `produced` and the source's `used`
 *  (net stays makes − uses); both rows grow a chip (`imp`/`exp`) naming the
 *  other end and the total carried — 0 when a link exists but nothing was
 *  there to send. Every `fix` is then re-priced on what trade left
 *  uncovered, so a part-covered island asks for the remainder only.
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
  // A destination can receive a good nothing there makes or uses yet — give
  // it a row so the stock shows up. `display` keeps the source row's casing.
  const ensureRow = (isle: string, display: string) => {
    const entry = byIsle.get(isle.trim().toLowerCase());
    if (!entry) return undefined;
    let row = entry.rows.find((r) => r.name.toLowerCase() === display.toLowerCase());
    if (!row) {
      row = { name: display, produced: 0, used: 0, net: 0 };
      entry.rows.push(row);
    }
    return row;
  };
  // Chip amounts accumulate across both passes, one chip per link.
  const carried = new Map<string, { f: TradeFlow; amt: number }>();
  const note = (f: TradeFlow, amt: number) => {
    const k = `${f.good}|${f.from}|${f.to}`.toLowerCase();
    const t = carried.get(k);
    if (t) t.amt += amt;
    else carried.set(k, { f, amt });
  };
  const move = (src: LedgerRow, dst: LedgerRow, amt: number) => {
    src.used += amt;
    src.net -= amt;
    dst.produced += amt;
    dst.net += amt;
  };
  const valid = flows.filter((f) => f.good && f.from && f.to);
  // How much each link has carried so far, so a cap spans both passes.
  const shipped = new Map<string, number>();
  const linkKey = (f: TradeFlow) => `${f.good}|${f.from}|${f.to}`.toLowerCase();
  const room = (f: TradeFlow) =>
    f.tpm != null ? Math.max(0, f.tpm - (shipped.get(linkKey(f)) || 0)) : Infinity;
  const ship = (f: TradeFlow, amt: number) => {
    shipped.set(linkKey(f), (shipped.get(linkKey(f)) || 0) + amt);
    note(f, amt);
  };
  // Pass 1 — tracked shortfalls, in flow order.
  for (const f of valid) {
    const src = rowOf(f.from, f.good);
    const dst = rowOf(f.to, f.good);
    if (!src && !dst) continue;
    const amt = Math.min(
      src ? Math.max(0, src.net) : 0,
      dst ? Math.max(0, -dst.net) : 0,
      room(f)
    );
    if (amt > 0) move(src!, dst!, amt);
    ship(f, amt);
  }
  // Pass 2 — the leftovers ride the good's links in order, each capped link
  // up to its room, an uncapped one taking all that remains.
  for (const f of valid) {
    const src = rowOf(f.from, f.good);
    if (!src || src.net <= 1e-9) continue;
    const amt = Math.min(src.net, room(f));
    if (amt <= 1e-9) continue;
    const dst = ensureRow(f.to, src.name);
    if (!dst) continue;
    move(src, dst, amt);
    ship(f, amt);
  }
  for (const { f, amt } of carried.values()) {
    const src = rowOf(f.from, f.good);
    const dst = rowOf(f.to, f.good);
    if (src) (src.exp ??= []).push({ to: f.to.trim(), tpm: amt });
    if (dst) (dst.imp ??= []).push({ from: f.from.trim(), tpm: amt });
  }
  // Re-price every shortfall on what trade left uncovered, and keep the rows
  // alphabetical — pass 2 can have appended new ones.
  for (const { rows, name } of byIsle.values()) {
    rows.sort((a, b) => a.name.localeCompare(b.name));
    const region = regions[name] || 0;
    for (const r of rows) {
      delete r.fix;
      if (r.net < -1e-9) r.fix = priceFix(I, r.name, region, -r.net);
    }
  }
}

/** A trade the ledgers argue for (M9): `to` is short `tpm` t/min of `good`
 *  that `from` has spare. Names are display forms, same as the ledger rows. */
export interface TradeSuggestion {
  good: string;
  from: string;
  to: string;
  tpm: number;
}

/** Pair what's left over with what's still short, per good, across islands.
 *
 *  Feed this the POST-trade ledgers (after `applyTrade`), never the raw ones:
 *  a surplus an accepted link already ships is spent — it must not be offered
 *  twice — and a deficit a ship route covers is not a deficit. Rows are read,
 *  never mutated.
 *
 *  The pairing is deterministic: goods alphabetically, each good's largest
 *  deficit first, served from its largest surplus first (ties break on island
 *  name); a source's remaining spare carries over, so a second taker gets
 *  what's left, not the full amount again. Recorded flows (`flows`: links and
 *  ship routes) are never re-suggested, and neither is their reverse — a good
 *  must not sail both ways between the same two islands. */
export function suggestTrades(
  ledgers: Record<string, LedgerRow[]>,
  flows: TradeFlow[] = []
): TradeSuggestion[] {
  const key = (g: string, a: string, b: string) => `${g}|${a}|${b}`.trim().toLowerCase();
  const taken = new Set<string>();
  for (const f of flows) {
    if (!f.good || !f.from || !f.to) continue;
    taken.add(key(f.good, f.from, f.to));
    taken.add(key(f.good, f.to, f.from));
  }
  type Side = { isle: string; amt: number };
  const perGood = new Map<string, { sur: Side[]; def: Side[] }>();
  for (const [isle, rows] of Object.entries(ledgers))
    for (const r of rows) {
      if (Math.abs(r.net) <= 1e-9) continue;
      let g = perGood.get(r.name);
      if (!g) perGood.set(r.name, (g = { sur: [], def: [] }));
      if (r.net > 0) g.sur.push({ isle, amt: r.net });
      else g.def.push({ isle, amt: -r.net });
    }
  const bySize = (a: Side, b: Side) => b.amt - a.amt || a.isle.localeCompare(b.isle);
  const out: TradeSuggestion[] = [];
  for (const good of [...perGood.keys()].sort((a, b) => a.localeCompare(b))) {
    const { sur, def } = perGood.get(good)!;
    if (!sur.length || !def.length) continue;
    sur.sort(bySize);
    def.sort(bySize);
    for (const d of def)
      for (const s of sur) {
        if (d.amt <= 1e-9) break;
        if (s.amt <= 1e-9 || taken.has(key(good, s.isle, d.isle))) continue;
        const amt = Math.min(s.amt, d.amt);
        s.amt -= amt;
        d.amt -= amt;
        out.push({ good, from: s.isle, to: d.isle, tpm: amt });
      }
  }
  return out;
}

/** The consumption knobs resident demand is scaled by (M8) — the calculator's
 *  own settings: 1800's lifestyle toggle + consumption slider, 117's needs
 *  band. Global per save, matching the calculator's single setting. */
export interface PopSettings {
  /** Consumption rate %, default 100 (item buffs lower it). */
  cons?: number;
  /** 1800: count lifestyle needs too. */
  lifestyle?: boolean;
  /** 117: supply needs up to this band (0 basic … 3 luxury). */
  band?: number;
}

/** What one island's residents eat, in t/min keyed by good DISPLAY name (the
 *  ledger's row identity). Deliberately NOT re-derived here: a synthetic
 *  pop-mode state goes through the engine's own `popTargets`, so the rates and
 *  every gate — 1800's unlock thresholds and lifestyle toggle, 117's supply
 *  bands — live in the dataset seam only. Thresholds gate on the island's OWN
 *  tier counts: 40 Farmers drink no schnapps, wherever the empire stands. */
export function residentUse(
  pop: Record<string, number>,
  game: Game = "anno1800",
  cfg: PopSettings = {}
): Record<string, number> {
  const I = ix(game);
  const st: CalcState = {
    ...DEFAULT_STATE,
    game,
    mode: "pop",
    sel: {},
    pop,
    cons: cfg.cons ?? 100,
    lifestyle: !!cfg.lifestyle,
    ...(cfg.band != null ? { band: cfg.band } : {}),
  };
  const out: Record<string, number> = {};
  const t = popTargets(st);
  for (const gid in t) {
    const nm = I.goodName(gid);
    out[nm] = (out[nm] || 0) + t[gid];
  }
  return out;
}

/** Sum one island's checklist into per-good makes/uses/net rows.
 *  Unticked (broken) buildings and non-building items are skipped.
 *  `region` is the island's 🌍 tag as a region number (0 = untagged); it only
 *  affects which building a shortfall suggests.
 *  `pop` (M8) adds what the island's residents eat — tier id → headcount,
 *  scaled by `cfg` — into `used`, so a Bakery island whose Workers out-eat the
 *  ovens goes short honestly. Runs BEFORE applyTrade, so links serve real
 *  shortfalls. */
export function islandLedger(
  items: CheckItem[],
  game: Game = "anno1800",
  region = 0,
  pop?: Record<string, number>,
  cfg?: PopSettings
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
    // ec of them are powered (×2, no feed edge) — Old World electricity per
    // the engine's `electrifiable`, or a New World Rising fuel station per
    // the dataset's `fuelStation`. Where a building has both, the two
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
  // Resident demand (M8) lands in `used` like any other consumption edge.
  // Everything popTargets emits is a pop good — final by definition — so the
  // rows dim like other end products, and a shortfall prices a fix as usual.
  const resUse = pop && Object.keys(pop).length ? residentUse(pop, game, cfg) : {};
  for (const nm in resUse) {
    used[nm] = (used[nm] || 0) + resUse[nm];
    finals.add(nm);
  }
  return [...new Set([...Object.keys(produced), ...Object.keys(used)])]
    .sort()
    .map((name) => {
      const p = produced[name] || 0;
      const u = used[name] || 0;
      const row: LedgerRow = { name, produced: p, used: u, net: p - u };
      if (resUse[name]) row.res = resUse[name];
      if (finals.has(name)) row.final = true;
      if (row.net < -1e-9) row.fix = priceFix(I, name, region, u - p);
      return row;
    });
}
