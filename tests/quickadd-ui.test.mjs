// Quick add (build 86): renders the real calculator-page widget in jsdom and
// uses it the way a player does mid-plan — "I've just built a sawmill", "I've
// just bought a clipper" — then checks it landed in the list the tab owns.
//
// The point of the widget is that it writes into the SAME storage the Islands
// and Ships tabs read, so what this pins down is the wiring: the right key, the
// right island, the count bumping on a repeat, and the pointer back to the tab
// that now holds it.
import { execSync } from "node:child_process";
import { JSDOM } from "jsdom";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const out = path.join(here, "build");

execSync("npx tsc -p tests/tsconfig.quests.json", { cwd: root, stdio: "inherit" });

const resolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  return resolve.call(this, req.startsWith("@/") ? path.join(out, req.slice(2)) : req, ...rest);
};

const dom = new JSDOM("<!doctype html><div id=root></div>", { url: "https://x.test/" });
global.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.Element.prototype.scrollIntoView = function () {};
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
global.localStorage = dom.window.localStorage;
dom.window.fetch = () => Promise.reject(new Error("no server"));
global.fetch = dom.window.fetch;
// Two islands in two regions, so the suggestions have to follow the pick.
localStorage.setItem("anno_islands", JSON.stringify(["Ditchwater", "Manola"]));
localStorage.setItem("anno_island_regions", JSON.stringify({ Ditchwater: "ow", Manola: "nw" }));

const React = (await import("react")).default;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const S = await import(path.join(out, "lib/store.js"));
const QA = await import(path.join(out, "components/QuickAdd.js"));
const QuickAdd = QA.QuickAdd ?? QA.default;

// Where the "go and look" button would send you.
let went = null;
const app = createRoot(document.getElementById("root"));
await act(async () => {
  app.render(
    React.createElement(
      S.AppProviders,
      null,
      React.createElement(QuickAdd, { go: (t) => (went = t) })
    )
  );
});

