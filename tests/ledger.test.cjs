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

  // One link: 3 needed, 4 spare → all 4 move (exported means gone). The
  // destination's need is met and the extra 1 t/min piles up there as stock.
  const one = mk();
  L.applyTrade(one, REG, [{ good: "Beef", from: "Pasture", to: "Kitchenia" }]);
  const src = beef(one, "Pasture");
  const dst = beef(one, "Kitchenia");
  if (!near(src.net, 0) || !near(src.used, 4))
    fail(`export should move the whole surplus off the source, got net ${src.net}`);
  if (!near(dst.net, 1) || !near(dst.produced, 4) || dst.fix)
    fail(`import should land 4 t/min on the destination and clear its fix`);
  if (src.exp?.[0]?.to !== "Kitchenia" || !near(src.exp[0].tpm, 4))
    fail(`export chip should carry the amount, got ${JSON.stringify(src.exp)}`);
  if (dst.imp?.[0]?.from !== "Pasture" || !near(dst.imp[0].tpm, 4))
    fail(`import chip should carry the amount, got ${JSON.stringify(dst.imp)}`);
  if (beef(one, "Snackville").fix?.count !== 6)
    fail("an unlinked island keeps its full shortfall");

  // The Bombins case: a destination with NO tracked consumer of the good
  // still takes the whole surplus — the source reads 0 (it's spoken for) and
  // the stock shows up on the destination, on a row created for it.
  const raw = {
    Bombins: rows([{ t: "Cotton Plantation", n: 4, done: true }], NW),
    "Cape T": rows([{ t: "Bakery", done: true }], OW),
  };
  L.applyTrade(raw, { Bombins: NW, "Cape T": OW }, [
    { good: "Cotton", from: "Bombins", to: "Cape T" },
  ]);
  const cottonHome = raw.Bombins.find((r) => r.name === "Cotton");
  const cottonAway = raw["Cape T"].find((r) => r.name === "Cotton");
  if (!near(cottonHome.net, 0))
    fail(`an export with no tracked consumer still empties the source, got ${cottonHome.net}`);
  if (!cottonAway || !near(cottonAway.net, cottonHome.produced))
    fail(`the stock should land on the destination, got ${JSON.stringify(cottonAway)}`);

  // Two importers split by NEED first (in flow order): 4 spare − 3 to the
  // first leaves 1 for the second, whose remaining 2 t/min gap is re-priced
  // (OW Cattle Farm is 0.5 t/min → 4 farms), case-insensitively via a ship
  // route. Nothing is left over for pass 2, so needs-splitting still works.
  const two = mk();
  L.applyTrade(two, REG, [
    { good: "Beef", from: "Pasture", to: "Kitchenia" },
    { good: "beef", from: "PASTURE", to: "snackville" },
  ]);
  if (!near(beef(two, "Pasture").net, 0))
    fail("two exports should drain the whole surplus");
  if (!near(beef(two, "Kitchenia").net, 0))
    fail("with both destinations in need, the first gets its need and no more");
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

