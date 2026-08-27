// The Anno 1800 island ledger (src/lib/ledger.ts) — the Tracker's inventory.
//
// The engine has tests/legacy.html to check itself against; the ledger has no
// such reference, because it answers questions the legacy app never asked:
// which buildings a given island can even have, and how many to build when a
// chain runs short. This pins the parts that are NOT derivable from data.json:
// the hacienda modules (Seeds of Change), the Charcoal Kiln's three regions,
// and the region a shortfall is priced in.
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
  // --jsx: ledger imports the CheckItem type from store.tsx. The import is
  // erased, but tsc still resolves the file.
  `npx tsc src/lib/ledger.ts --outDir tests/build --rootDir src/lib ` +
    `--module commonjs --target es2020 --resolveJsonModule --esModuleInterop ` +
    `--skipLibCheck --jsx react-jsx`,
  { cwd: root, stdio: "pipe" }
);
fs.mkdirSync(build, { recursive: true });
for (const f of ["data.json", "data-117.json"])
  fs.copyFileSync(path.join(root, "src/lib", f), path.join(build, f));
const L = require("./build/ledger.js");

const OW = 1;
const NW = 2;
const AR = 4;
const EN = 5;
const rows = (items, region) => L.islandLedger(items, "anno1800", region);
const row = (items, name, region) => rows(items, region).find((r) => r.name === name);
const near = (a, b) => Math.abs(a - b) < 1e-9;

// --- what each region offers ---------------------------------------------
// Availability is worked out from the good, which is right for most buildings
// and wrong for the two kinds below.
{
  const ow = L.buildingOptionsFor(OW);
  const nw = L.buildingOptionsFor(NW);
  const ar = L.buildingOptionsFor(AR);
  const en = L.buildingOptionsFor(EN);

  // A hacienda grows Old World crops in the New World — and only there.
  for (const b of ["Hacienda Potato Farm", "Hacienda Grain Farm", "Hacienda Spice Farm"]) {
    if (!nw.includes(b)) fail(`New World options missing ${b}`);
    if (ow.includes(b)) fail(`Old World options wrongly offer ${b}`);
  }
  // The plain farms stay put: you cannot build one on a New World island.
  for (const b of ["Potato Farm", "Grain Farm"])
    if (nw.includes(b)) fail(`New World options wrongly offer ${b} (hacienda only)`);
  if (!en.includes("Spice Farm")) fail("Enbesa options missing Spice Farm");
  if (!ow.includes("Potato Farm")) fail("Old World options missing Potato Farm");
  ok("hacienda farms are offered in the New World, and only there");

  // The kiln is Old World by its good, but is buildable in three regions.
  for (const [label, list] of [
    ["Old World", ow],
    ["New World", nw],
    ["Arctic", ar],
  ])
    if (!list.includes("Charcoal Kiln")) fail(`${label} options missing Charcoal Kiln`);
  if (nw.includes("Coal Mine")) fail("New World options wrongly offer Coal Mine");
  ok("Charcoal Kiln is offered in the Old World, New World and Arctic");
}

// --- hacienda rates and chains -------------------------------------------
// The farms match their non-hacienda twin ton for ton; the breweries don't.
{
  const potato = row([{ t: "Hacienda Potato Farm", done: true }], "Potatoes", NW);
  if (!potato || !near(potato.produced, 2))
    fail(`Hacienda Potato Farm should make 2 t/min, got ${JSON.stringify(potato)}`);

  // Hacienda schnapps: 60s a ton, against the Old World distillery's 30s.
  const hs = rows([{ t: "Hacienda Schnapps Distillery", done: true }], NW);
  const ow = rows([{ t: "Schnapps Distillery", done: true }], OW);
  if (!near(hs.find((r) => r.name === "Schnapps").produced, 1))
    fail("Hacienda Schnapps Distillery should make 1 t/min");
  if (!near(ow.find((r) => r.name === "Schnapps").produced, 2))
    fail("the Old World Schnapps Distillery should still make 2 t/min");
  if (!near(hs.find((r) => r.name === "Potatoes").used, 1))
    fail("Hacienda Schnapps Distillery should eat 1 t/min Potatoes");

  // Hacienda beer is brewed from Grain and Corn, not Hops and Malt.
  const beer = rows([{ t: "Hacienda Beer Brewery", done: true }], NW);
  const uses = (n) => beer.find((r) => r.name === n)?.used || 0;
  if (!near(beer.find((r) => r.name === "Beer").produced, 1))
    fail("Hacienda Beer Brewery should make 1 t/min Beer");
  if (!near(uses("Grain"), 1) || !near(uses("Corn"), 1))
    fail(`Hacienda Beer Brewery should eat 1 Grain + 1 Corn, got ${JSON.stringify(beer)}`);
  if (uses("Hops") || uses("Malt")) fail("Hacienda Beer Brewery should not eat Hops or Malt");
  ok("hacienda brewery rates and chains match the game, not their Old World twins");
}

