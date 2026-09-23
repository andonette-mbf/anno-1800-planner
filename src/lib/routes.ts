// The route board (build 133) — every trade run you have going, in one list,
// with the mess called out.
//
// The app already had both halves of the trade story and showed neither of
// them whole. Ticked links (`islandLinks`) hang off ledger rows on the Islands
// card; ship routes (a ship whose job is Trade route, with from/to/cargo) hang
// off ship rows on the Ships card. TrackerView merges the two into one `flows`
// list for `applyTrade` — and then throws the merged view away. So there was
// nowhere that answered "what am I actually running, and with what?", which is
// exactly the question you lose track of.
//
// This is a PURE VIEW, like `suggestTrades`: it stores nothing and mutates
// nothing. Everything it reports is derived from the links, the ships and the
// POST-`applyTrade` ledgers, which is why the numbers here agree with the ones
// on the island rows — they ARE those numbers, read back off `imp`/`exp`.
//
// Two kinds of finding, counted apart:
//   - ISSUES (⚠) — something is wrong or stale: a flow with no hull, two hulls
//     duplicating one good, a destination that now makes its own, an island
//     that no longer exists, more goods than the hold has slots, a trader that
//     never said what or where.
//   - IDEAS (💡) — nothing is broken, but a hull could be freed: two ships on
//     one leg whose cargo fits in one of them.
//
// Everything is matched case-insensitively on island and good names, the same
// rule `applyTrade` and `suggestTrades` use, because these names are typed by
// hand in three different places.

import type { LedgerRow, TradeFlow } from "./ledger";
import type { ShipItem } from "./store";

const norm = (s: string | undefined) => (s || "").trim().toLowerCase();
const EPS = 1e-9;

export type RouteNoteKind =
  /** Goods are linked along this leg but no ship is carrying them. */
  | "no-ship"
  /** Two or more ships on this leg carry the same good. */
  | "duplicate"
  /** The destination makes enough of the good itself — a route left running. */
  | "covered"
  /** An end of the leg isn't an island you hold (renamed, or dropped). */
  | "orphan"
  /** More distinct goods than the hull has cargo slots. */
  | "overloaded"
  /** A good is on the run but nothing is spare at the source to send. */
  | "empty"
  /** A trader that hasn't said what it carries. */
  | "no-cargo"
  /** A trader that hasn't said where it runs. */
  | "no-route"
  /** Hulls standing idle while a leg goes uncarried. */
  | "idle"
  /** The timed hulls on this run can't move what it has to move. */
  | "short"
  /** IDEA: these ships' cargo fits in one of them. */
  | "merge";

export interface RouteNote {
  kind: RouteNoteKind;
  text: string;
  /** A suggestion rather than a fault — counted and tinted apart. */
  idea?: boolean;
}

/** One ship running a leg, carrying its stored position so a tap can open it
 *  in the fleet list (the list sorts, the store doesn't — build 82's rule). */
export interface RouteShipRef {
  name: string;
  type?: string;
  /** Its cargo on this leg, in the order it was typed. */
  goods: string[];
  /** Cargo slots for its type, when the game knows the hull. */
  holds?: number;
  /** Minutes for one lap of the run, as timed in game (build 135). */
  rt?: number;
  /** What it can actually shift, t/min — `holds × slotTons ÷ rt`. Needs both
   *  a known hull and a lap time, so it's absent until the run is timed. */
  moves?: number;
  /** Position in the stored `ships` array. */
  idx: number;
}

export interface RouteGood {
  good: string;
  /** t/min actually moving, read off the source row's `exp` — absent when the
   *  source has no ledger (an island you don't hold) or nothing was spare. */
  tpm?: number;
  /** Recorded as a ticked link on the source's ledger row. */
  linked: boolean;
  /** Names of the ships carrying it on this leg. */
  ships: string[];
}

export interface RouteLeg {
  from: string;
  to: string;
  goods: RouteGood[];
  ships: RouteShipRef[];
  notes: RouteNote[];
  /** t/min this run has to shift: its goods' figures added up. */
  needed: number;
  /** t/min its timed hulls can shift between them. 0 when none are timed. */
  capacity: number;
  /** Hulls on the run with no lap time yet — until this is empty, `capacity`
   *  is a floor rather than the answer, so nothing is called short. */
  untimed: string[];
}

export interface RouteBoard {
  legs: RouteLeg[];
  /** Findings that belong to no leg — traders with nothing filled in, and the
   *  idle-hulls nudge. */
  loose: RouteNote[];
  issues: number;
  ideas: number;
}

