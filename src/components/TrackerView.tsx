"use client";
import React, { useEffect, useState } from "react";
import { GOODS, POP, REGIONS, TIER_ORDER, fmt } from "@/lib/data";
import {
  GOODS_117,
  POP_117,
  TIER_ORDER_117,
  houseCapacity117,
  popSources117,
  type PopSource117,
} from "@/lib/data117";
import { CalcState, DEFAULT_STATE } from "@/lib/engine";
import { GAME_CONTENT, type Game } from "@/lib/games";
import { buildingOptionsFor, elecCapable, islandLedger, siloCapable } from "@/lib/ledger";
import { planCheck, planSeed } from "@/lib/plancheck";
import { useAuth, useCompanion, type QuestItem } from "@/lib/store";

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

// Growth goals, generated from the calculator's own POP data: each resident
// tier's need-unlock thresholds are the real "you can grow when…" milestones
// ("Bread unlocks at 150 Workers"). fh = residents per fully-upgraded house,
// so a target converts to a residence count.
interface GrowthTier {
  tid: string;
  lbl: string;
  region: number;
  /** Residents per fully-supplied house. 1800 reads it straight off the tier;
   *  117 has no such constant and derives it from the needs (see below). */
  fh: number;
  /** Residents per house on basic needs alone — 117 only, where it is well
   *  below `fh`. Undefined for 1800, whose houses have a fixed capacity. */
  fhBasic?: number;
  marks: [number, string[]][]; // 1800: threshold → goods it unlocks
  /** 117: what this tier can be supplied and what each is worth in residents.
   *  Listed under the first tier that asks for it, so a need appears once. */
  gains?: PopSource117[];
  /** 117: needs of this tier worth no residents at all — worth naming, since
   *  supplying them grows nothing. */
  noGain?: string[];
}

const GROWTH_TIERS_1800: GrowthTier[] = Object.keys(POP)
  .sort((a, b) => POP[a].r - POP[b].r || (TIER_ORDER[a] ?? 99) - (TIER_ORDER[b] ?? 99))
  .map((tid) => {
    const t = POP[tid];
    const marks = new Map<number, string[]>();
    for (const gid in t.n) {
      const [, , unlockTier, threshold] = t.n[gid];
      if (unlockTier !== tid || !threshold) continue;
      marks.set(threshold, [...(marks.get(threshold) || []), GOODS[gid]?.name || gid]);
    }
    return {
      tid,
      lbl: t.lbl,
      region: t.r,
      fh: t.fh,
      marks: [...marks.entries()].sort((a, b) => a[0] - b[0]),
    };
  });

function houses(residents: number, fh: number) {
  return Math.ceil(residents / fh);
}

// 117's goals are a different shape, because 117 grows differently. There are
// no unlock thresholds to hit — needs are banded, not gated on a headcount —
// and no residents-per-house constant, because a residence has no fixed
// capacity: it holds the SUM of the residents its supplied needs grant
// (`pop`, pack 2). So a 117 goal is "supply this and every house of the tier
// gains N residents", which is the actual growth lever, and it also exposes
// the needs worth nothing (39 of 81) that look like progress but aren't.
//
// Each need is listed under the FIRST tier of its province that asks for it,
// so Bread is a Plebeian goal rather than repeating under every tier above.
const GROWTH_TIERS_117: GrowthTier[] = (() => {
  const order = Object.keys(POP_117).sort(
    (a, b) =>
      POP_117[a].region - POP_117[b].region ||
      (TIER_ORDER_117[a] ?? 99) - (TIER_ORDER_117[b] ?? 99)
  );
  // Region-major, so walking in order lets each province claim its own needs.
  const claimed: Record<number, Set<string>> = {};
  return order.map((tid) => {
    const t = POP_117[tid];
    const seen = (claimed[t.region] ||= new Set());
    const all = popSources117(tid);
    const fresh = all.filter((s) => !seen.has(s.id));
    all.forEach((s) => seen.add(s.id));
    return {
      tid,
      lbl: t.lbl,
      region: t.region,
      // Wonders are excluded: one Colosseum serves an island, not each
      // settlement, so it would overstate what a house holds.
      fh: houseCapacity117(tid),
      fhBasic: houseCapacity117(tid, 0),
      marks: [],
      gains: fresh.filter((s) => s.pop > 0),
      noGain: fresh.filter((s) => s.pop === 0).map((s) => s.lbl),
    };
  });
})();

