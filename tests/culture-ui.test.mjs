// M11 collection panel: renders the real CultureBlock inside the real store in
// jsdom and clicks it the way a player would.
//
// culture.test.cjs already proves the pack and the maths. What this adds is the
// wiring nobody notices until it is wrong: that a tap actually reaches the
// store, lands in the island's own localStorage key, survives a reload, and
// that a game with no culture buildings renders nothing at all rather than an
// empty box.
import { execSync } from "node:child_process";
import { JSDOM } from "jsdom";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const out = path.join(here, "build");

// CultureBlock imports through the @/* alias, so it needs a real tsconfig
// rather than the single-file tsc calls the other packs' tests use.
execSync("npx tsc -p tests/tsconfig.culture.json", { cwd: root, stdio: "inherit" });

// tsc checks the @/* alias but emits the specifier verbatim — Next's bundler
// resolves it in the app, and here it has to be done by hand. The alternative
// was relative imports in the component, i.e. bending the source to suit the
// test harness.
const resolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  return resolve.call(this, req.startsWith("@/") ? path.join(out, req.slice(2)) : req, ...rest);
};

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
// The panel confirms before emptying a building.
let confirmAnswer = true;
dom.window.confirm = () => confirmAnswer;

// A player who has built the zoo on Crown Falls, as the answer to "where do
// they all sit" was: all three, on Crown Falls.
localStorage.setItem("anno_islands", JSON.stringify(["Crown Falls"]));
localStorage.setItem(
  "anno_island_checks",
  JSON.stringify({
    "Crown Falls": [
      { t: "Zoo", done: true },
      { t: "Museum", done: false },
    ],
  })
);

const React = (await import("react")).default;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const S = await import(path.join(out, "lib/store.js"));
const C = await import(path.join(out, "lib/culture.js"));
// CommonJS through ESM interop: `.default` is module.exports, so the component
// is one level further in.
const CB = await import(path.join(out, "components/CultureBlock.js"));
const CultureBlock = CB.default?.default ?? CB.default;

const ITEMS = [
  { t: "Zoo", done: true },
  { t: "Museum", done: false },
];

let api = null;
function Probe() {
  api = S.useCompanion();
  return null;
}

let game = "anno1800";
function App() {
  return React.createElement(
    S.AppProviders,
    null,
    React.createElement(Probe),
    React.createElement(CultureBlock, { island: "Crown Falls", items: ITEMS, game })
  );
}

const r = createRoot(document.getElementById("root"));
await act(async () => {
  r.render(React.createElement(App));
});

