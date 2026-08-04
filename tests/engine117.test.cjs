// Engine tests for Anno 117 (M10 phase 3).
//
// 1800 has a golden reference — tests/legacy.html — so tests/golden.test.cjs
// can check it number for number. 117 has none, so every expectation below is
// hand-derived from src/lib/data-117.json and written out longhand in the
// comment above it. If a re-extraction changes a rate, these fail loudly and
// the working shows why.
//
// The other half of the contract is that none of this leaks into 1800: the last
// block re-runs an 1800 scenario after every 117 one and checks it still lands
// on the golden numbers.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const build = path.join(__dirname, "build");

execSync(
  `npx tsc src/lib/engine.ts src/lib/data.ts src/lib/hash.ts --outDir tests/build --rootDir src/lib ` +
    `--module commonjs --target es2020 --resolveJsonModule --esModuleInterop --skipLibCheck`,
  { cwd: root, stdio: "inherit" }
);
fs.copyFileSync(path.join(root, "src/lib/data.json"), path.join(build, "data.json"));
fs.copyFileSync(path.join(root, "src/lib/data-117.json"), path.join(build, "data-117.json"));

const eng = require("./build/engine.js");
const hash = require("./build/hash.js");

let failures = 0;
const fail = (m) => {
  console.error(`FAIL - ${m}`);
  failures++;
};
const ok = (m) => console.log(`ok - ${m}`);

const near = (a, b) => Math.abs(a - b) < 1e-6;

function eq(actual, expected, what) {
  if (typeof expected === "number" ? near(actual, expected) : actual === expected) return true;
  fail(`${what}: expected ${expected}, got ${actual}`);
  return false;
}

/** A 117 plan. `region` is the province it is built in: 1 Latium, 2 Albion. */
function rome(over = {}) {
  return { ...eng.DEFAULT_STATE, game: "anno117", regionFilter: 1, sel: {}, pop: {}, ...over };
}

const LATIUM = 1;
const ALBION = 2;

// ---------------------------------------------------------------------------
// 1. A plain Latium chain. Pileus Felter 60s = 1 t/min, and one Pileus takes
//    one Sheep; Sheep Farm is 30s = 2 t/min, so two felters need half a farm,
//    rounding up to one. Total 3 buildings.
// ---------------------------------------------------------------------------
{
  const st = rome({ sel: { pileus: { mode: "fac", val: 2 } } });
  eq(eng.effRate(st, "pileus"), 1, "pileus rate");
  eq(eng.effRate(st, "sheep"), 2, "sheep rate");
  eq(eng.buildingName(st, "pileus"), "Pileus Felter", "pileus building");
  const { demand } = eng.compute(st);
  eq(demand.pileus, 2, "pileus demand");
  eq(demand.sheep, 2, "sheep demand");
  const R = eng.buildingRows(st);
  eq(R.byId.pileus.cnt, 2, "pileus buildings");
  eq(R.byId.sheep.cnt, 1, "sheep buildings");
  eq(R.totalBuildings, 3, "total buildings");
  if (!failures) ok("Latium: 2× Pileus Felter + 1× Sheep Farm");
}

// ---------------------------------------------------------------------------
// 2. The same good, a different building and RATE per region. Flour is a Grain
//    Mill (30s = 2/min) in Latium and a Donkey Mill (60s = 1/min) in Albion, so
//    4 t/min of Flour is 2 buildings there and 4 here. Wheat demand is 4 t/min
//    either way, and Wheat Farm is 60s = 1/min, so 4 farms in both.
// ---------------------------------------------------------------------------
{
  const sel = { flour: { mode: "tpm", val: 4 } };
  const la = rome({ regionFilter: LATIUM, sel });
  const al = rome({ regionFilter: ALBION, sel });
  eq(eng.effRate(la, "flour"), 2, "Latium flour rate");
  eq(eng.effRate(al, "flour"), 1, "Albion flour rate");
  eq(eng.buildingName(la, "flour"), "Grain Mill", "Latium flour building");
  eq(eng.buildingName(al, "flour"), "Donkey Mill", "Albion flour building");
  eq(eng.buildingRows(la).byId.flour.cnt, 2, "Latium flour buildings");
  eq(eng.buildingRows(al).byId.flour.cnt, 4, "Albion flour buildings");
  eq(eng.compute(la).demand.wheat, 4, "Latium wheat demand");
  eq(eng.compute(al).demand.wheat, 4, "Albion wheat demand");
  eq(eng.buildingRows(la).byId.wheat.cnt, 4, "Latium wheat farms");
  ok("Flour: Grain Mill 2/min in Latium vs Donkey Mill 1/min in Albion");
}