/** "Serve Bread" / "Build a Market" / "Build the Colosseum" — a 117 goal is an
 *  instruction, and goods are supplied where buildings are put up. */
function growthVerb(s: PopSource117): string {
  if (s.kind === "good") return "Serve";
  if (s.kind === "wonder") return "Build the";
  return /^[aeiou]/i.test(s.lbl) ? "Build an" : "Build a"; // an Alder Council
}

const GROWTH_TIERS_BY_GAME: Record<Game, GrowthTier[]> = {
  anno1800: GROWTH_TIERS_1800,
  anno117: GROWTH_TIERS_117,
};

// Every good display name, for the route-task datalist — shipping moves
// goods, not buildings. Regions merged: Rum is Rum.
const GOOD_NAMES_BY_GAME: Record<Game, string[]> = {
  anno1800: [...new Set(Object.values(GOODS).map((g) => g.name))].sort(),
  anno117: [...new Set(Object.values(GOODS_117).map((g) => g.name))].sort(),
};

function wikiUrl(t: string, game: Game) {
  const q =
    t
      .replace(/https?:\/\/\S+/g, "")
      .replace(/\([^)]*\)/g, "")
      .trim() || t;
  return GAME_CONTENT[game].wikiSearch + encodeURIComponent(q);
}

// Island tag = an "Island: …" prefix on the quest text (the 🏝 dropdown
// writes these). Only prefixes matching one of the player's islands count —
// "Expedition: Zoological" isn't a tag.
function questIsland(t: string, islands: string[]): string | null {
  const m = /^([^:]+):/.exec(t);
  if (!m) return null;
  const p = m[1].trim().toLowerCase();
  return islands.find((n) => n.toLowerCase() === p) || null;
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

// A per-line bolt-on counter (silo module, electricity): how many of the
// line's n buildings have it. One building = a tap toggle, several = −/＋ over
// the count, because a line is often part-fitted (3 of 5 farms silo'd).
function ModChip({
  n,
  count,
  unit,
  one,
  many,
  title,
  onSet,
}: {
  n: number;
  count: number;
  unit: string; // singular, for the −/＋ aria labels
  one: string; // chip text when the line is a single building
  many: string; // label in front of the count
  title: string;
  onSet: (c: number) => void;
}) {
  const c = Math.min(Math.max(0, count), n);
  if (n === 1)
    return (
      <button
        className={"chip schip" + (c > 0 ? " on" : "")}
        title={title}
        onClick={() => onSet(c ? 0 : 1)}
      >
        {one}
      </button>
    );
  return (
    <span className={"chip schip" + (c > 0 ? " on" : "")} title={title}>
      <button aria-label={`One ${unit} fewer`} disabled={c <= 0} onClick={() => onSet(c - 1)}>
        −
      </button>
      {many} {c}/{n}
      <button aria-label={`One ${unit} more`} disabled={c >= n} onClick={() => onSet(c + 1)}>
        ＋
      </button>
    </span>
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
    game,
    sync,
    addQuest,
    toggleQuest,
    setQuestWaiting,
    setQuestWaitNote,
    removeQuest,
    swapQuests,
    moveQuestAfter,
    clearDoneQuests,
    addIsland,
    removeIsland,
    addIslandCheck,
    toggleIslandCheck,
    removeIslandCheck,
    bumpIslandCheck,
    setIslandSilo,
    setIslandElec,
    seedIslandChecks,
    setIslandPlan,
    setIslandRegion,
  } = useCompanion();
  const { status } = useAuth();
  // Per-game content: region tags, starter kits, inventory chips, wiki base.
  const {
    starters: ISLAND_STARTERS,
    suggestions: ISLAND_SUGGESTIONS,
    regionNum: REGION_NUM,
    regionLabels: REGION_LABELS,
  } = GAME_CONTENT[game];
  const GROWTH_TIERS = GROWTH_TIERS_BY_GAME[game];
  const GOOD_NAMES = GOOD_NAMES_BY_GAME[game];
  const islands = data.islands || [];
  const [isleDraft, setIsleDraft] = useState("");
  const [isleRegion, setIsleRegion] = useState(ISLAND_STARTERS[0].key);
  // Switching game switches the region vocabulary — "ow" is meaningless in
  // Rome, so fall back to that game's first starter.
  useEffect(() => {
    setIsleRegion(GAME_CONTENT[game].starters[0].key);
  }, [game]);
  const addIslandSeeded = () => {
    if (!isleDraft.trim()) return;
    addIsland(
      isleDraft,
      ISLAND_STARTERS.find((r) => r.key === isleRegion)?.items,
      isleRegion === "none" ? undefined : isleRegion
    );
    setIsleDraft("");
  };
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
        if (!r.ok) return;
        const rows: SavedPlanRow[] = (await r.json()).plans || [];
        // Plans share one table across both games. Only this game's can be
        // linked to this game's islands — pre-M10 rows have no marker and are
        // 1800's. (M10 phase 3)
        setSavedPlans(rows.filter((p) => (p.data?.game ?? "anno1800") === game));
      } catch {}
    })();
  }, [status, game]);
  const quests = data.quests || [];
  // Done quests hide behind a "N completed" toggle instead of cluttering the
  // list; rows keep their index in the raw array so actions line up.
  const indexed = quests.map((q, i) => ({ q, i }));
  // Three blocks, in the order you meet them: what you can do now, what's
  // blocked (build 61 — ⏳, waiting on bricks and the like), what's finished.
  const openQuests = indexed.filter((x) => !x.q.done && !x.q.w);
  const waitQuests = indexed.filter((x) => !x.q.done && x.q.w);
  const doneQuests = indexed.filter((x) => x.q.done);
  const [showDone, setShowDone] = useState(false);
  const [showWait, setShowWait] = useState(true);
  // M5 — filter the quest list by island tag. Chips appear for islands with
  // at least one tagged quest; the count on a chip is its actionable quests,
  // with waiting ones counted separately — the point of the number is "how
  // much can I get on with here".
  const [isleFilter, setIsleFilter] = useState<string | null>(null);
  const openCounts = new Map<string, number>();
  const waitCounts = new Map<string, number>();
  const anyTagged = new Set<string>();
  for (const { q } of indexed) {
    const isle = questIsland(q.t, islands);
    if (!isle) continue;
    anyTagged.add(isle);
    if (q.done) continue;
    const m = q.w ? waitCounts : openCounts;
    m.set(isle, (m.get(isle) || 0) + 1);
  }
  const filterIslands = islands.filter((n) => anyTagged.has(n));
  const effFilter = isleFilter && anyTagged.has(isleFilter) ? isleFilter : null;
  const onIsland = <T extends { q: QuestItem }>(rows: T[]) =>
    effFilter ? rows.filter((x) => questIsland(x.q.t, islands) === effFilter) : rows;
  const visOpen = onIsland(openQuests);
  const visWait = onIsland(waitQuests);
  const visDone = onIsland(doneQuests);
  // 📈 goals pertain to the regions you actually play: the filtered island's
  // region when one is set, else the union of your islands' 🌍 tags. No tags
  // anywhere → the full list.
  const growthTiers = (() => {
    const regs = new Set<number>();
    const fr = effFilter ? REGION_NUM[(data.islandRegions || {})[effFilter]] : undefined;
    if (fr) regs.add(fr);
    else
      for (const isle of islands) {
        const r = REGION_NUM[(data.islandRegions || {})[isle]];
        if (r) regs.add(r);
      }
    return regs.size ? GROWTH_TIERS.filter((t) => regs.has(t.region)) : GROWTH_TIERS;
  })();
  const growthRegions = new Set(growthTiers.map((t) => t.region));
  // Both games number their regions from 1, so a region number alone is
  // ambiguous — 1 is the Old World in 1800 and Latium in 117. 1800 keeps
  // data.ts's own wording ("The Arctic"); 117 reads the game content.
  const REGION_LABEL = (n: number) => {
    if (game === "anno1800") return REGIONS[n];
    const key = Object.keys(REGION_NUM).find((k) => REGION_NUM[k] === n);
    return (key && REGION_LABELS[key]) || String(n);
  };
  // Custom growth goal: an inline row (number + island), no window.prompt.
  // Opens when "Add a custom number of X…" is picked; island defaults to the
  // filtered island (or your only island).
  const [growthTid, setGrowthTid] = useState<string | null>(null);
  const [growthN, setGrowthN] = useState("");
  const [growthIsle, setGrowthIsle] = useState("");
  const addGrowth = () => {
    const t = GROWTH_TIERS.find((x) => x.tid === growthTid);
    const n = Math.floor(Number(growthN));
    if (!t || !(n > 0)) return;
    addQuest(
      `${growthIsle ? `${growthIsle}: ` : ""}Add ${n} ${t.lbl}`,
      // In 117 the house count depends on how well you feed them, so quote
      // both ends rather than a single figure that is only true at one band.
      t.fhBasic && t.fhBasic !== t.fh
        ? `≈${houses(n, t.fh)} residences fully supplied (${t.fh} per house), or ${houses(
            n,
            t.fhBasic
          )} on basic needs alone (${t.fhBasic} per house).`
        : `≈${houses(n, t.fh)} residences at ${t.fh} per house.`
    );
    setGrowthTid(null);
    setGrowthN("");
  };
  // Route task builder ("from, to, what"), collapsed until asked for.
  const [routeOpen, setRouteOpen] = useState(false);
  const [routeFrom, setRouteFrom] = useState("");
  const [routeTo, setRouteTo] = useState("");
  const [routeWhat, setRouteWhat] = useState("");
  const canAddRoute = !!(routeWhat.trim() && routeFrom && routeTo && routeFrom !== routeTo);
  const addRoute = () => {
    if (!canAddRoute) return;
    // Tagged with the destination, so the island filter catches it.
    addQuest(
      `${routeTo}: ship ${routeWhat.trim()} from ${routeFrom}`,
      "Route task — set up the trade route in game, tick when it's shipping."
    );
    setRouteWhat(""); // keep from/to: often several goods ride the same route
  };
  // Landmark quick-add chips, collapsed per island until asked for.
  const [chipsOpen, setChipsOpen] = useState<Record<string, boolean>>({});
  const savedLabel =
    sync === "synced" ? "synced" : sync === "syncing" ? "syncing…" : "saves automatically";

  return (
    <div className="docwrap">
      <div className="card">
        <div className="hd">
          <h2>📜 Quest Tracker</h2>
          <span className="muted">{savedLabel}</span>
        </div>
        <div className="bd doc">
          <p className="lead">
            Pick a storyline, a growth goal (📈 —{" "}
            {game === "anno117"
              ? "what each need is worth in residents per house"
              : "real unlock thresholds, with the residence count"}
            ), a route task (🚢 from → to → what) or type your own — top of the list = do next.
            ⤓ sends one to the bottom, ⏳ parks one you can&apos;t do yet (say what you&apos;re
            waiting on; ⤒ brings it back to the top); ticked quests tuck away below.
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
              aria-label="Add a population growth goal"
              title={
                game === "anno117"
                  ? "A 117 residence has no fixed size — it holds the sum of what its supplied needs are worth, so each goal is a need and the residents it adds to every house of that tier. Needs worth nothing are named, not offered. 'Custom…' asks for any number. Scoped to your islands' 🌍 regions (or the filtered island's)."
                  : "Growth milestones from the game's own need tables — each is the point a new need unlocks. 'Custom…' asks for any number. Scoped to your islands' 🌍 regions (or the filtered island's)."
              }
              value=""
              onChange={(e) => {
                const [tid, mark, srcId] = e.target.value.split(":");
                const t = GROWTH_TIERS.find((x) => x.tid === tid);
                if (!t) return;
                // The island that grows: the filtered one, else an island in
                // this tier's region (Workers → your Old World island), else
                // the first island — a goal should always name its island.
                const inRegion = islands.filter(
                  (n) => REGION_NUM[(data.islandRegions || {})[n]] === t.region
                );
                if (mark === "custom") {
                  setGrowthTid(t.tid);
                  setGrowthN("");
                  setGrowthIsle(effFilter || inRegion[0] || islands[0] || "");
                  return;
                }
                const isle = effFilter || (inRegion.length === 1 ? inRegion[0] : "");
                // 117: a need-value goal — supply this, every house of the
                // tier gains residents. No thresholds exist in 117 to hit.
                if (mark === "g") {
                  const s = t.gains?.find((x) => x.id === srcId);
                  if (!s) return;
                  const gain = `${s.pop} resident${s.pop > 1 ? "s" : ""}`;
                  const holds =
                    s.kind === "wonder"
                      ? `Counts on top of the ${t.fh} a fully-supplied ${t.lbl} house holds — a Wonder is one per island, so it lifts every settlement on it.`
                      : `A fully-supplied ${t.lbl} house holds ${t.fh}${
                          t.fhBasic && t.fhBasic !== t.fh
                            ? ` (basic needs alone: ${t.fhBasic})`
                            : ""
                        }.`;
                  addQuest(
                    `${isle ? `${isle}: ` : ""}${growthVerb(s)} ${s.lbl} ${
                      s.kind === "good" ? "to" : "for"
                    } your ${t.lbl} — +${gain} per house`,
                    `+${gain} in every ${t.lbl} house. ${holds} ${
                      s.kind === "good"
                        ? "Size the chain in the calculator's population mode."
                        : "A building, not a chain — nothing to produce for it."
                    }`
                  );
                  return;
                }
                const target = Number(mark);
                const goods = t.marks.find(([v]) => v === target)?.[1] || [];
                addQuest(
                  `${isle ? `${isle}: ` : ""}Grow to ${target} ${t.lbl} — unlocks ${goods.join(" + ")}`,
                  `${houses(target, t.fh)} residences at ${t.fh} per house. New ${
                    goods.length > 1 ? "needs" : "need"
                  }: ${goods.join(", ")} — size the farms in the calculator's population mode.`
                );
              }}
            >
              <option value="">📈 Add a population growth goal…</option>
              {growthTiers.map((t) => (
                <optgroup
                  key={t.tid}
                  label={
                    (growthRegions.size > 1 ? `${t.lbl} · ${REGION_LABEL(t.region)}` : t.lbl) +
                    // 117 houses have no fixed size, so say what this tier's
                    // holds when fed — it is the number the goals build toward.
                    (t.gains ? ` · up to ${t.fh} per house` : "")
                  }
                >
                  {t.marks.map(([target, goods]) => (
                    <option key={target} value={`${t.tid}:${target}`}>
                      Grow to {target} {t.lbl} → {goods.join(" + ")}
                    </option>
                  ))}
                  {(t.gains || []).map((s) => (
                    <option key={s.id} value={`${t.tid}:g:${s.id}`}>
                      {`${growthVerb(s)} ${s.lbl} → +${s.pop} per house${
                        s.kind === "wonder" ? " (Wonder)" : ""
                      }`}
                    </option>
                  ))}
                  {/* Named, not offered: supplying these grows nothing, which
                      is the trap worth flagging where the choice is made. */}
                  {!!t.noGain?.length && (
                    <option disabled value="">
                      {"— no residents: " +
                        t.noGain.slice(0, 4).join(", ") +
                        (t.noGain.length > 4 ? ` +${t.noGain.length - 4} more` : "")}
                    </option>
                  )}
                  <option value={`${t.tid}:custom`}>Add a custom number of {t.lbl}…</option>
                </optgroup>
              ))}
            </select>
          </div>
          {growthTid &&
            (() => {
              const t = GROWTH_TIERS.find((x) => x.tid === growthTid);
              if (!t) return null;
              return (
                <div className="plrow">
                  <input
                    type="number"
                    min={1}
                    autoFocus
                    style={{ width: 96, flex: "0 0 auto" }}
                    placeholder="how many"
                    aria-label={`How many ${t.lbl} to add`}
                    value={growthN}
                    onChange={(e) => setGrowthN(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addGrowth();
                    }}
                  />
                  <span className="muted" style={{ alignSelf: "center", flex: "0 0 auto" }}>
                    {t.lbl} on
                  </span>
                  <select
                    className="qisle"
                    aria-label="Which island grows"
                    value={growthIsle}
                    onChange={(e) => setGrowthIsle(e.target.value)}
                  >
                    <option value="">(no island)</option>
                    {islands.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <button className="linkbtn" disabled={!(Math.floor(Number(growthN)) > 0)} onClick={addGrowth}>
                    ＋ Add
                  </button>
                  <button className="plx" title="Cancel" onClick={() => setGrowthTid(null)}>
                    ✕
                  </button>
                </div>
              );
            })()}
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
                    // Same ask-where-it-is + base-task-list as the inventory
                    // add row, prompt-sized.
                    const r = (
                      window.prompt(
                        "Where is it?\n1 Old World / Cape Trelawney · 2 New World · 3 Arctic · 4 Enbesa\nEnter = blank island",
                        ""
                      ) || ""
                    ).trim();
                    const key = { "1": "ow", "2": "nw", "3": "ar", "4": "en" }[r];
                    addIsland(
                      name,
                      key ? ISLAND_STARTERS.find((s) => s.key === key)?.items : undefined,
                      key
                    );
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
          {islands.length >= 2 && (
            <div className="plrow">
              {!routeOpen ? (
                <button
                  className="linkbtn"
                  title="Task to set up a trade route — from island, to island, what good"
                  onClick={() => setRouteOpen(true)}
                >
                  🚢 New route task…
                </button>
              ) : (
                <>
                  <select
                    className="qisle"
                    aria-label="From island"
                    value={routeFrom}
                    onChange={(e) => setRouteFrom(e.target.value)}
                  >
                    <option value="">From…</option>
                    {islands.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <select
                    className="qisle"
                    aria-label="To island"
                    value={routeTo}
                    onChange={(e) => setRouteTo(e.target.value)}
                  >
                    <option value="">→ To…</option>
                    {islands.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="What… e.g. Rum (Enter to add)"
                    list="goodSuggest"
                    value={routeWhat}
                    onChange={(e) => setRouteWhat(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addRoute();
                    }}
                  />
                  <datalist id="goodSuggest">
                    {GOOD_NAMES.map((g) => (
                      <option key={g} value={g} />
                    ))}
                  </datalist>
                  <button
                    className="linkbtn"
                    disabled={!canAddRoute}
                    title={
                      canAddRoute
                        ? "Add the route task"
                        : "Pick two different islands and a good"
                    }
                    onClick={addRoute}
                  >
                    ＋ Add
                  </button>
                  <button className="plx" title="Close" onClick={() => setRouteOpen(false)}>
                    ✕
                  </button>
                </>
              )}
            </div>
          )}
          {filterIslands.length > 0 && (
            <div className="chips qfilter">
              <button
                className={"chip" + (!effFilter ? " on" : "")}
                title="Show every quest"
                onClick={() => setIsleFilter(null)}
              >
                All
              </button>
              {filterIslands.map((n) => (
                <button
                  key={n}
                  className={"chip" + (effFilter === n ? " on" : "")}
                  title={`Only ${n}'s quests`}
                  onClick={() => setIsleFilter(isleFilter === n ? null : n)}
                >
                  🏝 {n}
                  {(openCounts.get(n) || 0) > 0 && <> · {openCounts.get(n)}</>}
                  {(waitCounts.get(n) || 0) > 0 && <> ⏳{waitCounts.get(n)}</>}
                </button>
              ))}
            </div>
          )}
          <div id="questList">
            {visOpen.length ? (
              visOpen.map(({ q, i }, k) => (
                <div className="plitem questrow" key={`${i}:${q.t}`}>
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
                    disabled={k === 0}
                    onClick={() => swapQuests(i, visOpen[k - 1].i)}
                  >
                    ▲
                  </button>
                  <button
                    className="plx qmove"
                    title="Move down — do later"
                    disabled={k === visOpen.length - 1}
                    onClick={() => swapQuests(i, visOpen[k + 1].i)}
                  >
                    ▼
                  </button>
                  <button
                    className="plx qmove"
                    title="Send to the bottom — do last"
                    disabled={k === visOpen.length - 1}
                    onClick={() => moveQuestAfter(i, visOpen[visOpen.length - 1].i)}
                  >
                    ⤓
                  </button>
                  <button
                    className="plx qmove qwait"
                    title="Can't do it yet — park it under Waiting"
                    onClick={() => setQuestWaiting(i, true)}
                  >
                    ⏳
                  </button>
                  <a
                    className="plx"
                    href={wikiUrl(q.t, game)}
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
              <div className="empty">
                {visWait.length
                  ? `Nothing you can do yet — ${visWait.length} waiting below.`
                  : effFilter
                    ? `Nothing open for ${effFilter}.`
                    : visDone.length
                      ? "All caught up — nothing open."
                      : "No quests tracked — add one above."}
              </div>
            )}
            {visWait.length > 0 && (
              <div className="waitblk">
                <button className="linkbtn" onClick={() => setShowWait((v) => !v)}>
                  {showWait ? "▾" : "▸"} ⏳ {visWait.length} waiting
                </button>
                {showWait &&
                  visWait.map(({ q, i }) => (
                    <div className="plitem questrow waiting" key={`${i}:${q.t}`}>
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
                      <input
                        className="wnote"
                        placeholder="waiting on…"
                        title="What has to happen first — bricks, a ship, an unlock"
                        defaultValue={q.wn || ""}
                        onBlur={(e) => setQuestWaitNote(i, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                      />
                      <button
                        className="plx qmove qwait"
                        title="Unblocked — back to the top of the list"
                        onClick={() => setQuestWaiting(i, false)}
                      >
                        ⤒
                      </button>
                      <button className="plx" title="Remove quest" onClick={() => removeQuest(i)}>
                        ✕
                      </button>
                    </div>
                  ))}
              </div>
            )}
            {visDone.length > 0 && (
              <div className="doneblk">
                <button className="linkbtn" onClick={() => setShowDone((v) => !v)}>
                  {showDone ? "▾" : "▸"} {visDone.length} completed
                </button>
                {showDone && !effFilter && (
                  <button className="linkbtn" onClick={clearDoneQuests}>
                    ✕ Clear all
                  </button>
                )}
                {showDone &&
                  visDone.map(({ q, i }) => (
                    <div className="plitem questrow done" key={`${i}:${q.t}`}>
                      <label className="qmain" title="Untick to reopen">
                        <input
                          type="checkbox"
                          checked={q.done}
                          onChange={(e) => toggleQuest(i, e.target.checked)}
                        />
                        <span style={{ flex: 1 }}>{linkify(q.t)}</span>
                      </label>
                      <button className="plx" title="Remove quest" onClick={() => removeQuest(i)}>
                        ✕
                      </button>
                    </div>
                  ))}
              </div>
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
            What each island already runs — buildings feed the <b>ledger</b> (makes/uses, red =
            short), 🎯 links a calculator plan for built&nbsp;vs&nbsp;planned. Untick anything
            broken. Hover anything for the details.
          </p>
          <div className="plrow">
            <select
              className="qisle"
              aria-label="Region of the new island"
              title="Where the new island is — it starts with that region's usual settle-up tasks, unticked"
              value={isleRegion}
              onChange={(e) => setIsleRegion(e.target.value)}
            >
              {ISLAND_STARTERS.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
            <input
              placeholder="Add island… (Enter to add)"
              value={isleDraft}
              onChange={(e) => setIsleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  addIslandSeeded();
                }
              }}
            />
            <button className="linkbtn" onClick={addIslandSeeded}>
              ＋ Add
            </button>
          </div>
          {islands.length ? (
            islands.map((name, idx) => {
              const items = (data.islandChecks || {})[name] || [];
              const have = items.filter((c) => c.done).length;
              const region = (data.islandRegions || {})[name] || "";
              const chips = ISLAND_SUGGESTIONS.filter(
                (s) =>
                  (!s.regions || !region || s.regions.includes(region)) &&
                  !items.some((c) => c.t.toLowerCase() === s.t.toLowerCase())
              ).map((s) => s.t);
              const ledger = islandLedger(items, game);
              const plan = (data.islandPlans || {})[name];
              return (
                <div className="isleblk" key={name}>
                  <datalist id={`bldgSuggest${idx}`}>
                    {buildingOptionsFor(REGION_NUM[region], game).map((b) => (
                      <option key={b} value={b} />
                    ))}
                  </datalist>
                  <div className="islehd">
                    <h4>🏝 {name}</h4>
                    <span className="muted">
                      {have}/{items.length}
                    </span>
                    <select
                      className="planlink"
                      aria-label={`Region of ${name}`}
                      title="Which world this island is in — building suggestions only offer that world's buildings. Amend any time; you can still type any name."
                      value={region}
                      onChange={(e) => setIslandRegion(name, e.target.value || null)}
                    >
                      <option value="">🌍 region…</option>
                      {Object.entries(REGION_LABELS).map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </select>
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
                      {siloCapable(c.t, game) &&
                        (() => {
                          const nb = c.n || 1;
                          const sc = Math.min(c.s || 0, nb);
                          return (
                            <ModChip
                              n={nb}
                              count={sc}
                              unit="silo"
                              one="silo"
                              many="silos"
                              title={
                                nb === 1
                                  ? sc > 0
                                    ? "Silo fitted — output doubled, eats feed. Tap to remove."
                                    : "No silo yet — tap when you bolt one on (output ×2, eats feed)."
                                  : `${sc} of the ${nb} farms have a silo — one module max per farm, and a line can be part-silo'd. Silo'd farms make ×2 and eat feed.`
                              }
                              onSet={(v) => setIslandSilo(name, i, v)}
                            />
                          );
                        })()}
                      {/* Electricity is Old World only; an island with no
                          region set still gets the chip (names merge across
                          worlds, so we can't tell which one it is). */}
                      {elecCapable(c.t, game) &&
                        (!region || region === "ow") &&
                        (() => {
                          const nb = c.n || 1;
                          const ec = Math.min(c.e || 0, nb);
                          return (
                            <ModChip
                              n={nb}
                              count={ec}
                              unit="powered building"
                              one="⚡ power"
                              many="⚡"
                              title={
                                nb === 1
                                  ? ec > 0
                                    ? "Powered — output doubled. Tap when it's off the grid again."
                                    : "Not powered — tap once a power plant covers it (output ×2)."
                                  : `${ec} of the ${nb} are inside a power plant's radius — powered ones make ×2. Powered and silo'd together makes ×4.`
                              }
                              onSet={(v) => setIslandElec(name, i, v)}
                            />
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
                      title="Ticked buildings only, at 100% productivity. Silo'd farms make double and use feed; ⚡ powered buildings make double. What residents eat isn't counted; use the calculator for that."
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
                      const seed = planSeed(plan.st, items);
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
                          {seed.length > 0 && (
                            <div className="iseed">
                              <button
                                className="linkbtn"
                                title={`Adds the plan's buildings that ${name} doesn't list yet as unticked items — red gaps to build, like a new island's starter tasks. Nothing already listed is touched: ${seed
                                  .map((s) => `${s.t} ×${s.n}`)
                                  .join(", ")}`}
                                onClick={() => seedIslandChecks(name, seed)}
                              >
                                ⤵ Add the plan&apos;s {seed.length} missing building
                                {seed.length > 1 ? "s" : ""} as gaps
                              </button>
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
                      list={`bldgSuggest${idx}`}
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
                      {chipsOpen[name] ? (
                        <>
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
                          <button
                            className="chip"
                            title="Hide the quick-add chips"
                            onClick={() => setChipsOpen((s) => ({ ...s, [name]: false }))}
                          >
                            ▴ hide
                          </button>
                        </>
                      ) : (
                        <button
                          className="chip"
                          title="Quick-add the usual landmarks & facilities"
                          onClick={() => setChipsOpen((s) => ({ ...s, [name]: true }))}
                        >
                          ＋ Landmarks &amp; facilities…
                        </button>
                      )}
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