const results = [];
const check = (name, cond, detail = "") => results.push({ name, ok: !!cond, detail });
const $ = (sel) => document.querySelectorAll(sel);
const text = () => document.getElementById("root").textContent || "";
const click = async (el) => {
  await act(async () => {
    el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
};

// --- only BUILT buildings show up ---------------------------------------
check("the built Zoo renders", text().includes("Zoo"), text().slice(0, 120));
check("the unbuilt Museum does not", !text().includes("Museum"));
check("only one building panel", $(".cublk").length === 1, String($(".cublk").length));

const zoo = C.CULTURE.find((b) => b.id === "zoo");
const zooTotal = zoo.sets.reduce((n, s) => n + s.items.length, 0) + zoo.loose.length;
check(
  "header counts the whole collection",
  text().includes(`0/${zooTotal}`) && text().includes(`0/${zoo.sets.length} sets`),
  text().slice(0, 160)
);

// --- collapsed by default, opens on tap ----------------------------------
check("starts collapsed", $(".cubd").length === 0);
await click($(".cuhd")[0]);
check("opens on tap", $(".cubd").length === 1);
check(
  "every set is listed",
  $(".cuset").length === zoo.sets.length + 1, // +1 for the no-set fold
  String($(".cuset").length)
);
check("set bodies stay shut", $(".cusetbd").length === 0);

// --- placing a piece -----------------------------------------------------
const target = zoo.sets.find((s) => s.id === "arctic-tundra");
const setIdx = zoo.sets.indexOf(target);
await click($(".cusethd")[setIdx]);
check("a set opens to its pieces", $(".cusetbd").length === 1);
check(
  "the set's effect is shown",
  text().includes(target.effect.slice(0, 24)),
  target.effect.slice(0, 40)
);

const chips = [...$(".cusetbd .cuitem")];
check(
  "one chip per piece",
  chips.length === target.items.length,
  `${chips.length} vs ${target.items.length}`
);
check("nothing placed yet", chips.every((c) => !c.classList.contains("on")));

await click(chips[0]);
check(
  "tapping a chip places the piece",
  (api.data.islandCulture?.["Crown Falls"]?.zoo || []).includes(target.items[0].n),
  JSON.stringify(api.data.islandCulture)
);
check(
  "the chip reads as placed",
  [...$(".cusetbd .cuitem")][0].classList.contains("on")
);
check(
  "the header total moves",
  text().includes(`1/${zooTotal}`) && text().includes(`+${target.items[0].a} attr`),
  text().slice(0, 200)
);
check(
  "it persists under the island's own key",
  (localStorage.getItem("anno_island_culture") || "").includes(target.items[0].n),
  String(localStorage.getItem("anno_island_culture"))
);

// --- completing the set --------------------------------------------------
for (let i = 1; i < target.items.length; i++)
  await click([...$(".cusetbd .cuitem")][i]);
const wantAttr = target.items.reduce((n, i) => n + i.a, 0);
check(
  "a finished set counts as complete",
  text().includes(`1/${zoo.sets.length} sets`) && text().includes(`+${wantAttr} attr`),
  text().slice(0, 200)
);
check("the completed set is ticked", text().includes(`✓ ${target.label}`));

// --- taking one back out -------------------------------------------------
await click([...$(".cusetbd .cuitem")][0]);
check(
  "removing a piece un-completes the set",
  !(api.data.islandCulture?.["Crown Falls"]?.zoo || []).includes(target.items[0].n) &&
    text().includes(`0/${zoo.sets.length} sets`),
  JSON.stringify(api.data.islandCulture)
);
check(
  "the one-piece-away prompt appears",
  text().includes("One piece away") && text().includes(target.items[0].n),
  text().slice(0, 240)
);

// --- the search box ------------------------------------------------------
{
  const find = $(".cufind")[0];
  const setter = Object.getOwnPropertyDescriptor(
    dom.window.HTMLInputElement.prototype,
    "value"
  ).set;
  await act(async () => {
    setter.call(find, target.items[0].n);
    find.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  const shown = [...$(".cuitem")].map((c) => c.textContent);
  check(
    "searching narrows to the piece and opens its set",
    shown.length === 1 && shown[0] === target.items[0].n,
    JSON.stringify(shown).slice(0, 160)
  );
  await act(async () => {
    setter.call(find, "");
    find.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}

// --- emptying ------------------------------------------------------------
await click([...$(".curow .linkbtn")][0]);
check(
  "Empty clears the building",
  !api.data.islandCulture?.["Crown Falls"] && text().includes(`0/${zooTotal}`),
  JSON.stringify(api.data.islandCulture)
);

// --- 117 has no culture buildings ---------------------------------------
await act(async () => api.setIslandCulture("Crown Falls", "zoo", target.items[0].n, true));
game = "anno117";
await act(async () => {
  r.render(React.createElement(App));
});
check("117 renders nothing at all", $(".cuwrap").length === 0, text().slice(0, 80));

// --- and 1800's data survived the trip -----------------------------------
game = "anno1800";
await act(async () => {
  r.render(React.createElement(App));
});
check(
  "1800's collection is untouched by the 117 visit",
  (api.data.islandCulture?.["Crown Falls"]?.zoo || []).includes(target.items[0].n),
  JSON.stringify(api.data.islandCulture)
);
check(
  "117 wrote no culture key of its own",
  !localStorage.getItem("anno117_island_culture"),
  String(localStorage.getItem("anno117_island_culture"))
);

let bad = 0;
for (const t of results) {
  console.log(`${t.ok ? "ok  " : "FAIL"} - ${t.name}${t.ok || !t.detail ? "" : ` (${t.detail})`}`);
  if (!t.ok) bad++;
}
if (bad) {
  console.error(`\n${bad} check(s) failed`);
  process.exit(1);
}
console.log("\nCULTURE PANEL UI VERIFIED");
