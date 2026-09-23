// The route board (src/lib/routes.ts, build 133) — every trade run in one
// list, with what's wrong with it.
//
// Like the ledger, this has no golden reference: it answers a question the
// legacy app never asked. So every expectation below is hand-derived, with the
// working shown, and the ledgers are REAL ones — built by `islandLedger` and
// settled by `applyTrade` — rather than hand-typed rows, because the whole
// point of the board is that its tonnages are the island cards' own numbers
// read back off the `imp`/`exp` chips trade wrote. Hand-built rows would prove
// the arithmetic and miss the integration, which is where this could go wrong.
//
// Rates used throughout (Old World, ticked once, from data.json):
//   Lumberjack's Hut  +4 Wood        Sawmill      +4 Timber, −4 Wood
//   Sheep Farm        +2 Wool        Framework Knitters +2 Work Clothes, −2 Wool
//   Potato Farm       +2 Potatoes    Schnapps Distillery +2 Schnapps, −2 Potatoes
//   Fishery           +2 Fish        Pig Farm     +1 Pigs
//   Slaughterhouse    +1 Sausages, −1 Pigs
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

let failures = 0;
const fail = (m) => {
  console.error(`FAIL - ${m}`);
  failures++;
};
const ok = (m) => console.log(`ok - ${m}`);

const root = path.join(__dirname, "..");
const build = path.join(__dirname, "build");
execSync(
  // --jsx: routes.ts imports the ShipItem type from store.tsx, and ledger.ts
  // imports CheckItem. The imports are erased, but tsc still resolves them.
  `npx tsc src/lib/routes.ts --outDir tests/build --rootDir src/lib ` +
    `--module commonjs --target es2020 --resolveJsonModule --esModuleInterop ` +
    `--skipLibCheck --jsx react-jsx`,
  { cwd: root, stdio: "pipe" }
);
fs.mkdirSync(build, { recursive: true });
for (const f of ["data.json", "data-117.json"])
  fs.copyFileSync(path.join(root, "src/lib", f), path.join(build, f));
const L = require("./build/ledger.js");
const R = require("./build/routes.js");

const OW = 1;
const TRADE = "Trade route";
const HOLDS = { Schooner: 2, Clipper: 4, "Cargo Ship": 6, Gunboat: 1 };
const near = (a, b) => Math.abs(a - b) < 1e-6;

/** Build the islands' ledgers exactly as TrackerView does: each island's own
 *  rows, then ONE `applyTrade` across all of them, since an export subtracts
 *  from its source and lands on its destination. */
function settle(isles, flows) {
  const ledgers = {};
  const regions = {};
  for (const [name, items] of Object.entries(isles)) {
    ledgers[name] = L.islandLedger(
      items.map((t) => (typeof t === "string" ? { t, done: true } : t)),
      "anno1800",
      OW
    );
    regions[name] = OW;
  }
  L.applyTrade(ledgers, regions, flows, "anno1800");
  return ledgers;
}

/** The board, with the fleet's own defaults filled in. */
function board({ isles, links = [], ships = [], islands, holds = HOLDS }) {
  const flows = [
    ...links,
    ...ships.flatMap((s) =>
      s.from && s.to && s.cargo?.length
        ? s.cargo.map((g) => ({ good: g, from: s.from, to: s.to }))
        : []
    ),
  ];
  return R.routeBoard({
    links,
    ships,
    islands: islands || Object.keys(isles),
    ledgers: settle(isles, flows),
    holds,
    tradeJob: TRADE,
    gone: ["Destroyed", "Decommissioned"],
  });
}

const legOf = (b, from, to) => b.legs.find((l) => l.from === from && l.to === to);
const kinds = (leg) => (leg ? leg.notes.map((n) => n.kind).sort() : ["<no such leg>"]);
const hasKind = (leg, k) => !!leg && leg.notes.some((n) => n.kind === k);

