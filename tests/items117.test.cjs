// Structural test for the Anno 117 specialist-items + patrons pack
// (src/lib/items-117.json, M11c) — the items.test.cjs mould: no golden
// reference exists, so what gets enforced is internal coherence plus spot
// checks hand-read from the pinned upstream commit (anno-mods/
// anno-117-calculator @ Release 3.0). A re-extraction that loses the effect
// lines, mangles a guid join, or silently pins a different commit than
// data-117.json should fail here, not ship.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const P = JSON.parse(fs.readFileSync(path.join(ROOT, "src/lib/items-117.json"), "utf8"));

let failures = 0;
const fail = (m) => {
  console.error(`FAIL - ${m}`);
  failures++;
};
const ok = (m) => console.log(`ok - ${m}`);

// --- provenance: pinned, and the SAME commit as the production pack -------
{
  const D = JSON.parse(fs.readFileSync(path.join(ROOT, "src/lib/data-117.json"), "utf8"));
  if (!/^[0-9a-f]{40}$/.test(P.source?.commit || ""))
    fail("source.commit is not a full sha — the pack is not reproducible");
  else if (P.source.commit !== D.source?.commit)
    fail(
      `items pack is cut from ${P.source.commit.slice(0, 7)} but data-117.json from ` +
        `${(D.source?.commit || "?").slice(0, 7)} — re-run whichever extractor lags`
    );
  else ok(`pack ${P.pack} — pinned to ${P.source.commit.slice(0, 7)}, same as data-117.json`);
}

// --- sockets: Villa and Guesthouse shells, items shared -------------------
{
  const got = P.sockets.map((s) => s.id).join();
  if (got !== "villa,gh") fail(`sockets are ${got}, expected villa,gh`);
  else if (P.sockets.some((s) => !s.label || !s.noun || s.items))
    fail("socket shells should carry label+noun and NO items (the list is shared)");
  else ok("sockets — villa + gh shells, one shared item list");
}

// --- counts: floors, not exact — upstream gains items with DLC ------------
{
  if (P.items.length < 170) fail(`only ${P.items.length} items (Release 3.0 has 172)`);
  const byR = P.items.reduce((a, i) => ((a[i.r] = (a[i.r] || 0) + 1), a), {});
  // Hand-counted at 28969c3: 40/48/35/26/16/7.
  const floor = { Common: 38, Rare: 45, Epic: 33, Legendary: 24, Mythic: 14, Unique: 6 };
  let bad = 0;
  for (const [r, f] of Object.entries(floor))
    if ((byR[r] || 0) < f) fail(`${r}: only ${byR[r] || 0} items (floor ${f})`), bad++;
  if (!bad)
    ok(
      `${P.items.length} items — ` +
        P.rarity.map((r) => `${r} ${byR[r] || 0}`).join(", ")
    );
}

// --- every item is well-formed, fx/tgt coverage near-total ----------------
{
  const RAR = new Set(P.rarity);
  let bad = 0;
  const seen = new Set();
  for (const i of P.items) {
    if (!i.n || typeof i.n !== "string") fail("item with no name"), bad++;
    if (seen.has(i.n)) fail(`${i.n}: duplicated`), bad++;
    seen.add(i.n);
    if (!RAR.has(i.r)) fail(`${i.n}: rarity "${i.r}" not in the ladder`), bad++;
    if (/\d{4,}/.test(`${i.tgt || ""} ${i.fx || ""}`))
      fail(`${i.n}: a raw guid leaked into tgt/fx`), bad++;
  }
  // The effect line is the reason the pack exists. Exactly one item lacks it
  // at 28969c3 (Sabazius — his buff is empty in the data itself), and eight
  // buff warehouse-type buildings the calculator doesn't model.
  const noFx = P.items.filter((i) => !i.fx).length;
  const noTgt = P.items.filter((i) => !i.tgt).length;
  if (noFx > 3) fail(`${noFx} items without an effect line — the buff join broke`), bad++;
  if (noTgt > 12) fail(`${noTgt} items without targets — the target join broke`), bad++;
  if (!bad) ok(`items well-formed — ${noFx} without fx, ${noTgt} without targets`);
}

