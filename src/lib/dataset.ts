// M10 phase 3: one engine, two games.
//
// `src/lib/engine.ts` used to read six module-level constants straight out of
// data.ts, which made every function silently 1800-only. This file is the seam:
// a `Dataset` bundles one game's tables together with the handful of rules that
// genuinely differ, and `datasetFor(state)` resolves it from the state the
// engine already carries. No engine signature changes, and a CalcState with no
// `game` is 1800 — so old share links, old saved plans and tests/golden.test.cjs
// all keep working untouched.
//
// What actually differs between the two games:
//
//  - **A good's producer varies by region in 117.** Flour is a Grain Mill (30s)
//    in Latium and a Donkey Mill (60s) in Albion — a different RATE. Leather is
//    a `Tannery` in BOTH regions at the same rate but takes pigs+salt in Latium
//    and pigs+wood in Albion — so it cannot be told apart by name or by rate.
//    `recipe(st, id)` is the single place that resolves this, and it also
//    subsumes 1800's coal-source switch (Charcoal Kiln 30s vs Coal Mine 15s),
//    which is the same idea: one good, more than one way to make it.
//  - **117 has no electricity**, so `electrifiable` is a per-game rule.
//  - **117 burns fuel.** 23 buildings eat one Coal per 120s of RUN time whatever
//    they make. That is an input edge scaled by building count, not a rate
//    modifier — the same shape as 1800's silo feed, so it reuses that machinery.
//  - **`region` is a bitmask in 117** (1 Latium, 2 Albion, 3 both; 29 goods are
//    in both), where 1800's is a plain id. Nothing outside this file subtracts
//    region numbers any more — display order goes through `regionRank`.
//  - **Needs.** 1800 gates on unlock thresholds plus the lifestyle toggle. 117's
//    pack has no thresholds at all: every need carries one of four `supplyWeight`
//    bands (basic / wanted / refined / luxury), and `st.band` is how far up the
//    player is buying. Both collapse into `needActive`.
//  - **Obsidian is gathered from a deposit**, not built. It is the only good in
//    either pack with no producer, and it is reachable (Statuettes, Latrunculi
//    Sets), so its rate is 0 and every building-count site has to skip it rather
//    than divide by zero.
import {
  CATLBL,
  GOODCAT,
  GOODS,
  POP,
  PRESETS,
  REGIONS,
  SILO,
  SILO_FEED,
  TIER_LABELS,
  TIER_ORDER,
  VERSION,
  regionColor as regionColor1800,
  type NeedDef,
} from "./data";
import {
  CAT_LABELS_117,
  FUEL_117,
  GOODCAT_117,
  GOODS_117,
  POP_117,
  REGIONS_117,
  SILO_117,
  TIER_LABELS_117,
  TIER_ORDER_117,
  VERSION_117,
  producerIn117,
} from "./data117";
import type { Game } from "./games";

export type { NeedDef } from "./data";

/** The subset of a good both packs agree on. `Good` and `Good117` each satisfy
 *  it structurally, so neither record has to be copied. */
export interface GoodView {
  id: string;
  name: string;
  /** 1800: a region id (1/2/4/5). 117: a BITMASK (1 Latium, 2 Albion, 3 both).
   *  Never compare these across games — go through `regionRank`. */
  region: number;
  tier: string | null;
  tierName: string | null;
  building: string | null;
  time: number;
  rate: number;
  inputs: { good: string; qty: number }[];
  isFinal: boolean;
}

/** One tier of residents, flattened across the two packs' differing field names. */
export interface TierView {
  lbl: string;
  /** Region the tier lives in (a plain id in both games — a tier is never split). */
  region: number;
  /** Residents in a fully-upgraded house. 117's pack has no such number. */
  housed: number | null;
  n: Record<string, NeedDef>;
}

/** How one building makes one good, once the game's choices are resolved:
 *  1800's coal source, 117's region. */
export interface Recipe {
  building: string;
  /** t/min at 100% productivity, before electricity/silo. 0 when gathered. */
  rate: number;
  inputs: { good: string; qty: number }[];
  /** Feed good if this producer can take a silo, else null. */
  siloFeed: string | null;
  /** Burns `fuelGood` per minute of run time (117's Coal). */
  fuel: boolean;
  /** Comes from a deposit, not a building — cannot be counted or built. */
  gathered: boolean;
}

