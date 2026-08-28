"use client";
// M11c: which deity this island is devoted to. 117's Religion system is ONE
// patron per island whose buffs scale with devotion — not a set to complete
// (so no culture-style chip wall) and not a socketed item (so no datalist):
// an honest little row with a picker and what full devotion pays.
//
// The pick rides the islandItems store under the pseudo-socket id "patron" —
// same island-keyed shape, so sync, save-switching and island rename/delete
// cleanup all come for free. It never collides with a real socket because
// "patron" is not in any pack's sockets list.
import React from "react";
import { patronsFor } from "@/lib/items";
import type { Game } from "@/lib/games";
import { useCompanion } from "@/lib/store";

export default function PatronBlock({ island, game }: { island: string; game: Game }) {
  const { data, setIslandItem, clearIslandItems } = useCompanion();
  const patrons = patronsFor(game);
  if (!patrons) return null;
  const placed = (data.islandItems || {})[island]?.["patron"] || [];
  const current = placed[0] || "";
  const p = patrons.find((x) => x.n === current);
  const pick = (n: string) => {
    clearIslandItems(island, "patron");
    if (n) setIslandItem(island, "patron", n, true);
  };
  return (
    <div className="iledger itwrap patronblk">
      <div className="ithd">
        <span className="itnm">⚜️ Patron</span>
        <select
          value={current}
          title={`The deity ${island} is devoted to — one per island, buffs grow with devotion`}
          onChange={(e) => pick(e.target.value)}
        >
          <option value="">— none chosen —</option>
          {patrons.map((x) => (
            <option key={x.n} value={x.n}>
              {x.n}
              {x.dlc ? ` (${x.dlc})` : ""}
            </option>
          ))}
        </select>
      </div>
      {p && (
        <div className="patronfx muted">
          {p.fx.length ? (
            p.fx.map((line) => <div key={line}>{line}</div>)
          ) : (
            // Mercury-Lugus: real deity, trade buffs the production data
            // doesn't carry — say so rather than showing an empty box.
            <div>Trade and diplomacy boons — nothing the production numbers see.</div>
          )}
          {p.wonder && <div>Wonder: {p.wonder}</div>}
        </div>
      )}
    </div>
  );
}
