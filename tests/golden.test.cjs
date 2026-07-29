// Golden test: the ported engine must be numerically identical to the legacy
// single-file app (tests/legacy.html, the last verified pre-Next build).
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const build = path.join(__dirname, "build");

execSync(
  `npx tsc src/lib/engine.ts src/lib/data.ts --outDir tests/build --rootDir src/lib ` +
    `--module commonjs --target es2020 --resolveJsonModule --esModuleInterop --skipLibCheck`,
  { cwd: root, stdio: "inherit" }
);
fs.copyFileSync(path.join(root, "src/lib/data.json"), path.join(build, "data.json"));

const eng = require("./build/engine.js");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(path.join(__dirname, "legacy.html"), "utf8");
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  url: "https://example.test/",
  beforeParse(w) {
    Object.defineProperty(w, "localStorage", {
      value: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
      },
    });
  },
});
const w = dom.window;

function approxEq(a, b, pathStr) {
  if (typeof a === "number" && typeof b === "number") {
    const diff = Math.abs(a - b);
    if (diff > 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)))
      throw new Error(`MISMATCH at ${pathStr}: ${a} vs ${b}`);
    return;
  }
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    if (JSON.stringify(a) !== JSON.stringify(b))
      throw new Error(`MISMATCH at ${pathStr}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
    return;
  }
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.join(",") !== kb.join(","))
    throw new Error(`KEY MISMATCH at ${pathStr}: [${ka}] vs [${kb}]`);
  for (const k of ka) approxEq(a[k], b[k], `${pathStr}.${k}`);
}

const SCENARIOS = [
  {
    name: "default preset",
    st: { sel: { steel_beams: { mode: "fac", val: 2 }, weapons: { mode: "fac", val: 2 } } },
  },
  {
    name: "construction kit, prod 150, coal mine, electricity",
    st: {
      sel: {
        timber: { mode: "fac", val: 4 },
        bricks: { mode: "fac", val: 4 },
        steel_beams: { mode: "fac", val: 4 },
        windows: { mode: "fac", val: 4 },
      },
      prod: 150,
      coalTime: 15,
      electricity: true,
    },
  },
  {
    name: "NW luxuries, silo, exact",
    st: {
      sel: {
        rum: { mode: "fac", val: 4 },
        cigars: { mode: "fac", val: 4 },
        chocolate: { mode: "fac", val: 4 },
        coffee: { mode: "fac", val: 4 },
      },
      silo: true,
      round: false,
    },
  },
  {
    name: "tpm targets",
    st: {
      sel: { canned_food: { mode: "tpm", val: 7.5 }, sewing_machines: { mode: "fac", val: 3 } },
    },
  },
  { name: "pop: 3000 farmers", st: { mode: "pop", pop: { farmers: 3000 } } },
  {
    name: "pop: small city, lifestyle, cons 80",
    st: {
      mode: "pop",
      pop: { farmers: 2500, workers: 2000, artisans: 800 },
      lifestyle: true,
      cons: 80,
    },
  },
  {
    name: "pop: tall city, silo+electricity+coal mine",
    st: {
      mode: "pop",
      pop: { farmers: 2500, workers: 2500, artisans: 1500, engineers: 1500, investors: 800, scholars: 500 },
      silo: true,
      electricity: true,
      coalTime: 15,
      cons: 110,
    },
  },
  { name: "empty", st: {} },
];

let failures = 0;
for (const sc of SCENARIOS) {
  const full = { ...eng.DEFAULT_STATE, sel: {}, pop: {}, ...sc.st };
  // Apply to legacy page (reset all fields explicitly).
  w.eval(`
    state.sel=${JSON.stringify(full.sel)};
    state.regionFilter=${full.regionFilter};
    state.prod=${full.prod};
    state.coalTime=${full.coalTime};
    state.round=${full.round};
    state.mode=${JSON.stringify(full.mode)};
    state.pop=${JSON.stringify(full.pop)};
    state.electricity=${full.electricity};
    state.lifestyle=${full.lifestyle};
    state.silo=${full.silo};
    state.cons=${full.cons};
    GOODS.coal.building = 15===state.coalTime ? "Coal Mine" : "Charcoal Kiln";
  `);
  const legacy = JSON.parse(
    w.eval(`JSON.stringify({
      targets: targets(),
      compute: compute(),
      optim: optimPlan(),
      ratio: perfectRatio(),
      cats: Object.keys(targets()).map(id => [id, goodCat(id) ?? null, dispTier(id) ?? null])
    })`)
  );
  const ours = {
    targets: eng.targets(full),
    compute: eng.compute(full),
    optim: eng.optimPlan(full),
    ratio: eng.perfectRatio(full),
    cats: Object.keys(eng.targets(full)).map((id) => [
      id,
      eng.goodCat(full, id) ?? null,
      eng.dispTier(full, id) ?? null,
    ]),
  };
  try {
    approxEq(legacy, JSON.parse(JSON.stringify(ours)), sc.name);
    const nGoods = Object.keys(legacy.compute.demand).length;
    const tot = legacy.optim ? legacy.optim.total : 0;
    console.log(`ok - ${sc.name} (${nGoods} goods, optim total ${tot})`);
  } catch (e) {
    failures++;
    console.error(`FAIL - ${sc.name}: ${e.message}`);
  }
}

if (failures) {
  console.error(`\n${failures} scenario(s) failed`);
  process.exit(1);
}
console.log("\nENGINE GOLDEN TESTS PASSED");
