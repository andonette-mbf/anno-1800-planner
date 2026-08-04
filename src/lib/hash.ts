// URL-hash codec — same wire format as the legacy app, so old shared links keep working.
//
// M10 phase 3 adds a game marker. It is written ONLY for Anno 117, so an 1800
// link is byte-identical to what the legacy app produces and `/legacy.html` can
// still read links this app makes. A link with no marker decodes as 1800, which
// is what every pre-M10 share link is.
import { CalcState, DEFAULT_STATE, defaultStateFor } from "./engine";
import { DATASETS } from "./dataset";
import { isGame, type Game } from "./games";

export function encodeHash(st: CalcState): string {
  const game = st.game ?? "anno1800";
  const e: Record<string, unknown> = {
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
  if (game !== "anno1800") {
    e.g = game;
    e.bd = st.band ?? DEFAULT_STATE.band;
  }
  return btoa(unescape(encodeURIComponent(JSON.stringify(e))));
}

export function decodeHash(hash: string): CalcState | null {
  if (!hash || hash.length < 2) return null;
  try {
    const e = JSON.parse(decodeURIComponent(escape(atob(hash.replace(/^#/, "")))));
    // The game has to be read first: it decides which pack `sel` is validated
    // against, and 117's blank plan starts in Latium rather than "All".
    const marker: unknown = e.g;
    const game: Game = isGame(marker) ? marker : "anno1800";
    const st: CalcState = defaultStateFor(game);
    const goods = DATASETS[game].goods;
    if (e.s) for (const k in e.s) if (goods[k]) st.sel[k] = e.s[k];
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
    if (e.bd != null) st.band = +e.bd;
    return st;
  } catch {
    return null;
  }
}