// --- trade caps: a link ships at most its tpm ------------------------------
// A cap bounds BOTH passes together; leftovers spread across links in flow
// order (each capped link up to its room, an uncapped one taking the rest),
// and what no link may take stays home — that is how an island retains a
// buffer of its own surplus.
{
  // 8 OW Cattle Farms make 4 t/min of Beef; the takers track no consumers, so
  // everything here rides pass 2 unless a kitchen says otherwise.
  const farms = [{ t: "Cattle Farm", n: 8, done: true }];
  const beef = (ledgers, isle) => ledgers[isle].find((r) => r.name === "Beef");
  const REG = { Pasture: OW, Kitchenia: OW, Snackville: OW };

  // Leftovers split across links: capped first link takes 1.5, the uncapped
  // second takes the remaining 2.5 — previously the first link took all 4.
  const split = { Pasture: rows(farms, OW), Kitchenia: rows([], OW), Snackville: rows([], OW) };
  L.applyTrade(split, REG, [
    { good: "Beef", from: "Pasture", to: "Kitchenia", tpm: 1.5 },
    { good: "Beef", from: "Pasture", to: "Snackville" },
  ]);
  if (!near(beef(split, "Kitchenia")?.net ?? -1, 1.5))
    fail(`a capped link ships its cap, got ${JSON.stringify(beef(split, "Kitchenia"))}`);
  if (!near(beef(split, "Snackville")?.net ?? -1, 2.5))
    fail(`the uncapped link takes the rest, got ${JSON.stringify(beef(split, "Snackville"))}`);
  if (!near(beef(split, "Pasture").net, 0)) fail("an uncapped link still empties the source");

  // Every link capped → the rest stays home. Cap 0 is a real cap: the link
  // stands (its chip shows 0) but nothing moves.
  const keep = { Pasture: rows(farms, OW), Kitchenia: rows([], OW), Snackville: rows([], OW) };
  L.applyTrade(keep, REG, [
    { good: "Beef", from: "Pasture", to: "Kitchenia", tpm: 1 },
    { good: "Beef", from: "Pasture", to: "Snackville", tpm: 0 },
  ]);
  const home = beef(keep, "Pasture");
  if (!near(home.net, 3)) fail(`capped links must leave the rest home, got net ${home.net}`);
  if (!near(home.exp?.find((e) => e.to === "Kitchenia")?.tpm ?? -1, 1))
    fail(`the capped chip carries what moved, got ${JSON.stringify(home.exp)}`);
  if (!near(home.exp?.find((e) => e.to === "Snackville")?.tpm ?? -1, 0))
    fail(`a 0-capped link keeps its (0) chip, got ${JSON.stringify(home.exp)}`);
  if (beef(keep, "Snackville")) fail("a 0-capped link must not create a destination row");

  // Pass 1 respects the cap too: 6 kitchens eat 3, but only 2 may ride — the
  // destination's fix re-prices on the uncovered 1 t/min (OW Cattle Farm is
  // 0.5 t/min → 2 farms), and the source keeps what the cap refused.
  const kitchen = [{ t: "Artisanal Kitchen", n: 6, done: true }];
  const p1 = { Pasture: rows(farms, OW), Kitchenia: rows(kitchen, OW) };
  L.applyTrade(p1, { Pasture: OW, Kitchenia: OW }, [
    { good: "Beef", from: "Pasture", to: "Kitchenia", tpm: 2 },
  ]);
  const dst = beef(p1, "Kitchenia");
  if (!near(dst.net, -1) || dst.fix?.count !== 2)
    fail(`a capped pass-1 ships 2 of the 3 needed, got ${JSON.stringify(dst)}`);
  if (!near(beef(p1, "Pasture").net, 2))
    fail(`the cap spans both passes — nothing extra rides later, got ${beef(p1, "Pasture").net}`);
  ok("caps bound both passes, split leftovers, and keep the rest home");
}

