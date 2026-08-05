// Waiting tasks (builds 61/66): renders the real quest tracker in jsdom and
// drives it the way a player does — tap ⏳, name what you're stuck on, tick the
// blocker off.
//
// store-games.test.mjs already proves the ordering rules against the store.
// What this adds is the wiring: that ⏳ actually parks the row, that the box
// offers the other tasks, that naming one shows the link on BOTH rows, and
// that ticking the blocker really does put the parked task back on top.
import { execSync } from "node:child_process";
import { JSDOM } from "jsdom";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const out = path.join(here, "build");

execSync("npx tsc -p tests/tsconfig.quests.json", { cwd: root, stdio: "inherit" });

// tsc checks the @/* alias but emits the specifier verbatim; resolve it here.
const resolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  return resolve.call(this, req.startsWith("@/") ? path.join(out, req.slice(2)) : req, ...rest);
};

const dom = new JSDOM("<!doctype html><div id=root></div>", { url: "https://x.test/" });
global.IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no layout, so it ships no scrollIntoView — the ⛓ blocker picker is
// a real Dropdown and calls it when the menu opens.
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

// Three ordinary tasks, in the order the player put them in.
const seed = (t) => ({ t, done: false, added: 1, sess: 0 });
localStorage.setItem(
  "anno_quests",
  JSON.stringify([seed("Build a brickworks"), seed("Raise the basilica"), seed("Plant an orchard")])
);

const React = (await import("react")).default;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const S = await import(path.join(out, "lib/store.js"));
const E = await import(path.join(out, "lib/engine.js"));
const TV = await import(path.join(out, "components/TrackerView.js"));
const TrackerView = TV.TrackerView ?? TV.default?.TrackerView;

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

const results = [];
const check = (name, cond, detail = "") => results.push({ name, ok: !!cond, detail });
const $ = (sel) => [...document.querySelectorAll(sel)];
const openRows = () => $("#questList .questrow:not(.waiting):not(.done)");
const waitRows = () => $("#questList .questrow.waiting");
const rowText = (el) => (el.textContent || "").trim();
const fire = async (el, type) => {
  await act(async () => {
    el.dispatchEvent(
      new dom.window[type === "focusout" ? "FocusEvent" : "MouseEvent"](type, { bubbles: true })
    );
  });
};
// The one button in a row whose glyph is `g` (⏳ park, ⤒ unblock).
const btn = (row, g) => [...row.querySelectorAll("button")].find((b) => b.textContent.trim() === g);
const rowFor = (t) => openRows().find((el) => rowText(el).startsWith(t));

// --- the list starts as the player left it -------------------------------
check("three open tasks, in order", openRows().length === 3, String(openRows().length));
check("nothing parked yet", $(".waitblk").length === 0);

// --- ⏳ parks the middle one ---------------------------------------------
await fire(btn(rowFor("Raise the basilica"), "⏳"), "click");
check(
  "⏳ moves it out of the open list",
  openRows().length === 2 && !openRows().some((el) => rowText(el).startsWith("Raise the basilica")),
  openRows().map(rowText).join(" | ")
);
check(
  "…and into the waiting block, counted",
  waitRows().length === 1 && $(".waitblk")[0].textContent.includes("1 waiting"),
  $(".waitblk")[0]?.textContent?.slice(0, 40)
);
check(
  "the rest keep their order",
  openRows()
    .map((el) => rowText(el).split("\n")[0])
    .join(" | ")
    .startsWith("Build a brickworks"),
  openRows().map(rowText).join(" | ")
);

// --- the ⛓ picker offers the other tasks as blockers ----------------------
// A menu, not a type-in box (build 70): a name that didn't match used to fail
// silently and leave a plain note where you expected a link.
const menuOpen = () => $(".ddpop .ddopt").length > 0;
const openPicker = async (row = 0) => {
  if (!menuOpen()) await fire(waitRows()[row].querySelector(".bpick"), "click");
  return $(".ddpop .ddopt").map((el) => el.textContent.trim());
};
const closePicker = async () => {
  if (menuOpen()) await fire(document.querySelector(".bpick.open"), "click");
};
const pickBlocker = async (label, row = 0) => {
  await openPicker(row);
  const opt = $(".ddpop .ddopt").find((el) => el.textContent.trim().startsWith(label));
  if (!opt) throw new Error(`no blocker option "${label}" in: ${$(".ddpop .ddopt").map((e) => e.textContent.trim()).join(" | ")}`);
  await fire(opt, "click");
};
const offered = await openPicker();
check(
  "every other unfinished task is offered",
  offered.length === 2 &&
    offered.includes("Build a brickworks") &&
    offered.includes("Plant an orchard"),
  offered.join(" | ")
);
check("it isn't offered as its own blocker", !offered.includes("Raise the basilica"));
await closePicker();

