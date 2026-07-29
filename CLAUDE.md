# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page Anno 1800 production calculator. The entire app — HTML, CSS, and JS — lives in `index.html` as **one minified line** (~38 KB). There is no package.json, no build step, no dependencies, no tests, no linter. This is deliberate (see SPEC.md "Hard constraints"): keep it vanilla JS, framework-free, and runnable by opening the file directly.

## Commands

- **Run locally:** open `index.html` in a browser, or `npx serve .`
- **Deploy:** push to `main` → Vercel auto-deploys to anno-1800-planner.vercel.app. `vercel.json` sets `no-cache` headers so deploys show up immediately.
- **Verify a deploy:** check the build tag in the page footer (e.g. `build 22 · playbook + session tabs`).
- **Before starting work: `git fetch` and check you're on top of `origin/main`.** This repo is edited from multiple sessions/machines, and `index.html` is one line — parallel edits cannot be text-merged. If the remote moved, re-apply changes onto the remote version (the insertions are anchored to unique substrings) rather than attempting a merge.

## Conventions

- **Bump the build tag on every user-visible change to `index.html`.** It's the `<span style="opacity:.55">build N · short-slug</span>` near the end of the footer. Increment N and describe the change in 2–4 words. This is how stale cached HTML is detected in production.
- Because the file is one line, `Edit` old_strings must be exact minified substrings. Match on distinctive nearby markup (element IDs, unique strings) — indentation and newlines don't exist here. Keep new code in the same minified style.
- SPEC.md and the two `anno-1800-*.md` files are the spec and source content for the Playbook + Session tabs (implemented in build 22). SPEC.md's constraints remain binding for changes to those tabs: match existing styling, don't touch calculator logic, degrade safely without localStorage. The markdown docs are the canonical prose — if their text changes, the hand-converted HTML in `index.html` must be updated to match.

## Architecture of index.html

Everything is in one `<script>` at the end of the body.

**Data model.** `_C` is a compact literal: `_C.g` is an array of tuples `[id, name, region, tier, buildingName, productionTimeSeconds, "input1|input2"]`, expanded at load into the `GOODS` map (`rate = 60/time` t/min, `inputs` with qty 1 each — the model assumes 1 t of each input per 1 t of output). `_C.alts` holds alternative buildings (e.g. Coal Mine vs Charcoal Kiln). `_C.POP` drives population mode: per tier — `r` region, `fh` residents per house, `n` a map of good → `[tons/min per resident, category (need/want/lifestyle), unlock tier, unlock threshold]`. Regions: 1 Old World, 2 New World, 4 Arctic, 5 Enbesa. A good with a `tier` (workforce) is a "final" consumer good; tierless goods are intermediates.

**State & persistence.** A single `state` object (`sel`, `regionFilter`, `prod`, `coalTime`, `round`, `tab`, `mode`, `pop`, `electricity`, `lifestyle`, `silo`, `cons`). The calculator uses **no localStorage** — the whole plan is encoded as base64 JSON in the URL hash (`saveHash`/`loadHash`), which is also the shareable-link mechanism. Two input modes (`#modeTog`): **Final goods** (`state.sel`, entries `{mode: "fac"|"tpm", val}`) and **Population** (`state.pop`, residents per tier → `popTargets()` derives demand from `_C.POP` respecting unlock thresholds, the lifestyle-needs toggle, and the consumption-rate slider `cons`). `targets()` dispatches between them.

**Companion tabs.** A top-level nav (`#appnav`) switches between three views: `#view-calc` (the calculator grid, default), `#view-playbook`, and `#view-session` — switching toggles inline `style.display` and never touches the URL hash. The two doc views are hand-converted HTML from the `anno-1800-*.md` files, wired by an IIFE at the end of the script (after calculator init, wrapped in try/catch so it can never break the calculator). Their editable fields persist via `anno_`-prefixed localStorage keys (`anno_openq_*` — the Open Questions table, mirrored into gold `.oqm[data-oq]` spans in the prose; `anno_focus_*` — Current Focus; `anno_shutdown_checks`; `anno_parkinglot`). All localStorage access goes through the `LSx` try/catch helper so the pages render read-only when storage is unavailable.

**Calculation pipeline.** `targetTpm(id)` converts a selection to tons/min → `compute()` recursively walks `GOODS[id].inputs` to accumulate total `demand` per good plus per-final-good `contrib` (which powers the Shared-resources view) → `effRate(id)` applies the global productivity % and the coal-source toggle (`state.coalTime`: 30 = Charcoal Kiln, 15 = Coal Mine; the toggle also renames `GOODS.coal.building`).

**Result tabs** (render functions dispatched from `render()`): `renderWhole` — "Optimal build" (`optimPlan`, fewest whole buildings including free top-ups, default tab); `renderRatio` — "Perfect ratio" (`perfectRatio`, smallest all-at-100% zero-waste blueprint); `renderBuildings` — exact counts per building with surplus; `renderShared` — intermediates feeding multiple lines and buildings saved by pooling; `renderTree` — per-product ingredient tree. The "Total buildings" summary stat must agree with the active tab (`wholeTotalStat` vs the plain sum — this has been a bug before, see commit 9848fdc).

**Rate modifiers all live in `effRate`** — the base rate (coal special-cased by source: Charcoal Kiln 30s vs Coal Mine 15s, with a renamed building), × productivity %, × 2 if electricity is on and the good is `electrifiable` (Old World), × 2 if the Bright Harvest silo toggle is on and the good is in `SILO`. Any feature touching output numbers must go through `effRate`, or ratios silently break.
