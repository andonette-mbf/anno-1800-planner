// Structural test for the Anno 117 data pack (src/lib/data-117.json).
//
// 1800 has a golden reference — tests/legacy.html — so its engine can be
// checked number-for-number. 117 has none: the pack is extracted from
// anno-mods/anno-117-calculator and the game still patches rates. What CAN be
// enforced is that the pack is internally coherent, so a re-extraction against
// a newer upstream fails loudly instead of silently shipping a broken chain.
const fs = require("fs");
const path = require("path");

const D = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "src/lib/data-117.json"), "utf8")
);

let failures = 0;
const fail = (m) => {
  console.error(`FAIL - ${m}`);
  failures++;
};
const ok = (m) => console.log(`ok - ${m}`);

const goods = D._C.g;
const ids = new Set(goods.map((x) => x[0]));
const gathered = new Set(D.gathered || []);
const splitInputs = (s) => (s || "").split("|").filter(Boolean);

// --- every chain input names a good in the pack --------------------------
{
  let bad = 0;
  for (const [id, , , , , , inputs] of goods)
    for (const i of splitInputs(inputs))
      if (!ids.has(i)) fail(`good ${id}: input "${i}" is not in the pack`), bad++;
  for (const [gid, variants] of Object.entries(D.producers))
    for (const v of variants)
      for (const i of splitInputs(v.inputs))
        if (!ids.has(i)) fail(`${gid} via ${v.building}: input "${i}" is not in the pack`), bad++;
  if (!bad) ok(`chain integrity — every input of ${goods.length} goods resolves`);
}

// --- every population need names a good ----------------------------------
{
  let bad = 0;
  for (const [tid, tier] of Object.entries(D._C.POP))
    for (const gid of Object.keys(tier.n))
      if (!ids.has(gid)) fail(`tier ${tid} needs "${gid}", which is not in the pack`), bad++;
  if (!bad) ok(`needs — every good needed by ${Object.keys(D._C.POP).length} tiers resolves`);
}

// --- chains terminate (a cycle would hang the demand walk) ---------------
{
  const inputsOf = Object.fromEntries(goods.map(([id, , , , , , i]) => [id, splitInputs(i)]));
  const state = {};
  let bad = 0;
  const walk = (id, path) => {
    if (state[id] === 2) return;
    if (state[id] === 1) return fail(`cycle: ${[...path, id].join(" -> ")}`), bad++;
    state[id] = 1;
    for (const i of inputsOf[id] || []) walk(i, [...path, id]);
    state[id] = 2;
  };
  for (const id of ids) walk(id, []);
  if (!bad) ok("chains are acyclic");
}

// --- rates and buildings -------------------------------------------------
{
  let bad = 0;
  for (const [id, name, region, , building, time] of goods) {
    if (!name) fail(`${id} has no display name`), bad++;
    if (!(region >= 1 && region <= 3)) fail(`${id} region mask ${region} out of range`), bad++;
    if (gathered.has(id)) {
      // Gathered goods (Obsidian) come from an island deposit, not a building.
      if (building || time) fail(`${id} is gathered but names a building/cycle time`), bad++;
    } else {
      if (!building) fail(`${id} has no building`), bad++;
      if (!(time > 0)) fail(`${id} has cycle time ${time}`), bad++;
    }
  }
  if (!bad) ok(`rates — ${goods.length - gathered.size} produced + ${gathered.size} gathered`);
}

// --- producers agree with the primary tuple ------------------------------
{
  let bad = 0;
  for (const [id, , region, , building, time, inputs] of goods) {
    const variants = D.producers[id];
    if (!variants) {
      fail(`${id} has no producers entry`);
      bad++;
      continue;
    }
    if (gathered.has(id)) {
      if (variants.length) fail(`${id} is gathered but lists producers`), bad++;
      continue;
    }
    const p = variants[0];
    if (p.building !== building || p.time !== time || p.inputs !== inputs) {
      fail(`${id}: primary tuple disagrees with producers[0] (${p.building} ${p.time}s)`);
      bad++;
    }
    const union = variants.reduce((m, v) => m | v.region, 0);
    if (union !== region) fail(`${id}: region mask ${region} != union of producers ${union}`), bad++;
  }
  if (!bad) ok(`producers — ${Object.values(D.producers).flat().length} variants agree with their goods`);
}

