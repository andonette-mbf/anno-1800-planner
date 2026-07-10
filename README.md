# Anno 1800 Production Planner

A single-page, offline-friendly production calculator for **Anno 1800**. Pick your
target final goods and it works out the exact building counts, shared-resource
savings, and whole-building (zero-waste) layouts for the entire supply chain.

## Features

- **58 products** across all four regions — Old World, New World, The Arctic, Enbesa
- Set targets by **factory count** or **tons/min**
- **Shared resources** view — see where one intermediate feeds multiple lines and how much rounding you save by pooling
- **Whole-building layout** — smallest multiplier that makes every building run at 100% with no leftovers
- **Chain tree** — full ingredient breakdown per product
- Adjustable **productivity**, coal source, and round-up behaviour
- **Shareable links** — the whole plan is encoded in the URL

Everything runs client-side in a single `index.html`. No build step, no backend.

## Run locally

Just open `index.html` in a browser, or serve the folder:

```bash
npx serve .
```

## Deploy

Static site — deploys to Vercel (or any static host) with zero configuration.

---

Base data cross-checked against the Anno 1800 Wiki and community calculator data.
Not affiliated with Ubisoft.