// --- a healthy run: one link, one hull, the right tonnage -------------------
//
// Woodhaven makes +4 Wood and uses none. Millport has a Sawmill, which eats
// 4 Wood to make 4 Timber, so it is 4 short. The link carries exactly 4 — the
// whole surplus, the whole shortfall — and the Pelican is carrying it, so
// there is nothing to say about this run at all.
{
  const b = board({
    isles: { Woodhaven: ["Lumberjack's Hut"], Millport: ["Sawmill"] },
    links: [{ good: "Wood", from: "Woodhaven", to: "Millport" }],
    ships: [
      { name: "Pelican", type: "Clipper", doing: TRADE, from: "Woodhaven", to: "Millport", cargo: ["Wood"] },
    ],
  });
  if (b.legs.length !== 1) fail(`one link + one ship on the same pair is ONE leg, got ${b.legs.length}`);
  const leg = legOf(b, "Woodhaven", "Millport");
  if (!leg) fail("the Woodhaven → Millport leg should exist");
  else {
    if (leg.notes.length) fail(`a healthy run should say nothing: ${JSON.stringify(kinds(leg))}`);
    if (leg.goods.length !== 1 || leg.goods[0].good !== "Wood")
      fail(`the leg carries Wood only: ${JSON.stringify(leg.goods)}`);
    else if (!near(leg.goods[0].tpm, 4))
      fail(`4 t/min of Wood moves, board says ${leg.goods[0].tpm}`);
    if (!leg.goods[0].linked) fail("the good is a ticked link and should say so");
    if (leg.goods[0].ships.join() !== "Pelican") fail("the Pelican should be named on the good");
    if (leg.ships.length !== 1 || leg.ships[0].holds !== 4)
      fail(`the Clipper's 4 cargo slots should come through: ${JSON.stringify(leg.ships)}`);
  }
  if (b.issues || b.ideas) fail(`a healthy run is 0 issues / 0 ideas, got ${b.issues}/${b.ideas}`);
  ok("healthy run — link + hull on one leg, carrying the ledger's own 4 t/min");
}

// --- a link with nothing carrying it ---------------------------------------
{
  const b = board({
    isles: { Woodhaven: ["Lumberjack's Hut"], Millport: ["Sawmill"] },
    links: [{ good: "Wood", from: "Woodhaven", to: "Millport" }],
    ships: [{ name: "Kestrel", type: "Schooner", doing: "Idle" }],
  });
  const leg = legOf(b, "Woodhaven", "Millport");
  if (!hasKind(leg, "no-ship")) fail(`a carrier-less link must be flagged: ${JSON.stringify(kinds(leg))}`);
  if (leg && leg.ships.length) fail("no ship runs this leg");
  // The idle Kestrel is the hull that could take it — one nudge, off-leg.
  if (!b.loose.some((n) => n.kind === "idle"))
    fail(`an idle hull beside an uncarried run should be mentioned: ${JSON.stringify(b.loose)}`);
  ok("no-ship — a ticked link with no hull, and the idle hull that could take it");
}
{
  // …but an idle hull with every run carried is NOT news.
  const b = board({
    isles: { Woodhaven: ["Lumberjack's Hut"], Millport: ["Sawmill"] },
    links: [{ good: "Wood", from: "Woodhaven", to: "Millport" }],
    ships: [
      { name: "Pelican", type: "Clipper", doing: TRADE, from: "Woodhaven", to: "Millport", cargo: ["Wood"] },
      { name: "Kestrel", type: "Schooner", doing: "Idle" },
    ],
  });
  if (b.loose.length) fail(`nothing uncarried means no idle nudge: ${JSON.stringify(b.loose)}`);
  ok("no-ship — the idle nudge stays quiet when every run has a carrier");
}