// ---------------------------------------------------------------------------
// 3. The case that cannot be resolved by name or by rate: Leather is a Tannery
//    in BOTH regions at 60s, but takes Pigs + Salt in Latium and Pigs + Wood in
//    Albion. Getting this wrong computes an Albion island on Latium's chain and
//    never looks wrong on screen.
// ---------------------------------------------------------------------------
{
  const sel = { leather: { mode: "fac", val: 1 } };
  const la = rome({ regionFilter: LATIUM, sel });
  const al = rome({ regionFilter: ALBION, sel });
  eq(eng.buildingName(la, "leather"), "Tannery", "Latium leather building");
  eq(eng.buildingName(al, "leather"), "Tannery", "Albion leather building");
  const dLa = eng.compute(la).demand;
  const dAl = eng.compute(al).demand;
  if (!(dLa.salt > 0)) fail("Latium leather should need Salt");
  if (dLa.wood !== undefined) fail("Latium leather should NOT need Wood");
  if (!(dAl.wood > 0)) fail("Albion leather should need Wood");
  if (dAl.salt !== undefined) fail("Albion leather should NOT need Salt");
  eq(dLa.pigs, 1, "Latium leather pigs");
  eq(dAl.pigs, 1, "Albion leather pigs");
  ok("Leather: same 'Tannery' name, salt in Latium and wood in Albion");
}

// ---------------------------------------------------------------------------
// 4. Fuel is an input EDGE, not a rate modifier. A Tiler is 60s = 1 t/min and
//    burns one Coal per 120s = 0.5 t/min of RUN time, so 4 Tilers burn 2 t/min
//    of Coal however much they produce. Charcoal Burner is 30s = 2/min, so that
//    is one burner. Clay in Latium (Clay Pit 30s = 2/min → 2 pits for 4 t/min).
// ---------------------------------------------------------------------------
{
  const st = rome({ sel: { tiles: { mode: "fac", val: 4 } } });
  const { demand } = eng.compute(st);
  eq(eng.effRate(st, "tiles"), 1, "tiles rate");
  eq(demand.tiles, 4, "tiles demand");
  eq(demand.coal, 2, "coal burnt by 4 Tilers");
  eq(demand.clay, 4, "Latium clay demand");
  const R = eng.buildingRows(st);
  eq(R.byId.tiles.cnt, 4, "tilers");
  eq(R.byId.coal.cnt, 1, "charcoal burners");
  eq(R.byId.clay.cnt, 2, "clay pits");
  eq(eng.buildingName(st, "coal"), "Charcoal Burner", "coal building");

  // Doubling productivity doubles output but NOT the fuel, because fuel is per
  // building: 4 t/min of Tiles is now 2 Tilers, so only 1 t/min of Coal.
  const fast = rome({ sel: { tiles: { mode: "tpm", val: 4 } }, prod: 200 });
  eq(eng.compute(fast).demand.coal, 1, "coal at 200% productivity");
  ok("Fuel: 4 Tilers burn 2 t/min Coal; at 200% productivity, 2 Tilers burn 1");
}

// ---------------------------------------------------------------------------
// 5. Silos. Only Sheep Farm / Pig Farm / Horse Breeder take one, at +100%
//    output for 0.2 t/min of Wheat each. Two Pileus Felters still need 2 t/min
//    of Sheep, but a silo'd farm makes 4/min, so that is half a farm eating
//    0.5 × 0.2 = 0.1 t/min of Wheat. The felter itself is not silo-capable and
//    keeps its 1/min.
// ---------------------------------------------------------------------------
{
  const st = rome({ sel: { pileus: { mode: "fac", val: 2 } }, silo: true, round: false });
  eq(eng.effRate(st, "sheep"), 4, "silo'd sheep rate");
  eq(eng.effRate(st, "pileus"), 1, "pileus rate unaffected by silo");
  const { demand } = eng.compute(st);
  eq(demand.sheep, 2, "sheep demand with silo");
  eq(demand.wheat, 0.1, "silo feed");
  ok("Silo: Sheep Farm ×2 for 0.1 t/min of Wheat at half a farm");
}

