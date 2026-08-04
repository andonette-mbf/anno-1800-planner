// Island production ledger (M3): maps the island inventory's building names
// back to the goods they produce and sums, per island, what its ticked
// buildings make and what those buildings' own chains consume — in t/min at
// base rates (100% productivity, no electricity; silo variants make ×2 and
// eat SILO_FEED t/min of feed per building, same as the engine).
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
  rate: number; // t/min per building at base productivity
  silo?: boolean; // silo module fitted: rate already doubled, feed applies
}

const VARIANTS = new Map<string, Variant>(); // key: lowercased building name
const NAMES: string[] = []; // display-form names, for the datalist
const primaryName: Record<string, string> = {}; // good id -> its building's entry name
// good display name -> the building that makes it (first = Old World preferred),
// so a deficit can be phrased as "build N× Grain Farm".
const PRODUCER: Record<string, { building: string; rate: number }> = {};

function register(name: string, v: Variant): boolean {
  const k = name.toLowerCase();
  if (VARIANTS.has(k)) return false;
  VARIANTS.set(k, v);
  NAMES.push(name);
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
  if (!PRODUCER[g.name]) PRODUCER[g.name] = { building: name, rate: g.rate };
  for (const a of g.alts) register(a.building, { good: g.id, rate: a.rate });
}
for (const gid in SILO) {
  const base = primaryName[gid];
  if (!base || !GOODS[SILO[gid]]) continue;
  const bv = VARIANTS.get(base.toLowerCase())!;
  const name = base.endsWith(")") ? base.replace(/\)$/, ", silo)") : `${base} (silo)`;
  register(name, { good: gid, rate: bv.rate * 2, silo: true });
}

/** Every building name the inventory understands, for the datalist. */
export const BUILDING_OPTIONS = [...NAMES].sort();

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
    const out = n * v.rate;
    produced[g.name] = (produced[g.name] || 0) + out;
    for (const inp of g.inputs) {
      const nm = GOODS[inp.good].name;
      used[nm] = (used[nm] || 0) + out * inp.qty;
    }
    if (v.silo) {
      const nm = GOODS[SILO[v.good]].name;
      used[nm] = (used[nm] || 0) + n * SILO_FEED;
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