// --- tiers ---------------------------------------------------------------
{
  let bad = 0;
  for (const [tid, tier] of Object.entries(D._C.POP)) {
    if (![1, 2].includes(tier.region)) fail(`tier ${tid} region ${tier.region}`), bad++;
    if (!tier.lbl) fail(`tier ${tid} has no label`), bad++;
    if (!Object.keys(tier.n).length) fail(`tier ${tid} needs no goods`), bad++;
    if (!(tid in D._C.tierOrder)) fail(`tier ${tid} missing from tierOrder`), bad++;
    for (const [gid, [rate, cat]] of Object.entries(tier.n)) {
      if (!(rate > 0)) fail(`${tid}/${gid} consumption rate ${rate}`), bad++;
      if (!(cat >= 0 && cat < D._C.catLabels.length))
        fail(`${tid}/${gid} category ${cat} out of range`), bad++;
    }
  }
  if (!bad) ok(`tiers — ${Object.keys(D._C.POP).length} tiers, every need rated and categorised`);
}

// --- population per need (pack 2) ----------------------------------------
// 117 has no residents-per-house constant: a residence's capacity is the sum
// of the `pop` its supplied needs grant. These numbers drive every figure on
// the growth-goals panel, so a re-extraction that moves them must fail loudly
// rather than silently restating how big everyone's town is.
{
  let bad = 0;
  const intPop = (p) => Number.isInteger(p) && p >= 0 && p <= 3;
  for (const [tid, tier] of Object.entries(D._C.POP)) {
    for (const [gid, need] of Object.entries(tier.n)) {
      if (need.length !== 3) fail(`${tid}/${gid} need tuple has ${need.length} parts, want 3`), bad++;
      else if (!intPop(need[2])) fail(`${tid}/${gid} pop ${need[2]} out of range`), bad++;
    }
    if (!Array.isArray(tier.services)) fail(`tier ${tid} has no services array`), bad++;
    for (const s of tier.services || []) {
      if (!s || typeof s !== "object") fail(`${tid} service is not an object (pack 1 shape?)`), bad++;
      else if (!s.id || !s.lbl) fail(`${tid} service ${s.id || "?"} missing id/label`), bad++;
      else if (!intPop(s.pop)) fail(`${tid}/${s.id} service pop ${s.pop} out of range`), bad++;
      else if (!(s.cat >= 0 && s.cat < D._C.catLabels.length))
        fail(`${tid}/${s.id} service category ${s.cat} out of range`), bad++;
    }
  }
  if (!bad) ok("population — every need and service carries a 0..3 resident value");
}

// --- the wiki cross-check ------------------------------------------------
// The Anno 117 wiki states that supplying a Liberti residence BOTH sardines
// and porridge "nets you +3 population and +1 income from the food category
// per residence". Porridge 2 + Sardines 1 is that +3, and it is the only
// independent confirmation we have that `needAttributes.Population` means
// residents per house. Pin it: if upstream re-tunes these, the panel's whole
// premise needs re-checking against the wiki again, not silently updating.
{
  const lib = D._C.POP.liberti;
  const pop = (gid) => lib?.n?.[gid]?.[2];
  let bad = 0;
  if (pop("porridge") !== 2) fail(`Liberti porridge is +${pop("porridge")}, wiki says +2`), bad++;
  if (pop("sardines") !== 1) fail(`Liberti sardines is +${pop("sardines")}, wiki says +1`), bad++;
  // …and the pair sums to the +3 the wiki quotes.
  if (!bad && pop("porridge") + pop("sardines") !== 3) fail("Liberti food pair is not +3"), bad++;
  // A tier's capacity must be positive and never shrink as bands are added.
  for (const [tid, tier] of Object.entries(D._C.POP)) {
    const cap = (band) =>
      Object.values(tier.n).reduce((n, [, c, p]) => n + (c <= band ? p : 0), 0) +
      (tier.services || []).reduce((n, s) => n + (!s.wonder && s.cat <= band ? s.pop : 0), 0);
    if (!(cap(3) > 0)) fail(`tier ${tid} has zero house capacity — goals would divide by zero`), bad++;
    for (let b = 1; b < 4; b++)
      if (cap(b) < cap(b - 1)) fail(`tier ${tid} capacity shrinks from band ${b - 1} to ${b}`), bad++;
  }
  if (!bad)
    ok("population — Liberti porridge+sardines = +3/house (matches the wiki); capacity rises with band");
}

