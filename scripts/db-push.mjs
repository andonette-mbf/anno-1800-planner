// Runs during the Vercel build (the only environment that can read the
// sensitive Neon env vars) to keep the database schema in sync.
// Additive schema changes apply automatically; a failure is logged but does
// not fail the deploy — the app degrades to localStorage-only mode.
import { execSync } from "node:child_process";

if (!process.env.DATABASE_URL) {
  console.log("db-push: DATABASE_URL not set — skipping (local-only mode).");
  process.exit(0);
}
try {
  execSync("npx prisma db push --skip-generate --accept-data-loss", { stdio: "inherit" });
  console.log("db-push: schema in sync.");
} catch (e) {
  console.error("db-push FAILED — deploy continues, sync endpoints will 503:", e.message);
}