export interface RouteBoardInput {
  /** Ticked links — `islandLinks`, the same rows `applyTrade` is fed. */
  links: TradeFlow[];
  ships: ShipItem[];
  /** The islands you hold, for spotting a leg that names one you don't. */
  islands: string[];
  /** POST-`applyTrade` ledgers, keyed by island name. Feed the same object the
   *  island cards render, never raw ones: the tonnages here are read off the
   *  `imp`/`exp` chips trade wrote, and "makes its own" has to be able to tell
   *  local production from what a route delivered. */
  ledgers: Record<string, LedgerRow[]>;
  /** Cargo slots by ship type — `GameContent.shipHolds`. Absent (or a type
   *  that isn't in it) means no hold check for that ship, which is the honest
   *  answer for a hull we have no number for. */
  holds?: Record<string, number>;
  /** Tons one cargo slot holds — `GameContent.slotTons`. Without it (or
   *  without `holds`) a run can't be sized, and no capacity is worked out. */
  slotTons?: number;
  /** The `doing` value that means "this is a trader". */
  tradeJob: string;
  /** Statuses that take a ship off the fleet — a sunk trader isn't a route
   *  with a missing hull, it's a wreck. */
  gone?: string[];
}

/** A leg's identity: direction matters, case doesn't. */
const legKey = (from: string, to: string) => `${norm(from)}\u0000${norm(to)}`;

function rowsOf(ledgers: Record<string, LedgerRow[]>, isle: string) {
  const want = norm(isle);
  for (const [name, rows] of Object.entries(ledgers)) if (norm(name) === want) return rows;
  return undefined;
}

function rowOf(ledgers: Record<string, LedgerRow[]>, isle: string, good: string) {
  const want = norm(good);
  return rowsOf(ledgers, isle)?.find((r) => norm(r.name) === want);
}

/** What actually sails: the source row's exports to this destination. Several
 *  flows can share a leg (a link AND a ship, or two ships), and `applyTrade`
 *  records one `exp` entry each, so they sum. */
function movedOn(
  ledgers: Record<string, LedgerRow[]>,
  from: string,
  good: string,
  to: string
): number | undefined {
  const r = rowOf(ledgers, from, good);
  if (!r?.exp) return undefined;
  const want = norm(to);
  let total = 0;
  let found = false;
  for (const e of r.exp)
    if (norm(e.to) === want) {
      total += e.tpm;
      found = true;
    }
  return found ? total : undefined;
}

/** Does the destination make enough of this itself, without the route?
 *
 *  Deliberately strict, because `applyTrade` legitimately dumps a spare
 *  surplus on an island with no tracked consumer at all (the cotton-to-Cape-
 *  Trelawney case in its own docs) and that must NOT read as a stale route.
 *  So this says yes only when the island really PRODUCES the good — local
 *  production above zero — and that production already covers its local use.
 *  An island that re-exports the good is a relay, not a dead end, so it is
 *  never flagged either. */
