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
import { GOODS, SILO, SILO_FEED } from "./data";
import type { CheckItem } from "./store";

interface Variant {
  good: string; // produced good id
  rate: number; // t/min per building at base productivity, WITHOUT silo
  silo?: boolean; // legacy "(silo)" name — implies the silo is fitted
}

const VARIANTS = new Map<string, Variant>(); // key: lowercased building name
const NAMES: string[] = []; // display-form names, for the datalist
const primaryName: Record<string, string> = {}; // good id -> its building's entry name
// good display name -> the building that makes it (first = Old World preferred),
// so a deficit can be phrased as "build N× Grain Farm".
const PRODUCER: Record<string, { building: string; rate: number }> = {};
// Entry name -> every region that building exists in. Merged names collect
// all their regions (Lumberjack's Hut = OW+NW+Arctic), so a region-filtered
// datalist still offers them everywhere they're real.
const NAME_REGIONS = new Map<string, Set<number>>();

function noteRegion(name: string, region: number) {
  const k = name.toLowerCase();
  let s = NAME_REGIONS.get(k);
  if (!s) NAME_REGIONS.set(k, (s = new Set()));
  s.add(region);
}

function register(name: string, v: Variant, hidden = false): boolean {
  const k = name.toLowerCase();
  if (VARIANTS.has(k)) return false;
  VARIANTS.set(k, v);
  if (!hidden) NAMES.push(name);
  return true;
}

// Old World first so it owns contested plain names.
for (const g of Object.values(GOODS).sort(
  (a, b) => a.region - b.region || a.name.localeCompare(b.name)
)) {
  const clash = VARIANTS.get(g.building.toLowerCase());
  const name =
    clash && clash.rate !== g.rate ? `${g.building} (${g.regionName})` : g.building;
  if (register(name, { good: g.id, rate: g.rate })) primaryName[g.id] = name;
  noteRegion(name, g.region);
  if (!PRODUCER[g.name]) PRODUCER[g.name] = { building: name, rate: g.rate };
  for (const a of g.alts) {
    register(a.building, { good: g.id, rate: a.rate });
    noteRegion(a.building, g.region);
  }
}
// Legacy "(silo)" names — silos are a bolt-on toggle on the row now, so these
// are hidden from the datalist but still parsed for items saved before the
// change (and un-migrated sync blobs).
for (const gid in SILO) {
  const base = primaryName[gid];
  if (!base || !GOODS[SILO[gid]]) continue;
  const bv = VARIANTS.get(base.toLowerCase())!;
  const name = base.endsWith(")") ? base.replace(/\)$/, ", silo)") : `${base} (silo)`;
  register(name, { good: gid, rate: bv.rate, silo: true }, true);
}

/** Every building name the inventory understands, for the datalist. */
export const BUILDING_OPTIONS = [...NAMES].sort();

/** Datalist names for one region (1 OW, 2 NW, 4 Arctic, 5 Enbesa) — an
 *  island with no region set gets the full list. */
export function buildingOptionsFor(region?: number): string[] {
  if (!region) return BUILDING_OPTIONS;
  return BUILDING_OPTIONS.filter((n) => NAME_REGIONS.get(n.toLowerCase())?.has(region));
}

/** Can this inventory item take a silo module? (animal farms only) */
export function siloCapable(itemName: string): boolean {
  const v = VARIANTS.get(itemName.trim().toLowerCase());
  return !!v && !v.silo && !!SILO[v.good];
}

/** Can this inventory item be electrified? Same rule as the calculator
 *  (`electrifiable`): Old World production buildings, ×2 when powered. */
export function elecCapable(itemName: string): boolean {
  const v = VARIANTS.get(itemName.trim().toLowerCase());
  return !!v && GOODS[v.good].region === 1;
}

/** The inventory item name for a produced good — the ledger's own entry, so a
 *  seeded line parses straight back into the ledger (region-suffixed where the
 *  rates differ, e.g. "Cattle Farm (New World)"). */
export function itemNameForGood(goodId: string): string | null {
  return primaryName[goodId] ?? null;
}

/** Good id an inventory item name produces, or null if it's not a building
 *  the calculator knows (landmark chips, free-text items). */
export function itemGood(itemName: string): string | null {
  return VARIANTS.get(itemName.trim().toLowerCase())?.good ?? null;
}

export interface LedgerRow {
  name: string; // good display name (regions merged: Wood is Wood)
  produced: number; // t/min made by ticked buildings
  used: number; // t/min consumed by ticked buildings (inputs + silo feed)
  net: number;
  // Set when net is negative: how many of the good's producer (or equivalent)
  // would cover the shortfall. 5 silo farms × 0.2 feed = 1× Grain Farm.
  fix?: { building: string; count: number };
}

/** Sum one island's checklist into per-good makes/uses/net rows.
 *  Unticked (broken) buildings and non-building items are skipped. */
export function islandLedger(items: CheckItem[]): LedgerRow[] {
  const produced: Record<string, number> = {};
  const used: Record<string, number> = {};
  for (const c of items) {
    if (!c.done) continue;
    const v = VARIANTS.get(c.t.trim().toLowerCase());
    if (!v) continue;
    const n = Math.max(1, c.n || 1);
    const g = GOODS[v.good];
    // sc of the line's n farms have a silo (make ×2, eat feed) — a line can
    // be part-silo'd. Legacy "(silo)" names mean all of them.
    const sc = SILO[v.good] ? (v.silo ? n : Math.min(Math.max(0, c.s || 0), n)) : 0;
    // ec of them are powered (×2, Old World only, no feed edge — same rule as
    // the engine's `electrifiable`). Where a building has both, the two
    // multipliers stack to ×4, as in `effRate`; with both counters partial the
    // powered ones are taken to be the silo'd ones first.
    const ec = g.region === 1 ? Math.min(Math.max(0, c.e || 0), n) : 0;
    const out = (n + sc + ec + Math.min(sc, ec)) * v.rate;
    produced[g.name] = (produced[g.name] || 0) + out;
    for (const inp of g.inputs) {
      const nm = GOODS[inp.good].name;
      used[nm] = (used[nm] || 0) + out * inp.qty;
    }
    if (sc > 0) {
      const nm = GOODS[SILO[v.good]].name;
      used[nm] = (used[nm] || 0) + sc * SILO_FEED;
    }
  }
  return [...new Set([...Object.keys(produced), ...Object.keys(used)])]
    .sort()
    .map((name) => {
      const p = produced[name] || 0;
      const u = used[name] || 0;
      const row: LedgerRow = { name, produced: p, used: u, net: p - u };
      const pr = PRODUCER[name];
      if (row.net < -1e-9 && pr)
        row.fix = { building: pr.building, count: Math.ceil((u - p) / pr.rate - 1e-9) };
      return row;
    });
}
