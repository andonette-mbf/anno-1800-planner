// M11b socket panels: renders the real ItemsBlock inside the real store in
// jsdom and sockets a specialist the way a player would.
//
// items.test.cjs proves the pack and the lookups. This adds the wiring: a
// typed add reaches the store and the island's own localStorage key, free
// text the pack doesn't know is kept rather than refused, taking an item out
// works, and a game with no item list renders nothing at all. The ship side
// is driven through the store API (setShip carries `items` untouched — no
// comma-splitting, unlike cargo), since the fleet UI reuses the same chips.
import { execSync } from "node:child_process";
import { JSDOM } from "jsdom";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const out = path.join(here, "build");

execSync("npx tsc -p tests/tsconfig.items.json", { cwd: root, stdio: "inherit" });

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
// Empty asks first.
let confirmAnswer = true;
dom.window.confirm = () => confirmAnswer;

// A Trade Union built on Ditchwater; the Town Hall only planned.
localStorage.setItem("anno_islands", JSON.stringify(["Ditchwater"]));
localStorage.setItem(
  "anno_island_checks",
  JSON.stringify({
    Ditchwater: [
      { t: "Trade Union", done: true },
      { t: "Town Hall", done: false },
    ],
  })
);

const React = (await import("react")).default;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const S = await import(path.join(out, "lib/store.js"));
const I = await import(path.join(out, "lib/items.js"));
const IB = await import(path.join(out, "components/ItemsBlock.js"));
const ItemsBlock = IB.default?.default ?? IB.default;

const ITEMS = [
  { t: "Trade Union", done: true },
  { t: "Town Hall", done: false },
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
    React.createElement(ItemsBlock, {
      island: "Ditchwater",
      items: ITEMS,
      game,
      domId: "isle-ditchwater",
    })
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
const valueSetter = Object.getOwnPropertyDescriptor(
  dom.window.HTMLInputElement.prototype,
  "value"
).set;
const type = async (el, v) => {
  await act(async () => {
    valueSetter.call(el, v);
    el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
};
const enter = async (el) => {
  await act(async () => {
    el.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
  });
};

// --- only BUILT sockets show up ------------------------------------------
check("the built Trade Union renders", text().includes("Trade Union"));
check("the unbuilt Town Hall does not", !text().includes("Town Hall"));
check("one socket panel", $(".itsock").length === 1, String($(".itsock").length));
check("it starts empty", text().includes("nothing socketed"));

// --- the datalist offers the pack ----------------------------------------
const tu = I.ITEM_SOCKETS.find((s) => s.id === "tu");
{
  const opts = $("#isle-ditchwater-it-tu option");
  check(
    "datalist carries the whole Trade Union list",
    opts.length === tu.items.length,
    `${opts.length} vs ${tu.items.length}`
  );
}

// --- socketing a specialist ----------------------------------------------
const input = $(".itsock input")[0];
await type(input, "Burner");
await enter(input);
check(
  "Enter sockets the item into the store",
  (api.data.islandItems?.Ditchwater?.tu || []).includes("Burner"),
  JSON.stringify(api.data.islandItems)
);
check("the input clears", input.value === "");
check(
  "the chip shows with its rarity tint",
  [...$(".itsock .cuitem")].some(
    (c) => c.textContent.includes("Burner") && c.classList.contains("rarCommon")
  )
);
check(
  "the chip's hover says what it does",
  ([...$(".itsock .cuitem")].find((c) => c.textContent.includes("Burner"))?.title || "").includes(
    "Productivity: +10%"
  )
);
check(
  "it persists under the island-items key",
  (localStorage.getItem("anno_island_items") || "").includes("Burner"),
  String(localStorage.getItem("anno_island_items"))
);
check(
  "the datalist stops offering what's socketed",
  $("#isle-ditchwater-it-tu option").length === tu.items.length - 1
);

// --- free text the pack doesn't know -------------------------------------
await type(input, "Epona of Nemetona");
await enter(input);
const freeChip = [...$(".itsock .cuitem")].find((c) =>
  c.textContent.includes("Epona of Nemetona")
);
check(
  "an unknown name is kept, untinted",
  !!freeChip && ![...freeChip.classList].some((c) => c.startsWith("rar")),
  freeChip ? [...freeChip.classList].join(" ") : "no chip"
);

// --- taking one out -------------------------------------------------------
await click(freeChip);
check(
  "tapping a chip unsockets it",
  !(api.data.islandItems?.Ditchwater?.tu || []).includes("Epona of Nemetona"),
  JSON.stringify(api.data.islandItems)
);

// --- emptying -------------------------------------------------------------
await click([...$(".ithd .linkbtn")][0]);
check(
  "Empty clears the socket and drops the key",
  !api.data.islandItems?.Ditchwater && text().includes("nothing socketed"),
  JSON.stringify(api.data.islandItems)
);

// --- ship items ride the ship, uncut --------------------------------------
{
  await act(async () => api.addShip("Bianca", "Clipper"));
  // A name with a comma must NOT shear in two the way cargo text does.
  await act(async () =>
    api.setShip(0, { items: ["Handler", "Angela “Meg” Iannucci, Passionate Ornithologist"] })
  );
  const ship = api.data.ships[0];
  check(
    "setShip carries items as a list, commas intact",
    (ship.items || []).length === 2 &&
      ship.items[1] === "Angela “Meg” Iannucci, Passionate Ornithologist",
    JSON.stringify(ship.items)
  );
  check(
    "ship items persist in the fleet key",
    (localStorage.getItem("anno_ships") || "").includes("Handler"),
    String(localStorage.getItem("anno_ships"))
  );
  await act(async () => api.setShip(0, { items: [] }));
  check("emptying the slots drops the field", !("items" in api.data.ships[0]));
}

// --- 117 has no item list --------------------------------------------------
await act(async () => api.setIslandItem("Ditchwater", "tu", "Burner", true));
game = "anno117";
await act(async () => {
  r.render(React.createElement(App));
});
check("117 renders nothing at all", $(".itwrap").length === 0, text().slice(0, 80));

// --- and 1800's placements survived the trip -------------------------------
game = "anno1800";
await act(async () => {
  r.render(React.createElement(App));
});
check(
  "1800's placements are untouched by the 117 visit",
  (api.data.islandItems?.Ditchwater?.tu || []).includes("Burner"),
  JSON.stringify(api.data.islandItems)
);
check(
  "117 wrote no items key of its own",
  !localStorage.getItem("anno117_island_items"),
  String(localStorage.getItem("anno117_island_items"))
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
console.log("\nITEM SOCKETS UI VERIFIED");
