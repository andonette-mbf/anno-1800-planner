---
description: M10 phase 3 — make the calculator work for Anno 117
---

Bring the calculator to Anno 117. Today `AppShell` hides the Calculator tab
whenever the game is 117 (`calcReady`), because `src/lib/engine.ts` reads six
module-level constants straight from `src/lib/data.ts` and would silently
apply 1800's math to Rome.

**Start with `/carry-on`'s sync + collision check.** Then confirm the approach
with me before writing code — this is the biggest remaining chunk.

**The good news, already established by the extraction — don't re-derive it:**

- **Flexible needs do not exist.** The roadmap once assumed 117 needed
  need-groups ("porridge OR bread"). The data has none, and the upstream
  calculator has no substitution logic: each need is one good at its own rate,
  exactly like 1800. `POP` / `popTargets` / `needActive` port over almost as-is.
- **117 has no electricity**, so `electrifiable` becomes a per-game hook.
- **Coal is a fuel input, not a rate switch.** 1800's `coalTime` picks between
  Charcoal Kiln 30s and Coal Mine 15s; 117's Charcoal Burner and Coal Mine are
  both 30s, and fuel is a separate consumption edge (see `/rome-modifiers`).

**The two things that genuinely differ, and will bite if ignored:**

1. **`region` is a BITMASK in 117** (1 Latium, 2 Albion, 3 both) — 29 goods
   exist in both regions. `engine.ts`'s `displaySort` does `x.region - y.region`
   and `electrifiable` does `region === 1`; both assume a single region id.
2. **A good's producer varies by region.** Flour is Grain Mill 30s in Latium
   and Donkey Mill 60s in Albion — a different RATE. Leather, Amphorae and
   Tiles take different INPUTS per region. `producerIn117(goodId, region)` in
   `src/lib/data117.ts` already resolves this; the engine must pick per region
   rather than trusting the primary tuple, or it will compute an Albion island
   using Latium's chain and be quietly wrong.

**Suggested seam:** `CalcState` already flows through every engine function and
is what the URL hash encodes. Putting the game on `CalcState` lets the engine
resolve its dataset internally (`datasetFor(st)`) with no signature churn, and
a state without a game defaults to 1800 — so `tests/golden.test.cjs` keeps
passing unchanged, which is the bar. The hash also needs a game marker, kept
backwards-compatible: an old 1800 link has no marker and must still load.

Also decide: 117 has `workforce` / `populationToWorkforceFactor` per tier that
1800 has no equivalent for. In scope or not?

Verify: `npm run test:engine` must pass untouched (it is the 1800 contract),
plus `test:117` and `test:games`. Add 117 scenarios to the test suite — there
is no golden reference for 117, so assert against hand-checked chains. Bump the
build tag. Stage explicit paths — never `git add -A`.
