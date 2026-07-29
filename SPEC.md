# SPEC — Add the Anno Playbook + Session Rhythm to the companion app

## What this is
The existing app is a **pure HTML** Anno 1800 production calculator (no framework, no build step). This spec adds two reference documents into that same app as new tabs/sections, and makes a handful of parts interactive using **plain vanilla JS + `localStorage`** (no libraries, no framework, no build tooling — keep it a single self-contained page or the same structure the app already uses).

The two documents are supplied alongside this spec:
- `anno-1800-lean-playbook.md` — the strategy reference (build order, rules, DLC map, oversized-production method).
- `anno-1800-session-rhythm.md` — the per-session routine (session types, shutdown checklist, current-focus tracker).

## Goal
Turn these from static markdown into live tabs in the app, sitting next to the calculator, so the strategy and the session tracker live in the same place the numbers are worked out. The read-only text is reference; a few specific parts must **save between visits**.

---

## Hard constraints
- **Match the existing app.** Reuse its current CSS, colours, fonts, and layout. Do not restyle the calculator or introduce a UI framework. New sections should look like they were always part of the app.
- **No build step.** Vanilla JS only. It must still run by opening the HTML file directly in a browser.
- **Persistence = `localStorage`.** No backend, no accounts. Everything interactive saves locally in the browser and reloads on next visit.
- **Don't touch the calculator's existing logic.** Only add to the app; don't refactor what works.
- **Degrade safely.** If `localStorage` is unavailable, the pages still render as readable text — saving just doesn't persist. Never let a storage error blank the page.

---

## Structure to add

### 1. Navigation
Add two new tabs/sections to the app's existing navigation (whatever pattern it already uses — tabs, buttons, nav links):
- **Playbook**
- **Session** (the session rhythm)

The calculator stays the default/first view.

### 2. Playbook tab (mostly read-only, a few saved fields)
- Render the content of `anno-1800-lean-playbook.md` as formatted HTML (headings, tables, bullet lists, bold). A small markdown-to-HTML conversion at load is fine, or hand-convert the content into HTML sections — either is acceptable, whichever is cleaner for a no-build page.
- **The `____` blanks become saved input fields.** Throughout the playbook there are blanks the player fills in from their game screen. Turn each into a small text input that **saves to `localStorage`** and reloads filled in. They are:
  - Fur-coat need trigger population
  - Which workforce tier staffs the Steelworks
  - Crown Falls fertilities
  - Crown Falls mineral nodes
  - Crown Falls island size
  - Mail income per residence once a route runs
  - Tourism income (attractiveness × 3.6)
- These same values appear in an "Open Questions" table near the bottom — make that table the single source of truth, and if the same blank appears inline in the text, either mirror the saved value or just keep the table as the one place they're entered. One save key per value.

### 3. Session tab (interactive tracker)
Render `anno-1800-session-rhythm.md`, with these parts made live and saved to `localStorage`:

- **Current Focus block** — a set of editable fields that save:
  - Phase (1–6)
  - This session I'm working on
  - Left mid-build / unfinished
  - Next session, start with
  - Per-tick balance when I stopped
- **Session types** — read-only reference list (the seven session types and their "done when" lines). No interaction needed.
- **Shutdown Check** — real checkboxes. On each session they should be **easy to reset for the next session** (a "reset checklist" button), but the *fact of whether they're ticked right now* persists on reload so a mid-shutdown refresh doesn't lose state.
- **Parking Lot** — an add/remove list. Type an item, it's added and saved; remove items when dealt with. This replaces the three static `____` lines.

---

## Data model (localStorage keys)
Use one namespaced key per value so nothing collides with the calculator's own storage. Suggested prefix `anno_`:

```
anno_openq_furcoat
anno_openq_steelworks_tier
anno_openq_cf_fertilities
anno_openq_cf_minerals
anno_openq_cf_size
anno_openq_mail_income
anno_openq_tourism_income

anno_focus_phase
anno_focus_working_on
anno_focus_unfinished
anno_focus_next
anno_focus_balance

anno_shutdown_checks        // array or object of checkbox states
anno_parkinglot             // array of strings
```
Wrap all reads/writes in try/catch. Missing key = empty field, not an error.

---

## Out of scope (do NOT build these now)
- No wiring between the Session/Playbook tabs and the calculator's numbers. (Possible later; not now.)
- No cloud sync, no export/import, no multi-save-file support. One local save state is enough.
- No editing of the playbook *body text* in-app — only the designated blank fields and the session tracker are editable. The prose is fixed reference.
- No restyling of the existing calculator.

---

## Done when (verify before finishing)
1. Opening the HTML file shows the calculator as before, plus two new working tabs: **Playbook** and **Session**.
2. The Playbook renders cleanly (tables, headings, lists all readable) and matches the app's existing look.
3. Typing a value into any Open-Questions field, closing the browser, and reopening shows the value still there.
4. The Session tab's Current Focus fields, Shutdown checkboxes, and Parking Lot all save and reload correctly.
5. "Reset checklist" clears the shutdown checkboxes without touching Current Focus or Parking Lot.
6. Disabling `localStorage` (or private-browsing edge case) still shows readable pages — no blank screen, no crash.
7. The calculator's existing behaviour is unchanged.
