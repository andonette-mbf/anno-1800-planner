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
  "the strips sit in a titled 'Region fertilities' block",
  document.querySelector(".fertsummary .fertsumhd")?.textContent.includes("Region fertilities") &&
    !!document.querySelector(".fertsummary .fertgaps"),
  document.querySelector(".fertsummary")?.textContent.slice(0, 60)
);
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
// Tick everything the Cape island lacks: the region's line turns into the
// full-set announcement (build 124) — the point of keeping the list.
for (const c of fertChips("Crown Falls").filter((c) => !c.classList.contains("on"))) await fire(c);
check(
  "with every fertility ticked somewhere, the region reports a full set",
  gaps()?.classList.contains("fertfull") && /✓ Old World · Cape Trelawney/.test(gaps().textContent) && /full set ✓/.test(gaps().textContent) && !gaps().querySelector(".trchip"),
  gaps()?.textContent
);
await fire(fertChip("Crown Falls", "Saltpetre"));
check("…and drops back to 'lacks' when one goes", /lacks:/.test(gaps().textContent) && gapNames().join() === "Saltpetre", gaps().textContent);

// --- the ledger folds on its own (build 123) ---------------------------------
// Independent of the island fold and the checklist tuck: fold the ledger with
// the island open, the rows and ⚠ line go, a one-line count stays; fold the
// island on top and the folded ledger is still what shows; reload keeps it.
const ledgOf = (n) => blockFor(n).querySelector(".iledger");
const ledgRows = (n) => ledgOf(n).querySelectorAll(".iledgrow:not(.iledghead)").length;
const ledgTog = (n) => ledgOf(n).querySelector(".iledgtog");
check("the ledger title is a toggle", !!ledgTog("Crown Falls") && ledgRows("Crown Falls") > 0);
await fire(ledgTog("Crown Falls"));
check(
  "folding it removes the rows and the ⚠ line",
  ledgOf("Crown Falls").classList.contains("shut") &&
    ledgRows("Crown Falls") === 0 &&
    !ledgOf("Crown Falls").querySelector(".iledgfix"),
  String(ledgRows("Crown Falls"))
);
check(
  "…but the head keeps a row count and the short count",
  /Ledger · \d+ rows/.test(ledgTog("Crown Falls").textContent) &&
    /⚠ \d+ short/.test(ledgOf("Crown Falls").textContent),
  ledgOf("Crown Falls").textContent
);
check(
  "the fold is remembered per game",
  JSON.parse(localStorage.getItem("anno_isle_ledger") || "[]").join() === "Crown Falls",
  localStorage.getItem("anno_isle_ledger")
);
check("Ditchwater's ledger is untouched", !ledgOf("Ditchwater").classList.contains("shut"));
await fire(blockFor("Crown Falls").querySelector(".isletog"));
check(
  "folding the island on top keeps the folded ledger head",
  blockFor("Crown Falls").classList.contains("shut") &&
    !!ledgTog("Crown Falls") &&
    ledgRows("Crown Falls") === 0
);
await fire(blockFor("Crown Falls").querySelector(".isletog"));
await act(async () => app.unmount());
document.getElementById("root").innerHTML = "";
app = await mount();
check("…and a reload", ledgOf("Crown Falls").classList.contains("shut"));
await fire(ledgTog("Crown Falls"));
check(
  "opening it brings the rows and ⚠ line back",
  ledgRows("Crown Falls") > 0 && !!ledgOf("Crown Falls").querySelector(".iledgfix"),
  String(ledgRows("Crown Falls"))
);

// --- switch a building off (build 129) ---------------------------------------
// The ⏸ on a built row pauses the line: it stays in the inventory (still
// built, still 2/2) but leaves the ledger — its output AND its inputs. Press
// ▶ and it's back. Crown Falls' Sawmill: pausing drops Timber (+4); the Wood
// row stays — the trade link still lands Ditchwater's surplus as stock.
const rowOf = (isle, t) =>
  [...blockFor(isle).querySelectorAll(".questrow")].find((r) => r.textContent.includes(t));
