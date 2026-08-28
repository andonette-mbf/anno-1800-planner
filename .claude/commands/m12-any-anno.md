---
description: M12 — any Anno, not just two. De-hardcode the 31 anno117 mentions so a third game is a data pack + settings. Read the ROADMAP entry first.
---

Make a third/fourth/fifth Anno (**1701, 1404, 2070, 2205** — the user doesn't
play 1602/1503, don't spend time on them) cost only a data pack and a
`games.ts` entry. **The full spec lives in ROADMAP.md's M12 entry — read it
before starting; it lists what's already done and proved by 117 (don't redo
the dataset/games.ts/switcher plumbing) and the six places that still assume
exactly two games.** Short form of the six:

1. `store.gkey` + `ISLE_SHUT_KEY` + the sync blob's `g117` slot → per-game
   prefixes listed in `GAMES` (1800 keeps the bare legacy keys FOREVER —
   /legacy.html reads them; old `g117` blobs must still parse).
2. `GoodIcon`'s two icon maps → one per game (files stay separate: 24 names
   collide between 1800 and 117 with different art).
3. `ledger.ts` imports 117 goods directly → read the dataset instead.
4. `engine.defaultStateFor`'s hardcoded 117 start region → dataset field.
5. Footer credits / page title / logo / region wording → per-game text.
6. AppShell's culture-tab hide → "a game whose `cultureFor` is null has no
   tab" (M11c may have flipped 117's by the time this runs; same rule).

Two design rules from the roadmap: **regions are each game's own thing**
(1800 ids, 117 bitmask — never do sums across; that's why `regionRank`
exists) and **needs models differ** (1800 thresholds+lifestyle, 117 bands; a
third game may need a third case behind `needActive`).

**The blocker is data, not code**: find a machine-readable, clearly licensed
source per game BEFORE promising its calculator — the rule 117 followed
(anno-mods pack) and the culture/items packs followed (wiki API, UA header
load-bearing, provenance pinned). Nobody has surveyed sources for
1701/1404/2070/2205 yet — that survey is a legitimate first session on its
own.

**The cheap first step, worth shipping alone**: a game with NO pack still
gets the full Tracker (quests, islands, typed inventory, fleet) — exactly how
117 started (build 56). Decide with the user whether packless games appear in
the switcher by default.

This is refactoring under two live games: `npm run test:engine` (the 1800
golden contract) and `test:engine117` must pass UNCHANGED throughout, plus
`test:games`/`test:saves` for storage separation. Work the six items as
separate commits so a wrong turn reverts cleanly. Bump the build tag. Stage
explicit paths; ask before pushing.
