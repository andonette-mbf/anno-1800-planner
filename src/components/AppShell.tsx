"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { datasetFor } from "@/lib/dataset";
import { CalcState, defaultStateFor } from "@/lib/engine";
import { GAMES, type Game } from "@/lib/games";
import { decodeHash, encodeHash } from "@/lib/hash";
import { useAuth, useCompanion } from "@/lib/store";
import { LeftPanel } from "./calc/LeftPanel";
import { Results } from "./calc/Results";
import { TrackerView } from "./TrackerView";

type View = "calc" | "tracker";

const VIEW_KEY = "anno_view";

// Stored ids from removed tabs fall through to the default view; the old
// "session" id maps onto its successor.
function normalizeView(v: string | null): View | null {
  if (v === "session") return "tracker";
  return v === "calc" || v === "tracker" ? v : null;
}

const LEGACY_DEFAULT: Partial<CalcState> = {
  sel: { steel_beams: { mode: "fac", val: 2 }, weapons: { mode: "fac", val: 2 } },
  tab: "whole",
};

// M10 phase 3: each game keeps its OWN calculator state. A 117 plan's `sel`
// holds 117 good ids, which mean nothing in 1800 — switching games has to swap
// the whole plan, not carry selections across.
function initialStates(): Record<Game, CalcState> {
  return {
    anno1800: { ...defaultStateFor("anno1800"), ...LEGACY_DEFAULT },
    anno117: defaultStateFor("anno117"),
  };
}

export function AppShell() {
  const { game, setGame } = useCompanion();
  const [view, setView] = useState<View>("calc");
  const [states, setStates] = useState<Record<Game, CalcState>>(initialStates);
  const st = states[game];
  const [gen, setGen] = useState(0);
  const hydrated = useRef(false);

  // Load state from the URL hash once (legacy-compatible links) and restore
  // the last active view. A shared calc link should open on the calculator —
  // and, since the hash carries a game marker now, on that game.
  useEffect(() => {
    const fromHash = decodeHash(window.location.hash);
    if (fromHash) {
      const g = fromHash.game ?? "anno1800";
      setStates((s) => ({ ...s, [g]: fromHash }));
      setGame(g);
      setGen((x) => x + 1);
    }
    try {
      const v = normalizeView(localStorage.getItem(VIEW_KEY));
      if (v) setView(v);
    } catch {}
    hydrated.current = true;
    // Runs once on mount; setGame is stable for the life of the provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = useCallback((v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  }, []);

  // Reflect the ACTIVE game's state into the hash (same format as the legacy
  // app; the game marker is only written for 117, so 1800 links are unchanged).
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      history.replaceState(null, "", "#" + encodeHash(st));
    } catch {}
  }, [st]);

  const patch = useCallback(
    (p: Partial<CalcState>) => setStates((s) => ({ ...s, [game]: { ...s[game], ...p } })),
    [game]
  );
  const bumpGen = useCallback(() => setGen((g) => g + 1), []);
  const loadState = useCallback(
    (data: CalcState) => {
      const g = data.game ?? "anno1800";
      setStates((s) => ({ ...s, [g]: { ...defaultStateFor(g), ...data } }));
      if (g !== game) setGame(g);
      setGen((x) => x + 1);
      go("calc");
    },
    [go, game, setGame]
  );

  const rome = game === "anno117";
  return (
    <div className="wrap">
      <header className="top">
        <div className="logo">{rome ? "🏛" : "A"}</div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1>{rome ? "Anno 117 Production Planner" : "Anno 1800 Production Planner"}</h1>
          <div className="sub">
            Set your target output — get exact building counts, shared-resource savings &
            whole-building layouts.
            {rome && " Pick the region you're building in: Rome's recipes differ by province."}
          </div>
        </div>
        <span className="badge" id="verBadge">
          {datasetFor(st).version}
        </span>{" "}
        <ShareButton />
        <AuthChip />
      </header>
      {/* Game switcher — each game keeps its own quests, islands and inventory. */}
      <nav className="appnav" id="gamenav" style={{ marginBottom: 0 }}>
        {GAMES.map((g) => (
          <button
            key={g.id}
            className={`chip ${game === g.id ? "on" : ""}`}
            title={`Switch to ${g.label} — separate quests, islands and inventory`}
            onClick={() => {
              setGame(g.id);
              window.scrollTo(0, 0);
            }}
          >
            {g.short}
          </button>
        ))}
      </nav>
      <nav className="appnav" id="appnav">
        {(
          [
            ["calc", "🧮 Calculator"],
            ["tracker", "📜 Tracker"],
          ] as [View, string][]
        ).map(([v, label]) => (
          <button
            key={v}
            className={`chip ${view === v ? "on" : ""}`}
            onClick={() => {
              go(v);
              window.scrollTo(0, 0);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <div
        className="grid"
        id="view-calc"
        style={{ display: view === "calc" ? undefined : "none" }}
      >
        <LeftPanel st={st} patch={patch} gen={gen} bumpGen={bumpGen} loadState={loadState} />
        <Results st={st} patch={patch} />
      </div>
      <div style={{ display: view === "tracker" ? "block" : "none" }}>
        <TrackerView calcState={st} />
      </div>
    </div>
  );
}

function ShareButton() {
  const [label, setLabel] = useState("🔗 Copy shareable link");
  return (
    <button
      className="linkbtn"
      id="shareBtn"
      onClick={() => {
        navigator.clipboard
          ?.writeText(location.href)
          .then(() => {
            setLabel("✓ Link copied");
            setTimeout(() => setLabel("🔗 Copy shareable link"), 1600);
          })
          .catch(() => {});
      }}
    >
      {label}
    </button>
  );
}

function AuthChip() {
  const { status, login, logout } = useAuth();
  if (status === "loading" || status === "off") return null;
  if (status === "anon")
    return (
      <button
        className="linkbtn"
        onClick={async () => {
          const pw = window.prompt("Passphrase to enable sync:");
          if (pw && !(await login(pw))) window.alert("Wrong passphrase.");
        }}
      >
        ☁️ Sign in to sync
      </button>
    );
  return (
    <button className="linkbtn" title="Signed in — click to sign out" onClick={() => logout()}>
      ☁️ Synced ✓
    </button>
  );
}