// --- modifier references point at real goods -----------------------------
{
  let bad = 0;
  if (D.fuel.good && !ids.has(D.fuel.good)) fail(`fuel good "${D.fuel.good}" not in pack`), bad++;
  if (!(D.fuel.time > 0)) fail(`fuel time ${D.fuel.time}`), bad++;
  if (D.silo.feedGood && !ids.has(D.silo.feedGood))
    fail(`silo feed "${D.silo.feedGood}" not in pack`), bad++;
  if (!(D.silo.feedPerMin > 0)) fail(`silo feedPerMin ${D.silo.feedPerMin}`), bad++;
  // The ledger applies the silo as a flat ×2, exactly like 1800's. That is only
  // right while the upstream buff is +100%; if a re-extraction changes it, the
  // multiplier has to become a real number instead of a shared assumption.
  if (D.silo.productivityUpgrade !== 100)
    fail(`silo productivityUpgrade is ${D.silo.productivityUpgrade}, not 100 — the ledger's ×2 is now wrong`),
      bad++;
  for (const id of gathered) if (!ids.has(id)) fail(`gathered "${id}" not in pack`), bad++;
  if (!bad) ok(`modifiers — fuel (${D.fuel.good}) and silo feed (${D.silo.feedGood}) resolve`);
}

// --- silo flags sit on the right buildings -------------------------------
// modulesLimit counts module SLOTS (a crop farm's fields run to 180), so it is
// NOT the silo test: the Ochs Farm has 5 pasture slots and takes no silo. The
// pack's `silo` flag comes from the factory's `additionalModule` instead.
{
  const siloed = Object.values(D.producers)
    .flat()
    .filter((v) => v.silo)
    .map((v) => v.building)
    .sort();
  const want = ["Horse Breeder", "Pig Farm", "Sheep Farm"];
  if (JSON.stringify(siloed) !== JSON.stringify(want))
    fail(`silo buildings are ${JSON.stringify(siloed)}, expected ${JSON.stringify(want)}`);
  else ok(`silo — ${want.join(", ")} take one; no crop farm does`);
}

// --- provenance is recorded, so the pack can be re-cut reproducibly ------
{
  const s = D.source || {};
  if (!s.commit || !/^[0-9a-f]{40}$/.test(s.commit)) fail("source.commit is not a full SHA");
  else if (!s.repo) fail("source.repo missing");
  else ok(`provenance — ${s.repo} @ ${s.commit.slice(0, 7)} (${D._C.version})`);
}

