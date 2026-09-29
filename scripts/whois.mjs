#!/usr/bin/env node
/**
 * Answers "this person says they applied — did they?" for one applicant.
 *
 *   node scripts/whois.mjs <discord username, id, or email>
 *
 * Resolves the same way the app does (provider_id ?? sub from the Discord
 * session) and reports exactly what /apply/form and /apply/status will see,
 * so a support question gets a factual answer instead of a guess.
 */
import { config } from "dotenv";
config({ path: ".env" }); config({ path: ".env.local" });
import { Client } from "pg";

const term = process.argv[2];
if (!term) { console.error("usage: node scripts/whois.mjs <username|discordId|email>"); process.exit(1); }

const db = new Client({ connectionString: process.env.DIRECT_URL });
await db.connect();

const { rows: users } = await db.query(`
  select u.id, u.email, u.created_at,
         coalesce(u.raw_user_meta_data->>'provider_id', u.raw_user_meta_data->>'sub') discord_id,
         coalesce(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name') username
  from auth.users u
  where coalesce(u.raw_user_meta_data->>'provider_id', u.raw_user_meta_data->>'sub') = $1
     or u.email ilike '%'||$1||'%'
     or coalesce(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name') ilike '%'||$1||'%'`,
  [term]);

if (!users.length) {
  console.log(`\n  No Discord sign-in found matching "${term}".`);
  console.log("  -> They have never signed in. The form is the correct screen for them.\n");
  await db.end(); process.exit(0);
}

for (const u of users) {
  console.log(`\n  ${u.username ?? "(no name)"}  <${u.email ?? "no email"}>`);
  console.log(`    discord id   ${u.discord_id}`);
  console.log(`    signed in    ${u.created_at.toISOString().slice(0, 16).replace("T", " ")}`);

  const { rows: apps } = await db.query(`
    select a.id, a.status, a."createdAt", p."firstName", p."lastName", p.email
    from "Application" a join "Person" p on p.id = a."personId"
    where p."discordId" = $1 order by a."createdAt" desc`, [u.discord_id]);

  if (!apps.length) {
    console.log(`    APPLICATION  none`);
    console.log(`    -> They signed in but never submitted. Being shown the form is correct.`);
    console.log(`       If they insist they applied, they likely used a different Discord account,`);
    console.log(`       or closed the tab before the last step (there is no draft saving).`);
  } else {
    for (const a of apps) {
      console.log(`    APPLICATION  ${a.status}  submitted ${a.createdAt.toISOString().slice(0, 16).replace("T", " ")}`);
      console.log(`                 ${a.firstName} ${a.lastName} <${a.email}>`);
    }
    console.log(`    -> /apply/form will redirect them to /apply/applied. If they see the form,`);
    console.log(`       they are signed in as a DIFFERENT Discord account than this one.`);
  }
}
console.log();
await db.end();
