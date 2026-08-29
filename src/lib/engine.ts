// Calculator engine — a faithful port of the legacy single-file app's math.
// Algorithms are intentionally identical (same epsilons, same iteration caps);
// tests/golden.test.cjs verifies numeric equivalence against the legacy build.
//
// M10 phase 3: the engine no longer reads data.ts directly. Every table and
// every rule that differs between the games comes from `datasetFor(st)` — see
// dataset.ts for what actually differs. A state with no `game` is 1800, so the
// golden tests and every pre-M10 share link exercise exactly the old code path.
// tests/engine117.test.cjs covers the 117 side against hand-checked chains.
import { DATASETS, DEFAULT_BAND, datasetFor, type NeedDef } from "./dataset";
import type { Game } from "./games";

export type { NeedDef } from "./dataset";

export interface Selection {
  mode: "fac" | "tpm";
  val: number;
}

export interface CalcState {
  /** Which game's data this plan is in. Absent = Anno 1800 (old links/plans). */
  game?: Game;
  sel: Record<string, Selection>;
  /** 1800: filters the good picker (0 = all). 117: picks the region the plan is
   *  BUILT in, which selects the producer — Flour is a Grain Mill in Latium and
   *  a Donkey Mill in Albion, at different rates. */
  regionFilter: number;
  prod: number;
  coalTime: number;
  round: boolean;
  tab: "whole" | "ratio" | "buildings" | "shared" | "tree";
  mode: "goods" | "pop";
  pop: Record<string, number>;
  electricity: boolean;
  lifestyle: boolean;
  /** 117 only: consume needs up to this band (0 basic … 3 luxury). 1800 uses
   *  the `lifestyle` toggle instead — its needs carry unlock thresholds. */
  band?: number;
  silo: boolean;
  cons: number;
}

export const DEFAULT_STATE: CalcState = {
  game: "anno1800",
  sel: {},
  regionFilter: 0,
  prod: 100,
  coalTime: 30,
  round: true,
  tab: "buildings",
  mode: "goods",
  pop: {},
  electricity: false,
  lifestyle: false,
  band: DEFAULT_BAND,
  silo: false,
  cons: 100,
};

/** A blank plan for a game — where it opens is the dataset's `startRegion`
 *  (117: Latium, since it has no "All"). */
export function defaultStateFor(game: Game): CalcState {
  return { ...DEFAULT_STATE, game, regionFilter: DATASETS[game].startRegion, sel: {}, pop: {} };
}

export function electrifiable(st: CalcState, id: string): boolean {
  return datasetFor(st).electrifiable(id);
}

export function effRate(st: CalcState, id: string): number {
  const D = datasetFor(st);
  const r = D.recipe(st, id);
  let t = r.rate;
  t *= st.prod / 100;
  if (st.electricity && D.electrifiable(id)) t *= 2;
  if (st.silo && r.siloFeed) t *= 2;
  return t;
}

export function baseRate(st: CalcState, id: string): number {
  return datasetFor(st).recipe(st, id).rate;
}

/** Display building name (1800's coal source and 117's region both pick one). */
export function buildingName(st: CalcState, id: string): string {
  return datasetFor(st).recipe(st, id).building;
}

/** Goods that come from a deposit rather than a building (117's Obsidian).
 *  They have no rate, so they are never counted as buildings — but their
 *  demand is still tracked, because you do have to get them from somewhere. */
export function gathered(st: CalcState, id: string): boolean {
  return datasetFor(st).recipe(st, id).gathered;
}

export function targetTpm(st: CalcState, id: string): number {
  const t = st.sel[id];
  return t ? (t.mode === "fac" ? t.val * effRate(st, id) : t.val) : 0;
}

export function needActive(st: CalcState, d: NeedDef, tid: string): boolean {
  return datasetFor(st).needActive(st, d, tid);
}