/** Just enough of CalcState for a dataset to resolve its rules. Declared
 *  structurally so dataset.ts does not have to import engine.ts (engine.ts
 *  imports this one). */
export interface DatasetState {
  game?: Game;
  regionFilter: number;
  coalTime: number;
  lifestyle: boolean;
  band?: number;
  pop: Record<string, number>;
}

export interface Dataset {
  game: Game;
  version: string;
  goods: Record<string, GoodView>;
  pop: Record<string, TierView>;
  tierOrder: Record<string, number>;
  tierLabels: Record<string, string>;
  goodCat: Record<string, number>;
  /** Need band -> [label, css class, legend hint]. 1800 has three bands
   *  (need/want/lifestyle), 117 four (basic/wanted/refined/luxury). */
  catLabels: Record<number, [string, string, string]>;
  /** Region id -> name. In 117 these are the two halves of the bitmask. */
  regions: Record<number, string>;
  presets: { name: string; sel: Record<string, [string, number]> }[];

  /** True when the region chips pick the CHAIN, not just filter the picker —
   *  117 has no "All", because Leather's chain depends on where you build it. */
  regionIsPlanning: boolean;
  /** `regionFilter` a blank plan opens with (M12): 0 = "All" for a game whose
   *  regions only filter; a planning game names its starting region instead. */
  startRegion: number;
  /** t/min of feed one silo'd building eats. */
  siloFeedRate: number;
  /** Good every fuel-burning building consumes, or null (1800 has none). */
  fuelGood: string | null;
  /** t/min of fuel one burning building eats while it runs. */
  fuelPerMin: number;

  /** The producer to use for a good under this state. */
  recipe(st: DatasetState, id: string): Recipe;
  /** EVERY producer of the good buildable under this state, the calculator's
   *  pick first — 117's Coal Mine stands beside the Charcoal Burner, and the
   *  ledger indexes both so either inventory entry parses. Empty when the
   *  good is gathered (or simply not available in the state's region);
   *  `recipe` stays the single choice everything else plans with. */
  recipes(st: DatasetState, id: string): Recipe[];
  /** Can this good's building take electricity (×2)? 117: never. */
  electrifiable(id: string): boolean;
  /** Is this need consumed at the current settings? */
  needActive(st: DatasetState, d: NeedDef, tid: string): boolean;
  /** Display order key, replacing 1800's raw `region` subtraction. */
  regionRank(st: DatasetState, id: string): number;
  /** Region label for grouping headers; 117 marks cross-region imports. */
  regionLabel(st: DatasetState, id: string): string;
  /** Dot colour for a good, by the region it is actually produced in. */
  regionColor(st: DatasetState, id: string): string;
  /** Colour for a region itself (population tier headers, legends). */
  regionTint(region: number): string;
  /** Region key for the island ledger's per-region building names, or 0 when
   *  the game has no per-region producers. */
  itemRegion(st: DatasetState): number;
}

/** Both packs round rates the same way, so a resolved producer's rate matches
 *  the tuple's to the last bit. */
const perMin = (time: number): number => (time ? Math.round((60 / time) * 1e6) / 1e6 : 0);

/** Default need band for 117: everything except the top-tier luxuries. */
export const DEFAULT_BAND = 2;

/** Band labels for the 117 needs control, in order. */
export const BAND_LABELS = CAT_LABELS_117;

// ---------------------------------------------------------------- Anno 1800

const POP_1800: Record<string, TierView> = {};
for (const tid in POP)
  POP_1800[tid] = { lbl: POP[tid].lbl, region: POP[tid].r, housed: POP[tid].fh, n: POP[tid].n };

