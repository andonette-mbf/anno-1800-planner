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

## Open decision — the overproduction question

The user's core need: "know I'm not over-producing" per island. Two candidate
end states, undecided as of Aug 2026 (revisit after M2 has been used a while):

- **Level 2 — production ledger**: counts × engine `effRate` → per-island
  produced t/min per good. Numbers, no target. Cheap once M2 data exists.
- **Level 3 — plan-linked islands**: link a saved calculator Plan to an
  island; the island block shows built-vs-planned, and "overproduction" means
  "beyond the plan". Bigger, but closes the calculator ↔ session loop.

## Next (tentative order — confirm with the user before starting each)

- **M3** — whichever of Level 2 / Level 3 wins the open decision above.
- **M4** — the other one, if still wanted.
- **M5** — quest list filterable/groupable by island tag.
- **M6** — backup & restore: one-button JSON export/import of all companion
  state; phone polish (touch targets, PWA install).
