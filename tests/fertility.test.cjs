// Island fertilities (build 122): the 1800 table is hand-copied from the wiki
// ("Fertilities and resources", rev 25668) and 117's is derived from its data
// pack, so what gets pinned here is (a) the 1800 rows as read off the page,
// (b) that Cape Trelawney borrows the Old World row and the two fold into one
// group, (c) that 117's derivation finds the crops, fish and mines the pack
// tags — and (d) the "lacks" maths itself.
const { execSync } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");
execSync(
  `npx tsc src/lib/fertility.ts --outDir tests/build/lib --rootDir src/lib --module commonjs ` +
    `--target es2020 --resolveJsonModule --esModuleInterop --skipLibCheck`,
  { cwd: ROOT, stdio: "inherit" }
);
const F = require(path.join(ROOT, "tests/build/lib/fertility.js"));

let failures = 0;
const fail = (m) => {
  console.error(`FAIL - ${m}`);
  failures++;
};
const ok = (m) => console.log(`ok - ${m}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- 1800: the wiki rows -----------------------------------------------------
{
  const p = F.fertilitiesFor("anno1800");
  if (!p) fail("1800 has no fertility pack");
  else {
    if (!same(p.ow.fert, ["Potatoes", "Grain", "Hops", "Red Peppers", "Furs", "Saltpetre", "Grapes"]))
      fail(`OW fertilities drifted: ${p.ow.fert.join(", ")}`);
    else ok("OW fertilities — the seven the wiki lists");
    if (p.ow.deposits.length !== 7 || !p.ow.deposits.includes("Zinc"))
      fail(`OW deposits: ${p.ow.deposits.join(", ")}`);
    else ok("OW deposits — seven, Zinc among them");
    if (p.nw.fert.length !== 11 || !p.nw.fert.includes("Orchid") || !p.nw.fert.includes("Herbs"))
      fail(`NW fertilities: ${p.nw.fert.join(", ")}`);
    else ok("NW fertilities — eleven incl. the New World Rising pair");
    if (!same(p.ar.deposits, ["Gold Ore", "Gas"])) fail(`Arctic deposits: ${p.ar.deposits}`);
    else ok("Arctic deposits — Gold Ore, Gas");
    if (!same(p.en.deposits, ["Clay"]) || p.en.fert.length !== 7) fail("Enbesa row drifted");
    else ok("Enbesa — seven fertilities, Clay only");
    if (p.ct) fail("ct should not have its own row — it aliases ow");
    else ok("Cape Trelawney has no row of its own");
  }
  // Alias: the Cape borrows the Old World list.
  if (F.regionFertility("anno1800", "ct") !== F.regionFertility("anno1800", "ow"))
    fail("regionFertility(ct) should be the ow row");
  else ok("regionFertility — Cape Trelawney borrows the Old World row");
  if (F.regionFertility("anno1800", "") !== null || F.regionFertility("anno1800", "none") !== null)
    fail("untagged / 'none' islands should have no list");
  else ok("regionFertility — blank and 'none' tags return null");
  // Groups: ow+ct fold together, in regionLabels order.
  const g = F.fertilityGroups("anno1800");
  if (!same(g.map((x) => x.key), ["ow", "nw", "ar", "en"])) fail(`groups: ${g.map((x) => x.key)}`);
  else ok("fertilityGroups — ow nw ar en");
  if (g[0].label !== "Old World · Cape Trelawney") fail(`ow group label: ${g[0].label}`);
  else ok("fertilityGroups — the first is labelled 'Old World · Cape Trelawney'");
}

// --- 117: derived from the pack ---------------------------------------------
{
  const p = F.fertilitiesFor("anno117");
  if (!p || !p.la || !p.al) fail("117 pack should have la + al rows");
  else {
    const want = ["Lavender Fertility", "Olive Fertility", "Grape Fertility", "Mackerel Population"];
    const miss = want.filter((n) => !p.la.fert.includes(n));
    if (miss.length) fail(`Latium fertilities missing ${miss.join(", ")}`);
    else ok("Latium — lavender, olives, grapes, mackerel found");
    if (!p.la.deposits.includes("Iron Deposit") || !p.la.deposits.includes("Marble Deposit"))
      fail(`Latium deposits: ${p.la.deposits.join(", ")}`);
    else ok("Latium — Iron and Marble deposits classified as deposits");
    if (!p.al.fert.includes("Beaver Population") || !p.al.deposits.includes("Tin Deposit"))
      fail(`Albion: ${p.al.fert.join(", ")} / ${p.al.deposits.join(", ")}`);
    else ok("Albion — beavers and tin");
    if (p.la.fert.some((n) => / Deposit$/.test(n)) || p.al.deposits.some((n) => !/ Deposit$/.test(n)))
      fail("a deposit landed in fert or vice versa");
    else ok("117 — nothing misfiled between fert and deposits");
    const sorted = [...p.la.fert].sort((a, b) => a.localeCompare(b));
    if (!same(sorted, p.la.fert)) fail("117 lists should be sorted");
    else ok("117 — lists sorted");
  }
  if (F.shortFertName("Lavender Fertility") !== "Lavender" || F.shortFertName("Furs") !== "Furs")
    fail("shortFertName");
  else ok("shortFertName — strips the 117 suffix, leaves 1800 names alone");
}

// --- Tracker-only games: no feature -------------------------------------------
for (const g of ["anno1404", "anno2070"]) {
  if (F.fertilitiesFor(g) !== null || F.fertilityGroups(g).length) fail(`${g} should have no pack`);
  else ok(`${g} — no pack, feature hidden`);
}

// --- the "lacks" maths --------------------------------------------------------
{
  const regions = { Ditchwater: "ow", Crown: "ct", Falls: "nw", Bare: "nw", Ice: "ar" };
  const have = {
    Ditchwater: ["Potatoes", "Grain", "Clay", "Iron"],
    Crown: ["Hops", "Grapes", "Coal", "Zinc", "Copper", "Oil", "Cement", "Furs"],
    Falls: ["Cocoa", "Gold Ore", "Not A Real One"],
  };
  const gaps = F.missingFertilities(
    "anno1800",
    Object.keys(regions),
    (n) => regions[n],
    (n) => have[n] || []
  );
  const keys = gaps.map((g) => g.key);
  // Arctic has an island but nothing ticked -> silent; Enbesa has no island.
  if (!same(keys, ["ow", "nw"])) fail(`gap groups: ${keys}`);
  else ok("missingFertilities — only regions with a tick report (ow, nw)");
  const ow = gaps[0];
  if (!same(ow.islands, ["Ditchwater", "Crown"])) fail(`ow islands: ${ow.islands}`);
  else ok("missingFertilities — Cape island pooled with the Old World one");
  if (!same(ow.missing.fert, ["Red Peppers", "Saltpetre"])) fail(`ow missing fert: ${ow.missing.fert}`);
  else ok("missingFertilities — OW lacks Red Peppers + Saltpetre across both islands");
  if (ow.missing.deposits.length !== 0) fail(`ow missing deposits: ${ow.missing.deposits}`);
  else ok("missingFertilities — every OW deposit covered between the two");
  const nw = gaps[1];
  if (nw.missing.fert.length !== 10 || nw.missing.fert.includes("Cocoa"))
    fail(`nw missing fert: ${nw.missing.fert}`);
  else ok("missingFertilities — NW lacks the ten fertilities that aren't Cocoa");
  if (nw.missing.deposits.includes("Gold Ore") || nw.missing.deposits.length !== 6)
    fail(`nw missing deposits: ${nw.missing.deposits}`);
  else ok("missingFertilities — a stray unknown name is ignored, Gold Ore counted");
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nfertility: all good");