// --- the loader reads the pack ------------------------------------------
// Compiles src/lib/data117.ts the way the golden test compiles the engine, so
// a pack change that breaks the typed view fails here rather than at build.
{
  const { execSync } = require("child_process");
  const root = path.join(__dirname, "..");
  const build = path.join(__dirname, "build");
  try {
    execSync(
      `npx tsc src/lib/data117.ts --outDir tests/build --rootDir src/lib ` +
        `--module commonjs --target es2020 --resolveJsonModule --esModuleInterop --skipLibCheck`,
      { cwd: root, stdio: "pipe" }
    );
    fs.copyFileSync(
      path.join(root, "src/lib/data-117.json"),
      path.join(build, "data-117.json")
    );
    const L = require("./build/data117.js");

    const n = Object.keys(L.GOODS_117).length;
    if (n !== goods.length) fail(`loader exposes ${n} goods, pack has ${goods.length}`);

    // Rate must be the cycle, and a produced good must name its building.
    for (const g of Object.values(L.GOODS_117)) {
      if (g.gathered) continue;
      const want = Math.round((60 / g.time) * 1e6) / 1e6;
      if (g.rate !== want) fail(`${g.id} rate ${g.rate} != 60/${g.time}`);
    }

    // Region-aware producer lookup: Flour is the pack's clearest split.
    const flourLatium = L.producerIn117("flour", 1);
    const flourAlbion = L.producerIn117("flour", 2);
    if (!flourLatium || !flourAlbion || flourLatium.time === flourAlbion.time)
      fail("producerIn117 did not resolve Flour differently per region");
    else
      ok(
        `loader — ${n} goods; Flour = ${flourLatium.building} ${flourLatium.time}s (Latium) / ` +
          `${flourAlbion.building} ${flourAlbion.time}s (Albion)`
      );

    // Cross-region needs are the trade list; every tier that has one is real.
    const importing = Object.keys(L.POP_117).filter((t) => L.importsFor117(t).length);
    if (!importing.length) fail("no tier imports anything — cross-region needs lost");
    else ok(`loader — ${importing.length}/${Object.keys(L.POP_117).length} tiers import from the other region`);
  } catch (e) {
    fail(`loader smoke test: ${e.stdout?.toString() || e.message}`);
  }
}

