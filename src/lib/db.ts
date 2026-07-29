import { PrismaClient } from "@prisma/client";

// Lazy singleton; null when DATABASE_URL is not configured — the app then runs
// in localStorage-only mode and the API returns 503 for sync endpoints.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getDb(): PrismaClient | null {
  // Prefer Neon's Prisma-tuned pooled URL (includes pgbouncer=true) when the
  // Vercel integration provides it; fall back to plain DATABASE_URL.
  const url = process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL;
  if (!url) return null;
  if (!globalForPrisma.prisma) globalForPrisma.prisma = new PrismaClient({ datasourceUrl: url });
  return globalForPrisma.prisma;
}