// --- spot checks, hand-read from upstream params.js at 28969c3 ------------
{
  const by = (n) => P.items.find((i) => i.n === n);
  const checks = [
    // buff 44432: productivityUpgrade 20; targets = the five farm kinds
    // (region duplicates collapse: 8 guids, 5 names).
    ["Elephant Handler", (i) => i.r === "Rare" && i.fx === "+20% productivity" &&
      i.tgt === "Oat Farm, Flax Farm, Wheat Farm, Barley Farm, Hemp Farm"],
    // addedFertility 2209 @ fertilityPercent 50 → the yield clause.
    ["Lavendulist", (i) => i.r === "Common" && i.tgt === "Lavender Grower" &&
      i.fx === "grants Lavender Fertility at 50% yield"],
    // "Specialist ProdPools L All Buff" (guid 80222): 115 unique targets →
    // the cap; productivityUpgrade 20, workforceMaintenanceFactorUpgrade -10.
    ["Macrobius Minucianus, Microcosmologist", (i) => i.r === "Legendary" &&
      i.tgt === "All production buildings" &&
      i.fx === "+20% productivity, -10% workforce upkeep"],
    // The one empty buff in the data — no fx, but the DLC tag survives.
    ["Sabazius, Dionysian Devotee", (i) => !i.fx && i.dlc === "The Hippodrome"],
    ["Servia Bellia, Lily of the Coast", (i) => /\+25% productivity/.test(i.fx || "")],
  ];
  let bad = 0;
  for (const [n, test] of checks) {
    const i = by(n);
    if (!i) fail(`spot check: "${n}" missing from the pack`), bad++;
    else if (!test(i)) fail(`spot check: "${n}" reads ${JSON.stringify(i)}`), bad++;
  }
  if (!bad) ok(`${checks.length} spot checks against hand-read upstream values`);
}

// --- patrons: the 8 deities, effects quoted at full devotion --------------
{
  const names = P.patrons.map((p) => p.n).join(",");
  const want = "Mars,Ceres,Neptune,Mercury-Lugus,Epona,Cernunnos,Minerva,Vulcan";
  if (names !== want) fail(`patrons are ${names}`);
  else ok("8 patrons, upstream order");

  const by = (n) => P.patrons.find((p) => p.n === n);
  let bad = 0;
  // Mars buff is productivityUpgrade 1 × top milestone buffScaling 150.
  if (!/Armamentum — up to \+150% productivity/.test(by("Mars").fx[0] || ""))
    fail(`Mars reads ${JSON.stringify(by("Mars").fx)}`), bad++;
  // Ceres: two local effects and the plough wonder.
  const ceres = by("Ceres");
  if (ceres.fx.length !== 2 || ceres.wonder !== "Vervactor's Plough")
    fail(`Ceres reads ${JSON.stringify(ceres)}`), bad++;
  if (!/\+7 population/.test(ceres.fx[1] || ""))
    fail(`Confarreatio lost its population line: ${ceres.fx[1]}`), bad++;
  // Mercury-Lugus genuinely has no production effects in the data.
  if (by("Mercury-Lugus").fx.length !== 0)
    fail("Mercury-Lugus grew effects — drop the empty-fx fallback copy"), bad++;
  if (by("Vulcan").dlc !== "Prophecies of Ash")
    fail(`Vulcan's dlc reads "${by("Vulcan").dlc}"`), bad++;
  if (!bad) ok("patron spot checks — Mars ceiling, Ceres pair + wonder, Vulcan DLC");
}

console.log(failures ? `\n${failures} failure(s)` : "\nall good");
process.exit(failures ? 1 : 0);
