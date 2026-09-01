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
    // Ditchwater keeps the zoo, so the collections roll-up (build 91) has an
    // island to point at that isn't the one being folded for the ledger checks.
    Ditchwater: [
      { t: "Lumberjack's Hut", done: true, n: 3 },
      { t: "Zoo", done: true },
    ],
  })
);
// Two of the three Arctic Tundra animals in the zoo — enough placed to count,
// one short so the ⚑ flag has something to say.
localStorage.setItem(
  "anno_island_culture",
  JSON.stringify({ Ditchwater: { zoo: ["Arctic Wolf", "Boreal Caribou"] } })
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
// Build 99: the ledger is the one thing a fold KEEPS — a collapsed island is
// its header plus the production list, which carries its own ⚠ Short line.
check("its ledger survives the fold", !!blockFor("Crown Falls").querySelector(".iledger"));
check("so is the add-building row", !blockFor("Crown Falls").querySelector(".plrow input"));
check(
  "the built count stays",
  blockFor("Crown Falls").querySelector(".muted")?.textContent === "2/2",
  blockFor("Crown Falls").querySelector(".muted")?.textContent
);
check(
  // Flour for the bakeries and wood for the sawmill — the ledger's own advice
  // line still shows folded, so no separate badge is needed.
  "and its ⚠ line still says what's short",
  blockFor("Crown Falls").querySelector(".iledgfix")?.textContent.includes("Flour"),
  blockFor("Crown Falls").querySelector(".iledgfix")?.textContent
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
  bodyOf("Ditchwater") === 2 && !blocks()[1].classList.contains("shut"),
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
check("the other island came back open", bodyOf("Ditchwater") === 2);

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

// --- collections, without opening anything (build 91 → 101) ----------------
// The full panel moved to the 🏛 Culture tab in build 101; what the island
// block keeps is the score — a link row while open, the same counts on the
// folded header — so "what's on what island" is still answered here. (This
// section originally drove the build-91 top-of-card chip row, which build 101
// moved to the Culture tab's own header.)
const culink = (n) => blockFor(n).querySelector(".culink");
check(
  "the island with the zoo shows its score",
  /2\/133/.test(culink("Ditchwater")?.textContent || ""),
  culink("Ditchwater")?.textContent
);
check(
  "and flags the set that's one animal short",
  culink("Ditchwater")?.querySelector(".cuflag")?.textContent === "⚑1",
  culink("Ditchwater")?.querySelector(".cuflag")?.textContent
);
check(
  "the row points across to the Culture tab",
  (culink("Ditchwater")?.textContent || "").includes("Culture")
);
check("Crown Falls has no zoo, so no link row", !culink("Crown Falls"));

await fire(blockFor("Ditchwater").querySelector(".isletog"));
check(
  "folded up, the header still says what's in the zoo",
  blockFor("Ditchwater").querySelector(".isleculture")?.textContent.includes("2/133"),
  blockFor("Ditchwater").querySelector(".isleculture")?.textContent
);
check(
  "…and keeps the ⚑",
  blockFor("Ditchwater").querySelector(".isleculture .cuflag")?.textContent === "⚑1",
  blockFor("Ditchwater").querySelector(".isleculture")?.textContent
);
check("the link row went with the fold", !culink("Ditchwater"));
await fire(blockFor("Ditchwater").querySelector(".isletog"));
check(
  "open again, the link row is back",
  !!culink("Ditchwater") && bodyOf("Ditchwater") === 2,
  blockFor("Ditchwater").className
);

// --- residents on the block (M8) -------------------------------------------
// The 👥 row unfolds into per-tier inputs; a count typed there lands in
// localStorage, feeds the ledger (Crown Falls' bakeries now have eaters), and
// survives folding the island and a reload.
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
const popRow = (n) => blockFor(n).querySelector(".ipop");
const popToggle = (n) => popRow(n).querySelector(".ipoptgl");
check("every island grew a 👥 row", !!popRow("Crown Falls") && !!popRow("Ditchwater"));
check(
  "with nobody home it just offers itself",
  popToggle("Crown Falls").textContent.includes("Residents…"),
  popToggle("Crown Falls").textContent
);
await fire(popToggle("Crown Falls"));
const tierInput = (lbl) =>
  [...popRow("Crown Falls").querySelectorAll(".ipoptier")]
    .find((l) => l.textContent.trim().startsWith(lbl))
    ?.querySelector("input");
check(
  "open, it offers tier inputs (untagged island: all of them)",
  !!tierInput("Farmers") && !!tierInput("Workers") && !!tierInput("Jornaleros")
);
await setValue(tierInput("Workers"), "1000");
check(
  "the count is stored",
  JSON.parse(localStorage.getItem("anno_island_pop") || "{}")["Crown Falls"]?.workers === 1000,
  localStorage.getItem("anno_island_pop")
);
check(
  "and read back on the summary line",
  popToggle("Crown Falls").textContent.includes("1000") &&
    popToggle("Crown Falls").textContent.includes("Workers"),
  popToggle("Crown Falls").textContent
);
const breadRow = () =>
  [...blockFor("Crown Falls").querySelectorAll(".iledgrow")].find((r) =>
    r.textContent.includes("Bread")
  );
check(
  "the ledger's Bread row now carries a 👥 chip",
  breadRow()?.querySelector(".trchip")?.textContent.includes("👥"),
  breadRow()?.textContent
);
// 2 Bakeries make 2 t/min; 1000 workers eat 0.9091 — still a surplus, and the
// workers are also short of fish nothing here catches.
check(
  "…and the residents' other needs turned up as shortfalls",
  blockFor("Crown Falls").querySelector(".iledgfix")?.textContent.includes("Fishery"),
  blockFor("Crown Falls").querySelector(".iledgfix")?.textContent
);
await fire(blockFor("Crown Falls").querySelector(".isletog"));
check("the 👥 row survives the fold, like the ledger", !!popRow("Crown Falls"));
await fire(blockFor("Crown Falls").querySelector(".isletog"));
await act(async () => app.unmount());
document.getElementById("root").innerHTML = "";
app = await mount();
check(
  "…and a reload",
  popToggle("Crown Falls").textContent.includes("1000"),
  popToggle("Crown Falls").textContent
);

// --- suggested trade flows (M9) --------------------------------------------
// Ditchwater's lumberjacks cut 12 t/min of Wood nobody there uses; Crown
// Falls' sawmill eats 4 with no hut behind it — the suggestion carries the
// DEFICIT (4), not the whole surplus. That is the strip's whole job: one
// chip, good + t/min + from → to, and the accept tap records the link — after
// which the ledger routes the wood and the suggestion has nothing to say.
const strip = () => document.querySelector(".trsuggest");
const sugChips = () => [...document.querySelectorAll(".trsuggest .trsug")];
check(
  "the strip offers Ditchwater's wood to Crown Falls",
  sugChips().length === 1 &&
    /Wood 4 · Ditchwater → Crown Falls/.test(sugChips()[0].textContent),
  strip()?.textContent
);
await fire(sugChips()[0]);
check(
  "accepting records the link",
  JSON.parse(localStorage.getItem("anno_island_links") || "[]").some(
    (l) => l.good === "Wood" && l.from === "Ditchwater" && l.to === "Crown Falls"
  ),
  localStorage.getItem("anno_island_links")
);
check("…and the suggestion clears — the ledger routes it now", !strip());
const woodRow = [...blockFor("Crown Falls").querySelectorAll(".iledgrow")].find((r) =>
  r.textContent.includes("Wood") && !r.textContent.includes("Timber")
);
check(
  "Crown Falls' Wood row shows the import",
  /🚢← Ditchwater/.test(woodRow?.textContent || ""),
  woodRow?.textContent
);

// --- island fertilities (build 122) ----------------------------------------
// Tag the islands (Crown Falls is on the Cape, Ditchwater in the Old World)
// and reload: each card grows a 🌱 block with the region's whole list, the
// Cape borrowing the Old World's. Ticks land in islandItems under "fert", and
// the strip at the top pools the two islands into one "Old World · Cape
// Trelawney" gap list — silent until the first tick.
await act(async () => app.unmount());
document.getElementById("root").innerHTML = "";
localStorage.setItem(
  "anno_island_regions",
  JSON.stringify({ "Crown Falls": "ct", Ditchwater: "ow" })
);
app = await mount();
const fertBlk = (n) => blockFor(n).querySelector(".fertblk");
const fertChips = (n) => [...fertBlk(n).querySelectorAll(".fertchip")];
const fertChip = (n, label) => fertChips(n).find((c) => c.textContent.trim() === label);
check("every tagged island grew a 🌱 block", !!fertBlk("Crown Falls") && !!fertBlk("Ditchwater"));
check(
  "Cape Trelawney offers the Old World's 7 + 7 (Saltpetre, Zinc among them)",
  fertChips("Crown Falls").length === 14 &&
    !!fertChip("Crown Falls", "Saltpetre") &&
    !!fertChip("Crown Falls", "Zinc"),
  fertChips("Crown Falls").map((c) => c.textContent).join()
);
check("no 🌱 strip before anything is ticked", !document.querySelector(".fertgaps"));
await fire(fertChip("Crown Falls", "Hops"));
await fire(fertChip("Ditchwater", "Potatoes"));
const fertStored = () => JSON.parse(localStorage.getItem("anno_island_items") || "{}");
check(
  "ticks land in islandItems under the 'fert' pseudo-socket",
  fertStored()["Crown Falls"]?.fert?.join() === "Hops" &&
    fertStored().Ditchwater?.fert?.join() === "Potatoes",
  localStorage.getItem("anno_island_items")
);
check("the ticked chip lights", fertChip("Crown Falls", "Hops").classList.contains("on"));
const gaps = () => document.querySelector(".fertgaps");
const gapNames = () => [...gaps().querySelectorAll(".trchip")].map((c) => c.getAttribute("title"));
check(
  "the 🌱 strip pools the Cape with the Old World",
  /Old World · Cape Trelawney lacks/.test(gaps()?.textContent || ""),
  gaps()?.textContent
);
check(
  "…listing the 12 neither island has — Hops and Potatoes not among them",
  gapNames().length === 12 &&
    !gapNames().includes("Hops") &&
    !gapNames().includes("Potatoes") &&
    gapNames().includes("Saltpetre") &&
    gapNames().includes("Zinc (deposit)"),
  gapNames().join()
);
await fire(fertChip("Crown Falls", "Hops"));
check(
  "unticking takes it back out of the store and the gap list",
  !fertStored()["Crown Falls"]?.fert && gapNames().length === 13,
  localStorage.getItem("anno_island_items") + " / " + gapNames().length
);
await fire(blockFor("Ditchwater").querySelector(".isletog"));
check(
  "a folded island's header carries its 🌱 count",
  /🌱 1\/14/.test(blockFor("Ditchwater").textContent),
  blockFor("Ditchwater").textContent.slice(0, 80)
);
await fire(blockFor("Ditchwater").querySelector(".isletog"));

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
