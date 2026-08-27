"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { datasetFor } from "@/lib/dataset";
import { CalcState, defaultStateFor } from "@/lib/engine";
import { GAMES, type Game } from "@/lib/games";
import { decodeHash, encodeHash } from "@/lib/hash";
import { DEFAULT_SAVE_NAME, useAuth, useCompanion } from "@/lib/store";
import { LeftPanel } from "./calc/LeftPanel";
import { Results } from "./calc/Results";
import { QuickAdd } from "./QuickAdd";
import { TrackerView } from "./TrackerView";
import { Dropdown } from "./ui/Dropdown";

// The Tracker's three cards are three tabs of their own (build 84) — one page
// of all three was a long scroll, and you are only ever in one of them.
type View = "calc" | "tasks" | "islands" | "ships";
export type TrackerSection = "tasks" | "islands" | "ships";

const VIEW_KEY = "anno_view";
const VIEWS: [View, string][] = [
  ["calc", "🧮 Calculator"],
  ["tasks", "📜 Tasks"],
  ["islands", "🏝 Islands"],
  ["ships", "🚢 Ships"],
];

// Stored ids from tabs that no longer exist fall through to the default view.
// "session" was the Playbook-era id and "tracker" the one-page Tracker; both
// land on Tasks, which is the card that used to be at the top of it.
function normalizeView(v: string | null): View | null {
  if (v === "session" || v === "tracker") return "tasks";
  return VIEWS.some(([id]) => id === v) ? (v as View) : null;
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
  // An UNTOUCHED default plan writes no hash at all — a fresh visit shouldn't
  // stamp the demo plan into the address bar (build 95), and resetting back to
  // the default cleans an existing hash away.
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      const h = encodeHash(st);
      if (h === encodeHash(initialStates()[game])) {
        if (window.location.hash)
          history.replaceState(null, "", window.location.pathname + window.location.search);
      } else {
        history.replaceState(null, "", "#" + h);
      }
    } catch {}
  }, [st, game]);

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
    <>
      {/* Build 89: one black bar across the top, and the game switch lives in
          it. Which game you're in changes every number on the page, so it
          belongs beside the title rather than in a row of chips below it. */}
      <header className="topbar">
        <div className="topbarin">
          <div className="logo">{rome ? "🏛" : "A"}</div>
          <h1>
            {rome ? "Anno 117" : "Anno 1800"} <span>Production Planner</span>
          </h1>
          {/* Each game keeps its own quests, islands and inventory. */}
          <nav className="gameswitch" id="gamenav" aria-label="Game">
            {GAMES.map((g) => (
              <button
                key={g.id}
                className={game === g.id ? "on" : ""}
                aria-pressed={game === g.id}
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
          <span className="badge" id="verBadge">
            {datasetFor(st).version}
          </span>
          <ShareButton />
          <AuthChip />
        </div>
      </header>
      <div className="wrap">
        <div className="sub lead">
          Set your target output — get exact building counts, shared-resource savings &
          whole-building layouts.
          {rome && " Pick the region you're building in: Rome's recipes differ by province."}
        </div>
        <nav className="appnav" id="appnav">
          {VIEWS.map(([v, label]) => (
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
          {/* Not on the calculator: a save is a playthrough's tasks, islands and
              ships, not a calculator setting. */}
          {view !== "calc" && <SaveMenu />}
        </nav>
        {/* Above the calculator, not inside its grid: you decide what to build
            while looking at the numbers, and the tab that owns the list is two
            clicks away (build 86). Hidden rather than unmounted, like the tracker
            below, so a half-typed name survives a tab change. */}
        <div style={{ display: view === "calc" ? undefined : "none" }}>
          <QuickAdd go={go} />
        </div>
        <div
          className="grid"
          id="view-calc"
          style={{ display: view === "calc" ? undefined : "none" }}
        >
          <LeftPanel st={st} patch={patch} gen={gen} bumpGen={bumpGen} loadState={loadState} />
          <Results st={st} patch={patch} />
        </div>
        {/* Kept mounted rather than swapped, so the boxes you were half way
            through typing in survive a tab change. */}
        <div style={{ display: view === "calc" ? "none" : "block" }}>
          <TrackerView calcState={st} section={view as TrackerSection} />
        </div>
      </div>
    </>
  );
}

// One save per Anno save game (build 67). Saves belong to the game you're on,
// so an 1800 playthrough and a 117 one never appear in the same list. The
// calculator is deliberately outside this: its plans are blueprints you reuse
// across playthroughs, not part of one.
function SaveMenu() {
  const { saves, saveId, setSave, addSave, duplicateSave, renameSave, deleteSave } =
    useCompanion();
  const name = saves.find((s) => s.id === saveId)?.name ?? DEFAULT_SAVE_NAME;
  const ask = (q: string, fallback: string, run: (v: string) => void) => {
    const v = window.prompt(q, fallback);
    if (v !== null && v.trim()) run(v);
  };
  return (
    <Dropdown
      className="savemenu"
      ariaLabel="Which save the Tracker is showing"
      title="One save per Anno save game — each keeps its own quests, islands and inventory. Saves belong to the game above; the calculator is shared."
      placeholder={`📖 ${name}`}
      value={saveId}
      onChange={(v) => {
        if (v === "__new") ask("Name the new save:", `Save ${saves.length + 1}`, addSave);
        else if (v === "__dup") ask("Name the copy:", `${name} copy`, duplicateSave);
        else if (v === "__rename")
          ask("Rename this save:", name, (n) => renameSave(saveId, n));
        else if (v === "__delete") {
          // Deleting your only save isn't refused — it clears the tracker for
          // the next playthrough, which is what "delete" means when there's
          // one of them.
          const last = saves.length < 2;
          if (
            window.confirm(
              `Delete “${name}” — its quests, islands and inventory?` +
                (last ? " You'll be left with an empty tracker." : "") +
                " This can't be undone."
            )
          )
            deleteSave(saveId);
        } else if (v !== saveId) {
          setSave(v);
          window.scrollTo(0, 0);
        }
      }}
      options={[
        {
          group: "Switch to",
          options: saves.map((s) => ({ value: s.id, label: `📖 ${s.name}` })),
        },
        {
          group: name,
          options: [
            { value: "__new", label: "＋ New save…", title: "An empty tracker for a new game" },
            { value: "__dup", label: "⧉ Duplicate…", title: "Copy this save's quests and islands" },
            { value: "__rename", label: "✎ Rename…" },
            {
              value: "__delete",
              label: "✕ Delete…",
              title:
                saves.length > 1
                  ? "Removes it and its contents"
                  : "Clears this save — quests, islands and inventory — ready for a new game",
            },
          ],
        },
      ]}
    />
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
