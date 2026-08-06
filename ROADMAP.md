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

- **Growth goals log their island** (build 54): "doesn't log which island" —
  custom growth goals lost the `window.prompt` alert; picking "custom" opens
  an inline row (number input + island select, defaulting to the filtered
  island or your only island) and the goal is island-prefixed ("Crown Falls:
  Add 250 Workers") so the filter chips catch it. Threshold picks are
  auto-prefixed with the filtered island too. Build 55: "still does not
  select an island" — the island select now always defaults to a real
  island (filtered → tier's-region island → first island; "(no island)"
  remains an opt-out); one-click threshold goals tag the tier's-region
  island when there's exactly one.

- **M7 — ⚡ bolt-on + seed-from-plan** (build 53): (a) electricity is a
  per-line counter beside the silo one ("− ⚡ 2/5 ＋", `CheckItem.e`) on Old
  World buildings — the engine's own `electrifiable()` rule, ×2 output, no
  feed edge; both counters share a `ModChip` component, and where a farm is
  both silo'd and powered the multipliers stack to ×4 as in `effRate` (with
  both counters partial, the powered ones are taken to be the silo'd ones
  first). The chip is hidden on islands 🌍-tagged outside the Old World.
  (b) "⤵ Add the plan's N missing buildings as gaps" under the plan check
  (`planSeed`) adds every planned building the island doesn't list yet as an
  UNTICKED item — red gaps, like a starter kit; names come from the ledger's
  own entries so they parse straight back (coal keeps the plan's source).
  Nothing already listed is touched. Quick fries not taken: island reorder,
  editable quest notes.

- **Square corners + goods pictures** (build 57): "solid look not wishy
  washy" — every border-radius set to 0 (`--r`, pills, chips, inputs, cards,
  dots). Goods pictures fetched from the Anno 1800 Wiki's image server into
  `public/icons/goods/` by `scripts/fetch-good-icons.mjs` (MediaWiki md5
  path trick; wiki blocks page fetches but not the image host; misses listed
  in the script — 134/162, the rest are add-on goods with no wiki icon).
  `GoodIcon` (keyed by display name via `src/lib/goodIcons.json`) shown in
  the calculator: good picker, selected rows, Buildings/Shared/Optimal
  tables, chain tree. Footer credits the wiki/Ubisoft. Build 63 added them
  to the Tracker: inventory item rows (via `itemGood` → the produced good's
  picture), ledger rows and plan-check rows. 117 goods have no picture set
  yet — `GoodIcon` renders nothing for unknown names, so Rome rows are
  simply picture-less until a 117 icon source is found.

- **Rome growth goals** (build 60): the 📈 picker now works in Anno 117. It
  was blocked on "residents per fully-upgraded house", which does not exist in
  117 — a residence there holds the sum of what its supplied needs are worth
  (0–3 residents each), so capacity is something you build up, not a constant.
  That number was already in the pinned upstream commit (`needAttributes.
  Population`); pack 2 takes it, purely additively — every rate and band
  byte-identical. So a 117 goal is "Serve Porridge to your Liberti — +2
  residents per house" instead of 1800's unlock thresholds (117 has none),
  each need filed under the first tier that asks for it. The 39 needs worth no
  population are named but not offered, wonders are flagged as one-per-island,
  and a custom target quotes both ends of the band spread (250 Patricians ≈ 9
  residences fully supplied, or 50 on basic needs). Verified against the wiki's
  own Liberti example and pinned in the pack test.

