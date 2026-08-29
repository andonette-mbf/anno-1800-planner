"use client";

/* Quick add (build 86) — on the calculator page, because that is where you are
 * when you decide to build something. You've just worked out you need four more
 * sawmills, or you've bought a clipper; without this you have to leave the
 * numbers, find the right tab, find the island, and by then you've forgotten
 * the third thing.
 *
 * It writes into the same lists the tabs own — a ship joins the fleet, a
 * building joins an island's inventory — and says where it went, with a way to
 * go and look. Nothing new is stored: it is the tabs' own actions, closer to
 * hand.
 */

import { useEffect, useMemo, useState } from "react";
import { GAME_CONTENT, type Game } from "@/lib/games";
import { buildingOptionsFor } from "@/lib/ledger";
import { useCompanion } from "@/lib/store";
import { Dropdown } from "./ui/Dropdown";

type Kind = "ship" | "building";
export type QuickTab = "islands" | "ships";

/** Everything an island of this region might hold: the ledger's production
 *  buildings plus the public ones, which make nothing and so aren't in it. */
function buildingsFor(game: Game, region: string): string[] {
  const C = GAME_CONTENT[game];
  const inRegion = (s: { regions?: string[] }) =>
    !s.regions || !region || s.regions.includes(region);
  return [
    ...new Set([
      ...buildingOptionsFor(C.regionNum[region], game),
      ...[...C.suggestions, ...C.services].filter(inRegion).map((s) => s.t),
    ]),
  ].sort();
}

export function QuickAdd({ go }: { go: (tab: QuickTab) => void }) {
  const { game, data, addShip, addIslandCheck } = useCompanion();
  const islands = data.islands || [];
  const [kind, setKind] = useState<Kind>("building");
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [isle, setIsle] = useState("");
  // What just went where, kept until the next add so a glance confirms it
  // landed — you're not on that tab to see it happen.
  const [said, setSaid] = useState<{ text: string; tab: QuickTab } | null>(null);
  // Islands come from storage after mount, and can be renamed or removed on
  // another tab, so the chosen one is re-checked rather than assumed.
  useEffect(() => {
    if (!islands.includes(isle)) setIsle(islands[0] || "");
  }, [islands, isle]);
  const region = (data.islandRegions || {})[isle] || "";
  const buildings = useMemo(() => buildingsFor(game, region), [game, region]);
  const types = GAME_CONTENT[game].shipTypes;
  const known = new Set((data.ships || []).map((s) => s.name.trim().toLowerCase()));
  const dupe = kind === "ship" && !!name.trim() && known.has(name.trim().toLowerCase());
  const canAdd = !!name.trim() && !dupe && (kind === "ship" || !!isle);
  const add = () => {
    if (!canAdd) return;
    const n = name.trim();
    if (kind === "ship") {
      addShip(n, type);
      setSaid({ text: `${n} joined the fleet`, tab: "ships" });
    } else {
      // Re-adding a building you already have bumps its count, which is what
      // tapping ＋ four times for four sawmills should do.
      addIslandCheck(isle, n);
      setSaid({ text: `${n} added to ${isle}`, tab: "islands" });
    }
    setName("");
    // The type stays: fleets come in batches of the same hull.
  };
  const pick = (k: Kind) => {
    setKind(k);
    setSaid(null);
  };
  return (
    <div className="card qacard">
      <div className="hd">
        <h2>＋ Quick add</h2>
        <span className="muted">files it on the right tab</span>
      </div>
      <div className="bd">
        <div className="chips qakind">
          <button
            className={"chip" + (kind === "building" ? " on" : "")}
            title="A building you've just put up — it joins that island's inventory"
            onClick={() => pick("building")}
          >
            🏭 Building
          </button>
          <button
            className={"chip" + (kind === "ship" ? " on" : "")}
            title="A ship you've just bought or built — it joins the fleet"
            onClick={() => pick("ship")}
          >
            🚢 Ship
          </button>
        </div>
        {kind === "building" && !islands.length ? (
          <div className="empty">
            No islands yet — a building has to go somewhere.{" "}
            <button className="linkbtn" onClick={() => go("islands")}>
              🏝 Add one
            </button>
          </div>
        ) : (
          <div className="plrow qarow">
            {kind === "building" && (
              <Dropdown
                className="qaisle"
                ariaLabel="Which island the building is on"
                title="Which island it went up on. Its region decides what the box suggests."
                value={isle}
                onChange={setIsle}
                options={islands.map((n) => ({ value: n, label: n }))}
              />
            )}
            {kind === "ship" && (
              <>
                <input
                  className="qatype"
                  placeholder={types.length ? "type…" : "type… e.g. trireme"}
                  list={types.length ? "qaShipTypes" : undefined}
                  value={type}
                  aria-label="Type of ship"
                  title="Which ship it is. Free text — the list is only the common ones."
                  onChange={(e) => setType(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") add();
                  }}
                />
                <datalist id="qaShipTypes">
                  {types.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </>
            )}
            <input
              className="qaname"
              placeholder={
                kind === "ship" ? "name it as the game does…" : "building… e.g. Sawmill"
              }
              list={kind === "building" ? "qaBuildings" : undefined}
              value={name}
              aria-label={kind === "ship" ? "Name of the ship" : "Building to add"}
              title={
                kind === "ship"
                  ? "What you called it in game — the fleet is read by name."
                  : "Adding one you already have bumps its count, so four taps is four sawmills."
              }
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
              }}
            />
            {kind === "building" && (
              <datalist id="qaBuildings">
                {buildings.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            )}
            <button
              className="linkbtn qaadd"
              disabled={!canAdd}
              title={dupe ? "You already have a ship by that name" : "Add it"}
              onClick={add}
            >
              ＋ Add
            </button>
          </div>
        )}
        {dupe && <div className="note">You already have a ship called that.</div>}
        {said && (
          <div className="note qasaid">
            ✓ {said.text} —{" "}
            <button className="linkbtn" onClick={() => go(said.tab)}>
              {said.tab === "ships" ? "🚢 Ships" : "🏝 Islands"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default QuickAdd;
