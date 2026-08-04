# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An Anno 1800 production calculator + strategy companion (Playbook/Session tabs), rewritten from a single-file vanilla-JS page into **Next.js 15 (App Router, TypeScript) + Prisma + Neon Postgres**. The old single-file build is preserved verbatim at `public/legacy.html` (served at `/legacy.html`) and doubles as the golden-test reference.

## Commands

- `npm run dev` — dev server
- `npm run build` — production build (runs `prisma generate` first; works without `DATABASE_URL`)
- `npm run test:engine` — **golden tests**: compiles the engine and compares its numbers against the legacy app (`tests/legacy.html`) in jsdom across goods/pop/electricity/silo scenarios
- `npx prisma db push` — apply schema to the database in `DATABASE_URL`
- **Deploy:** push `main` → Vercel. Verify via the build tag in the footer (`src/components/calc/Results.tsx`) — bump it (`build N · slug`) on every user-visible change.
- **Before starting work: `git fetch`** — this repo is edited from multiple sessions/machines.
- **Dev roadmap: `ROADMAP.md`** — M-numbered milestones; pick up the next open one, and confirm direction with the user before starting a milestone marked tentative.

## Environment

`DATABASE_URL` (Neon, pooled string) and `APP_PASSWORD` enable cross-device sync + saved plans; `AUTH_SECRET` optionally splits cookie signing from the passphrase. All are optional — without them the app runs in localStorage-only mode and the sync UI is hidden. See `.env.example`.

**The Neon Vercel-integration env vars are marked sensitive — `vercel env pull` returns them EMPTY.** You cannot run `prisma db push` from a local machine against this project's DB; the schema is pushed by `scripts/db-push.mjs` inside the Vercel build instead (skips without `DATABASE_URL`, logs-but-continues on failure). Runtime prefers `POSTGRES_PRISMA_URL` (pgbouncer-tuned) over `DATABASE_URL`; migrations use `DATABASE_URL_UNPOOLED` as `directUrl`. The IDE's Prisma extension may flag `url`/`directUrl` as unsupported — that's Prisma 7 syntax guidance; this project is on Prisma 6 and the CLI (`npx prisma validate`) is the source of truth.

## Architecture

**The engine is a verbatim port — treat it as canonical.** `src/lib/engine.ts` holds all calculator math as pure functions taking an explicit `CalcState`. Algorithms (epsilons, iteration caps, greedy/optimal search) were ported unchanged from the legacy app, and `tests/golden.test.cjs` enforces numeric equivalence against `tests/legacy.html`. Any change to engine behaviour must either keep the golden tests passing or consciously update the reference. Key pieces:

- `effRate` — the single place all rate modifiers live: coal source (30s Charcoal Kiln / 15s Coal Mine), productivity %, electricity (×2, Old World only), silo (×2 for `SILO` animals, which then consume feed at `SILO_FEED`/min per building — `compute`/`chainDemand` add that edge).
- `targets()` dispatches the two input modes: `state.sel` (goods mode: `{mode:"fac"|"tpm", val}`) vs `popTargets()` (population mode: residents × per-resident need rates from `POP`, gated by `needActive` — unlock thresholds, lifestyle toggle — scaled by the consumption slider).
- `optimPlan` (Optimal build tab: ceil-per-good baseline, then greedily adds "free" finals that fit in leftover capacity) and `perfectRatio` (smallest all-100% integer blueprint via K-search + brute force). The "Total buildings" summary stat must agree with the active tab (`wholeTotalStat` vs plain sum).

**Data** (`src/lib/data.ts` + `data.json`): `data.json` was extracted programmatically from the legacy `_C` literal — goods tuples, `POP` need tables (`[rate/resident, category need|want|lifestyle, unlockTier, unlockThreshold]`), silo map, presets. Regenerate only from a verified legacy build; don't hand-edit the JSON.

**URL hash** (`src/lib/hash.ts`): the calculator's full state is base64-JSON in the hash, **same wire format as the legacy app** so old shared links load. This, not the DB, is how plans are shared.

**Companion state** (`src/lib/store.tsx`): Playbook/Session fields live in React context, persisted to the **same localStorage keys as the legacy app** (`anno_openq_*`, `anno_focus_*`, `anno_shutdown_checks`, `anno_parkinglot`) so per-browser values survive the rewrite and `/legacy.html` shares them. Post-rewrite additions (no legacy counterpart): `anno_quests`, `anno_sessions` (play-session counter, ticked when the Shutdown Check completes), `anno_islands`, `anno_island_checks`, and `anno_view` (last active tab, AppShell). When signed in with a DB configured, state syncs via `PUT /api/state` (debounced; dirty-local-wins, else newer-server-wins).

**Server** (`src/app/api/*` + `src/lib/{db,auth}.ts`): passphrase auth — `POST /api/auth` compares against `APP_PASSWORD` (timing-safe) and sets an HMAC cookie; `getDb()` returns null without `DATABASE_URL` and endpoints then 503, which the client treats as "sync off". Prisma models: `CompanionState` (single row id=1, JSON blob) and `Plan` (named calculator states).

**Companion prose** (`src/content/companion.ts`): generated HTML strings from the verified legacy build, rendered via `dangerouslySetInnerHTML` (trusted static content). The Playbook tab was removed at the user's request (build 36) — only Session prose remains; the playbook wording survives in `anno-1800-lean-playbook.md` and `/legacy.html`, and the Open Questions (`openq`) fields stay in the store/sync schema for old blobs but have no UI. Interactive cards (Current Focus, Shutdown Check, Parking Lot) are React components. The `anno-1800-*.md` docs are the canonical wording — change them and the generated prose together. SPEC.md's original constraints (don't reword the prose, degrade safely without storage) still apply.

**UI** (`src/components/`): `AppShell` owns view switching + calc state + hash sync; `calc/LeftPanel` (mode toggle, good picker, population panel, settings, saved plans) and `calc/Results` (summary, tabs, five panes) intentionally mirror the legacy DOM structure and class names — `globals.css` is the legacy stylesheet (same selectors/layout; recoloured to a light Anno-style parchment palette in build 37), so visual changes belong there, not in new class systems. Number inputs are uncontrolled with a `gen` counter key that remounts them on preset/hash/plan loads.
