"use client";
// Auth + companion (Tracker) state. Only quests/islands/islandChecks have UI
// now — the retired Playbook/Session fields (openq, focus, shutdown,
// parkinglot, sessions) are still loaded/saved so old localStorage and sync
// blobs round-trip.
// localStorage keys are identical to the legacy single-file app, so values saved
// there carry over. When signed in and a DB is configured, state syncs to the
// server: dirty local edits win (last-writer-wins), otherwise newer server wins.
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CalcState } from "./engine";
import { isGame, type Game } from "./games";

export { GAMES, isGame, type Game } from "./games";

export const OQ_KEYS = [
  "furcoat",
  "steelworks_tier",
  "cf_fertilities",
  "cf_minerals",
  "cf_size",
  "mail_income",
  "tourism_income",
] as const;
export const FOCUS_KEYS = ["phase", "working_on", "unfinished", "next", "balance"] as const;
export const SHUTDOWN_COUNT = 6;

const ls = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

// M10: one app, two games. Each keeps its own quests/islands/inventory — a
// Rome playthrough and an 1800 one are separate worlds, not a shared list.
export const GAME_KEY = "anno_game";

// 1800 keeps the bare legacy key names so values saved by the old single-file
// app (and /legacy.html, which still reads them) carry over untouched; 117 gets
// its own namespace. Never change the 1800 side of this.
function gkey(game: Game, base: string): string {
  return game === "anno117" ? base.replace(/^anno_/, "anno117_") : base;
}

// Saves (build 67): one Anno save game = one set of quests/islands/inventory.
// Each game keeps its own list of them. The FIRST save has the id "" and lives
// on the bare keys above — so everything saved before this feature simply
// becomes "Main", nothing moves, and /legacy.html still reads it. Extra saves
// hang off suffixed keys.
export interface SaveMeta {
  id: string;
  name: string;
}
export const DEFAULT_SAVE_NAME = "Main";
const savesKey = (game: Game) => gkey(game, "anno_saves");
const curSaveKey = (game: Game) => gkey(game, "anno_save");
function skey(game: Game, base: string, id: string): string {
  const k = gkey(game, base);
  return id ? `${k}__${id}` : k;
}
function newSaveId(): string {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export interface CheckItem {
  t: string;
  done: boolean;
  n?: number; // count, for building items ("Sheep Farm ×2"); absent = 1
  // How many of the line's n farms have a silo module fitted (bolt-on, animal
  // farms only) — a line can be part-silo'd, e.g. 3 of 5. Absent = none.
  s?: number;
  // How many of the line's n buildings are inside a power plant's radius
  // (Old World only) — same part-line idea as silos. Absent = none.
  e?: number;
}

// A calculator plan linked to an island (M4) — a snapshot taken at link time
// (from a saved plan or the live calculator), so it works offline and
// survives the saved plan being deleted. Re-link to pick up plan edits.
export interface IslandPlan {
  name: string;
  st: CalcState;
}

export interface QuestItem {
  t: string;
  done: boolean;
  added: number; // epoch ms when tracked; 0 = unknown (pre-build-28 items)
  sess: number; // play-session counter value when tracked
  note?: string; // context line (storyline picker entries)
  // Blocked, not abandoned: you reached this task and couldn't do it yet (no
  // bricks, no ship, region not unlocked). Waiting quests sink below the open
  // list and out of the way, keeping the order you built. Absent = actionable.
  w?: boolean;
  wn?: string; // what it's waiting on, free text ("bricks")
  // …or another task in the list, by its text (build 66). Quests have no ids —
  // they're identified by position, which every reorder changes — so the
  // blocker's own text is the only stable handle. Ticking or deleting that
  // task frees this one automatically. Mutually exclusive with `wn`.
  wq?: string;
}

export interface CompanionData {
  openq: Record<string, string>;
  focus: Record<string, string>;
  shutdown: boolean[];
  parkinglot: string[];
  quests: QuestItem[];
  // Play sessions completed so far; a session "ends" when the Shutdown Check
  // is fully ticked. Quest age = sessions - quest.sess.
  sessions: number;
  // The player's island names, for tagging quests with a location.
  islands: string[];
  // Per-island inventory checklists, keyed by island name.
  islandChecks: Record<string, CheckItem[]>;
  // Linked calculator-plan snapshots, keyed by island name (M4).
  islandPlans: Record<string, IslandPlan>;
  // Which world each island is in ("ow"|"nw"|"ar"|"en"), keyed by island
  // name; absent = unknown (pre-build-47 islands) → no datalist filtering.
  islandRegions: Record<string, string>;
  // What is displayed in this island's culture buildings (M11), keyed island →
  // building id ("zoo"|"museum"|"garden") → the item names placed there. Per
  // island because a set only pays out when it is complete in ONE building.
  islandCulture: Record<string, Record<string, string[]>>;
}

// findIndex, but "no match" means "the end" — the insertion point that keeps
// the quest array partitioned open → waiting → done.
function firstIndexOf(quests: QuestItem[], pred: (q: QuestItem) => boolean): number {
  const f = quests.findIndex(pred);
  return f < 0 ? quests.length : f;
}

const qkey = (t: string) => t.trim().toLowerCase();

// Release every quest waiting on `blocker` (build 66) — called when that task
// is ticked off or deleted. Freed quests go to the top of the open list, same
// as unblocking one by hand: what just came free is what to go and do.
function freeBlockedBy(quests: QuestItem[], blocker: string): QuestItem[] {
  const key = qkey(blocker);
  if (!key) return quests;
  const freed: QuestItem[] = [];
  const rest: QuestItem[] = [];
  for (const q of quests) {
    if (!q.done && q.w && qkey(q.wq || "") === key) {
      const n = { ...q };
      delete n.w;
      delete n.wq;
      delete n.wn;
      freed.push(n);
    } else rest.push(q);
  }
  return freed.length ? [...freed, ...rest] : quests;
}

// A task waiting on one that is no longer open — ticked or deleted on another
// device, or dropped by /legacy.html, which doesn't know these fields — has
// nothing left to wait for, so free it on the way in rather than stranding it.
function healBlockers(quests: QuestItem[]): QuestItem[] {
  const open = new Set(quests.filter((q) => !q.done).map((q) => qkey(q.t)));
  return quests.map((q) => {
    if (!q.w || !q.wq || open.has(qkey(q.wq))) return q;
    const n = { ...q };
    delete n.w;
    delete n.wq;
    return n;
  });
}

function parseChecks(raw: unknown): CheckItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => {
      const o = x as { t?: unknown; done?: unknown; n?: unknown; s?: unknown; e?: unknown };
      const n = Math.max(1, Math.floor(Number(o?.n)) || 1);
      // Electrified count (build 52) — no older form to migrate.
      const e = Math.min(n, Math.max(0, Math.floor(Number(o?.e)) || 0));
      let t = String(o?.t ?? "");
      // Silo count; build-39 data stored a boolean (all-or-nothing) — true
      // meant every farm in the line.
      let s = o?.s === true ? n : Math.max(0, Math.floor(Number(o?.s)) || 0);
      // Migrate pre-build-39 "(silo)" name variants to the silo count:
      // "Sheep Farm (silo)" → "Sheep Farm", "Cattle Farm (New World, silo)"
      // → "Cattle Farm (New World)".
      const stripped = t.replace(/ \(silo\)$/i, "").replace(/, silo\)$/i, ")");
      if (stripped !== t) {
        t = stripped;
        s = n;
      }
      s = Math.min(s, n);
      return {
        t,
        done: !!o?.done,
        ...(n > 1 ? { n } : {}),
        ...(s > 0 ? { s } : {}),
        ...(e > 0 ? { e } : {}),
      };
    })
    .filter((x) => x.t);
}