// --- two hulls on one good, and the idea that follows -----------------------
//
// Both ships run Woodhaven → Millport. Between them they carry Wood and
// Timber — 2 distinct goods — and the Pelican is a Clipper with 4 slots, so
// one hull covers the lot and the Kestrel is free.
{
  const b = board({
    isles: {
      Woodhaven: ["Lumberjack's Hut", "Lumberjack's Hut", "Sawmill"],
      Millport: ["Framework Knitters"],
    },
    ships: [
      { name: "Pelican", type: "Clipper", doing: TRADE, from: "Woodhaven", to: "Millport", cargo: ["Wood", "Timber"] },
      { name: "Kestrel", type: "Schooner", doing: TRADE, from: "Woodhaven", to: "Millport", cargo: ["Wood"] },
    ],
  });
  const leg = legOf(b, "Woodhaven", "Millport");
  if (!hasKind(leg, "duplicate")) fail(`two hulls on Wood is a duplicate: ${JSON.stringify(kinds(leg))}`);
  const merge = leg && leg.notes.find((n) => n.kind === "merge");
  if (!merge) fail(`2 goods into a 4-slot Clipper is a merge idea: ${JSON.stringify(kinds(leg))}`);
  else {
    if (!merge.idea) fail("a merge is an idea, not a fault");
    if (!merge.text.includes("Pelican") || !merge.text.includes("Kestrel"))
      fail(`the idea should name the keeper and the freed hull: ${merge.text}`);
  }
  if (b.ideas !== 1) fail(`one idea here, got ${b.ideas}`);
  if (b.issues < 1) fail("the duplicate is still an issue");
  ok("duplicate + merge — two hulls on one good, and the Clipper that holds both");
}
{
  // The same two ships, but between them they carry 3 goods and the biggest
  // hull is a 2-slot Schooner — so there is no merge to suggest.
  const b = board({
    isles: { Woodhaven: ["Lumberjack's Hut", "Sheep Farm", "Potato Farm"], Millport: ["Sawmill"] },
    ships: [
      { name: "Kestrel", type: "Schooner", doing: TRADE, from: "Woodhaven", to: "Millport", cargo: ["Wood", "Wool"] },
      { name: "Tern", type: "Schooner", doing: TRADE, from: "Woodhaven", to: "Millport", cargo: ["Potatoes"] },
    ],
  });
  if (b.ideas) fail(`3 goods do not fit a 2-slot Schooner — no merge: ${b.ideas}`);
  ok("merge — not suggested when the goods don't fit the biggest hold");
}

// --- more goods than slots --------------------------------------------------
//
// A cargo slot holds up to 50 t of ONE good (Anno 1800 Wiki, Ships properties
// rev 27275), so 3 goods need 3 slots and a 2-slot Schooner cannot do it.
{
  const b = board({
    isles: { Woodhaven: ["Lumberjack's Hut", "Sheep Farm", "Potato Farm"], Millport: ["Sawmill"] },
    ships: [
      {
        name: "Kestrel",
        type: "Schooner",
        doing: TRADE,
        from: "Woodhaven",
        to: "Millport",
        cargo: ["Wood", "Wool", "Potatoes"],
      },
    ],
  });
  const leg = legOf(b, "Woodhaven", "Millport");
  if (!hasKind(leg, "overloaded")) fail(`3 goods in a 2-slot Schooner: ${JSON.stringify(kinds(leg))}`);
  ok("overloaded — 3 goods will not ride in a Schooner's 2 slots");
}
{
  // A hull we have no number for gets NO check rather than a guessed one.
  const b = board({
    isles: { Woodhaven: ["Lumberjack's Hut", "Sheep Farm", "Potato Farm"], Millport: ["Sawmill"] },
    ships: [
      {
        name: "Nimbus",
        type: "Airship",
        doing: TRADE,
        from: "Woodhaven",
        to: "Millport",
        cargo: ["Wood", "Wool", "Potatoes"],
      },
    ],
  });
  const leg = legOf(b, "Woodhaven", "Millport");
  if (hasKind(leg, "overloaded")) fail("an unknown hull size must not produce a made-up verdict");
  if (leg && leg.ships[0].holds !== undefined) fail("an unknown type carries no hold number");
  ok("overloaded — an unknown hull is left alone, not guessed at");
}