const results = [];
const check = (name, cond, detail = "") => results.push({ name, ok: !!cond, detail });
const $ = (sel) => [...document.querySelectorAll(sel)];
const fire = async (el, type = "click") => {
  await act(async () => {
    el.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true }));
  });
};
// The boxes are controlled by React, which ignores an event carrying a value it
// thinks it already has — so set through the native setter, as a keystroke does.
const nativeValue = Object.getOwnPropertyDescriptor(
  dom.window.HTMLInputElement.prototype,
  "value"
).set;
const setValue = async (el, v) => {
  nativeValue.call(el, v);
  await act(async () => {
    el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
};
const kindChip = (label) =>
  $(".qakind .chip").find((b) => b.textContent.trim().endsWith(label));
const addBtn = () => $(".qaadd")[0];
const nameBox = () => document.querySelector(".qaname");
const said = () => document.querySelector(".qasaid")?.textContent || "";
const checks = () => JSON.parse(localStorage.getItem("anno_island_checks") || "{}");
const ships = () => JSON.parse(localStorage.getItem("anno_ships") || "[]");
const options = (id) => [...document.querySelectorAll(`#${id} option`)].map((o) => o.value);
const pickIsland = async (label) => {
  await fire(document.querySelector(".qaisle"));
  const opt = $(".ddpop .ddopt").find((el) => el.textContent.trim() === label);
  if (!opt)
    throw new Error(`no island "${label}" in: ${$(".ddpop .ddopt").map((e) => e.textContent.trim()).join(" | ")}`);
  await fire(opt);
};

// --- it opens on buildings, ready to type --------------------------------
check("the widget is there", !!document.querySelector(".qacard"));
check("both kinds are offered", !!kindChip("Building") && !!kindChip("Ship"));
check(
  "buildings first — the common one mid-plan",
  kindChip("Building")?.classList.contains("on"),
  kindChip("Ship")?.className
);
check("nothing to add until you type", addBtn().disabled);

// --- a building goes to the island you picked ----------------------------
check(
  "the box suggests that island's buildings",
  options("qaBuildings").includes("Sawmill"),
  `${options("qaBuildings").length} offered`
);
await setValue(nameBox(), "Sawmill");
await fire(addBtn());
check(
  "it lands in the first island's inventory",
  checks()["Ditchwater"]?.some((c) => c.t === "Sawmill"),
  JSON.stringify(checks())
);
check("the box clears for the next one", nameBox().value === "");
check(
  "and it says where it went, with a way to look",
  said().includes("Sawmill") && said().includes("Ditchwater"),
  said()
);
await fire(document.querySelector(".qasaid .linkbtn"));
check("the pointer goes to the Islands tab", went === "islands", String(went));

// Adding the same building again is how you count four sawmills.
await setValue(nameBox(), "Sawmill");
await fire(addBtn());
check(
  "adding it twice counts two, rather than listing it twice",
  checks()["Ditchwater"]?.filter((c) => c.t === "Sawmill").length === 1 &&
    checks()["Ditchwater"]?.find((c) => c.t === "Sawmill")?.n === 2,
  JSON.stringify(checks()["Ditchwater"])
);

// --- switching island switches what it offers ----------------------------
await pickIsland("Manola");
check(
  // Sawmills exist in both worlds, so the proof is a plantation the Old World
  // can't have, and a bakery the New World can't.
  "a New World island suggests New World buildings",
  options("qaBuildings").includes("Caoutchouc Plantation") &&
    !options("qaBuildings").includes("Bakery"),
  `${options("qaBuildings").length} offered`
);
await setValue(nameBox(), "Caoutchouc Plantation");
await fire(addBtn());
check(
  "it goes to that island, not the first one",
  checks()["Manola"]?.some((c) => c.t === "Caoutchouc Plantation") &&
    !checks()["Ditchwater"]?.some((c) => c.t === "Caoutchouc Plantation"),
  JSON.stringify(checks())
);

// --- ×N adds N in one tap -------------------------------------------------
await setValue(nameBox(), "Fire Station");
await setValue(document.querySelector(".qacount"), "3");
await fire(addBtn());
check(
  "×3 lands as a count of three",
  checks()["Manola"]?.find((c) => c.t === "Fire Station")?.n === 3,
  JSON.stringify(checks()["Manola"])
);
check("the count box clears with the name", document.querySelector(".qacount").value === "");

// --- residents: island, number and what -----------------------------------
await fire(kindChip("Residents"));
check("the name box goes away for residents", !document.querySelector(".qaname"));
check("nothing to set until a tier is picked", addBtn().disabled);
const pickTier = async (label) => {
  await fire(document.querySelector(".qatier"));
  const opt = $(".ddpop .ddopt").find((el) => el.textContent.trim() === label);
  if (!opt)
    throw new Error(
      `no tier "${label}" in: ${$(".ddpop .ddopt").map((e) => e.textContent.trim()).join(" | ")}`
    );
  await fire(opt);
};
// Manola is New World, so the tiers on offer are its own, not Farmers.
await fire(document.querySelector(".qatier"));
const nwTiers = $(".ddpop .ddopt").map((e) => e.textContent.trim());
check(
  "a New World island offers New World tiers",
  nwTiers.includes("Jornaleros") && !nwTiers.includes("Farmers"),
  nwTiers.join(" | ")
);
await fire($(".ddpop .ddopt").find((el) => el.textContent.trim() === "Jornaleros"));
// Switching island to another region strands the pick — it must reset, not
// quietly file Jornaleros onto an Old World island.
await pickIsland("Ditchwater");
check("a region switch clears the stranded tier", addBtn().disabled);
await pickTier("Farmers");
await setValue(document.querySelector(".qanum"), "500");
await fire(addBtn());
const pops = () => JSON.parse(localStorage.getItem("anno_island_pop") || "{}");
check(
  "the headcount lands on the island's tier",
  pops()["Ditchwater"]?.farmers === 500,
  JSON.stringify(pops())
);
check("and it says so", said().includes("Ditchwater") && said().includes("500"), said());
// Setting again REPLACES — it's a transcription, not an addition.
await setValue(document.querySelector(".qanum"), "650");
await fire(addBtn());
check("setting again replaces the count", pops()["Ditchwater"]?.farmers === 650, JSON.stringify(pops()));
check(
  "the current count shows as the placeholder",
  document.querySelector(".qanum").placeholder === "650",
  document.querySelector(".qanum").placeholder
);

// --- a ship joins the fleet ----------------------------------------------
await fire(kindChip("Ship"));
check("the island picker goes away", !document.querySelector(".qaisle"));
check(
  "the type box offers the game's ships",
  options("qaShipTypes").includes("Clipper"),
  `${options("qaShipTypes").length} offered`
);
await setValue(document.querySelector(".qatype"), "Clipper");
await setValue(nameBox(), "Bessie");
await fire(addBtn());
check(
  "it joins the fleet, with its type",
  ships()[0]?.name === "Bessie" && ships()[0]?.type === "Clipper",
  JSON.stringify(ships())
);
check("the type stays — fleets come in batches", document.querySelector(".qatype").value === "Clipper");
check(
  "and it points at the Ships tab",
  said().includes("Bessie") && said().includes("fleet"),
  said()
);
await fire(document.querySelector(".qasaid .linkbtn"));
check("which is where it sends you", went === "ships", String(went));

// --- a name you already own ----------------------------------------------
await setValue(nameBox(), "bessie");
check("the same ship can't be added twice", addBtn().disabled, "add should be disabled");
check(
  "…and it says why",
  document.body.textContent.includes("already have a ship called that"),
  ""
);
check("only one Bessie is stored", ships().length === 1, JSON.stringify(ships()));

// --- nothing was written anywhere else ------------------------------------
check(
  "the Rome side is untouched",
  !localStorage.getItem("anno117_ships") && !localStorage.getItem("anno117_island_checks"),
  String(localStorage.getItem("anno117_ships"))
);

await act(async () => app.unmount());

let bad = 0;
for (const x of results) {
  console.log(`${x.ok ? "ok  " : "FAIL"} - ${x.name}${x.ok || !x.detail ? "" : "  << " + x.detail}`);
  if (!x.ok) bad++;
}
if (bad) {
  console.error(`\n${bad} check(s) failed`);
  process.exit(1);
}
console.log("\nQUICK ADD VERIFIED");
