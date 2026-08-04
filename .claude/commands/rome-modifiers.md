---
description: M10 — Silo + Coal fuel for Anno 117, so Rome lines stop counting at base rate
---

Finish the Anno 117 modifier layer. Right now a 117 building in the island
ledger counts at its base rate — `src/lib/ledger.ts`'s `build117()` returns
`siloFeed: () => null` and `elecRegion: null`, which is honest but incomplete.

**Start with `/carry-on`'s sync + collision check** — this repo is regularly
driven from two sessions at once. Then:

1. **Silo.** 117 has one, and it works like 1800's: `data-117.json` `silo` =
   `{feedGood: "wheat", feedPerMin: 0.2, productivityUpgrade: 100}`. +100% is
   ×2, the same multiplier `effRate` already applies. Reuse the existing
   per-line `CheckItem.s` counter and the red-gap "fix" phrasing rather than
   inventing new UI.
2. **Coal fuel.** 23 producers have `fuel: true` (`Renderer`, `Furnace`,
   `Glass Smelter`, `Goldsmith`, …). `data-117.json` `fuel` =
   `{good: "coal", time: 120}`: a building burns one Coal per 120s of run
   time, so a line of n buildings eats `n * 60/120` t/min of Coal. This is a
   consumption edge like the silo feed — it has no 1800 equivalent as an
   *input*, so it needs its own edge in the ledger, not a rate multiplier.
3. **Do NOT wire `modulesLimit`.** It is the max module SLOTS a building takes
   and runs to 80/140/180 — those are a farm's FIELD tiles, not silos. Which
   buildings can take a Silo is not directly in the pack; work it out (or ask)
   before gating the silo counter on anything.

Watch for: 117 has no electricity — `elecCapable` must stay false there.
A producer carries its own `inputs`, because Leather, Amphorae and Tiles take
different ingredients per region; don't read inputs off the good.

Verify with `npm run test:117` (extend the ledger smoke test with a silo and a
fuel case), `npm run test:engine` (1800 must not move) and `npm run
test:games`. Bump the build tag in `src/components/calc/Results.tsx`, then
follow the CLAUDE.md workflow. Stage explicit paths — never `git add -A`.