const ledgNames = (isle) =>
  [...blockFor(isle).querySelectorAll(".iledgrow:not(.iledghead)")].map(
    (r) => r.querySelector("span").textContent
  );
if (ledgOf("Crown Falls").classList.contains("shut")) await fire(ledgTog("Crown Falls"));
check("the built Sawmill row carries a ⏸", rowOf("Crown Falls", "Sawmill")?.querySelector(".qoff")?.textContent === "⏸");
await fire(rowOf("Crown Falls", "Sawmill").querySelector(".qoff"));
check(
  "pausing marks the row off and stores the flag",
  rowOf("Crown Falls", "Sawmill").classList.contains("off") &&
    JSON.parse(localStorage.getItem("anno_island_checks"))["Crown Falls"].some(
      (c) => c.t === "Sawmill" && c.off === true
    ),
  localStorage.getItem("anno_island_checks")
);
check(
  "…and the ledger forgets the line — Timber gone, Wood draw stopped",
  !ledgNames("Crown Falls").some((n) => n.includes("Timber")),
  ledgNames("Crown Falls").join()
);
check(
  "the island still counts it as built",
  blockFor("Crown Falls").textContent.includes("2/2")
);
await fire(rowOf("Crown Falls", "Sawmill").querySelector(".qoff"));
check(
  "▶ brings it back",
  !rowOf("Crown Falls", "Sawmill").classList.contains("off") &&
    ledgNames("Crown Falls").some((n) => n.includes("Timber")),
  ledgNames("Crown Falls").join()
);

// --- import where it's short (builds 130–131) --------------------------------
// The "← import Flour…" picker sits on the ⚠ Short line — the place that says
// you're short — as the alternative to the build advice, NOT on the ledger row
// (build 131 moved it after 130 put it there). Picking an island records the
// same {good, from, to} link the export path would.
const flourRow = () =>
  [...blockFor("Crown Falls").querySelectorAll(".iledgrow")].find((r) =>
    r.textContent.includes("Flour")
  );
const fixLine = () => blockFor("Crown Falls").querySelector(".iledgfix");
// Residents put several goods short, so the line carries one picker per good —
// address the Flour one by its label.
const flourPick = () =>
  [...(fixLine()?.querySelectorAll(".trlink") || [])].find((x) =>
    x.textContent.includes("import Flour")
  );
check("the ledger row itself carries no picker", !flourRow()?.querySelector(".trlink"));
check("the ⚠ Short line offers ← import Flour…", !!flourPick(), fixLine()?.textContent);
await fire(flourPick());
const impOpt = [...document.querySelectorAll(".ddpop .ddopt")].find((o) =>
  o.textContent.includes("Ditchwater")
);
check("…listing Ditchwater", !!impOpt);
await fire(impOpt);
check(
  "picking it records the link with this island as the destination",
  JSON.parse(localStorage.getItem("anno_island_links") || "[]").some(
    (l) => l.good === "Flour" && l.from === "Ditchwater" && l.to === "Crown Falls"
  ),
  localStorage.getItem("anno_island_links")
);
check(
  "…and the row now shows the 🚢← chip",
  /🚢← Ditchwater/.test(flourRow()?.textContent || ""),
  flourRow()?.textContent
);

// --- ⚓ bought in (build 132) -------------------------------------------------
// The third answer to a shortfall, beside building and shipping: tick the good
// off as arriving by contract and the row stops counting as short. Ditchwater
// makes no Flour, so the link above moves 0 and Crown Falls is still short of
// it — the state the tickbox is for.
const buyBox = () => flourRow()?.querySelector(".trbuy input");
const tick = async (el) => {
  await act(async () => {
    el.click();
  });
};
check("a short row carries the ⚓ tickbox", !!buyBox(), flourRow()?.textContent);
check("…unticked to begin with", buyBox()?.checked === false);
await tick(buyBox());
check(
  "ticking records the good against this island",
  (JSON.parse(localStorage.getItem("anno_island_trade") || "{}")["Crown Falls"] || []).includes(
    "Flour"
  ),
  localStorage.getItem("anno_island_trade")
);
check(
  "the ⚠ line stops asking for Flour",
  !fixLine()?.textContent.includes("Flour"),
  fixLine()?.textContent
);
check(
  "…and the row stays, marked bought in",
  !!flourRow() && /bought in/.test(flourRow()?.textContent || ""),
  flourRow()?.textContent
);
check("the other island is unaffected", !!blockFor("Ditchwater"));

