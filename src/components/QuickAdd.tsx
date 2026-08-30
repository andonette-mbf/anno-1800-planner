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

import { useEffect, useMemo, useRef, useState } from "react";
import { GAME_CONTENT, type Game } from "@/lib/games";
import { buildingOptionsFor } from "@/lib/ledger";
import { useCompanion } from "@/lib/store";
import { GROWTH_TIERS_BY_GAME } from "./TrackerView";
import { Dropdown } from "./ui/Dropdown";

type Kind = "ship" | "building" | "pop";
export type QuickTab = "islands" | "ships";

// ---------------------------------------------------------- ⏲ quick timer
//
// A kitchen timer with a bell (asked for, build 118): "expedition back in
// ten", "check the war in five". Deliberately device-local — one browser,
// one timer, nothing synced — so the key sits outside CompanionData. The
// bell is Web Audio (no sound file); browsers only allow audio after a user
// gesture, so the AudioContext is created on the START tap and kept for the
// ring. A timer that expires while the page is closed shows Time's up on
// return but stays silent — there was no gesture to unlock a speaker.

const TIMER_KEY = "anno_quick_timer";

/** A ship's-bell-ish double strike, three times over two seconds. */
function ringBell(ctx: AudioContext | null) {
  try {
    if (!ctx) return;
    void ctx.resume?.();
    const strike = (freq: number, at: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      const t = ctx.currentTime + at;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.35, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.65);
    };
    for (let i = 0; i < 3; i++) {
      strike(880, i * 0.8); // A5…
      strike(1174.66, i * 0.8 + 0.25); // …D6, a rising pair
    }
  } catch {}
}

function QuickTimer() {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [rang, setRang] = useState(false);
  const [, setTick] = useState(0);
  const audio = useRef<AudioContext | null>(null);
  // A looped SILENT buffer that plays while the timer runs. Phones suspend
  // background tabs — a frozen tab can't ring — but a tab that is playing
  // audio is kept alive, so this is what lets the bell sound with the screen
  // off or the browser in the background. Stopped when the timer ends.
  const keepalive = useRef<AudioBufferSourceNode | null>(null);
  const stopKeepalive = () => {
    try {
      keepalive.current?.stop();
    } catch {}
    keepalive.current = null;
  };
  // A reload picks the timer back up; one that expired while away just says so.
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(TIMER_KEY));
      if (v > Date.now()) setEndsAt(v);
      else if (v) {
        setRang(true);
        localStorage.removeItem(TIMER_KEY);
      }
    } catch {}
  }, []);
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => {
      if (Date.now() >= endsAt) {
        setEndsAt(null);
        setRang(true);
        try {
          localStorage.removeItem(TIMER_KEY);
        } catch {}
        ringBell(audio.current);
        // The strikes are scheduled; let them finish before the audio
        // session is allowed to wind down.
        setTimeout(stopKeepalive, 3500);
        try {
          navigator.vibrate?.([200, 100, 200]);
        } catch {}
      } else setTick((t) => t + 1); // re-render the countdown
    }, 500);
    return () => clearInterval(id);
  }, [endsAt]);
  const start = (min: number) => {
    if (!Number.isFinite(min) || min <= 0) return;
    try {
      type AC = typeof AudioContext;
      const Ctor: AC | undefined =
        window.AudioContext ?? (window as { webkitAudioContext?: AC }).webkitAudioContext;
      if (Ctor) {
        audio.current ??= new Ctor();
        void audio.current.resume?.(); // the tap unlocks the ring
        const ctx = audio.current;
        if (ctx && !keepalive.current) {
          // One second of digital silence, looped — see keepalive above.
          const src = ctx.createBufferSource();
          src.buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
          src.loop = true;
          src.connect(ctx.destination);
          src.start();
          keepalive.current = src;
        }
      }
    } catch {}
    const t = Date.now() + min * 60000;
    setEndsAt(t);
    setRang(false);
    try {
      localStorage.setItem(TIMER_KEY, String(t));
    } catch {}
  };
  const cancel = () => {
    setEndsAt(null);
    stopKeepalive();
    try {
      localStorage.removeItem(TIMER_KEY);
    } catch {}
  };
  if (rang)
    return (
      <button className="chip schip on" title="Dismiss" onClick={() => setRang(false)}>
        🔔 Time&rsquo;s up ✕
      </button>
    );
  if (endsAt) {
    const left = Math.max(0, endsAt - Date.now());
    const mm = Math.floor(left / 60000);
    const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, "0");
    return (
      <button className="chip schip on" title="Tap to cancel the timer" onClick={cancel}>
        ⏲ {mm}:{ss}
      </button>
    );
  }
  return (
    <Dropdown
      className="qisle"
      ariaLabel="Start a quick timer — it rings when the time is up"
      placeholder="⏲ timer"
      title="A kitchen timer with a bell — rings in this browser when it's up"
      value=""
      onChange={(v) => {
        if (v === "c") {
          const m = window.prompt("Minutes:", "10");
          if (m != null) start(Number(m));
        } else start(Number(v));
      }}
      options={[
        ...[5, 10, 15, 20, 30, 45, 60].map((m) => ({ value: String(m), label: `${m} min` })),
        { value: "c", label: "Custom…" },
      ]}
    />
  );
}

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
        {/* flex:1 keeps the caption beside the title with the ⏲ pushed right
            (the hd is space-between, which would otherwise center it). */}
        <span className="muted" style={{ flex: 1 }}>
          files it on the right tab
        </span>
        {/* The ⏲ lives here because this card is on every tab — a timer you
            have to go and find is one you won't set. */}
        <QuickTimer />
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
