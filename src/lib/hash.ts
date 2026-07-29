// URL-hash codec — same wire format as the legacy app, so old shared links keep working.
import { CalcState, DEFAULT_STATE } from "./engine";
import { GOODS } from "./data";

export function encodeHash(st: CalcState): string {
  const e = {
    s: st.sel,
    r: st.regionFilter,
    p: st.prod,
    c: st.coalTime,
    rd: st.round ? 1 : 0,
    t: st.tab,
    m: st.mode,
    pp: st.pop,
    el: st.electricity ? 1 : 0,
    ls: st.lifestyle ? 1 : 0,
    si: st.silo ? 1 : 0,
    cn: st.cons,
  };
  return btoa(unescape(encodeURIComponent(JSON.stringify(e))));
}

export function decodeHash(hash: string): CalcState | null {
  if (!hash || hash.length < 2) return null;
  try {
    const e = JSON.parse(decodeURIComponent(escape(atob(hash.replace(/^#/, "")))));
    const st: CalcState = { ...DEFAULT_STATE, sel: {}, pop: {} };
    if (e.s) for (const k in e.s) if (GOODS[k]) st.sel[k] = e.s[k];
    if (e.r != null) st.regionFilter = e.r;
    if (e.p) st.prod = e.p;
    if (e.c) st.coalTime = e.c;
    if (e.rd != null) st.round = !!e.rd;
    if (e.t) st.tab = e.t;
    if (e.m) st.mode = e.m;
    if (e.pp) st.pop = e.pp;
    if (e.el != null) st.electricity = !!e.el;
    if (e.ls != null) st.lifestyle = !!e.ls;
    if (e.si != null) st.silo = !!e.si;
    if (e.cn) st.cons = +e.cn;
    return st;
  } catch {
    return null;
  }
}