await act(async () => app.unmount());
document.getElementById("root").innerHTML = "";
app = await mount();
check(
  "the tick survives a reload",
  buyBox()?.checked === true && !fixLine()?.textContent.includes("Flour"),
  fixLine()?.textContent
);

await tick(buyBox());
check(
  "unticking asks again",
  fixLine()?.textContent.includes("Flour"),
  fixLine()?.textContent
);
check(
  "…and the island is dropped from storage rather than left empty",
  !("Crown Falls" in JSON.parse(localStorage.getItem("anno_island_trade") || "{}")),
  localStorage.getItem("anno_island_trade")
);

// --- compact inventory rows (build 133) --------------------------------------
// An inventory line was carrying up to seven controls at all times. Now it is
// one line until you ask for the rest, the way a ship row has been since build
// 81 — and what stays out is what you reach for mid-session: the tick, and ⏸.
// Crown Falls' Bakery ×2 can be electrified and can't take a silo; the Sheep
// Farm added below is the other way round, so between them they cover both
// counters.
const btnIn = (row, txt) =>
  [...row.querySelectorAll("button")].find((b) => b.textContent.trim() === txt);
const pencil = (row) => btnIn(row, "✎");
// The count −/＋ are .qmove. The module chip carries its OWN ＋ and it comes
// first in the row, so matching on the character alone reaches the wrong one.
const countUp = (row) => row.querySelector('.qmove[title="One more"]');
const doneIn = (row) => row.querySelector(".shipdone");
const bakery = () => rowOf("Crown Falls", "Bakery");

check("a shut row shows no module counters", !bakery().querySelector(".schip"));
check("…no count buttons", !bakery().querySelector(".qmove"), String(bakery().querySelectorAll(".qmove").length));
check("…and no remove", !btnIn(bakery(), "✕"));
check(
  "nothing fitted, so it says nothing rather than showing empty counters",
  !bakery().querySelector(".invmods"),
  bakery().querySelector(".invmods")?.textContent
);
check("but the tick is still one press away", !!bakery().querySelector("input[type=checkbox]"));
check("and so is the ⏸", !!bakery().querySelector(".qoff"));
check("with a ✎ for the rest", !!pencil(bakery()));

// Ticking still works straight off the shut row — it's the row's whole job.
await tick(bakery().querySelector("input[type=checkbox]"));
check(
  "unticking from the shut row still works",
  JSON.parse(localStorage.getItem("anno_island_checks"))["Crown Falls"].find(
    (c) => c.t === "Bakery"
  ).done === false
);
await tick(bakery().querySelector("input[type=checkbox]"));
check("…and back", bakery().querySelector("input[type=checkbox]").checked === true);

// ✎ brings the controls out.
await fire(pencil(bakery()));
check("✎ opens the counters", !!bakery().querySelector(".schip"), bakery().textContent);
check("…and the −/＋ count buttons", bakery().querySelectorAll(".qmove").length === 2);
check("…and the remove", !!btnIn(bakery(), "✕"));
check("…with a ✓ Done to shut it", !!doneIn(bakery()));
check("the ✎ is gone while it's open", !pencil(bakery()));
check(
  "a Bakery gets ⚡ and no silo — farms take silos, factories take power",
  bakery().querySelectorAll(".schip").length === 1 &&
    /⚡/.test(bakery().querySelector(".schip").textContent),
  bakery().querySelector(".schip")?.textContent
);