- **Waiting tasks** (build 61): "sometimes I go to a task and I can't do it
  because I need more bricks, and moving it up and down is tedious." ⏳ on any
  open quest parks it in a "⏳ N waiting" block between the open list and the
  completed fold, with a free-text "waiting on…" box (bricks, a ship, an
  unlock) so you know what unblocks it; ⤒ puts it back at the *top* — the
  thing you were just unblocked on is the thing to go and do. The quest array
  is now partitioned open → waiting → done (`QuestItem.w`/`wn`,
  `setQuestWaiting`/`setQuestWaitNote`; ticking a waiting quest clears the
  block), so the hand-built order survives untouched and the ▲▼⤓ buttons only
  ever see actionable rows. Island filter chips count them apart ("🏝 Ditchwater
  · 3 ⏳2"). Ordering pinned in `npm run test:games`.

- **Check-in tasks** (build 62): "when I leave an island I need a task to come
  back to it later." 👁 on an island block's header adds "Crown Falls: check
  back in" in one tap — island-prefixed, so the filter chips catch it, and at
  the bottom of the open list, because a check-in is for later by definition.
  The header 👁 goes gold and inert while one is queued (`checkInQueued`), so
  a second tap can't stack duplicates. The quest card's "👁 Check back in on…"
  row does the same with a detail ("…on the beer supply") and an island
  select including "(no island)" for a general one. Pure UI over `addQuest` —
  no new state, nothing to sync.

- **M11a — zoo, museum & garden sets** (build 64): collection tracking under
  the island that has the building. `scripts/extract-culture.mjs` scrapes the
  wiki's three "Items - …" pages into `src/lib/culture-1800.json` — 44 sets,
  338 pieces with rarity, attractiveness, DLC and the set's own effect. The
  panel is built around the moment it gets used: an expedition ends, you are
  holding an animal, so the filter box searches all 133 at once and auto-opens
  the set it belongs to, and sets one piece short are called out at the top
  ("⚑ One piece away — Cordillera: Condor (Uncommon)"). Per island, not
  global, because a set only pays its bonus when every piece is in ONE
  building. **1800-only**: 117 has no culture buildings and its wiki has no
  item data, so the panel never renders there — same call as 📈 growth goals
  being 1800-only. Two scraping gotchas are recorded in the script: the wiki
  API is open while the rendered site is not, and Fandom 403s a default
  user-agent. Tested by `npm run test:culture` (pack + maths) and
  `npm run test:culture-ui` (the real panel, clicked in jsdom).
  Deferred: item pictures (the pack records each piece's wiki icon file name
  so a later pass can fetch them the way build 57 did for goods).

- **Tasks that free each other** (build 66): "can we also wait on another task,
  so it auto frees?" The parked row's "waiting on…" box now doubles as a link:
  type (or pick, from a datalist of every other unfinished task) the name of a
  task and ticking that one off frees this one automatically, straight to the
  top; deleting the blocker frees it too, rather than stranding it. Anything
  that matches no task stays a plain note, so the box keeps its first job.
  Quests have no ids — position is their only handle and every reorder changes
  it — so the link is the blocker's **text** (`QuestItem.wq`, matched case- and
  space-insensitively, canonicalised on write); `healBlockers` releases anything
  left waiting on a task that is no longer open, which covers a sync race and
  /legacy.html rewriting the list without these fields. Both ends show it: ⛓
  chip on the parked row, "⛓ 2 tasks queued behind this" on the blocker's.
  Chains work (A waits on B waits on C). `npm run test:games` covers the store
  rules, and the new `npm run test:quests` drives the real tracker in jsdom —
  tap ⏳, name a blocker, tick it off, watch the row come back.

- **Saves — one per playthrough** (build 67): "we should be able to have more
  than one save". The Tracker held exactly one world per game; now each game
  keeps a **list** of saves (quests, islands, inventory, plan links, culture),
  switched from a 📖 menu that only appears on the Tracker tab — the calculator
  stays shared, since plans are blueprints you reuse across playthroughs.
  Storage mirrors the game switcher one level down: the FIRST save has the id
  `""` and stays on the **bare legacy keys**, so an existing playthrough simply
  becomes "Main" with nothing moved and /legacy.html still reads it; extra saves
  hang off `…__<id>` keys, with the list in `anno_saves` and the current one in
  `anno_save` (`anno117_` prefixed for Rome). The list key is authoritative once
  written, so a deleted "" save stays deleted. The synced blob gains `saves`
  while its top level stays a mirror of the first save, so a client that
  predates this still finds the main playthrough; a pre-saves blob coming back
  from the server merges into "" instead of dropping the browser's other saves.
  `npm run test:saves` drives the real provider in jsdom — new/switch/rename/
  duplicate/delete, saves per game, and the untouched-bytes invariant.