// island → building → placed item names. Names are the identity (they are what
// the game's own item card says), so the only cleaning needed is dropping
// blanks and duplicates; unknown building ids are kept rather than dropped, so
// a future pack that adds a fourth culture building doesn't lose a save made
// by a newer client.
function parseCulture(raw: unknown): Record<string, Record<string, string[]>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, Record<string, string[]>> = {};
  for (const [island, byB] of Object.entries(raw as Record<string, unknown>)) {
    if (!byB || typeof byB !== "object" || Array.isArray(byB)) continue;
    const b: Record<string, string[]> = {};
    for (const [bid, list] of Object.entries(byB as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue;
      const seen = new Set<string>();
      const items: string[] = [];
      for (const raw of list) {
        const s = String(raw).trim();
        if (!s || seen.has(s.toLowerCase())) continue;
        seen.add(s.toLowerCase());
        items.push(s);
      }
      if (items.length) b[bid] = items;
    }
    if (Object.keys(b).length) out[island] = b;
  }
  return out;
}

function loadLocal(game: Game = "anno1800", id = ""): CompanionData {
  const k = (base: string) => skey(game, base, id);
  const openq: Record<string, string> = {};
  for (const key of OQ_KEYS) openq[key] = ls.get(k("anno_openq_" + key)) || "";
  const focus: Record<string, string> = {};
  for (const key of FOCUS_KEYS) focus[key] = ls.get(k("anno_focus_" + key)) || "";
  let shutdown: boolean[] = [];
  let parkinglot: string[] = [];
  let quests: QuestItem[] = [];
  try {
    const s = JSON.parse(ls.get(k("anno_shutdown_checks")) || "[]");
    if (Array.isArray(s)) shutdown = s.map(Boolean);
  } catch {}
  try {
    const p = JSON.parse(ls.get(k("anno_parkinglot")) || "[]");
    if (Array.isArray(p)) parkinglot = p.map(String);
  } catch {}
  const sessions = Math.max(0, Math.floor(Number(ls.get(k("anno_sessions"))) || 0));
  let islands: string[] = [];
  try {
    const il = JSON.parse(ls.get(k("anno_islands")) || "[]");
    if (Array.isArray(il)) islands = il.map(String).filter(Boolean);
  } catch {}
  let islandChecks: Record<string, CheckItem[]> = {};
  try {
    const ic = JSON.parse(ls.get(k("anno_island_checks")) || "{}");
    if (ic && typeof ic === "object" && !Array.isArray(ic))
      islandChecks = Object.fromEntries(
        Object.entries(ic).map(([k, v]) => [k, parseChecks(v)])
      );
  } catch {}
  let islandPlans: Record<string, IslandPlan> = {};
  try {
    const ip = JSON.parse(ls.get(k("anno_island_plans")) || "{}");
    if (ip && typeof ip === "object" && !Array.isArray(ip))
      islandPlans = Object.fromEntries(
        Object.entries(ip).filter(([, v]) => {
          const o = v as { name?: unknown; st?: unknown };
          return !!o && typeof o.name === "string" && !!o.st && typeof o.st === "object";
        })
      ) as Record<string, IslandPlan>;
  } catch {}
  let islandRegions: Record<string, string> = {};
  try {
    const ir = JSON.parse(ls.get(k("anno_island_regions")) || "{}");
    if (ir && typeof ir === "object" && !Array.isArray(ir))
      islandRegions = Object.fromEntries(
        Object.entries(ir).filter(([, v]) => typeof v === "string" && v)
      ) as Record<string, string>;
  } catch {}
  let islandCulture: Record<string, Record<string, string[]>> = {};
  try {
    islandCulture = parseCulture(JSON.parse(ls.get(k("anno_island_culture")) || "{}"));
  } catch {}
  try {
    const q = JSON.parse(ls.get(k("anno_quests")) || "[]");
    if (Array.isArray(q))
      quests = q
        .map((x) => ({
          t: String(x?.t ?? ""),
          done: !!x?.done,
          added: Number(x?.added) || 0,
          // Items from before session-aging start aging from now.
          sess: Number.isFinite(Number(x?.sess)) ? Number(x.sess) : sessions,
          ...(x?.note ? { note: String(x.note) } : {}),
          ...(x?.w && !x?.done ? { w: true } : {}),
          ...(x?.wn ? { wn: String(x.wn) } : {}),
          ...(x?.wq ? { wq: String(x.wq) } : {}),
        }))
        .filter((x) => x.t);
    quests = healBlockers(quests);
  } catch {}
  return {
    openq,
    focus,
    shutdown,
    parkinglot,
    quests,
    sessions,
    islands,
    islandChecks,
    islandPlans,
    islandRegions,
    islandCulture,
  };
}

