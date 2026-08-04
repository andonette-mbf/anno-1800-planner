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
- **Session ritual removed → Tracker tab** (build 38): the user only uses the
  quest tracker and island inventory, so Current Focus, Shutdown Check,
  Parking Lot, all session prose and the quest age pills (their clock was the
  Shutdown Check) were removed. `SessionView` → `TrackerView`, tab renamed
  Tracker (stored `session` view id maps over), `src/content/companion.ts`
  deleted. Retired state fields stay in the store schema for sync round-trip.
- **Silo as bolt-on** (build 39): "(silo)" picker variants replaced by a silo
  toggle chip on silo-capable farm rows (`CheckItem.s`) — silos are modules
  you add later, not separate buildings. Legacy "(silo)" item names migrate
  to the flag in `parseChecks` (also applied to server blobs on sync); the
  old names still parse in the ledger as a fallback.
- **M4 — Level 3, plan-linked islands** (build 40): 🎯 on an island block
  links a calculator plan — a saved plan or a snapshot of the live calculator
  (`IslandPlan` in `anno_island_plans`, synced with the rest). The plan check
  (`src/lib/plancheck.ts`) compares ticked buildings against the plan's
  whole-building counts per good (merged by display name, like the ledger):
  red "to finish the plan — build N×…" for shortfalls, and buildings above or
  outside the plan listed as "beyond the plan" — overproduction now means
  "beyond the plan". Snapshots don't track later plan edits; re-link.
- **Per-farm silos** (build 41): `CheckItem.s` became a count — a line can be
  part-silo'd ("Pig Farm ×5, silos 3/5"), since in game each farm gets its own
  module. Build-39 boolean `s:true` parses as all-silo'd; ledger feed/output
  scale with the silo count. Build 42 replaced the tap-to-cycle chip with an
  explicit −/＋ counter ("− silos 3/5 ＋") after the cycling read as broken.
- **Tidy tracker** (build 43): the screen-clogging feedback. Ticked quests
  sink to the bottom of the list (`toggleQuest` keeps the array partitioned
  open-first; ▲▼ swap within the open subset via `swapQuests`) and hide
  behind a "▸ N completed" toggle with Clear-all; the landmark chip wall per
  island collapses behind one "＋ Landmarks & facilities…" chip; both card
  intros cut to one line (details live in hover titles). Island inventory
  items intentionally stay visible when ticked — they're inventory, not
  todos.
- **M5 — quest island filter** (build 44): chip row above the quest list —
  "All" plus one chip per island that has a tagged quest ("Island: …" prefix
  matched against the island list, `questIsland`), open-quest count on the
  chip. Filters both the open list and the completed fold; ▲▼ swap within
  the visible subset; Clear-all hidden while filtered (it clears everything).
  Chips only render when a tag exists — no empty chrome.

- **Contrast pass** (build 45): user-reported red-on-brass silo chip —
  `.questrow.gap span` painted every span in an unticked row red, including
  the silo counter chip (1.3:1 on the gold gradient); scoped to
  `.qmain>span`. WCAG audit of the palette: `--gold` #9c6f1c → #8a6218
  (cream-on-brass chips and gold text now ≥4.6:1 everywhere, was 3.8–4.4),
  `--dim` #a5926f → #97835d (icon buttons 3.6:1, was 2.97). Same brass look,
  slightly deeper.

## Next (tentative order — confirm with the user before starting each)

- **M6** — backup & restore: one-button JSON export/import of all companion
  state; phone polish (touch targets, PWA install).
