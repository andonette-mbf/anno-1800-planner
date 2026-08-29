// Socketed specialist items (M11b): who sits in which Trade Union / Town Hall /
// Harbourmaster's Office / Arctic Lodge / ship — the thing you forget between
// sessions and re-derive by clicking round the map.
//
// Two packs (M11c flipped the 117 gate): items-1800.json is scraped from the
// wiki by scripts/extract-items.mjs; items-117.json comes from the upstream
// calculator's Release 3.0 data via scripts/extract-items-117.mjs — the 117
// wiki still publishes no item list, but upstream now carries the 172
// specialists (equipped in Villas / Guesthouses, one shared list — the data
// has no per-item socket) and the 8 patrons. Epona turned out to be a DEITY,
// not a specialist — the old wiki mention that seeded this file's note was
// misleading.
//
// Unlike culture there is no set to complete: an island's sockets hold a
// handful of items out of a thousand, so the record is a placed-list per
// socket building per island (plus one per ship), picked from a datalist
// rather than ticked off chips.
import pack from "./items-1800.json";
import pack117 from "./items-117.json";
import type { Game } from "./games";

export interface SocketItem {
  /** Display name — the identity, it is what the game's item card says.
   *  Compared case-insensitively everywhere. */
  n: string;
  r: string; // rarity badge, incl. the odd "Quest" / "Character Item"
  /** What it affects ("Charcoal Kiln", "All Production Buildings"…). Ship
   *  items affect the ship they're in and carry none. */
  tgt?: string;
  /** What it does, compacted to one line — the reason you socketed it. */
  fx?: string;
  icon?: string; // wiki file name, for a future pictures pass
  /** The DLC it ships with (117 pack only — 1800's wiki pages don't carry it). */
  dlc?: string;
}

export interface ItemSocket {
  id: string; // "tu" | "th" | "hm" | "ship" | "al"
  /** Matched against the island inventory's item names ("Trade Union"). */
  label: string;
  noun: string; // "specialist" | "item"
  items: SocketItem[];
}

interface Pack {
  pack: number;
  source: { wiki: string; note: string; pages: { page: string; revid: number }[] };
  rarity: string[];
  sockets: ItemSocket[];
}

/** 117's Religion system: ONE patron deity per island, devotion buffs. Not a
 *  socketed item and not a culture set — it gets its own small block. */
export interface Patron {
  n: string;
  /** One line per local effect, quoted at full devotion. May be empty —
   *  Mercury-Lugus (trade deity) has no production effects in the data. */
  fx: string[];
  wonder?: string; // the wonder this patron unlocks, where one exists
  dlc?: string;
}

interface Pack117 {
  pack: number;
  source: { upstream: string; commit: string; note: string };
  rarity: string[];
  /** Socket shells — the shared item list is attached below: the data has no
   *  per-item socket (every item is Radius scope), so Villa and Guesthouse
   *  offer the same 172 and duplicating them in the JSON would be pure bulk. */
  sockets: { id: string; label: string; noun: string }[];
  items: SocketItem[];
  patrons: Patron[];
}

const P = pack as Pack;
const P117 = pack117 as Pack117;

export const ITEMS_PACK = P.pack;
export const ITEMS_SOURCE = P.source;
export const ITEM_SOCKETS: ItemSocket[] = P.sockets;

export const ITEMS117_PACK = P117.pack;
export const ITEMS117_SOURCE = P117.source;
export const ITEM_SOCKETS_117: ItemSocket[] = P117.sockets.map((s) => ({
  ...s,
  items: P117.items,
}));
export const PATRONS: Patron[] = P117.patrons;

/** Rarity → sort/tint order; reuses the culture chips' rarity classes. The
 *  two ladders merge — shared names (Common, Rare…) keep 1800's index, and
 *  117's Mythic/Unique land after, which is exactly their power order. */
export const ITEM_RARITY_ORDER: Record<string, number> = Object.fromEntries(
  [...P.rarity, ...P117.rarity.filter((r) => !P.rarity.includes(r))].map((r, i) => [r, i])
);

const norm = (s: string) => s.trim().toLowerCase();

// Per-game packs (M12): a game without one gets null and no socket panels —
// same rule as cultureFor. Add a game by adding its row.
const ITEMS_BY_GAME: Record<Game, ItemSocket[] | null> = {
  anno1800: ITEM_SOCKETS,
  anno117: ITEM_SOCKETS_117,
};
const PATRONS_BY_GAME: Record<Game, Patron[] | null> = {
  anno1800: null,
  anno117: PATRONS,
};

/** The pack for a game — both have one since M11c. */
export function itemsFor(game: Game): ItemSocket[] | null {
  return ITEMS_BY_GAME[game];
}

/** The pickable patron deities, or null for a game without the Religion
 *  system (1800). */
export function patronsFor(game: Game): Patron[] | null {
  return PATRONS_BY_GAME[game];
}

/** The sockets that live on an island. Ships is the fleet's, not an island's. */
export function islandSockets(game: Game): ItemSocket[] {
  return (itemsFor(game) || []).filter((s) => s.id !== "ship");
}

/** The one socket a ship's items sit in, or null for a game with no list. */
export function shipSocket(game: Game): ItemSocket | null {
  return (itemsFor(game) || []).find((s) => s.id === "ship") || null;
}

/** Which socket buildings this island has BUILT — a ticked inventory line
 *  whose name is the socket's. Same rule as cultureOn: unticked is planned,
 *  and there's nothing to socket in a building that doesn't exist. */
export function socketsOn(
  items: { t: string; done: boolean }[],
  game: Game
): ItemSocket[] {
  const built = new Set(items.filter((c) => c.done).map((c) => norm(c.t)));
  return islandSockets(game).filter((s) => built.has(norm(s.label)));
}

/** Look a placed name up in its socket's list — for the rarity tint and the
 *  effect line. Null for a free-typed name the pack doesn't know (a newer
 *  item, a typo): it still shows, just plain. */
export function itemIn(socket: ItemSocket, name: string): SocketItem | null {
  const key = norm(name);
  return socket.items.find((i) => norm(i.n) === key) || null;
}

/** The chip's hover line: rarity, what it touches, what it does. */
export function itemTitle(it: SocketItem): string {
  return [it.r, it.tgt ? `Affects ${it.tgt}` : null, it.fx, it.dlc ? `(${it.dlc})` : null]
    .filter(Boolean)
    .join(" · ");
}

export const SOCKET_EMOJI: Record<string, string> = {
  tu: "🔧",
  th: "🏦",
  hm: "⚓",
  ship: "🎖",
  al: "🌨",
  villa: "🏛",
  gh: "🍺",
};
