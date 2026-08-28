// Socketed specialist items (M11b): who sits in which Trade Union / Town Hall /
// Harbourmaster's Office / Arctic Lodge / ship — the thing you forget between
// sessions and re-derive by clicking round the map.
//
// The pack (items-1800.json, from scripts/extract-items.mjs) is Anno 1800 only,
// same gate as the culture pack: 117 DOES have specialists (the wiki names
// Epona) but publishes no list, so `itemsFor` returns null there and the panels
// never render. Flip this the way M11c will flip cultureFor — with a real pack.
//
// Unlike culture there is no set to complete: an island's sockets hold a
// handful of items out of a thousand, so the record is a placed-list per
// socket building per island (plus one per ship), picked from a datalist
// rather than ticked off chips.
import pack from "./items-1800.json";
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

const P = pack as Pack;

export const ITEMS_PACK = P.pack;
export const ITEMS_SOURCE = P.source;
export const ITEM_SOCKETS: ItemSocket[] = P.sockets;

/** Rarity → sort/tint order; reuses the culture chips' rarity classes. */
export const ITEM_RARITY_ORDER: Record<string, number> = Object.fromEntries(
  P.rarity.map((r, i) => [r, i])
);

const norm = (s: string) => s.trim().toLowerCase();

/** The pack for a game, or null where no list exists (117 — its specialists
 *  are real but the wiki publishes no list to extract). */
export function itemsFor(game: Game): ItemSocket[] | null {
  return game === "anno1800" ? ITEM_SOCKETS : null;
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
  return [it.r, it.tgt ? `Affects ${it.tgt}` : null, it.fx].filter(Boolean).join(" · ");
}

export const SOCKET_EMOJI: Record<string, string> = {
  tu: "🔧",
  th: "🏦",
  hm: "⚓",
  ship: "🎖",
  al: "🌨",
};
