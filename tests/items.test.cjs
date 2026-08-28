// Structural test for the Anno 1800 specialist-items pack
// (src/lib/items-1800.json) and the socket lookups in src/lib/items.ts (M11b).
//
// Same reasoning as the culture pack test: no golden reference exists for item
// data, so what gets enforced is internal coherence — the wiki's tables move,
// and a re-extraction that loses a page, drops the effect lines, or lets a
// template hiccup through should fail here rather than ship a half-empty
// picker.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const P = JSON.parse(fs.readFileSync(path.join(ROOT, "src/lib/items-1800.json"), "utf8"));

let failures = 0;
const fail = (m) => {
  console.error(`FAIL - ${m}`);
  failures++;
};
const ok = (m) => console.log(`ok - ${m}`);

const RARITY = new Set(P.rarity);

// --- shape: the five sockets, in order -----------------------------------
{
  const want = ["tu", "th", "hm", "ship", "al"];
  const got = P.sockets.map((s) => s.id);
  if (want.join() !== got.join()) fail(`sockets are ${got.join()}, expected ${want.join()}`);
  else ok(`pack ${P.pack} — ${got.length} sockets`);
}

// --- each socket holds roughly what the wiki holds -----------------------
// Floors, not exact counts — the wiki gains items with patches and DLC. But a
// socket losing a third of its list means a rarity page failed to parse.
{
  const floor = { tu: 350, th: 230, hm: 80, ship: 160, al: 45 };
  let bad = 0;
  for (const s of P.sockets) {
    if (s.items.length < floor[s.id])
      fail(`${s.id}: only ${s.items.length} items (floor ${floor[s.id]}) — a page failed?`),
        bad++;
  }
  const total = P.sockets.reduce((n, s) => n + s.items.length, 0);
  if (!bad)
    ok(
      `${total} items — ` +
        P.sockets.map((s) => `${s.id} ${s.items.length}`).join(", ")
    );
}

// --- every item is well-formed ------------------------------------------
{
  let bad = 0;
  for (const s of P.sockets) {
    if (!s.label || !s.noun) fail(`${s.id}: missing label/noun`), bad++;
    for (const i of s.items) {
      if (!i.n || typeof i.n !== "string") fail(`${s.id}: item with no name`), bad++;
      if (!RARITY.has(i.r)) fail(`${s.id}/${i.n}: rarity "${i.r}" is not in the ladder`), bad++;
      // The effect line is the reason the pack exists — "what does the one I
      // socketed do". Losing it to a template re-word is the silent regression.
      if (!i.fx) fail(`${s.id}/${i.n}: no effect line parsed`), bad++;
    }
  }
  if (!bad) ok("name, rarity and effect present on every item");
}

// --- names are unique within a socket ------------------------------------
// The store keys placements off the display name.
{
  let bad = 0;
  for (const s of P.sockets) {
    const seen = new Set();
    for (const i of s.items) {
      const k = i.n.toLowerCase();
      if (seen.has(k)) fail(`${s.id}: duplicate "${i.n}"`), bad++;
      seen.add(k);
    }
  }
  if (!bad) ok("item names are unique within each socket");
}

// --- island sockets say what they affect ---------------------------------
// Ship items affect the ship they sit in and carry no Affects line; the
// building sockets' whole point is which factories an item touches, so those
// should nearly all have one (the odd curiosity legitimately doesn't).
{
  let bad = 0;
  for (const s of P.sockets) {
    if (s.id === "ship") continue;
    const missing = s.items.filter((i) => !i.tgt).length;
    if (missing > s.items.length * 0.05)
      fail(`${s.id}: ${missing}/${s.items.length} items with no Affects — parse slipped?`),
        bad++;
  }
  if (!bad) ok("building-socket items carry their Affects targets");
}

// --- spot checks, hand-read off the wiki ---------------------------------
{
  const get = (sid, name) =>
    P.sockets.find((s) => s.id === sid).items.find((i) => i.n === name);
  const checks = [
    ["tu", "Burner", (i) => i.tgt === "Charcoal Kiln" && i.fx === "Productivity: +10%"],
    ["th", "Bartender", (i) => i.tgt === "Residences" && /Happiness: \+3/.test(i.fx)],
    ["ship", "Handler", (i) => /Cargo Slowdown: -20%/.test(i.fx) && !i.tgt],
    [
      "al",
      "Hide Scraper",
      (i) => /Parka Factory/.test(i.tgt) && /Productivity: \+25%/.test(i.fx),
    ],
  ];
  let bad = 0;
  for (const [sid, name, test] of checks) {
    const i = get(sid, name);
    if (!i) fail(`${sid}: "${name}" missing from the pack`), bad++;
    else if (!test(i)) fail(`${sid}/${name}: parsed as ${JSON.stringify(i)}`), bad++;
  }
  if (!bad) ok(`${checks.length} spot checks against hand-read wiki values`);
}

