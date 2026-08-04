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

- **Island starter kits** (build 46): the add-island row gained a region
  picker (Old World/Cape Trelawney, New World, Arctic, Enbesa, Blank); a new
  island is seeded with that region's settle-up tasks UNTICKED (`addIsland`
  takes a `seed`), so they read as red gaps and become inventory when
  ticked. Lists = first resident tier's need chains + construction timber
  from the calculator data (`ISLAND_STARTERS`), plus plain entries
  (Marketplace, Fire Station, heaters, wells) the ledger ignores. The quest
  tab's "＋ Add island…" prompt stays blank on purpose.
- **Island regions** (build 47): islands now remember which world they're in
  (`islandRegions` / `anno_island_regions`; the add-row picker stores it, a
  🌍 selector on the island header backwards-amends it — absent = no filter,
  for pre-build-47 islands). The add-building datalist is per-island and
  only offers that world's buildings (`buildingOptionsFor`; merged names
  like Lumberjack's Hut list every region they exist in); free-typed names
  still always work. Store/ledger halves co-built with a parallel session;
  this session finished the provider + UI.

- **Granular chips + quest-tab region ask** (build 48): "the badges are
  moot" — blob chips replaced with real countable buildings (Fire/Police/
  Hospital split out; Electricity → Oil Power Plant; Tractors+fuel → Fuel
  Station; "Silos on animal farms" dropped — the per-farm counter owns
  that), each tagged with the regions it exists in and filtered by the
  island's 🌍 region (unset = show all). The quest tab's "＋ Add island…"
  prompt now also asks where the island is (1–4 or blank) and seeds the
  same starter tasks as the inventory add row. Old blob items already on
  islands are left alone — ✕ them by hand.

- **Send to bottom** (build 49): ⤓ on each open quest row — moves it below
  the last visible open quest in one tap instead of repeated ▼
  (`moveQuestAfter(from, to)`: splice out, reinsert after the target).
  Respects the island filter (hidden rows keep their places) and lands above
  the completed block.

- **Population growth goals** (build 50): 📈 picker in the quest tracker,
  generated from the calculator's own `POP` need tables — every tier's
  need-unlock thresholds are the real growth milestones ("Grow to 150
  Workers → unlocks Bread"), grouped by tier · region and sorted by
  threshold. Each goal's note converts residents to residences via `fh`
  (residents per fully-upgraded house) and points at the calculator's
  population mode for the farms. "Add a custom number of X…" prompts for
  any figure ("Add 250 Jornaleros" → ≈25 residences). No hand-written
  numbers — all derived from `data.json`.

- **Route tasks** (build 51): 🚢 collapsed row in the quest tracker (shown
  with ≥2 islands) — From island, To island, What good (datalist of good
  display names) → adds "To: ship Rum from From", destination-tagged so the
  island filter catches it. From/to stay filled after add (several goods
  often ride one route); from = to disables Add.

- **Growth goals fit your regions** (build 52): "I don't need all those
  dropdowns" — the 📈 picker no longer lists every region's tiers. It scopes
  to the union of your islands' 🌍 regions (island filter active → just that
  island's region); no region tags anywhere → full list. Single-region lists
  drop the "· Region" suffix from group labels.

## Next (order confirmed with the user Aug 2026 — M7 → M10 (Anno 117
## switcher) → M8 → M9, M6 slots anywhere as a low-risk session; 117 goes
## before M8/M9 so residents + trade routes land per-game, not 1800-shaped)

- **M7 — ⚡ bolt-on + seed-from-plan** (one short session, two small jobs):
  (a) electricity as a per-line counter like silos ("⚡ 2/5") on electrifiable
  buildings (`electrifiable()` = region 1; powered buildings make ×2 in the
  ledger; no feed edge). (b) One-tap "seed inventory from linked plan" on an
  island with a 🎯 plan: adds the plan's whole-building counts as UNTICKED
  items (same red-gap pattern as starter kits), skipping names already
  present. Quick fries if time allows: island reorder, editable quest notes.
- **M8 — residents per island**: per-tier population counts on each island
  block; the ledger adds resident consumption from `POP` need rates (gated
  by unlock thresholds like `popTargets`) so net = production − chains −
  residents. This makes deficits real for final goods. Decide in-session:
  lifestyle toggle and consumption slider per island, or global.
- **M9 — trade routes**: cross-island view matching surpluses to deficits
  ("ship 2 t/min Rum: New World → Crown Falls") once M8 makes final-goods
  demand honest. Start read-only (suggested flows from the ledgers); manual
  route records only if the suggestions aren't enough.
- **M6** — backup & restore: one-button JSON export/import of all companion
  state; phone polish (touch targets, PWA install).
- **M10 — Anno 117 support** (noodled Aug 2026; timing DECIDED — after M7,
  before M8/M9, so residents/trade-routes are built per-game once instead of
  being generalised later). One app, game switcher at the top, per-game
  everything (dataset, storage keys, share-link marker, tracker content) —
  not a fork. Phased:
  1. Switcher + 117 tracker only (quests/islands/free-text inventory;
     regions = Latium/Albion). Tracker barely touches game data — short.
  2. 117 building list + ledger, once a goods dataset is sourced. CONFIRMED
     SOURCE: anno-mods/anno-117-calculator on GitHub (MIT, the Warenrechner
     lineage our 1800 data.json came from) — covers Latium/Albion chains,
     workforce and population-tier needs; extract programmatically like the
     legacy `_C` extraction. Version the pack — the game still patches
     rates; no golden reference exists like 1800's legacy app.
  3. 117 calculator. One real model change: flexible needs (a need met by
     alternative goods, porridge OR bread) → need-groups with a player
     choice, unlike 1800's need = one good. Latium/Albion map onto regions;
     fields ≈ farm abstraction; deity/research buffs ≈ productivity slider;
     no electricity — modifier layer becomes per-game plug-ins.
