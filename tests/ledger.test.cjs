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

// --- trade: goods actually move between ledgers ----------------------------
// A link transfers min(source surplus, destination deficit): the t/min lands
// in the destination's `produced` and the source's `used`, several importers
// split one surplus in flow order, and every shortfall is re-priced on what
// trade left uncovered.
{
  // 8 OW Cattle Farms make 4 t/min of Beef; 6 Artisanal Kitchens eat 3.
  const farms = [{ t: "Cattle Farm", n: 8, done: true }];
  const kitchen = [{ t: "Artisanal Kitchen", n: 6, done: true }];
  const beef = (ledgers, isle) => ledgers[isle].find((r) => r.name === "Beef");
  const mk = () => ({
    Pasture: rows(farms, OW),
    Kitchenia: rows(kitchen, OW),
    Snackville: rows(kitchen, OW),
  });
  const REG = { Pasture: OW, Kitchenia: OW, Snackville: OW };

  // One link: 3 needed, 4 spare → 3 moves; source keeps +1, dest lands on 0.
  const one = mk();
  L.applyTrade(one, REG, [{ good: "Beef", from: "Pasture", to: "Kitchenia" }]);
  const src = beef(one, "Pasture");
  const dst = beef(one, "Kitchenia");
  if (!near(src.net, 1) || !near(src.used, 3))
    fail(`export should move 3 t/min off the source, got net ${src.net}`);
  if (!near(dst.net, 0) || !near(dst.produced, 3) || dst.fix)
    fail(`import should land 3 t/min on the destination and clear its fix`);
  if (src.exp?.[0]?.to !== "Kitchenia" || !near(src.exp[0].tpm, 3))
    fail(`export chip should carry the amount, got ${JSON.stringify(src.exp)}`);
  if (dst.imp?.[0]?.from !== "Pasture" || !near(dst.imp[0].tpm, 3))
    fail(`import chip should carry the amount, got ${JSON.stringify(dst.imp)}`);
  if (beef(one, "Snackville").fix?.count !== 6)
    fail("an unlinked island keeps its full shortfall");

  // Two importers share one surplus in flow order: 4 spare − 3 to the first
  // leaves 1 for the second, whose remaining 2 t/min gap is re-priced (OW
  // Cattle Farm is 0.5 t/min → 4 farms), case-insensitively via a ship route.
  const two = mk();
  L.applyTrade(two, REG, [
    { good: "Beef", from: "Pasture", to: "Kitchenia" },
    { good: "beef", from: "PASTURE", to: "snackville" },
  ]);
  if (!near(beef(two, "Pasture").net, 0))
    fail("two exports should drain the whole surplus");
  const second = beef(two, "Snackville");
  if (!near(second.net, -2) || !near(second.imp?.[0]?.tpm ?? -1, 1))
    fail(`the second importer gets what's left (1 t/min), got ${JSON.stringify(second.imp)}`);
  if (second.fix?.count !== 4)
    fail(`a part-covered gap is priced on the remainder, got ${JSON.stringify(second.fix)}`);

  // A flow of some other good moves nothing.
  const other = mk();
  L.applyTrade(other, REG, [{ good: "Rum", from: "Pasture", to: "Kitchenia" }]);
  if (!beef(other, "Kitchenia").fix || !near(beef(other, "Pasture").net, 4))
    fail("an unrelated flow must not move goods");
  ok("trade moves the numbers, splits surpluses, re-prices the remainder");
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nall ledger checks passed");
