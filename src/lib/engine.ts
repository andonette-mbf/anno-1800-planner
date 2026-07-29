// Calculator engine — a faithful port of the legacy single-file app's math.
// Algorithms are intentionally identical (same epsilons, same iteration caps);
// tests/golden.test.mts verifies numeric equivalence against the legacy build.
import { GOODS, POP, SILO, SILO_FEED, TIER_ORDER, GOODCAT, NeedDef } from "./data";

export interface Selection {
  mode: "fac" | "tpm";
  val: number;
}

export interface CalcState {
  sel: Record<string, Selection>;
  regionFilter: number;
  prod: number;
  coalTime: number;
  round: boolean;
  tab: "whole" | "ratio" | "buildings" | "shared" | "tree";
  mode: "goods" | "pop";
  pop: Record<string, number>;
  electricity: boolean;
  lifestyle: boolean;
  silo: boolean;
  cons: number;
}

export const DEFAULT_STATE: CalcState = {
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
  silo: false,
  cons: 100,
};

export function electrifiable(id: string): boolean {
  return GOODS[id].region === 1;
}

export function effRate(st: CalcState, id: string): number {
  let t = GOODS[id].rate;
  if (id === "coal") t = 60 / st.coalTime;
  t *= st.prod / 100;
  if (st.electricity && electrifiable(id)) t *= 2;
  if (st.silo && SILO[id]) t *= 2;
  return t;
}

export function baseRate(st: CalcState, id: string): number {
  return id === "coal" ? 60 / st.coalTime : GOODS[id].rate;
}

/** Display building name (coal's source is selectable). */
export function buildingName(st: CalcState, id: string): string {
  if (id === "coal") return st.coalTime === 15 ? "Coal Mine" : "Charcoal Kiln";
  return GOODS[id].building;
}

export function targetTpm(st: CalcState, id: string): number {
  const t = st.sel[id];
  return t ? (t.mode === "fac" ? t.val * effRate(st, id) : t.val) : 0;
}

export function needActive(st: CalcState, d: NeedDef, _tid: string): boolean {
  if (d[1] === 2 && !st.lifestyle) return false;
  if (d[2] && (+(st.pop[d[2]] ?? 0) || 0) < (d[3] ?? 0)) return false;
  return true;
}

export function popTargets(st: CalcState): Record<string, number> {
  const o: Record<string, number> = {};
  for (const tid in st.pop) {
    const res = +st.pop[tid];
    if (!res || !POP[tid]) continue;
    const n = POP[tid].n;
    for (const gid in n) {
      if (!GOODS[gid]) continue;
      const d = n[gid];
      if (needActive(st, d, tid)) o[gid] = (o[gid] || 0) + res * d[0] * (st.cons / 100);
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

export function compute(st: CalcState): ComputeResult {
  const demand: Record<string, number> = {};
  const contrib: Record<string, Record<string, number>> = {};
  function add(id: string, tpm: number, origin: string) {
    demand[id] = (demand[id] || 0) + tpm;
    contrib[id] = contrib[id] || {};
    contrib[id][origin] = (contrib[id][origin] || 0) + tpm;
    for (const inp of GOODS[id].inputs) add(inp.good, tpm * inp.qty, origin);
    const feed = st.silo && SILO[id];
    if (feed) add(feed, (tpm * SILO_FEED) / effRate(st, id), origin);
  }
  const T = targets(st);
  for (const g in T) if (T[g] > 0) add(g, T[g], g);
  return { demand, contrib };
}

/** Category of a good under the current mode (undefined = plain production good). */
export function goodCat(st: CalcState, id: string): number | undefined {
  if (st.mode !== "pop") return GOODCAT[id];
  let c: number | undefined;
  for (const tid in st.pop) {
    if (!+st.pop[tid]) continue;
    const d = POP[tid] && POP[tid].n[id];
    if (d && needActive(st, d, tid)) c = Math.min(c ?? 9, d[1]);
  }
  return c;
}

/** Tier to display/group a good under (in pop mode: lowest active consuming tier). */
export function dispTier(st: CalcState, id: string): string | null {
  if (st.mode !== "pop") return GOODS[id].tier;
  let best: string | null = null;
  let bo = Infinity;
  for (const tid in st.pop) {
    if (!+st.pop[tid]) continue;
    const d = POP[tid] && POP[tid].n[id];
    if (d && needActive(st, d, tid)) {
      const o = TIER_ORDER[tid] ?? 99;
      if (o < bo) {
        bo = o;
        best = tid;
      }
    }
  }
  return best || GOODS[id].tier;
}

export function chainDemand(
  st: CalcState,
  id: string,
  tpm: number,
  acc: Record<string, number>
): Record<string, number> {
  acc[id] = (acc[id] || 0) + tpm;
  for (const inp of GOODS[id].inputs) chainDemand(st, inp.good, tpm * inp.qty, acc);
  const feed = st.silo && SILO[id];
  if (feed) chainDemand(st, feed, (tpm * SILO_FEED) / effRate(st, id), acc);
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
    counts[g] = Math.ceil(demand[g] / effRate(st, g) - 1e-9);
    cap[g] = counts[g] * effRate(st, g);
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
  for (const id in d) t += Math.ceil(d[id] / effRate(st, id) - 1e-9);
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
  const base = finals.map((f) => chainDemand(st, f, effRate(st, f), {}));
  const goods = [...new Set(base.flatMap((d) => Object.keys(d)))];
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
  const rows = Object.keys(dem).map((g) => ({
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
    const exact = dem / er;
    const cnt = st.round ? Math.ceil(exact - 1e-9) : exact;
    const cap = cnt * er;
    total += cnt;
    return { id, dem, er, exact, cnt, cap, sur: cap - dem };
  });
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  return { rows, byId, contrib, demand, totalBuildings: total };
}

/** Legacy display ordering: finals first, then region, then (display) tier, then name. */
export function displaySort(st: CalcState, a: string, b: string): number {
  const x = GOODS[a];
  const y = GOODS[b];
  if (x.isFinal !== y.isFinal) return x.isFinal ? -1 : 1;
  return (
    x.region - y.region ||
    (TIER_ORDER[dispTier(st, a) ?? ""] ?? 99) - (TIER_ORDER[dispTier(st, b) ?? ""] ?? 99) ||
    x.name.localeCompare(y.name)
  );
}
