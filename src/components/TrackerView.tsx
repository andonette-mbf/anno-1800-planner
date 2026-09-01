"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { GOODS, POP, TIER_ORDER, fmt } from "@/lib/data";
import {
  POP_117,
  TIER_ORDER_117,
  houseCapacity117,
  popSources117,
  type PopSource117,
} from "@/lib/data117";
import { cultureAt, CULTURE_EMOJI, type CultureAt } from "@/lib/culture";
import { DATASETS, bandLabels } from "@/lib/dataset";
import { CalcState, DEFAULT_STATE } from "@/lib/engine";
import { GAMES, GAME_CONTENT, gameKey, type Game } from "@/lib/games";
import {
  applyTrade,
  buildingOptionsFor,
  powerKind,
  islandLedger,
  itemGood,
  siloCapable,
  suggestTrades,
  userRate,
  type UserRecipe,
} from "@/lib/ledger";
import { planCheck, planSeed } from "@/lib/plancheck";
import CultureBlock from "./CultureBlock";
import FertilityBlock from "./FertilityBlock";
import ItemsBlock from "./ItemsBlock";
import PatronBlock from "./PatronBlock";
import { itemIn, itemTitle, shipSocket } from "@/lib/items";
import { FERT_SOCKET, missingFertilities, regionFertility, shortFertName } from "@/lib/fertility";
import { GoodIcon } from "./GoodIcon";
import { Dropdown } from "./ui/Dropdown";
import {
  blockersOf,
  DEFAULT_POP_CFG,
  useAuth,
  useCompanion,
  type PopCfg,
  type QuestItem,
  type ShipItem,
} from "@/lib/store";

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
export interface GrowthTier {
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

// Display name of the good an inventory item makes, for its picture.
// Non-building items (landmarks, free text) have none, and a handful of goods
// in each game have no picture on the wiki, so GoodIcon renders nothing for
// them. The name alone isn't enough to pick the art — 24 goods are named the
// same in both games — so every caller passes the game too.
function iconGoodName(itemName: string, game: Game): string | null {
  const gid = itemGood(itemName, game);
  if (!gid) return null;
  return DATASETS[game].goods[gid]?.name ?? null;
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


// Partial, deliberately: growth is a per-game model (thresholds vs banded
// house capacity), so a game without one — a Tracker-only game especially —
// simply shows no growth dropdown rather than borrowing another game's.
// Exported for the QuickAdd widget's 👥 kind, which offers the same
// region-scoped tier list the per-island editor does.
export const GROWTH_TIERS_BY_GAME: Partial<Record<Game, GrowthTier[]>> = {
  anno1800: GROWTH_TIERS_1800,
  anno117: GROWTH_TIERS_117,
};

// Every good display name, for the route-task datalist — shipping moves
// goods, not buildings. Regions merged: Rum is Rum.
// Which island blocks are folded up, per game. Presentation only — never
// synced, and an absent key means every island is open, as it always was.
const ISLE_SHUT_KEY = (g: Game) => gameKey(g, "anno_isle_shut");
// Islands whose CHECKLIST is tucked away (build 98) — the block stays open
// with its ledger and summaries, only the item rows fold.
const ISLE_TUCK_KEY = (g: Game) => gameKey(g, "anno_isle_tuck");
// Islands whose LEDGER is folded (build 123) — independent of both folds
// above: the ledger sits outside the island fold, so it needs its own. Folded
// it keeps a one-line count (rows, ⚠ short) — the signal build 99 moved here.
const ISLE_LEDG_KEY = (g: Game) => gameKey(g, "anno_isle_ledger");
/** A handle on an island block, so the collections roll-up can scroll to one.
 *  Islands are identified by name everywhere else too, so this follows a rename
 *  for free. */
const isleDomId = (name: string) => "isle-" + name.replace(/\W+/g, "-").toLowerCase();

const GOOD_NAMES_BY_GAME = Object.fromEntries(
  GAMES.map((g) => [
    g.id,
    [...new Set(Object.values(DATASETS[g.id].goods).map((x) => x.name))].sort(),
  ])
) as Record<Game, string[]>;

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

// Timer lengths for a parked task (build 68). A short hop between Old World
// islands is a minute or two, a New World crossing runs to ten and up, and the
// long end covers a build or an expedition you're waiting out. Whole minutes
// only: this is "roughly when to look again", not a stopwatch.
const TIMER_MINS = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60];

// m:ss, or h:mm:ss once there's an hour on it.
function countdown(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const two = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`;
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

// Teach the ledger a building's numbers (M13) — packless games only. The
// four Annos with no data pack know no buildings, so every inventory line is
// free text the ledger skips; this chip lets the player type in what the
// game's tile shows ("makes 1t of Bread every 30s, eats Flour") and the line
// starts producing. Taught rows live in the save (anno_user_recipes) and are
// the whole index for that game (`teachRecipes`). The chip reads ⏱ when the
// building is unknown and shows the taught t/min once it isn't.
function TeachChip({
  itemName,
  recipe,
  onSave,
  onRemove,
}: {
  itemName: string;
  recipe: UserRecipe | null;
  onSave: (r: UserRecipe) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [good, setGood] = useState("");
  const [time, setTime] = useState("");
  const [amount, setAmount] = useState("");
  const [inputs, setInputs] = useState("");
  const openForm = () => {
    setGood(recipe?.good ?? "");
    setTime(recipe ? String(recipe.time) : "");
    setAmount(recipe?.amount ? String(recipe.amount) : "");
    setInputs(recipe?.inputs?.join(", ") ?? "");
    setOpen(true);
  };
  const ok = good.trim() && Number(time) > 0;
  const save = () => {
    if (!ok) return;
    const r: UserRecipe = { building: itemName, good: good.trim(), time: Number(time) };
    const a = Number(amount);
    if (Number.isFinite(a) && a > 0 && a !== 1) r.amount = a;
    const inp = inputs
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (inp.length) r.inputs = inp;
    onSave(r);
    setOpen(false);
  };
  if (!open)
    return (
      <button
        className={"chip schip" + (recipe ? " on" : "")}
        title={
          recipe
            ? `Taught: makes ${recipe.amount ?? 1}t of ${recipe.good} every ${recipe.time}s` +
              (recipe.inputs?.length ? `, eats ${recipe.inputs.join(", ")}` : "") +
              ". Press to correct or forget."
            : `The app has no numbers for this game — read them off ${itemName}'s tile and teach the ledger what it makes.`
        }
        onClick={openForm}
      >
        {recipe ? `⏱ ${userRate(recipe)} t/min` : "⏱ teach"}
      </button>
    );
  return (
    <span className="chip schip on teachform" title={`What the game shows on ${itemName}'s tile`}>
      makes
      <input
        placeholder="good… e.g. Bread"
        value={good}
        autoFocus
        onChange={(e) => setGood(e.target.value)}
        style={{ width: "8em" }}
      />
      <input
        placeholder="t"
        title="Tons per cycle (blank = 1)"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        inputMode="decimal"
        style={{ width: "2.5em" }}
      />
      t every
      <input
        placeholder="s"
        title="Seconds one production cycle takes"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        inputMode="decimal"
        style={{ width: "3em" }}
      />
      s, eats
      <input
        placeholder="nothing — or Flour, Water…"
        title="Goods eaten, comma-separated — one ton each per ton made"
        value={inputs}
        onChange={(e) => setInputs(e.target.value)}
        style={{ width: "11em" }}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
        }}
      />
      <button disabled={!ok} title="Save these numbers" onClick={save}>
        ✓
      </button>
      {recipe && (
        <button
          title="Forget this building's numbers"
          onClick={() => {
            onRemove();
            setOpen(false);
          }}
        >
          🗑
        </button>
      )}
      <button title="Never mind" onClick={() => setOpen(false)}>
        ✕
      </button>
    </span>
  );
}

// Who lives on this island (M8): a one-line 👥 summary that stays visible —
// it feeds the ledger right below it — and unfolds into per-tier headcount
// inputs. Only the island's own region's tiers are offered (the way growth
// goals scoped themselves in build 52); an untagged island gets them all.
// The consumption knobs (1800's lifestyle + %, 117's band) are edited here
// too but are ONE setting per save, like the calculator's.
function ResidentsBlock({
  island,
  tiers,
  pop,
  cfg,
  game,
  open,
  onToggle,
  setIslandPop,
  setPopCfg,
}: {
  island: string;
  tiers: GrowthTier[];
  pop: Record<string, number>;
  cfg: PopCfg;
  game: Game;
  open: boolean;
  onToggle: () => void;
  setIslandPop: (island: string, tid: string, count: number) => void;
  setPopCfg: (patch: Partial<PopCfg>) => void;
}) {
  const listed = tiers.filter((t) => pop[t.tid] > 0);
  const total = listed.reduce((n, t) => n + pop[t.tid], 0);
  return (
    <div className="ipop">
      <button
        className="ipoptgl"
        aria-expanded={open}
        title={
          open
            ? "Fold the resident counts away"
            : "Who lives here — their needs are counted in the ledger below"
        }
        onClick={onToggle}
      >
        {open ? "▾" : "▸"} 👥{" "}
        {total > 0
          ? `${fmt(total, 0)} — ${listed
              .map((t) => `${t.lbl} ${fmt(pop[t.tid], 0)}`)
              .join(" · ")}`
          : "Residents…"}
      </button>
      {open && (
        <div className="ipopedit">
          {tiers.map((t) => (
            <label className="ipoptier" key={t.tid}>
              {t.lbl}
              <input
                type="number"
                min={0}
                step={10}
                placeholder="0"
                value={pop[t.tid] || ""}
                onChange={(e) =>
                  setIslandPop(
                    island,
                    t.tid,
                    Math.max(0, Math.floor(Number(e.target.value)) || 0)
                  )
                }
              />
            </label>
          ))}
          <span className="ipopcfg">
            {/* The dataset's needs model picks the control (M12): bands get
                the band chips, thresholds the lifestyle toggle. */}
            {DATASETS[game].needsModel === "bands" ? (
              bandLabels(DATASETS[game]).map((label, i) => (
                <button
                  key={label}
                  className={"chip schip" + (cfg.band === i ? " on" : "")}
                  title={
                    (i === 0
                      ? "Count only the goods a fresh residence demands"
                      : `Count everything up to and including ${label}`) +
                    " — one setting for every island, like the calculator's"
                  }
                  onClick={() => setPopCfg({ band: i })}
                >
                  {i === 0 ? label : `+ ${label}`}
                </button>
              ))
            ) : (
              <button
                className={"chip schip" + (cfg.lifestyle ? " on" : "")}
                title="Count lifestyle needs too (optional bonus goods) — one setting for every island, like the calculator's"
                onClick={() => setPopCfg({ lifestyle: !cfg.lifestyle })}
              >
                lifestyle
              </button>
            )}
            <label
              className="ipopcons"
              title="Consumption rate — item buffs lower it. One setting for every island, like the calculator's."
            >
              <input
                type="number"
                min={50}
                max={150}
                step={5}
                value={cfg.cons}
                onChange={(e) =>
                  setPopCfg({ cons: Math.floor(Number(e.target.value)) || 100 })
                }
              />
              %
            </label>
          </span>
        </div>
      )}
    </div>
  );
}

interface SavedPlanRow {
  id: string;
  name: string;
  data: CalcState;
}

