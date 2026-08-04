---
description: Session-start — sync, report what other sessions shipped, pick up the roadmap
---

Get me back up to speed on the planner and set up to continue:

1. **Sync + collision check.** Run `git fetch` and `git status`. If the
   working tree has uncommitted changes, another session is probably
   mid-work: report the diffstat and DO NOT edit those files — monitor for
   its commit (poll `git status` in the background) and coordinate instead
   of colliding. This repo is regularly driven from two sessions at once.
2. **What landed since last time.** Show `git log --oneline -10` and
   summarize the new builds in plain language — what changed for the user,
   not the stack. Cross-check the deploy: curl
   https://anno-1800-planner.vercel.app/ and grep for `build ` — if the live
   tag is behind the tag in `src/components/calc/Results.tsx`, say so.
3. **Roadmap position.** Read `ROADMAP.md`: one line on the latest Done
   entries since the last session, then the next open milestone and what it
   involves.
4. **Propose this session's work** — normally the next open milestone, or
   anything the log/tree suggests is half-finished. Confirm direction with
   me before writing code (milestone order can change); once confirmed,
   follow the CLAUDE.md workflow: golden tests, bump the build tag, push
   main, verify the live build tag.

Keep the whole thing short: a few sentences of catch-up, then the question
of what to do next.
