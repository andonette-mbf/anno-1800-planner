// Game data, generated from the legacy single-file app's `_C` literal
// (see data.json — regenerate only from a verified legacy build).
import raw from "./data.json";

export type GoodTuple = [string, string, number, string, string, number, string];

/** POP need entry: [tons/min per resident, category(0 need|1 want|2 lifestyle), unlockTier?, unlockThreshold?] */
export type NeedDef = [number, number, string?, number?];

export interface PopTier {
  r: number;
  fh: number;
  lbl: string;
  n: Record<string, NeedDef>;
}

export interface Good {
  id: string;
  name: string;
  region: number;
  regionName: string;
  tier: string | null;
  tierName: string | null;
  building: string;
  time: number;
  rate: number;
  inputs: { good: string; qty: number }[];
  isFinal: boolean;
  alts: { building: string; time: number; rate: number }[];
}

interface RawData {
  _C: {
    version: string;
    g: GoodTuple[];
    alts: Record<string, [string, number][]>;
    POP: Record<string, PopTier>;
    tierOrder: Record<string, number>;
    regions: Record<string, string>;
    tierLabels: Record<string, string>;
  };
  presets: { name: string; sel: Record<string, [string, number]> }[];
  silo: Record<string, string>;
  siloFeed: number;
}

const data = raw as unknown as RawData;
const _C = data._C;

export const VERSION = _C.version;
export const REGIONS: Record<number, string> = Object.fromEntries(
  Object.entries(_C.regions).map(([k, v]) => [Number(k), v])
);
export const TIER_ORDER = _C.tierOrder;
export const TIER_LABELS = _C.tierLabels;
export const POP = _C.POP;
export const SILO = data.silo;
export const SILO_FEED = data.siloFeed;
export const PRESETS = data.presets;

export const GOODS: Record<string, Good> = {};
for (const [id, name, region, tier, building, time, inputs] of _C.g) {
  GOODS[id] = {
    id,
    name,
    region,
    regionName: REGIONS[region],
    tier: tier || null,
    tierName: tier ? TIER_LABELS[tier] : null,
    building,
    time,
    rate: Math.round((60 / time) * 1e6) / 1e6,
    inputs: inputs ? inputs.split("|").map((g) => ({ good: g, qty: 1 })) : [],
    isFinal: !!tier,
    alts: (_C.alts[id] || []).map(([b, t]) => ({
      building: b,
      time: t,
      rate: Math.round((60 / t) * 1e6) / 1e6,
    })),
  };
}

// Lowest category any tier assigns to a good (need < want < lifestyle).
export const GOODCAT: Record<string, number> = {};
for (const tid in POP)
  for (const gid in POP[tid].n) {
    const c = POP[tid].n[gid][1];
    GOODCAT[gid] = Math.min(GOODCAT[gid] ?? 9, c);
  }

export const CATLBL: Record<number, [string, string]> = {
  0: ["need", "pn"],
  1: ["want", "pw"],
  2: ["lifestyle", "pl"],
};

export function tierName(t: string | null | undefined): string {
  return t ? TIER_LABELS[t] || t : "—";
}

export function regionColor(r: number): string {
  return (
    ({ 1: "#e7b96b", 2: "#57c98a", 4: "#5fa8ff", 5: "#c98ad6" } as Record<number, string>)[r] ||
    "#8fa9c4"
  );
}

export function fmt(v: number, d = 2): string {
  if (!isFinite(v)) return "0";
  const s = v.toFixed(d);
  return (s.indexOf(".") >= 0 ? s.replace(/\.?0+$/, "") : s) || "0";
}