export function TrackerView({
  calcState,
  section,
  go,
}: {
  calcState: CalcState;
  /** Which of the four the tab row is showing (build 84; Culture split out of
   *  Islands in build 101). Only the one asked for is drawn. */
  section: "tasks" | "islands" | "culture" | "ships";
  /** Switch tab — the island blocks link across to 🏛 Culture with it. */
  go?: (v: "tasks" | "islands" | "culture" | "ships") => void;
}) {
  const {
    data,
    game,
    sync,
    addQuest,
    toggleQuest,
    setQuestWaiting,
    setQuestWaitNote,
    addQuestBlocker,
    removeQuestBlocker,
    setQuestTimer,
    clearQuestRang,
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
    setIslandPop,
    setPopCfg,
    addIslandLink,
    removeIslandLink,
    setIslandLinkCap,
    saveUserRecipe,
    removeUserRecipe,
    setNotes,
  } = useCompanion();
  // Draft in the 🗒 Notes add box, kept while you flip tabs like other drafts.
  const [noteDraft, setNoteDraft] = useState("");
  const { status } = useAuth();
  // Per-game content: region tags, starter kits, inventory chips, wiki base.
  const {
    starters: ISLAND_STARTERS,
    suggestions: ISLAND_SUGGESTIONS,
    services: ISLAND_SERVICES,
    regionNum: REGION_NUM,
    regionLabels: REGION_LABELS,
  } = GAME_CONTENT[game];
  const REGION_ALIAS = GAME_CONTENT[game].regionAlias || {};
  // What the item box offers as you type: every production building of that
  // region (the ledger's own names, so a pick counts in the ledger) plus the
  // public buildings, which make nothing and so aren't in the ledger at all.
  const itemSuggestions = (region: string) => {
    // Cape Trelawney borrows the Old World's chips: same region, same
    // buildings, its own tag.
    const r = REGION_ALIAS[region] || region;
    const inRegion = (s: { regions?: string[] }) =>
      !s.regions || !r || s.regions.includes(r);
    return [
      ...new Set([
        ...buildingOptionsFor(REGION_NUM[region], game),
        ...[...ISLAND_SUGGESTIONS, ...ISLAND_SERVICES].filter(inRegion).map((s) => s.t),
      ]),
    ].sort();
  };
  const GROWTH_TIERS = GROWTH_TIERS_BY_GAME[game] ?? [];
  const GOOD_NAMES = GOOD_NAMES_BY_GAME[game];
  const islands = data.islands || [];
  const [isleDraft, setIsleDraft] = useState("");
  const [isleRegion, setIsleRegion] = useState(ISLAND_STARTERS[0].key);
  // Switching game switches the region vocabulary — "ow" is meaningless in
  // Rome, so fall back to that game's first starter.
  useEffect(() => {
    setIsleRegion(GAME_CONTENT[game].starters[0].key);
  }, [game]);
  // New islands start blank — the region choice is only the 🌍 tag (typing
  // suggestions, chips, ledger pricing). The inventory is a production ledger,
  // not a settle-up checklist, so nothing is seeded.
  const addIslandTagged = () => {
    if (!isleDraft.trim()) return;
    addIsland(isleDraft, undefined, isleRegion === "none" ? undefined : isleRegion);
    setIsleDraft("");
  };
  const [itemDrafts, setItemDrafts] = useState<Record<string, string>>({});
  // Hide the ledger's dimmed end-product rows. UI-only preference, per
  // browser (own key, not CompanionData — nothing to sync). Read in an
  // effect so the server render matches the first client render.
  const [hideFin, setHideFin] = useState(false);
  // Hide the ledger's balanced rows too (net 0, grey) — build 99. What's left
  // is exactly the surpluses and the shortfalls: what there is to play with.
  const [hideZero, setHideZero] = useState(false);
  // Show each island's items A→Z. Display-only: the stored order (and every
  // index-based action on a row) is untouched — sorting happens at render.
  const [sortAZ, setSortAZ] = useState(false);
  useEffect(() => {
    try {
      setHideFin(localStorage.getItem("anno_hide_finals") === "1");
      setHideZero(localStorage.getItem("anno_hide_zero") === "1");
      setSortAZ(localStorage.getItem("anno_sort_az") === "1");
    } catch {}
  }, []);
  const toggleFin = () =>
    setHideFin((h) => {
      try {
        localStorage.setItem("anno_hide_finals", h ? "0" : "1");
      } catch {}
      return !h;
    });
  const toggleZero = () =>
    setHideZero((h) => {
      try {
        localStorage.setItem("anno_hide_zero", h ? "0" : "1");
      } catch {}
      return !h;
    });
  const toggleSort = () =>
    setSortAZ((s) => {
      try {
        localStorage.setItem("anno_sort_az", s ? "0" : "1");
      } catch {}
      return !s;
    });
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
  // "Clear completed" arms on the first tap and fires on the second, going back
  // to sleep if you walk away from it — the fold is the only record of what
  // you've done, and the button now sits out in the open.
  const [armClear, setArmClear] = useState(false);
  useEffect(() => {
    if (!armClear) return;
    const id = setTimeout(() => setArmClear(false), 4000);
    return () => clearTimeout(id);
  }, [armClear]);
  // Redraw once a second while any countdown is on screen — nothing else in
  // the Tracker changes on its own, so the interval only exists when a task is
  // actually on the clock. (The freeing itself is the store's job.)
  const anyTimer = quests.some((q) => !q.done && q.w && q.wt);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!anyTimer) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [anyTimer]);
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
  // Switching islands changes what "clear" would take with it, so it disarms.
  useEffect(() => setArmClear(false), [effFilter]);
  const onIsland = <T extends { q: QuestItem }>(rows: T[]) =>
    effFilter ? rows.filter((x) => questIsland(x.q.t, islands) === effFilter) : rows;
  const visOpen = onIsland(openQuests);
  const visWait = onIsland(waitQuests);
  const visDone = onIsland(doneQuests);
  // How many parked tasks are queued behind each task (build 66), keyed by its
  // text — the same handle the store links on. Shown on the blocker's row, so
  // "tick this and two things come back" is visible before you tick it. The
  // count ignores the island filter: a task on one island can block another's.
  const behind = new Map<string, number>();
  for (const { q } of indexed)
    if (!q.done && q.w)
      for (const b of blockersOf(q)) {
        const k = b.trim().toLowerCase();
        behind.set(k, (behind.get(k) || 0) + 1);
      }
  // The label half of a quest row, shared by the open and waiting lists.
  const questBody = (q: QuestItem) => {
    const n = behind.get(q.t.trim().toLowerCase()) || 0;
    return (
      <span style={{ flex: 1 }}>
        {linkify(q.t)}
        {q.note && <small className="qnote">{q.note}</small>}
        {n > 0 && (
          <small
            className="qnote qdep"
            title="Tick this off and they come a step closer — anything with nothing else left to wait for jumps back to the top of the list"
          >
            ⛓ {n} task{n > 1 ? "s" : ""} queued behind this
          </small>
        )}
      </span>
    );
  };
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
  // Every game numbers its regions from 1, so a region number alone is
  // ambiguous — 1 is the Old World in 1800 and Latium in 117. Each dataset
  // carries its own region names (1800 keeps data.ts's wording, "The Arctic").
  const REGION_LABEL = (n: number) => DATASETS[game].regions[n] ?? String(n);
  // Growth goal row: island, tier, number (the old curated milestone menu
  // was overkill — asked for, build 117).
  const [growthTid, setGrowthTid] = useState<string | null>(null);
  const [growthN, setGrowthN] = useState("");
  const [growthIsle, setGrowthIsle] = useState("");
  // Picks survive a game switch in state, but another game's tier id or
  // island name means nothing here — treat them as unpicked rather than
  // leaving a dead Add button pointing at a tier the dropdown can't show.
  const goalTid = growthTid && GROWTH_TIERS.some((t) => t.tid === growthTid) ? growthTid : null;
  // The row's effective island: the picked one, else the quest filter's,
  // else the only island — so the common case is tier + number and done.
  const goalIsle =
    (islands.includes(growthIsle) ? growthIsle : "") ||
    effFilter ||
    (islands.length === 1 ? islands[0] : "");
  const goalRegion = REGION_NUM[(data.islandRegions || {})[goalIsle]] || 0;
  // Tiers the picked island's region can house; no island or no 🌍 tag falls
  // back to the play-scoped list.
  const goalTiers = goalRegion
    ? GROWTH_TIERS.filter((t) => t.region === goalRegion)
    : growthTiers;
  const addGrowth = () => {
    const t = GROWTH_TIERS.find((x) => x.tid === goalTid);
    const n = Math.floor(Number(growthN));
    if (!t || !(n > 0)) return;
    addQuest(
      `${goalIsle ? `${goalIsle}: ` : ""}Add ${n} ${t.lbl}`,
      // In 117 the house count depends on how well you feed them, so quote
      // both ends rather than a single figure that is only true at one band.
      t.fhBasic && t.fhBasic !== t.fh
        ? `≈${houses(n, t.fh)} residences fully supplied (${t.fh} per house), or ${houses(
            n,
            t.fhBasic
          )} on basic needs alone (${t.fhBasic} per house).`
        : `≈${houses(n, t.fh)} residences at ${t.fh} per house.`
    );
    // Number clears, island and tier stay — the next goal is usually a
    // sibling on the same island.
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
  // Check-in tasks (build 62) — "I'm leaving this island, remind me to come
  // back". One tap from the island's own block (👁 on its header) or from the
  // row here. It lands at the bottom of the open list, because a check-in is by
  // definition for later. Deliberately just the island: a typed detail only
  // ended up restating a task already on the list (build 66).
  const CHECK_IN = "check back in";
  const checkInText = (isle: string) => `${isle}: ${CHECK_IN}`;
  // Is this island already queued for a look? Keeps double-taps from stacking
  // duplicates, and lets the 👁 show it's already done.
  const checkInQueued = (isle: string) =>
    quests.some((q) => !q.done && q.t.startsWith(`${isle}: ${CHECK_IN}`));
  const addCheckIn = (isle: string) => {
    if (!isle || checkInQueued(isle)) return;
    addQuest(checkInText(isle));
  };
  const [ciOpen, setCiOpen] = useState(false);
  const [ciIsle, setCiIsle] = useState("");
  // Trade flows (build 96): the links ticked on ledger rows, plus every ship
  // route whose from/to/cargo are all filled in — a recorded route already
  // says the same thing, so it links up without any extra bookkeeping.
  const flows = [
    ...(data.islandLinks || []),
    ...(data.ships || []).flatMap((s) =>
      s.from && s.to && s.cargo?.length
        ? s.cargo.map((g) => ({ good: g, from: s.from!, to: s.to! }))
        : []
    ),
  ];
  // Every island's ledger at once, because trade moves goods BETWEEN them:
  // an export subtracts from its source's surplus and lands on its
  // destination, so no island's rows can be finished in isolation.
  const allLedgers = (() => {
    const ledgers: Record<string, ReturnType<typeof islandLedger>> = {};
    const regions: Record<string, number> = {};
    for (const n of islands) {
      ledgers[n] = islandLedger(
        (data.islandChecks || {})[n] || [],
        game,
        REGION_NUM[(data.islandRegions || {})[n] || ""] || 0,
        // Resident consumption (M8) lands here, BEFORE applyTrade below, so
        // links serve what the population really leaves uncovered.
        (data.islandPop || {})[n],
        data.popCfg
      );
      regions[n] = REGION_NUM[(data.islandRegions || {})[n] || ""] || 0;
    }
    applyTrade(ledgers, regions, flows, game);
    return ledgers;
  })();
  // M9 — suggested trade flows: pair one island's leftover with another's
  // shortfall, on the POST-trade ledgers, so accepted links and ship routes
  // are already subtracted and a spent surplus isn't offered twice. With the
  // quest list filtered to one island, only its arrivals/departures show.
  const tradeIdeas = suggestTrades(allLedgers, flows).filter(
    (s) => !effFilter || s.from === effFilter || s.to === effFilter
  );
  // How many islands are missing something. The per-island block works this out
  // again for its own header; doing it here too keeps the tally at the top of
  // the card honest when every island is folded away.
  const islesShort = islands.filter((n) => (allLedgers[n] || []).some((r) => r.fix)).length;
  // 🌱 (build 122) — per region, the fertilities and deposits no island you
  // hold there has. Cape Trelawney folds into the Old World (same list, and
  // the two trade freely). Silent for a region until something is ticked.
  const fertGaps = useMemo(
    () =>
      missingFertilities(
        game,
        islands,
        (n) => (data.islandRegions || {})[n] || "",
        (n) => (data.islandItems || {})[n]?.[FERT_SOCKET] || []
      ),
    [game, islands, data.islandRegions, data.islandItems]
  );
  // Landmark quick-add chips, collapsed per island until asked for.
  const [chipsOpen, setChipsOpen] = useState<Record<string, boolean>>({});
  // Which islands' 👥 resident editors are unfolded. Session-local, like the
  // chips row — the counts themselves live in CompanionData and sync.
  const [popOpen, setPopOpen] = useState<Record<string, boolean>>({});
  // Folded-up islands (build 72). A settled island's block runs to a screenful
  // once it has an inventory, a ledger and a plan check, and you are usually
  // only looking at one of them. Which are folded is remembered per game, and
  // read after mount rather than during render — localStorage isn't there when
  // this component is prerendered on the server.
  const [isleShut, setIsleShut] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let shut: Record<string, boolean> = {};
    try {
      const raw = JSON.parse(localStorage.getItem(ISLE_SHUT_KEY(game)) || "[]");
      if (Array.isArray(raw)) shut = Object.fromEntries(raw.map((n) => [String(n), true]));
    } catch {}
    setIsleShut(shut);
  }, [game]);
  const writeShut = (next: Record<string, boolean>) => {
    try {
      localStorage.setItem(ISLE_SHUT_KEY(game), JSON.stringify(Object.keys(next)));
    } catch {}
    return next;
  };
  const toggleIsle = (name: string) =>
    setIsleShut((cur) => {
      const next = { ...cur };
      if (next[name]) delete next[name];
      else next[name] = true;
      return writeShut(next);
    });
  // Unfold an island and go to it — what the collections roll-up does when you
  // tap an island. Unfolding alone isn't enough: with several islands the one
  // you asked for can open below the fold and look like nothing happened.
  const openIsle = (name: string) => {
    setIsleShut((cur) => {
      if (!cur[name]) return cur;
      const next = { ...cur };
      delete next[name];
      return writeShut(next);
    });
    setTimeout(() => {
      document
        .getElementById(isleDomId(name))
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };
  // Tucked checklists (build 98) — same shape as the fold above, its own key:
  // the island stays open, only its item rows collapse, leaving the ledger.
  const [isleTuck, setIsleTuck] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let tuck: Record<string, boolean> = {};
    try {
      const raw = JSON.parse(localStorage.getItem(ISLE_TUCK_KEY(game)) || "[]");
      if (Array.isArray(raw)) tuck = Object.fromEntries(raw.map((n) => [String(n), true]));
    } catch {}
    setIsleTuck(tuck);
  }, [game]);
  const toggleTuck = (name: string) =>
    setIsleTuck((cur) => {
      const next = { ...cur };
      if (next[name]) delete next[name];
      else next[name] = true;
      try {
        localStorage.setItem(ISLE_TUCK_KEY(game), JSON.stringify(Object.keys(next)));
      } catch {}
      return next;
    });
  // Folded ledgers (build 123) — same shape as the two folds above.
  const [ledgShut, setLedgShut] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let shut: Record<string, boolean> = {};
    try {
      const raw = JSON.parse(localStorage.getItem(ISLE_LEDG_KEY(game)) || "[]");
      if (Array.isArray(raw)) shut = Object.fromEntries(raw.map((n) => [String(n), true]));
    } catch {}
    setLedgShut(shut);
  }, [game]);
  const toggleLedg = (name: string) =>
    setLedgShut((cur) => {
      const next = { ...cur };
      if (next[name]) delete next[name];
      else next[name] = true;
      try {
        localStorage.setItem(ISLE_LEDG_KEY(game), JSON.stringify(Object.keys(next)));
      } catch {}
      return next;
    });
  // What each island's zoo / museum / botanical garden holds (build 91). The
  // panel itself is inside the island fold and then inside the building fold,
  // so the answer to "what's on what island" needed to live outside both.
  const cultureByIsle = useMemo(() => {
    const out = new Map<string, CultureAt[]>();
    for (const n of islands) {
      const at = cultureAt(
        (data.islandChecks || {})[n] || [],
        game,
        (bid) => (data.islandCulture || {})[n]?.[bid] || []
      );
      if (at.length) out.set(n, at);
    }
    return out;
  }, [islands, data.islandChecks, data.islandCulture, game]);
  // Where each island's card sits on the 🏛 tab, for the jump chips up top.
  const cultRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const savedLabel =
    sync === "synced" ? "synced" : sync === "syncing" ? "syncing…" : "saves automatically";

  return (
    <div className="docwrap">
      {section === "tasks" && (
      <div className="card">
        <div className="hd">
          <h2>📜 Quest Tracker</h2>
          <span className="muted">{savedLabel}</span>
        </div>
        <div className="bd doc">
          {/* A tally, not an essay (build 83). Every button says what it does
              on hover; the paragraph that used to be here said it all again. */}
          {quests.length > 0 && (
            <p className="fleetsum">
              <span>To do ×{openQuests.length}</span>
              {waitQuests.length > 0 && <span>Waiting ×{waitQuests.length}</span>}
              {doneQuests.length > 0 && <span>Done ×{doneQuests.length}</span>}
            </p>
          )}
          <div className="plrow">
            <Dropdown
              ariaLabel="Add a story questline or add-on goal"
              placeholder="＋ Add a story questline / add-on goal…"
              value=""
              // The note used to be a tooltip you had to hover for. Our own
              // list can just show it under the name.
              hints
              onChange={(v) => {
                const entry = STORYLINES.flatMap(([, items]) => items).find((s) => s.t === v);
                if (entry) addQuest(entry.t, entry.note);
              }}
              options={STORYLINES.map(([group, items]) => ({
                group,
                options: items.map((s) => ({ value: s.t, label: s.t, title: s.note })),
              }))}
            />
          </div>
          {/* 📈 growth goal: island, tier, number — one row (asked for over
              the old curated menu of every milestone, which was overkill).
              The tier list scopes to the picked island's region; the note on
              the added goal still works the residences out. */}
          {GROWTH_TIERS.length > 0 && (
            <div className="plrow">
              <span
                className="muted"
                style={{ alignSelf: "center", flex: "0 0 auto" }}
                title={GAME_CONTENT[game].growthHint}
              >
                📈
              </span>
              <Dropdown
                className="qisle"
                ariaLabel="Which island grows"
                placeholder="🏝 island…"
                value={goalIsle}
                onChange={setGrowthIsle}
                options={[
                  { value: "", label: "(no island)" },
                  ...islands.map((n) => ({ value: n, label: n })),
                ]}
              />
              <Dropdown
                className="qisle"
                ariaLabel="Which tier grows"
                placeholder="tier…"
                title={GAME_CONTENT[game].growthHint}
                value={goalTid ?? ""}
                onChange={(v) => setGrowthTid(v || null)}
                options={goalTiers.map((t) => ({
                  value: t.tid,
                  label:
                    growthRegions.size > 1 && !goalRegion
                      ? `${t.lbl} · ${REGION_LABEL(t.region)}`
                      : t.lbl,
                }))}
              />
              <input
                type="number"
                min={1}
                style={{ width: 96, flex: "0 0 auto" }}
                placeholder="how many"
                aria-label="How many residents to add"
                value={growthN}
                onChange={(e) => setGrowthN(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addGrowth();
                }}
              />
              <button
                className="linkbtn"
                disabled={!goalTid || !(Math.floor(Number(growthN)) > 0)}
                onClick={addGrowth}
              >
                ＋ Add
              </button>
            </div>
          )}
          <div className="plrow">
            <Dropdown
              className="qisle"
              ariaLabel="Tag with one of your islands"
              placeholder="🏝 Island…"
              value=""
              onChange={(v) => {
                if (v === "__add") {
                  const name = window.prompt("Island name to add:");
                  if (name?.trim()) {
                    // Same ask-where-it-is as the inventory add row, prompt-
                    // sized. Only the 🌍 tag — new islands start blank.
                    const r = (
                      window.prompt(
                        "Where is it?\n1 Old World / Cape Trelawney · 2 New World · 3 Arctic · 4 Enbesa\nEnter = no region",
                        ""
                      ) || ""
                    ).trim();
                    const key = { "1": "ow", "2": "nw", "3": "ar", "4": "en" }[r];
                    addIsland(name, undefined, key);
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
              options={[
                ...islands.map((n) => ({ value: n, label: n })),
                { value: "__add", label: "＋ Add island…" },
                ...(islands.length > 0
                  ? [{ value: "__del", label: "− Remove island…" }]
                  : []),
              ]}
            />
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
                  <Dropdown
                    className="qisle"
                    ariaLabel="From island"
                    value={routeFrom}
                    onChange={setRouteFrom}
                    options={[
                      { value: "", label: "From…" },
                      ...islands.map((n) => ({ value: n, label: n })),
                    ]}
                  />
                  <Dropdown
                    className="qisle"
                    ariaLabel="To island"
                    value={routeTo}
                    onChange={setRouteTo}
                    options={[
                      { value: "", label: "→ To…" },
                      ...islands.map((n) => ({ value: n, label: n })),
                    ]}
                  />
                  <input
                    placeholder="What… e.g. Rum (Enter to add)"
                    list="waitGoods"
                    value={routeWhat}
                    onChange={(e) => setRouteWhat(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addRoute();
                    }}
                  />
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
          {islands.length > 0 && (
            <div className="plrow">
              {!ciOpen ? (
                <button
                  className="linkbtn"
                  title="Task to come back to an island later — the 👁 on an island block does the same in one press"
                  onClick={() => {
                    setCiIsle(effFilter || islands[0] || "");
                    setCiOpen(true);
                  }}
                >
                  👁 Check back in on…
                </button>
              ) : (
                <>
                  <Dropdown
                    className="qisle"
                    ariaLabel="Which island to check back in on"
                    value={ciIsle}
                    onChange={setCiIsle}
                    options={islands.map((n) => ({ value: n, label: n }))}
                  />
                  <button
                    className="linkbtn"
                    disabled={!ciIsle || checkInQueued(ciIsle)}
                    title={
                      ciIsle && checkInQueued(ciIsle)
                        ? `${ciIsle} is already on the list to check back in`
                        : `Adds “${checkInText(ciIsle)}” to the bottom of the list`
                    }
                    onClick={() => {
                      addCheckIn(ciIsle);
                      setCiOpen(false);
                    }}
                  >
                    ＋ Add
                  </button>
                  <button className="plx" title="Close" onClick={() => setCiOpen(false)}>
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
          {/* Shared by the 🚢 route row and every parked task's "waiting on"
              box — both are asking which good you mean. */}
          <datalist id="waitGoods">
            {GOOD_NAMES.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
          <div id="questList">
            {visOpen.length ? (
              visOpen.map(({ q, i }, k) => (
                <div className="plitem questrow" key={`${i}:${q.t}`}>
                  {/* The box ticks the task, and nothing else does (build 78).
                      This used to be a <label>, so any tap on the row — reading
                      it on a phone, following a link in the text — completed
                      the thing you were only looking at. */}
                  <div className="qmain">
                    <input
                      type="checkbox"
                      checked={q.done}
                      title="Tick off"
                      aria-label={`Tick off ${q.t}`}
                      onChange={(e) => toggleQuest(i, e.target.checked)}
                    />
                    {questBody(q)}
                  </div>
                  {q.wr && (
                    <button
                      className="chip schip qrang"
                      title={
                        q.wr === "deps"
                          ? "The last task it was waiting on got ticked off while you were playing, so it came back up here — press to clear the mark"
                          : "Its timer ran out while you were playing, so it came back up here — press to clear the mark"
                      }
                      onClick={() => clearQuestRang(i)}
                    >
                      {q.wr === "deps" ? "⛓ unblocked" : "⏰ time's up"}
                    </button>
                  )}
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
                  {/* Wait on another task without parking this one first
                      (build 70) — picking a blocker parks it for you. Before
                      this you had to know to press ⏳ and then find the box,
                      which is why dependencies went unnoticed. */}
                  {(() => {
                    const opts = indexed
                      .filter((x) => !x.q.done && x.i !== i)
                      .map((x) => ({ value: x.q.t, label: x.q.t }));
                    return opts.length ? (
                      <Dropdown
                        className="bpick"
                        ariaLabel={`Wait for another task before ${q.t}`}
                        title="Do something else first — pick the task this one has to wait for. It parks until every blocker you add is ticked off, then comes back to the top."
                        placeholder="⛓"
                        value=""
                        onChange={(v) => addQuestBlocker(i, v)}
                        options={opts}
                      />
                    ) : null;
                  })()}
                  {/* Timers belong on any task, not only parked ones (build
                      77): you're usually still looking at "sail to Manola"
                      in the open list when you realise the crossing is the
                      wait. Setting one parks the task on its own, same as ⛓
                      does — the ⏱ here and the one on a parked row are the
                      same control. */}
                  <Dropdown
                    className="tpick"
                    ariaLabel={`Set a timer on ${q.t}`}
                    title="Waiting on nothing but time — a ship crossing, a build finishing? Give it a rough length: the task parks itself and comes back to the top when the clock runs out."
                    placeholder="⏱"
                    value=""
                    onChange={(v) => setQuestTimer(i, Number(v))}
                    options={TIMER_MINS.map((m) => ({
                      value: String(m),
                      label: m === 60 ? "1 hour" : `${m} min`,
                    }))}
                  />
                  {/* The rest of "waiting on…" reaches the open list too (build
                      73): a good you're short of, answered where the task
                      already is. Before this you had to park the task first and
                      then find its row in the fold, which is a lot of ceremony
                      for "no bricks yet". Anything else it might be waiting on
                      is still free text on the parked row. */}
                  <Dropdown
                    className="wpick"
                    ariaLabel={`Park ${q.t}`}
                    title="Can't do it yet? Park it — and say what you're short of, without leaving the list."
                    placeholder="⏳"
                    value=""
                    onChange={(v) => {
                      if (v === "park") setQuestWaiting(i, true);
                      else if (v.startsWith("g:")) setQuestWaitNote(i, v.slice(2));
                    }}
                    options={[
                      { value: "park", label: "⏳ Park it — I'll say why later" },
                      {
                        group: "Waiting on a good",
                        options: GOOD_NAMES.map((g) => ({ value: `g:${g}`, label: g })),
                      },
                    ]}
                  />
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
                      <div className="qmain">
                        <input
                          type="checkbox"
                          checked={q.done}
                          title="Tick off"
                          aria-label={`Tick off ${q.t}`}
                          onChange={(e) => toggleQuest(i, e.target.checked)}
                        />
                        {questBody(q)}
                      </div>
                      {/* One chip per task in the way — tap to unlink. The task
                          comes back on its own when the LAST of them is ticked
                          off, so several can be queued up (build 70). */}
                      {blockersOf(q).map((b) => (
                        <button
                          key={b}
                          className="chip schip wqchip"
                          title={`Waiting on “${b}” — press to unlink. This task frees itself once every blocker is ticked off.`}
                          onClick={() => removeQuestBlocker(i, b)}
                        >
                          ⛓ {b} ✕
                        </button>
                      ))}
                      {(() => {
                        // Only tasks that aren't already blocking this one, and
                        // never itself. A menu rather than a type-in box: typing
                        // a name that didn't match used to fail silently, and
                        // leave a plain note where you expected a link.
                        const on = new Set(blockersOf(q).map((b) => b.trim().toLowerCase()));
                        const opts = indexed
                          .filter(
                            (x) => !x.q.done && x.i !== i && !on.has(x.q.t.trim().toLowerCase())
                          )
                          .map((x) => ({ value: x.q.t, label: x.q.t }));
                        return opts.length ? (
                          <Dropdown
                            className="bpick"
                            ariaLabel={`Wait for another task before ${q.t}`}
                            title="Wait for another task on the list. Add as many as you need — this one comes back to the top when the last of them is ticked off."
                            placeholder="⛓"
                            value=""
                            onChange={(v) => addQuestBlocker(i, v)}
                            options={opts}
                          />
                        ) : null;
                      })()}
                      {/* Most waits are for a material, so the box suggests the
                          game's goods (build 71) — and shows the picture once
                          the note names one. Still free text: "a ship", "the
                          next region" and the like are just as valid. */}
                      <GoodIcon name={q.wn} game={game} />
                      <input
                        className="wnote"
                        placeholder="waiting on… e.g. Bricks"
                        title="What you're short of. Type any good for the list to suggest it, or anything else — a ship, an unlock. Use ⛓ to wait on another task instead."
                        list="waitGoods"
                        defaultValue={q.wn || ""}
                        onBlur={(e) => setQuestWaitNote(i, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                      />
                      {q.wt ? (
                        // On the clock: the countdown replaces the picker, and
                        // tapping it calls the wait off early.
                        <button
                          className="chip schip qtimer"
                          title={`Frees itself at ${new Date(q.wt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })} — press to cancel the timer`}
                          onClick={() => setQuestTimer(i, null)}
                        >
                          ⏱ {countdown(q.wt - now)}
                        </button>
                      ) : (
                        <Dropdown
                          className="tpick"
                          ariaLabel={`Set a timer on ${q.t}`}
                          title="Waiting on nothing but time — a ship crossing, a build finishing? Give it a rough length and the task frees itself when the clock runs out."
                          placeholder="⏱"
                          value=""
                          onChange={(v) => setQuestTimer(i, Number(v))}
                          options={TIMER_MINS.map((m) => ({
                            value: String(m),
                            label: m === 60 ? "1 hour" : `${m} min`,
                          }))}
                        />
                      )}
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
                {/* Clearing used to be inside the fold, so you had to open it
                    to find it — and it was missing entirely under an island
                    filter (build 78). It takes two taps: the list is history
                    you can't get back, and it now sits in easy reach. */}
                <button
                  className={"linkbtn" + (armClear ? " arm" : "")}
                  title={
                    effFilter
                      ? `Drop ${effFilter}'s completed tasks from the list`
                      : "Drop every completed task from the list"
                  }
                  onClick={() => {
                    if (!armClear) return setArmClear(true);
                    setArmClear(false);
                    clearDoneQuests(effFilter ?? undefined);
                  }}
                >
                  {armClear
                    ? `✕ Really clear ${visDone.length}?`
                    : `✕ Clear ${visDone.length} completed${effFilter ? ` on ${effFilter}` : ""}`}
                </button>
                {showDone &&
                  visDone.map(({ q, i }) => (
                    <div className="plitem questrow done" key={`${i}:${q.t}`}>
                      <div className="qmain">
                        <input
                          type="checkbox"
                          checked={q.done}
                          title="Untick to reopen"
                          aria-label={`Reopen ${q.t}`}
                          onChange={(e) => toggleQuest(i, e.target.checked)}
                        />
                        <span style={{ flex: 1 }}>{linkify(q.t)}</span>
                      </div>
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
      )}
      {/* 🗒 Notes (asked for during M13): a plain notes-to-self list under the
          quests — "this run: don't over-build schnapps". The storage is the
          Playbook era's parking lot, which build 38 unlisted but storage and
          sync kept carrying, so old blobs surface their notes again here.
          Rides the save: a duplicated save keeps its notes, a fresh one
          starts clean. */}
      {section === "tasks" && (
      <div className="card">
        <div className="hd">
          <h2>🗒 Notes</h2>
          <span className="muted">notes to self — they ride this save</span>
        </div>
        <div className="bd doc">
          {(data.parkinglot || []).map((n, i) => (
            <div className="plitem questrow" key={`${i}:${n}`}>
              <span style={{ flex: 1 }}>{linkify(n)}</span>
              <button
                className="plx"
                title="Remove note"
                onClick={() => setNotes((data.parkinglot || []).filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          ))}
          <div className="plrow">
            <input
              placeholder="Leave yourself a note… (Enter to add)"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && noteDraft.trim()) {
                  setNotes([...(data.parkinglot || []), noteDraft]);
                  setNoteDraft("");
                }
              }}
            />
          </div>
        </div>
      </div>
      )}
      {section === "islands" && (
      <div className="card">
        <div className="hd">
          <h2>🏝 Island Inventory</h2>
          <span className="muted">{savedLabel}</span>
        </div>
        <div className="bd doc">
          {islands.length > 0 && (
            <p className="fleetsum">
              <span>
                {islands.length} island{islands.length > 1 ? "s" : ""}
              </span>
              {islesShort > 0 && <span className="isleshort">⚠ {islesShort} short</span>}
            </p>
          )}
          {/* The zoo/museum/garden roll-up that used to sit here moved with
              the pieces to the 🏛 Culture tab (build 101) — inside this card
              they were three folds deep. The trade suggestions (M9) took the
              spot: cross-island advice belongs above the per-island blocks. */}
          {tradeIdeas.length > 0 && (
            <div className="trsuggest">
              <span
                className="muted"
                title="Worked out from the ledgers after every link and ship route has moved its goods: an island's leftover set against another's shortfall. Press one to add the link — the ledger then routes it and the suggestion clears."
              >
                🧭 Suggested:
              </span>
              {tradeIdeas.map((s) => (
                <button
                  key={`${s.good}|${s.from}|${s.to}`}
                  className="trchip trsug"
                  title={`${s.to} is ${fmt(s.tpm)} t/min short of ${s.good} that ${s.from} has spare — press to link it`}
                  onClick={() => addIslandLink(s.good, s.from, s.to)}
                >
                  <GoodIcon name={s.good} game={game} />
                  {s.good} {fmt(s.tpm)} · {s.from} → {s.to}
                </button>
              ))}
            </div>
          )}
          {fertGaps.map((g) => (
            <div
              className={
                "trsuggest fertgaps" +
                (g.missing.fert.length + g.missing.deposits.length === 0 ? " fertfull" : "")
              }
              key={g.key}
            >
              {g.missing.fert.length + g.missing.deposits.length === 0 ? (
                <span
                  className="muted"
                  title={`Every fertility and deposit this region can have is ticked on one of ${g.islands.join(", ")}.`}
                >
                  🌱 {g.label} — <b>full set ✓</b>
                </span>
              ) : (
                <span
                  className="muted"
                  title={
                    `From the 🌱 ticks on ${g.islands.join(", ")}: what the region can have that none of them does. Settle or seed for these.`
                  }
                >
                  🌱 {g.label} lacks:
                </span>
              )}
              {g.missing.fert.length + g.missing.deposits.length === 0 ? null : (
                <>
                  {g.missing.fert.map((n) => (
                    <span className="trchip" key={n} title={n}>
                      {shortFertName(n)}
                    </span>
                  ))}
                  {g.missing.deposits.map((n) => (
                    <span className="trchip fertdep" key={n} title={`${n} (deposit)`}>
                      ⛏ {shortFertName(n)}
                    </span>
                  ))}
                </>
              )}
            </div>
          ))}
          <div className="plrow">
            <Dropdown
              className="qisle"
              ariaLabel="Region of the new island"
              title="Where the new island is — sets which buildings the item box suggests. The island starts blank."
              value={isleRegion}
              onChange={setIsleRegion}
              options={ISLAND_STARTERS.map((r) => ({ value: r.key, label: r.label }))}
            />
            <input
              placeholder="Add island… (Enter to add)"
              value={isleDraft}
              onChange={(e) => setIsleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  addIslandTagged();
                }
              }}
            />
            <button className="linkbtn" onClick={addIslandTagged}>
              ＋ Add
            </button>
            <button
              className={"linkbtn" + (sortAZ ? " on" : "")}
              title="Show every island's items A→Z. Display only — the order you added them in is kept underneath."
              onClick={toggleSort}
            >
              A→Z
            </button>
          </div>
          {islands.length ? (
            islands.map((name, idx) => {
              const items = (data.islandChecks || {})[name] || [];
              const have = items.filter((c) => c.done).length;
              const region = (data.islandRegions || {})[name] || "";
              const chipRegion = REGION_ALIAS[region] || region;
              const chips = ISLAND_SUGGESTIONS.filter(
                (s) =>
                  (!s.regions || !chipRegion || s.regions.includes(chipRegion)) &&
                  !items.some((c) => c.t.toLowerCase() === s.t.toLowerCase())
              ).map((s) => s.t);
              const ledger = allLedgers[name] || [];
              const plan = (data.islandPlans || {})[name];
              const shut = !!isleShut[name];
              const tuck = !!isleTuck[name];
              const lshut = !!ledgShut[name];
              const shortN = ledger.filter((r) => r.fix).length;
              const cul = cultureByIsle.get(name) || [];
              // 🌱 count for the folded header — only once something's ticked.
              const fertList = regionFertility(game, region);
              const fertHave = fertList
                ? ((data.islandItems || {})[name]?.[FERT_SOCKET] || []).filter(
                    (n) => fertList.fert.includes(n) || fertList.deposits.includes(n)
                  ).length
                : 0;
              // 👥 residents (M8): this island's headcounts, and the tiers its
              // 🌍 region can even house — untagged islands get the full list.
              const pops = (data.islandPop || {})[name] || {};
              const popTiers = REGION_NUM[region]
                ? GROWTH_TIERS.filter((t) => t.region === REGION_NUM[region])
                : GROWTH_TIERS;
              return (
                <div
                  className={"isleblk" + (shut ? " shut" : "")}
                  key={name}
                  id={isleDomId(name)}
                >
                  {!shut && (
                    <datalist id={`bldgSuggest${idx}`}>
                      {itemSuggestions(region).map((b) => {
                        // The good as the option's text, so the browser also
                        // matches what a building MAKES — typing "Sausages"
                        // offers the Slaughterhouse. Picking still inserts
                        // the value (the building), which is what parses.
                        const g = iconGoodName(b, game);
                        return (
                          <option key={b} value={b}>
                            {g && g !== b ? g : null}
                          </option>
                        );
                      })}
                    </datalist>
                  )}
                  <div className="islehd">
                    <h4>
                      <button
                        className="isletog"
                        aria-expanded={!shut}
                        title={shut ? `Open ${name}` : `Fold ${name} away`}
                        onClick={() => toggleIsle(name)}
                      >
                        {shut ? "▸" : "▾"} 🏝 {name}
                      </button>
                    </h4>
                    {shut ? (
                      <span className="muted">
                        {have}/{items.length}
                      </span>
                    ) : (
                      <button
                        className="isletuck"
                        aria-expanded={!tuck}
                        title={
                          tuck
                            ? "Show the checklist"
                            : "Tuck the checklist away — the ledger stays"
                        }
                        onClick={() => toggleTuck(name)}
                      >
                        {tuck ? "▸" : "▾"} {have}/{items.length}
                      </button>
                    )}
                    {/* The ledger now shows even folded (build 99), carrying
                        its own ⚠ line — no separate short badge needed. */}
                    {/* …and what its collections are up to, for the same
                        reason: it's a thing you'd otherwise open it to see. */}
                    {shut && fertHave > 0 && fertList && (
                      <span
                        className="isleculture"
                        title={`${fertHave} of the ${
                          fertList.fert.length + fertList.deposits.length
                        } fertilities and deposits this region can have`}
                      >
                        🌱 {fertHave}/{fertList.fert.length + fertList.deposits.length}
                      </span>
                    )}
                    {shut && cul.length > 0 && (
                      <span
                        className="isleculture"
                        title={cul
                          .map(
                            (a) =>
                              `${a.b.label}: ${a.have}/${a.total} ${a.b.noun}s, ` +
                              `${a.complete}/${a.sets} sets done`
                          )
                          .join(" · ")}
                      >
                        {cul.map((a) => (
                          <span key={a.b.id}>
                            {CULTURE_EMOJI[a.b.id] || "🏛"} {a.have}/{a.total}
                          </span>
                        ))}
                        {cul.some((a) => a.nearly > 0) && (
                          <em
                            className="cuflag"
                            title="Sets one piece short — open it for which piece"
                          >
                            ⚑{cul.reduce((n, a) => n + a.nearly, 0)}
                          </em>
                        )}
                      </span>
                    )}
                    {!shut && (
                      <>
                    <Dropdown
                      className="planlink"
                      ariaLabel={`Region of ${name}`}
                      title="Which world this island is in — building suggestions only offer that world's buildings. Amend any time; you can still type any name."
                      value={region}
                      onChange={(v) => setIslandRegion(name, v || null)}
                      options={[
                        { value: "", label: "🌍 region…" },
                        ...Object.entries(REGION_LABELS).map(([k, l]) => ({
                          value: k,
                          label: l as string,
                        })),
                      ]}
                    />
                    {plan ? (
                      <button
                        className="chip schip on"
                        title={`Linked plan “${plan.name}” — built vs planned below. Press to unlink.`}
                        onClick={() => {
                          if (window.confirm(`Unlink plan “${plan.name}” from ${name}?`))
                            setIslandPlan(name, null);
                        }}
                      >
                        🎯 {plan.name}
                      </button>
                    ) : (
                      <Dropdown
                        className="planlink"
                        ariaLabel={`Link a calculator plan to ${name}`}
                        placeholder="🎯 Link plan…"
                        title="Link a calculator plan — the island block then shows built vs planned"
                        value=""
                        onChange={(v) => {
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
                        options={[
                          { value: "__cur", label: "Current calculator setup" },
                          ...savedPlans.map((p) => ({ value: p.id, label: `💾 ${p.name}` })),
                        ]}
                      />
                    )}
                      </>
                    )}
                    <button
                      className={"plx qmove qeye" + (checkInQueued(name) ? " on" : "")}
                      title={
                        checkInQueued(name)
                          ? `${name} is already on the quest list to check back in`
                          : `Leaving ${name}? Add a task to come back and look it over`
                      }
                      disabled={checkInQueued(name)}
                      onClick={() => addCheckIn(name)}
                    >
                      👁
                    </button>
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
                  {!shut && (
                    <>
                  {!tuck &&
                  (sortAZ
                    ? items
                        .map((c, i) => ({ c, i }))
                        .sort((a, b) => a.c.t.localeCompare(b.c.t))
                    : items.map((c, i) => ({ c, i }))
                  ).map(({ c, i }) => (
                    <div className={"plitem questrow" + (c.done ? "" : " gap")} key={`${i}:${c.t}`}>
                      <label className="qmain" title="Press to toggle">
                        <input
                          type="checkbox"
                          checked={c.done}
                          onChange={(e) => toggleIslandCheck(name, i, e.target.checked)}
                        />
                        <span style={{ flex: 1 }}>
                          <GoodIcon name={iconGoodName(c.t, game)} game={game} />
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
                                    ? "Silo fitted — output doubled, eats feed. Press to remove."
                                    : "No silo yet — press once you bolt one on (output ×2, eats feed)."
                                  : `${sc} of the ${nb} farms have a silo — one module max per farm, and a line can be part-silo'd. Silo'd farms make ×2 and eat feed.`
                              }
                              onSet={(v) => setIslandSilo(name, i, v)}
                            />
                          );
                        })()}
                      {/* Power is per-world: ⚡ electricity on Old World
                          goods (Cape Trelawney counts via the alias), ⛽
                          New World Rising fuel stations on New World goods
                          — the same ×2 in the ledger. An island with no
                          region set still gets the chip (names merge across
                          worlds, so we can't tell which one it is). */}
                      {(() => {
                        const pk = powerKind(c.t, game);
                        if (!pk) return null;
                        if (region && chipRegion !== (pk === "elec" ? "ow" : "nw"))
                          return null;
                        const sym = pk === "elec" ? "⚡" : "⛽";
                        const plant = pk === "elec" ? "power plant" : "fuel station";
                        const nb = c.n || 1;
                        const ec = Math.min(c.e || 0, nb);
                        return (
                          <ModChip
                            n={nb}
                            count={ec}
                            unit="powered building"
                            one={`${sym} ${pk === "elec" ? "power" : "fuel"}`}
                            many={sym}
                            title={
                              nb === 1
                                ? ec > 0
                                  ? `Powered — output doubled. Press when the ${plant} no longer covers it.`
                                  : `Not powered — press once a ${plant} covers it (output ×2).`
                                : `${ec} of the ${nb} are inside a ${plant}'s radius — powered ones make ×2. Powered and silo'd together makes ×4.`
                            }
                            onSet={(v) => setIslandElec(name, i, v)}
                          />
                        );
                      })()}
                      {/* Teach the ledger this building's numbers (M13) —
                          only in a game with no data pack, where every item
                          would otherwise stay free text forever. */}
                      {!DATASETS[game].hasCalc && (
                        <TeachChip
                          itemName={c.t}
                          recipe={
                            (data.userRecipes || []).find(
                              (r) => r.building.toLowerCase() === c.t.trim().toLowerCase()
                            ) ?? null
                          }
                          onSave={saveUserRecipe}
                          onRemove={() => removeUserRecipe(c.t)}
                        />
                      )}
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
                    </>
                  )}
                  {/* 👥 residents stay OUTSIDE the fold like the ledger they
                      feed (M8) — a folded island still says who lives there. */}
                  <ResidentsBlock
                    island={name}
                    tiers={popTiers}
                    pop={pops}
                    cfg={data.popCfg || DEFAULT_POP_CFG}
                    game={game}
                    open={!!popOpen[name]}
                    onToggle={() => setPopOpen((s) => ({ ...s, [name]: !s[name] }))}
                    setIslandPop={setIslandPop}
                    setPopCfg={setPopCfg}
                  />
                  {/* The ledger stays OUTSIDE the fold — a collapsed island is
                      exactly its header plus this production list (build 99). */}
                  {ledger.length > 0 && (
                    <div
                      className={"iledger" + (lshut ? " shut" : "")}
                      title="Ticked buildings only, at 100% productivity. Silo'd farms make double and use feed; ⚡/⛽ powered buildings make double. The 👥 resident counts eat at their need rates (rows they touch carry a 👥 chip). Greyed rows are end products (pop goods, construction materials) — the chain balance lives in the dark rows, which should net near 0."
                    >
                      <div className="iledgrow iledghead">
                        <span>
                          <button
                            className="iledgtog"
                            aria-expanded={!lshut}
                            title={lshut ? "Open the ledger" : "Fold the ledger away — its count stays"}
                            onClick={() => toggleLedg(name)}
                          >
                            {lshut ? "▸" : "▾"} Ledger
                            {lshut
                              ? ` · ${ledger.length} row${ledger.length === 1 ? "" : "s"}`
                              : " — t/min at base rates"}
                          </button>
                          {lshut && shortN > 0 && (
                            <span
                              className="isleshort"
                              title="Open the ledger for what to build"
                            >
                              ⚠ {shortN} short
                            </span>
                          )}
                          {/* A SHORT final never hides — count only the healthy ones. */}
                          {!lshut && ledger.some((r) => r.final && r.net > -1e-9) && (
                            <button
                              className="iledgtgl"
                              title="End products (pop goods, construction materials) — the greyed rows. Shorts always show."
                              onClick={toggleFin}
                            >
                              {hideFin
                                ? `show ${ledger.filter((r) => r.final && r.net > -1e-9).length} finals`
                                : "hide finals"}
                            </button>
                          )}
                          {!lshut && ledger.some((r) => Math.abs(r.net) <= 1e-9) && (
                            <button
                              className="iledgtgl"
                              title="Balanced rows (net 0) — hidden, the list is exactly your surpluses and shortfalls."
                              onClick={toggleZero}
                            >
                              {hideZero
                                ? `show ${ledger.filter((r) => Math.abs(r.net) <= 1e-9).length} balanced`
                                : "hide 0s"}
                            </button>
                          )}
                        </span>
                        {!lshut && (
                          <>
                            <span className="num">makes</span>
                            <span className="num">uses</span>
                            <span className="num">net</span>
                          </>
                        )}
                      </div>
                      {!lshut &&
                        ledger
                        .filter((r) => !hideFin || !r.final || r.net < -1e-9)
                        .filter((r) => !hideZero || Math.abs(r.net) > 1e-9)
                        .map((r) => {
                        // Is this flow a ticked link (removable and cappable
                        // here) rather than a ship route (edited in the Ships
                        // tab)? Returns the link itself so the chip can read
                        // its cap.
                        const manual = (from: string, to: string) =>
                          (data.islandLinks || []).find(
                            (l) =>
                              l.good.toLowerCase() === r.name.toLowerCase() &&
                              l.from.toLowerCase() === from.toLowerCase() &&
                              l.to.toLowerCase() === to.toLowerCase()
                          );
                        const exportable = islands.filter(
                          (o) =>
                            o !== name &&
                            !r.exp?.some((d) => d.to.toLowerCase() === o.toLowerCase())
                        );
                        return (
                        <div className={"iledgrow" + (r.final ? " fin" : "")} key={r.name}>
                          <span>
                            <GoodIcon name={r.name} game={game} />
                            {r.name}
                            {r.imp?.map((i) =>
                              manual(i.from, name) ? (
                                <button
                                  key={i.from}
                                  className="trchip"
                                  title={`${fmt(i.tpm)} t/min imported from ${i.from}${i.tpm <= 0 ? " — nothing spare there to send right now" : ""} — press to unlink`}
                                  onClick={() => removeIslandLink(r.name, i.from, name)}
                                >
                                  🚢← {i.from} {fmt(i.tpm)} ✕
                                </button>
                              ) : (
                                <span
                                  key={i.from}
                                  className="trchip"
                                  title={`${fmt(i.tpm)} t/min arrives from ${i.from} by ship route — edit in the Ships tab`}
                                >
                                  🚢← {i.from} {fmt(i.tpm)}
                                </span>
                              )
                            )}
                            {r.exp?.map((e) => {
                              const link = manual(name, e.to);
                              return link ? (
                                // Cappable: the number box holds the link's
                                // cap; grey (the placeholder, what actually
                                // moved) means "everything spare", a typed
                                // number is a ceiling, and what the caps
                                // don't take stays home.
                                <span
                                  key={e.to}
                                  className="trchip trcapchip"
                                  title={`${fmt(e.tpm)} t/min exported to ${e.to}${e.tpm <= 0 ? " — no surplus to send right now" : ""}`}
                                >
                                  🚢→ {e.to}{" "}
                                  <input
                                    className="trcapin"
                                    type="number"
                                    min={0}
                                    step={0.5}
                                    value={link.tpm ?? ""}
                                    placeholder={fmt(e.tpm)}
                                    aria-label={`Cap on ${r.name} to ${e.to}`}
                                    title={`At most this many t/min ride to ${e.to} — empty means everything spare, 0 keeps it all here`}
                                    onChange={(ev) =>
                                      setIslandLinkCap(
                                        r.name,
                                        name,
                                        e.to,
                                        ev.target.value === "" ? null : Math.max(0, Number(ev.target.value))
                                      )
                                    }
                                  />
                                  <button
                                    className="trcapx"
                                    title={`Unlink ${r.name} to ${e.to}`}
                                    onClick={() => removeIslandLink(r.name, name, e.to)}
                                  >
                                    ✕
                                  </button>
                                </span>
                              ) : (
                                <span
                                  key={e.to}
                                  className="trchip"
                                  title={`${fmt(e.tpm)} t/min ships to ${e.to} by route — edit in the Ships tab`}
                                >
                                  🚢→ {e.to} {fmt(e.tpm)}
                                </span>
                              );
                            })}
                            {r.res != null && (
                              <span
                                className="trchip"
                                title={`Residents here eat ${fmt(r.res)} t/min of this — the 👥 counts × per-resident need rates`}
                              >
                                👥 {fmt(r.res)}
                              </span>
                            )}
                            {r.net > 1e-9 && exportable.length > 0 && (
                              <Dropdown
                                className="trlink"
                                ariaLabel={`Export ${r.name} to another island`}
                                title={`Surplus ${r.name} — link it to the island that imports it, and that ledger stops alarming`}
                                placeholder="→ export…"
                                value=""
                                onChange={(v) => v && addIslandLink(r.name, name, v)}
                                options={exportable.map((o) => ({ value: o, label: o }))}
                              />
                            )}
                          </span>
                          <span className="num muted">
                            {r.produced > 0 ? `+${fmt(r.produced)}` : ""}
                          </span>
                          <span className="num muted">
                            {r.used > 0 ? `−${fmt(r.used)}` : ""}
                          </span>
                          <span
                            className={
                              "num net" +
                              (r.net < -1e-9 ? " neg" : r.net > 1e-9 ? " pos" : "")
                            }
                          >
                            {(r.net > 1e-9 ? "+" : r.net < -1e-9 ? "−" : "") +
                              fmt(Math.abs(r.net))}
                          </span>
                        </div>
                        );
                      })}
                      {!lshut && ledger.some((r) => r.fix) && (
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
                  {!shut && (
                    <>
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
                                <span>
                                  <GoodIcon name={r.good} game={game} />
                                  {r.building}
                                </span>
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
                  {/* The full collection panel lives in the 🏛 Culture tab
                      now (build 101) — here just the score and a way there. */}
                  {cul.length > 0 && (
                    <button
                      className="iledger culink"
                      title={
                        cul
                          .map(
                            (a) =>
                              `${a.b.label}: ${a.have}/${a.total} ${a.b.noun}s, ` +
                              `${a.complete}/${a.sets} sets done` +
                              (a.nearly ? `, ${a.nearly} one piece away` : "")
                          )
                          .join(" · ") + " — open the Culture tab to place pieces"
                      }
                      onClick={() => go?.("culture")}
                    >
                      {cul.map((a) => (
                        <span key={a.b.id}>
                          {CULTURE_EMOJI[a.b.id] || "🏛"} {a.have}/{a.total}
                          {a.nearly > 0 && <em className="cuflag">⚑{a.nearly}</em>}
                        </span>
                      ))}
                      <span className="muted">→ 🏛 Culture</span>
                    </button>
                  )}
                  {/* Which deity the island is devoted to (M11c) — 117 only,
                      patronsFor returns null for 1800 and the block hides. */}
                  <PatronBlock island={name} game={game} />
                  {/* What the island came with (build 122) — the region's
                      fertilities and deposits as toggles. Feeds the 🌱 line
                      at the top of the card. */}
                  <FertilityBlock island={name} game={game} region={region} />
                  {/* Who's socketed in the island's item buildings (M11b) —
                      appears once a Trade Union / Town Hall / Harbourmaster's
                      Office / Arctic Lodge (1800) or Villa / Guesthouse (117,
                      M11c) is ticked above. */}
                  <ItemsBlock
                    island={name}
                    items={items}
                    game={game}
                    domId={isleDomId(name)}
                  />

                  {!tuck && (
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
                  )}
                  {!tuck && chips.length > 0 && (
                    <div className="ichips">
                      {chipsOpen[name] ? (
                        <>
                          {chips.map((s) => (
                            <button
                              key={s}
                              className="chip"
                              title={`One press: ${name} has ${s}`}
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
                    </>
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
      )}
      {/* Build 101: the zoo/museum/garden panels, out from under the island
          fold. One island heading, buildings already open, sets one tap away —
          versus the three folds deep they sat on the Islands tab. Tracking is
          still per (island, building): that's what the game pays bonuses on. */}
      {section === "culture" && (
      <div className="card">
        <div className="hd">
          <h2>🏛 Culture Collections</h2>
          <span className="muted">{savedLabel}</span>
        </div>
        <div className="bd doc">
          {cultureByIsle.size === 0 ? (
            <div className="empty">
              Nothing to curate yet — on the 🏝 Islands tab, tick a Zoo, Museum
              or Botanical Garden on an island and its collections appear here.
            </div>
          ) : (
            <>
              {cultureByIsle.size > 1 && (
                <p className="fleetsum cujumps">
                  {[...cultureByIsle].map(([isle, at]) => (
                    <button
                      key={isle}
                      className="chip cujump"
                      title={`Jump to ${isle}'s collections`}
                      onClick={() =>
                        cultRefs.current[isle]?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        })
                      }
                    >
                      <b>{isle}</b>
                      {at.map((a) => (
                        <span key={a.b.id}>
                          {CULTURE_EMOJI[a.b.id] || "🏛"} {a.have}/{a.total}
                          {a.nearly > 0 && <em className="cuflag">⚑{a.nearly}</em>}
                        </span>
                      ))}
                    </button>
                  ))}
                </p>
              )}
              {[...cultureByIsle.keys()].map((isle) => (
                <div
                  key={isle}
                  className="cuisle"
                  ref={(el) => {
                    cultRefs.current[isle] = el;
                  }}
                >
                  <h3 className="cuislehd">🏝 {isle}</h3>
                  <CultureBlock
                    island={isle}
                    items={(data.islandChecks || {})[isle] || []}
                    game={game}
                    flat
                  />
                </div>
              ))}
            </>
          )}
        </div>
      </div>
      )}
      {section === "ships" && <FleetCard game={game} savedLabel={savedLabel} />}
    </div>
  );
}

// What a ship is on (build 76). Deliberately short and tap-only — the fleet
// list answers "where did I leave it and is it busy", not "what is in the hold".
// Game-agnostic: a trade route is a trade route in Rome too.
const TRADE_JOB = "Trade route";
// The one entry that isn't a job but an ending (build 85). A sunk ship stays on
// the list rather than being removed: it's a record of what the pirates took,
// and picking anything else brings it back if you were only marking it lost.
const DESTROYED = "Destroyed";
// …and the other way a ship leaves: sold, scrapped, paid off (build 88). It
// reads the same on the list — out of the fleet, still on the record — but it
// isn't a loss, so it doesn't wear the skull.
const DECOMMISSIONED = "Decommissioned";
const SHIP_JOBS = [
  TRADE_JOB,
  "Expedition",
  "Exploring",
  "Escort",
  // Build 91: the standing job an escort isn't — a warship left circling your
  // own waters rather than tied to a convoy.
  "Patrol",
  "Idle",
  "In for repairs",
  DESTROYED,
  DECOMMISSIONED,
];
const isLost = (s: ShipItem) => (s.doing || "") === DESTROYED;
const isRetired = (s: ShipItem) => (s.doing || "") === DECOMMISSIONED;
/** Off the fleet, however it went: nothing to count, nowhere to be. */
const isGone = (s: ShipItem) => isLost(s) || isRetired(s);
const CLEAR = "__none";

/** Job menu, keeping whatever is already stored even if it isn't one of ours —
 *  a ship that carried free text from build 75 shouldn't lose it silently. */
function jobOptions(cur?: string): { value: string; label: string }[] {
  const out = SHIP_JOBS.map((j) => ({ value: j, label: j }));
  if (cur && !SHIP_JOBS.includes(cur)) out.unshift({ value: cur, label: cur });
  if (cur) out.push({ value: CLEAR, label: "— not saying" });
  return out;
}

/** Where menu: the game's regions, plus at sea for one mid-crossing (build 79).
 *  A region is the honest answer for most ships — you lose track of which ocean
 *  the salvager is on, not which quay it's tied to — and an island is only
 *  really a place a ship *is* when it's running a route between two of them.
 *  Ships that recorded an island before this keep showing it. */
function placeOptions(
  regions: Record<string, string>,
  cur?: string
): { value: string; label: string }[] {
  // Cape Trelawney is one of these now: it has its own island tag, so it is
  // its own place to sail to as well.
  const out = [
    { value: "At sea", label: "At sea" },
    ...Object.values(regions).map((n) => ({ value: n, label: n })),
  ];
  if (cur && !out.some((o) => o.value === cur)) out.unshift({ value: cur, label: cur });
  if (cur) out.push({ value: CLEAR, label: "— not saying" });
  return out;
}

// Sorting the fleet (build 82) — a display order, never the stored one.
const SHIP_SORTS = [
  { key: "added", label: "Added" },
  { key: "name", label: "Name" },
  { key: "type", label: "Type" },
  { key: "where", label: "Where" },
] as const;
type ShipSort = (typeof SHIP_SORTS)[number]["key"];
const FLEET_SORT_KEY = "anno_fleet_sort";
/** Filtering by status (build 91). The bucket for ships you've said nothing
 *  about — they're still a group you'd want to pull up ("what haven't I told
 *  it about?"), so they get a chip rather than being unreachable. */
const NO_JOB = "__nojob";
const shipJob = (s: ShipItem) => (s.doing || "").trim() || NO_JOB;

/** Where a ship counts as being, for sorting: the region you left it in, or
 *  for a trader the island it loads at — a route has no single place. */
function shipPlace(s: ShipItem): string {
  return s.at || s.from || "";
}

function cmpShips(
  sort: ShipSort,
  a: { s: ShipItem; i: number },
  b: { s: ShipItem; i: number }
): number {
  // Sunk ships sit at the bottom whichever way you sort — they're a record,
  // not part of the fleet you're looking through.
  if (isGone(a.s) !== isGone(b.s)) return isGone(a.s) ? 1 : -1;
  if (sort === "added") return a.i - b.i;
  const key = (x: ShipItem) =>
    sort === "name" ? x.name : sort === "type" ? x.type || "" : shipPlace(x);
  const ka = key(a.s);
  const kb = key(b.s);
  // Ships you haven't said anything about go last, whichever way you sort —
  // they're the ones with nothing to compare, not the first thing to read.
  if (!ka !== !kb) return ka ? -1 : 1;
  return ka.localeCompare(kb) || a.s.name.localeCompare(b.s.name) || a.i - b.i;
}

// The fleet (build 75). A card of its own rather than island inventory: ships
// move, and the one you're looking for is the one you can't remember where you
// left. Name is the identity — it's what the game shows you — with the type
// suggested from the game's common ships and a free-text "doing" for the rest
// ("Rum: Manola → Crown Falls", "idle at Ditchwater", "expedition").
function FleetCard({ game, savedLabel }: { game: Game; savedLabel: string }) {
  const { data, addShip, setShip, removeShip } = useCompanion();
  const ships = data.ships || [];
  const islands = data.islands || [];
  const [draft, setDraft] = useState("");
  const [draftType, setDraftType] = useState("");
  // Which row is open for editing, by position. One at a time: the point of
  // build 81 is that the list reads as a list. Adding a ship does NOT open it —
  // the add row already took the two things worth typing.
  const [editing, setEditing] = useState<number | null>(null);
  // How the list is ordered on screen only (build 82). The stored order is
  // never touched, so every row keeps its real position — which is what the
  // edit and remove buttons work on. Remembered across visits, like the island
  // folds, and read after mount because localStorage isn't there on the server.
  const [sort, setSort] = useState<ShipSort>("added");
  useEffect(() => {
    const v = localStorage.getItem(FLEET_SORT_KEY);
    if (v && SHIP_SORTS.some((s) => s.key === v)) setSort(v as ShipSort);
  }, []);
  const sortBy = (k: ShipSort) => {
    setSort(k);
    try {
      localStorage.setItem(FLEET_SORT_KEY, k);
    } catch {}
  };
  // Which status the list is narrowed to, "" for all (build 91). Deliberately
  // NOT remembered across visits the way the sort is: a sort reorders the
  // fleet, a filter hides most of it, and coming back to a filtered list months
  // later reads as ships having gone missing.
  const [job, setJob] = useState("");
  const types = GAME_CONTENT[game].shipTypes;
  const regions = GAME_CONTENT[game].regionLabels;
  // The ship-items pack (M11b), or null for a game with no list — 117 gets no
  // picker, same gate as the island sockets and the culture panel.
  const shipItems = shipSocket(game);
  // One chip per status actually in use, in the menu's own order so the list
  // reads the same way the picker does; anything free-typed follows, and the
  // ships with no status go last.
  const jobCounts = (() => {
    const by = new Map<string, number>();
    for (const s of ships) by.set(shipJob(s), (by.get(shipJob(s)) || 0) + 1);
    const rank = (k: string) => {
      if (k === NO_JOB) return SHIP_JOBS.length + 1;
      const i = SHIP_JOBS.indexOf(k);
      return i < 0 ? SHIP_JOBS.length : i;
    };
    return [...by.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]));
  })();
  // Rows carry their stored position, so sorting can't send an edit to the
  // wrong ship. The row you have open stays on screen whatever the filter says
  // — changing a ship's status is the usual reason it stops matching, and a row
  // vanishing from under the tap that changed it reads as a bug.
  const shown = ships
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => !job || shipJob(s) === job || i === editing)
    .sort((a, b) => cmpShips(sort, a, b));
  const add = () => {
    if (!draft.trim()) return;
    addShip(draft, draftType);
    setDraft("");
    // The type stays: fleets come in batches of the same hull.
  };
  const known = new Set(ships.map((s) => s.name.trim().toLowerCase()));
  const dupe = !!draft.trim() && known.has(draft.trim().toLowerCase());
  // How many of each type, most first. Ships with no type counted together at
  // the end, so the tally still adds up to the fleet.
  const afloat = ships.filter((s) => !isGone(s));
  // Two ways off the list, counted apart: one is a loss, the other a decision.
  const gone = [
    [ships.filter(isLost).length, "lost"],
    [ships.filter(isRetired).length, "retired"],
  ]
    .filter(([n]) => n)
    .map(([n, w]) => `${n} ${w}`)
    .join(" · ");
  const typeCounts = (() => {
    const by = new Map<string, number>();
    // Ships off the fleet are off the tally: "how many clippers have I got"
    // means now, not counting the wrecks and the ones you sold.
    for (const s of afloat) {
      const t = (s.type || "").trim();
      by.set(t, (by.get(t) || 0) + 1);
    }
    return [...by.entries()].sort(
      (a, b) => (!a[0] ? 1 : 0) - (!b[0] ? 1 : 0) || b[1] - a[1] || a[0].localeCompare(b[0])
    );
  })();
  return (
    <div className="card">
      <div className="hd">
        <h2>🚢 Ship Manifest</h2>
        <span className="muted">
          {ships.length
            ? `${afloat.length} ship${afloat.length === 1 ? "" : "s"}${gone ? ` · ${gone}` : ""}`
            : savedLabel}
        </span>
      </div>
      <div className="bd doc">
        {/* What you have, counted by type — the answer to "how many clippers
            have I got" without reading the list (build 83). */}
        {typeCounts.length > 0 && (
          <p className="fleetsum">
            {typeCounts.map(([t, n]) => (
              <span key={t || "?"}>
                {t || "No type"} ×{n}
              </span>
            ))}
          </p>
        )}
        {ships.length > 1 && (
          <div className="chips qfilter">
            <span className="muted fleetsortlbl">Sort by</span>
            {SHIP_SORTS.map((o) => (
              <button
                key={o.key}
                className={"chip" + (sort === o.key ? " on" : "")}
                title={
                  o.key === "added"
                    ? "The order you added them"
                    : o.key === "where"
                      ? "Which region they're in — a trader sorts by where it loads"
                      : `In order of ${o.label.toLowerCase()}`
                }
                onClick={() => sortBy(o.key)}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
        {/* Narrow the list to one status (build 91) — "show me the idle ones"
            is the question a manifest gets asked most. Only worth chips when
            there's more than one status to choose between — or a filter is on,
            since the last ship of a status changing job would otherwise take
            the row of chips away with it and strand you on an empty list. */}
        {(jobCounts.length > 1 || job) && (
          <div className="chips qfilter">
            <span className="muted fleetsortlbl">Show</span>
            <button
              className={"chip" + (job === "" ? " on" : "")}
              title="Every ship, whatever it's doing"
              onClick={() => setJob("")}
            >
              All {ships.length}
            </button>
            {jobCounts.map(([k, n]) => (
              <button
                key={k}
                className={"chip" + (job === k ? " on" : "")}
                title={
                  k === NO_JOB
                    ? "Ships you haven't said what they're doing"
                    : `Only the ships on ${k.toLowerCase()}`
                }
                onClick={() => setJob(job === k ? "" : k)}
              >
                {k === NO_JOB ? "Not saying" : k} {n}
              </button>
            ))}
          </div>
        )}
        {job && !shown.length && (
          <p className="muted">
            No ships on {job === NO_JOB ? "no status" : job.toLowerCase()}.{" "}
            <button className="linkbtn" onClick={() => setJob("")}>
              Show all
            </button>
          </p>
        )}
        {shown.map(({ s, i }) =>
          editing !== i ? (
            // Read view (build 81): a fleet is for scanning, so a ship is one
            // line of plain words until you ask to change it. Empty fields say
            // nothing rather than showing an empty box.
            <div
              className={
                "plitem shiprow shipread" +
                (isGone(s) ? " shipgone" : "") +
                (isLost(s) ? " shiplost" : "")
              }
              key={`${i}:${s.name}`}
            >
              <button
                className="shipsum"
                title={
                  isGone(s)
                    ? `${s.name} is off the fleet — press to put it back`
                    : `Edit ${s.name}`
                }
                onClick={() => setEditing(i)}
              >
                <b>{s.name}</b>
                {s.type && <span className="muted">{s.type}</span>}
                {s.doing && (
                  <span className="shipjob">
                    {isLost(s) ? "☠" : isRetired(s) ? "⚑" : s.doing === TRADE_JOB ? "🚢" : "⚓"}{" "}
                    {s.doing}
                  </span>
                )}
                {/* A ship at the bottom of the sea isn't anywhere and isn't
                    carrying anything, so a lost row says only what it was. The
                    route and hold are kept, and come back if you un-sink it. */}
                {isGone(s) ? null : s.doing === TRADE_JOB ? (
                  (s.from || s.to) && (
                    <span className="shipwhere">
                      🏝 {s.from || "?"} → {s.to || "?"}
                    </span>
                  )
                ) : (
                  s.at && <span className="shipwhere">🌍 {s.at}</span>
                )}
                {!isGone(s) &&
                  (s.cargo || []).map((c) => (
                    <span className="chip schip cargochip" key={c}>
                      <GoodIcon name={c} game={game} />
                      {c}
                    </span>
                  ))}
                {/* Socketed items (M11b) — kept apart from cargo: these are
                    the ship's slots, not its hold, so they show even on a
                    ship that isn't trading. */}
                {!isGone(s) &&
                  (s.items || []).map((n) => {
                    const it = shipItems ? itemIn(shipItems, n) : null;
                    return (
                      <span
                        className={
                          "chip schip cuitem" +
                          (it ? " rar" + it.r.replace(/\W+/g, "") : "")
                        }
                        title={it ? itemTitle(it) : undefined}
                        key={n}
                      >
                        🎖 {n}
                      </span>
                    );
                  })}
              </button>
              <button className="plx" title={`Edit ${s.name}`} onClick={() => setEditing(i)}>
                ✎
              </button>
              {/* One tap for the thing that happens in a hurry (build 87): a
                  ship goes down mid-session and you want it off the count
                  without opening the row and hunting the job menu. Tapping it
                  again puts the ship back — on its route if it still has one,
                  since that's the job whose details the row was hiding. */}
              <button
                className={"plx shipsink" + (isLost(s) ? " on" : "")}
                title={
                  isLost(s)
                    ? `${s.name} is marked lost — put it back in the fleet`
                    : `${s.name} was destroyed`
                }
                aria-pressed={isLost(s)}
                onClick={() =>
                  setShip(i, {
                    doing: !isLost(s)
                      ? DESTROYED
                      : // Back to its route if it still has one, since that's the
                        // job whose details the lost row was hiding.
                        s.from || s.to || (s.cargo || []).length
                        ? TRADE_JOB
                        : "",
                  })
                }
              >
                ☠
              </button>
              <button
                className="plx"
                title={`Remove ${s.name} from the fleet`}
                onClick={() => {
                  if (window.confirm(`Remove ${s.name} from the fleet?`)) {
                    removeShip(i);
                    setEditing(null);
                  }
                }}
              >
                ✕
              </button>
            </div>
          ) : (
          <div className="plitem shiprow" key={`${i}:${s.name}`}>
            <input
              className="shipname"
              defaultValue={s.name}
              aria-label={`Name of ship ${i + 1}`}
              title="What you called it in game"
              onBlur={(e) => setShip(i, { name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
            <input
              className="shiptype"
              placeholder={types.length ? "type…" : "type… e.g. trireme"}
              list={types.length ? "shipTypes" : undefined}
              defaultValue={s.type || ""}
              aria-label={`Type of ${s.name}`}
              title="Which ship it is. Free text — the list is only the common ones."
              onBlur={(e) => setShip(i, { type: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
            {/* Both taps, not typing: what it's on and where you left it. The
                cargo isn't tracked on purpose — you don't need this list to
                tell you what a trader is carrying. */}
            <Dropdown
              className="shipdoing"
              ariaLabel={`What ${s.name} is doing`}
              title="What it's on. Nothing here means you haven't said."
              placeholder="⚓ doing…"
              value={s.doing || ""}
              onChange={(v) => setShip(i, { doing: v === CLEAR ? "" : v })}
              options={jobOptions(s.doing)}
            />
            {/* A trade route is the one job with a real manifest: which two
                islands it runs between and what it carries (build 79).
                Everything else answers with a region, which is the thing you
                actually lose track of. Switching back and forth keeps both —
                nothing is thrown away when the job changes. */}
            {(s.doing || "") === TRADE_JOB ? (
              <>
                {/* Typed, not picked (build 81): plenty of routes run to a
                    neutral trader's harbour or another player, not to an
                    island of yours. Your islands are suggested; anything else
                    you can just write. */}
                <input
                  className="shipfrom"
                  placeholder="🏝 from…"
                  list="fleetPlaces"
                  defaultValue={s.from || ""}
                  aria-label={`Where ${s.name} loads`}
                  title="Where it loads — one of your islands, a neutral trader, anyone."
                  onBlur={(e) => setShip(i, { from: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                />
                <span className="shiparrow" aria-hidden="true">
                  →
                </span>
                <input
                  className="shipto"
                  placeholder="🏝 to…"
                  list="fleetPlaces"
                  defaultValue={s.to || ""}
                  aria-label={`Where ${s.name} delivers`}
                  title="Where it delivers — one of your islands, a neutral trader, anyone."
                  onBlur={(e) => setShip(i, { to: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                />
                {/* One run usually hauls several goods, so cargo is a list of
                    chips with the good's picture on each — tap one to take it
                    off (build 80). */}
                {(s.cargo || []).map((c) => (
                  <button
                    key={c}
                    className="chip schip cargochip"
                    title={`${c} — press to take it off the run`}
                    onClick={() =>
                      setShip(i, { cargo: (s.cargo || []).filter((x) => x !== c) })
                    }
                  >
                    <GoodIcon name={c} game={game} />
                    {c} ✕
                  </button>
                ))}
                {(() => {
                  const carried = new Set((s.cargo || []).map((c) => c.toLowerCase()));
                  const opts = GOOD_NAMES_BY_GAME[game]
                    .filter((g) => !carried.has(g.toLowerCase()))
                    .map((g) => ({ value: g, label: g }));
                  return opts.length ? (
                    <Dropdown
                      className="shipcargo"
                      ariaLabel={`What ${s.name} is carrying`}
                      title="What's in the hold. Add as many goods as the run carries."
                      placeholder="📦 carrying…"
                      value=""
                      onChange={(v) => setShip(i, { cargo: [...(s.cargo || []), v] })}
                      options={opts}
                    />
                  ) : null;
                })()}
              </>
            ) : (
              <Dropdown
                className="shipat"
                ariaLabel={`Where ${s.name} is`}
                title="Which region you left it in — the thing you forget. Put it on a trade route and it asks for the two islands instead."
                placeholder="🌍 where…"
                value={s.at || ""}
                onChange={(v) => setShip(i, { at: v === CLEAR ? "" : v })}
                options={placeOptions(regions, s.at)}
              />
            )}
            {/* What's socketed aboard (M11b) — every ship has slots, whatever
                its job, so this sits outside the trade-route fork. Tap a chip
                to take the item out; the picker groups by rarity and puts the
                effect on the hover, since the name alone rarely says. */}
            {shipItems && (
              <>
                {(s.items || []).map((n) => {
                  const it = itemIn(shipItems, n);
                  return (
                    <button
                      key={n}
                      className={
                        "chip schip cuitem" +
                        (it ? " rar" + it.r.replace(/\W+/g, "") : "")
                      }
                      title={
                        (it ? itemTitle(it) + " — " : "") + "press to take it off the ship"
                      }
                      onClick={() =>
                        setShip(i, { items: (s.items || []).filter((x) => x !== n) })
                      }
                    >
                      🎖 {n} ✕
                    </button>
                  );
                })}
                {(() => {
                  const aboard = new Set((s.items || []).map((n) => n.toLowerCase()));
                  const byRarity = new Map<string, { value: string; label: string; title?: string }[]>();
                  for (const it of shipItems.items) {
                    if (aboard.has(it.n.toLowerCase())) continue;
                    const g = byRarity.get(it.r) || [];
                    g.push({ value: it.n, label: it.n, title: it.fx });
                    byRarity.set(it.r, g);
                  }
                  return byRarity.size ? (
                    <Dropdown
                      className="shipcargo"
                      ariaLabel={`Items socketed in ${s.name}`}
                      title="Who's socketed aboard — captains, navigators, ship items."
                      placeholder="🎖 item…"
                      value=""
                      onChange={(v) => setShip(i, { items: [...(s.items || []), v] })}
                      options={[...byRarity.entries()].map(([r, options]) => ({
                        group: r,
                        options: options.sort((a, b) => a.label.localeCompare(b.label)),
                      }))}
                    />
                  ) : null;
                })()}
              </>
            )}
            <button
              className="linkbtn shipdone"
              title="Done — back to the list"
              onClick={() => setEditing(null)}
            >
              ✓ Done
            </button>
            <button
              className="plx"
              title={`Remove ${s.name} from the fleet`}
              onClick={() => {
                if (window.confirm(`Remove ${s.name} from the fleet?`)) {
                  removeShip(i);
                  setEditing(null);
                }
              }}
            >
              ✕
            </button>
          </div>
          )
        )}
        {/* Route ends: your islands as suggestions only, since the other end
            is as often a neutral trader or another player. */}
        {islands.length > 0 && (
          <datalist id="fleetPlaces">
            {islands.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        )}
        {types.length > 0 && (
          <datalist id="shipTypes">
            {types.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        )}
        <div className="plrow">
          <input
            className="shiptype"
            placeholder="type…"
            list={types.length ? "shipTypes" : undefined}
            value={draftType}
            onChange={(e) => setDraftType(e.target.value)}
          />
          <input
            placeholder="Add ship… name it as the game does (Enter to add)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
          />
          <button
            className="linkbtn"
            disabled={!draft.trim() || dupe}
            title={dupe ? `You already have a ${draft.trim()}` : "Add it to the fleet"}
            onClick={add}
          >
            ＋ Add
          </button>
        </div>
        {!ships.length && (
          <div className="empty">
            No ships yet. Add the ones you keep losing track of — traders on routes, the salvager,
            whatever is off on an expedition.
          </div>
        )}
      </div>
    </div>
  );
}
