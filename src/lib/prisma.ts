import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Prisma 7 has no Rust query engine and no schema-level connection URL —
// the Client connects through a driver adapter instead. DATABASE_URL is
// the pooled (transaction-mode, port 6543) connection, appropriate for
// app runtime queries. Migrations use DIRECT_URL instead — see
// prisma.config.ts.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// Singleton pattern: in dev, Next.js hot-reloads modules on every file
// change, which would otherwise spin up a new PrismaClient (and a new
// DB connection pool) on every save. Stashing it on globalThis makes
// hot reloads reuse the same client instead.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