// --- the destination makes its own now --------------------------------------
//
// Fishlea sends Fish to Pantry, which has a Fishery of its own (+2, using
// none). Its own production covers its own use with nothing imported, so the
// run has outlived itself.
{
  const b = board({
    isles: { Fishlea: ["Fishery"], Pantry: ["Fishery"] },
    links: [{ good: "Fish", from: "Fishlea", to: "Pantry" }],
    ships: [{ name: "Gull", type: "Schooner", doing: TRADE, from: "Fishlea", to: "Pantry", cargo: ["Fish"] }],
  });
  const leg = legOf(b, "Fishlea", "Pantry");
  if (!hasKind(leg, "covered")) fail(`Pantry makes its own Fish: ${JSON.stringify(kinds(leg))}`);
  ok("covered — a run into an island that now makes enough of its own");
}
{
  // The trap this must NOT fall into: applyTrade deliberately dumps a spare
  // surplus on an island with no tracked consumer at all (its own docs' cotton
  // -to-Cape-Trelawney case). Bayside makes no Wool and uses none, so its row
  // exists only because the route created it — local production is zero, and
  // zero is not "makes its own".
  const b = board({
    isles: { Woolwich: ["Sheep Farm"], Bayside: ["Fishery"] },
    links: [{ good: "Wool", from: "Woolwich", to: "Bayside" }],
    ships: [{ name: "Gull", type: "Schooner", doing: TRADE, from: "Woolwich", to: "Bayside", cargo: ["Wool"] }],
  });
  const leg = legOf(b, "Woolwich", "Bayside");
  if (hasKind(leg, "covered"))
    fail("a spare surplus landing where nothing tracked eats it is NOT a stale route");
  if (leg && !near(leg.goods[0].tpm, 2)) fail(`the 2 t/min still shows: ${leg && leg.goods[0].tpm}`);
  ok("covered — an untracked consumer at the far end is left alone");
}
{
  // Nor is a relay: Middle makes its own Fish AND passes some on, so it is a
  // link in a chain, not a dead end.
  const b = board({
    isles: { Fishlea: ["Fishery"], Middle: ["Fishery"], Far: ["Fishery", "Fishery"] },
    links: [
      { good: "Fish", from: "Fishlea", to: "Middle" },
      { good: "Fish", from: "Middle", to: "Far" },
    ],
    ships: [
      { name: "Gull", type: "Schooner", doing: TRADE, from: "Fishlea", to: "Middle", cargo: ["Fish"] },
      { name: "Tern", type: "Schooner", doing: TRADE, from: "Middle", to: "Far", cargo: ["Fish"] },
    ],
  });
  if (hasKind(legOf(b, "Fishlea", "Middle"), "covered"))
    fail("an island that re-exports is a relay, not a stale destination");
  ok("covered — a relay island is not mistaken for a run that outlived itself");
}

// --- on the run, but not moving ----------------------------------------------
//
// Manola's 2 Sugar Cane Plantations (+4) feed its 2 Rum Distilleries (−4)
// exactly, so there is no Sugar Cane spare. The route carries it anyway — a
// slot spent on nothing, and in a 2-slot Schooner already carrying Cotton and
// Rum it is precisely the good to drop.
{
  const b = board({
    isles: {
      Manola: ["Sugar Cane Plantation", "Sugar Cane Plantation", "Rum Distillery", "Rum Distillery"],
      Crown: ["Fishery"],
    },
    ships: [
      {
        name: "Albatross",
        type: "Schooner",
        doing: TRADE,
        from: "Manola",
        to: "Crown",
        cargo: ["Rum", "Sugar Cane"],
      },
    ],
  });
  const leg = legOf(b, "Manola", "Crown");
  const note = leg && leg.notes.find((n) => n.kind === "empty");
  if (!note) fail(`Sugar Cane has nothing spare to send: ${JSON.stringify(kinds(leg))}`);
  else if (!note.text.includes("Sugar Cane") || note.text.includes("Rum"))
    fail(`only the stuck good should be named: ${note.text}`);
  const cane = leg && leg.goods.find((g) => g.good === "Sugar Cane");
  if (!cane || cane.tpm !== 0) fail(`the run shows it at 0 t/min: ${JSON.stringify(cane)}`);
  ok("empty — a good on a run with nothing spare at the source to send");
}
{
  // One note however many goods are stuck: early on, a lot of runs are set up
  // before the production is, and that should read as a line not a wall.
  //
  // Every chain on Manola is consumed to the last ton — Wood 4−4, Wool 2−2,
  // Potatoes 2−2 — so all three goods it ships are pinned at zero.
  const b = board({
    isles: {
      Manola: [
        "Lumberjack's Hut",
        "Sawmill",
        "Sheep Farm",
        "Framework Knitters",
        "Potato Farm",
        "Schnapps Distillery",
      ],
      Crown: ["Fishery"],
    },
    ships: [
      { name: "Albatross", type: "Cargo Ship", doing: TRADE, from: "Manola", to: "Crown", cargo: ["Wood", "Wool", "Potatoes"] },
    ],
  });
  const leg = legOf(b, "Manola", "Crown");
  const stuck = leg ? leg.notes.filter((n) => n.kind === "empty") : [];
  if (stuck.length !== 1) fail(`three stuck goods is ONE note, got ${stuck.length}`);
  ok("empty — one line per run, not one per good");
}
{
  // A leg out of an island you don't hold has no ledger to ask, so there is no
  // figure — and "no figure" must not be read as zero.
  const b = board({
    isles: { Crown: ["Fishery"] },
    islands: ["Crown"],
    ships: [
      { name: "Albatross", type: "Schooner", doing: TRADE, from: "Old Nate's", to: "Crown", cargo: ["Rum"] },
    ],
  });
  const leg = legOf(b, "Old Nate's", "Crown");
  if (leg && leg.notes.some((n) => n.kind === "empty"))
    fail("an unmeasurable leg is not a leg measured at zero");
  if (leg && leg.goods[0].tpm !== undefined) fail("no ledger means no figure");
  ok("empty — an island you don't hold has no figure, which is not a zero");
}

