"use client";
// M11b: who is socketed where. One panel per item building an island has
// ticked — Trade Union, Town Hall, Harbourmaster's Office, Arctic Lodge —
// listing the specialists you've put in it, because that is the thing you
// forget between sessions and re-derive by clicking round the map.
//
// Not the culture panel's chip wall: a zoo is a finite collection you tick
// off, but a Trade Union holds three or four items out of a thousand — so
// this is a typed add (with the pack as suggestions) and a short row of what
// you placed. Free text is stored as-is: an item newer than the pack still
// deserves remembering, it just renders untinted.
import React, { useMemo, useState } from "react";
import {
  itemIn,
  itemTitle,
  socketsOn,
  SOCKET_EMOJI,
  type ItemSocket,
} from "@/lib/items";
import type { Game } from "@/lib/games";
import type { CheckItem } from "@/lib/store";
import { useCompanion } from "@/lib/store";

function SocketPanel({
  island,
  s,
  dl,
}: {
  island: string;
  s: ItemSocket;
  /** Document-unique datalist id — several islands render the same socket. */
  dl: string;
}) {
  const { data, setIslandItem, clearIslandItems } = useCompanion();
  const [draft, setDraft] = useState("");
  const placed = useMemo(
    () => (data.islandItems || {})[island]?.[s.id] || [],
    [data.islandItems, island, s.id]
  );
  const have = useMemo(
    () => new Set(placed.map((n) => n.toLowerCase())),
    [placed]
  );
  const add = () => {
    const n = draft.trim();
    if (!n) return;
    setIslandItem(island, s.id, n, true);
    setDraft("");
  };
  return (
    <div className="itsock">
      <div className="ithd">
        <span className="itnm">
          {SOCKET_EMOJI[s.id] || "🎖"} {s.label}
        </span>
        <span className="muted">
          {placed.length
            ? `${placed.length} ${s.noun}${placed.length === 1 ? "" : "s"}`
            : `nothing socketed`}
        </span>
        {placed.length > 0 && (
          <button
            className="linkbtn"
            title={`Take everything out of ${island}'s ${s.label}`}
            onClick={() => {
              if (window.confirm(`Empty ${island}'s ${s.label}?`))
                clearIslandItems(island, s.id);
            }}
          >
            Empty
          </button>
        )}
      </div>
      {placed.length > 0 && (
        <div className="chips">
          {placed.map((n) => {
            const it = itemIn(s, n);
            return (
              <button
                key={n}
                className={"chip cuitem" + (it ? " rar" + it.r.replace(/\W+/g, "") : "")}
                title={
                  (it ? itemTitle(it) + " — " : "") + `press to take it out of the ${s.label}`
                }
                onClick={() => setIslandItem(island, s.id, n, false)}
              >
                {n} ✕
              </button>
            );
          })}
        </div>
      )}
      <div className="plrow">
        <input
          placeholder={`Add ${s.noun}… as the item card names it (Enter to add)`}
          list={dl}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
        />
        <button
          className="linkbtn"
          disabled={!draft.trim()}
          title={`Socket it in ${island}'s ${s.label}`}
          onClick={add}
        >
          ＋ Add
        </button>
      </div>
      <datalist id={dl}>
        {s.items
          .filter((i) => !have.has(i.n.toLowerCase()))
          .map((i) => (
            // The effect as the option's text, so typing what an item DOES
            // ("riots", "Charcoal") finds it too; picking inserts the name.
            <option key={i.n} value={i.n}>
              {[i.r, i.tgt, i.fx].filter(Boolean).join(" · ")}
            </option>
          ))}
      </datalist>
    </div>
  );
}

export default function ItemsBlock({
  island,
  items,
  game,
  domId,
}: {
  island: string;
  items: CheckItem[];
  game: Game;
  /** Island-unique prefix for the datalists (the island's DOM id). */
  domId: string;
}) {
  const built = socketsOn(items, game);
  if (!built.length) return null;
  return (
    <div
      className="iledger itwrap"
      title="Who is socketed in this island's item buildings. Tick a Trade Union, Town Hall, Harbourmaster's Office or Arctic Lodge (1800) — or a Villa or Guesthouse (117) — in the inventory above and its slots appear here; ship items live on the ship, in the 🚢 tab."
    >
      {built.map((s) => (
        <SocketPanel key={s.id} island={island} s={s} dl={`${domId}-it-${s.id}`} />
      ))}
    </div>
  );
}