// ---------------------------------------------------------------------------
// 6. 117 has no electricity, so the toggle must be inert — not quietly ×2 on
//    whatever the 1800 rule would have called region 1.
// ---------------------------------------------------------------------------
{
  const sel = { pileus: { mode: "fac", val: 2 }, tiles: { mode: "fac", val: 2 } };
  const off = eng.compute(rome({ sel }));
  const on = eng.compute(rome({ sel, electricity: true }));
  if (JSON.stringify(off.demand) !== JSON.stringify(on.demand))
    fail("electricity changed 117 demand");
  else ok("No electricity in 117 — the toggle is inert");
}

// ---------------------------------------------------------------------------
// 7. Obsidian is gathered from a deposit, not built: rate 0, no producer. It is
//    reachable (Statuettes, Latrunculi Sets), so the building maths has to skip
//    it instead of dividing by zero. One Caelator is 180s = 1/3 t/min and takes
//    one Obsidian and one Uncut Marble per ton; Marble Quarry is 60s = 1/min.
// ---------------------------------------------------------------------------
{
  const st = rome({ sel: { statuettes: { mode: "fac", val: 1 } } });
  eq(eng.effRate(st, "statuettes"), 1 / 3, "statuettes rate");
  eq(eng.effRate(st, "obsidian"), 0, "obsidian has no rate");
  if (!eng.gathered(st, "obsidian")) fail("obsidian should be gathered");
  const { demand } = eng.compute(st);
  eq(demand.obsidian, 1 / 3, "obsidian demand still tracked");
  const R = eng.buildingRows(st);
  eq(R.byId.obsidian.cnt, 0, "obsidian buildings");
  if (!R.byId.obsidian.gathered) fail("obsidian row should be flagged gathered");
  if (!Number.isFinite(R.totalBuildings)) fail("total buildings went non-finite");
  eq(R.byId.uncut_marble.cnt, 1, "marble quarries");
  const p = eng.optimPlan(st);
  if (!p) fail("optimPlan returned null for a gathered chain");
  else if (!Number.isFinite(p.total)) fail(`optimPlan total non-finite: ${p.total}`);
  else if (!Number.isFinite(p.util)) fail(`optimPlan util non-finite: ${p.util}`);
  else ok(`Gathered Obsidian: counted as 0 buildings, plan total ${p.total}`);
}

// ---------------------------------------------------------------------------
// 8. Population mode. 117's needs carry no unlock thresholds — only one of four
//    supply bands — so `band` is the whole gate. 1000 Liberti at 100%
//    consumption want their four band-0 goods at the pack's per-resident rates,
//    and Beer (band 1) only once the band allows it.
// ---------------------------------------------------------------------------
{
  const basic = rome({ mode: "pop", pop: { liberti: 1000 }, band: 0 });
  const T0 = eng.targets(basic);
  eq(T0.sardines, 17.85, "sardines for 1000 Liberti");
  eq(T0.porridge, 13.88, "porridge for 1000 Liberti");
  eq(T0.tunics, 17.85, "tunics for 1000 Liberti");
  eq(T0.pileus, 16.66, "pileus for 1000 Liberti");
  if (T0.beer !== undefined) fail("Beer is band 1 and must be off at band 0");

  const wanted = rome({ mode: "pop", pop: { liberti: 1000 }, band: 1 });
  eq(eng.targets(wanted).beer, 14.28, "beer at band 1");

  // Half consumption halves every target.
  const half = rome({ mode: "pop", pop: { liberti: 1000 }, band: 0, cons: 50 });
  eq(eng.targets(half).sardines, 17.85 / 2, "sardines at 50% consumption");
  ok("Population: 1000 Liberti, band 0 vs band 1, consumption slider");
}