function coversItsOwn(
  ledgers: Record<string, LedgerRow[]>,
  isle: string,
  good: string
): boolean {
  const r = rowOf(ledgers, isle, good);
  if (!r) return false;
  const exported = (r.exp || []).reduce((a, e) => a + e.tpm, 0);
  if (exported > EPS) return false;
  const imported = (r.imp || []).reduce((a, e) => a + e.tpm, 0);
  const local = r.produced - imported;
  // `used` is local use only here, since nothing is exported.
  return local > EPS && local - r.used >= -EPS;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Tonnages in prose: two decimals at most, and no trailing zeroes. */
const round = (n: number) => String(Math.round(n * 100) / 100);
const list = (xs: string[]) =>
  xs.length <= 1
    ? xs.join("")
    : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

/** Every run you have going, with what's wrong with it.
 *
 *  Legs come from two places and are keyed the same way: a ticked link makes a
 *  leg, and so does a ship with both ends filled in — including one with no
 *  cargo yet, because a trader that has said where but not what is precisely
 *  the sort of half-finished thing this board exists to surface. */
export function routeBoard(input: RouteBoardInput): RouteBoard {
  const { links = [], ships = [], islands = [], ledgers = {}, tradeJob, slotTons } = input;
  const gone = new Set((input.gone || []).map(norm));
  const holds = new Map(Object.entries(input.holds || {}).map(([k, v]) => [norm(k), v]));
  const held = new Map(islands.map((n) => [norm(n), n]));
  // Prefer the island list's spelling for a name typed three different ways.
  const display = (n: string) => held.get(norm(n)) || n.trim();

  type Draft = {
    from: string;
    to: string;
    goods: Map<string, { good: string; linked: boolean; ships: string[] }>;
    ships: RouteShipRef[];
  };
  const legs = new Map<string, Draft>();
  const leg = (from: string, to: string) => {
    const k = legKey(from, to);
    let d = legs.get(k);
    if (!d)
      legs.set(k, (d = { from: display(from), to: display(to), goods: new Map(), ships: [] }));
    return d;
  };
  const addGood = (d: Draft, good: string, via: "link" | string) => {
    const k = norm(good);
    if (!k) return;
    let g = d.goods.get(k);
    if (!g) d.goods.set(k, (g = { good: good.trim(), linked: false, ships: [] }));
    if (via === "link") g.linked = true;
    else if (!g.ships.includes(via)) g.ships.push(via);
  };

  for (const l of links) {
    if (!l?.good || !l.from || !l.to) continue;
    addGood(leg(l.from, l.to), l.good, "link");
  }

  const loose: RouteNote[] = [];
  let traders = 0;
  let idlers = 0;
  ships.forEach((s, idx) => {
    if (!s?.name) return;
    const job = (s.doing || "").trim();
    if (gone.has(norm(job))) return;
    const isTrader = norm(job) === norm(tradeJob);
    const cargo = (s.cargo || []).filter((g) => norm(g));
    const ends = !!(s.from && s.to);
    if (isTrader) traders++;
    // A hull with nothing to do is one the board can offer to a leg that has
    // no carrier. "Said nothing" counts: an untagged ship is usually one you
    // forgot about, which is the same problem.
    else if (!job || norm(job) === "idle") idlers++;
    if (!ends) {
      // Only a declared trader is missing something by having no route — a
      // frigate is not a broken trade run.
      if (isTrader)
        loose.push({
          kind: "no-route",
          text: `${s.name} says ${tradeJob} but hasn't said where it runs${
            cargo.length ? ` — it's carrying ${list(cargo)}` : ""
          }.`,
        });
      return;
    }
    // from/to are filled in, so this ship IS a run whatever its job says.
    const d = leg(s.from!, s.to!);
    const hold = holds.get(norm(s.type));
    const rt = Number(s.rt) > 0 ? Number(s.rt) : undefined;
    // What a lap is worth: a full hold, delivered once per lap. Needs the hull
    // size, the game's tons-per-slot and a lap time — any one missing and the
    // run simply isn't sized rather than being sized on a guess.
    const moves =
      hold !== undefined && rt !== undefined && slotTons ? (hold * slotTons) / rt : undefined;
    d.ships.push({
      name: s.name,
      ...(s.type ? { type: s.type } : {}),
      goods: cargo,
      ...(hold === undefined ? {} : { holds: hold }),
      ...(rt === undefined ? {} : { rt }),
      ...(moves === undefined ? {} : { moves }),
      idx,
    });
    for (const g of cargo) addGood(d, g, s.name);
  });

  const out: RouteLeg[] = [];
  for (const d of legs.values()) {
    const notes: RouteNote[] = [];
    const goods: RouteGood[] = [...d.goods.values()]
      .sort((a, b) => a.good.localeCompare(b.good))
      .map((g) => {
        const tpm = movedOn(ledgers, d.from, g.good, d.to);
        return {
          good: g.good,
          ...(tpm === undefined ? {} : { tpm }),
          linked: g.linked,
          ships: g.ships,
        };
      });

    // --- an end that isn't yours any more -------------------------------
    const lost = [d.from, d.to].filter((n) => !held.has(norm(n)));
    if (lost.length)
      notes.push({
        kind: "orphan",
        text:
          lost.length === 2
            ? `Neither ${d.from} nor ${d.to} is on your island list — renamed, or a trader's port?`
            : `${lost[0]} isn't on your island list — renamed, or a trader's port?`,
      });

    // --- goods with nobody carrying them --------------------------------
    const uncarried = goods.filter((g) => !g.ships.length).map((g) => g.good);
    if (uncarried.length && !d.ships.length)
      notes.push({
        kind: "no-ship",
        text: `No ship on this run — ${list(uncarried)} ${
          uncarried.length === 1 ? "is" : "are"
        } linked but nothing is carrying ${uncarried.length === 1 ? "it" : "them"}.`,
      });
    else if (uncarried.length)
      notes.push({
        kind: "no-ship",
        text: `${list(uncarried)} ${uncarried.length === 1 ? "is" : "are"} linked but not in any ship's hold on this run.`,
      });

    // --- a trader here that never said what it carries ------------------
    for (const s of d.ships)
      if (!s.goods.length)
        notes.push({ kind: "no-cargo", text: `${s.name} runs this leg but hasn't said what it carries.` });

    // --- two hulls on the same good -------------------------------------
    const doubled = goods.filter((g) => g.ships.length > 1);
    for (const g of doubled)
      notes.push({
        kind: "duplicate",
        text: `${g.good} is carried by ${list(g.ships)} — two hulls on one good.`,
      });

    // --- on the run, but not moving -------------------------------------
    // The source has nothing spare, so the slot is spent on nothing. One note
    // for the whole leg however many goods are stuck, because early on a lot
    // of runs are set up before production is — that should be a line, not a
    // wall. A good with no figure at all (an island you don't hold, so there
    // is no ledger to ask) is not the same as one measured at zero.
    const idle = goods.filter((g) => g.tpm !== undefined && g.tpm <= EPS).map((g) => g.good);
    if (idle.length)
      notes.push({
        kind: "empty",
        text: `${list(idle)} ${idle.length === 1 ? "is" : "are"} on this run but not moving — nothing spare at ${d.from} to send.`,
      });

    // --- the destination makes its own now ------------------------------
    const stale = goods.filter((g) => coversItsOwn(ledgers, d.to, g.good)).map((g) => g.good);
    if (stale.length)
      notes.push({
        kind: "covered",
        text: `${d.to} makes enough ${list(stale)} of its own — this run may have outlived itself.`,
      });

    // --- more goods than slots ------------------------------------------
    for (const s of d.ships)
      if (s.holds !== undefined && s.goods.length > s.holds)
        notes.push({
          kind: "overloaded",
          text: `${s.name} carries ${plural(s.goods.length, "good")} but ${
            s.type
          } has ${plural(s.holds, "cargo slot")} — a slot holds one good.`,
        });

    // --- is there enough hull on this run? (build 135) -------------------
    //
    // `needed` is what the ledger says has to cross: the goods' own figures,
    // which are already net of everything else moving. `capacity` is a full
    // hold per lap, per timed hull.
    //
    // A shortfall is only CLAIMED when every hull on the run has been timed —
    // otherwise capacity is a floor, and calling a run short because you
    // hadn't got round to timing the second ship would be crying wolf. The
    // untimed ones are reported instead, and the card asks for their times.
    const needed = goods.reduce((a, g) => a + (g.tpm ?? 0), 0);
    const capacity = d.ships.reduce((a, sh) => a + (sh.moves ?? 0), 0);
    const untimed = d.ships.filter((sh) => sh.moves === undefined).map((sh) => sh.name);
    if (!untimed.length && d.ships.length && needed > EPS && capacity + EPS < needed) {
      const gap = needed - capacity;
      // Another hull like the best one already on the run is the concrete
      // answer — "you need more tonnage" is not something you can act on.
      const best = [...d.ships].sort((a, b) => (b.moves || 0) - (a.moves || 0))[0];
      const more = best?.moves ? Math.ceil(gap / best.moves - EPS) : 0;
      notes.push({
        kind: "short",
        text:
          `This run has to shift ${round(needed)} t/min and its ${
            d.ships.length === 1 ? "hull moves" : "hulls move"
          } ${round(capacity)} — ${round(gap)} short.` +
          (more
            ? ` ${plural(more, `more ${best.type || "hull"}`, `more ${best.type || "hull"}s`)} would cover it.`
            : ""),
      });
    }

    // --- IDEA: one hull could do the lot --------------------------------
    // Only when the numbers say so. Distinct goods across every ship on the
    // leg, against the biggest hold among them: if they fit, the rest of the
    // hulls are free for something else.
    if (d.ships.length > 1) {
      const all = new Set<string>();
      for (const s of d.ships) for (const g of s.goods) all.add(norm(g));
      const best = d.ships
        .filter((s) => s.holds !== undefined)
        .sort((a, b) => b.holds! - a.holds! || a.name.localeCompare(b.name))[0];
      if (best && all.size <= best.holds! && all.size > 0) {
        const freed = d.ships.filter((s) => s.name !== best.name).map((s) => s.name);
        notes.push({
          kind: "merge",
          idea: true,
          text: `${best.name} alone holds all ${plural(all.size, "good")} on this run — that frees ${list(
            freed
          )}.`,
        });
      }
    }

    out.push({ from: d.from, to: d.to, goods, ships: d.ships, notes, needed, capacity, untimed });
  }

  // --- hulls doing nothing while a leg goes uncarried --------------------
  const uncarried = out.filter((l) => l.notes.some((n) => n.kind === "no-ship")).length;
  if (uncarried && idlers)
    loose.push({
      kind: "idle",
      text: `${plural(uncarried, "run has", "runs have")} nothing carrying ${
        uncarried === 1 ? "it" : "them"
      }, and ${plural(idlers, "ship is", "ships are")} sitting idle.`,
    });
  void traders;

  // Problems first — this board exists to be read top-down when you've lost
  // the thread — then ideas, then the runs that are simply fine.
  const rank = (l: RouteLeg) =>
    l.notes.some((n) => !n.idea) ? 0 : l.notes.length ? 1 : 2;
  out.sort(
    (a, b) => rank(a) - rank(b) || a.from.localeCompare(b.from) || a.to.localeCompare(b.to)
  );

  const all = [...out.flatMap((l) => l.notes), ...loose];
  return {
    legs: out,
    loose,
    issues: all.filter((n) => !n.idea).length,
    ideas: all.filter((n) => n.idea).length,
  };
}
