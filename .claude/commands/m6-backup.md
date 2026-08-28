---
description: M6 — backup & restore (per-save JSON export/import) + phone polish. Low-risk; slots between bigger milestones.
---

One-button JSON export/import of companion state, plus phone polish. Decided
when saves landed (build 67): **export is per save, and an import lands as a
NEW save** — never overwriting the one you're on.

Export:

- One save = one `CompanionData` (see `src/lib/store.tsx`) + its game and
  name. Wrap it: `{app: "anno-planner", version: 1, game, name, exportedAt,
  data}` so a future import can tell what it's holding. Include the retired
  Playbook/Session fields — they round-trip everywhere else, and an export
  that drops them isn't a backup.
- Browser download via a Blob URL from the save menu (`SaveMenu` in
  `src/components/AppShell.tsx` — it already owns new/duplicate/rename/
  delete, so "⬇ Export…"/"⬆ Import…" belong in that menu).

Import:

- File picker (or paste box as fallback), parse, validate the wrapper, then
  run the data through the SAME normalizers loadLocal/fromBlob use
  (`parseChecks`, `parseCulture` for culture AND islandItems, `parseShips`,
  `parseLinks`, `healBlockers`/`ringTimers` on quests) — an import is a blob
  from outside, same trust level as the server's.
- Lands as a new save in the CURRENT game via the `addSave` path (name from
  the wrapper, "(imported)" suffix on collision). If the wrapper's `game`
  isn't the current one, say so and offer to switch — a 117 blob imported
  into 1800 would show ids nothing can parse.
- Sync note: a new save triggers the normal debounced push; nothing special.

Phone polish (scope to what a session allows; each is independent):

- Touch targets: the small `plx`/chip buttons against a 40px minimum.
- PWA install: a `manifest` (Next app router: `src/app/manifest.ts`), icons,
  theme colour off the parchment palette. A service worker is NOT required
  for installability everywhere anymore — skip it unless offline is asked
  for; the app already runs localStorage-first.

Verify: a `tests/` jsdom test in the `store-saves` mould — export a save,
wipe, import, byte-compare the parsed data; import-as-new-save never touches
the current one; a hostile/garbage file is refused without state damage.
`npm run test:saves` and `test:games` must stay green. Bump the build tag.
Stage explicit paths; ask before pushing.