export function popTargets(st: CalcState): Record<string, number> {
  const D = datasetFor(st);
  const o: Record<string, number> = {};
  for (const tid in st.pop) {
    const res = +st.pop[tid];
    if (!res || !D.pop[tid]) continue;
    const n = D.pop[tid].n;
    for (const gid in n) {
      if (!D.goods[gid]) continue;
      const d = n[gid];
      if (D.needActive(st, d, tid)) o[gid] = (o[gid] || 0) + res * d[0] * (st.cons / 100);
    }
  }
  return o;
}

export function targets(st: CalcState): Record<string, number> {
  if (st.mode === "pop") return popTargets(st);
  const o: Record<string, number> = {};
  for (const id in st.sel) {
    const t = targetTpm(st, id);
    if (t > 0) o[id] = (o[id] || 0) + t;
  }
  return o;
}

export interface ComputeResult {
  demand: Record<string, number>;
  contrib: Record<string, Record<string, number>>;
}

/** Every consumption edge out of one good's production, per t/min made:
 *  its chain inputs, plus the two per-BUILDING edges (silo feed, 117 fuel),
 *  which are divided by the effective rate to turn t/min back into buildings.
 *  Neither per-building edge can loop: 1800's feed goods are farm crops and
 *  117's fuel is Coal, and none of them takes a silo or burns fuel itself. */
function edges(st: CalcState, id: string, tpm: number): [string, number][] {
  const D = datasetFor(st);
  const r = D.recipe(st, id);
  const out: [string, number][] = r.inputs.map((i) => [i.good, tpm * i.qty]);
  const er = effRate(st, id);
  if (er > 0) {
    if (st.silo && r.siloFeed) out.push([r.siloFeed, (tpm * D.siloFeedRate) / er]);
    if (r.fuel && D.fuelGood) out.push([D.fuelGood, (tpm * D.fuelPerMin) / er]);
  }
  return out;
}

export function compute(st: CalcState): ComputeResult {
  const demand: Record<string, number> = {};
  const contrib: Record<string, Record<string, number>> = {};
  function add(id: string, tpm: number, origin: string) {
    demand[id] = (demand[id] || 0) + tpm;
    contrib[id] = contrib[id] || {};
    contrib[id][origin] = (contrib[id][origin] || 0) + tpm;
    for (const [g, t] of edges(st, id, tpm)) add(g, t, origin);
  }
  const T = targets(st);
  for (const g in T) if (T[g] > 0) add(g, T[g], g);
  return { demand, contrib };
}

/** Category of a good under the current mode (undefined = plain production good). */
export function goodCat(st: CalcState, id: string): number | undefined {
  const D = datasetFor(st);
  if (st.mode !== "pop") return D.goodCat[id];
  let c: number | undefined;
  for (const tid in st.pop) {
    if (!+st.pop[tid]) continue;
    const d = D.pop[tid] && D.pop[tid].n[id];
    if (d && D.needActive(st, d, tid)) c = Math.min(c ?? 9, d[1]);
  }
  return c;
}

/** Tier to display/group a good under (in pop mode: lowest active consuming tier). */
export function dispTier(st: CalcState, id: string): string | null {
  const D = datasetFor(st);
  if (st.mode !== "pop") return D.goods[id].tier;
  let best: string | null = null;
  let bo = Infinity;
  for (const tid in st.pop) {
    if (!+st.pop[tid]) continue;
    const d = D.pop[tid] && D.pop[tid].n[id];
    if (d && D.needActive(st, d, tid)) {
      const o = D.tierOrder[tid] ?? 99;
      if (o < bo) {
        bo = o;
        best = tid;
      }
    }
  }
  return best || D.goods[id].tier;
}

export function chainDemand(
  st: CalcState,
  id: string,
  tpm: number,
  acc: Record<string, number>
): Record<string, number> {
  acc[id] = (acc[id] || 0) + tpm;
  for (const [g, t] of edges(st, id, tpm)) chainDemand(st, g, t, acc);
  return acc;
}

