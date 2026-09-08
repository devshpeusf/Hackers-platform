import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// The CLI (migrate, generate, studio) uses this config to find the
// database. It's set to DIRECT_URL — not the pooled DATABASE_URL —
// because migrations need a direct, non-transaction-pooled connection.
// The Prisma Client used by the app at runtime is configured
// separately in src/lib/prisma.ts, using DATABASE_URL via the
// @prisma/adapter-pg driver adapter (Prisma 7 no longer reads a url
// from the schema file at all).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
});