function saveLocal(d: CompanionData, game: Game = "anno1800", id = "") {
  const k = (base: string) => skey(game, base, id);
  for (const key of OQ_KEYS) ls.set(k("anno_openq_" + key), d.openq[key] || "");
  for (const key of FOCUS_KEYS) ls.set(k("anno_focus_" + key), d.focus[key] || "");
  ls.set(k("anno_shutdown_checks"), JSON.stringify(d.shutdown));
  ls.set(k("anno_parkinglot"), JSON.stringify(d.parkinglot));
  ls.set(k("anno_quests"), JSON.stringify(d.quests));
  ls.set(k("anno_sessions"), String(d.sessions || 0));
  ls.set(k("anno_islands"), JSON.stringify(d.islands || []));
  ls.set(k("anno_island_checks"), JSON.stringify(d.islandChecks || {}));
  ls.set(k("anno_island_plans"), JSON.stringify(d.islandPlans || {}));
  ls.set(k("anno_island_regions"), JSON.stringify(d.islandRegions || {}));
  ls.set(k("anno_island_culture"), JSON.stringify(d.islandCulture || {}));
}

const EMPTY_DATA: CompanionData = {
  openq: {},
  focus: {},
  shutdown: [],
  parkinglot: [],
  quests: [],
  sessions: 0,
  islands: [],
  islandChecks: {},
  islandPlans: {},
  islandRegions: {},
  islandCulture: {},
};

/** One game's saves: the list (never empty), which one is showing, and the
 *  data behind each. */
export interface GameSaves {
  list: SaveMeta[];
  cur: string;
  data: Record<string, CompanionData>;
}

function safeJSON(raw: string | null): unknown {
  try {
    return JSON.parse(raw || "null");
  } catch {
    return null;
  }
}

function parseSaveList(raw: unknown): SaveMeta[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: SaveMeta[] = [];
  for (const x of raw) {
    const o = x as { id?: unknown; name?: unknown };
    if (typeof o?.id !== "string" || seen.has(o.id)) continue;
    seen.add(o.id);
    out.push({ id: o.id, name: String(o?.name ?? "").trim() || DEFAULT_SAVE_NAME });
  }
  return out;
}

/** Read every save of one game. A browser that predates saves has no list key,
 *  and yields the single "" save holding whatever sits on the bare keys — so an
 *  existing playthrough becomes "Main" without anything being moved. The list
 *  key, once written, is authoritative: a deleted "" save stays deleted. */
