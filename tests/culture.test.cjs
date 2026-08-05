// Structural test for the Anno 1800 culture pack (src/lib/culture-1800.json)
// and the collection maths in src/lib/culture.ts (M11).
//
// Same reasoning as the 117 pack test: there is no golden reference for item
// data, so what gets enforced is internal coherence — because the source is a
// community wiki whose tables move. A re-extraction that loses a set, drops
// the effect line, or picks up a header row as an item should fail here rather
// than ship a half-empty tracker.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const P = JSON.parse(fs.readFileSync(path.join(ROOT, "src/lib/culture-1800.json"), "utf8"));

let failures = 0;
const fail = (m) => {
  console.error(`FAIL - ${m}`);
  failures++;
};
const ok = (m) => console.log(`ok - ${m}`);

const RARITY = new Set(P.rarity);

// --- shape: three buildings, each with sets and a noun -------------------
{
  const want = ["zoo", "museum", "garden"];
  const got = P.buildings.map((b) => b.id);
  if (want.join() !== got.join()) fail(`buildings are ${got.join()}, expected ${want.join()}`);
  else ok(`pack ${P.pack} — ${got.length} culture buildings`);
}

// --- every item is well-formed ------------------------------------------
{
  let items = 0;
  let bad = 0;
  for (const b of P.buildings) {
    if (!b.label || !b.noun) fail(`${b.id}: missing label/noun`), bad++;
    const all = [...b.sets.flatMap((s) => s.items), ...b.loose];
    for (const i of all) {
      items++;
      if (!i.n || typeof i.n !== "string") fail(`${b.id}: item with no name`), bad++;
      if (!RARITY.has(i.r)) fail(`${b.id}/${i.n}: rarity "${i.r}" is not in the ladder`), bad++;
      if (!Number.isFinite(i.a) || i.a <= 0)
        fail(`${b.id}/${i.n}: attractiveness ${i.a}`), bad++;
      // A header row leaking through would look exactly like this.
      if (/^(animal|exhibit|plant|rarity)$/i.test(i.n))
        fail(`${b.id}: "${i.n}" looks like a table header, not an item`), bad++;
    }
  }
  if (!bad) ok(`${items} items — name, rarity and attractiveness all sane`);
}

// --- names are unique within a building ---------------------------------
// The whole store keys off the display name, so a duplicate would make one
// tap light up two chips.
{
  let bad = 0;
  for (const b of P.buildings) {
    const seen = new Map();
    for (const s of b.sets)
      for (const i of s.items) {
        const k = i.n.toLowerCase();
        if (seen.has(k)) fail(`${b.id}: "${i.n}" is in both ${seen.get(k)} and ${s.label}`), bad++;
        seen.set(k, s.label);
      }
    for (const i of b.loose) {
      const k = i.n.toLowerCase();
      if (seen.has(k)) fail(`${b.id}: loose "${i.n}" also sits in ${seen.get(k)}`), bad++;
      seen.set(k, "(no set)");
    }
  }
  if (!bad) ok("item names are unique within each building");
}

// --- sets are non-empty, named, and say what they pay --------------------
{
  let bad = 0;
  let sets = 0;
  const ids = new Set();
  for (const b of P.buildings)
    for (const s of b.sets) {
      sets++;
      if (!s.items.length) fail(`${b.id}/${s.label}: empty set`), bad++;
      if (!s.label) fail(`${b.id}: set with no label`), bad++;
      const key = `${b.id}/${s.id}`;
      if (ids.has(key)) fail(`duplicate set id ${key}`), bad++;
      ids.add(key);
      // The effect is the reason to chase the last piece — losing it to a
      // wiki re-word is exactly the silent regression this guards.
      if (!s.effect) fail(`${b.id}/${s.label}: no effect line parsed`), bad++;
    }
  if (!bad) ok(`${sets} sets — all named, non-empty, with an effect`);
}

// --- provenance is recorded ---------------------------------------------
{
  const pages = P.source?.pages || [];
  if (pages.length !== 3 || pages.some((p) => !p.revid))
    fail("source revisions missing — the pack is not reproducible");
  else ok(`provenance — ${pages.map((p) => `${p.page}@${p.revid}`).join(", ")}`);
}

