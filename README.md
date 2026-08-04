# Anno 1800 Production Planner

A production calculator, strategy playbook and session tracker for **Anno 1800**,
built with Next.js. Pick target goods (or enter your population per tier) and it
works out exact building counts, shared-resource savings, zero-waste blueprints
and optimal whole-building plans for the entire supply chain.

Live at **anno-1800-planner.vercel.app** (the previous single-file build is kept
at `/legacy.html`).

## Features

- **83 products** across all four regions — Old World, New World, The Arctic, Enbesa (all-DLC chains)
- **Two input modes** — target final goods (factories or tons/min), or enter **residents per tier** and let in-game need thresholds derive demand (lifestyle-needs toggle, consumption-rate slider)
- **Five result views** — Optimal build (fewest buildings incl. free top-ups), Perfect ratio (smallest all-100% blueprint), exact Buildings table, Shared resources, Chain tree
- **Electricity, Bright Harvest silos, coal source and productivity** all modelled in one place
- **Tracker tab** — quest tracker (storylines, add-on goals, your own tasks) and per-island inventory with a makes/uses/net production ledger that says what to build when a chain runs short
- **Shareable links** — the whole plan is encoded in the URL (legacy links keep working)
- **Optional cross-device sync** — with a Neon Postgres database and a passphrase, Tracker state syncs between devices and calculator plans can be saved by name. Without it, everything still works per-browser via localStorage.

## Develop

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # production build (includes prisma generate)
npm run test:engine  # golden tests: engine vs the legacy implementation
```

## Sync setup (optional)

1. Create a Postgres database on [Neon](https://neon.tech) (or Vercel Marketplace → Neon).
2. Copy `.env.example` to `.env`, set `DATABASE_URL` (use the **pooled** connection string) and `APP_PASSWORD`.
3. Push the schema: `npx prisma db push`
4. Set the same two env vars in the Vercel project settings and redeploy.

No `DATABASE_URL` → the sync UI simply doesn't appear.

## Deploy

Pushing `main` deploys to Vercel. Verify with the build tag in the page footer.

---

Base data cross-checked against the Anno 1800 Wiki and community calculator data.
Not affiliated with Ubisoft.
