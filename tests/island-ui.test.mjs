// Folding island blocks away (build 72): renders the real Tracker in jsdom with
// two settled islands and folds one.
//
// A settled island's block is a screenful — inventory, ledger, plan check,
// collection panel — and with several islands you scroll past all of them to
// reach the one you want. What this checks is that folding actually removes the
// body (rather than hiding it behind CSS the ledger still renders into), that
// the header keeps the two things worth seeing folded up — the built count and
// whether it is short of anything — and that the choice survives a reload.
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

// Two islands. Crown Falls runs a Bakery with no flour behind it, so its ledger
// is short — the state the folded header has to keep advertising.
localStorage.setItem("anno_islands", JSON.stringify(["Crown Falls", "Ditchwater"]));
localStorage.setItem(
  "anno_island_checks",
  JSON.stringify({
    "Crown Falls": [
      { t: "Bakery", done: true, n: 2 },
      { t: "Sawmill", done: true },
    ],
    Ditchwater: [{ t: "Lumberjack's Hut", done: true, n: 3 }],
  })
);

const React = (await import("react")).default;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const S = await import(path.join(out, "lib/store.js"));
const E = await import(path.join(out, "lib/engine.js"));
const TV = await import(path.join(out, "components/TrackerView.js"));
const TrackerView = TV.TrackerView ?? TV.default?.TrackerView;

const mount = async () => {
  const el = document.getElementById("root");
  const r = createRoot(el);
  await act(async () => {
    r.render(
      React.createElement(
        S.AppProviders,
        null,
        React.createElement(TrackerView, { calcState: E.DEFAULT_STATE, section: "islands" })
      )
    );
  });
  return r;
};

let app = await mount();

const results = [];
const check = (name, cond, detail = "") => results.push({ name, ok: !!cond, detail });
const $ = (sel) => [...document.querySelectorAll(sel)];
const fire = async (el) => {
  await act(async () => {
    el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
};
const blocks = () => $(".isleblk");
const blockFor = (n) => blocks().find((el) => el.querySelector(".isletog")?.textContent.includes(n));
const bodyOf = (n) => blockFor(n).querySelectorAll(".plitem").length;

// --- Cape Trelawney settles as its own island (build 84) ------------------
const addIsleRow = () => $(".card")[0].querySelector(".plrow");
await fire(addIsleRow().querySelector(".ddbtn"));
const kits = $(".ddpop .ddopt").map((el) => el.textContent.trim());
check(
  "the new-island menu offers Cape Trelawney on its own",
  kits.includes("Cape Trelawney") && kits.includes("Old World"),
  kits.join(" | ")
);
await fire(document.querySelector(".ddbtn.open"));

// --- both start open, as they always were --------------------------------
check("two island blocks", blocks().length === 2, String(blocks().length));
check("Crown Falls lists its buildings", bodyOf("Crown Falls") === 2, String(bodyOf("Crown Falls")));
check("its ledger is on screen", !!blockFor("Crown Falls").querySelector(".iledger"));
check(
  "and it is short of flour",
  blockFor("Crown Falls").querySelector(".iledgfix")?.textContent.includes("Flour"),
  blockFor("Crown Falls").querySelector(".iledgfix")?.textContent
);
check("nothing is folded yet", $(".isleblk.shut").length === 0);

// --- fold Crown Falls -----------------------------------------------------
await fire(blockFor("Crown Falls").querySelector(".isletog"));
check("the block is marked folded", blocks()[0].classList.contains("shut"));
check("its buildings are gone from the DOM", bodyOf("Crown Falls") === 0, String(bodyOf("Crown Falls")));
check("so is its ledger", !blockFor("Crown Falls").querySelector(".iledger"));
check("so is the add-building row", !blockFor("Crown Falls").querySelector(".plrow input"));
check(
  "the built count stays",
  blockFor("Crown Falls").querySelector(".muted")?.textContent === "2/2",
  blockFor("Crown Falls").querySelector(".muted")?.textContent
);
check(
  // Flour for the bakeries and wood for the sawmill: two goods short, so the
  // count is of goods, not of buildings.
  "and it still says it's short",
  blockFor("Crown Falls").querySelector(".isleshort")?.textContent.includes("2 short"),
  blockFor("Crown Falls").querySelector(".isleshort")?.textContent
);
check(
  "the ✕ and 👁 are still reachable",
  !!blockFor("Crown Falls").querySelector(".qeye") &&
    [...blockFor("Crown Falls").querySelectorAll("button")].some(
      (b) => b.textContent.trim() === "✕"
    )
);
check(
  "the other island is untouched",
  bodyOf("Ditchwater") === 1 && !blocks()[1].classList.contains("shut"),
  String(bodyOf("Ditchwater"))
);

// --- it is remembered -----------------------------------------------------
check(
  "the fold is saved",
  JSON.parse(localStorage.getItem("anno_isle_shut") || "[]").join() === "Crown Falls",
  String(localStorage.getItem("anno_isle_shut"))
);
await act(async () => app.unmount());
document.getElementById("root").innerHTML = "";
app = await mount();
check(
  "…and survives a reload",
  blockFor("Crown Falls").classList.contains("shut") && bodyOf("Crown Falls") === 0,
  blocks().map((el) => el.className).join(" | ")
);
check("the other island came back open", bodyOf("Ditchwater") === 1);

// --- and unfolds again ----------------------------------------------------
await fire(blockFor("Crown Falls").querySelector(".isletog"));
check(
  "opening it puts everything back",
  bodyOf("Crown Falls") === 2 && !!blockFor("Crown Falls").querySelector(".iledger"),
  String(bodyOf("Crown Falls"))
);
check(
  "and nothing is left in the saved list",
  JSON.parse(localStorage.getItem("anno_isle_shut") || "[]").length === 0,
  String(localStorage.getItem("anno_isle_shut"))
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
console.log("\nISLAND FOLDING VERIFIED");
