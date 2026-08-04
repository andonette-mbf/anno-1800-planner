"use client";
import React, { useEffect, useState } from "react";
import { fmt } from "@/lib/data";
import { CalcState, DEFAULT_STATE } from "@/lib/engine";
import { BUILDING_OPTIONS, islandLedger, siloCapable } from "@/lib/ledger";
import { planCheck } from "@/lib/plancheck";
import { useAuth, useCompanion } from "@/lib/store";

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
        note: "Sunken Treasures: the giant Crown Falls island — room for the endgame city.",
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
        note: "Land of Lions: irrigation farming and the Research Institute.",
      },
      {
        t: "Establish the Arctic outpost",
        note: "The Passage: heaters against the cold, gas mining for airships.",
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

interface SavedPlanRow {
  id: string;
  name: string;
  data: CalcState;
}

export function TrackerView({ calcState }: { calcState: CalcState }) {
  const {
    data,
    sync,
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
    setIslandSilo,
    setIslandPlan,
  } = useCompanion();
  const { status } = useAuth();
  const islands = data.islands || [];
  const [isleDraft, setIsleDraft] = useState("");
  const [itemDrafts, setItemDrafts] = useState<Record<string, string>>({});
  const [questDraft, setQuestDraft] = useState("");
  // Saved calculator plans, offered in the 🎯 link dropdown when signed in.
  const [savedPlans, setSavedPlans] = useState<SavedPlanRow[]>([]);
  useEffect(() => {
    if (status !== "authed") {
      setSavedPlans([]);
      return;
    }
    (async () => {
      try {
        const r = await fetch("/api/plans");
        if (r.ok) setSavedPlans((await r.json()).plans || []);
      } catch {}
    })();
  }, [status]);
  const quests = data.quests || [];
  const doneCount = quests.filter((q) => q.done).length;
  const savedLabel =
    sync === "synced" ? "synced" : sync === "syncing" ? "syncing…" : "saves automatically";

  return (
    <div className="docwrap">
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
            ▲▼. ↗ looks it up on the wiki.
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
              quests.map((q, i) => (
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
              ))
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
            What each island already runs, in the game&apos;s own words — type a building name,
            re-add or ＋ for counts like ×2. Animal farms get a <b>silo</b> counter on their row —
            silos are bolt-on modules, so tap as you fit them; a line can be part-silo&apos;d
            (&quot;silos 3/5&quot;). Silo&apos;d farms make ×2 and eat feed.
            Buildings the calculator knows feed a per-island <b>ledger</b>: what the island makes
            and what its own chains use, in tons per minute — red net means the island
            doesn&apos;t cover its own consumption. 🎯 links a calculator plan to the island: the
            plan check shows built vs planned, says what&apos;s still to build, and anything
            beyond the plan is your real overproduction. Chips below cover landmarks; untick
            anything broken so gaps stay red (and drop out of the ledger).
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
              const plan = (data.islandPlans || {})[name];
              return (
                <div className="isleblk" key={name}>
                  <div className="islehd">
                    <h4>🏝 {name}</h4>
                    <span className="muted">
                      {have}/{items.length}
                    </span>
                    {plan ? (
                      <button
                        className="chip schip on"
                        title={`Linked plan “${plan.name}” — built vs planned below. Tap to unlink.`}
                        onClick={() => {
                          if (window.confirm(`Unlink plan “${plan.name}” from ${name}?`))
                            setIslandPlan(name, null);
                        }}
                      >
                        🎯 {plan.name}
                      </button>
                    ) : (
                      <select
                        className="planlink"
                        aria-label={`Link a calculator plan to ${name}`}
                        title="Link a calculator plan — the island block then shows built vs planned"
                        value=""
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "__cur") {
                            const nm = window.prompt(
                              "Name this snapshot of the calculator:",
                              "Calc snapshot"
                            );
                            if (nm !== null)
                              setIslandPlan(name, {
                                name: nm.trim() || "Calc snapshot",
                                st: calcState,
                              });
                          } else if (v) {
                            const p = savedPlans.find((x) => x.id === v);
                            if (p)
                              setIslandPlan(name, {
                                name: p.name,
                                st: { ...DEFAULT_STATE, ...p.data },
                              });
                          }
                        }}
                      >
                        <option value="">🎯 Link plan…</option>
                        <option value="__cur">Current calculator setup</option>
                        {savedPlans.map((p) => (
                          <option key={p.id} value={p.id}>
                            💾 {p.name}
                          </option>
                        ))}
                      </select>
                    )}
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
                      {siloCapable(c.t) &&
                        (() => {
                          const nb = c.n || 1;
                          const sc = Math.min(c.s || 0, nb);
                          if (nb === 1)
                            return (
                              <button
                                className={"chip schip" + (sc > 0 ? " on" : "")}
                                title={
                                  sc > 0
                                    ? "Silo fitted — output doubled, eats feed. Tap to remove."
                                    : "No silo yet — tap when you bolt one on (output ×2, eats feed)."
                                }
                                onClick={() => setIslandSilo(name, i, sc ? 0 : 1)}
                              >
                                silo
                              </button>
                            );
                          return (
                            <span
                              className={"chip schip" + (sc > 0 ? " on" : "")}
                              title={`${sc} of the ${nb} farms have a silo — one module max per farm, and a line can be part-silo'd. Silo'd farms make ×2 and eat feed.`}
                            >
                              <button
                                aria-label="One silo fewer"
                                disabled={sc <= 0}
                                onClick={() => setIslandSilo(name, i, sc - 1)}
                              >
                                −
                              </button>
                              silos {sc}/{nb}
                              <button
                                aria-label="One silo more"
                                disabled={sc >= nb}
                                onClick={() => setIslandSilo(name, i, sc + 1)}
                              >
                                ＋
                              </button>
                            </span>
                          );
                        })()}
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
                      title="Ticked buildings only, at 100% productivity — no electricity boost. Farms with the silo toggle on make double and use feed. What residents eat isn't counted; use the calculator for that."
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
                  {plan &&
                    (() => {
                      const pc = planCheck(plan.st, items);
                      return (
                        <div
                          className="iledger"
                          title="Linked plan vs this island's ticked buildings — whole-building counts for the plan's full chain, at the plan's own settings. The plan is a snapshot from link time; re-link after editing it."
                        >
                          <div className="iledgrow iledghead">
                            <span>Plan check — {plan.name}</span>
                            <span className="num">built</span>
                            <span className="num">planned</span>
                            <span className="num">Δ</span>
                          </div>
                          {pc.rows.map((r) => {
                            const d = r.built - r.planned;
                            return (
                              <div className="iledgrow" key={r.good}>
                                <span>{r.building}</span>
                                <span className="num muted">{r.built}</span>
                                <span className="num muted">{r.planned}</span>
                                <span className={"num net" + (d < 0 ? " neg" : "")}>
                                  {d > 0 ? `+${d}` : d < 0 ? `−${-d}` : "✓"}
                                </span>
                              </div>
                            );
                          })}
                          {pc.short.length > 0 && (
                            <div className="iledgfix">
                              ⚠ To finish the plan — build{" "}
                              {pc.short.map((s) => `${s.count}× ${s.building}`).join(" · ")}
                            </div>
                          )}
                          {pc.extra.length > 0 && (
                            <div className="iplanextra">
                              ⤴ Beyond the plan —{" "}
                              {pc.extra.map((s) => `${s.building} ×${s.count}`).join(" · ")}
                            </div>
                          )}
                          {!pc.short.length && !pc.extra.length && (
                            <div className="iplanok">✓ Built matches the plan.</div>
                          )}
                        </div>
                      );
                    })()}
                  <div className="plrow">
                    <input
                      placeholder="Add building… e.g. Sheep Farm — Enter to add"
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
    </div>
  );
}