// One row open at a time, like the fleet's.
await fire(pencil(rowOf("Crown Falls", "Sawmill")));
check(
  "opening another row shuts the first",
  !bakery().querySelector(".schip") && !!rowOf("Crown Falls", "Sawmill").querySelector(".schip")
);
await fire(doneIn(rowOf("Crown Falls", "Sawmill")));
check("✓ Done shuts it again", !rowOf("Crown Falls", "Sawmill").querySelector(".schip"));

// Power one of the two bakeries, and read it back as words.
await fire(pencil(bakery()));
await fire(bakery().querySelector('.schip button[aria-label="One powered building more"]'));
await fire(doneIn(bakery()));
check(
  "shut again, what's fitted reads as plain words",
  bakery().querySelector(".invmods")?.textContent.trim() === "⚡ 1/2",
  bakery().querySelector(".invmods")?.textContent
);
check(
  "and it's the way back in",
  (await fire(bakery().querySelector(".invmods")), !!bakery().querySelector(".schip"))
);
await fire(doneIn(bakery()));

// A silo'd farm is the other counter. Add one through the real add row.
const addBldg = () =>
  [...blockFor("Crown Falls").querySelectorAll(".plrow input")].find((el) =>
    (el.placeholder || "").startsWith("Add building")
  );
await setValue(addBldg(), "Sheep Farm");
await act(async () => {
  addBldg().dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
});
const sheep = () => rowOf("Crown Falls", "Sheep Farm");
check("the farm is listed", !!sheep(), blockFor("Crown Falls").textContent);
await fire(pencil(sheep()));
// Two more farms, then two of the three silo'd.
await fire(countUp(sheep()));
await fire(countUp(sheep()));
await fire(sheep().querySelector('.schip button[aria-label="One silo more"]'));
await fire(sheep().querySelector('.schip button[aria-label="One silo more"]'));
await fire(doneIn(sheep()));
check(
  "a part-silo'd farm reads as words too",
  sheep().querySelector(".invmods")?.textContent.trim() === "silos 2/3",
  sheep().querySelector(".invmods")?.textContent
);
check(
  "a farm gets a silo and no ⚡",
  (await fire(pencil(sheep())),
  sheep().querySelectorAll(".schip").length === 1 &&
    /silo/.test(sheep().querySelector(".schip").textContent)),
  sheep().querySelector(".schip")?.textContent
);
await fire(doneIn(sheep()));

// The A→Z sort reorders the rows on screen only, so the open row has to keep
// pointing at the building you pressed — the lesson build 82 learnt on the
// fleet. Sheep Farm was added last but sorts to the end anyway, so use the
// Bakery, which sorts FIRST while it was added first too — Sawmill is the one
// that moves.
await fire(pencil(sheep()));
const azBtn = [...$(".card")[0].querySelectorAll(".linkbtn")].find(
  (b) => b.textContent.trim() === "A→Z"
);
await fire(azBtn);
check(
  "after sorting, the open row is still the Sheep Farm",
  !!sheep().querySelector(".schip") && !bakery().querySelector(".schip"),
  [...blockFor("Crown Falls").querySelectorAll(".questrow")]
    .map((r) => r.textContent.slice(0, 18))
    .join(" | ")
);
// …and editing it still reaches the right building.
await fire(countUp(sheep()));
check(
  "and ＋ lands on that building, not the one now in its old place",
  JSON.parse(localStorage.getItem("anno_island_checks"))["Crown Falls"].find(
    (c) => c.t === "Sheep Farm"
  ).n === 4,
  localStorage.getItem("anno_island_checks")
);
await fire(doneIn(sheep()));
await fire(azBtn);

// Removing the row from the open state clears it rather than leaving the next
// building open in its place.
await fire(pencil(sheep()));
await fire(btnIn(sheep(), "✕"));
check("✕ removes the item", !sheep(), blockFor("Crown Falls").textContent);
check(
  "…and leaves no row open behind it",
  !blockFor("Crown Falls").querySelector(".questrow .schip"),
  blockFor("Crown Falls").querySelector(".questrow .schip")?.textContent
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
