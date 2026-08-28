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

- **Ships say what and where** (build 76): "shall we make a clickable thing eg
  trade, or where it is" — and "I don't need to know what it's trading". The
  free-text "doing" box is gone. In its place two menus: a short fixed list of
  jobs (`SHIP_JOBS`: trade route, expedition, exploring, escort, idle, in for
  repairs — game-agnostic, a trade route is a trade route in Rome too) and a
  place, taken from **your own island list** plus "At sea". Both offer "— not
  saying" to clear. Cargo is deliberately not tracked: the fleet list answers
  "where did I leave it and is it busy", not "what's in the hold". Anything a
  ship already carried from build 75's free-text box stays listed as its own
  option rather than being dropped, and an `at` naming an island you've since
  removed still shows.

- **A run can carry several goods** (build 80): "the from and to in trade may
  have more than one good. also icons could show." A trade route's cargo is now
  a list, not one box of text. Each good is a chip with its picture on it; tap
  a chip to take that good off, and pick from the goods menu to add another.
  A good already aboard isn't offered again. `ShipItem.cargo` went from a
  string to a list of strings; text written before this is split on commas,
  semicolons, "+", "&" and "and", so "Rum and cotton" becomes two goods rather
  than one strange one. The typed box and its suggestion list are gone.

- **The fleet reads as a list** (build 81): "once you have added a ship the view
  should compact instead of being form style, with a simple edit function" —
  plus two smaller asks in the same breath. A ship is now one line of plain
  words: name, type, what it's on, where, and its cargo as chips with pictures.
  Empty fields say nothing rather than showing an empty box. Tap the line (or
  ✎) to get the boxes back, ✓ Done to shut them. One row open at a time.
  **Route ends are typed now**, not picked: plenty of runs go to a neutral
  trader's harbour or another player, so both ends take any text with your own
  islands offered as suggestions. **Cape Trelawney is its own place** in the
  "where" menu — the numbers call it Old World, but you sail to it as its own
  destination, so `GameContent.places` names extra places per game on top of
  the ones the data pack knows.

- **Sort the fleet** (build 82): "fleet should be sortable by type or world".
  Chips above the list: Added, Name, Type, Where. Added is the default and is
  the order you put them in. Where uses the region a ship is in, or for a trader
  the island it loads at, since a route has no one place. Ships you've said
  nothing about go last whichever way you sort — they've nothing to compare.
  The sort is on screen only: the stored order never changes, and each row
  carries its real position, so a sorted list still edits and removes the ship
  you're looking at. The choice is remembered across visits. The chips only
  appear once there are two ships. Tested including the case that would bite —
  editing the top row after a sort has flipped the order.

- **Counts at the top, prose gone** (build 83): "absolute nonsense jargon…
  don't need all that prattle. Summarise at top." All three Tracker cards had
  an explaining paragraph at the top; the quest one had grown to eight lines
  describing every button. All three are deleted. Each button already says what
  it does when you hover it, so the paragraph said everything twice.
  In their place, one line of counts: **Ship Manifest** (renamed from Fleet)
  tallies by type — "Clipper ×2 · Schooner ×1", with untyped ships counted last
  so the total still adds up; **Quest Tracker** shows To do / Waiting / Done;
  **Island Inventory** shows how many islands and how many are short of
  something, worked out for every island so the count is right even when they
  are all folded away.

- **Tabs, and Cape Trelawney settles** (build 84): "split them out into tabs,
  islands, ships, tasks" and "ensure new island has cape t separately". The
  Tracker's one long page is three tabs of its own in the top row —
  **🧮 Calculator · 📜 Tasks · 🏝 Islands · 🚢 Ships**. Old stored tab ids
  ("tracker", and "session" from the Playbook era) land on Tasks. All three
  stay mounted and only the chosen one is drawn, so a half-typed box survives
  a tab change. The save menu shows on all three, not just the old Tracker tab.
  **Cape Trelawney is its own island tag** (`ct`), with its own starter kit
  and its own entry in the new-island menu. It is still region 1 — the Old
  World's buildings, exactly — so `GameContent.regionAlias` (`ct → ow`) says
  which tag's chips and building list it borrows, rather than repeating "ow"
  in 23 chip entries. That also makes it a place a ship can be, so the
  separate `places` list added in build 81 is gone.

