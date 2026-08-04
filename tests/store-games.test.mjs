// M10 game switcher: renders the real AppProviders in jsdom and drives it.
//
// The invariant under test is the one that matters most to a player: building a
// Rome todo list must never touch the Anno 1800 save. 1800 keeps the bare
// legacy localStorage keys (/legacy.html still reads them); 117 lives under its
// own `anno117_` namespace.
import { execSync } from "node:child_process";
import { JSDOM } from "jsdom";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const out = path.join(here, "build");

execSync(
  `npx tsc src/lib/store.tsx --outDir tests/build --rootDir src/lib --module commonjs ` +
    `--target es2020 --resolveJsonModule --esModuleInterop --skipLibCheck --jsx react-jsx`,
  { cwd: root, stdio: "inherit" }
);

const dom = new JSDOM("<!doctype html><div id=root></div>", { url: "https://x.test/" });
global.IS_REACT_ACT_ENVIRONMENT = true;
global.window = dom.window;
global.document = dom.window.document;
// Node 24 defines `navigator` as a getter-only global, so hand jsdom's over
// with defineProperty rather than assignment.
Object.defineProperty(global, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
global.localStorage = dom.window.localStorage;
// No server in the test: the auth probe should fail closed to "sync off".
dom.window.fetch = () => Promise.reject(new Error("no server"));
global.fetch = dom.window.fetch;

// A pre-existing 1800 save, as if the player had been using the app for months.
localStorage.setItem(
  "anno_quests",
  JSON.stringify([{ t: "Build the zoo", done: false, added: 1, sess: 0 }])
);
localStorage.setItem("anno_islands", JSON.stringify(["Crown Falls"]));
localStorage.setItem(
  "anno_island_checks",
  JSON.stringify({ "Crown Falls": [{ t: "Sawmill", done: true, n: 3 }] })
);
const before = {
  quests: localStorage.getItem("anno_quests"),
  islands: localStorage.getItem("anno_islands"),
  checks: localStorage.getItem("anno_island_checks"),
};

const React = (await import("react")).default;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const S = await import(path.join(out, "store.js"));

let api = null;
function Probe() {
  api = S.useCompanion();
  return null;
}

const r = createRoot(document.getElementById("root"));
await act(async () => {
  r.render(React.createElement(S.AppProviders, null, React.createElement(Probe)));
});

const results = [];
const check = (name, cond, detail = "") => results.push({ name, ok: !!cond, detail });

check("1800 save loads", api.data.quests[0]?.t === "Build the zoo");
check("opens on 1800", api.game === "anno1800", api.game);

// --- switch to Rome and build a todo list there --------------------------
await act(async () => api.setGame("anno117"));
check(
  "117 starts empty",
  api.data.quests.length === 0 && (api.data.islands || []).length === 0,
  `quests=${api.data.quests.length} islands=${(api.data.islands || []).length}`
);

await act(async () => api.addQuest("Settle Latium"));
await act(async () => api.addIsland("Roma", ["Fishing Hut", "Sawmill"], "la"));
await act(async () => api.addIslandCheck("Roma", "Bakery"));

check("Rome quest added", api.data.quests.some((q) => q.t === "Settle Latium"));
check("Rome island added", (api.data.islands || []).includes("Roma"));
check("Rome island tagged Latium", (api.data.islandRegions || {}).Roma === "la");
check(
  "Rome starter kit seeded unticked",
  (api.data.islandChecks?.Roma || []).some((c) => c.t === "Fishing Hut" && !c.done),
  JSON.stringify((api.data.islandChecks?.Roma || []).map((c) => c.t))
);

// --- the invariant -------------------------------------------------------
check("anno_quests untouched", localStorage.getItem("anno_quests") === before.quests);
check("anno_islands untouched", localStorage.getItem("anno_islands") === before.islands);
check("anno_island_checks untouched", localStorage.getItem("anno_island_checks") === before.checks);
check(
  "117 wrote its own namespace",
  !!localStorage.getItem("anno117_quests")?.includes("Settle Latium"),
  String(localStorage.getItem("anno117_quests"))
);

// --- switch back: 1800 must be exactly as it was -------------------------
await act(async () => api.setGame("anno1800"));
check(
  "1800 intact after round-trip",
  api.data.quests.length === 1 &&
    api.data.quests[0].t === "Build the zoo" &&
    api.data.islands[0] === "Crown Falls",
  JSON.stringify({ q: api.data.quests.map((x) => x.t), i: api.data.islands })
);
check("1800 inventory counts intact", api.data.islandChecks?.["Crown Falls"]?.[0]?.n === 3);
check("game choice persisted", localStorage.getItem("anno_game") === "anno1800");

let bad = 0;
for (const x of results) {
  console.log(`${x.ok ? "ok  " : "FAIL"} - ${x.name}${x.ok || !x.detail ? "" : "  << " + x.detail}`);
  if (!x.ok) bad++;
}
if (bad) {
  console.error(`\n${bad} check(s) failed`);
  process.exit(1);
}
console.log("\nGAME SEPARATION VERIFIED");
