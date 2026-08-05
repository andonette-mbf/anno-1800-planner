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

// --- the box offers the other tasks as blockers ---------------------------
const box = waitRows()[0].querySelector(".wnote");
const offered = [...document.querySelectorAll(`#${box.getAttribute("list")} option`)].map(
  (o) => o.value
);
check(
  "every other unfinished task is offered",
  offered.length === 2 && offered.includes("Build a brickworks") && offered.includes("Plant an orchard"),
  offered.join(" | ")
);
check("it isn't offered as its own blocker", !offered.includes("Raise the basilica"));

// --- naming one links the two -------------------------------------------
box.value = "  build a BRICKWORKS "; // sloppy typing, as a player would
await fire(box, "focusout");
check(
  "the parked row shows the link",
  waitRows()[0].querySelector(".wqchip")?.textContent.includes("after Build a brickworks"),
  waitRows()[0].querySelector(".wqchip")?.textContent
);
check(
  "the blocker's row says what frees up",
  rowFor("Build a brickworks")?.querySelector(".qdep")?.textContent.includes("1 task queued behind"),
  rowFor("Build a brickworks")?.querySelector(".qdep")?.textContent
);
check(
  "the link is saved",
  !!localStorage.getItem("anno_quests")?.includes('"wq":"Build a brickworks"'),
  String(localStorage.getItem("anno_quests"))
);

// --- ticking the blocker frees it ---------------------------------------
await fire(rowFor("Build a brickworks").querySelector("input[type=checkbox]"), "click");
check(
  "the parked task comes back at the top",
  rowText(openRows()[0]).startsWith("Raise the basilica"),
  openRows().map((el) => rowText(el).split("\n")[0]).join(" | ")
);
check("nothing is left waiting", $(".waitblk").length === 0);
check(
  "and the blocker is in the completed fold",
  document.querySelector(".doneblk")?.textContent.includes("1 completed"),
  document.querySelector(".doneblk")?.textContent?.slice(0, 40)
);

// --- free text is still just a note --------------------------------------
await fire(btn(rowFor("Plant an orchard"), "⏳"), "click");
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

// --- ⤒ still works by hand -----------------------------------------------
await fire(btn(waitRows()[0], "⤒"), "click");
check(
  "⤒ brings it back to the top",
  $(".waitblk").length === 0 && rowText(openRows()[0]).startsWith("Plant an orchard"),
  openRows().map((el) => rowText(el).split("\n")[0]).join(" | ")
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