- **A task can wait on several** (build 70): "a task might have more than one
  dependency — once done they should automatically promote the task, same as a
  timer running out." `QuestItem.wq` became a **list** of blocker texts (a bare
  string from before parses as one). Ticking or deleting a blocker drops it from
  every waiter; emptying a waiter's list frees it to the top of the open list
  carrying a **⛓ unblocked** mark — the same treatment `wr` already gave a rung
  timer, which is now `"timer" | "deps"` so the chip can say which. Removing a
  blocker BY HAND leaves the task parked on purpose: the row shouldn't jump out
  from under the tap. `healBlockers` prunes per blocker rather than all-or-
  nothing, so a blocker finished on another device just disappears from the
  list. Why it was reported as "not showing": the only way in was ⏳ then a
  type-in box that fell back to a plain note whenever the text didn't match a
  task exactly — silently. Now ⛓ sits on **open** rows too (picking a blocker
  parks the task for you), the picker is the app's own menu rather than a
  datalist, and each blocker is a chip you can unlink. `npm run test:quests`
  covers two blockers, ticking one leaving it parked, the last one promoting it,
  and the open-row entry point.

- **Waiting on a material** (build 71): "can waiting on maybe show materials?"
  Most waits are for a good, so the parked row's "waiting on…" box now suggests
  the current game's goods (the same list the 🚢 route row uses — one shared
  `waitGoods` datalist now, instead of one per row block) and shows the good's
  picture beside the box once the note names one. Still free text: "a ship",
  "the next region" are as valid as ever, and a material stays a NOTE rather
  than becoming a blocker — only tasks can free a task.

- **Fold an island away** (build 72): "make island inventory collapsible". A
  settled island's block is a screenful — inventory, ledger, plan check,
  collections — and with several islands you scroll past all of them to reach
  the one you want. The island name is now the fold control (▾/▸); folding
  removes the body from the DOM rather than hiding it, and takes the 🌍 and 🎯
  pickers with it, leaving a one-line header. What stays is what you'd fold up
  to glance at: the built count, and **⚠ N short** if its ledger is missing
  something (goods, not buildings) — plus 👁 and ✕, which you want without
  opening it. Default is open, so nothing hides itself; the folds you make are
  remembered per game in `anno_isle_shut`, presentation-only and never synced.
  `npm run test:islands` folds one of two islands and checks the body really
  goes, the header keeps count and shortfall, the other island is untouched,
  and the state survives a remount.

