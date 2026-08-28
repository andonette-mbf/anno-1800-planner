---
description: Re-base the Anno 117 data pack onto upstream Release 3.0 (new goods, DLC region, fuel flags). Run before /rome-collections if both are wanted.
---

Re-extract `src/lib/data-117.json` from anno-mods/anno-117-calculator at
**Release 3.0** — commit `28969c3` (2026-08-20), two releases past the pinned
`c6a6e75` our pack 2 came from. Found while researching M11c (Aug 2026):

- `products` grew 113 → **146** and `factories` 118 → **144** — Prophecies of
  Ash content (Obsidian chain, Statuettes, Latrunculi were already in pack 2;
  3.0 adds more).
- `regions` gained a third slot and `sessions` a `Global` entry — check what
  they are before assuming two provinces everywhere. `regionRank`/bitmask
  handling in `src/lib/dataset.ts` must still hold.
- `factories` now carry `needsFuelInput` (cross-check our 23-building fuel
  list) and `modulesLimit`; `fertilities` (26) is now first-class — fertility
  is still deliberately unmodelled, but note what's available.
- `needAttributes.Population` (the 📈 growth-goal source, pack 2) — confirm
  byte-identical or update `tests/pack117.test.cjs`'s pinned Liberti example
  consciously. That test exists precisely so an upstream re-tune fails loudly.
- Factories still carry **no workforce cost** — M10's out-of-scope decision
  stands; don't model it.

Process: bump `PACK` and the pinned commit in `scripts/extract-117.mjs`, run
`npm run extract:117`, then make `npm run test:117` and
`npm run test:engine117` pass — engine117's expectations are hand-derived, so
a changed rate needs its comment re-derived, not just the number changed.
Check the 113-goods × both-provinces sweep still covers everything (it should
become 146 × …). New goods may also want icons (`npm run` script
`fetch-good-icons-117`-style — `EXTRA_NAMES` gotchas in that script) and
inventory chips in `games.ts` if any new public buildings appear.

**Do this BEFORE `/rome-collections`** when both are planned, so the 117 items
pack pins the same upstream commit as the numbers.

Start with `/carry-on`. Verify `test:117`, `test:engine117`, `test:games`,
`test:engine` (1800 must be untouched). Bump the build tag. Stage explicit
paths; ask before pushing.
