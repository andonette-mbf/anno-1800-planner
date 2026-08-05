# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An Anno 1800 production calculator + companion Tracker tab (quest tracker, island inventory with production ledger), rewritten from a single-file vanilla-JS page into **Next.js 15 (App Router, TypeScript) + Prisma + Neon Postgres**. The old single-file build is preserved verbatim at `public/legacy.html` (served at `/legacy.html`) and doubles as the golden-test reference.

## Commands

- `npm run dev` — dev server
- `npm run build` — production build (runs `prisma generate` first; works without `DATABASE_URL`)
- `npm run test:engine` — **golden tests**: compiles the engine and compares its numbers against the legacy app (`tests/legacy.html`) in jsdom across goods/pop/electricity/silo scenarios. This is the 1800 contract — it must keep passing unchanged.
- `npm run test:culture` — the 1800 culture pack (`src/lib/culture-1800.json`) + the collection maths. `npm run test:culture-ui` renders the real panel in jsdom and clicks it. Regenerate the pack with `npm run extract:culture` (scrapes the wiki API; bump `PACK` first).
- `npm run test:engine117` — the Anno 117 engine. No golden reference exists, so every expectation is hand-derived from `data-117.json` with the working shown in the comment above it, plus a sweep of all 113 goods × both provinces.
- `npx prisma db push` — apply schema to the database in `DATABASE_URL`
- **Deploy:** push `main` → Vercel. Verify via the build tag in the footer (`src/components/calc/Results.tsx`) — bump it (`build N · slug`) on every user-visible change.
- **Before starting work: `git fetch`** — this repo is edited from multiple sessions/machines. `/carry-on` (`.claude/commands/carry-on.md`) is the session-start ritual: sync, flag a concurrent session's uncommitted work, summarize new builds, and pick up the roadmap. When the tree has someone else's changes in it, monitor for their commit rather than editing the same files. **Never `git add -A`/`git commit -a`** — sessions can share one working tree, and a blanket add sweeps another session's half-written edits into your commit (build 52 did exactly that and needed a follow-up fix). Stage the explicit paths you changed.
- **Dev roadmap: `ROADMAP.md`** — M-numbered milestones; pick up the next open one, and confirm direction with the user before starting a milestone marked tentative.

## Environment

`DATABASE_URL` (Neon, pooled string) and `APP_PASSWORD` enable cross-device sync + saved plans; `AUTH_SECRET` optionally splits cookie signing from the passphrase. All are optional — without them the app runs in localStorage-only mode and the sync UI is hidden. See `.env.example`.

**The Neon Vercel-integration env vars are marked sensitive — `vercel env pull` returns them EMPTY.** You cannot run `prisma db push` from a local machine against this project's DB; the schema is pushed by `scripts/db-push.mjs` inside the Vercel build instead (skips without `DATABASE_URL`, logs-but-continues on failure). Runtime prefers `POSTGRES_PRISMA_URL` (pgbouncer-tuned) over `DATABASE_URL`; migrations use `DATABASE_URL_UNPOOLED` as `directUrl`. The IDE's Prisma extension may flag `url`/`directUrl` as unsupported — that's Prisma 7 syntax guidance; this project is on Prisma 6 and the CLI (`npx prisma validate`) is the source of truth.

## Architecture

**The engine is a verbatim port — treat it as canonical.** `src/lib/engine.ts` holds all calculator math as pure functions taking an explicit `CalcState`. Algorithms (epsilons, iteration caps, greedy/optimal search) were ported unchanged from the legacy app, and `tests/golden.test.cjs` enforces numeric equivalence against `tests/legacy.html`. Any change to engine behaviour must either keep the golden tests passing or consciously update the reference.

**Per-game data goes through `src/lib/dataset.ts` (M10 phase 3).** The engine reads no table directly: `datasetFor(st)` resolves one from `CalcState.game`, which is **optional — absent means Anno 1800**, so every pre-M10 share link, saved plan and golden-test scenario runs the old path untouched. Add a game-specific rule to the `Dataset` interface, never a branch in `engine.ts`. The two rules most likely to bite: `recipe(st, id)` picks the producer (1800's coal source, 117's province — Leather is a `Tannery` in *both* 117 regions at the same rate but with different inputs, so it cannot be told apart by name), and `regionRank` exists because 117's `region` is a bitmask where 1800's is an id — never subtract raw region numbers. Key pieces:

- `effRate` — the single place all rate modifiers live: the recipe's rate (1800's coal source 30s Charcoal Kiln / 15s Coal Mine; 117's per-province producer), productivity %, electricity (×2, Old World only; 117 has none), silo (×2, feed at `siloFeedRate`/min per building).
- `edges()` — the two *per-building* consumption edges, both `(tpm / effRate) × perMin`: silo feed and 117's fuel (23 buildings burn one Coal per 120s of run time). `compute`/`chainDemand` both walk them.
- **Gathered goods** (117's Obsidian) have rate 0 and no producer, and they *are* reachable — every building-count site (`optimPlan`, `perfectRatio`, `wholePlan`, `buildingRows`) must skip them rather than divide by zero.
- `targets()` dispatches the two input modes: `state.sel` (goods mode: `{mode:"fac"|"tpm", val}`) vs `popTargets()` (population mode: residents × per-resident need rates from `POP`, gated by `needActive` — unlock thresholds, lifestyle toggle — scaled by the consumption slider).
- `optimPlan` (Optimal build tab: ceil-per-good baseline, then greedily adds "free" finals that fit in leftover capacity) and `perfectRatio` (smallest all-100% integer blueprint via K-search + brute force). The "Total buildings" summary stat must agree with the active tab (`wholeTotalStat` vs plain sum).

**Culture collections** (`src/lib/culture-1800.json` + `culture.ts`, M11): the Zoo/Museum/Botanical Garden sets — 44 sets, 338 items with rarity, attractiveness, DLC and the set's effect — scraped from the Anno 1800 Wiki by `scripts/extract-culture.mjs`. Two things to know before touching it: the wiki **API** (`api.php`) is open even though the rendered site blocks scrapers, and Fandom 403s a default user-agent, so the `UA` header is load-bearing. Like the 117 pack it's versioned (`pack`) with the source revision ids recorded, since the wiki moves. **1800-only, deliberately** — 117 has no such buildings and its wiki carries no item data, so `cultureFor` returns null there and `CultureBlock` renders nothing. Tracking is per island (`anno_island_culture`: island → building → placed item names) because a set only pays its bonus when every piece sits in *one* building.

**Data** (`src/lib/data.ts` + `data.json`): `data.json` was extracted programmatically from the legacy `_C` literal — goods tuples, `POP` need tables (`[rate/resident, category need|want|lifestyle, unlockTier, unlockThreshold]`), silo map, presets. Regenerate only from a verified legacy build; don't hand-edit the JSON.

**URL hash** (`src/lib/hash.ts`): the calculator's full state is base64-JSON in the hash, **same wire format as the legacy app** so old shared links load. This, not the DB, is how plans are shared. The game marker (`g`) and need band (`bd`) are written **only for Anno 117**, so an 1800 link stays byte-identical to the legacy app's and a marker-less hash decodes as 1800 — `tests/engine117.test.cjs` pins both directions.

**Companion state** (`src/lib/store.tsx`): Tracker fields live in React context, persisted to the **same localStorage keys as the legacy app** so per-browser values survive and `/legacy.html` shares them. The UI now only touches `anno_quests`, `anno_islands`, `anno_island_checks`, `anno_island_plans` (M4 plan-links: `IslandPlan` CalcState snapshots per island, unknown to legacy), `anno_island_culture` (M11 zoo/museum/garden contents, also unknown to legacy) and `anno_view` (last active tab; the old stored `session` id maps to `tracker` in AppShell). The retired Playbook/Session fields (`anno_openq_*`, `anno_focus_*`, `anno_shutdown_checks`, `anno_parkinglot`, `anno_sessions`) are still loaded/saved/synced so old blobs and `/legacy.html` round-trip — don't strip them from `CompanionData`. When signed in with a DB configured, state syncs via `PUT /api/state` (debounced; dirty-local-wins, else newer-server-wins).

**Server** (`src/app/api/*` + `src/lib/{db,auth}.ts`): passphrase auth — `POST /api/auth` compares against `APP_PASSWORD` (timing-safe) and sets an HMAC cookie; `getDb()` returns null without `DATABASE_URL` and endpoints then 503, which the client treats as "sync off". Prisma models: `CompanionState` (single row id=1, JSON blob) and `Plan` (named calculator states).

**Companion prose**: gone. The Playbook tab was removed in build 36 and the Session ritual (prose + Current Focus/Shutdown Check/Parking Lot cards, quest age pills) in build 38, leaving the Tracker tab (`src/components/TrackerView.tsx`: quest tracker + island inventory/ledger). `src/content/companion.ts` was deleted; the original wording survives in the `anno-1800-*.md` docs and `/legacy.html`. SPEC.md describes the pre-removal design — historical reference only.

**UI** (`src/components/`): `AppShell` owns view switching + calc state + hash sync; `calc/LeftPanel` (mode toggle, good picker, population panel, settings, saved plans) and `calc/Results` (summary, tabs, five panes) intentionally mirror the legacy DOM structure and class names — `globals.css` is the legacy stylesheet (same selectors/layout; recoloured to a light Anno-style parchment palette in build 37), so visual changes belong there, not in new class systems. Number inputs are uncontrolled with a `gen` counter key that remounts them on preset/hash/plan loads.