// --- a shortfall is priced in the island's own region ---------------------
// The New World's Cattle Farm makes 1 t/min against the Old World's 0.5, so the
// same gap needs half as many — and the other building's name.
{
  // 6 Artisanal Kitchens eat 6 x 0.5 = 3 t/min of Beef.
  const kitchens = [{ t: "Artisanal Kitchen", n: 6, done: true }];
  const owFix = row(kitchens, "Beef", OW)?.fix;
  if (owFix?.building !== "Cattle Farm" || owFix.count !== 6)
    fail(`3 t/min of Beef short in the Old World needs 6x Cattle Farm, got ${JSON.stringify(owFix)}`);

  // A Tortilla Maker eats 2 t/min of Beef — two New World farms' worth.
  const nwFix = row([{ t: "Tortilla Maker", done: true }], "Beef", NW)?.fix;
  if (nwFix?.building !== "Cattle Farm (New World)" || nwFix.count !== 2)
    fail(`2 t/min of Beef short in the New World needs 2x Cattle Farm (New World), got ${JSON.stringify(nwFix)}`);

  // An island with no region tag keeps the old answer — the Old World's.
  const untagged = row([{ t: "Tortilla Maker", done: true }], "Beef")?.fix;
  if (untagged?.building !== "Cattle Farm" || untagged.count !== 4)
    fail(`an untagged island should fall back to the Old World farm, got ${JSON.stringify(untagged)}`);

  // Potatoes in the New World come by hacienda alone, so that is what a gap
  // there should ask for.
  const spuds = row([{ t: "Hacienda Schnapps Distillery", done: true }], "Potatoes", NW)?.fix;
  if (spuds?.building !== "Hacienda Potato Farm" || spuds.count !== 1)
    fail(`a New World Potatoes gap should name the hacienda farm, got ${JSON.stringify(spuds)}`);
  ok("shortfalls are sized and named for the island's own region");
}

// --- nothing else moved ---------------------------------------------------
// The ledger's existing behaviour, in one line each: a chain, the silo, power.
{
  const bakery = rows([{ t: "Bakery", done: true }], OW);
  if (!near(bakery.find((r) => r.name === "Bread").produced, 1))
    fail("a Bakery should still make 1 t/min Bread");
  if (!near(bakery.find((r) => r.name === "Flour").used, 1))
    fail("a Bakery should still eat 1 t/min Flour");
  if (!L.siloCapable("Cattle Farm") || L.siloCapable("Bakery"))
    fail("silo capability moved");
  if (!L.elecCapable("Bakery") || L.elecCapable("Rum Distillery"))
    fail("electricity capability moved");
  // 2 Sheep Farms, 1 silo'd: (2 + 1) x 2 = 6 t/min, and 0.2 t/min of Grain feed.
  const sheep = rows([{ t: "Sheep Farm", n: 2, s: 1, done: true }], OW);
  if (!near(sheep.find((r) => r.name === "Wool").produced, 6))
    fail("2 Sheep Farms, 1 silo'd should make 6 t/min Wool");
  if (!near(sheep.find((r) => r.name === "Grain").used, 0.2))
    fail("one silo should eat 0.2 t/min of Grain");
  ok("chains, silos and electricity are unchanged");
}