export interface OptimPlanResult {
  counts: Record<string, number>;
  baseCounts: Record<string, number>;
  cap: Record<string, number>;
  dem: Record<string, number>;
  added: Record<string, number>;
  baseTotal: number;
  total: number;
  baseUtil: number;
  util: number;
}

export function optimPlan(st: CalcState): OptimPlanResult | null {
  const T = targets(st);
  const ids = Object.keys(T);
  if (!ids.length) return null;
  const { demand } = compute(st);
  const counts: Record<string, number> = {};
  const cap: Record<string, number> = {};
  for (const g in demand) {
    const er = effRate(st, g);
    // A gathered good is not a building you can add: it never rounds up, and it
    // never limits a "free" final either, since you supply it by deposit/trade.
    if (er <= 0) {
      cap[g] = Infinity;
      continue;
    }
    counts[g] = Math.ceil(demand[g] / er - 1e-9);
    cap[g] = counts[g] * er;
  }
  const baseCounts = { ...counts };
  let baseTotal = 0;
  let baseUsed = 0;
  for (const g in counts) {
    baseTotal += counts[g];
    baseUsed += demand[g] / effRate(st, g);
  }
  const dem = { ...demand };
  const added: Record<string, number> = {};
  let guard = 0;
  while (guard++ < 300) {
    let best: { f: string; u: Record<string, number> } | null = null;
    let bestScore = 0;
    for (const f of ids) {
      if (effRate(st, f) <= 0) continue;
      const u = chainDemand(st, f, effRate(st, f), {});
      let ok = true;
      let score = 0;
      for (const g in u) {
        if (g === f) continue;
        if ((dem[g] ?? 0) + u[g] > (cap[g] ?? 0) + 1e-6) {
          ok = false;
          break;
        }
        score += u[g];
      }
      if (ok && score > bestScore) {
        best = { f, u };
        bestScore = score;
      }
    }
    if (!best) break;
    for (const g in best.u) dem[g] = (dem[g] || 0) + best.u[g];
    cap[best.f] += effRate(st, best.f);
    counts[best.f]++;
    added[best.f] = (added[best.f] || 0) + 1;
  }
  let total = 0;
  let used = 0;
  for (const g in counts) {
    total += counts[g];
    used += dem[g] / effRate(st, g);
  }
  return {
    counts,
    baseCounts,
    cap,
    dem,
    added,
    baseTotal,
    total,
    baseUtil: baseTotal ? baseUsed / baseTotal : 1,
    util: total ? used / total : 1,
  };
}

export function wholePlan(st: CalcState, d: Record<string, number>): { total: number } {
  let t = 0;
  for (const id in d) {
    const er = effRate(st, id);
    if (er > 0) t += Math.ceil(d[id] / er - 1e-9);
  }
  return { total: t };
}

export function wholeTotalStat(st: CalcState, demand: Record<string, number>): number {
  const p = optimPlan(st);
  return p ? p.total : wholePlan(st, demand).total;
}

export interface PerfectRatioResult {
  finals: string[];
  counts: number[];
  rows: { id: string; c: number }[];
  total: number;
}

