---
description: M11c — collections (and items) for Anno 117. Research first; only promise what has a source.
---

Bring the 🏛 Culture-tab experience — and, if the data exists, M11b's item
sockets — to Anno 117, "as much as is available" (the user's words, Aug 2026).
Today both packs are 1800-only **by design**: `cultureFor` (`src/lib/culture.ts`)
and `itemsFor` (`src/lib/items.ts`) return `null` for 117, and everything
downstream renders nothing.

**The first job is research, not code.** When M11a shipped (Aug 2026, the game
was new), 117 had no zoo/museum/garden-style building and its wiki carried no
item data. The game has been patching since; verify what is true NOW:

1. **What does 117 actually collect?** Inventory the real mechanics — deities/
   temples, wonders, specialists, any museum-like set-completion system added
   in patches. Distinguish "a set you complete for a bonus" (culture-shaped)
   from "an item you socket in a building" (items-shaped, M11b) — they map to
   different packs and different panels, and 117 may have one, both, or
   neither.
2. **Check the upstream data pack** — anno-mods/anno-117-calculator, pinned at
   `c6a6e75` in the M10 notes; check whether HEAD has moved and whether it now
   carries item/collection assets the wiki doesn't render.
3. **Re-check the 117 wiki** (`anno117.fandom.com`). It was thin because the
   game was young. Same rules as every extraction so far: the **API
   (`api.php`) is open even where the rendered site blocks scrapers**, and
   **Fandom 403s a default user-agent** — copy the `UA` header from
   `scripts/extract-culture.mjs` or `scripts/extract-items.mjs`. 117's
   specialists are real (the wiki names Epona and the Arboreal Rhizome
   Veneration) but published no list as of M11b — that may have changed.
4. **Only promise what has a source** — machine-readable and clearly licensed
   BEFORE a feature is announced (the rule 117's own data pack followed). If
   117 turns out to have no set-collection mechanic at all, say so on the tab
   rather than faking one.

**Then put what you found to me and confirm scope before building.**

The code is already shaped for it — hand it a pack and it lights up:

- **Culture:** `cultureFor(game)` is the single gate. A 117
  `CultureBuilding[]` pack (versioned like `culture-1800.json`, its own
  extractor and `test:culture`-style test) turns on the panel, the roll-up,
  the island links and the tab. Two deliberate 117-blocks must then be
  flipped: AppShell hides the 🏛 tab for `rome` (the `VIEWS` filter, build
  101) and remaps a stored `culture` view to `islands` — both were written for
  "117 has nothing", not forever. `cultureOn` matches building labels against
  island checklist items, so the 117 buildings also need entries in
  `games.ts`' inventory chips.
- **Items (M11b, build 103):** `itemsFor(game)` is the same kind of gate. A
  117 pack in `items-1800.json`'s shape (sockets → items with `n`/`r`/`tgt`/
  `fx`) turns on `ItemsBlock` on the island cards and the 🎖 picker in the
  fleet rows. The socket buildings' labels must match 117 inventory chip
  names, the way "Trade Union"/"Arctic Lodge" do for 1800. If the wiki still
  publishes no list, DON'T build a free-text-only version without asking —
  that was left out of M11b on purpose.

**Start with `/carry-on`'s sync + collision check.** Verify with
`npm run test:culture`, `test:culture-ui`, `test:items`, `test:items-ui` and
`test:games` (plus a new pack test for anything extracted — pin provenance
revids like the other packs). Bump the build tag in
`src/components/calc/Results.tsx`. Stage explicit paths — never `git add -A`.
