---
description: M8 — residents per island: the ledger learns what your population eats, so deficits become real for final goods.
---

Per-tier population counts on each island block, feeding resident consumption
into the island ledger: **net = production − chain use − residents**. Today
the ledger only nets on-island chain consumption, so a Bakery island looks
fine while its Workers quietly eat more bread than it bakes. This is the
milestone that makes deficits real for final goods — and M9 (trade-route
suggestions) depends on it being honest.

What exists to build on:

- **The engine already knows the rates.** `popTargets` in `src/lib/engine.ts`
  turns residents × per-resident need rates into t/min, gated by
  `needActive` — 1800's unlock thresholds + lifestyle toggle, 117's four
  supply bands — all through the dataset (`datasetFor`). **Reuse that logic;
  do not re-derive rates in ledger.ts.** The M12 rule applies: go through the
  `Dataset` interface, never a `game === "anno117"` branch (ledger.ts already
  has some — don't add more; see M12's list).
- **The ledger** (`src/lib/ledger.ts`) builds per-island rows from checklist
  buildings and then `applyTrade` runs across ALL islands at once (build
  96–100: tracked shortfalls served first, surplus rides the first link,
  "exported means gone"). Resident demand must land BEFORE trade is applied,
  so links serve real shortfalls.
- **Storage**: a new per-island field (e.g. `islandPop`: island → tier id →
  residents) in `CompanionData` — parse/save/EMPTY_DATA/`removeIsland`
  cleanup/sync-blob `norm` in `src/lib/store.tsx`, key via the same
  `anno_…`/`anno117_…` scheme (`gkey`), unknown to /legacy.html like plans
  and culture. Follow the `islandItems` (M11b) diff as the template — it
  touched every seam in order.

Decisions to put to the user before building (the roadmap left them open):

1. **Lifestyle toggle and consumption slider (1800) / needs band (117): per
   island or global?** Global is less UI and matches the calculator's single
   setting; per-island is truer (a lifestyle-goods island vs a frontier one).
2. **Which tiers to offer per island** — probably the island's 🌍 region's
   tiers only, the way growth goals scoped themselves in build 52.
3. How the input reads on the block — a counts row like the silo/⚡ counters,
   or a small per-tier editor behind a fold. The island card is already
   dense; check the tuck/fold behaviour (builds 72/99) before adding rows.

Verify: extend `tests/ledger.test.cjs` with hand-derived expectations
(residents × rate, threshold gating, band scaling, interplay with
`applyTrade`) and `tests/island-ui.test.mjs` for the input surviving
fold/reload. `npm run test:games` for 1800/117 separation; `test:engine`
untouched. Bump the build tag. Stage explicit paths; ask before pushing.