function loadGame(game: Game): GameSaves {
  const stored = parseSaveList(safeJSON(ls.get(savesKey(game))));
  const list = stored.length ? stored : [{ id: "", name: DEFAULT_SAVE_NAME }];
  const want = ls.get(curSaveKey(game)) ?? "";
  const data: Record<string, CompanionData> = {};
  for (const s of list) data[s.id] = loadLocal(game, s.id);
  return { list, cur: list.some((s) => s.id === want) ? want : list[0].id, data };
}

function saveGameList(game: Game, g: GameSaves) {
  ls.set(savesKey(game), JSON.stringify(g.list));
  ls.set(curSaveKey(game), g.cur);
}

function saveGame(game: Game, g: GameSaves) {
  saveGameList(game, g);
  for (const s of g.list) if (g.data[s.id]) saveLocal(g.data[s.id], game, s.id);
}

const EMPTY_GAME: GameSaves = {
  list: [{ id: "", name: DEFAULT_SAVE_NAME }],
  cur: "",
  data: { "": EMPTY_DATA },
};

// The synced blob stays 1800-shaped at the top level — an older client (or an
// older blob) round-trips unchanged — with 117 hanging off `g117`. Build 67
// adds every save under `saves`; the top-level fields stay a mirror of the
// first save, so a client that predates saves still finds the main playthrough.
interface SyncBlob extends CompanionData {
  g117?: CompanionData;
  saves?: Partial<Record<Game, GameSaves>>;
}
function toBlob(all: Record<Game, GameSaves>): SyncBlob {
  const first = (g: GameSaves) => g.data[""] ?? g.data[g.cur] ?? EMPTY_DATA;
  return {
    ...first(all.anno1800),
    g117: first(all.anno117),
    saves: { anno1800: all.anno1800, anno117: all.anno117 },
  };
}
function fromBlob(blob: SyncBlob, local: Record<Game, GameSaves>): Record<Game, GameSaves> {
  const { g117, saves, ...rest } = blob;
  const norm = (d: CompanionData) => ({
    ...d,
    // Server blobs bypass loadLocal, so re-run item normalization (e.g. the
    // legacy "(silo)" name → silo-flag migration).
    islandChecks: Object.fromEntries(
      Object.entries(d.islandChecks || {}).map(([k, v]) => [k, parseChecks(v)])
    ),
    islandCulture: parseCulture(d.islandCulture),
    quests: healBlockers(d.quests || []),
  });
  const forGame = (game: Game, legacy: CompanionData | undefined): GameSaves => {
    const lo = local[game];
    const srv = saves?.[game];
    const list = parseSaveList(srv?.list);
    if (list.length) {
      const data: Record<string, CompanionData> = {};
      for (const s of list)
        data[s.id] = norm({ ...(lo.data[s.id] || EMPTY_DATA), ...(srv?.data?.[s.id] || {}) });
      const cur = srv && list.some((s) => s.id === srv.cur) ? srv.cur : list[0].id;
      return { list, cur, data };
    }
    // A blob written before saves existed knows only the default one. Merge it
    // into "" and keep any saves this browser has, rather than dropping them.
    if (!legacy) return lo;
    return {
      list: lo.list.some((s) => s.id === "")
        ? lo.list
        : [{ id: "", name: DEFAULT_SAVE_NAME }, ...lo.list],
      cur: lo.cur,
      data: { ...lo.data, "": norm({ ...(lo.data[""] || EMPTY_DATA), ...legacy }) },
    };
  };
  return {
    anno1800: forGame("anno1800", rest as CompanionData),
    anno117: forGame("anno117", g117),
  };
}

// ---------- auth ----------

type AuthStatus = "loading" | "off" | "anon" | "authed";

