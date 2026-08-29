// Backup & restore (M6): renders the real AppProviders in jsdom and drives a
// save through export → wipe → import the way a player would.
//
// The contract under test: an export is the save verbatim (retired fields
// included), an import lands as a NEW save — never overwriting the one you're
// on — and a hostile or garbage file is refused whole, with no state damage.
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

// A lived-in playthrough touching every field family the export must carry:
// quests (one waiting on a blocker), islands with regions, checks with
// count/silo/electric, a linked plan, culture + socketed items, residents,
// consumption knobs, a ship with comma-named specialists, a trade link — and
// the retired Playbook/Session fields, which round-trip everywhere else.
localStorage.setItem(
  "anno_quests",
  JSON.stringify([
    { t: "Build the zoo", done: false, added: 5, sess: 1 },
    { t: "Lay bricks", done: false, added: 6, sess: 1 },
    { t: "Ship steel", done: false, added: 7, sess: 1, w: true, wq: ["Lay bricks"] },
  ])
);
localStorage.setItem("anno_sessions", "3");
localStorage.setItem("anno_openq_furcoat", "sorted");
localStorage.setItem("anno_focus_phase", "engineers");
localStorage.setItem("anno_shutdown_checks", JSON.stringify([true, false]));
localStorage.setItem("anno_parkinglot", JSON.stringify(["Try airships"]));
localStorage.setItem("anno_islands", JSON.stringify(["Crown Falls", "Manola"]));
localStorage.setItem(
  "anno_island_regions",
  JSON.stringify({ "Crown Falls": "ct", Manola: "nw" })
);
localStorage.setItem(
  "anno_island_checks",
  JSON.stringify({ "Crown Falls": [{ t: "Sheep Farm", done: true, n: 5, s: 3, e: 2 }] })
);
localStorage.setItem(
  "anno_island_plans",
  JSON.stringify({ "Crown Falls": { name: "Steel", st: { sel: {} } } })
);
localStorage.setItem(
  "anno_island_culture",
  JSON.stringify({ "Crown Falls": { zoo: ["Alpaca", "Bear"] } })
);
localStorage.setItem(
  "anno_island_items",
  JSON.stringify({ "Crown Falls": { tu: ["Dario, the Vintner"] } })
);
localStorage.setItem(
  "anno_island_pop",
  JSON.stringify({ "Crown Falls": { farmers: 800, workers: 450 } })
);
localStorage.setItem("anno_pop_cfg", JSON.stringify({ cons: 120, lifestyle: true, band: 1 }));
localStorage.setItem(
  "anno_ships",
  JSON.stringify([
    {
      name: "Fortuna",
      type: "Clipper",
      doing: "Trade route",
      from: "Crown Falls",
      to: "Manola",
      cargo: ["Rum", "Coffee"],
      items: ["Migrant Bundles, Warm Clothes"],
    },
  ])
);
localStorage.setItem(
  "anno_island_links",
  JSON.stringify([{ good: "Steel", from: "Crown Falls", to: "Manola" }])
);

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
const bytes = (d) => JSON.stringify(d);

// --- export ---------------------------------------------------------------
const exported = S.makeSaveExport(api.game, "Main", api.data);
check("wrapper names the app", exported.app === "anno-planner");
check("wrapper carries a version", exported.version === 1);
check("wrapper carries the game", exported.game === "anno1800");
check("wrapper carries the save name", exported.name === "Main");
check("wrapper is dated", !!Date.parse(exported.exportedAt), exported.exportedAt);
check(
  "export keeps the retired fields — it isn't a backup without them",
  exported.data.openq.furcoat === "sorted" &&
    exported.data.focus.phase === "engineers" &&
    exported.data.sessions === 3 &&
    exported.data.parkinglot[0] === "Try airships",
  bytes({ openq: exported.data.openq, sessions: exported.data.sessions })
);

// The file as it would come back from disk.
const fileText = JSON.stringify(exported, null, 2);
const goldenBytes = bytes(exported.data);

// --- parse is a byte-true round trip --------------------------------------
const parsed = S.parseSaveExport(JSON.parse(fileText));
check("a real backup parses", !!parsed);
check("parsed game and name survive", parsed.game === "anno1800" && parsed.name === "Main");
check(
  "normalizing clean data changes nothing — byte-identical round trip",
  bytes(parsed.data) === goldenBytes,
  bytes(parsed.data).slice(0, 200)
);
check(
  "the comma-named ship specialist didn't shear in two",
  parsed.data.ships[0].items.length === 1 &&
    parsed.data.ships[0].items[0] === "Migrant Bundles, Warm Clothes",
  bytes(parsed.data.ships)
);

// --- import lands as a NEW save, current untouched -------------------------
const mainBytesBefore = bytes(api.data);
await act(async () => api.importSave(parsed));
check("a second save appeared", api.saves.length === 2, names());
check(
  "name collision got the (imported) suffix",
  api.saves[1].name === "Main (imported)",
  names()
);
check("the import is now showing", api.saveId === api.saves[1].id);
check("its contents match the file", bytes(api.data) === goldenBytes);
await act(async () => api.setSave(""));
check("Main's bytes never moved", bytes(api.data) === mainBytesBefore);