// --- an end of the leg that isn't yours --------------------------------------
{
  const b = board({
    isles: { Woodhaven: ["Lumberjack's Hut"] },
    islands: ["Woodhaven"],
    ships: [
      { name: "Pelican", type: "Clipper", doing: TRADE, from: "Woodhaven", to: "Old Nate's", cargo: ["Wood"] },
    ],
  });
  const leg = legOf(b, "Woodhaven", "Old Nate's");
  if (!hasKind(leg, "orphan")) fail(`a leg to a non-island should say so: ${JSON.stringify(kinds(leg))}`);
  else if (!leg.notes.find((n) => n.kind === "orphan").text.includes("Old Nate's"))
    fail("the note should name the end that isn't yours");
  ok("orphan — a run to somewhere that isn't on your island list");
}

// --- traders that haven't said what, or where --------------------------------
{
  const b = board({
    isles: { Woodhaven: ["Lumberjack's Hut"], Millport: ["Sawmill"] },
    ships: [
      { name: "Drifter", type: "Schooner", doing: TRADE },
      { name: "Mute", type: "Clipper", doing: TRADE, from: "Woodhaven", to: "Millport" },
      // A warship with no route is not a broken trade run.
      { name: "Bulldog", type: "Gunboat", doing: "Patrol" },
    ],
  });
  if (!b.loose.some((n) => n.kind === "no-route" && n.text.includes("Drifter")))
    fail(`a trader with no from/to should be listed: ${JSON.stringify(b.loose)}`);
  if (b.loose.some((n) => n.text.includes("Bulldog")))
    fail("a patrolling gunboat is not a half-finished trade route");
  if (!hasKind(legOf(b, "Woodhaven", "Millport"), "no-cargo"))
    fail("a trader with a route but no cargo should be flagged on its leg");
  ok("half-finished traders — no route, and no cargo, each said once");
}

// --- a sunk trader is a wreck, not a missing hull ----------------------------
{
  const b = board({
    isles: { Woodhaven: ["Lumberjack's Hut"], Millport: ["Sawmill"] },
    links: [{ good: "Wood", from: "Woodhaven", to: "Millport" }],
    ships: [
      { name: "Pelican", type: "Clipper", doing: "Destroyed", from: "Woodhaven", to: "Millport", cargo: ["Wood"] },
    ],
  });
  const leg = legOf(b, "Woodhaven", "Millport");
  if (leg && leg.ships.length) fail("a destroyed ship is off the fleet and off the board");
  if (!hasKind(leg, "no-ship")) fail("losing the carrier leaves the link uncarried — say so");
  ok("wrecks — a sunk trader stops counting as the hull on its run");
}

