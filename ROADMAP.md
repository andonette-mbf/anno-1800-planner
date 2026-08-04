# Roadmap

Development milestones for the planner, M1 onward. One milestone per dev
session, roughly in order. Reorder freely; add new ideas at the bottom and
renumber when priorities change. Workflow (build tag, golden tests, deploy)
is in CLAUDE.md.

## Done

- **M1 — Island inventory v1** (build 32): per-island checklist on the Session
  tab — one-tap chips for landmarks/facilities, unticked items shown red as
  gaps. Groundwork shipped alongside: quest tracker with story/DLC picker and
  context notes, session-based quest aging (Shutdown Check completion = one
  session), island list + quest island-tagging, tab persistence (builds 25–31).
- **M2 — Buildings, not prose** (build 34): island inventory items come from
  the game's real building list (datalist from `GOODS`), with counts
  ("Sheep Farm ×2") and a "(silo)" variant for silo-capable animal farms.
  The landmark chips stay as a separate quick-add row.
- **M3 — Production ledger** (build 35): the overproduction question was
  decided (Aug 2026) in favour of Level 2 first. Each island block now sums
  its ticked buildings into a makes/uses/net t/min ledger per good
  (`src/lib/ledger.ts`): base rates, silo variants ×2 + feed, on-island chain
  consumption netted, goods merged by display name across regions. Cattle
  Farm got a "(New World)" entry because its rate differs from the Old World
  one. No target yet — numbers only.
- **Ledger fix hints + Playbook removed** (build 36): red ledger deficits now
  say what to build ("⚠ Short — build 1× Grain Farm", `fix` on `LedgerRow` —
  5 silos × 0.2 feed = one Grain Farm). The Playbook tab was removed at the
  user's request ("pointless"): tab, view and `PLAYBOOK_*` prose deleted,
  dangling "see playbook" references cleaned from Session prose + docs,
  `openq` state kept in the store/sync schema for old blobs. The wording
  survives in `anno-1800-lean-playbook.md` and `/legacy.html`.
- **Anno light theme** (build 37): dark blue palette replaced with a light
  Anno-flavoured one — parchment/cream surfaces, sepia ink, brass gold,
  sea-teal, terracotta. Colours only (CSS vars + the hardcoded hexes);
  selectors and layout untouched. `/legacy.html` keeps the dark original.

## Next (tentative order — confirm with the user before starting each)

- **M4 — Level 3, plan-linked islands** (if still wanted after living with
  the ledger): link a saved calculator Plan to an island; the island block
  shows built-vs-planned and "overproduction" means "beyond the plan".
  Closes the calculator ↔ session loop.
- **M5** — quest list filterable/groupable by island tag.
- **M6** — backup & restore: one-button JSON export/import of all companion
  state; phone polish (touch targets, PWA install).
