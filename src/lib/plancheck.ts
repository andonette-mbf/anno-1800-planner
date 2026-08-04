// Plan check (M4): compare an island's inventory against a linked calculator
// plan. The plan side is the calculator's whole-building counts for the
// plan's full chain (buildingRows with rounding forced on — you can't build
// half a farm); the island side is the ticked items the ledger recognises.
// Counts are merged by produced-good display name on both sides, same as the
// ledger, so region variants ("Cattle Farm (New World)") and alternative
// producers (Coal Mine vs Charcoal Kiln) land in one row. "Overproduction"
// here means built beyond — or outside — the plan.
import { GOODS } from "./data";
import { CalcState, DEFAULT_STATE, buildingName, buildingRows, displaySort } from "./engine";
import { itemGood } from "./ledger";
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

export function planCheck(planSt: CalcState, items: CheckItem[]): PlanCheckResult {
  // Old snapshots may predate newer CalcState fields; rounding is forced on.
  const st: CalcState = { ...DEFAULT_STATE, ...planSt, round: true };
  const { rows: brows } = buildingRows(st);
  const ordered = brows.slice().sort((a, b) => displaySort(st, a.id, b.id));
  const rows: PlanCheckRow[] = [];
  const byGood = new Map<string, PlanCheckRow>();
  for (const r of ordered) {
    const good = GOODS[r.id].name;
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
    const gid = itemGood(c.t);
    if (!gid) continue;
    const good = GOODS[gid].name;
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