// --- residents eat from the ledger (M8) ------------------------------------
// islandLedger's pop argument goes through the engine's own popTargets, so
// rates, unlock thresholds, the lifestyle toggle and 117's bands are the
// calculator's — each expectation below is residents × the rate in data.json.
{
  // 100 Farmers, default knobs. Fish [0.0025, threshold 50] and Work Clothes
  // [0.0030769, threshold 100] are active; Schnapps' threshold is exactly 100
  // (>= passes); the lifestyle rows (Flour, Jam…) are off by default.
  const led = L.islandLedger([], "anno1800", OW, { farmers: 100 });
  const at = (n) => led.find((r) => r.name === n);
  if (!near(at("Fish")?.used, 100 * 0.0025))
    fail(`100 farmers should eat 0.25 t/min Fish, got ${JSON.stringify(at("Fish"))}`);
  if (!near(at("Schnapps")?.used, 100 * 0.0033333))
    fail("Schnapps' threshold of exactly 100 farmers should count as met");
  if (!near(at("Work Clothes")?.used, 100 * 0.0030769))
    fail("100 farmers should wear 0.30769 t/min of Work Clothes");
  if (at("Flour")) fail("lifestyle needs must stay off by default");
  // Resident rows are end products by definition, carry `res`, and price a fix
  // like any other shortfall: 0.25 t/min of Fish is one Fishery (2 t/min).
  const fish = at("Fish");
  if (!fish?.final || !near(fish?.res, 0.25) || !near(fish?.net, -0.25))
    fail(`the Fish row should be final with res 0.25, got ${JSON.stringify(fish)}`);
  if (fish?.fix?.building !== "Fishery" || fish?.fix?.count !== 1)
    fail(`0.25 t/min of Fish short should ask for 1x Fishery, got ${JSON.stringify(fish?.fix)}`);

  // Below every threshold nothing is eaten: 40 farmers demand nothing at all.
  if (L.islandLedger([], "anno1800", OW, { farmers: 40 }).length)
    fail("40 farmers are under every unlock threshold and should eat nothing");
  // 100 workers drink no Beer (threshold 500) and eat no Bread (150), but do
  // eat Fish — workers' Fish carries no threshold.
  const w = L.islandLedger([], "anno1800", OW, { workers: 100 });
  if (w.find((r) => r.name === "Bread") || w.find((r) => r.name === "Beer"))
    fail("100 workers are under the Bread and Beer thresholds");
  if (!near(w.find((r) => r.name === "Fish")?.used, 100 * 0.0025))
    fail("100 workers should still eat Fish (no threshold on it)");

  // The knobs: lifestyle adds the band-2 rows, the slider scales everything.
  const life = L.islandLedger([], "anno1800", OW, { farmers: 100 }, { lifestyle: true });
  if (!near(life.find((r) => r.name === "Flour")?.used, 100 * 0.0024))
    fail("lifestyle on should add 0.24 t/min of Flour for 100 farmers");
  const half = L.islandLedger([], "anno1800", OW, { farmers: 100 }, { cons: 50 });
  if (!near(half.find((r) => r.name === "Fish")?.used, 100 * 0.0025 * 0.5))
    fail("consumption 50% should halve what residents eat");

  // An empty pop record changes nothing.
  const plain = L.islandLedger([{ t: "Bakery", done: true }], "anno1800", OW, {});
  if (plain.length !== L.islandLedger([{ t: "Bakery", done: true }], "anno1800", OW).length)
    fail("an empty pop record must not change the ledger");
  ok("1800 residents eat at popTargets' rates, gated by thresholds and knobs");
}

// --- 117: the band is the gate, residentUse merges by display name ---------
{
  // 100 Liberti at band 0: only what a fresh residence demands — Sardines,
  // Porridge, Tunics, Pileus. Bread and Beer sit in band 1.
  const r0 = L.residentUse({ liberti: 100 }, "anno117", { band: 0 });
  if (!near(r0.Sardines, 100 * 0.01785) || !near(r0.Porridge, 100 * 0.01388))
    fail(`band 0 should serve Sardines/Porridge, got ${JSON.stringify(r0)}`);
  if (!near(r0.Tunics, 100 * 0.01785) || !near(r0.Pileus, 100 * 0.01666))
    fail("band 0 should clothe Liberti in Tunics and Pileus");
  if (r0.Bread || r0.Beer) fail("band 0 must not serve band-1 needs");
  // The default band (2, like the calculator's) adds them.
  const r2 = L.residentUse({ liberti: 100 }, "anno117");
  if (!near(r2.Bread, 100 * 0.016185) || !near(r2.Beer, 100 * 0.01428))
    fail(`the default band should add Bread and Beer, got ${JSON.stringify(r2)}`);
  ok("117 residents are gated by the supply band");
}

