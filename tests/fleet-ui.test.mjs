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
        React.createElement(TrackerView, { calcState: E.DEFAULT_STATE, section: "ships" })
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
const addRow = () => $(".card")[0].querySelector(".plrow");
const stored = () => JSON.parse(localStorage.getItem("anno_ships") || "[]");

// --- an empty fleet -------------------------------------------------------
// Ships are their own tab now (build 84), so this view is that card alone.
check("the ship card is there", $(".card").length === 1, String($(".card").length));
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

// --- the tally at the top (build 83) --------------------------------------
const tally = () => $(".card")[0].querySelector(".fleetsum")?.textContent || "";
// Both were added as Clippers — the add row keeps the type between adds.
check("it counts what you own by type", tally().includes("Clipper ×2"), tally());

// --- sorting (build 82) ---------------------------------------------------
// Bessie is a Clipper on a route out of Ditchwater; The Seagull has neither a
// type nor a place. Sorting must reorder what you SEE without sending an edit
// to the wrong ship.
const names = () => rows().map((r) => r.querySelector(".shipsum b")?.textContent);
// Give the second ship a type that sorts BEFORE the first one's, so sorting by
// type has to flip the order rather than leaving it as added.
await edit(1);
const t2 = rows()[1].querySelector(".shiptype");
t2.value = "Cargo Ship";
await fire(t2, "focusout");
await done(1);
const sortChip = (label) =>
  $(".card")[0].querySelectorAll(".qfilter .chip")
    ? [...$(".card")[0].querySelectorAll(".qfilter .chip")].find(
        (b) => b.textContent.trim() === label
      )
    : null;
check("a sort row appears once there are two ships", !!sortChip("Type"), "no Type chip");
check(
  "the tally follows a type being set",
  tally().includes("Cargo Ship ×1") && tally().includes("Clipper ×1"),
  tally()
);
await fire(sortChip("Name"));
check("by name", names().join(" | ") === "Bessie | The Seagull", names().join(" | "));
await fire(sortChip("Type"));
check(
  "by type — Cargo Ship before Clipper, so the order flips",
  names().join(" | ") === "The Seagull | Bessie",
  names().join(" | ")
);
// Still sorted by type, so the TOP row is now the ship added second. Editing
// it must reach that ship and not the one in stored position 0.
await edit(0);
check(
  "the top row edits the ship it shows, not the one it used to be",
  rows()[0].querySelector(".shipname")?.value === "The Seagull",
  rows()[0].querySelector(".shipname")?.value
);
await done(0);
await fire(sortChip("Where"));
check(
  "by where — Bessie loads at Ditchwater, the other has said nothing, so it's last",
  names().join(" | ") === "Bessie | The Seagull",
  names().join(" | ")
);
check(
  "the choice is remembered",
  localStorage.getItem("anno_fleet_sort") === "where",
  String(localStorage.getItem("anno_fleet_sort"))
);
await fire(sortChip("Added"));

// --- a ship you lost (build 85) -------------------------------------------
// Sunk by pirates: it stays on the list as a record, but it isn't part of the
// fleet any more — off the tally, at the bottom, and claiming nothing.
const header = () => $(".card")[0].querySelector(".hd .muted")?.textContent || "";
// Marking a ship lost moves its row to the bottom, so both the picking and the
// closing have to follow the ship rather than a fixed position.
const rowIdx = (name) =>
  rows().findIndex(
    (r) =>
      (r.querySelector(".shipsum b")?.textContent ?? r.querySelector(".shipname")?.value) === name
  );
const closeEditor = async () => {
  const open = rows().findIndex((r) => r.querySelector("input"));
  if (open >= 0) await done(open);
};
await pickFrom(rowIdx("Bessie"), ".shipdoing", "Destroyed");
await closeEditor();
check("it's saved as destroyed", stored()[0]?.doing === "Destroyed", JSON.stringify(stored()));
const lostRow = () => rows().find((r) => r.classList.contains("shiplost"));
check(
  "the row reads as lost",
  !!lostRow() && lostRow().querySelector(".shipjob")?.textContent.includes("☠"),
  rows().map((r) => r.className).join(" | ")
);
check(
  "a sunk ship claims no place and no cargo",
  !lostRow().querySelector(".shipwhere") && !lostRow().querySelector(".cargochip"),
  lostRow().querySelector(".shipsum")?.textContent
);
check(
  "…but its name and what it was are still there",
  ["Bessie", "Clipper"].every((t) => lostRow().querySelector(".shipsum")?.textContent.includes(t)),
  lostRow().querySelector(".shipsum")?.textContent
);
check(
  "it sinks to the bottom, though it was added first",
  names()[names().length - 1] === "Bessie",
  names().join(" | ")
);
check("it's off the type tally", !tally().includes("Clipper"), tally());
check(
  "and the count says what's left, and what isn't",
  /1 ship\b/.test(header()) && /1 lost/.test(header()),
  header()
);

// Marking one lost by mistake is undone by giving it any other job — the route
// and hold were kept, not thrown away.
await pickFrom(rowIdx("Bessie"), ".shipdoing", "Trade route");
await closeEditor();
check(
  "putting it back restores the route and the hold",
  names()[0] === "Bessie" &&
    rows()[0].querySelector(".shipwhere")?.textContent.includes("Ditchwater") &&
    rows()[0].querySelectorAll(".cargochip").length === 2,
  rows()[0].querySelector(".shipsum")?.textContent
);
check("and it's back on the tally", tally().includes("Clipper ×1"), tally());

// --- the one-tap ☠ (build 87) ---------------------------------------------
// Sinkings happen mid-session; opening the row and hunting the job menu is too
// much ceremony for "it's gone".
const skull = (name) =>
  [...rows()[rowIdx(name)].querySelectorAll("button")].find((b) => b.textContent.trim() === "☠");
check("every ship row has one", !!skull("Bessie") && !!skull("The Seagull"));
await fire(skull("Bessie"));
check(
  "one tap marks it lost, no editing",
  stored()[0]?.doing === "Destroyed" && !!rows()[rowIdx("Bessie")].classList.contains("shiplost"),
  JSON.stringify(stored()[0])
);
check("the button reads as pressed", skull("Bessie").classList.contains("on"));
await fire(skull("Bessie"));
check(
  "tapping again puts it back on its route, which is what the row was hiding",
  stored()[0]?.doing === "Trade route" &&
    rows()[rowIdx("Bessie")].querySelector(".shipwhere")?.textContent.includes("Ditchwater"),
  JSON.stringify(stored()[0])
);
// A ship with no route to go back to just comes back jobless.
await fire(skull("The Seagull"));
await fire(skull("The Seagull"));
check(
  "one with nothing to restore comes back with no job at all",
  !stored()[1]?.doing && !rows()[rowIdx("The Seagull")].classList.contains("shiplost"),
  JSON.stringify(stored()[1])
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
