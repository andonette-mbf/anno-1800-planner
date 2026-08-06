// The fleet list (build 75): renders the real Tracker in jsdom and keeps a
// fleet the way a player would — add a ship, say what it's on, rename it, lose
// one.
//
// Ships are named, so the name is the row's identity: what this pins down is
// that a duplicate name is refused rather than quietly making a second row, that
// a blanked name doesn't leave an unidentifiable ship behind, and that the fleet
// lands in the game's own storage key (it's synced state, unlike the island
// folds) without touching the 117 side.
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
// Removing a ship asks first.
let confirmAnswer = true;
dom.window.confirm = () => confirmAnswer;

const React = (await import("react")).default;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const S = await import(path.join(out, "lib/store.js"));
const E = await import(path.join(out, "lib/engine.js"));
const TV = await import(path.join(out, "components/TrackerView.js"));
const TrackerView = TV.TrackerView ?? TV.default?.TrackerView;

const mount = async () => {
  const r = createRoot(document.getElementById("root"));
  await act(async () => {
    r.render(
      React.createElement(
        S.AppProviders,
        null,
        React.createElement(TrackerView, { calcState: E.DEFAULT_STATE })
      )
    );
  });
  return r;
};
let app = await mount();

const results = [];
const check = (name, cond, detail = "") => results.push({ name, ok: !!cond, detail });
const $ = (sel) => [...document.querySelectorAll(sel)];
const fire = async (el, type = "click") => {
  await act(async () => {
    el.dispatchEvent(
      new dom.window[type === "focusout" ? "FocusEvent" : "MouseEvent"](type, { bubbles: true })
    );
  });
};
// The add row's boxes are controlled by React, which tracks their value and
// ignores an event whose value it thinks it already has — so set through the
// native setter, the way a real keystroke does.
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
const rows = () => $(".shiprow");
const addRow = () => $(".card")[2].querySelector(".plrow");
const stored = () => JSON.parse(localStorage.getItem("anno_ships") || "[]");

// --- an empty fleet -------------------------------------------------------
check("the fleet card is there", $(".card").length === 3, String($(".card").length));
check("no ships yet", rows().length === 0);
check(
  "the type box offers the game's ships",
  [...document.querySelectorAll("#shipTypes option")].map((o) => o.value).includes("Clipper"),
  String(document.querySelectorAll("#shipTypes option").length)
);

// --- add one --------------------------------------------------------------
const [typeBox, nameBox] = addRow().querySelectorAll("input");
await setValue(typeBox, "Clipper");
await setValue(nameBox, "Bessie");
await fire(addRow().querySelector("button"));
check("a ship is listed", rows().length === 1, String(rows().length));
check(
  "with the name and type given",
  rows()[0].querySelector(".shipname")?.value === "Bessie" &&
    rows()[0].querySelector(".shiptype")?.value === "Clipper",
  rows()[0].querySelector(".shipname")?.value
);
check("the name box cleared for the next one", addRow().querySelectorAll("input")[1].value === "");
check(
  "the type stayed — fleets come in batches",
  addRow().querySelectorAll("input")[0].value === "Clipper"
);
check(
  "and it is saved",
  stored()[0]?.name === "Bessie" && stored()[0]?.type === "Clipper",
  JSON.stringify(stored())
);

// --- what it's doing ------------------------------------------------------
const doing = rows()[0].querySelector(".shipdoing");
doing.value = "Rum: Manola → Crown Falls";
await fire(doing, "focusout");
check(
  "what it's doing is saved",
  stored()[0]?.doing === "Rum: Manola → Crown Falls",
  JSON.stringify(stored())
);

// --- a name you already own ----------------------------------------------
await setValue(addRow().querySelectorAll("input")[1], "bessie");
check(
  "a name you already have can't be added twice",
  addRow().querySelector("button").disabled,
  "add button should be disabled"
);
await setValue(addRow().querySelectorAll("input")[1], "The Gull");
await fire(addRow().querySelector("button"));
check("a new name adds", rows().length === 2, String(rows().length));

// --- renaming, and refusing to un-name ------------------------------------
const nameCell = rows()[1].querySelector(".shipname");
nameCell.value = "  The Seagull ";
await fire(nameCell, "focusout");
check("renaming works, trimmed", stored()[1]?.name === "The Seagull", JSON.stringify(stored()));
nameCell.value = "   ";
await fire(nameCell, "focusout");
check(
  "a blanked name is refused — the row would be unidentifiable",
  stored()[1]?.name === "The Seagull",
  JSON.stringify(stored())
);

// --- it survives a reload -------------------------------------------------
await act(async () => app.unmount());
document.getElementById("root").innerHTML = "";
app = await mount();
check(
  "the fleet comes back",
  rows().length === 2 && rows()[0].querySelector(".shipdoing")?.value.startsWith("Rum:"),
  rows().map((r) => r.querySelector(".shipname")?.value).join(" | ")
);
check(
  "and it never touched the Rome side",
  !localStorage.getItem("anno117_ships"),
  String(localStorage.getItem("anno117_ships"))
);

// --- losing one -----------------------------------------------------------
confirmAnswer = false;
await fire([...rows()[0].querySelectorAll("button")].find((b) => b.textContent.trim() === "✕"));
check("saying no keeps it", rows().length === 2, String(rows().length));
confirmAnswer = true;
await fire([...rows()[0].querySelectorAll("button")].find((b) => b.textContent.trim() === "✕"));
check(
  "saying yes sinks it",
  rows().length === 1 && stored()[0]?.name === "The Seagull",
  JSON.stringify(stored())
);

let bad = 0;
for (const x of results) {
  console.log(`${x.ok ? "ok  " : "FAIL"} - ${x.name}${x.ok || !x.detail ? "" : "  << " + x.detail}`);
  if (!x.ok) bad++;
}
if (bad) {
  console.error(`\n${bad} check(s) failed`);
  process.exit(1);
}
console.log("\nFLEET LIST VERIFIED");
