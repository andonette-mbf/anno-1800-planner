// The fleet list (builds 75/76): renders the real Tracker in jsdom and keeps a
// fleet the way a player would — add a ship, say what it's on and where it is,
// rename it, lose one.
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
// Two islands, so a trade route has both ends to pick from.
localStorage.setItem("anno_islands", JSON.stringify(["Crown Falls", "Ditchwater"]));
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
// A ship added is a ship you read, not a form (build 81).
check(
  "it reads as one line, not a row of boxes",
  rows()[0].classList.contains("shipread") && !rows()[0].querySelector("input"),
  rows()[0].className
);
check(
  "saying its name and type",
  rows()[0].querySelector(".shipsum")?.textContent.includes("Bessie") &&
    rows()[0].querySelector(".shipsum")?.textContent.includes("Clipper"),
  rows()[0].querySelector(".shipsum")?.textContent
);
// ✎ opens the boxes; ✓ Done shuts them again.
const edit = async (row = 0) => {
  if (!rows()[row].querySelector("input"))
    await fire([...rows()[row].querySelectorAll("button")].find((b) => b.textContent.trim() === "✎"));
};
const done = async (row = 0) => {
  const b = [...rows()[row].querySelectorAll("button")].find((x) =>
    x.textContent.trim().startsWith("✓")
  );
  if (b) await fire(b);
};
await edit();
check(
  "editing shows the boxes, filled in",
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

// --- what it's on, and where (build 76: taps, not typing) -----------------
const menuOpen = () => $(".ddpop .ddopt").length > 0;
const pickFrom = async (row, cls, label) => {
  await edit(row);
  if (!menuOpen()) await fire(rows()[row].querySelector(cls));
  const opt = $(".ddpop .ddopt").find((el) => el.textContent.trim() === label);
  if (!opt)
    throw new Error(
      `no "${label}" in: ${$(".ddpop .ddopt").map((e) => e.textContent.trim()).join(" | ")}`
    );
  await fire(opt);
};
await edit();
await fire(rows()[0].querySelector(".shipdoing"));
const jobs = $(".ddpop .ddopt").map((el) => el.textContent.trim());
check(
  "the job menu offers the usual ones",
  jobs.includes("Trade route") && jobs.includes("Idle") && jobs.includes("Expedition"),
  jobs.join(" | ")
);
check("and no cargo to fill in", !rows()[0].querySelector("input.shipdoing"));
await pickFrom(0, ".shipdoing", "Expedition");
check("what it's on is saved", stored()[0]?.doing === "Expedition", JSON.stringify(stored()));

// --- where = the region, not the quay (build 79) --------------------------
await edit();
await fire(rows()[0].querySelector(".shipat"));
const places = $(".ddpop .ddopt").map((el) => el.textContent.trim());
check(
  "Cape Trelawney is offered as its own place",
  places.includes("Cape Trelawney"),
  places.join(" | ")
);
check(
  "the where menu offers the game's regions and at sea",
  places.includes("Old World") && places.includes("New World") && places.includes("At sea"),
  places.join(" | ")
);
check(
  "…and not your islands — that isn't what you forget",
  !places.includes("Crown Falls"),
  places.join(" | ")
);
await pickFrom(0, ".shipat", "New World");
check("where it is is saved", stored()[0]?.at === "New World", JSON.stringify(stored()));

await pickFrom(0, ".shipdoing", "— not saying");
check("a job can be taken back off", !stored()[0]?.doing, JSON.stringify(stored()));

// --- a trade route is the exception: two islands and a manifest -----------
await pickFrom(0, ".shipdoing", "Trade route");
check(
  "a trader asks for both ends and the hold, not a region",
  !!rows()[0].querySelector(".shipfrom") &&
    !!rows()[0].querySelector(".shipto") &&
    !!rows()[0].querySelector(".shipcargo") &&
    !rows()[0].querySelector(".shipat"),
  rows()[0].className
);
await edit();
const ends = [...document.querySelectorAll("#fleetPlaces option")].map((o) => o.value);
check(
  "your islands are suggested for the route's ends",
  ends.includes("Crown Falls") && ends.includes("Ditchwater") && !ends.includes("Old World"),
  ends.join(" | ")
);
// Both ends are typed now (build 81) — a route often runs to a neutral
// trader, not to an island of yours.
await edit();
const typeInto = async (cls, v) => {
  const box = rows()[0].querySelector(cls);
  box.value = v;
  await fire(box, "focusout");
};
await typeInto(".shipfrom", "Ditchwater");
await typeInto(".shipto", "Sir Archibald Blake");
// A run usually carries several goods, so the hold is a list of chips
// (build 80), each with the good's picture on it.
await edit();
await fire(rows()[0].querySelector(".shipcargo"));
const holdOpts = $(".ddpop .ddopt").map((el) => el.textContent.trim());
check("the hold offers the game's goods", holdOpts.includes("Rum"), String(holdOpts.length));
await pickFrom(0, ".shipcargo", "Rum");
await pickFrom(0, ".shipcargo", "Cotton");
check(
  "more than one good can ride the run",
  stored()[0]?.cargo?.join(" | ") === "Rum | Cotton",
  JSON.stringify(stored())
);
check(
  "each is a chip with the good's picture",
  rows()[0].querySelectorAll(".cargochip").length === 2 &&
    !!rows()[0].querySelector(".cargochip img.gicon"),
  String(rows()[0].querySelectorAll(".cargochip").length)
);
check(
  "and a good already aboard isn't offered twice",
  !(await (async () => {
    await fire(rows()[0].querySelector(".shipcargo"));
    const o = $(".ddpop .ddopt").map((el) => el.textContent.trim());
    await fire(document.querySelector(".shipcargo.open"));
    return o;
  })()).includes("Rum")
);
await fire(rows()[0].querySelectorAll(".cargochip")[1]);
check(
  "tapping a chip takes that good off",
  stored()[0]?.cargo?.join(" | ") === "Rum",
  JSON.stringify(stored())
);
await pickFrom(0, ".shipcargo", "Cotton");
check(
  "the whole manifest is saved",
  stored()[0]?.from === "Ditchwater" &&
    stored()[0]?.to === "Sir Archibald Blake" &&
    stored()[0]?.cargo?.join(" | ") === "Rum | Cotton",
  JSON.stringify(stored())
);
check(
  "…and the region it was in is kept, not thrown away by the change of job",
  stored()[0]?.at === "New World",
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
await edit(1);
const nameCell = () => rows()[1].querySelector(".shipname");
nameCell().value = "  The Seagull ";
await fire(nameCell(), "focusout");
check("renaming works, trimmed", stored()[1]?.name === "The Seagull", JSON.stringify(stored()));
nameCell().value = "   ";
await fire(nameCell(), "focusout");
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
  "the fleet comes back, manifest and all",
  // Nothing is open for editing after a reload, so the read line is the proof.
  rows().length === 2 &&
    rows()[0].classList.contains("shipread") &&
    ["Bessie", "Clipper", "Trade route", "Ditchwater", "Sir Archibald Blake"].every((t) =>
      rows()[0].querySelector(".shipsum")?.textContent.includes(t)
    ) &&
    rows()[0].querySelectorAll(".cargochip").length === 2,
  rows()[0].querySelector(".shipsum")?.textContent
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