// --- the typed view and its maths ---------------------------------------
// Compiled the way the 117 pack test compiles data117.ts, so a pack change
// that breaks the loader fails here rather than at next build.
{
  const { execSync } = require("child_process");
  const build = path.join(__dirname, "build");
  try {
    execSync(
      `npx tsc src/lib/culture.ts --outDir tests/build --rootDir src/lib ` +
        `--module commonjs --target es2020 --resolveJsonModule --esModuleInterop --skipLibCheck`,
      { cwd: ROOT, stdio: "pipe" }
    );
    fs.copyFileSync(
      path.join(ROOT, "src/lib/culture-1800.json"),
      path.join(build, "culture-1800.json")
    );
    const C = require("./build/culture.js");

    // 117 has no culture buildings at all — the panel must never render there.
    if (C.cultureFor("anno117") !== null) fail("cultureFor('anno117') should be null");
    if ((C.cultureFor("anno1800") || []).length !== 3) fail("cultureFor('anno1800') lost a building");

    // Only a BUILT (ticked) building shows its collection.
    const built = C.cultureOn(
      [
        { t: "Zoo", done: true },
        { t: "Museum", done: false },
        { t: "Sheep Farm", done: true },
      ],
      "anno1800"
    );
    if (built.map((b) => b.id).join() !== "zoo")
      fail(`cultureOn returned ${built.map((b) => b.id).join()}, expected just zoo`);
    if (C.cultureOn([{ t: "Zoo", done: true }], "anno117").length)
      fail("cultureOn returned 117 culture buildings");

    const zoo = C.CULTURE.find((b) => b.id === "zoo");

    // Empty zoo: nothing placed, nothing complete, no attractiveness.
    {
      const p = C.buildingProgress(zoo, []);
      if (p.have !== 0 || p.complete !== 0 || p.attract !== 0)
        fail(`empty zoo reads ${p.have}/${p.complete}/${p.attract}`);
      if (p.total !== zoo.sets.reduce((n, s) => n + s.items.length, 0) + zoo.loose.length)
        fail("total is not sets + loose");
    }

    // A complete set: worked by hand off the pack. Arctic Tundra is 3 Rare
    // animals at 30 attractiveness each, so a zoo holding exactly those three
    // is 3/3, one set complete, +90.
    {
      const set = zoo.sets.find((s) => s.id === "arctic-tundra");
      if (!set) fail("zoo has no arctic-tundra set");
      else {
        const names = set.items.map((i) => i.n);
        const p = C.buildingProgress(zoo, names);
        const want = set.items.reduce((n, i) => n + i.a, 0);
        if (p.have !== names.length) fail(`placed ${names.length}, progress says ${p.have}`);
        if (p.complete !== 1) fail(`${p.complete} sets complete, expected 1`);
        if (p.attract !== want) fail(`attractiveness ${p.attract}, expected ${want}`);
        const sp = p.sets.find((s) => s.set.id === "arctic-tundra");
        if (!sp.done || sp.missing.length) fail("arctic-tundra not reported complete");
        ok(
          `maths — Arctic Tundra (${names.length} × ${set.items[0].r}) = complete, +${want} attractiveness`
        );
      }
    }

    // Case doesn't matter: the player may have typed it, or an older save may
    // carry different casing than the wiki now uses.
    {
      const set = zoo.sets.find((s) => s.id === "arctic-tundra");
      const p = C.buildingProgress(zoo, set.items.map((i) => i.n.toUpperCase()));
      if (p.complete !== 1) fail("case-insensitive matching failed");
      else ok("item matching is case-insensitive");
    }

    // One piece short is the shortlist the panel leads with — and a set you
    // have not started must NOT appear in it.
    {
      const set = zoo.sets.find((s) => s.id === "arctic-tundra");
      const p = C.buildingProgress(zoo, set.items.slice(0, -1).map((i) => i.n));
      const next = C.nearlyDone(p);
      const hit = next.find((s) => s.set.id === "arctic-tundra");
      if (!hit) fail("a set one piece short is missing from nearlyDone");
      else if (hit.missing[0].n !== set.items[set.items.length - 1].n)
        fail(`nearlyDone names ${hit.missing[0].n} as missing`);
      if (C.nearlyDone(C.buildingProgress(zoo, [])).length)
        fail("nearlyDone listed sets that have not been started");
      else ok(`nearlyDone — ${next.length} set(s) one piece short, untouched sets excluded`);
    }

    // Loose pieces pay attractiveness but complete nothing.
    {
      const l = zoo.loose[0];
      const p = C.buildingProgress(zoo, [l.n]);
      if (p.have !== 1 || p.complete !== 0 || p.attract !== l.a)
        fail(`loose piece reads ${p.have}/${p.complete}/${p.attract}`);
      else ok(`loose pieces counted (${l.n}, +${l.a}) but complete no set`);
    }
  } catch (e) {
    fail(`typed view: ${e.stdout?.toString() || e.message}`);
  }
}

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nCULTURE PACK TESTS PASSED");
