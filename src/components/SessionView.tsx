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

function Prose({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

export function SessionView() {
  const { data, sync, setFocus, setShutdown, resetShutdown, addParking, removeParking } =
    useCompanion();
  const [draft, setDraft] = useState("");
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
