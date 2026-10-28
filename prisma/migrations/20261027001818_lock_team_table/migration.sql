-- Team was created (add_teams) before lock_public_tables changed the default
-- privileges, so it still has Supabase's default grants to the public roles.
-- Close it the same way as every other app table: the app only reaches it
-- through Prisma as `postgres`, which bypasses RLS.
ALTER TABLE "Team" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "Team" FROM anon, authenticated;
