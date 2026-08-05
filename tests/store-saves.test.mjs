// Saves (build 67): renders the real AppProviders in jsdom and drives the save
// list the way a player would — start a second playthrough, switch back, rename,
// duplicate, delete.
//
// The invariant that matters is the same one store-games.test.mjs guards for
// games, one level down: the playthrough you already had must not move. It
// becomes the first save ("Main") ON THE BARE KEYS — untouched bytes, still
// readable by /legacy.html — and every extra save lives on suffixed keys.
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
Object.defineProperty(global, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
global.localStorage = dom.window.localStorage;
dom.window.fetch = () => Promise.reject(new Error("no server"));
global.fetch = dom.window.fetch;

// Months of play, saved before this feature existed: no save list anywhere.
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
const names = () => api.saves.map((s) => s.name).join(" | ");

// --- what an existing player sees on the first load ----------------------
check("one save to start", api.saves.length === 1, names());
check("it is the original, id ''", api.saves[0].id === "", JSON.stringify(api.saves[0]));
check("named Main", api.saves[0].name === "Main", names());
check("showing it", api.saveId === "");
check("holding the existing playthrough", api.data.quests[0]?.t === "Build the zoo");

// --- a second playthrough ------------------------------------------------
await act(async () => api.addSave("Second run"));
const second = api.saveId;
check("switched to the new save", second !== "" && names() === "Main | Second run", names());
check(
  "new save starts empty",
  api.data.quests.length === 0 && (api.data.islands || []).length === 0,
  `quests=${api.data.quests.length}`
);

await act(async () => api.addQuest("Settle the New World"));
await act(async () => api.addIsland("Manola", [], "nw"));
check("second save takes its own quests", api.data.quests[0]?.t === "Settle the New World");
check(
  "and writes to its own keys",
  localStorage.getItem(`anno_quests__${second}`)?.includes("Settle the New World"),
  String(localStorage.getItem(`anno_quests__${second}`))
);

// THE invariant: the original playthrough's bytes never moved.
check("anno_quests untouched", localStorage.getItem("anno_quests") === before.quests);
check("anno_islands untouched", localStorage.getItem("anno_islands") === before.islands);
check("anno_island_checks untouched", localStorage.getItem("anno_island_checks") === before.checks);

// --- switching back -------------------------------------------------------
await act(async () => api.setSave(""));
check(
  "Main is exactly as it was",
  api.data.quests.length === 1 &&
    api.data.quests[0].t === "Build the zoo" &&
    api.data.islands[0] === "Crown Falls" &&
    api.data.islandChecks?.["Crown Falls"]?.[0]?.n === 3,
  JSON.stringify({ q: api.data.quests.map((x) => x.t), i: api.data.islands })
);
check("the two saves don't bleed", !api.data.quests.some((q) => q.t === "Settle the New World"));
check("current save persisted", localStorage.getItem("anno_save") === "");
check(
  "save list persisted",
  JSON.parse(localStorage.getItem("anno_saves") || "[]").length === 2,
  String(localStorage.getItem("anno_saves"))
);

// --- rename ---------------------------------------------------------------
await act(async () => api.renameSave("", "Crown Falls run"));
check("renamed", names() === "Crown Falls run | Second run", names());
check(
  "rename persisted",
  localStorage.getItem("anno_saves")?.includes("Crown Falls run"),
  String(localStorage.getItem("anno_saves"))
);
check("rename left the contents alone", api.data.quests[0]?.t === "Build the zoo");

// --- duplicate ------------------------------------------------------------
await act(async () => api.duplicateSave("Experiment"));
const copy = api.saveId;
check("copy is current", names() === "Crown Falls run | Second run | Experiment", names());
check("copy carries the contents", api.data.quests[0]?.t === "Build the zoo");
await act(async () => api.addQuest("Try a different layout"));
check("copy is independent once edited", api.data.quests.length === 2);
await act(async () => api.setSave(""));
check(
  "the original didn't gain the copy's quest",
  api.data.quests.length === 1 && api.data.quests[0].t === "Build the zoo",
  JSON.stringify(api.data.quests.map((x) => x.t))
);

// --- saves are per game ---------------------------------------------------
await act(async () => api.setGame("anno117"));
check("117 has its own single save", api.saves.length === 1 && api.saveId === "", names());
await act(async () => api.addSave("Latium run"));
await act(async () => api.addQuest("Settle Latium"));
check(
  "117 saves live in the 117 namespace",
  !!localStorage.getItem("anno117_saves")?.includes("Latium run"),
  String(localStorage.getItem("anno117_saves"))
);
check(
  "and never touch the 1800 list",
  !localStorage.getItem("anno_saves")?.includes("Latium run"),
  String(localStorage.getItem("anno_saves"))
);
await act(async () => api.setGame("anno1800"));
check("1800's save list survived the game switch", names().startsWith("Crown Falls run"), names());

// --- delete ---------------------------------------------------------------
await act(async () => api.setSave(copy));
await act(async () => api.deleteSave(copy));
check("deleted", !api.saves.some((s) => s.id === copy), names());
check("fell back to another save", api.saveId === "" && api.data.quests[0]?.t === "Build the zoo");
check(
  "its keys were emptied",
  JSON.parse(localStorage.getItem(`anno_quests__${copy}`) || "[]").length === 0,
  String(localStorage.getItem(`anno_quests__${copy}`))
);
await act(async () => api.deleteSave(second));
check("down to one", api.saves.length === 1, names());
await act(async () => api.deleteSave(""));
check("the last save can't be deleted", api.saves.length === 1 && api.saveId === "", names());
check("and its contents are still there", api.data.quests[0]?.t === "Build the zoo");

let bad = 0;
for (const x of results) {
  console.log(`${x.ok ? "ok  " : "FAIL"} - ${x.name}${x.ok || !x.detail ? "" : "  << " + x.detail}`);
  if (!x.ok) bad++;
}
if (bad) {
  console.error(`\n${bad} check(s) failed`);
  process.exit(1);
}
console.log("\nSAVE SEPARATION VERIFIED");