// ---------------------------------------------------------------------------
// 9. Cross-region imports. Beer is Albion-only but Liberti (a Latium tier) drink
//    it, so a Latium plan still has to resolve a chain for it — it falls back to
//    the Albion producer rather than dropping the good.
// ---------------------------------------------------------------------------
{
  const st = rome({ regionFilter: LATIUM, sel: { beer: { mode: "fac", val: 1 } } });
  eq(eng.buildingName(st, "beer"), "Brewery", "beer building from Latium");
  eq(eng.effRate(st, "beer"), 1, "beer rate");
  const { demand } = eng.compute(st);
  eq(demand.malt, 1, "malt for beer");
  // A Brewery burns fuel too: 1 building × 0.5 t/min.
  eq(demand.coal, 0.5, "coal burnt by 1 Brewery");
  ok("Imports: an Albion-only good still resolves from a Latium plan");
}

// ---------------------------------------------------------------------------
// 10. The hash keeps its legacy wire format. An 1800 link carries no game
//     marker (so /legacy.html and every pre-M10 share link still read it) and a
//     marker-less hash decodes as 1800.
// ---------------------------------------------------------------------------
{
  const st = rome({ regionFilter: ALBION, band: 3, sel: { flour: { mode: "tpm", val: 4 } } });
  const back = hash.decodeHash(hash.encodeHash(st));
  eq(back.game, "anno117", "round-tripped game");
  eq(back.regionFilter, ALBION, "round-tripped region");
  eq(back.band, 3, "round-tripped band");
  eq(back.sel.flour.val, 4, "round-tripped selection");

  const old = { ...eng.DEFAULT_STATE, sel: { weapons: { mode: "fac", val: 2 } } };
  delete old.game;
  const oldHash = hash.encodeHash(old);
  const raw = JSON.parse(Buffer.from(oldHash, "base64").toString("utf8"));
  if (raw.g !== undefined) fail("an 1800 hash must not carry a game marker");
  const decodedOld = hash.decodeHash(oldHash);
  eq(decodedOld.game, "anno1800", "marker-less hash is 1800");
  eq(decodedOld.sel.weapons.val, 2, "marker-less hash keeps its selection");

  // A 117 selection must not survive into an 1800 state: the ids do not exist.
  const crossed = hash.encodeHash(rome({ sel: { pileus: { mode: "fac", val: 1 } } }));
  const asRome = hash.decodeHash(crossed);
  eq(Object.keys(asRome.sel).length, 1, "117 hash keeps its 117 selection");
  ok("Hash: 117 marker round-trips, 1800 links stay marker-less");
}

// ---------------------------------------------------------------------------
// 11. Isolation. The engine reads its tables through the state's dataset, so a
//     117 plan must leave 1800 untouched. These are the golden test's own
//     numbers for the default preset (2× Steel Beams + 2× Weapons → 9).
// ---------------------------------------------------------------------------
{
  const st1800 = {
    ...eng.DEFAULT_STATE,
    sel: { steel_beams: { mode: "fac", val: 2 }, weapons: { mode: "fac", val: 2 } },
    pop: {},
  };
  eq(eng.optimPlan(st1800).total, 9, "1800 default preset total");
  eq(eng.effRate(st1800, "coal"), 2, "1800 Charcoal Kiln");
  eq(eng.effRate({ ...st1800, coalTime: 15 }, "coal"), 4, "1800 Coal Mine");
  eq(eng.buildingName({ ...st1800, coalTime: 15 }, "coal"), "Coal Mine", "1800 coal building");
  if (!eng.electrifiable(st1800, "steel")) fail("1800 Old World goods must be electrifiable");
  if (eng.electrifiable(rome(), "tiles")) fail("117 goods must never be electrifiable");
  // 1800 has no fuel edge — its coal is a rate switch on the good, not an input.
  const d1800 = eng.compute(st1800).demand;
  eq(d1800.coal, 4, "1800 coal demand is chain-driven, not fuel-driven");
  ok("Isolation: 1800 numbers unchanged after every 117 scenario");
}