// --- picking one links the two -------------------------------------------
await pickBlocker("Build a brickworks");
check(
  "the parked row shows the link",
  waitRows()[0].querySelector(".wqchip")?.textContent.includes("Build a brickworks"),
  waitRows()[0].querySelector(".wqchip")?.textContent
);
check(
  "the blocker's row says what frees up",
  rowFor("Build a brickworks")?.querySelector(".qdep")?.textContent.includes("1 task queued behind"),
  rowFor("Build a brickworks")?.querySelector(".qdep")?.textContent
);
check(
  "the link is saved",
  !!localStorage.getItem("anno_quests")?.includes('"wq":["Build a brickworks"]'),
  String(localStorage.getItem("anno_quests"))
);

// --- a second blocker: it waits for BOTH (build 70) -----------------------
await pickBlocker("Plant an orchard");
check(
  "both blockers show on the parked row",
  waitRows()[0].querySelectorAll(".wqchip").length === 2 &&
    [...waitRows()[0].querySelectorAll(".wqchip")]
      .map((el) => el.textContent)
      .join(" ")
      .includes("Plant an orchard"),
  [...waitRows()[0].querySelectorAll(".wqchip")].map((el) => el.textContent.trim()).join(" | ")
);
check(
  "both are saved",
  !!localStorage
    .getItem("anno_quests")
    ?.includes('"wq":["Build a brickworks","Plant an orchard"]'),
  String(localStorage.getItem("anno_quests"))
);
check(
  "each blocker's row counts it",
  rowFor("Build a brickworks")?.querySelector(".qdep")?.textContent.includes("1 task queued") &&
    rowFor("Plant an orchard")?.querySelector(".qdep")?.textContent.includes("1 task queued"),
  rowFor("Plant an orchard")?.querySelector(".qdep")?.textContent
);
check(
  "nothing left to offer, so the picker goes",
  !waitRows()[0].querySelector(".bpick"),
  String(waitRows()[0].querySelector(".bpick")?.textContent)
);

// Ticking only ONE of them leaves the task parked, minus that blocker.
await fire(rowFor("Plant an orchard").querySelector("input[type=checkbox]"), "click");
check(
  "one down, still waiting",
  waitRows().length === 1 && rowText(waitRows()[0]).startsWith("Raise the basilica"),
  openRows().map((el) => rowText(el).split("\n")[0]).join(" | ")
);
check(
  "…and the finished one is off its list",
  waitRows()[0].querySelectorAll(".wqchip").length === 1 &&
    waitRows()[0].querySelector(".wqchip").textContent.includes("Build a brickworks"),
  [...waitRows()[0].querySelectorAll(".wqchip")].map((el) => el.textContent.trim()).join(" | ")
);

// --- ticking the LAST blocker frees it -----------------------------------
await fire(rowFor("Build a brickworks").querySelector("input[type=checkbox]"), "click");
check(
  "the parked task comes back at the top",
  rowText(openRows()[0]).startsWith("Raise the basilica"),
  openRows().map((el) => rowText(el).split("\n")[0]).join(" | ")
);
check("nothing is left waiting", $(".waitblk").length === 0);
check(
  "and both blockers are in the completed fold",
  document.querySelector(".doneblk")?.textContent.includes("2 completed"),
  document.querySelector(".doneblk")?.textContent?.slice(0, 40)
);
check(
  "it says why it came back — same treatment as a rung timer",
  openRows()[0].querySelector(".qrang")?.textContent.includes("unblocked"),
  openRows()[0].querySelector(".qrang")?.textContent
);
check(
  "…and that is what got saved",
  !!localStorage.getItem("anno_quests")?.includes('"wr":"deps"'),
  String(localStorage.getItem("anno_quests"))
);
await fire(openRows()[0].querySelector(".qrang"), "click");

// --- free text is still just a note --------------------------------------
// Both of the other tasks went into the completed fold above, so this one
// carries the rest of the run.
await fire(btn(rowFor("Raise the basilica"), "⏳"), "click");
const box2 = waitRows()[0].querySelector(".wnote");
box2.value = "marble";
await fire(box2, "focusout");
check(
  "a note that names no task stays a note",
  !waitRows()[0].querySelector(".wqchip") &&
    waitRows()[0].querySelector(".wnote")?.value === "marble",
  waitRows()[0].querySelector(".wnote")?.value
);
check(
  "and nothing claims to be queued behind anything",
  $(".qdep").length === 0,
  $(".qdep").map((el) => el.textContent).join(" | ")
);

// --- a timer is the third kind of wait (build 68) -------------------------
// The orchard is still parked with its "marble" note; put it on the clock too.
const pick = waitRows()[0].querySelector(".tpick");
check("a parked row offers a timer", !!pick);
await fire(pick, "click");
const tenMin = [...document.querySelectorAll(".ddpop .ddopt")].find(
  (o) => o.textContent.trim() === "10 min"
);
await fire(tenMin, "click");
check(
  "picking a length starts a countdown on the row",
  /^⏱ (9|10):\d\d$/.test(waitRows()[0].querySelector(".qtimer")?.textContent.trim() || ""),
  waitRows()[0].querySelector(".qtimer")?.textContent
);
check(
  "the note it was already waiting on is untouched",
  waitRows()[0].querySelector(".wnote")?.value === "marble",
  waitRows()[0].querySelector(".wnote")?.value
);
const saved = JSON.parse(localStorage.getItem("anno_quests") || "[]");
const orchard = saved.find((q) => q.t === "Raise the basilica");
check(
  "the deadline is saved, ~10 minutes out",
  Math.abs(orchard?.wt - (Date.now() + 600000)) < 5000,
  String(orchard?.wt && orchard.wt - Date.now())
);