// --- provenance is recorded ---------------------------------------------
{
  const pages = P.source?.pages || [];
  // 5 rarity pages × 2 + the three single-page sockets.
  if (pages.length !== 13 || pages.some((p) => !p.revid))
    fail(`source revisions missing (${pages.length}/13) — the pack is not reproducible`);
  else ok(`provenance — 13 pages, all with revision ids`);
}

// --- the typed view -------------------------------------------------------
{
  const { execSync } = require("child_process");
  const build = path.join(__dirname, "build");
  try {
    execSync(
      `npx tsc src/lib/items.ts --outDir tests/build --rootDir src/lib ` +
        `--module commonjs --target es2020 --resolveJsonModule --esModuleInterop --skipLibCheck`,
      { cwd: ROOT, stdio: "pipe" }
    );
    fs.copyFileSync(
      path.join(ROOT, "src/lib/items-1800.json"),
      path.join(build, "items-1800.json")
    );
    fs.copyFileSync(
      path.join(ROOT, "src/lib/items-117.json"),
      path.join(build, "items-117.json")
    );
    const I = require("./build/items.js");

    // Both games carry a pack since M11c; 117's sockets share one item list.
    const s117 = I.itemsFor("anno117");
    if (!s117 || s117.map((s) => s.id).join() !== "villa,gh")
      fail(`itemsFor('anno117') is ${s117 && s117.map((s) => s.id).join()}, expected villa,gh`);
    else if (s117[0].items !== s117[1].items || !s117[0].items.length)
      fail("117's Villa and Guesthouse should share the one item list");
    if ((I.itemsFor("anno1800") || []).length !== 5) fail("itemsFor('anno1800') lost a socket");

    // Islands get the four building sockets; the fleet gets Ships.
    const isl = I.islandSockets("anno1800").map((s) => s.id);
    if (isl.join() !== "tu,th,hm,al") fail(`islandSockets: ${isl.join()}`);
    const ship = I.shipSocket("anno1800");
    if (!ship || ship.id !== "ship") fail("shipSocket lost");
    if (I.shipSocket("anno117") !== null) fail("shipSocket('anno117') should be null");

    // Only a BUILT (ticked) socket building shows its panel.
    const on = I.socketsOn(
      [
        { t: "Trade Union", done: true },
        { t: "town hall", done: true }, // case-insensitive, like the store
        { t: "Harbourmaster's Office", done: false },
        { t: "Sheep Farm", done: true },
      ],
      "anno1800"
    );
    if (on.map((s) => s.id).join() !== "tu,th")
      fail(`socketsOn returned ${on.map((s) => s.id).join()}, expected tu,th`);
    // 117 gates on ITS buildings — a Trade Union means nothing there.
    if (I.socketsOn([{ t: "Trade Union", done: true }], "anno117").length)
      fail("socketsOn matched 1800's Trade Union on 117");
    const on117 = I.socketsOn([{ t: "villa", done: true }], "anno117");
    if (on117.map((s) => s.id).join() !== "villa")
      fail(`socketsOn('anno117') with a Villa returned ${on117.map((s) => s.id).join()}`);

    // Patrons: 117's deities, absent from 1800.
    if (I.patronsFor("anno1800") !== null) fail("patronsFor('anno1800') should be null");
    const pat = I.patronsFor("anno117") || [];
    if (pat.length !== 8) fail(`patronsFor('anno117') has ${pat.length} deities, expected 8`);

    // Lookup is case-insensitive and unknown names come back null (free text).
    const tu = I.ITEM_SOCKETS.find((s) => s.id === "tu");
    if (!I.itemIn(tu, "bUrNeR")) fail("itemIn is case-sensitive");
    if (I.itemIn(tu, "Someone The Wiki Never Heard Of") !== null)
      fail("itemIn invented an item");
    const t = I.itemTitle(I.itemIn(tu, "Burner"));
    if (!/Common .* Affects Charcoal Kiln .* Productivity/.test(t.replace(/·/g, "·")))
      fail(`itemTitle reads "${t}"`);
    ok("typed view — sockets split island/ship, gating and lookups hold");
  } catch (e) {
    fail(`items.ts failed to compile or run: ${e.message}`);
  }
}

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nITEMS PACK VERIFIED");