// ---------------------------------------------------------------------------
// 12. Sweep. Every good, in both provinces, through the paths the calculator
//     screens actually call. This is the cheap way to catch the failure mode
//     the scenarios above cannot: an id that resolves in one region and not the
//     other, a tier with no label, a rate that comes back NaN.
// ---------------------------------------------------------------------------
{
  const ds = require("./build/dataset.js");
  const before = failures;
  for (const region of [LATIUM, ALBION]) {
    const st = rome({ regionFilter: region });
    const D = ds.datasetFor(st);
    for (const id of Object.keys(D.goods)) {
      const g = D.goods[id];
      const r = D.recipe(st, id);
      const er = eng.effRate(st, id);
      if (!Number.isFinite(er) || er < 0) fail(`${id} in region ${region}: bad rate ${er}`);
      if (!r.building) fail(`${id} in region ${region}: no building name`);
      if (!D.regionLabel(st, id)) fail(`${id} in region ${region}: no region label`);
      if (!D.regionColor(st, id)) fail(`${id} in region ${region}: no region colour`);
      if (g.tier && !D.tierLabels[g.tier]) fail(`${id}: tier "${g.tier}" has no label`);
      for (const inp of r.inputs)
        if (!D.goods[inp.good]) fail(`${id} in region ${region}: input "${inp.good}" unknown`);
      // A category band must have a pill defined, or CatPill renders nothing.
      const cat = D.goodCat[id];
      if (cat !== undefined && !D.catLabels[cat]) fail(`${id}: band ${cat} has no pill`);
    }
    // Every final good, built one at a time, must produce a finite plan.
    for (const id of Object.keys(D.goods).filter((k) => D.goods[k].isFinal)) {
      const one = rome({ regionFilter: region, sel: { [id]: { mode: "fac", val: 1 } } });
      const R = eng.buildingRows(one);
      if (!Number.isFinite(R.totalBuildings))
        fail(`${id} in region ${region}: total buildings ${R.totalBuildings}`);
      for (const row of R.rows)
        if (!Number.isFinite(row.dem) || !Number.isFinite(row.cnt))
          fail(`${id} in region ${region}: row ${row.id} has dem ${row.dem}, cnt ${row.cnt}`);
      const p = eng.optimPlan(one);
      if (!p || !Number.isFinite(p.total))
        fail(`${id} in region ${region}: optimPlan total ${p && p.total}`);
      // displaySort must be a total order over the ids the UI will hand it.
      const ids = R.rows.map((x) => x.id);
      try {
        ids.slice().sort((a, b) => eng.displaySort(one, a, b));
      } catch (e) {
        fail(`${id} in region ${region}: displaySort threw ${e.message}`);
      }
    }
  }
  if (failures === before)
    ok(
      `Sweep: 113 goods × 2 provinces resolve; every final good plans finitely in both`
    );
}

// ---------------------------------------------------------------------------
// 13. The whole of Rome at once — all nine tiers, every band. This is the
//     heaviest chain the app can be asked for, and it spans both provinces, so
//     it is where a missing import or a division by zero would surface.
// ---------------------------------------------------------------------------
{
  const st = rome({
    mode: "pop",
    band: 3,
    pop: {
      liberti: 1000,
      plebeians: 800,
      equites: 600,
      patricians: 400,
      waders: 1000,
      smiths: 800,
      aldermen: 600,
      mercators: 400,
      nobles: 300,
    },
  });
  const before = failures;
  const T = eng.targets(st);
  const R = eng.buildingRows(st);
  const p = eng.optimPlan(st);
  if (!Number.isFinite(R.totalBuildings)) fail(`all-tiers total ${R.totalBuildings}`);
  if (!p || !Number.isFinite(p.total)) fail(`all-tiers optimPlan ${p && p.total}`);
  for (const row of R.rows)
    if (!Number.isFinite(row.dem)) fail(`all-tiers: ${row.id} demand ${row.dem}`);
  // Obsidian is reachable at band 3 and must be present but unbuilt.
  if (!R.byId.obsidian) fail("all-tiers: expected Obsidian in the chain at band 3");
  else if (R.byId.obsidian.cnt !== 0) fail("all-tiers: Obsidian should never be built");
  if (failures === before)
    ok(
      `All nine tiers, band 3: ${Object.keys(T).length} goods consumed, ` +
        `${R.rows.length} in the chain, ${p.total} buildings`
    );
}

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nANNO 117 ENGINE TESTS PASSED");
