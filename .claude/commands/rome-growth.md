---
description: M10 — growth goals for Anno 117 (blocked on a residents-per-house source)
---

Bring the 📈 growth-goals panel to Anno 117. It is 1800-only today:
`GROWTH_TIERS_BY_GAME.anno117` in `src/components/TrackerView.tsx` is `[]`.

**This one is blocked on data — settle that before writing UI.**

1800's goals work off two numbers per tier that the 117 pack does not have:

- **`fh`, residents per fully-upgraded house** — turns a resident target into a
  residence count ("1,500 Workers = 75 houses"). Not in
  `anno-mods/anno-117-calculator`'s `params.js` at all: its `populationLevels`
  carry only `connectedWorkforce` and `populationToWorkforceFactor`, and its
  `residenceBuildings` carry only the needs list.
- **Need-unlock thresholds** — 1800's `POP[tier].n[good]` is
  `[rate, category, unlockTier, unlockThreshold]`, and the threshold is what
  makes a milestone ("Bread unlocks at 150 Workers"). 117's need entries are
  `[rate, categoryBand]` — there is no threshold, because needs are banded by
  `supplyWeight` (1/2/4/8) rather than gated on a population count.

So the first job is deciding what a 117 "growth goal" even is. Options worth
weighing before you build anything:

- Source residents-per-house and the unlock rules from somewhere verifiable
  (the game files, the wiki, or a newer upstream `params.js`) and bump the pack
  — `npm run extract:117`, raise `PACK` in `scripts/extract-117.mjs`.
- Or drop the house-count framing and make 117 goals the **supply-weight bands**
  instead: "reach Plebeians and you take on 6 more needs — here they are." That
  uses only what the pack already has and may be the more useful tool anyway.

**Start with `/carry-on`'s sync + collision check**, then put the options to me
and confirm before building. Do not invent `fh` values — a wrong residents-per-
house number silently corrupts every goal on the panel.

Verify with `npm run test:117`, `test:games` and `test:engine`. If you bump the
pack, its provenance block must record the new commit. Bump the build tag.
Stage explicit paths — never `git add -A`.