- **Fleet and looks, builds 85–90** (recorded late, in one entry). **85 — ships
  you lost**: "Destroyed" joins the job menu, striking a ship through at the
  bottom of the list, off the type tally, claiming no place or cargo — the
  fleet is a record as well as a roster. **86 — quick add from the numbers**.
  **87 — one tap when a ship goes down**: ☠ on every row, because opening a row
  to find the job menu is too much ceremony mid-fight; tapping again restores
  it to its trade route. **88 — sold, not sunk**: "Decommissioned" alongside it,
  flying ⚑ rather than ☠ and counted apart ("4 ships · 1 lost · 2 retired"),
  since only one of the two ways off the fleet is a loss. **Delete a
  playthrough, even your last one**: deleting your only save now empties it
  instead of refusing — finishing a game is exactly when you have one save.
  **89 — black and white**: every hue gone; need/lifestyle, rarity and region
  re-cut as fill, weight and border style, the header moved into a black top
  bar with the game switch in it, and one grayscale filter over `.wrap`/`.ddpop`
  to drain the emoji and wiki art too. **90 — menus lift off the page**:
  dropdowns regained depth (ink border, real shadow, inverting hover row) now
  that colour can't do it, and the top bar stopped sticking.

- **Collections up front, ships by status** (build 91): "some kind of zoo and
  museum tracker so I know what's on what island" — which build 64 already
  does, but two folds deep (inside the island block, inside the building), and
  only once the island's inventory has a **ticked** Zoo / Museum / Botanical
  Garden. So the answer moved outside both: a **🏛 Collections row** at the top
  of the Islands card, one tap-to-open chip per island that has one ("Ditchwater
  🦁 41/133 ⚑2"), and the same counts on a **folded island's header** beside
  ⚠ N short — the ⚑ is sets one piece away, the thing worth acting on.
  `cultureAt` in `culture.ts` is the roll-up; `CULTURE_EMOJI` moved there from
  the panel, which now imports it. Tapping a chip only ever *opens* an island
  (and scrolls to it via a new `id` on the block), so a second tap can't fold
  away what you just asked for.
  Same session, asked mid-build: **ships filter by status**, and **Patrol**
  joins the job menu (the standing job an escort isn't). One chip per status
  actually in use, in the menu's own order, extras then "Not saying" last.
  Two decisions the tests pin: the filter is **not** remembered across visits
  the way the sort is (a sort reorders the fleet, a filter hides most of it, and
  a filtered list on return reads as ships gone missing), and **the row you have
  open stays visible whatever the filter says** — changing a ship's status is
  the usual reason it stops matching, and a row vanishing under the tap that
  changed it reads as a bug. The chip row also survives a status emptying out,
  or the last ship on patrol becoming idle would take the way back with it.

- **M11b — items in use** (build 103): which specialist sits in which Trade
  Union / Town Hall / Harbourmaster's Office / Arctic Lodge / ship — the thing
  you forget between sessions and re-derive by clicking round the map.
  `scripts/extract-items.mjs` (the culture extractor's fetch spine, a new
  parser for the wiki's per-item `item-box` templates) pulls all thirteen
  pages into `src/lib/items-1800.json`: 1,063 items — TU 445, TH 297, HM 88,
  Ships 183, Arctic Lodge 50 — each with rarity, what it affects and a
  one-line effect ("Charcoal Kiln · Productivity: +10%"), icon file names
  recorded for a later pictures pass like culture's. The open questions were
  settled in-session: **pooled per socket type per island**, not per building
  instance — same call as culture's one-zoo list, naming "Trade Union #3" is
  ceremony the recall question doesn't need (`anno_island_items`, the same
  island → id → names shape as `anno_island_culture`, so a later per-instance
  split can suffix ids without a migration); and the **effect text is kept** —
  it's the reason you socketed the thing, and it doubles as search text (the
  datalist matches what an item *does*, so typing "riots" finds the Bag of
  Money). Not the culture panel's chip wall: a Trade Union holds four items
  out of a thousand, so it's a typed add with the pack as suggestions, placed
  items as rarity-tinted chips, free text kept untinted (items newer than the
  pack still deserve remembering). The panel hangs off the island block once a
  socket building is ticked ("Arctic Lodge" joined the typed suggestions);
  **ship items live on the ship** (`ShipItem.items`, build 75's promised
  wiring) — a 🎖 rarity-grouped picker in the fleet row editor, chips on the
  read line, and names are never comma-split the way cargo text was, because
  half the specialists are "Someone, the Something". 117 gets nothing yet, on
  purpose — its specialists are real but the wiki publishes no list; M11c's
  research session owns that question. `npm run test:items` (pack coherence +
  spot checks against hand-read wiki values) and `npm run test:items-ui` (the
  real panel and store in jsdom). Also fixed in passing: `test:islands` had
  been broken since build 101 moved the collections row to the Culture tab —
  its build-91 checks now drive the culink row and folded-header score
  instead.

## Next (order confirmed with the user Aug 2026 — M7 → M10 (Anno 117
## switcher) → M8 → M9, M6 slots anywhere as a low-risk session; 117 goes
## before M8/M9 so residents + trade routes land per-game, not 1800-shaped)

- **M11c — collections for Rome** (next; asked Aug 2026, right after builds
  101–102: "I would like all this implementing for rome as much as is
  available"). **Session prompt: `/rome-collections` — the research phase
  already ran (28 Aug 2026) and its findings are folded into the prompt.**
  Short form: the 117 wiki stayed a dead end (40 pages, no item data), but
  upstream anno-mods/anno-117-calculator is now at **Release 3.0**
  (`28969c3`, 2026-08-20) and carries `items` (172 specialists with rarity/
  targets/buffs) and `patrons` (the 8 deities — 117's Religion system, its
  closest thing to "collections"; Epona is a deity, not a specialist). So 117
  has no set-collection mechanic to mirror; the buildable things are M11b's
  item sockets via `itemsFor`, and optionally a per-island patron pick —
  scope choice sits with the user. **`/rome-pack3`** (re-base data-117.json
  onto Release 3.0 — 146 products, fuel flags, a third region slot) should
  run first if both are wanted, so both packs pin the same commit. "All
  this" = the 🏛 Culture tab experience — per-island collection tracking with
  flat panels, three-weight done/started/untouched contrast, ⚑ one-piece-away,
  the works — for Anno 117, to whatever extent 117 actually has collections.
  **What we knew when M11a shipped (Aug 2026, game was new):** 117 has no
  zoo/museum/garden-style building and its wiki carried no item data — that is
  why `cultureFor` returns null for it. So the FIRST session on this is
  research, not code:
  1. **What does 117 actually collect?** Inventory the real mechanics —
     deities/temples, wonders, specialists (M11b notes the wiki names some but
     publishes no list), any museum-like set-completion system Ubisoft has
     patched in since. Check the upstream data pack
     (anno-mods/anno-117-calculator, pinned commit in the M10 notes) for
     item/collection assets the wiki doesn't render, and RE-CHECK the wiki —
     it was thin because the game was young, and it will have grown.
  2. **Only promise what has a source** — same rule as M12: machine-readable
     and clearly licensed before a feature is announced. If 117 turns out to
     have no set-collection mechanic at all, say so on the tab rather than
     faking one, and consider whether M11b's items-in-use is the thing the
     user actually wants for Rome.
  **The code is already shaped for it.** `cultureFor(game)` is the single
  gate: hand it a 117 `CultureBuilding[]` pack (versioned like
  `culture-1800.json`, own extractor, own `test:culture`-style test) and the
  panel, the roll-up, the island links and the tab all light up. Two
  deliberate 117-blocks must be flipped when a pack lands: AppShell hides the
  🏛 tab for `rome` (VIEWS filter, build 101) and remaps a stored `culture`
  view to `islands` — both were written for "117 has nothing", not forever.
  `cultureOn` matches building labels against island checklist items, so the
  117 buildings need entries in `games.ts`' inventory chips too. Tentative —
  confirm scope with the user once the research says what exists.
- **M8 — residents per island** (session prompt: `/m8-residents`): per-tier
  population counts on each island block; the ledger adds resident
  consumption from `POP` need rates (gated by unlock thresholds like
  `popTargets`) so net = production − chains − residents. This makes deficits
  real for final goods. Decide in-session: lifestyle toggle and consumption
  slider per island, or global.
- **M9 — trade routes** (session prompt: `/m9-trade-routes`; needs M8 first):
  cross-island suggestions matching surpluses to deficits ("ship 2 t/min Rum:
  New World → Crown Falls") once M8 makes final-goods demand honest. Manual
  route records already exist (builds 96–100 trade links + ship routes), so
  this is purely the read-only suggestion layer with one-tap accept.
- **M6** — backup & restore (session prompt: `/m6-backup`): one-button JSON
  export/import of all companion state; phone polish (touch targets, PWA
  install). Now that saves exist, the export should be per save (and an
  import should land as a new one).

- **M12 — any Anno, not just two** (asked for Aug 2026: "plan to do this for
  any and all annos"; session prompt: `/m12-any-anno`). Adding Anno 117 made
  the app work for two games. This is
  what it would take for a third, fourth or fifth to be **a data pack and some
  settings, with no changes to the code that does the work**. This isn't a
  redesign: it's a list of the places that still name Anno 117 directly.

  **Already done, and proved by 117 — don't redo it.** The calculator reads no
  game's tables directly; each game's numbers are one entry in `DATASETS`, and
  `datasetFor(st)` picks the right one. Each game's own content — region names,
  starter kits, inventory chips, services, wiki address, ship types — is one
  entry in `games.ts`. The `GAMES` list is what draws the switcher, so a new
  game appears there by being added to it. Share links already mark any game
  that isn't 1800. Storage, saves and the calculator all keep each game apart.
  And a game that simply doesn't have a feature is already handled: 1800's
  collections panel returns nothing for 117 and draws nothing. Reuse that.

  **What still assumes exactly two games** — all 31 mentions of `anno117`:
  1. `store.gkey` knows one storage prefix (`anno_` → `anno117_`). Each game
     needs its own, listed in `GAMES`; 1800 must keep the bare original names
     for good, since /legacy.html still reads them. `ISLE_SHUT_KEY` in
     `TrackerView` does the same thing, and the synced blob's `g117` field
     needs to become one slot per game (still reading old `g117` blobs).
  2. `GoodIcon` chooses between two icon files. It needs one per game, and each
     game needs its own icon fetch. The files must stay separate: 24 goods have
     the same name in 1800 and 117 but different pictures.
  3. `ledger.ts` imports 117's goods directly and keys off two games. It should
     read the dataset instead, which already holds everything it needs.
  4. `engine.defaultStateFor` hardcodes which region 117 opens in. That belongs
     in the dataset as "the region this game starts in".
  5. Wording: the footer's data credits, the page title and logo, and the
     region wording in the left panel all check for 117. Each game should
     supply its own text.
  6. AppShell hides the 🏛 Culture tab for 117 (build 101). The general rule
     is "a game whose `cultureFor` is null has no tab" — per-game capability,
     not a 117 check. M11c wants this flipped for 117 anyway.

  **Then, for each game added:** the data pack and the script that extracts it,
  a test for that pack (only 1800 has the legacy app to check against, so every
  other pack gets a test that checks it makes sense on its own), an icon set,
  its entry in `games.ts`, its storage prefix, and its credits.

  **Which games.** The 3D ones only, 1701 onward: **1701, 1404, 2070, 2205**,
  alongside the 1800 and 117 already here. Anno 1602 and 1503 are out — the
  user doesn't play them, so don't spend a session on either.

  **What actually holds this up is the data, not the code.** 1800's numbers
  came from the old single-file app; 117's from anno-mods/anno-117-calculator.
  Nobody has checked whether anything similar exists for the other four — find
  a source that is machine-readable and clearly licensed BEFORE promising a
  game, which is the rule Anno 117 followed. Two things will need
  thinking about when a third game arrives. **Regions:** 1800 numbers them,
  117 uses a bitmask because a good can exist in both, and 2070's factions or
  2205's sectors work differently again — so treat a region as each game's own
  thing and never do sums with the numbers. **Needs:** the current code handles
  1800 (needs unlock at population thresholds, plus the lifestyle switch) and
  117 (four bands of how well-supplied you want people). A game that works a
  third way needs another case there.

  **The cheap first step, worth doing on its own:** a game with no data pack at
  all can still have the Tracker — quests, islands, typed-in inventory, fleet.
  That is exactly how 117 started. So any Anno can join the switcher whenever
  you want it, and get a calculator later. Worth deciding at the time: should
  the switcher hide games that have no numbers yet?
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