// --- residents land BEFORE trade, so links serve real shortfalls -----------
{
  // Ovenia bakes 2 t/min of Bread; Homestead's 1000 workers eat 0.9091 of it
  // and bake none. The link serves the tracked shortfall first, then the rest
  // of the surplus rides the same (first) link — exported means gone.
  const eat = 1000 * 0.0009091;
  const led = {
    Ovenia: L.islandLedger([{ t: "Bakery", n: 2, done: true }], "anno1800", OW),
    Homestead: L.islandLedger([], "anno1800", OW, { workers: 1000 }),
  };
  const bread = (isle) => led[isle].find((r) => r.name === "Bread");
  if (!near(bread("Homestead").used, eat) || !near(bread("Homestead").res, eat))
    fail(`1000 workers should eat ${eat} t/min of Bread before trade`);
  if (!bread("Homestead").fix) fail("an unserved resident shortfall should price a fix");
  L.applyTrade(led, { Ovenia: OW, Homestead: OW }, [
    { good: "Bread", from: "Ovenia", to: "Homestead" },
  ]);
  const home = bread("Homestead");
  if (!near(home.net, 2 - eat) || home.fix)
    fail(`imports should cover the residents and bank the rest, got ${JSON.stringify(home)}`);
  if (!near(home.res ?? 0, eat)) fail("the res chip should survive applyTrade");
  if (!near(bread("Ovenia").net, 0))
    fail("the source's whole Bread surplus should be spoken for");
  ok("resident demand is in the rows applyTrade serves");
}

