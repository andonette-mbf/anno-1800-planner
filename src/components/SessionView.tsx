"use client";
import React, { useState } from "react";
import {
  SESSION_HOW_IT_WORKS,
  SESSION_LEAD,
  SESSION_THE_POINT,
  SESSION_TYPES,
} from "@/content/companion";
import { fmt } from "@/lib/data";
import { BUILDING_OPTIONS, islandLedger } from "@/lib/ledger";
import { useCompanion } from "@/lib/store";

const PHASES: [string, string][] = [
  ["1", "1 — Old World feeder island"],
  ["2", "2 — Expedition · survey Crown Falls"],
  ["3", "3 — Crown Falls, lower & middle"],
  ["4", "4 — New World supply island"],
  ["5", "5 — Crown Falls goes tall"],
  ["6", "6 — Outposts: Enbesa, then Arctic"],
];

const SHUTDOWN_ITEMS: [string, string][] = [
  ["Balance positive?", "If not — Finance Audit is next session's job. Note it."],
  ["All needs green", "on the tier you touched? Any red = note it in Current Focus so you don't forget."],
  ["Nothing half-built", "left unpowered/unstaffed silently draining. Either finish it or note it."],
  ["Storage not pinned full", "on anything you're actively producing (means a route or consumer is missing)."],
  ["Update the Current Focus card", "— phase, what you did, what's unfinished, what's next."],
  ["Parking Lot", "— dump every \"I noticed X\" thought below so it's out of your head and off the map."],
];

// Anno 1800 quests are mostly procedurally generated, so a complete built-in
// quest list isn't feasible — these are just high-confidence quest givers and
// quest/expedition types to speed up typing. The wiki link on each row covers
// the long tail.
const QUEST_SUGGESTIONS = [
  "Sir Archibald Blake: ",
  "Madame Kahina: ",
  "Eli Bleakworth: ",
  "Anne Harlow: ",
  "Jean La Fortune: ",
  "Carl Leonard von Malching: ",
  "Princess Qing: ",
  "Hugo Mercier: ",
  "Old Nate: ",
  "Emperor Ketema: ",
  "Queen Margaret: ",
  "Captain Tobias: ",
  "Expedition: Zoological",
  "Expedition: Botanical",
  "Expedition: Archaeological",
  "Expedition: Rescue",
];

// Named story content with context: what it actually is and what you do.
// Only real playable storylines are listed as stories; feature add-ons are
// reframed as concrete setup goals. Facts verified against the Anno 1800
// wiki / Anno Union. The note is stored on the quest and shown under it.
interface StoryEntry {
  t: string;
  note: string;
}