const ANNO1800: Dataset = {
  game: "anno1800",
  version: VERSION,
  goods: GOODS,
  pop: POP_1800,
  tierOrder: TIER_ORDER,
  tierLabels: TIER_LABELS,
  goodCat: GOODCAT,
  catLabels: {
    0: [...CATLBL[0], "basic (population)"],
    1: [...CATLBL[1], "happiness"],
    2: [...CATLBL[2], "optional bonus"],
  },
  regions: REGIONS,
  presets: PRESETS,

  regionIsPlanning: false,
  startRegion: 0,
  siloFeedRate: SILO_FEED,
  fuelGood: null,
  fuelPerMin: 0,

  // Coal is the one 1800 good with a choice of producer, and it is a global
  // setting rather than a per-region one — same shape as 117's region pick.
  recipe(st, id) {
    const g = GOODS[id];
    const coal = id === "coal";
    return {
      building: coal ? (st.coalTime === 15 ? "Coal Mine" : "Charcoal Kiln") : g.building,
      rate: coal ? 60 / st.coalTime : g.rate,
      inputs: g.inputs,
      siloFeed: SILO[id] ?? null,
      fuel: false,
      gathered: false,
    };
  },
  // The ledger's 1800 index is bespoke (legacy "(silo)" names, haciendas), so
  // this exists for the interface's sake: the current pick plus data.ts's alt
  // producers, deduped by name — coal's other source is already an alt.
  recipes(st, id) {
    const main = ANNO1800.recipe(st, id);
    const alts = (GOODS[id].alts ?? []).filter((a) => a.building !== main.building);
    return [
      main,
      ...alts.map((a) => ({
        building: a.building,
        rate: a.rate,
        inputs: GOODS[id].inputs,
        siloFeed: SILO[id] ?? null,
        fuel: false,
        gathered: false,
      })),
    ];
  },
  electrifiable: (id) => GOODS[id].region === 1,
  needActive(st, d) {
    if (d[1] === 2 && !st.lifestyle) return false;
    if (d[2] && (+(st.pop[d[2]] ?? 0) || 0) < (d[3] ?? 0)) return false;
    return true;
  },
  regionRank: (_st, id) => GOODS[id].region,
  regionLabel: (_st, id) => GOODS[id].regionName,
  regionColor: (_st, id) => regionColor1800(GOODS[id].region),
  regionTint: regionColor1800,
  itemRegion: () => 0,
};

// ----------------------------------------------------------------- Anno 117

const POP_TIERS_117: Record<string, TierView> = {};
for (const tid in POP_117)
  POP_TIERS_117[tid] = {
    lbl: POP_117[tid].lbl,
    region: POP_117[tid].region,
    // Still null, but no longer because the number is unknown: 117 residences
    // have no fixed capacity, so residents-per-house is a function of how many
    // needs you supply (`houseCapacity117`, pack 2). A single static figure
    // here would be wrong at every band but one, so the growth panel — which
    // knows the player's band — is where the number is shown instead.
    housed: null,
    // Only positions 0 and 1 (rate, category band) are the shared contract the
    // engine reads. Everything after is game-private and is only ever unpacked
    // by that game's `needActive`: 1800 keeps [unlockTier, threshold], 117 has
    // [residents granted per house]. The tails genuinely disagree in type, so
    // this is a deliberate reinterpretation rather than a structural cast.
    n: POP_117[tid].n as unknown as Record<string, NeedDef>,
  };

/** Which region a 117 plan is being built in. The region chips carry it (there
 *  is no "All" in 117), and Latium is the default. */
export function planRegion117(st: DatasetState): number {
  return st.regionFilter === 2 ? 2 : 1;
}

// 117's own pack ships no presets, so these are written here rather than
// hand-edited into data-117.json (which is generated). Every id is real and
// tests/pack117 keeps them honest.
const PRESETS_117: Dataset["presets"] = [
  {
    name: "🍲 Liberti basics",
    sel: { porridge: ["fac", 2], tunics: ["fac", 2], pileus: ["fac", 2], sardines: ["fac", 2] },
  },
  {
    name: "🛶 Wader basics",
    sel: { cockles: ["fac", 2], eels: ["fac", 2], reed_shoes: ["fac", 2], tunics: ["fac", 2] },
  },
  {
    name: "🏗️ Construction kit",
    sel: { timber: ["fac", 4], tiles: ["fac", 4], concrete: ["fac", 4], iron: ["fac", 2] },
  },
  {
    name: "🍷 Equite luxuries",
    sel: {
      wine: ["fac", 2],
      togas: ["fac", 2],
      fine_glass: ["fac", 2],
      writing_tablets: ["fac", 2],
    },
  },
];

// The pack's four supplyWeight bands are unlock waves: band 0 is what a fresh
// residence demands, band 3 what a fully upgraded one does.
const BAND_HINTS_117 = ["from a new residence", "unlocks next", "unlocks later", "top tier"];
const BAND_CLASSES_117 = ["pn", "pw", "pl", "px"];

