"use client";
// M11: the Zoo / Museum / Botanical Garden collection panel that hangs off an
// island block, for the islands that have one of those buildings ticked.
//
// The interaction it is built around is the one that actually happens mid-game:
// an expedition ends, you are holding an animal, and you want to know where it
// goes and whether it finishes anything. So the filter box comes first and
// searches all 133 animals (or 146 artifacts, or 59 plants) at once, and sets
// that are one piece short are called out at the top rather than left to be
// found by scrolling.
import React, { useMemo, useState } from "react";
import {
  buildingProgress,
  CULTURE_EMOJI,
  cultureOn,
  nearlyDone,
  type CultureBuilding,
  type CultureItem,
  type SetProgress,
} from "@/lib/culture";
import type { Game } from "@/lib/games";
import type { CheckItem } from "@/lib/store";
import { useCompanion } from "@/lib/store";

/** Plural of the pack's noun — "6 animals", "1 artifact". */
const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

function itemTitle(i: CultureItem) {
  return [
    i.r,
    `+${i.a} attractiveness`,
    i.dlc ? `${i.dlc} DLC` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function ItemChip({
  item,
  on,
  toggle,
}: {
  item: CultureItem;
  on: boolean;
  toggle: (on: boolean) => void;
}) {
  return (
    <button
      className={"chip cuitem rar" + item.r + (on ? " on" : "")}
      title={itemTitle(item) + (on ? " — displayed here. Tap to remove." : " — tap when you display it here.")}
      aria-pressed={on}
      onClick={() => toggle(!on)}
    >
      {item.n}
    </button>
  );
}

function SetRow({
  sp,
  open,
  onOpen,
  placed,
  toggle,
  filter,
}: {
  sp: SetProgress;
  open: boolean;
  onOpen: () => void;
  placed: Set<string>;
  toggle: (item: string, on: boolean) => void;
  filter: string;
}) {
  const items = filter
    ? sp.set.items.filter((i) => i.n.toLowerCase().includes(filter))
    : sp.set.items;
  return (
    <div className={"cuset" + (sp.done ? " done" : "")}>
      <button className="cusethd" onClick={onOpen} aria-expanded={open}>
        <span className="cuarrow">{open ? "▾" : "▸"}</span>
        <span className="cusetnm">
          {sp.done ? "✓ " : ""}
          {sp.set.label}
        </span>
        {sp.set.dlc && (
          <span className="pill" title={`Needs the ${sp.set.dlc} DLC`}>
            {sp.set.dlc}
          </span>
        )}
        <span className={"num cucount" + (sp.done ? " ok" : "")}>
          {sp.have}/{sp.total}
        </span>
      </button>
      {open && (
        <div className="cusetbd">
          {sp.set.effect && (
            <p className="cueffect" title="What completing the whole set does">
              {sp.done ? "✓ " : ""}
              {sp.set.effect}
            </p>
          )}
          <div className="chips">
            {items.map((i) => (
              <ItemChip
                key={i.n}
                item={i}
                on={placed.has(i.n.toLowerCase())}
                toggle={(v) => toggle(i.n, v)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BuildingPanel({
  island,
  b,
  flat,
}: {
  island: string;
  b: CultureBuilding;
  flat?: boolean;
}) {
  const { data, setIslandCulture, clearIslandCulture } = useCompanion();
  // On the Culture tab the building IS the subject, so it starts open — the
  // fold only exists to get a finished zoo out of the way.
  const [open, setOpen] = useState(!!flat);
  const [q, setQ] = useState("");
  const [openSets, setOpenSets] = useState<Record<string, boolean>>({});

  const placedNames = useMemo(
    () => (data.islandCulture || {})[island]?.[b.id] || [],
    [data.islandCulture, island, b.id]
  );
  const placed = useMemo(
    () => new Set(placedNames.map((n) => n.toLowerCase())),
    [placedNames]
  );
  const prog = useMemo(() => buildingProgress(b, placedNames), [b, placedNames]);
  const next = useMemo(() => nearlyDone(prog), [prog]);

  const filter = q.trim().toLowerCase();
  // A filtered view is a search result, so it opens what it matches — hunting
  // for "Condor" should not also mean guessing which set to expand.
  const shown = filter
    ? prog.sets.filter((s) => s.set.items.some((i) => i.n.toLowerCase().includes(filter)))
    : prog.sets;
  const looseShown = filter
    ? b.loose.filter((i) => i.n.toLowerCase().includes(filter))
    : b.loose;

  const toggle = (item: string, on: boolean) =>
    setIslandCulture(island, b.id, item, on);

  return (
    <div className="cublk">
      <button className="cuhd" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="cuarrow">{open ? "▾" : "▸"}</span>
        <span className="cunm">
          {CULTURE_EMOJI[b.id] || "🏛"} {b.label}
        </span>
        <span className="muted cusum">
          {prog.have}/{prog.total} · {prog.complete}/{b.sets.length} sets
          {prog.attract > 0 ? ` · +${prog.attract} attr` : ""}
        </span>
      </button>
      {open && (
        <div className="cubd">
          {next.length > 0 && !filter && (
            <p className="cunext" title="Finish these and the set bonus switches on">
              ⚑ One piece away —{" "}
              {next
                .slice(0, 3)
                .map((s) => `${s.set.label}: ${s.missing[0].n} (${s.missing[0].r})`)
                .join(" · ")}
            </p>
          )}
          <div className="curow">
            <input
              className="cufind"
              placeholder={`Find a${/^[aeiou]/i.test(b.noun) ? "n" : ""} ${b.noun}…`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {placedNames.length > 0 && (
              <button
                className="linkbtn"
                title={`Take all ${plural(placedNames.length, b.noun)} out of ${island}'s ${b.label}`}
                onClick={() => {
                  if (
                    window.confirm(
                      `Empty ${island}'s ${b.label}? That clears ${plural(
                        placedNames.length,
                        b.noun
                      )}.`
                    )
                  )
                    clearIslandCulture(island, b.id);
                }}
              >
                Empty
              </button>
            )}
          </div>
          {shown.map((s) => (
            <SetRow
              key={s.set.id}
              sp={s}
              open={!!filter || !!openSets[s.set.id]}
              onOpen={() =>
                setOpenSets((o) => ({ ...o, [s.set.id]: !o[s.set.id] }))
              }
              placed={placed}
              toggle={toggle}
              filter={filter}
            />
          ))}
          {looseShown.length > 0 && (
            <div className="cuset">
              <button
                className="cusethd"
                onClick={() => setOpenSets((o) => ({ ...o, __loose: !o.__loose }))}
                aria-expanded={!!filter || !!openSets.__loose}
              >
                <span className="cuarrow">
                  {filter || openSets.__loose ? "▾" : "▸"}
                </span>
                <span className="cusetnm">
                  No set{" "}
                  <span className="muted">
                    — attractiveness only, nothing to complete
                  </span>
                </span>
                <span className="num cucount">
                  {prog.loose.length}/{b.loose.length}
                </span>
              </button>
              {(filter || openSets.__loose) && (
                <div className="cusetbd">
                  <div className="chips">
                    {looseShown.map((i) => (
                      <ItemChip
                        key={i.n}
                        item={i}
                        on={placed.has(i.n.toLowerCase())}
                        toggle={(v) => toggle(i.n, v)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {filter && !shown.length && !looseShown.length && (
            <p className="muted cunone">
              No {b.noun} here matches “{q.trim()}”.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function CultureBlock({
  island,
  items,
  game,
  flat,
}: {
  island: string;
  items: CheckItem[];
  game: Game;
  /** Culture-tab mode: buildings start open and the island-ledger framing is
   *  dropped, since the tab supplies its own island headers. */
  flat?: boolean;
}) {
  const built = cultureOn(items, game);
  if (!built.length) return null;
  return (
    <div
      className={(flat ? "" : "iledger ") + "cuwrap"}
      title="Culture collections on this island. Sets only pay their bonus when every piece is in ONE building, which is why this hangs off the island rather than being one global list."
    >
      {built.map((b) => (
        <BuildingPanel key={b.id} island={island} b={b} flat={flat} />
      ))}
    </div>
  );
}
