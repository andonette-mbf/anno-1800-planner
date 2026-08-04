// Plan check (M4): compare an island's inventory against a linked calculator
// plan. The plan side is the calculator's whole-building counts for the
// plan's full chain (buildingRows with rounding forced on — you can't build
// half a farm); the island side is the ticked items the ledger recognises.
// Counts are merged by produced-good display name on both sides, same as the
// ledger, so region variants ("Cattle Farm (New World)") and alternative
// producers (Coal Mine vs Charcoal Kiln) land in one row. "Overproduction"
// here means built beyond — or outside — the plan.
//
// M10 phase 3: both sides resolve through the plan's own game. A 117 plan also
// carries the region it is built in, because that picks the producer — and so
// the ledger entry to seed ("Tannery" in Latium, "Tannery (Albion)" in Albion).
import { datasetFor } from "./dataset";
import { CalcState, DEFAULT_STATE, buildingName, buildingRows, displaySort } from "./engine";
import { itemGood, itemNameForGood } from "./ledger";
import type { CheckItem } from "./store";

export interface PlanCheckRow {
  good: string; // produced good display name (row key)
  building: string; // building label, from the plan's side (coal source aware)
  built: number;
  planned: number;
}

export interface PlanCheckResult {
  rows: PlanCheckRow[]; // every planned building, calculator display order
  short: { building: string; count: number }[]; // built < planned
  extra: { building: string; count: number }[]; // built > planned, or not in the plan at all
}

/** The plan's buildings that the island doesn't list yet, in calculator
 *  display order — the seed for "add the plan as gaps" (M7b). Names come from
 *  the ledger's own entries so the seeded lines feed the ledger and match the
 *  plan check; coal keeps the plan's chosen source (Coal Mine / Charcoal
 *  Kiln), which the ledger knows as an alternative producer. */
export function planSeed(planSt: CalcState, items: CheckItem[]): { t: string; n: number }[] {
  const st: CalcState = { ...DEFAULT_STATE, ...planSt, round: true };
  const D = datasetFor(st);
  const game = D.game;
  const region = D.itemRegion(st);
  const { rows } = buildingRows(st);
  const have = new Set(items.map((c) => c.t.trim().toLowerCase()));
  const seed: { t: string; n: number }[] = [];
  const at = new Map<string, number>();
  for (const r of rows.slice().sort((a, b) => displaySort(st, a.id, b.id))) {
    // Gathered goods (117's Obsidian) have no building to seed.
    if (r.cnt <= 0 || r.gathered) continue;
    // 1800's coal source is a plan-wide toggle rather than a region, so the
    // plan's chosen kiln/mine wins over the good's primary building.
    const name =
      game === "anno1800" && r.id === "coal"
        ? buildingName(st, r.id)
        : itemNameForGood(r.id, game, region);
    if (!name) continue;
    const k = name.toLowerCase();
    if (have.has(k)) continue;
    // Two goods can share one building name (Lumberjack's Hut) — one line.
    const i = at.get(k);
    if (i === undefined) {
      at.set(k, seed.length);
      seed.push({ t: name, n: r.cnt });
    } else seed[i].n += r.cnt;
  }
  return seed;
}

export function planCheck(planSt: CalcState, items: CheckItem[]): PlanCheckResult {
  // Old snapshots may predate newer CalcState fields; rounding is forced on.
  const st: CalcState = { ...DEFAULT_STATE, ...planSt, round: true };
  const D = datasetFor(st);
  const { rows: brows } = buildingRows(st);
  const ordered = brows.slice().sort((a, b) => displaySort(st, a.id, b.id));
  const rows: PlanCheckRow[] = [];
  const byGood = new Map<string, PlanCheckRow>();
  for (const r of ordered) {
    if (r.gathered) continue;
    const good = D.goods[r.id].name;
    const cur = byGood.get(good);
    if (cur) cur.planned += r.cnt;
    else {
      const row = { good, building: buildingName(st, r.id), built: 0, planned: r.cnt };
      byGood.set(good, row);
      rows.push(row);
    }
  }
  // Off-plan buildings, labelled with the item text as the user typed it.
  const offPlan = new Map<string, { building: string; count: number }>();
  for (const c of items) {
    if (!c.done) continue;
    const gid = itemGood(c.t, D.game);
    if (!gid || !D.goods[gid]) continue;
    const good = D.goods[gid].name;
    const n = Math.max(1, c.n || 1);
    const row = byGood.get(good);
    if (row) row.built += n;
    else {
      const e = offPlan.get(good);
      if (e) e.count += n;
      else offPlan.set(good, { building: c.t.trim(), count: n });
    }
  }
  return {
    rows,
    short: rows
      .filter((r) => r.built < r.planned)
      .map((r) => ({ building: r.building, count: r.planned - r.built })),
    extra: [
      ...rows
        .filter((r) => r.built > r.planned)
        .map((r) => ({ building: r.building, count: r.built - r.planned })),
      ...offPlan.values(),
    ],
  };
}
