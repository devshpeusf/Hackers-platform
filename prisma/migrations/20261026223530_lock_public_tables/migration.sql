-- Close Supabase's public data API (PostgREST) on every app table.
--
-- Supabase exposes each table in the public schema at /rest/v1/<table> to
-- anyone holding the publishable key — which ships in the browser bundle, so
-- it's public by design. With RLS off (the default for tables Prisma
-- creates), that meant applicant rows (names, emails, phones, dates of birth)
-- were readable, and likely writable, by anyone.
--
-- Nothing in the app uses that API: all table access goes through Prisma on
-- the server, as the `postgres` role, which bypasses RLS. Auth and Storage
-- (resume uploads) are separate systems with their own policies. So: RLS on
-- with no policies, plus no table privileges for the public roles. Same
-- pattern RsvpToken already uses.

BEGIN;

ALTER TABLE "Application"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailQueue"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Event"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Person"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Ping"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Resume"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  "Application", "EmailQueue", "Event", "Person", "Ping", "Resume", "RsvpToken", "_prisma_migrations"
FROM anon, authenticated;

-- So the next table a migration creates starts closed too, instead of
-- inheriting Supabase's default grants to the public roles.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

COMMIT;