interface AuthCtx {
  status: AuthStatus;
  db: boolean;
  login: (password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx>({
  status: "loading",
  db: false,
  login: async () => false,
  logout: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

// ---------- companion ----------

interface CompanionCtx {
  data: CompanionData;
  /** Which game the Tracker is showing. Everything in `data` belongs to it. */
  game: Game;
  setGame: (g: Game) => void;
  /** The current game's saves — one per Anno save game, in menu order. */
  saves: SaveMeta[];
  /** Which one the Tracker is showing; "" is the original save. */
  saveId: string;
  setSave: (id: string) => void;
  /** Start an empty save and switch to it. */
  addSave: (name: string) => void;
  /** Copy the current save under a new name and switch to it. */
  duplicateSave: (name: string) => void;
  renameSave: (id: string, name: string) => void;
  /** Delete a save and its contents; refuses to remove the last one. */
  deleteSave: (id: string) => void;
  sync: "local" | "syncing" | "synced" | "error";
  setOpenq: (k: string, v: string) => void;
  setFocus: (k: string, v: string) => void;
  setShutdown: (i: number, v: boolean) => void;
  resetShutdown: () => void;
  addParking: (t: string) => void;
  removeParking: (i: number) => void;
  addQuest: (t: string, note?: string) => void;
  toggleQuest: (i: number, done: boolean) => void;
  setQuestWaiting: (i: number, w: boolean) => void;
  setQuestWaitNote: (i: number, wn: string) => void;
  removeQuest: (i: number) => void;
  swapQuests: (i: number, j: number) => void;
  moveQuestAfter: (from: number, to: number) => void;
  clearDoneQuests: () => void;
  addIsland: (name: string, seed?: string[], region?: string) => void;
  setIslandRegion: (island: string, region: string | null) => void;
  removeIsland: (name: string) => void;
  addIslandCheck: (island: string, t: string) => void;
  toggleIslandCheck: (island: string, i: number, v: boolean) => void;
  removeIslandCheck: (island: string, i: number) => void;
  bumpIslandCheck: (island: string, i: number, delta: 1 | -1) => void;
  setIslandSilo: (island: string, i: number, count: number) => void;
  setIslandElec: (island: string, i: number, count: number) => void;
  seedIslandChecks: (island: string, seed: { t: string; n: number }[]) => void;
  setIslandPlan: (island: string, plan: IslandPlan | null) => void;
  /** Put a culture item into (or take it out of) an island's zoo/museum/
   *  garden. `item` is the piece's display name, as the pack lists it. */
  setIslandCulture: (
    island: string,
    building: string,
    item: string,
    on: boolean
  ) => void;
  /** Empty one culture building on one island. */
  clearIslandCulture: (island: string, building: string) => void;
}

const CompanionContext = createContext<CompanionCtx | null>(null);

export function useCompanion(): CompanionCtx {
  const c = useContext(CompanionContext);
  if (!c) throw new Error("useCompanion outside provider");
  return c;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [db, setDb] = useState(false);
  // Both games are held at once, with all their saves: the Tracker shows one,
  // but a sync push has to carry everything or switching games (or saves) would
  // clobber the other's server copy.
  const [all, setAll] = useState<Record<Game, GameSaves>>({
    anno1800: EMPTY_GAME,
    anno117: EMPTY_GAME,
  });
  const [game, setGameState] = useState<Game>("anno1800");
  const gs = all[game];
  const data = gs.data[gs.cur] ?? EMPTY_DATA;
  const [sync, setSync] = useState<CompanionCtx["sync"]>("local");
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canSync = useRef(false);

  // Initial local load + auth probe.
  useEffect(() => {
    setAll({ anno1800: loadGame("anno1800"), anno117: loadGame("anno117") });
    const g = ls.get(GAME_KEY);
    if (isGame(g)) setGameState(g);
    (async () => {
      try {
        const r = await fetch("/api/auth");
        const j = await r.json();
        setDb(!!j.db);
        if (!j.auth || !j.db) return setStatus("off");
        setStatus(j.authed ? "authed" : "anon");
      } catch {
        setStatus("off");
      }
    })();
  }, []);

  const push = useCallback((next: Record<Game, GameSaves>) => {
    if (!canSync.current) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(async () => {
      try {
        setSync("syncing");
        const r = await fetch("/api/state", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ data: toBlob(next) }),
        });
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        ls.set("anno_sync_ts", String(j.updatedAt));
        ls.set("anno_dirty", "");
        setSync("synced");
      } catch {
        ls.set("anno_dirty", "1");
        setSync("error");
      }
    }, 1200);
  }, []);

  // On sign-in: reconcile local vs server.
  useEffect(() => {
    if (status !== "authed") {
      canSync.current = false;
      return;
    }
    (async () => {
      try {
        setSync("syncing");
        const r = await fetch("/api/state");
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        const localTs = Number(ls.get("anno_sync_ts") || 0);
        const dirty = ls.get("anno_dirty") === "1";
        canSync.current = true;
        const local = {
          anno1800: loadGame("anno1800"),
          anno117: loadGame("anno117"),
        };
        if (j.data && !dirty && j.updatedAt > localTs) {
          const merged = fromBlob(j.data as SyncBlob, local);
          setAll(merged);
          saveGame("anno1800", merged.anno1800);
          saveGame("anno117", merged.anno117);
          ls.set("anno_sync_ts", String(j.updatedAt));
          setSync("synced");
        } else {
          // Local is authoritative (dirty, newer, or server empty) — push it.
          push(local);
        }
      } catch {
        setSync("error");
      }
    })();
  }, [status, push]);

  const update = useCallback(
    (fn: (d: CompanionData) => CompanionData) => {
      setAll((prev) => {
        const g = prev[game];
        const cur = g.cur;
        const one = fn(g.data[cur] ?? EMPTY_DATA);
        const next = {
          ...prev,
          [game]: { ...g, data: { ...g.data, [cur]: one } },
        } as Record<Game, GameSaves>;
        saveLocal(one, game, cur);
        if (canSync.current) push(next);
        else ls.set("anno_dirty", "1");
        return next;
      });
    },
    [push, game]
  );

  // Save-list edits (add / rename / delete / switch). Same persistence path as
  // `update`, but they rewrite the list rather than one save's contents.
  const updateSaves = useCallback(
    (fn: (g: GameSaves) => GameSaves) => {
      setAll((prev) => {
        const g = fn(prev[game]);
        const next = { ...prev, [game]: g } as Record<Game, GameSaves>;
        saveGame(game, g);
        if (canSync.current) push(next);
        else ls.set("anno_dirty", "1");
        return next;
      });
    },
    [push, game]
  );

  const setGame = useCallback((g: Game) => {
    setGameState(g);
    ls.set(GAME_KEY, g);
  }, []);

  const companion = useMemo<CompanionCtx>(
    () => ({
      data,
      game,
      setGame,
      saves: gs.list,
      saveId: gs.cur,
      setSave: (id) =>
        updateSaves((g) => (g.list.some((s) => s.id === id) ? { ...g, cur: id } : g)),
      addSave: (name) =>
        updateSaves((g) => {
          const id = newSaveId();
          return {
            list: [...g.list, { id, name: name.trim() || `Save ${g.list.length + 1}` }],
            cur: id,
            data: { ...g.data, [id]: EMPTY_DATA },
          };
        }),
      duplicateSave: (name) =>
        updateSaves((g) => {
          const id = newSaveId();
          const from = g.list.find((s) => s.id === g.cur)?.name ?? DEFAULT_SAVE_NAME;
          return {
            list: [...g.list, { id, name: name.trim() || `${from} copy` }],
            cur: id,
            data: { ...g.data, [id]: g.data[g.cur] ?? EMPTY_DATA },
          };
        }),
      renameSave: (id, name) =>
        updateSaves((g) => ({
          ...g,
          list: g.list.map((s) => (s.id === id ? { ...s, name: name.trim() || s.name } : s)),
        })),
      deleteSave: (id) =>
        updateSaves((g) => {
          // The last save can't go — there'd be nothing to show.
          if (g.list.length < 2 || !g.list.some((s) => s.id === id)) return g;
          const list = g.list.filter((s) => s.id !== id);
          const data = { ...g.data };
          delete data[id];
          // saveGame only writes the surviving saves, so blank this one's keys
          // by hand. For "" that also empties what /legacy.html reads.
          saveLocal(EMPTY_DATA, game, id);
          return { list, cur: g.cur === id ? list[0].id : g.cur, data };
        }),
      sync,
      setOpenq: (k, v) => update((d) => ({ ...d, openq: { ...d.openq, [k]: v } })),
      setFocus: (k, v) => update((d) => ({ ...d, focus: { ...d.focus, [k]: v } })),
      setShutdown: (i, v) =>
        update((d) => {
          const s = Array.from({ length: SHUTDOWN_COUNT }, (_, j) => !!d.shutdown[j]);
          const wasComplete = s.every(Boolean);
          s[i] = v;
          const sessionEnded = !wasComplete && s.every(Boolean);
          return {
            ...d,
            shutdown: s,
            sessions: (d.sessions || 0) + (sessionEnded ? 1 : 0),
          };
        }),
      resetShutdown: () =>
        update((d) => ({ ...d, shutdown: Array(SHUTDOWN_COUNT).fill(false) })),
      addParking: (t) =>
        t.trim() ? update((d) => ({ ...d, parkinglot: [...d.parkinglot, t.trim()] })) : undefined,
      removeParking: (i) =>
        update((d) => ({ ...d, parkinglot: d.parkinglot.filter((_, j) => j !== i) })),
      addQuest: (t, note) =>
        t.trim()
          ? update((d) => ({
              ...d,
              quests: [
                ...d.quests,
                {
                  t: t.trim(),
                  done: false,
                  added: Date.now(),
                  sess: d.sessions || 0,
                  ...(note ? { note } : {}),
                },
              ],
            }))
          : undefined,
      toggleQuest: (i, done) =>
        update((d) => {
          if (i < 0 || i >= d.quests.length) return d;
          // Keep the array partitioned open → waiting → done: ticking sinks the
          // quest to the bottom (out of the way, completions read in order),
          // unticking re-surfaces it at the end of the open list, above the
          // waiting block. Ticking also clears the block — it can't still be
          // waiting on bricks once it's built.
          let quests = d.quests.slice();
          const [q] = quests.splice(i, 1);
          const at = done ? quests.length : firstIndexOf(quests, (x) => !!x.w || x.done);
          const next = { ...q, done };
          if (done) {
            delete next.w;
            delete next.wn;
            delete next.wq;
          }
          quests.splice(at, 0, next);
          // Anything queued behind this task frees itself the moment it's done.
          if (done) quests = freeBlockedBy(quests, q.t);
          return { ...d, quests };
        }),
      // Park a quest you can't do yet (build 60). Waiting sinks it to the
      // bottom of the waiting block — below everything actionable, above the
      // completed ones — and unblocking puts it back on top, because the thing
      // you were just unblocked on is the thing to go and do.
      setQuestWaiting: (i, w) =>
        update((d) => {
          if (i < 0 || i >= d.quests.length || d.quests[i].done) return d;
          const quests = d.quests.slice();
          const [q] = quests.splice(i, 1);
          const next = { ...q };
          if (w) next.w = true;
          else {
            delete next.w;
            delete next.wn;
            delete next.wq;
          }
          quests.splice(w ? firstIndexOf(quests, (x) => x.done) : 0, 0, next);
          return { ...d, quests };
        }),
      // One box, two meanings: name another task in the list and this one waits
      // on it (and frees itself when that one is ticked); anything else is just
      // a note about what you're short of. Matching on text is what makes the
      // link survive every reorder — see QuestItem.wq.
      setQuestWaitNote: (i, wn) =>
        update((d) => {
          if (i < 0 || i >= d.quests.length) return d;
          const quests = d.quests.slice();
          const next = { ...quests[i] };
          const s = wn.trim();
          const blocker = s
            ? quests.find((x, j) => j !== i && !x.done && qkey(x.t) === qkey(s))
            : undefined;
          delete next.wn;
          delete next.wq;
          if (blocker) next.wq = blocker.t;
          else if (s) next.wn = s;
          quests[i] = next;
          return { ...d, quests };
        }),
      // Deleting a task frees whatever was queued behind it — better than
      // leaving those waiting on something that is no longer in the list.
      removeQuest: (i) =>
        update((d) => {
          if (i < 0 || i >= d.quests.length) return d;
          const gone = d.quests[i];
          return {
            ...d,
            quests: freeBlockedBy(
              d.quests.filter((_, j) => j !== i),
              gone.t
            ),
          };
        }),
      swapQuests: (i, j) =>
        update((d) => {
          if (i < 0 || j < 0 || i >= d.quests.length || j >= d.quests.length || i === j)
            return d;
          const quests = d.quests.slice();
          [quests[i], quests[j]] = [quests[j], quests[i]];
          return { ...d, quests };
        }),
      // Move the quest at `from` to sit immediately after the one at `to`,
      // leaving everything between in order — "send to bottom" passes the
      // last visible open quest, so filtered and hidden rows stay put.
      moveQuestAfter: (from, to) =>
        update((d) => {
          if (from < 0 || to < 0 || from >= d.quests.length || to >= d.quests.length)
            return d;
          const quests = d.quests.slice();
          const [q] = quests.splice(from, 1);
          quests.splice((to > from ? to - 1 : to) + 1, 0, q);
          return { ...d, quests };
        }),
      clearDoneQuests: () =>
        update((d) => ({ ...d, quests: d.quests.filter((q) => !q.done) })),
      addIsland: (name, seed, region) => {
        const n = name.trim();
        if (!n) return;
        update((d) => {
          if ((d.islands || []).some((x) => x.toLowerCase() === n.toLowerCase())) return d;
          const next = { ...d, islands: [...(d.islands || []), n] };
          // Starter tasks for the island's region, unticked — they show as
          // red gaps until built, then stay as inventory.
          if (seed?.length)
            next.islandChecks = {
              ...(d.islandChecks || {}),
              [n]: seed.map((t) => ({ t, done: false })),
            };
          if (region)
            next.islandRegions = { ...(d.islandRegions || {}), [n]: region };
          return next;
        });
      },
      setIslandRegion: (island, region) =>
        update((d) => {
          const islandRegions = { ...(d.islandRegions || {}) };
          if (region) islandRegions[island] = region;
          else delete islandRegions[island];
          return { ...d, islandRegions };
        }),
      removeIsland: (name) =>
        update((d) => {
          const n = name.trim().toLowerCase();
          const islandChecks = { ...(d.islandChecks || {}) };
          for (const k of Object.keys(islandChecks))
            if (k.toLowerCase() === n) delete islandChecks[k];
          const islandPlans = { ...(d.islandPlans || {}) };
          for (const k of Object.keys(islandPlans))
            if (k.toLowerCase() === n) delete islandPlans[k];
          const islandRegions = { ...(d.islandRegions || {}) };
          for (const k of Object.keys(islandRegions))
            if (k.toLowerCase() === n) delete islandRegions[k];
          const islandCulture = { ...(d.islandCulture || {}) };
          for (const k of Object.keys(islandCulture))
            if (k.toLowerCase() === n) delete islandCulture[k];
          return {
            ...d,
            islands: (d.islands || []).filter((x) => x.toLowerCase() !== n),
            islandChecks,
            islandPlans,
            islandRegions,
            islandCulture,
          };
        }),
      addIslandCheck: (island, t) => {
        const item = t.trim();
        if (!item) return;
        update((d) => {
          const cur = (d.islandChecks || {})[island] || [];
          const at = cur.findIndex((c) => c.t.toLowerCase() === item.toLowerCase());
          // Re-adding an existing item bumps its count ("Sheep Farm ×2").
          const next =
            at >= 0
              ? cur.map((c, j) =>
                  j === at ? { ...c, done: true, n: (c.n || 1) + 1 } : c
                )
              : [...cur, { t: item, done: true }];
          return {
            ...d,
            islandChecks: { ...(d.islandChecks || {}), [island]: next },
          };
        });
      },
      toggleIslandCheck: (island, i, v) =>
        update((d) => ({
          ...d,
          islandChecks: {
            ...(d.islandChecks || {}),
            [island]: ((d.islandChecks || {})[island] || []).map((c, j) =>
              j === i ? { ...c, done: v } : c
            ),
          },
        })),
      removeIslandCheck: (island, i) =>
        update((d) => ({
          ...d,
          islandChecks: {
            ...(d.islandChecks || {}),
            [island]: ((d.islandChecks || {})[island] || []).filter((_, j) => j !== i),
          },
        })),
      bumpIslandCheck: (island, i, delta) =>
        update((d) => ({
          ...d,
          islandChecks: {
            ...(d.islandChecks || {}),
            [island]: ((d.islandChecks || {})[island] || []).map((c, j) => {
              if (j !== i) return c;
              const n = Math.max(1, (c.n || 1) + delta);
              const s = Math.min(c.s || 0, n); // fewer farms can't keep more silos
              const e = Math.min(c.e || 0, n); // ditto for powered buildings
              const { n: _n, s: _s, e: _e, ...rest } = c;
              return {
                ...rest,
                ...(n > 1 ? { n } : {}),
                ...(s > 0 ? { s } : {}),
                ...(e > 0 ? { e } : {}),
              };
            }),
          },
        })),
      setIslandSilo: (island, i, count) =>
        update((d) => ({
          ...d,
          islandChecks: {
            ...(d.islandChecks || {}),
            [island]: ((d.islandChecks || {})[island] || []).map((c, j) => {
              if (j !== i) return c;
              const s = Math.max(0, Math.min(Math.floor(count), c.n || 1));
              const { s: _s, ...rest } = c;
              return s > 0 ? { ...rest, s } : rest;
            }),
          },
        })),
      setIslandElec: (island, i, count) =>
        update((d) => ({
          ...d,
          islandChecks: {
            ...(d.islandChecks || {}),
            [island]: ((d.islandChecks || {})[island] || []).map((c, j) => {
              if (j !== i) return c;
              const e = Math.max(0, Math.min(Math.floor(count), c.n || 1));
              const { e: _e, ...rest } = c;
              return e > 0 ? { ...rest, e } : rest;
            }),
          },
        })),
      // Append buildings the island doesn't list yet as UNTICKED items — red
      // gaps to build, same pattern as the region starter kits (M7b: seeding
      // an island from its linked plan).
      seedIslandChecks: (island, seed) =>
        update((d) => {
          const cur = (d.islandChecks || {})[island] || [];
          const have = new Set(cur.map((c) => c.t.trim().toLowerCase()));
          const add = seed
            .filter((x) => x.t.trim() && !have.has(x.t.trim().toLowerCase()))
            .map((x) => ({
              t: x.t.trim(),
              done: false,
              ...(x.n > 1 ? { n: Math.floor(x.n) } : {}),
            }));
          if (!add.length) return d;
          return {
            ...d,
            islandChecks: { ...(d.islandChecks || {}), [island]: [...cur, ...add] },
          };
        }),
      setIslandPlan: (island, plan) =>
        update((d) => {
          const islandPlans = { ...(d.islandPlans || {}) };
          if (plan) islandPlans[island] = plan;
          else delete islandPlans[island];
          return { ...d, islandPlans };
        }),
      setIslandCulture: (island, building, item, on) => {
        const name = item.trim();
        if (!name) return;
        update((d) => {
          const all = { ...(d.islandCulture || {}) };
          const cur = all[island]?.[building] || [];
          const has = cur.some((x) => x.toLowerCase() === name.toLowerCase());
          if (on === has) return d;
          const next = on
            ? [...cur, name]
            : cur.filter((x) => x.toLowerCase() !== name.toLowerCase());
          const byB = { ...(all[island] || {}) };
          // Empty lists are dropped rather than stored, so an island that owns
          // nothing leaves no key behind in the synced blob.
          if (next.length) byB[building] = next;
          else delete byB[building];
          if (Object.keys(byB).length) all[island] = byB;
          else delete all[island];
          return { ...d, islandCulture: all };
        });
      },
      clearIslandCulture: (island, building) =>
        update((d) => {
          const all = { ...(d.islandCulture || {}) };
          if (!all[island]?.[building]) return d;
          const byB = { ...all[island] };
          delete byB[building];
          if (Object.keys(byB).length) all[island] = byB;
          else delete all[island];
          return { ...d, islandCulture: all };
        }),
    }),
    [data, game, gs, setGame, sync, update, updateSaves]
  );

  const auth = useMemo<AuthCtx>(
    () => ({
      status,
      db,
      login: async (password: string) => {
        try {
          const r = await fetch("/api/auth", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ password }),
          });
          if (r.ok) {
            setStatus("authed");
            return true;
          }
        } catch {}
        return false;
      },
      logout: async () => {
        try {
          await fetch("/api/auth", { method: "DELETE" });
        } catch {}
        canSync.current = false;
        setStatus("anon");
        setSync("local");
      },
    }),
    [status, db]
  );

  return (
    <AuthContext.Provider value={auth}>
      <CompanionContext.Provider value={companion}>{children}</CompanionContext.Provider>
    </AuthContext.Provider>
  );
}
