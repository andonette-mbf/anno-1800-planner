"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { VERSION } from "@/lib/data";
import { VERSION_117 } from "@/lib/data117";
import { CalcState, DEFAULT_STATE } from "@/lib/engine";
import { GAMES } from "@/lib/games";
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

export function AppShell() {
  const { game, setGame } = useCompanion();
  // The calculator engine is still 1800-only (M10 phase 3), so 117 shows the
  // Tracker alone rather than a calculator that would quietly use 1800's math.
  const calcReady = game === "anno1800";
  const [view, setView] = useState<View>("calc");
  // With no calculator in 117, the Tracker is the only view — so the stored
  // "calc" preference must not leave the nav chip unhighlighted.
  const activeView: View = calcReady ? view : "tracker";
  const [st, setSt] = useState<CalcState>({ ...DEFAULT_STATE, ...LEGACY_DEFAULT });
  const [gen, setGen] = useState(0);
  const hydrated = useRef(false);

  // Load state from the URL hash once (legacy-compatible links) and restore
  // the last active view. A shared calc link should open on the calculator.
  useEffect(() => {
    const fromHash = decodeHash(window.location.hash);
    if (fromHash) {
      setSt(fromHash);
      setGen((g) => g + 1);
    }
    try {
      const v = normalizeView(localStorage.getItem(VIEW_KEY));
      if (v) setView(v);
    } catch {}
    hydrated.current = true;
  }, []);

  const go = useCallback((v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  }, []);

  // Reflect state into the hash (same format as the legacy app).
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      history.replaceState(null, "", "#" + encodeHash(st));
    } catch {}
  }, [st]);

  const patch = useCallback((p: Partial<CalcState>) => setSt((s) => ({ ...s, ...p })), []);
  const bumpGen = useCallback(() => setGen((g) => g + 1), []);
  const loadState = useCallback(
    (data: CalcState) => {
      setSt({ ...DEFAULT_STATE, ...data });
      setGen((g) => g + 1);
      go("calc");
    },
    [go]
  );

  return (
    <div className="wrap">
      <header className="top">
        <div className="logo">{calcReady ? "A" : "🏛"}</div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1>{calcReady ? "Anno 1800 Production Planner" : "Anno 117 Tracker"}</h1>
          <div className="sub">
            {calcReady
              ? "Set your target output — get exact building counts, shared-resource savings & whole-building layouts."
              : "Quests, islands and inventory for Pax Romana. The calculator is still 1800-only."}
          </div>
        </div>
        <span className="badge" id="verBadge">
          {calcReady ? VERSION : VERSION_117}
        </span>{" "}
        {calcReady && <ShareButton />}
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
            ...(calcReady ? ([["calc", "🧮 Calculator"]] as [View, string][]) : []),
            ["tracker", "📜 Tracker"],
          ] as [View, string][]
        ).map(([v, label]) => (
          <button
            key={v}
            className={`chip ${activeView === v ? "on" : ""}`}
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
        style={{ display: activeView === "calc" ? undefined : "none" }}
      >
        <LeftPanel st={st} patch={patch} gen={gen} bumpGen={bumpGen} loadState={loadState} />
        <Results st={st} patch={patch} />
      </div>
      <div style={{ display: activeView === "tracker" ? "block" : "none" }}>
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
