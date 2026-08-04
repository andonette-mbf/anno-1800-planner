"use client";
// Auth + companion (Playbook/Session) state.
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

export interface QuestItem {
  t: string;
  done: boolean;
  added: number; // epoch ms when tracked; 0 = unknown (pre-build-28 items)
  sess: number; // play-session counter value when tracked
  note?: string; // context line (storyline picker entries)
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
}

function loadLocal(): CompanionData {
  const openq: Record<string, string> = {};
  for (const k of OQ_KEYS) openq[k] = ls.get("anno_openq_" + k) || "";
  const focus: Record<string, string> = {};
  for (const k of FOCUS_KEYS) focus[k] = ls.get("anno_focus_" + k) || "";
  let shutdown: boolean[] = [];
  let parkinglot: string[] = [];
  let quests: QuestItem[] = [];
  try {
    const s = JSON.parse(ls.get("anno_shutdown_checks") || "[]");
    if (Array.isArray(s)) shutdown = s.map(Boolean);
  } catch {}
  try {
    const p = JSON.parse(ls.get("anno_parkinglot") || "[]");
    if (Array.isArray(p)) parkinglot = p.map(String);
  } catch {}
  const sessions = Math.max(0, Math.floor(Number(ls.get("anno_sessions")) || 0));
  let islands: string[] = [];
  try {
    const il = JSON.parse(ls.get("anno_islands") || "[]");
    if (Array.isArray(il)) islands = il.map(String).filter(Boolean);
  } catch {}
  try {
    const q = JSON.parse(ls.get("anno_quests") || "[]");
    if (Array.isArray(q))
      quests = q
        .map((x) => ({
          t: String(x?.t ?? ""),
          done: !!x?.done,
          added: Number(x?.added) || 0,
          // Items from before session-aging start aging from now.
          sess: Number.isFinite(Number(x?.sess)) ? Number(x.sess) : sessions,
          ...(x?.note ? { note: String(x.note) } : {}),
        }))
        .filter((x) => x.t);
  } catch {}
  return { openq, focus, shutdown, parkinglot, quests, sessions, islands };
}

function saveLocal(d: CompanionData) {
  for (const k of OQ_KEYS) ls.set("anno_openq_" + k, d.openq[k] || "");
  for (const k of FOCUS_KEYS) ls.set("anno_focus_" + k, d.focus[k] || "");
  ls.set("anno_shutdown_checks", JSON.stringify(d.shutdown));
  ls.set("anno_parkinglot", JSON.stringify(d.parkinglot));
  ls.set("anno_quests", JSON.stringify(d.quests));
  ls.set("anno_sessions", String(d.sessions || 0));
  ls.set("anno_islands", JSON.stringify(d.islands || []));
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
  sync: "local" | "syncing" | "synced" | "error";
  setOpenq: (k: string, v: string) => void;
  setFocus: (k: string, v: string) => void;
  setShutdown: (i: number, v: boolean) => void;
  resetShutdown: () => void;
  addParking: (t: string) => void;
  removeParking: (i: number) => void;
  addQuest: (t: string, note?: string) => void;
  toggleQuest: (i: number, done: boolean) => void;
  removeQuest: (i: number) => void;
  moveQuest: (i: number, dir: -1 | 1) => void;
  clearDoneQuests: () => void;
  addIsland: (name: string) => void;
  removeIsland: (name: string) => void;
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
  const [data, setData] = useState<CompanionData>({
    openq: {},
    focus: {},
    shutdown: [],
    parkinglot: [],
    quests: [],
    sessions: 0,
    islands: [],
  });
  const [sync, setSync] = useState<CompanionCtx["sync"]>("local");
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canSync = useRef(false);

  // Initial local load + auth probe.
  useEffect(() => {
    setData(loadLocal());
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

  const push = useCallback((d: CompanionData) => {
    if (!canSync.current) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(async () => {
      try {
        setSync("syncing");
        const r = await fetch("/api/state", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ data: d }),
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
        if (j.data && !dirty && j.updatedAt > localTs) {
          const local = loadLocal();
          const merged: CompanionData = { ...local, ...(j.data as Partial<CompanionData>) };
          setData(merged);
          saveLocal(merged);
          ls.set("anno_sync_ts", String(j.updatedAt));
          setSync("synced");
        } else {
          // Local is authoritative (dirty, newer, or server empty) — push it.
          push(loadLocal());
        }
      } catch {
        setSync("error");
      }
    })();
  }, [status, push]);

  const update = useCallback(
    (fn: (d: CompanionData) => CompanionData) => {
      setData((prev) => {
        const next = fn(prev);
        saveLocal(next);
        if (canSync.current) push(next);
        else ls.set("anno_dirty", "1");
        return next;
      });
    },
    [push]
  );

  const companion = useMemo<CompanionCtx>(
    () => ({
      data,
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
        update((d) => ({
          ...d,
          quests: d.quests.map((q, j) => (j === i ? { ...q, done } : q)),
        })),
      removeQuest: (i) =>
        update((d) => ({ ...d, quests: d.quests.filter((_, j) => j !== i) })),
      moveQuest: (i, dir) =>
        update((d) => {
          const j = i + dir;
          if (j < 0 || j >= d.quests.length) return d;
          const quests = d.quests.slice();
          [quests[i], quests[j]] = [quests[j], quests[i]];
          return { ...d, quests };
        }),
      clearDoneQuests: () =>
        update((d) => ({ ...d, quests: d.quests.filter((q) => !q.done) })),
      addIsland: (name) => {
        const n = name.trim();
        if (!n) return;
        update((d) =>
          (d.islands || []).some((x) => x.toLowerCase() === n.toLowerCase())
            ? d
            : { ...d, islands: [...(d.islands || []), n] }
        );
      },
      removeIsland: (name) =>
        update((d) => ({
          ...d,
          islands: (d.islands || []).filter(
            (x) => x.toLowerCase() !== name.trim().toLowerCase()
          ),
        })),
    }),
    [data, sync, update]
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