// --- ⤒ still works by hand -----------------------------------------------
await fire(btn(waitRows()[0], "⤒"), "click");
check(
  "⤒ brings it back to the top",
  $(".waitblk").length === 0 && rowText(openRows()[0]).startsWith("Raise the basilica"),
  openRows().map((el) => rowText(el).split("\n")[0]).join(" | ")
);
check(
  "…and calls the timer off with it",
  !JSON.parse(localStorage.getItem("anno_quests") || "[]").some((q) => q.wt),
  localStorage.getItem("anno_quests")
);

// --- a timer that ran out while the app was shut --------------------------
// Rather than wait ten minutes, seed a deadline in the past and mount the app
// again: the task should be open, at the top, wearing the ⏰ mark.
localStorage.setItem(
  "anno_quests",
  JSON.stringify([
    { t: "Build a brickworks", done: false, added: 1, sess: 0 },
    { t: "Ship guns to Manola", done: false, added: 1, sess: 0, w: true, wt: Date.now() - 1000 },
  ])
);
await act(async () => r.unmount());
document.getElementById("root").innerHTML = "";
const r2 = createRoot(document.getElementById("root"));
await act(async () => {
  r2.render(
    React.createElement(
      S.AppProviders,
      null,
      React.createElement(TrackerView, { calcState: E.DEFAULT_STATE })
    )
  );
});
check(
  "a timer that rang while you were away frees its task, at the top",
  $(".waitblk").length === 0 && rowText(openRows()[0]).startsWith("Ship guns to Manola"),
  openRows().map((el) => rowText(el).split("\n")[0]).join(" | ")
);
check(
  "…and says so, so you know why it moved",
  openRows()[0].querySelector(".qrang")?.textContent.includes("time"),
  openRows()[0].querySelector(".qrang")?.textContent
);
await fire(openRows()[0].querySelector(".qrang"), "click");
check(
  "tapping the mark clears it",
  !$(".qrang").length && rowText(openRows()[0]).startsWith("Ship guns to Manola"),
  openRows().map((el) => rowText(el).split("\n")[0]).join(" | ")
);

// --- and one that runs out while you're looking at it ---------------------
// The real promise of the feature: nobody has to come back and unpark it. Two
// seconds of real clock, seeded through storage because the menu's shortest
// offer is a minute.
localStorage.setItem(
  "anno_quests",
  JSON.stringify([
    { t: "Build a brickworks", done: false, added: 1, sess: 0 },
    { t: "Sail to La Isla", done: false, added: 1, sess: 0, w: true, wt: Date.now() + 1500 },
  ])
);
await act(async () => r2.unmount());
document.getElementById("root").innerHTML = "";
const r3 = createRoot(document.getElementById("root"));
await act(async () => {
  r3.render(
    React.createElement(
      S.AppProviders,
      null,
      React.createElement(TrackerView, { calcState: E.DEFAULT_STATE })
    )
  );
});
check(
  "it starts out parked, counting down",
  waitRows().length === 1 && !!waitRows()[0].querySelector(".qtimer"),
  waitRows()[0]?.querySelector(".qtimer")?.textContent
);
await act(async () => {
  await new Promise((res) => setTimeout(res, 2200));
});
check(
  "when the clock runs out it frees itself, no tap needed",
  $(".waitblk").length === 0 && rowText(openRows()[0]).startsWith("Sail to La Isla"),
  openRows().map((el) => rowText(el).split("\n")[0]).join(" | ")
);
check(
  "…and it's saved that way",
  !!localStorage.getItem("anno_quests")?.includes('"wr":"timer"'),
  String(localStorage.getItem("anno_quests"))
);

// --- ⛓ straight from an open row (build 70) -------------------------------
// The old way in was: press ⏳, then find the box on the parked row. Now the
// picker sits on the open row and parks the task for you.
const target = rowFor("Build a brickworks");
await fire(target.querySelector(".bpick"), "click");
const opt = $(".ddpop .ddopt").find((el) => el.textContent.trim().startsWith("Sail to La Isla"));
await fire(opt, "click");
check(
  "⛓ on an open row parks it behind the task you pick",
  waitRows().length === 1 &&
    rowText(waitRows()[0]).startsWith("Build a brickworks") &&
    waitRows()[0].querySelector(".wqchip")?.textContent.includes("Sail to La Isla"),
  waitRows().map((el) => rowText(el).split("\n")[0]).join(" | ")
);
check(
  "…and the blocker's row says so",
  rowFor("Sail to La Isla")?.querySelector(".qdep")?.textContent.includes("1 task queued behind"),
  rowFor("Sail to La Isla")?.querySelector(".qdep")?.textContent
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
console.log("\nQUEST WAITING UI VERIFIED");