const STORYLINES: [string, StoryEntry[]][] = [
  [
    "Campaign story",
    [
      {
        t: "Campaign 1: A Tale of Two Brothers",
        note: "Settle the Old World, pay off the family debt and start clearing your father's name.",
      },
      {
        t: "Campaign 2: A Sign of Fire",
        note: "The Goode family feud escalates — keep your city growing while the plot unfolds.",
      },
      {
        t: "Campaign 3: Prosperity",
        note: "Industrialise and take the story across the ocean to the New World.",
      },
      {
        t: "Campaign 4: The Torch Passes",
        note: "The campaign finale against Edvard Goode.",
      },
    ],
  ],
  [
    "DLC storylines",
    [
      {
        t: "Sunken Treasures story",
        note: "Cape Trelawney: find the vanished Queen, build Old Nate's diving bell, salvage the battle wrecks.",
      },
      {
        t: "The Passage story",
        note: "Arctic: search for the lost expedition — Old Nate walks you into heaters, gas and your first airship.",
      },
      {
        t: "Land of Lions stories",
        note: "Enbesa: four questlines with Emperor Ketema — irrigation, the research institute and more.",
      },
      {
        t: "Tourist Season quests",
        note: "Old World: culinary story quests tied to hotels and visiting tourists.",
      },
      {
        t: "The Anarchist",
        note: "Dr Hugo Mercier arrives as a rival with a full questline — propaganda, commune, disruption.",
      },
    ],
  ],
  [
    "Add-on milestones (roughly in the order you meet them)",
    [
      {
        t: "Fit silos on animal farms",
        note: "Bright Harvest: silo module for livestock farms, fed with grain, doubles output — usually the first DLC content you meet (Workers-tier pig farms). The calculator's silo toggle models exactly this.",
      },
      {
        t: "Open the Botanical Garden",
        note: "Botanica: garden modules that boost attractiveness, plus the music pavilion.",
      },
      {
        t: "Set up a Docklands harbour",
        note: "Docklands: modular port and export/import contracts with Captain Tobias.",
      },
      {
        t: "Settle Cape Trelawney",
        note: "Sunken Treasures: the giant Crown Falls island — room for the endgame city (phases 2–3).",
      },
      {
        t: "Host tourists",
        note: "Tourist Season: hotels, bus routes and restaurants once attractiveness runs high.",
      },
      {
        t: "Roll out tractors",
        note: "Bright Harvest: tractor barns for crop farms plus fuel stations — needs an oil supply, so this lands in the Engineers era.",
      },
      {
        t: "Build the Palace",
        note: "Seat of Power: palace whose ministries buff whole districts; short intro quest only.",
      },
      {
        t: "Settle Enbesa",
        note: "Land of Lions: new session with irrigation farming and the Research Institute (phase 6).",
      },
      {
        t: "Establish the Arctic outpost",
        note: "The Passage: heaters against the cold, gas mining for airships (phase 6).",
      },
      {
        t: "Take residents high-rise",
        note: "The High Life: Engineer/Investor skyscrapers and shopping arcades.",
      },
      {
        t: "Found a Hacienda",
        note: "Seeds of Change: New World agricultural hub with its own farm/brewery/residence modules.",
      },
      {
        t: "Launch an airship fleet",
        note: "Empire of the Skies: airship platforms, cargo and the mail system.",
      },
      {
        t: "Grow the New World skyline",
        note: "New World Rising: Artista tier, waterfront and high-rise New World cities.",
      },
    ],
  ],
  [
    "Scenarios (standalone missions)",
    [
      {
        t: "Scenario: Eden Burning",
        note: "Restore a ravaged island as Isabel Sarmento — clean up pollution, build the dam. Free with update 13.",
      },
      {
        t: "Scenario: Seasons of Silver",
        note: "Mine silver for La Corona as Vasco Oliveira through harsh seasons. Comes with Seeds of Change.",
      },
      {
        t: "Scenario: A Clash of Couriers",
        note: "Airship mail race. Comes with Empire of the Skies.",
      },
      {
        t: "Scenario: Pride and Peddlers",
        note: "Trade duel as Madame Kahina against von Malching, Hunt and Silva. Comes with New World Rising.",
      },
    ],
  ],
];

// One-tap chips for the island inventory — the usual "does this island have
// it yet?" facilities. A chip disappears once the island has the item.
const ISLAND_SUGGESTIONS = [
  "Silos on animal farms",
  "Electricity",
  "Tractors + fuel",
  "Oil harbour",
  "Docklands harbour",
  "Commuter pier",
  "Fire · police · hospital coverage",
  "Zoo",
  "Museum",
  "Botanical Garden",
  "Palace",
  "Airship platform",
  "Research Institute",
  "Hacienda",
];

const WIKI_SEARCH = "https://anno1800.fandom.com/wiki/Special:Search?query=";

function wikiUrl(t: string) {
  const q =
    t
      .replace(/https?:\/\/\S+/g, "")
      .replace(/\([^)]*\)/g, "")
      .trim() || t;
  return WIKI_SEARCH + encodeURIComponent(q);
}