// --- end products are flagged, intermediates are not ----------------------
// The UI dims `final` rows (pop goods, construction materials) so the rows
// that should balance to 0 stand out. Finality is the good's `isFinal` (it
// has a pop tier), carried through the region-merged display name.
{
  const soapChain = rows(
    [
      { t: "Rendering Works", n: 2, done: true },
      { t: "Soap Factory", n: 4, done: true },
    ],
    OW
  );
  if (soapChain.find((r) => r.name === "Soap")?.final !== true)
    fail("Soap (a pop need) should be flagged final");
  for (const g of ["Tallow", "Pigs"])
    if (soapChain.find((r) => r.name === g)?.final)
      fail(`${g} is a chain intermediate and should not be flagged final`);

  // Timber has a tier (construction material) even though residents never eat
  // it; Wood does not — that pair is the whole point of the flag.
  const timber = rows(
    [
      { t: "Sawmill", n: 3, done: true },
      { t: "Lumberjack's Hut", n: 3, done: true },
    ],
    OW
  );
  if (timber.find((r) => r.name === "Timber")?.final !== true)
    fail("Timber (construction material) should be flagged final");
  if (timber.find((r) => r.name === "Wood")?.final)
    fail("Wood should not be flagged final");

  // A final consumed as an input keeps its flag on a used-only row: a shampoo
  // plant with no local soap production still shows Soap as a (dimmed) final.
  const shampoo = L.islandLedger([{ t: "Chemical Plant: Shampoo", done: true }], "anno1800", OW);
  if (shampoo.find((r) => r.name === "Soap")?.final !== true)
    fail("Soap consumed as an input should still be flagged final");
  ok("end products are flagged final, chain intermediates are not");
}

// --- trade links: two ledgers link up --------------------------------------
// A good exported island → island covers the destination's deficit: the row
// keeps its numbers but loses `fix` (build advice is wrong for an import),
// and the source's surplus row says where it goes. Ship routes with
// from/to/cargo imply the same flow.
{
  const kitchen = [{ t: "Artisanal Kitchen", n: 6, done: true }];
  const farms = [{ t: "Cattle Farm", n: 8, done: true }];
  const link = [{ good: "Beef", from: "Pasture", to: "Kitchenia" }];

  const covered = L.applyTrade(rows(kitchen, OW), "Kitchenia", link);
  const beefIn = covered.find((r) => r.name === "Beef");
  if (beefIn.fix) fail("an imported deficit should lose its build-N fix");
  if (!near(beefIn.net, -3)) fail("an imported deficit keeps its numbers");
  if ((beefIn.imp || []).join() !== "Pasture")
    fail(`import should name its source, got ${JSON.stringify(beefIn.imp)}`);

  const source = L.applyTrade(rows(farms, OW), "Pasture", link);
  const beefOut = source.find((r) => r.name === "Beef");
  if ((beefOut.exp || []).join() !== "Kitchenia")
    fail(`export should name its destination, got ${JSON.stringify(beefOut.exp)}`);
  if (beefOut.imp) fail("the source island is not importing its own good");

  // The same flow via a ship's recorded route, case-insensitively.
  const route = [{ good: "beef", from: "PASTURE", to: "kitchenia" }];
  const byShip = L.applyTrade(rows(kitchen, OW), "Kitchenia", route);
  if (byShip.find((r) => r.name === "Beef").fix)
    fail("a ship route should cover a deficit like a link does");

  // A flow of some OTHER good changes nothing.
  const other = L.applyTrade(rows(kitchen, OW), "Kitchenia", [
    { good: "Rum", from: "Pasture", to: "Kitchenia" },
  ]);
  if (!other.find((r) => r.name === "Beef").fix)
    fail("an unrelated flow must not clear a deficit's fix");
  ok("trade links cover deficits and label both ends");
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nall ledger checks passed");