// --- names typed three different ways ----------------------------------------
//
// Islands, links and ship routes are all free text, so the same island gets
// typed with different casing and spacing. One leg, not three.
{
  const b = board({
    isles: { Woodhaven: ["Lumberjack's Hut"], Millport: ["Sawmill"] },
    links: [{ good: "Wood", from: "woodhaven", to: " MILLPORT " }],
    ships: [
      { name: "Pelican", type: "clipper", doing: TRADE, from: "Woodhaven ", to: "millport", cargo: [" wood "] },
    ],
  });
  if (b.legs.length !== 1) fail(`case and spacing must not split a leg: ${JSON.stringify(b.legs.map((l) => [l.from, l.to]))}`);
  const leg = b.legs[0];
  if (leg.from !== "Woodhaven" || leg.to !== "Millport")
    fail(`the island list's spelling should win: ${leg.from} → ${leg.to}`);
  if (leg.goods.length !== 1) fail(`" wood " and "Wood" are one good: ${JSON.stringify(leg.goods)}`);
  if (leg.ships[0].holds !== 4) fail("a lower-cased type should still find its hold size");
  if (leg.notes.length) fail(`nothing is wrong with this run: ${JSON.stringify(kinds(leg))}`);
  ok("names — case and spacing across islands, goods and hull types all fold together");
}

// --- direction is part of the leg --------------------------------------------
{
  const b = board({
    isles: { Woodhaven: ["Lumberjack's Hut", "Sheep Farm"], Millport: ["Sawmill", "Framework Knitters"] },
    ships: [
      { name: "Pelican", type: "Clipper", doing: TRADE, from: "Woodhaven", to: "Millport", cargo: ["Wood"] },
      { name: "Kestrel", type: "Clipper", doing: TRADE, from: "Millport", to: "Woodhaven", cargo: ["Timber"] },
    ],
  });
  if (b.legs.length !== 2) fail(`out and back are two runs: ${b.legs.length}`);
  ok("direction — A→B and B→A are separate runs");
}

// --- problems first ----------------------------------------------------------
//
// The board is read top-down when you've lost the thread, so a run with a
// fault outranks one with only an idea, which outranks a run that is fine —
// whatever the islands are called.
{
  const b = board({
    isles: {
      Abbey: ["Lumberjack's Hut"],
      Bell: ["Sawmill"],
      Crown: ["Lumberjack's Hut", "Sheep Farm"],
      Dock: ["Sawmill", "Framework Knitters"],
      Ember: ["Fishery"],
      Forge: ["Fishery"],
    },
    // Abbey → Bell is clean. Crown → Dock has two hulls that would fit in one.
    // Ember → Forge sends Fish to an island that makes its own.
    links: [{ good: "Fish", from: "Ember", to: "Forge" }],
    ships: [
      { name: "Pelican", type: "Clipper", doing: TRADE, from: "Abbey", to: "Bell", cargo: ["Wood"] },
      { name: "Kestrel", type: "Clipper", doing: TRADE, from: "Crown", to: "Dock", cargo: ["Wood"] },
      { name: "Tern", type: "Schooner", doing: TRADE, from: "Crown", to: "Dock", cargo: ["Wool"] },
      { name: "Gull", type: "Schooner", doing: TRADE, from: "Ember", to: "Forge", cargo: ["Fish"] },
    ],
  });
  const order = b.legs.map((l) => `${l.from}→${l.to}`);
  if (order[0] !== "Ember→Forge") fail(`the faulty run comes first, got ${JSON.stringify(order)}`);
  if (order[1] !== "Crown→Dock") fail(`the run with an idea comes next, got ${JSON.stringify(order)}`);
  if (order[2] !== "Abbey→Bell") fail(`the clean run goes last, got ${JSON.stringify(order)}`);
  ok("order — faults, then ideas, then the runs that are simply fine");
}

// --- an empty fleet says nothing at all --------------------------------------
{
  const b = board({ isles: { Woodhaven: ["Lumberjack's Hut"] } });
  if (b.legs.length || b.loose.length || b.issues || b.ideas)
    fail(`no links and no ships is an empty board: ${JSON.stringify(b)}`);
  ok("empty — no links and no ships means no board");
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nall route-board checks passed");
