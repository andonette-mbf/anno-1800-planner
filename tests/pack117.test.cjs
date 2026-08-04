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

// --- modifier references point at real goods -----------------------------
{
  let bad = 0;
  if (D.fuel.good && !ids.has(D.fuel.good)) fail(`fuel good "${D.fuel.good}" not in pack`), bad++;
  if (!(D.fuel.time > 0)) fail(`fuel time ${D.fuel.time}`), bad++;
  if (D.silo.feedGood && !ids.has(D.silo.feedGood))
    fail(`silo feed "${D.silo.feedGood}" not in pack`), bad++;
  for (const id of gathered) if (!ids.has(id)) fail(`gathered "${id}" not in pack`), bad++;
  if (!bad) ok(`modifiers — fuel (${D.fuel.good}) and silo feed (${D.silo.feedGood}) resolve`);
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

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\n117 PACK STRUCTURAL TESTS PASSED");
