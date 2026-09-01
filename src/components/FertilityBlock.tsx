"use client";
// Build 122: what this island got when you settled it — the region's whole
// list as chips, lit where the island has it. Lives on the island card next
// to the patron row. The cross-island answer ("what does the Old World still
// lack?") is the 🌱 strip at the top of the Islands card, fed by the same
// ticks; this block is where the ticks are made.
//
// Storage is the islandItems pseudo-socket FERT_SOCKET (see fertility.ts), so
// sync, saves and island rename/delete are already handled.
import React from "react";
import { FERT_SOCKET, fertilitiesFor, regionFertility, shortFertName } from "@/lib/fertility";
import type { Game } from "@/lib/games";
import { useCompanion } from "@/lib/store";

export default function FertilityBlock({
  island,
  game,
  region,
}: {
  island: string;
  game: Game;
  region: string;
}) {
  const { data, setIslandItem } = useCompanion();
  if (!fertilitiesFor(game)) return null;
  const list = regionFertility(game, region);
  const have = (data.islandItems || {})[island]?.[FERT_SOCKET] || [];
  const has = (n: string) => have.includes(n);
  if (!list) {
    return (
      <div className="iledger itwrap fertblk">
        <div className="ithd">
          <span className="itnm">🌱 Fertilities</span>
          <span className="muted">Tag a 🌍 region above to record what this island has.</span>
        </div>
      </div>
    );
  }
  const total = list.fert.length + list.deposits.length;
  const count = have.filter((n) => list.fert.includes(n) || list.deposits.includes(n)).length;
  const chip = (n: string, kind: "fert" | "deposit") => (
    <button
      key={n}
      className={"chip schip fertchip" + (has(n) ? " on" : "")}
      aria-pressed={has(n)}
      title={
        (has(n) ? `${island} has ${n}` : `${island} lacks ${n}`) +
        (kind === "deposit" ? " (deposit)" : "") +
        " — press to change"
      }
      onClick={() => setIslandItem(island, FERT_SOCKET, n, !has(n))}
    >
      {shortFertName(n)}
    </button>
  );
  return (
    <div className="iledger itwrap fertblk">
      <div className="ithd">
        <span className="itnm">🌱 Fertilities</span>
        <span
          className="muted"
          title="Tick what the island's info panel shows. The 🌱 line at the top of the Islands card then lists what no island in the region has."
        >
          {count}/{total} — mark the ones this island has
        </span>
      </div>
      <div className="chips fertchips">
        {list.fert.map((n) => chip(n, "fert"))}
        {list.deposits.length > 0 && (
          <span className="fertsep muted" title="Mine, clay and oil deposits">
            ⛏
          </span>
        )}
        {list.deposits.map((n) => chip(n, "deposit"))}
      </div>
    </div>
  );
}
