"use client";

/* Quick add (build 86) — on every tab, because that is where you are when you
 * decide something changed: you've just worked out you need four more
 * sawmills, bought a clipper, or read a new headcount off the city panel.
 * Without this you have to leave what you're looking at, find the right tab,
 * find the island, and by then you've forgotten the third thing.
 *
 * It writes into the same lists the tabs own — a ship joins the fleet, a
 * building joins an island's inventory, residents land in the island's 👥
 * counts — and says where it went, with a way to go and look. Nothing new is
 * stored: it is the tabs' own actions, closer to hand.
 */

import { useEffect, useMemo, useState } from "react";
import { GAME_CONTENT, type Game } from "@/lib/games";
import { buildingOptionsFor } from "@/lib/ledger";
import { useCompanion } from "@/lib/store";
import { GROWTH_TIERS_BY_GAME } from "./TrackerView";
import { Dropdown } from "./ui/Dropdown";

type Kind = "ship" | "building" | "pop";
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
  const { game, data, addShip, addIslandCheck, setIslandPop } = useCompanion();
  const islands = data.islands || [];
  const [kind, setKind] = useState<Kind>("building");
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [isle, setIsle] = useState("");
  // ×N for buildings ("four more sawmills"), the headcount for residents.
  // Kept as text so the box can sit empty; parsed on add.
  const [count, setCount] = useState("");
  const [tid, setTid] = useState("");
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
  // The 👥 kind offers the same region-scoped tiers as the island's own
  // editor; a game with no growth model simply doesn't offer the kind.
  const allTiers = GROWTH_TIERS_BY_GAME[game] ?? [];
  const regionNum = GAME_CONTENT[game].regionNum[region] || 0;
  const tiers = regionNum ? allTiers.filter((t) => t.region === regionNum) : allTiers;
  // A region switch can strand a tier pick from elsewhere (no Elders in the
  // Old World) — re-check it like the island above.
  useEffect(() => {
    if (tid && !tiers.some((t) => t.tid === tid)) setTid("");
  }, [tiers, tid]);
  const curPop = tid ? ((data.islandPop || {})[isle] || {})[tid] || 0 : 0;
  const types = GAME_CONTENT[game].shipTypes;
  const known = new Set((data.ships || []).map((s) => s.name.trim().toLowerCase()));
  const dupe = kind === "ship" && !!name.trim() && known.has(name.trim().toLowerCase());
  const canAdd =
    kind === "pop"
      ? !!isle && !!tid && count.trim() !== ""
      : !!name.trim() && !dupe && (kind === "ship" || !!isle);
  const add = () => {
    if (!canAdd) return;
    if (kind === "pop") {
      // SET, not add: you read the number off the island's population panel
      // and transcribe it, so what you typed is what the island now has.
      const n = Math.max(0, Math.floor(Number(count)) || 0);
      setIslandPop(isle, tid, n);
      const lbl = tiers.find((t) => t.tid === tid)?.lbl || tid;
      setSaid({ text: `${isle}: ${lbl} ${n}`, tab: "islands" });
      setCount("");
      // The island and tier stay: correcting the next tier of the same
      // island is the common follow-up.
      return;
    }
    const n = name.trim();
    if (kind === "ship") {
      addShip(n, type);
      setSaid({ text: `${n} joined the fleet`, tab: "ships" });
    } else {
      // Re-adding a building you already have bumps its count, which is what
      // ×4 (or tapping ＋ four times) for four sawmills should do.
      const by = Math.max(1, Math.floor(Number(count)) || 1);
      addIslandCheck(isle, n, by);
      setSaid({ text: `${by > 1 ? `${by}× ` : ""}${n} added to ${isle}`, tab: "islands" });
      setCount("");
    }
    setName("");
    // The type stays: fleets come in batches of the same hull.
  };
  const pick = (k: Kind) => {
    setKind(k);
    setSaid(null);
    setCount("");
  };
  const needsIsle = kind !== "ship";
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
          {allTiers.length > 0 && (
            <button
              className={"chip" + (kind === "pop" ? " on" : "")}
              title="A headcount read off the game's population panel — it sets that island's 👥 count for the tier"
              onClick={() => pick("pop")}
            >
              👥 Residents
            </button>
          )}
          <button
            className={"chip" + (kind === "ship" ? " on" : "")}
            title="A ship you've just bought or built — it joins the fleet"
            onClick={() => pick("ship")}
          >
            🚢 Ship
          </button>
        </div>
        {needsIsle && !islands.length ? (
          <div className="empty">
            No islands yet — {kind === "pop" ? "residents have" : "a building has"} to go
            somewhere.{" "}
            <button className="linkbtn" onClick={() => go("islands")}>
              🏝 Add one
            </button>
          </div>
        ) : (
          <div className="plrow qarow">
            {needsIsle && (
              <Dropdown
                className="qaisle"
                ariaLabel={
                  kind === "pop" ? "Which island the residents live on" : "Which island the building is on"
                }
                title={
                  kind === "pop"
                    ? "Which island they live on. Its region decides which tiers are offered."
                    : "Which island it went up on. Its region decides what the box suggests."
                }
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
            {kind === "pop" ? (
              <>
                <input
                  className="qacount qanum"
                  type="number"
                  min={0}
                  step={10}
                  placeholder={tid ? String(curPop) : "how many"}
                  value={count}
                  aria-label="How many residents"
                  title="The tier's headcount, as the game shows it. This SETS the count — the box shows what it is now."
                  onChange={(e) => setCount(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") add();
                  }}
                />
                <Dropdown
                  className="qatier"
                  ariaLabel="Which tier of residents"
                  title="Which tier they are. Only the island's own region's tiers are offered."
                  placeholder="tier…"
                  value={tid}
                  onChange={setTid}
                  options={tiers.map((t) => ({ value: t.tid, label: t.lbl }))}
                />
              </>
            ) : (
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
            )}
            {kind === "building" && (
              <>
                <input
                  className="qacount"
                  type="number"
                  min={1}
                  placeholder="×1"
                  value={count}
                  aria-label="How many of it"
                  title="How many went up — ×4 adds four sawmills in one tap."
                  onChange={(e) => setCount(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") add();
                  }}
                />
                <datalist id="qaBuildings">
                  {buildings.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </>
            )}
            <button
              className="linkbtn qaadd"
              disabled={!canAdd}
              title={
                dupe
                  ? "You already have a ship by that name"
                  : kind === "pop"
                    ? "Set the count"
                    : "Add it"
              }
              onClick={add}
            >
              {kind === "pop" ? "✓ Set" : "＋ Add"}
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