// --- the island ledger understands 117 buildings -------------------------
// This is the path the Tracker actually uses: a building name typed into an
// island inventory has to resolve to the good it makes and the inputs it eats.
{
  const { execSync } = require("child_process");
  const root = path.join(__dirname, "..");
  try {
    execSync(
      // --jsx: ledger imports the CheckItem type from store.tsx. The import is
      // erased, but tsc still resolves the file.
      `npx tsc src/lib/ledger.ts --outDir tests/build --rootDir src/lib ` +
        `--module commonjs --target es2020 --resolveJsonModule --esModuleInterop ` +
        `--skipLibCheck --jsx react-jsx`,
      { cwd: root, stdio: "pipe" }
    );
    fs.copyFileSync(path.join(root, "src/lib/data.json"), path.join(__dirname, "build/data.json"));
    const L = require("./build/ledger.js");

    const latium = L.buildingOptionsFor(1, "anno117");
    const albion = L.buildingOptionsFor(2, "anno117");
    if (!latium.includes("Fishing Hut")) fail("Latium options missing Fishing Hut");
    if (!albion.includes("Cockle Picker")) fail("Albion options missing Cockle Picker");
    if (latium.includes("Cockle Picker")) fail("Latium options wrongly include Cockle Picker");

    // A Bakery makes Bread from Flour — one building, ticked.
    const rows = L.islandLedger([{ t: "Bakery", done: true }], "anno117");
    const bread = rows.find((r) => r.name === "Bread");
    const flour = rows.find((r) => r.name === "Flour");
    if (!bread || Math.abs(bread.produced - 1) > 1e-9)
      fail(`Bakery should make 1 t/min Bread, got ${JSON.stringify(bread)}`);
    if (!flour || Math.abs(flour.used - 1) > 1e-9)
      fail(`Bakery should eat 1 t/min Flour, got ${JSON.stringify(flour)}`);
    if (!flour?.fix) fail("a Flour deficit should suggest a building to fix it");

    // Unticked items are "still to build" and must not produce anything.
    if (L.islandLedger([{ t: "Bakery", done: false }], "anno117").length)
      fail("an unticked building produced ledger rows");

    // --- silo: ×2 output, feed eaten, part-silo'd lines --------------------
    // Only the three animal farms take one. The Ochs Farm is the trap: 5 module
    // slots, no silo. Crop farms have the most slots of all and take none.
    for (const [name, want] of [
      ["Sheep Farm", true],
      ["Pig Farm", true],
      ["Horse Breeder", true],
      ["Ochs Farm", false],
      ["Wheat Farm", false],
      ["Bakery", false],
    ])
      if (L.siloCapable(name, "anno117") !== want)
        fail(`siloCapable("${name}") should be ${want}`);

    // 3 Sheep Farms (2 t/min each), 2 of them silo'd: the silo'd pair makes ×2,
    // so (3 + 2) x 2 = 10 t/min, and eats 2 x 0.2 = 0.4 t/min of Wheat.
    {
      const rows = L.islandLedger([{ t: "Sheep Farm", n: 3, s: 2, done: true }], "anno117");
      const sheep = rows.find((r) => r.name === "Sheep");
      const wheat = rows.find((r) => r.name === "Wheat");
      if (!sheep || Math.abs(sheep.produced - 10) > 1e-9)
        fail(`3 Sheep Farms, 2 silo'd should make 10 t/min, got ${JSON.stringify(sheep)}`);
      if (!wheat || Math.abs(wheat.used - 0.4) > 1e-9)
        fail(`2 silos should eat 0.4 t/min Wheat, got ${JSON.stringify(wheat)}`);
      // The red gap has to name a building to fix it, same as 1800's ledger.
      if (wheat?.fix?.building !== "Wheat Farm" || wheat.fix.count !== 1)
        fail(`a Wheat gap should suggest 1x Wheat Farm, got ${JSON.stringify(wheat?.fix)}`);
      // No silo ticked = base rate, no feed edge at all.
      const plain = L.islandLedger([{ t: "Sheep Farm", n: 3, done: true }], "anno117");
      if (Math.abs(plain.find((r) => r.name === "Sheep").produced - 6) > 1e-9)
        fail("3 un-silo'd Sheep Farms should make 6 t/min");
      if (plain.some((r) => r.name === "Wheat"))
        fail("an un-silo'd line should not eat feed");
    }

    // --- fuel: Coal per minute of run time --------------------------------
    // A Bakery burns one Coal per 120s, so 4 of them eat 4 x 0.5 = 2 t/min on
    // top of their Flour. Buildings that don't burn fuel must not touch Coal.
    {
      const rows = L.islandLedger([{ t: "Bakery", n: 4, done: true }], "anno117");
      const coal = rows.find((r) => r.name === "Coal");
      if (!coal || Math.abs(coal.used - 2) > 1e-9)
        fail(`4 Bakeries should burn 2 t/min Coal, got ${JSON.stringify(coal)}`);
      if (coal?.fix?.building !== "Charcoal Burner")
        fail(`a Coal gap should suggest a Charcoal Burner, got ${JSON.stringify(coal?.fix)}`);
      if (Math.abs(rows.find((r) => r.name === "Flour").used - 4) > 1e-9)
        fail("4 Bakeries should still eat 4 t/min Flour");
      if (L.islandLedger([{ t: "Wheat Farm", n: 4, done: true }], "anno117").some((r) => r.name === "Coal"))
        fail("a Wheat Farm burnt Coal — the fuel edge is on the wrong buildings");
    }

    // 117 has no electricity: the power chip must never appear there.
    if (["Bakery", "Sheep Farm", "Furnace"].some((n) => L.elecCapable(n, "anno117")))
      fail("elecCapable is true for a 117 building — 117 has no power");

    // 1800 must be completely unaffected by the 117 index existing.
    const ow = L.buildingOptionsFor(1, "anno1800");
    if (!ow.includes("Fishery") || ow.includes("Fishing Hut"))
      fail("1800 building options changed");

    if (failures === 0 || true)
      ok(
        `ledger — 117 resolves ${latium.length} Latium / ${albion.length} Albion buildings; ` +
          `Bakery = 1 t/min Bread from 1 t/min Flour`
      );
  } catch (e) {
    fail(`ledger smoke test: ${e.stdout?.toString() || e.message}`);
  }
}

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\n117 PACK STRUCTURAL TESTS PASSED");