export function perfectRatio(st: CalcState): PerfectRatioResult | null {
  const finals = Object.keys(targets(st));
  if (!finals.length) return null;
  if (finals.some((f) => effRate(st, f) <= 0)) return null;
  const base = finals.map((f) => chainDemand(st, f, effRate(st, f), {}));
  // Gathered goods have no building count, so they cannot take part in a
  // whole-building ratio — their demand just comes along for the ride.
  const goods = [...new Set(base.flatMap((d) => Object.keys(d)))].filter(
    (g) => effRate(st, g) > 0
  );
  const frac = base.map((d) => {
    const o: Record<string, number> = {};
    for (const g of goods) o[g] = (d[g] || 0) / effRate(st, g);
    return o;
  });
  const c1: Record<string, number> = {};
  for (const fr of frac) for (const g of goods) c1[g] = (c1[g] || 0) + fr[g];
  let K: number | null = null;
  for (let k = 1; k <= 600; k++) {
    let ok = true;
    for (const g of goods) {
      const v = c1[g] * k;
      if (Math.abs(v - Math.round(v)) > 5e-3) {
        ok = false;
        break;
      }
    }
    if (ok) {
      K = k;
      break;
    }
  }
  if (!K) return null;
  const nf = finals.length;
  let counts: number[] | null = null;
  if (Math.pow(K, nf) <= 2e5) {
    let best: number[] | null = null;
    let bt = Infinity;
    const cur = new Array(nf).fill(1);
    const rec = (i: number): void => {
      if (i === nf) {
        let tot = 0;
        for (const g of goods) {
          let s = 0;
          for (let j = 0; j < nf; j++) s += cur[j] * frac[j][g];
          const r = Math.round(s);
          if (Math.abs(s - r) > 5e-3) return;
          tot += r;
        }
        if (tot < bt) {
          bt = tot;
          best = cur.slice();
        }
        return;
      }
      for (let v = 1; v <= (K as number); v++) {
        cur[i] = v;
        rec(i + 1);
      }
    };
    rec(0);
    counts = best;
  }
  if (!counts) counts = finals.map(() => K as number);
  const dem: Record<string, number> = {};
  finals.forEach((f, j) => {
    const d = chainDemand(st, f, effRate(st, f) * (counts as number[])[j], {});
    for (const g in d) dem[g] = (dem[g] || 0) + d[g];
  });
  const rows = Object.keys(dem)
    .filter((g) => effRate(st, g) > 0)
    .map((g) => ({
      id: g,
      c: Math.round(dem[g] / effRate(st, g)),
    }));
  let total = 0;
  rows.forEach((r) => (total += r.c));
  return { finals, counts, rows, total };
}

// ---------- Row builders for the UI (data only; formatting lives in components) ----------

export interface BuildingRow {
  id: string;
  dem: number;
  er: number;
  exact: number;
  cnt: number;
  cap: number;
  sur: number;
  /** From a deposit, not a building — cnt is 0 and means "none to build". */
  gathered: boolean;
}

export function buildingRows(st: CalcState): {
  rows: BuildingRow[];
  byId: Record<string, BuildingRow>;
  contrib: ComputeResult["contrib"];
  demand: Record<string, number>;
  totalBuildings: number;
} {
  const { demand, contrib } = compute(st);
  const ids = Object.keys(demand);
  let total = 0;
  const rows = ids.map((id) => {
    const er = effRate(st, id);
    const dem = demand[id];
    if (er <= 0)
      return { id, dem, er: 0, exact: 0, cnt: 0, cap: 0, sur: 0, gathered: true };
    const exact = dem / er;
    const cnt = st.round ? Math.ceil(exact - 1e-9) : exact;
    const cap = cnt * er;
    total += cnt;
    return { id, dem, er, exact, cnt, cap, sur: cap - dem, gathered: false };
  });
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  return { rows, byId, contrib, demand, totalBuildings: total };
}

/** Legacy display ordering: finals first, then region, then (display) tier, then
 *  name. `regionRank` is the per-game region key — 1800's plain region id (so
 *  the order is unchanged), 117's home-region-then-imports. */
export function displaySort(st: CalcState, a: string, b: string): number {
  const D = datasetFor(st);
  const x = D.goods[a];
  const y = D.goods[b];
  if (x.isFinal !== y.isFinal) return x.isFinal ? -1 : 1;
  return (
    D.regionRank(st, a) - D.regionRank(st, b) ||
    (D.tierOrder[dispTier(st, a) ?? ""] ?? 99) - (D.tierOrder[dispTier(st, b) ?? ""] ?? 99) ||
    x.name.localeCompare(y.name)
  );
}
