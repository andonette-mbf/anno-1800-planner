---
description: M11c — items (and patrons) for Anno 117 from upstream Release 3.0. Scope confirmed research done Aug 2026; confirm shape with the user, then build.
---

Bring "as much as is available" of the 🏛 Culture / M11b items experience to
Anno 117. **The research phase already ran (28 Aug 2026, this repo's session
102–103 window) — don't redo it. Findings:**

- **The 117 wiki is a dead end and stayed one.** 40 pages total
  (anno117.fandom.com, open `api.php`, same UA rules as ever), no item lists,
  no set data. Nothing to extract there.
- **The upstream pack moved and now carries the data.**
  anno-mods/anno-117-calculator is at **Release 3.0** (commit `28969c3`,
  2026-08-20) — two releases past our pinned `c6a6e75`. Its `js/params.js`
  now holds, alongside everything we already extract:
  - **`items`: 172** — `{name/locaText, rarity (Common…Legendary), targets:
    [building guids], buffs: [guids into buildingBuffs/effects], effectScope,
    dlcUnlocks}`. Real specialists ("Elephant Handler", "Servia Bellia, Lily
    of the Coast"). Effect text must be resolved by joining `buffs` →
    `buildingBuffs`(355)/`effects`(105); target names by joining guids
    against factories/buildings.
  - **`patrons`: 8** — the deities (Mars, Ceres, Neptune, Mercury-Lugus,
    Epona, Cernunnos, Minerva, Vulcan) with `localEffects`/
    `dominantEffects`/`wonder`. This is 117's Religion system: ONE patron per
    island, devotion buffs. **Epona is a deity, not a specialist** — the old
    wiki mention that seeded M11b's note was misleading.
  - Also new since our pack 2: `products` 146 (was 113), `factories` 144
    (was 118) with `needsFuelInput` and `modulesLimit`, `fertilities` 26,
    `techs`, a third region slot and a `Global` session (Prophecies of Ash
    DLC). Factories still carry **no workforce** — M10's out-of-scope call
    stands. Re-basing data-117.json onto 3.0 is `/rome-pack3`, a separate
    session; run it FIRST if both are wanted, so the items pack pins the
    same commit.

**So 117 has no set-collection mechanic** — nothing culture-shaped to fake.
What it has is (a) **socketable items** → M11b's `ItemsBlock`/fleet picker can
light up via `itemsFor`, and (b) **patrons** → at most a small per-island
"patron" pick with its two buff lines (closest 117 gets to the Culture tab).
**Put that scope choice to the user before building:** items only, items +
patrons, or hold.

Build notes, once scope is confirmed:

- **Extractor**: a `scripts/extract-items-117.mjs` reading the pinned upstream
  commit the way `scripts/extract-117.mjs` does (raw.githubusercontent.com,
  pinned SHA in the script, `pack` + provenance in the JSON). Resolve buff
  guids to one compact `fx` line and target guids to building names at
  extraction time — ship names, not guids, in the pack.
- **Open question the data must answer: which SOCKET do 117 items go in?**
  1800's pack is keyed by socket building (Trade Union…). 117's items carry
  `effectScope`/`targets` instead; find the equipping building(s) in the
  upstream source (`src/buffs.ts`, `docs/`, the `itemsEquipped` translate
  logs) before choosing the pack shape. If 117 items all socket in one kind
  of building, `itemsFor("anno117")` can return one socket and the whole
  M11b UI works unchanged; the socket building's label must then exist in
  `games.ts`' 117 chips so `socketsOn` can match it.
- **Gates to flip** (all written for "117 has nothing", not forever):
  `itemsFor` in `src/lib/items.ts`; for patrons-as-culture, `cultureFor` in
  `src/lib/culture.ts` plus AppShell's `VIEWS` filter hiding the 🏛 tab for
  `rome` and the stored-`culture`-view remap to `islands` (build 101). Don't
  bolt patrons into the culture shape if it fights it — a patron is one
  choice per island, not a set to complete; a small dedicated block on the
  island card may be honest where a fake "collection" isn't.
- **Tests**: a pack test in the `tests/items.test.cjs` mould (floors, spot
  checks against hand-read upstream values, provenance pinned) and UI checks
  in the `items-ui` mould. `npm run test:games` guards the 1800/117 split.

**Start with `/carry-on`'s sync + collision check.** Verify with
`npm run test:items`, `test:items-ui`, `test:117`, `test:games`. Bump the
build tag in `src/components/calc/Results.tsx`. Stage explicit paths — never
`git add -A`. Ask before pushing.