- **A fleet you can keep track of** (build 75): "can we have a ship inventory".
  A 🚢 Fleet card under the islands — name, type, and free-text "doing" ("Rum:
  Manola → Crown Falls", "idle at Ditchwater", "expedition"). Its own card
  rather than island inventory **because ships move**: the one you're after is
  the one you can't remember where you left. The name is the row's identity
  (it's what the game shows you), so a duplicate name is refused rather than
  quietly making a second row, and blanking a name is refused rather than
  leaving an unidentifiable ship. `CompanionData.ships` → `anno_ships`, so it's
  per save, per game and synced like the rest. Ship TYPES are the one soft spot:
  `GameContent.shipTypes` is a convenience list of 1800's common hulls typed by
  hand, NOT extracted like goods and buildings — the packs carry no ships — so
  the field is always free text, and 117's list is deliberately empty until
  someone fills it in from the game rather than from memory. Wiring for M11b's
  ship items to hang off later. `npm run test:fleet` covers it.

## Next (order confirmed with the user Aug 2026 — M7 → M10 (Anno 117
## switcher) → M8 → M9, M6 slots anywhere as a low-risk session; 117 goes
## before M8/M9 so residents + trade routes land per-game, not 1800-shaped)

- **M11b — items in use** (next; the other half of the Aug 2026 ask, split off
  so the collections half could ship on its own). Which specialist sits in
  which Trade Union / Town Hall / Harbourmaster's Office / ship, per island —
  the thing you forget between sessions and re-derive by clicking round the
  map. Sources exist and are bigger than the culture pack: the wiki has
  `Trade Union items: common…legendary` and `Town Hall items: common…
  legendary` (five rarity pages each), plus `List of Harbourmaster's Office
  items`, `List of Ship items` and `List of Arctic Lodge items` — reuse
  `scripts/extract-culture.mjs`'s fetch/parse spine. Open questions for the
  session: whether a slot is modelled per building instance ("Trade Union #3")
  or as one pooled list per island, and how much of an item's effect text is
  worth carrying. 117 **does** have specialists (the wiki names Epona and the
  Arboreal Rhizome Veneration) but publishes no list, so 117 would be
  free-text with no datalist — confirm that's wanted before building it.
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
  state; phone polish (touch targets, PWA install). Now that saves exist, the
  export should be per save (and an import should land as a new one).
- **M10 — Anno 117 support** (noodled Aug 2026; timing DECIDED — after M7,
  before M8/M9, so residents/trade-routes are built per-game once instead of
  being generalised later). One app, game switcher at the top, per-game
  everything (dataset, storage keys, share-link marker, tracker content) —
  not a fork. **The remaining work has session prompts** — each carries the
  context and gotchas so a fresh session doesn't re-derive them:
  `/rome-modifiers` (Silo + Coal fuel, smallest), `/rome-calculator`
  (phase 3, biggest — confirm approach first), `/rome-growth` (blocked on a
  residents-per-house source; decide the data question before any UI).
  Phased:
  1. **SWITCHER + 117 TRACKER — DONE** (build 56). Game chips in the header;
     each game keeps its own quests, islands, inventory and plans. 1800 keeps
     the bare legacy localStorage keys (so /legacy.html still reads them) and
     117 lives under `anno117_`; the synced blob stays 1800-shaped with 117
     hanging off `g117`, so old blobs and the API are unchanged.
     `npm run test:games` drives the real provider in jsdom and asserts the
     invariant that matters: building a Rome list never touches the 1800 save.
     Per-game content (region tags, starter kits, inventory chips, wiki base)
     lives in `src/lib/games.ts`; the ledger keeps one index per game.
     Deliberately deferred: 📈 growth goals were 1800-only (the pack had no
     residents-per-house) — resolved in phase 4. The Silo/fuel gap is now
     closed for the ledger in build 58; the calculator gets its own pass in
     phase 3.
  2. **DATA PACK — DONE** (`src/lib/data-117.json`, pack 2). Extracted by
     `npm run extract:117` from anno-mods/anno-117-calculator @ c6a6e75
     (v2.1, MIT tooling; values © Ubisoft, same provenance as data.json).
     113 goods (Latium 70, Albion 72, 29 in both), 118 producers, 9 tiers,
     per-resident need rates. `npm run test:117` enforces coherence — chains
     resolve, acyclic, producers agree with their goods, provenance pinned —
     since there's no golden reference like 1800's legacy app. Re-extracting
     from a newer upstream: bump `PACK` in the script. `src/lib/data117.ts`
     is the typed view (mirrors data.ts). Remaining for this phase: the 117
     building list + ledger UI on top of the pack.
     **Pack 2** (build 60) added the per-need `Population` attribute from the
     same pinned commit — purely additive, every rate and band byte-identical.
     Needs became `[rate, band, pop]` and `services` became objects
     (`{id, lbl, cat, pop, wonder?}`).
  3. **117 CALCULATOR — DONE** (build 59). The Calculator tab now works in
     both games; `calcReady` is gone. The seam is `src/lib/dataset.ts`: a
     `Dataset` bundles one game's tables with the rules that differ, and
     `datasetFor(st)` resolves it from `CalcState.game` — which is optional,
     so a state without it is 1800 and `tests/golden.test.cjs` passed
     unchanged throughout. Each game keeps its own calculator state in
     AppShell (a 117 `sel` holds ids 1800 has never heard of), and saved
     plans + island 🎯 links are filtered to the game you're in.
     What the port turned on:
     - **The flexible-needs worry was wrong.** No need-groups, no
       substitution logic upstream: each need is one good at its own rate,
       exactly like 1800. `popTargets` ported as-is.
     - **Region is a bitmask, and the producer varies by it.** The region
       chips in 117 are no longer a filter — they pick the province the plan
       is BUILT in, because that picks the recipe. Flour is a Grain Mill
       (2/min) in Latium and a Donkey Mill (1/min) in Albion; **Leather is a
       `Tannery` in both, at the same rate, taking salt in one and wood in
       the other** — indistinguishable by name or rate, which is why
       `recipe(st, id)` is the single resolution point. `regionRank`
       replaced every `x.region - y.region` in the engine.
     - **Fuel turned out to be the same shape as 1800's silo feed**:
       `(tpm / effRate) × perMin`, per building rather than per ton. Both are
       now "edges" in one helper. 4 Tilers burn 2 t/min of Coal; at 200%
       productivity 2 Tilers burn 1.
     - **Needs bands replaced the lifestyle toggle.** 117's pack has no
       unlock thresholds at all — only the four `supplyWeight` bands — so
       117 gets a "consume up to basic/+wanted/+refined/+luxury" chip row
       (default +refined) where 1800 keeps its binary toggle, both through
       one `needActive`.
     - **Obsidian is gathered**, and reachable (Statuettes, Latrunculi Sets).
       Rate 0, so every building-count site skips it or divides by zero; it
       shows as "gather" with its t/min still tracked.
     - No electricity: the toggle is hidden and inert.
     - `tests/engine117.test.cjs` (`npm run test:engine117`) — 13 groups of
       hand-derived expectations (there is no golden reference), including a
       sweep of all 113 goods × both provinces and a nine-tier band-3 plan.
     - **Workforce: deliberately out of scope.** A tier's `workforce` is an
       asset GUID and `workforceFactor` converts residents to workforce, but
       **no producer in the pack carries a workforce cost** — so we could only
       ever show supply with nothing to spend it against. Revisit only if a
       future extraction picks up per-building workforce.
     - Still open: fertility gates 27 buildings and is unmodelled; 117 goods
       borrow 1800's wiki pictures where the display names happen to collide
       (decorative only).
  4. **117 GROWTH GOALS — DONE** (build 60). The 📈 panel works in both games.
     The blocker turned out to be a wrong premise, not missing data:
     - **117 has no residents-per-house because a residence has no fixed
       capacity.** Its population is the SUM of what its supplied needs are
       worth — `needs[].needAttributes.Population` in the upstream params,
       0–3 residents each. It was in the pinned commit all along; the pack 1
       extractor simply didn't take it. Upstream had NOT moved (`c6a6e75` is
       still HEAD), and `residenceBuildings`/`populationLevels`/`constants`
       carry no capacity field — so no amount of re-extraction would have
       produced an `fh`. The question was mis-framed, not unanswerable.
     - **Cross-checked against the wiki**, which is why we can trust it:
       Porridge is +2 and Sardines +1, and the wiki states supplying a Liberti
       residence both "nets you +3 population … per residence". Pinned in
       `tests/pack117.test.cjs` so a re-tune upstream fails loudly rather than
       silently restating everyone's town size.
     - **So a 117 goal is a need, not a threshold** (117 has no unlock
       thresholds — needs are banded, not gated on a headcount): "Serve
       Porridge to your Liberti — +2 residents per house". Each need is listed
       under the first tier of its province that asks for it, so Bread is a
       Plebeian goal rather than repeating up the tiers: ~21 options per
       province, 4–6 per tier.
     - **The zero-value needs are named, not offered.** 39 of 81 needs grant
       no population at all (they pay happiness/money/prestige), so the picker
       ends each tier with "— no residents: Pileus, Tunics" — the trap is
       flagged where the choice is made.
     - **Wonders are flagged, not folded in.** They grant population like any
       need (Amphitheatre +3) but are one per island, so they sit outside the
       per-house headline and say so in the note.
     - Capacity is band-dependent, so the custom goal quotes both ends: 250
       Patricians is ≈9 residences fully supplied (28/house) or 50 on basic
       needs alone (5/house). That spread IS the 117 growth lever.
     - `TierView.housed` stays null for 117 on purpose — a single static
       figure would be wrong at every band but one, so the number lives on the
       growth panel, which knows the player's band.