// Render pasted URLs inside quest text as clickable links.
function linkify(t: string) {
  return t.split(/(https?:\/\/\S+)/g).map((p, i) =>
    /^https?:\/\//.test(p) ? (
      <a key={i} href={p} target="_blank" rel="noreferrer">
        {p.replace(/^https?:\/\//, "")}
      </a>
    ) : (
      p
    )
  );
}

// How many play sessions a quest has been waiting. The game runs in minutes
// and hours, not calendar days — so age is measured in sessions, ticked over
// each time the Shutdown Check is completed.
function questAge(sess: number, sessions: number): { label: string; cls: string } {
  const n = Math.max(0, sessions - sess);
  if (n === 0) return { label: "new", cls: "" };
  const label = n === 1 ? "1 session" : `${n} sessions`;
  return { label, cls: n >= 4 ? " old" : n >= 2 ? " warn" : "" };
}

function Prose({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

export function SessionView() {
  const {
    data,
    sync,
    setFocus,
    setShutdown,
    resetShutdown,
    addParking,
    removeParking,
    addQuest,
    toggleQuest,
    removeQuest,
    moveQuest,
    clearDoneQuests,
    addIsland,
    removeIsland,
    addIslandCheck,
    toggleIslandCheck,
    removeIslandCheck,
    bumpIslandCheck,
  } = useCompanion();
  const islands = data.islands || [];
  const [isleDraft, setIsleDraft] = useState("");
  const [itemDrafts, setItemDrafts] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");
  const [questDraft, setQuestDraft] = useState("");
  const quests = data.quests || [];
  const doneCount = quests.filter((q) => q.done).length;
  const savedLabel =
    sync === "synced" ? "synced" : sync === "syncing" ? "syncing…" : "saves automatically";

  return (
    <div className="docwrap">
      <Prose html={SESSION_LEAD} />
      <div className="card">
        <div className="hd">
          <h2>🎯 Current Focus</h2>
          <span className="muted">update every time you stop — {savedLabel}</span>
        </div>
        <div className="bd doc">
          <p className="lead">It&apos;s how the save remembers itself across gaps.</p>
          <div className="focusgrid">
            <label htmlFor="focusPhase">Phase (1–6)</label>
            <select
              id="focusPhase"
              value={data.focus.phase || ""}
              onChange={(e) => setFocus("phase", e.target.value)}
            >
              <option value="">—</option>
              {PHASES.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
            <label htmlFor="focusWork">This session I&apos;m working on</label>
            <input
              id="focusWork"
              placeholder="one job only…"
              value={data.focus.working_on || ""}
              onChange={(e) => setFocus("working_on", e.target.value)}
            />
            <label htmlFor="focusUnfin">Left mid-build / unfinished</label>
            <input
              id="focusUnfin"
              placeholder="anything half-done on the map"
              value={data.focus.unfinished || ""}
              onChange={(e) => setFocus("unfinished", e.target.value)}
            />
            <label htmlFor="focusNext">Next session, start with</label>
            <input
              id="focusNext"
              placeholder="the first thing to do next time"
              value={data.focus.next || ""}
              onChange={(e) => setFocus("next", e.target.value)}
            />
            <label htmlFor="focusBal">Per-tick balance when I stopped</label>
            <input
              id="focusBal"
              placeholder="so you notice if something drifted while away"
              value={data.focus.balance || ""}
              onChange={(e) => setFocus("balance", e.target.value)}
            />
          </div>
        </div>
      </div>
      <div className="card">
        <div className="hd">
          <h2>📜 Quest Tracker</h2>
          {doneCount ? (
            <button className="linkbtn" onClick={clearDoneQuests}>
              ✓ Clear {doneCount} completed
            </button>
          ) : (
            <span className="muted">{savedLabel}</span>
          )}
        </div>
        <div className="bd doc">
          <p className="lead">
            Story questlines, add-on setup goals and your own tasks — pick from the list (each
            comes with a what-it-is note) or type your own. Top of the list = do next; sort with
            ▲▼. The age pill counts <b>play sessions</b> a quest has waited, not days — a session
            ends when you complete the Shutdown Check below. ↗ looks it up on the wiki.
          </p>
          <div className="plrow">
            <select
              aria-label="Add a story questline or add-on goal"
              value=""
              onChange={(e) => {
                const entry = STORYLINES.flatMap(([, items]) => items).find(
                  (s) => s.t === e.target.value
                );
                if (entry) addQuest(entry.t, entry.note);
              }}
            >
              <option value="">＋ Add a story questline / add-on goal…</option>
              {STORYLINES.map(([group, items]) => (
                <optgroup key={group} label={group}>
                  {items.map((s) => (
                    <option key={s.t} value={s.t} title={s.note}>
                      {s.t}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="plrow">
            <select
              className="qisle"
              aria-label="Tag with one of your islands"
              value=""
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__add") {
                  const name = window.prompt("Island name to add:");
                  if (name?.trim()) {
                    addIsland(name);
                    setQuestDraft((d) => `${name.trim()}: ${d}`);
                  }
                } else if (v === "__del") {
                  const name = window.prompt(
                    "Remove which island?\n" + islands.join(", ")
                  );
                  if (name?.trim()) removeIsland(name);
                } else if (v) {
                  setQuestDraft((d) => `${v}: ${d}`);
                }
              }}
            >
              <option value="">🏝 Island…</option>
              {islands.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
              <option value="__add">＋ Add island…</option>
              {islands.length > 0 && <option value="__del">− Remove island…</option>}
            </select>
            <input
              placeholder="Quest or goal… (type for suggestions, Enter to add)"
              list="questSuggest"
              value={questDraft}
              onChange={(e) => setQuestDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  addQuest(questDraft);
                  setQuestDraft("");
                }
              }}
            />
            <datalist id="questSuggest">
              {QUEST_SUGGESTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <button
              className="linkbtn"
              onClick={() => {
                addQuest(questDraft);
                setQuestDraft("");
              }}
            >
              ＋ Add
            </button>
          </div>
          <div id="questList">
            {quests.length ? (
              quests.map((q, i) => {
                const age = q.done ? null : questAge(q.sess, data.sessions || 0);
                return (
                  <div className={"plitem questrow" + (q.done ? " done" : "")} key={`${i}:${q.t}`}>
                    <label className="qmain" title="Tap to tick off">
                      <input
                        type="checkbox"
                        checked={q.done}
                        onChange={(e) => toggleQuest(i, e.target.checked)}
                      />
                      <span style={{ flex: 1 }}>
                        {linkify(q.t)}
                        {q.note && <small className="qnote">{q.note}</small>}
                      </span>
                    </label>
                    {age && (
                      <span
                        className={"qage" + age.cls}
                        title="Play sessions this has waited — completing the Shutdown Check ends a session"
                      >
                        {age.label}
                      </span>
                    )}
                    <button
                      className="plx qmove"
                      title="Move up — do sooner"
                      disabled={i === 0}
                      onClick={() => moveQuest(i, -1)}
                    >
                      ▲
                    </button>
                    <button
                      className="plx qmove"
                      title="Move down — do later"
                      disabled={i === quests.length - 1}
                      onClick={() => moveQuest(i, 1)}
                    >
                      ▼
                    </button>
                    <a
                      className="plx"
                      href={wikiUrl(q.t)}
                      target="_blank"
                      rel="noreferrer"
                      title="Look up on the Anno 1800 wiki"
                    >
                      ↗
                    </a>
                    <button className="plx" title="Remove quest" onClick={() => removeQuest(i)}>
                      ✕
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="empty">No quests tracked — add one above.</div>
            )}
          </div>
        </div>
      </div>
      <div className="card">
        <div className="hd">
          <h2>🏝 Island Inventory</h2>
          <span className="muted">{savedLabel}</span>
        </div>
        <div className="bd doc">
          <p className="lead">
            What each island already runs, in the game&apos;s own words — type a building name
            (silo variants included, e.g. &quot;Sheep Farm (silo)&quot;), re-add or ＋ for counts
            like ×2, so you can see existing capacity before building more. Buildings the
            calculator knows feed a per-island <b>ledger</b>: what the island makes and what its
            own chains use, in tons per minute — red net means the island doesn&apos;t cover its
            own consumption. Chips below cover landmarks; untick anything broken so gaps stay
            red (and drop out of the ledger).
          </p>
          <datalist id="bldgSuggest">
            {BUILDING_OPTIONS.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
          <div className="plrow">
            <input
              placeholder="Add island… (Enter to add)"
              value={isleDraft}
              onChange={(e) => setIsleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  addIsland(isleDraft);
                  setIsleDraft("");
                }
              }}
            />
            <button
              className="linkbtn"
              onClick={() => {
                addIsland(isleDraft);
                setIsleDraft("");
              }}
            >
              ＋ Add
            </button>
          </div>
          {islands.length ? (
            islands.map((name) => {
              const items = (data.islandChecks || {})[name] || [];
              const have = items.filter((c) => c.done).length;
              const chips = ISLAND_SUGGESTIONS.filter(
                (s) => !items.some((c) => c.t.toLowerCase() === s.toLowerCase())
              );
              const ledger = islandLedger(items);
              return (
                <div className="isleblk" key={name}>
                  <div className="islehd">
                    <h4>🏝 {name}</h4>
                    <span className="muted">
                      {have}/{items.length}
                    </span>
                    <button
                      className="plx"
                      title="Remove island and its checklist"
                      onClick={() => {
                        if (window.confirm(`Remove ${name} and its checklist?`))
                          removeIsland(name);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                  {items.map((c, i) => (
                    <div className={"plitem questrow" + (c.done ? "" : " gap")} key={`${i}:${c.t}`}>
                      <label className="qmain" title="Tap to toggle">
                        <input
                          type="checkbox"
                          checked={c.done}
                          onChange={(e) => toggleIslandCheck(name, i, e.target.checked)}
                        />
                        <span style={{ flex: 1 }}>
                          {c.t}
                          {(c.n || 1) > 1 && <b> ×{c.n}</b>}
                        </span>
                      </label>
                      <button
                        className="plx qmove"
                        title="One fewer"
                        disabled={(c.n || 1) <= 1}
                        onClick={() => bumpIslandCheck(name, i, -1)}
                      >
                        −
                      </button>
                      <button
                        className="plx qmove"
                        title="One more"
                        onClick={() => bumpIslandCheck(name, i, 1)}
                      >
                        ＋
                      </button>
                      <button
                        className="plx"
                        title="Remove item"
                        onClick={() => removeIslandCheck(name, i)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {ledger.length > 0 && (
                    <div
                      className="iledger"
                      title="Ticked buildings only, at 100% productivity — no electricity boost. Silo variants make double and use feed. What residents eat isn't counted; use the calculator for that."
                    >
                      <div className="iledgrow iledghead">
                        <span>Ledger — t/min at base rates</span>
                        <span className="num">makes</span>
                        <span className="num">uses</span>
                        <span className="num">net</span>
                      </div>
                      {ledger.map((r) => (
                        <div className="iledgrow" key={r.name}>
                          <span>{r.name}</span>
                          <span className="num muted">
                            {r.produced > 0 ? `+${fmt(r.produced)}` : ""}
                          </span>
                          <span className="num muted">
                            {r.used > 0 ? `−${fmt(r.used)}` : ""}
                          </span>
                          <span className={"num net" + (r.net < -1e-9 ? " neg" : "")}>
                            {(r.net > 1e-9 ? "+" : r.net < -1e-9 ? "−" : "") +
                              fmt(Math.abs(r.net))}
                          </span>
                        </div>
                      ))}
                      {ledger.some((r) => r.fix) && (
                        <div className="iledgfix">
                          ⚠ Short — build{" "}
                          {ledger
                            .filter((r) => r.fix)
                            .map((r) => `${r.fix!.count}× ${r.fix!.building}`)
                            .join(" · ")}{" "}
                          <span className="muted">(or equivalent)</span>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="plrow">
                    <input
                      placeholder="Add building… e.g. Sheep Farm (silo) — Enter to add"
                      list="bldgSuggest"
                      value={itemDrafts[name] || ""}
                      onChange={(e) => setItemDrafts((s) => ({ ...s, [name]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          addIslandCheck(name, itemDrafts[name] || "");
                          setItemDrafts((s) => ({ ...s, [name]: "" }));
                        }
                      }}
                    />
                  </div>
                  {chips.length > 0 && (
                    <div className="ichips">
                      {chips.map((s) => (
                        <button
                          key={s}
                          className="chip"
                          title={`One tap: ${name} has ${s}`}
                          onClick={() => addIslandCheck(name, s)}
                        >
                          ＋ {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="empty">
              No islands yet — add your first above. The quest tracker&apos;s 🏝 dropdown shares
              this list.
            </div>
          )}
        </div>
      </div>
      <Prose html={SESSION_HOW_IT_WORKS} />
      <Prose html={SESSION_TYPES} />
      <div className="card">
        <div className="hd">
          <h2>✅ Shutdown Check</h2>
          <button className="linkbtn" title="Completing all six ends a session (quest ages tick)" onClick={resetShutdown}>
            ▶ New session — reset checklist
          </button>
        </div>
        <div className="bd doc">
          <p className="lead">
            10 min, every session, no exceptions. This is the habit that lets the save survive gaps
            — skip it and you reopen into confusion.
          </p>
          <div id="sdList">
            {SHUTDOWN_ITEMS.map(([b, rest], i) => (
              <label className="checkrow" key={i}>
                <input
                  type="checkbox"
                  checked={!!data.shutdown[i]}
                  onChange={(e) => setShutdown(i, e.target.checked)}
                />
                <span>
                  <b>{b}</b> {rest}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="card">
        <div className="hd">
          <h2>🅿️ Parking Lot</h2>
          <span className="muted">{savedLabel}</span>
        </div>
        <div className="bd doc">
          <p className="lead">
            Things you noticed but didn&apos;t fix — so they don&apos;t derail the current session.
            Pull from here when picking next session&apos;s job.
          </p>
          <div className="plrow">
            <input
              placeholder="I noticed… (Enter to add)"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  addParking(draft);
                  setDraft("");
                }
              }}
            />
            <button
              className="linkbtn"
              onClick={() => {
                addParking(draft);
                setDraft("");
              }}
            >
              ＋ Add
            </button>
          </div>
          <div id="plList">
            {data.parkinglot.length ? (
              data.parkinglot.map((t, i) => (
                <div className="plitem" key={`${i}:${t}`}>
                  <span style={{ flex: 1 }}>{t}</span>
                  <button className="plx" title="Remove — dealt with" onClick={() => removeParking(i)}>
                    ✕
                  </button>
                </div>
              ))
            ) : (
              <div className="empty">Nothing parked — good.</div>
            )}
          </div>
        </div>
      </div>
      <Prose html={SESSION_THE_POINT} />
    </div>
  );
}
