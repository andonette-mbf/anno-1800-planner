"use client";
import React, { useState } from "react";
import {
  SESSION_HOW_IT_WORKS,
  SESSION_LEAD,
  SESSION_THE_POINT,
  SESSION_TYPES,
} from "@/content/companion";
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
  "Delivery quest: ",
  "Escort quest: ",
  "Salvage flotsam: ",
  "Photographic excursion: ",
  "Find the person: ",
  "Buried treasure: ",
  "Expedition: Zoological",
  "Expedition: Botanical",
  "Expedition: Archaeological",
  "Expedition: Rescue",
];

const WIKI_SEARCH = "https://anno1800.fandom.com/wiki/Special:Search?query=";

function wikiUrl(t: string) {
  const q = t.replace(/https?:\/\/\S+/g, "").trim() || t;
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
    clearDoneQuests,
  } = useCompanion();
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
            <label htmlFor="focusPhase">Phase (1–6, see playbook)</label>
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
            Accepted quests, expeditions and self-set goals. Tick them off as they finish so
            nothing quietly expires between sessions.
          </p>
          <div className="plrow">
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
                  <input
                    type="checkbox"
                    checked={q.done}
                    onChange={(e) => toggleQuest(i, e.target.checked)}
                  />
                  <span style={{ flex: 1 }}>{linkify(q.t)}</span>
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
      <Prose html={SESSION_HOW_IT_WORKS} />
      <Prose html={SESSION_TYPES} />
      <div className="card">
        <div className="hd">
          <h2>✅ Shutdown Check</h2>
          <button className="linkbtn" onClick={resetShutdown}>
            ↺ Reset checklist
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
