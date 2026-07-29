import { PrismaClient } from "@prisma/client";

// Lazy singleton; null when DATABASE_URL is not configured — the app then runs
// in localStorage-only mode and the API returns 503 for sync endpoints.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getDb(): PrismaClient | null {
  if (!process.env.DATABASE_URL) return null;
  if (!globalForPrisma.prisma) globalForPrisma.prisma = new PrismaClient();
  return globalForPrisma.prisma;
}
