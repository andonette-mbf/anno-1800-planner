"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { VERSION } from "@/lib/data";
import { CalcState, DEFAULT_STATE } from "@/lib/engine";
import { decodeHash, encodeHash } from "@/lib/hash";
import { useAuth } from "@/lib/store";
import { LeftPanel } from "./calc/LeftPanel";
import { Results } from "./calc/Results";
import { PlaybookView } from "./PlaybookView";
import { SessionView } from "./SessionView";

type View = "calc" | "playbook" | "session";

const LEGACY_DEFAULT: Partial<CalcState> = {
  sel: { steel_beams: { mode: "fac", val: 2 }, weapons: { mode: "fac", val: 2 } },
  tab: "whole",
};

export function AppShell() {
  const [view, setView] = useState<View>("calc");
  const [st, setSt] = useState<CalcState>({ ...DEFAULT_STATE, ...LEGACY_DEFAULT });
  const [gen, setGen] = useState(0);
  const hydrated = useRef(false);

  // Load state from the URL hash once (legacy-compatible links).
  useEffect(() => {
    const fromHash = decodeHash(window.location.hash);
    if (fromHash) {
      setSt(fromHash);
      setGen((g) => g + 1);
    }
    hydrated.current = true;
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
  const loadState = useCallback((data: CalcState) => {
    setSt({ ...DEFAULT_STATE, ...data });
    setGen((g) => g + 1);
    setView("calc");
  }, []);

  return (
    <div className="wrap">
      <header className="top">
        <div className="logo">A</div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1>Anno 1800 Production Planner</h1>
          <div className="sub">
            Set your target output — get exact building counts, shared-resource savings &
            whole-building layouts.
          </div>
        </div>
        <span className="badge" id="verBadge">
          {VERSION}
        </span>{" "}
        <ShareButton />
        <AuthChip />
      </header>
      <nav className="appnav" id="appnav">
        {(
          [
            ["calc", "🧮 Calculator"],
            ["playbook", "📖 Playbook"],
            ["session", "⏱️ Session"],
          ] as [View, string][]
        ).map(([v, label]) => (
          <button
            key={v}
            className={`chip ${view === v ? "on" : ""}`}
            onClick={() => {
              setView(v);
              window.scrollTo(0, 0);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="grid" id="view-calc" style={{ display: view === "calc" ? undefined : "none" }}>
        <LeftPanel st={st} patch={patch} gen={gen} bumpGen={bumpGen} loadState={loadState} />
        <Results st={st} patch={patch} />
      </div>
      <div style={{ display: view === "playbook" ? "block" : "none" }}>
        <PlaybookView />
      </div>
      <div style={{ display: view === "session" ? "block" : "none" }}>
        <SessionView />
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
