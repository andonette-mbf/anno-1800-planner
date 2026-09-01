// Island fertilities & deposits (build 122): what a region CAN hand an island,
// so ticking what a settled island actually got shows what the region still
// lacks. The 1800 game shows this above the minimap when you hover an island;
// this is that list, kept, and set against the other islands you hold there.
//
// Two sources, one shape. 1800's table is hand-copied from the wiki's
// "Fertilities and resources" page (rev 25668) — the legacy data pack never
// carried it, and the calculator doesn't need it. 117's pack tags every
// producer with the island fertility/deposit it needs (`Producer117.fertility`),
// so its list is derived, not typed. A Tracker-only game has neither and gets
// null, which hides the feature — the same rule as culture and items.
//
// Where the ticks live: an island's recorded fertilities ride `islandItems`
// under the pseudo-socket id FERT_SOCKET, exactly as PatronBlock's pick does
// under "patron" — the island → id → names shape already syncs, saves per
// game, and follows an island through rename and delete, so the store needs
// no new field. It can't collide with a real socket: no pack names one "fert".
import { GOODS_117 } from "./data117";
import { GAME_CONTENT, type Game } from "./games";

export const FERT_SOCKET = "fert";

export interface RegionFertility {
  /** Crops, animals, fish — anywhere on the island once it has them. */
  fert: string[];
  /** Mine / clay / oil deposits — a fixed number of slots. */
  deposits: string[];
}

/** Region key (games.ts `regionLabels`) → what that region can deal out. Only
 *  canonical keys — an aliased tag (Cape Trelawney → ow) borrows its row. */
export type FertilityPack = Record<string, RegionFertility>;

// Anno 1800 Wiki, "Fertilities and resources", revision 25668. The Old World
// row is shared with Cape Trelawney on the page too. Region-wide abundances
// (Fish, Wool, Pigs…) are left out on purpose: every island has them, so
// there is nothing to be missing.
const FERT_1800: FertilityPack = {
  ow: {
    fert: ["Potatoes", "Grain", "Hops", "Red Peppers", "Furs", "Saltpetre", "Grapes"],
    deposits: ["Clay", "Iron", "Coal", "Cement", "Copper", "Zinc", "Oil"],
  },
  nw: {
    fert: [
      "Plantains",
      "Sugar Cane",
      "Cotton",
      "Caoutchouc",
      "Corn",
      "Coffee Beans",
      "Pearls",
      "Tobacco",
      "Cocoa",
      "Herbs",
      "Orchid",
    ],
    deposits: ["Clay", "Gold Ore", "Oil", "Bauxite", "Helium", "Iron", "Minerals"],
  },
  ar: {
    fert: ["Forests", "Whales", "Caribou", "Seals", "Bears", "Furs"],
    deposits: ["Gold Ore", "Gas"],
  },
  en: {
    fert: ["Linseed", "Hibiscus", "Teff", "Indigo", "Spices", "Lobster", "Bees"],
    deposits: ["Clay"],
  },
};

/** 117: walk every producer the pack says exists in the region and collect
 *  the fertility it names. "… Deposit" is a mine slot; "… Fertility" and
 *  "… Population" (fish, game) are the anywhere kind. */
function derive117(): FertilityPack {
  const out: FertilityPack = {};
  for (const [key, bit] of Object.entries(GAME_CONTENT.anno117.regionNum)) {
    const fert = new Set<string>();
    const deposits = new Set<string>();
    for (const g of Object.values(GOODS_117))
      for (const p of g.producers) {
        if (typeof p.fertility !== "string" || !(p.region & bit)) continue;
        (/ Deposit$/.test(p.fertility) ? deposits : fert).add(p.fertility);
      }
    out[key] = {
      fert: [...fert].sort((a, b) => a.localeCompare(b)),
      deposits: [...deposits].sort((a, b) => a.localeCompare(b)),
    };
  }
  return out;
}

let pack117: FertilityPack | null = null;

export function fertilitiesFor(game: Game): FertilityPack | null {
  switch (game) {
    case "anno1800":
      return FERT_1800;
    case "anno117":
      return (pack117 ??= derive117());
    default:
      return null;
  }
}

/** What one island's region can hand it, or null when the game has no list
 *  or the island's tag is blank / not a region with one. */
export function regionFertility(game: Game, region: string): RegionFertility | null {
  const pack = fertilitiesFor(game);
  if (!pack) return null;
  const key = GAME_CONTENT[game].regionAlias?.[region] || region;
  return pack[key] || null;
}

/** The pack's name, minus the suffix 117 puts on every one — "Lavender
 *  Fertility" reads as "Lavender" on a chip; the full name stays in the title. */
export function shortFertName(n: string): string {
  return n.replace(/ (Fertility|Deposit|Population)$/, "");
}

export interface FertilityGroup {
  /** Canonical region key (the one the pack is keyed by). */
  key: string;
  /** Every tag that maps here, in regionLabels order — "Old World · Cape Trelawney". */
  label: string;
  all: RegionFertility;
}

/** The pack's regions as the player sees them, aliases folded together. */
export function fertilityGroups(game: Game): FertilityGroup[] {
  const pack = fertilitiesFor(game);
  if (!pack) return [];
  const alias = GAME_CONTENT[game].regionAlias || {};
  const groups = new Map<string, string[]>();
  for (const [tag, label] of Object.entries(GAME_CONTENT[game].regionLabels)) {
    const key = alias[tag] || tag;
    if (!pack[key]) continue;
    groups.set(key, [...(groups.get(key) || []), label]);
  }
  return [...groups].map(([key, labels]) => ({ key, label: labels.join(" · "), all: pack[key] }));
}

export interface FertilityGap extends FertilityGroup {
  /** Islands tagged with any of the group's regions. */
  islands: string[];
  /** Names ticked on at least one of them. */
  have: Set<string>;
  missing: RegionFertility;
}

/** Per region group, what no island there has yet. A group only reports once
 *  something is ticked on one of its islands — a freshly tagged island with
 *  nothing recorded would otherwise cry "everything missing". */
export function missingFertilities(
  game: Game,
  islands: string[],
  regionOf: (island: string) => string,
  haveOf: (island: string) => string[]
): FertilityGap[] {
  const alias = GAME_CONTENT[game].regionAlias || {};
  const out: FertilityGap[] = [];
  for (const g of fertilityGroups(game)) {
    const mine = islands.filter((n) => {
      const r = regionOf(n);
      return (alias[r] || r) === g.key;
    });
    const have = new Set<string>();
    for (const n of mine) for (const f of haveOf(n)) have.add(f);
    if (!have.size) continue;
    out.push({
      ...g,
      islands: mine,
      have,
      missing: {
        fert: g.all.fert.filter((f) => !have.has(f)),
        deposits: g.all.deposits.filter((f) => !have.has(f)),
      },
    });
  }
  return out;
}
