---
description: M9 — suggested trade flows: match one island's surplus to another's deficit. Needs M8 (residents) first.
---

Cross-island suggestions: "ship 2 t/min Rum: Manola → Crown Falls" — computed
from the ledgers, offered as one-tap adds. **Do not start this before M8
(residents per island) has landed**: without resident demand, final-goods
"surpluses" are fiction and every suggestion would be wrong.

What already exists — this milestone is SUGGESTIONS on top of it, not new
plumbing:

- **Manual trade links shipped in builds 96–100** (`TradeLink` rows in
  `anno_island_links`, ticked on a surplus row in the source ledger).
  `applyTrade` in `src/lib/ledger.ts` runs across all islands' ledgers at
  once: tracked shortfalls served first in flow order, then the source's
  whole remaining surplus rides the good's first link, landing as stock at
  the destination. **Exported means gone.**
- **Ship routes imply the same flows** — a fleet row with job "Trade route" +
  from/to/cargo feeds the same mechanism. A good suggestion should notice an
  existing ship already covering the flow.

The work:

1. A pure function (ledger.ts or a sibling) that, given all islands'
   post-resident, post-existing-trade ledgers, pairs remaining surpluses with
   remaining deficits per good — deterministic order (largest deficit first,
   or flow order like `applyTrade`; pick one and test it).
2. UI: a read-only strip — probably at the top of the Islands card, where the
   Collections row sat pre-101 — each suggestion a chip: good picture, t/min,
   from → to, and an accept tap that calls `addIslandLink` (the suggestion
   then disappears because the ledger now routes it). Respect the island
   filter if one is active.
3. Suggestions must react to: links already accepted, resident demand (M8),
   ships' implied routes. They must NOT suggest a flow both ways for the same
   good, or from an island whose surplus an earlier suggestion already spent
   — run the pairing on the post-trade ledgers, not the raw ones.
4. Manual link records already exist, so the roadmap's fallback ("manual
   routes only if suggestions aren't enough") is satisfied — this session is
   purely the suggestions.

Verify: `tests/ledger.test.cjs` — hand-derived pairing cases (one surplus two
deficits, chained islands, a link already covering a flow, both-ways guard).
UI check in `tests/island-ui.test.mjs` if a strip lands on the Islands card.
Bump the build tag. Stage explicit paths; ask before pushing.