// A second import of the same file is another sibling, not a replacement.
await act(async () => api.importSave(S.parseSaveExport(JSON.parse(fileText))));
check(
  "importing again makes (imported 2)",
  api.saves.length === 3 && api.saves[2].name === "Main (imported 2)",
  names()
);

// --- export → wipe → import ------------------------------------------------
await act(async () => api.setSave(api.saves[1].id));
await act(async () => api.deleteSave(api.saves[1].id));
await act(async () => api.setSave(api.saves[1].id));
await act(async () => api.deleteSave(api.saves[1].id));
check("back to one save", api.saves.length === 1, names());
await act(async () => api.deleteSave(""));
check("wiped — the tracker is empty", api.data.quests.length === 0 && api.data.islands.length === 0);
await act(async () => api.importSave(S.parseSaveExport(JSON.parse(fileText))));
check(
  "the playthrough came back from the file, byte-identical",
  bytes(api.data) === goldenBytes,
  bytes(api.data).slice(0, 200)
);
// The wiped tracker's fresh "" save is already called Main (the default), so
// the wrapper's name collides and the import sits beside it, suffixed.
check(
  "named from the wrapper, suffixed past the default save",
  api.saves.some((s) => s.name === "Main (imported)"),
  names()
);

// --- a backup from the other game ------------------------------------------
const romeFile = JSON.stringify(
  S.makeSaveExport("anno117", "Latium run", api.data)
);
await act(async () => api.importSave(S.parseSaveExport(JSON.parse(romeFile))));
check("a 117 backup lands in the 117 list and switches to it", api.game === "anno117", api.game);
check("named from its wrapper", api.saves.some((s) => s.name === "Latium run"), names());
check(
  "and it lives on 117 keys",
  !!localStorage.getItem("anno117_saves")?.includes("Latium run"),
  String(localStorage.getItem("anno117_saves"))
);
await act(async () => api.setGame("anno1800"));

// --- hostile / garbage files are refused without damage ---------------------
const before = { saves: names(), data: bytes(api.data) };
const refused = [
  ["not JSON at all → caller catches, parse never sees it", undefined],
  ["null", null],
  ["a number", 42],
  ["an array", [1, 2, 3]],
  ["someone else's file", { app: "other-app", version: 1, game: "anno1800", data: {} }],
  ["a wrapper version this build doesn't know", { app: "anno-planner", version: 2, game: "anno1800", data: {} }],
  ["an unknown game", { app: "anno-planner", version: 1, game: "anno9999", data: {} }],
  ["no data at all", { app: "anno-planner", version: 1, game: "anno1800", name: "X" }],
  ["data that isn't an object", { app: "anno-planner", version: 1, game: "anno1800", data: "quests" }],
];
for (const [label, blob] of refused) {
  if (blob === undefined) continue;
  check(`refused: ${label}`, S.parseSaveExport(blob) === null, JSON.stringify(blob));
}

// Garbage INSIDE a valid wrapper is normalized field by field, never thrown on.
const junk = S.parseSaveExport({
  app: "anno-planner",
  version: 1,
  game: "anno1800",
  name: "  ",
  data: {
    quests: "nope",
    ships: { a: 1 },
    islandChecks: [1, 2],
    islandCulture: 7,
    islandPop: { i: { farmers: "NaN", workers: -5 } },
    popCfg: { cons: 9999, band: 42 },
    islandLinks: [{ good: "Steel", from: "A", to: "A" }],
    evil: { __proto__: { hacked: true } },
  },
});
check("junk fields inside a valid wrapper parse to clean emptiness", !!junk);
check("blank name falls back", junk.name === "Imported save", junk.name);
check(
  "every junk field came out typed and empty",
  junk.data.quests.length === 0 &&
    junk.data.ships.length === 0 &&
    Object.keys(junk.data.islandChecks).length === 0 &&
    Object.keys(junk.data.islandCulture).length === 0 &&
    Object.keys(junk.data.islandPop).length === 0 &&
    junk.data.islandLinks.length === 0,
  bytes(junk.data)
);
check(
  "junk knobs clamp to the sliders' range",
  junk.data.popCfg.cons === 150 && junk.data.popCfg.band === S.DEFAULT_POP_CFG.band,
  bytes(junk.data.popCfg)
);
check("unknown keys are dropped by construction", !("evil" in junk.data));
await act(async () => api.importSave(junk));
await act(async () => {
  const s = api.saves.find((x) => x.name === "Imported save");
  if (s) {
    api.setSave(s.id);
  }
});
check("even a junk import lands as its own empty save", api.data.quests.length === 0);
await act(async () => api.deleteSave(api.saveId));
await act(async () =>
  api.setSave(api.saves.find((s) => s.name === "Main (imported)")?.id ?? "")
);
check("…and the good saves never flinched", bytes(api.data) === before.data);

let bad = 0;
for (const x of results) {
  console.log(`${x.ok ? "ok  " : "FAIL"} - ${x.name}${x.ok || !x.detail ? "" : "  << " + x.detail}`);
  if (!x.ok) bad++;
}
if (bad) {
  console.error(`\n${bad} check(s) failed`);
  process.exit(1);
}
console.log("\nBACKUP ROUND TRIP VERIFIED");