const CATLBL_117: Record<number, [string, string, string]> = Object.fromEntries(
  CAT_LABELS_117.map((label, i) => [
    i,
    [label, BAND_CLASSES_117[i] ?? "pn", BAND_HINTS_117[i] ?? ""],
  ])
) as Record<number, [string, string, string]>;

const ANNO117: Dataset = {
  game: "anno117",
  version: VERSION_117,
  goods: GOODS_117,
  pop: POP_TIERS_117,
  tierOrder: TIER_ORDER_117,
  tierLabels: TIER_LABELS_117,
  goodCat: GOODCAT_117,
  catLabels: CATLBL_117,
  regions: REGIONS_117,
  presets: PRESETS_117,

  regionIsPlanning: true,
  // The campaign (and every scenario start) opens in Latium.
  startRegion: 1,
  // The Silo's +100% productivity is the same ×2 as 1800's, so only the feed
  // rate differs (0.2 t/min of Wheat). tests/pack117 pins the +100%.
  siloFeedRate: SILO_117.feedPerMin ?? 0,
  fuelGood: FUEL_117.good,
  fuelPerMin: FUEL_117.time ? 60 / FUEL_117.time : 0,

  recipe(st, id) {
    const g = GOODS_117[id];
    const p = producerIn117(id, planRegion117(st));
    // Obsidian: no producer at all. Rate 0 marks it unbuildable; the engine
    // still tracks how much you need, it just never counts buildings for it.
    if (!p)
      return {
        // There is no building, so name the source instead — the row reads
        // "Obsidian deposit → Obsidian" rather than "Obsidian → Obsidian".
        building: g.building ?? `${g.name} deposit`,
        rate: 0,
        inputs: g.inputs,
        siloFeed: null,
        fuel: false,
        gathered: true,
      };
    return {
      building: p.building,
      rate: perMin(p.time),
      inputs: p.inputs ? p.inputs.split("|").map((good) => ({ good, qty: 1 })) : [],
      siloFeed: p.silo ? SILO_117.feedGood ?? null : null,
      fuel: !!p.fuel,
      gathered: false,
    };
  },
  // Pack order, which leads with the pick `recipe` (producerIn117) makes —
  // so "the calculator's choice first" holds without a re-sort. Obsidian has
  // no producers and yields [], which is how the ledger knows not to count it.
  recipes(st, id) {
    const region = planRegion117(st);
    return (GOODS_117[id].producers ?? [])
      .filter((p) => p.region & region)
      .map((p) => ({
        building: p.building,
        rate: perMin(p.time),
        inputs: p.inputs ? p.inputs.split("|").map((good) => ({ good, qty: 1 })) : [],
        siloFeed: p.silo ? SILO_117.feedGood ?? null : null,
        fuel: !!p.fuel,
        gathered: false,
      }));
  },
  electrifiable: () => false,
  // No unlock thresholds in the pack — the four supplyWeight bands are the only
  // gate, and `band` is how far up the player is supplying.
  needActive: (st, d) => d[1] <= (st.band ?? DEFAULT_BAND),
  // Goods the plan's own region can make sort first; the rest are imports and
  // sort last, which is where a Latium player wants to see Beer and Cheese.
  regionRank: (st, id) => (GOODS_117[id].region & planRegion117(st) ? 0 : 1),
  regionLabel(st, id) {
    const home = planRegion117(st);
    if (GOODS_117[id].region & home) return REGIONS_117[home];
    return `${REGIONS_117[home === 1 ? 2 : 1]} · import`;
  },
  regionColor(st, id) {
    const home = planRegion117(st);
    const made = GOODS_117[id].region & home ? home : home === 1 ? 2 : 1;
    return ANNO117.regionTint(made);
  },
  // Terracotta for Latium, a Celtic green for Albion.
  regionTint: (region) => (region === 2 ? "#6f6f6f" : "#111111"),
  itemRegion: planRegion117,
};

export const DATASETS: Record<Game, Dataset> = { anno1800: ANNO1800, anno117: ANNO117 };

/** The dataset a state belongs to. No `game` means 1800, which is what keeps
 *  every pre-M10 share link, saved plan and golden-test scenario working. */
export function datasetFor(st: { game?: Game }): Dataset {
  return DATASETS[st.game ?? "anno1800"];
}