// --- M9: suggestions pair what's left with what's still short --------------
// suggestTrades reads post-trade ledgers and never mutates them. Cattle Farms
// (OW, 0.5 t/min Beef each) against Artisanal Kitchens (0.5 t/min Beef eaten
// each) keep every number hand-derivable; the kitchens' Goulash surplus and
// Bell Peppers gap must produce NO suggestions, since no island wants the one
// or makes the other — a pairing needs both ends.
{
  const farms = (n) => [{ t: "Cattle Farm", n, done: true }];
  const kitchens = (n) => [{ t: "Artisanal Kitchen", n, done: true }];

  // One surplus, two deficits: Pasture has 4 spare, Kitchenia is short 3,
  // Snackville 1. Largest deficit first, and the second taker gets what the
  // first left, priced separately.
  const led = {
    Pasture: rows(farms(8), OW),
    Kitchenia: rows(kitchens(6), OW),
    Snackville: rows(kitchens(2), OW),
  };
  const sug = L.suggestTrades(led);
  if (sug.length !== 2) fail(`expected 2 suggestions, got ${JSON.stringify(sug)}`);
  const [s1, s2] = sug;
  if (s1?.good !== "Beef" || s1.from !== "Pasture" || s1.to !== "Kitchenia" || !near(s1.tpm, 3))
    fail(`the largest deficit is served first, got ${JSON.stringify(s1)}`);
  if (s2?.good !== "Beef" || s2.from !== "Pasture" || s2.to !== "Snackville" || !near(s2.tpm, 1))
    fail(`the smaller deficit takes the rest, got ${JSON.stringify(s2)}`);
  if (!near(led.Pasture.find((r) => r.name === "Beef").net, 4))
    fail("suggesting must not mutate the ledgers");

  // A spent surplus is not offered twice: 4 spare against two shortfalls of 3.
  // The alphabetically-first of the tied deficits gets its 3; the other is
  // offered only the 1 that remains, never a fresh 3.
  const tied = {
    Pasture: rows(farms(8), OW),
    Aleville: rows(kitchens(6), OW),
    Bunsburg: rows(kitchens(6), OW),
  };
  const tsug = L.suggestTrades(tied);
  if (tsug.length !== 2 || !near(tsug[0].tpm, 3) || tsug[0].to !== "Aleville")
    fail(`tied deficits break on island name, got ${JSON.stringify(tsug)}`);
  if (!near(tsug[1].tpm, 1) || tsug[1].to !== "Bunsburg")
    fail(`the second taker gets the remainder only, got ${JSON.stringify(tsug)}`);

  // A link already covering a flow: run applyTrade first, then suggest on what
  // it left. Pasture→Kitchenia ships the need (3) AND the leftover 1 (pass 2:
  // exported means gone), so Pasture has nothing more to offer and Kitchenia
  // sits on 1 t/min of stock — which is now THE surplus, and the strip chains
  // it onward to Snackville rather than re-offering Pasture's.
  const flows = [{ good: "Beef", from: "Pasture", to: "Kitchenia" }];
  const covered = {
    Pasture: rows(farms(8), OW),
    Kitchenia: rows(kitchens(6), OW),
    Snackville: rows(kitchens(2), OW),
  };
  L.applyTrade(covered, { Pasture: OW, Kitchenia: OW, Snackville: OW }, flows);
  const csug = L.suggestTrades(covered, flows);
  if (csug.length !== 1)
    fail(`a covered flow must not be re-suggested, got ${JSON.stringify(csug)}`);
  if (
    csug[0]?.from !== "Kitchenia" ||
    csug[0].to !== "Snackville" ||
    !near(csug[0].tpm, 1)
  )
    fail(`the chained stock should move onward, got ${JSON.stringify(csug)}`);

  // The both-ways guard: a recorded link the wrong way round (Kitchenia has no
  // Beef to send Pasture, and Pasture isn't short) must not draw the reverse
  // suggestion — the same good never sails both directions between two islands.
  const backwards = [{ good: "Beef", from: "Kitchenia", to: "Pasture" }];
  const wrongway = {
    Pasture: rows(farms(8), OW),
    Kitchenia: rows(kitchens(6), OW),
  };
  L.applyTrade(wrongway, { Pasture: OW, Kitchenia: OW }, backwards);
  const wsug = L.suggestTrades(wrongway, backwards);
  if (wsug.length !== 0)
    fail(`no suggestion may reverse a recorded flow, got ${JSON.stringify(wsug)}`);

  // Balanced books suggest nothing.
  if (L.suggestTrades({ Pasture: rows(farms(8), OW) }).length)
    fail("a lone surplus with no taker is not a suggestion");
  ok("suggestions pair surpluses with deficits and respect existing flows");
}

// --- M9 + M8: resident demand drives suggestions ---------------------------
// The point of the M8 gate: a final good's surplus is only real net of what
// the local population eats. Ovenia bakes 2 t/min of Bread; its own 1000
// workers eat 0.9091, so only the remainder is offered to breadless Homestead.
{
  const eatHome = 1000 * 0.0009091;
  const led = {
    Ovenia: L.islandLedger([{ t: "Bakery", n: 2, done: true }], "anno1800", OW, {
      workers: 1000,
    }),
    Homestead: L.islandLedger([], "anno1800", OW, { workers: 1000 }),
  };
  L.applyTrade(led, { Ovenia: OW, Homestead: OW }, []);
  const sug = L.suggestTrades(led);
  const bread = sug.find((s) => s.good === "Bread");
  if (!bread || bread.from !== "Ovenia" || bread.to !== "Homestead")
    fail(`Ovenia's spare bread should be offered to Homestead, got ${JSON.stringify(sug)}`);
  if (!near(bread.tpm, Math.min(2 - eatHome, eatHome)))
    fail(`the offer is net of Ovenia's own eaters, got ${bread.tpm}`);
  // Both islands are short of Fish nobody catches — no source, no suggestion.
  if (sug.some((s) => s.good === "Fish"))
    fail("a shortfall with no surplus anywhere must stay a shortfall");
  ok("suggestions offer only what residents leave over");
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nall ledger checks passed");
