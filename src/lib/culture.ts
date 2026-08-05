// Culture-item collections (M11): the Zoo / Museum / Botanical Garden sets and
// the maths for "what have I got, what's missing, what does finishing it pay".
//
// The pack (culture-1800.json, from scripts/extract-culture.mjs) is Anno 1800
// only, and deliberately so — 117 has no culture building of this kind and its
// wiki carries no item data, so `cultureFor` returns null there and the whole
// panel never renders. Same shape as the 📈 growth goals being 1800-only.
//
// The tracked unit is (island, building, item): a set only pays its bonus when
// every piece is in ONE building, and attractiveness is an island stat, so a
// global "do I own this" list would happily call a set complete while its
// pieces sat in two different zoos earning nothing.
import pack from "./culture-1800.json";
import type { Game } from "./games";

export interface CultureItem {
  /** Display name — also the identity, since that is what a player reads off
   *  the game's own item card. Compared case-insensitively everywhere. */
  n: string;
  r: string; // rarity: the five drop tiers, plus "Quest" for the one exhibit
  a: number; // attractiveness this piece adds
  dlc?: string; // needed DLC, when the piece isn't in the base game
  icon?: string; // wiki file name, for a future pictures pass
}

export interface CultureSet {
  id: string;
  label: string;
  dlc?: string;
  /** What completing the set actually does — the reason to chase the last
   *  piece. Absent only if the wiki stops stating one. */
  effect?: string;
  items: CultureItem[];
}

export interface CultureBuilding {
  id: string; // "zoo" | "museum" | "garden"
  label: string; // matched against the island inventory's item names
  noun: string; // "animal" | "artifact" | "plant"
  sets: CultureSet[];
  /** Pieces that belong to no set. They still fill a compound and still pay
   *  attractiveness, so they are tracked — just never chased. */
  loose: CultureItem[];
}

interface Pack {
  pack: number;
  source: { wiki: string; note: string; pages: { page: string; revid: number }[] };
  rarity: string[];
  buildings: CultureBuilding[];
}

const P = pack as Pack;

export const CULTURE_PACK = P.pack;
export const CULTURE_SOURCE = P.source;
export const CULTURE: CultureBuilding[] = P.buildings;

/** Rarity → how the chip is tinted; also the sort order within a set. */
export const RARITY_ORDER: Record<string, number> = Object.fromEntries(
  P.rarity.map((r, i) => [r, i])
);

const norm = (s: string) => s.trim().toLowerCase();

/** The pack for a game, or null where the game has no such buildings (117). */
export function cultureFor(game: Game): CultureBuilding[] | null {
  return game === "anno1800" ? CULTURE : null;
}

/** Every piece in a building, sets first then loose — the lookup a "which set
 *  is this thing from?" search runs against. */
export function allItems(b: CultureBuilding): CultureItem[] {
  return [...b.sets.flatMap((s) => s.items), ...b.loose];
}

/** Which culture buildings this island has BUILT — a ticked inventory line
 *  whose name is the building's. Unticked means "planned", and there is
 *  nothing to display in a zoo that doesn't exist yet. */
export function cultureOn(
  items: { t: string; done: boolean }[],
  game: Game
): CultureBuilding[] {
  const pk = cultureFor(game);
  if (!pk) return [];
  const built = new Set(items.filter((c) => c.done).map((c) => norm(c.t)));
  return pk.filter((b) => built.has(norm(b.label)));
}

export interface SetProgress {
  set: CultureSet;
  have: number;
  total: number;
  missing: CultureItem[];
  done: boolean;
  /** Attractiveness the placed pieces of this set are paying right now. */
  attract: number;
}

export function setProgress(set: CultureSet, placed: Set<string>): SetProgress {
  const mine = set.items.filter((i) => placed.has(norm(i.n)));
  return {
    set,
    have: mine.length,
    total: set.items.length,
    missing: set.items.filter((i) => !placed.has(norm(i.n))),
    done: mine.length === set.items.length,
    attract: mine.reduce((n, i) => n + i.a, 0),
  };
}

export interface BuildingProgress {
  b: CultureBuilding;
  sets: SetProgress[];
  loose: CultureItem[]; // the no-set pieces you have placed
  have: number; // pieces placed, all told
  total: number; // pieces that exist
  complete: number; // sets finished
  /** Total attractiveness from placed pieces. Set completion pays its effect,
   *  not extra attractiveness, so this is a plain sum — the Music Pavilion's
   *  percentage boosts are a building modifier and stay out of it. */
  attract: number;
}

export function buildingProgress(
  b: CultureBuilding,
  placedNames: string[]
): BuildingProgress {
  const placed = new Set(placedNames.map(norm));
  const sets = b.sets.map((s) => setProgress(s, placed));
  const loose = b.loose.filter((i) => placed.has(norm(i.n)));
  const inSets = sets.reduce((n, s) => n + s.have, 0);
  return {
    b,
    sets,
    loose,
    have: inSets + loose.length,
    total: b.sets.reduce((n, s) => n + s.items.length, 0) + b.loose.length,
    complete: sets.filter((s) => s.done).length,
    attract:
      sets.reduce((n, s) => n + s.attract, 0) + loose.reduce((n, i) => n + i.a, 0),
  };
}

/** Sets one piece short — the "finish this next" shortlist, best payoff first
 *  (a set you can complete with one common piece beats one needing a
 *  Legendary). Ties break on set size, so the cheaper set leads. */
export function nearlyDone(p: BuildingProgress): SetProgress[] {
  return p.sets
    .filter((s) => !s.done && s.missing.length === 1 && s.have > 0)
    .sort(
      (x, y) =>
        (RARITY_ORDER[x.missing[0].r] ?? 9) - (RARITY_ORDER[y.missing[0].r] ?? 9) ||
        x.total - y.total
    );
}
