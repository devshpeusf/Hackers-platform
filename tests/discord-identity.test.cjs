// Run with: node --test tests/discord-identity.test.cjs
// The identity the app keys ownership and organizer access on must come from
// Supabase's provider identity, never from user_metadata (which a signed-in
// user can rewrite with the public key). No credentials or DB writes.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(path, modules = {}) {
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const context = { exports: {}, require: (name) => {
    assert.ok(name in modules, `Unexpected dependency: ${name}`);
    return modules[name];
  } };
  vm.runInNewContext(compiled, context);
  return context.exports;
}

const { verifiedDiscordId, toApplicantIdentity } = load("src/lib/supabase/user.ts");

/** A signed-in user whose real Discord account is `realId`. */
function user({ realId = "discord-attacker", metadata = {}, identities } = {}) {
  return {
    id: "supabase-user-1",
    email: "attacker@example.test",
    user_metadata: metadata,
    identities: identities ?? [{ provider: "discord", identity_data: { sub: realId } }],
  };
}

test("the Discord id comes from the provider identity", () => {
  assert.equal(verifiedDiscordId(user()), "discord-attacker");
  assert.equal(toApplicantIdentity(user()).discordId, "discord-attacker");
});

test("rewriting metadata to a victim's id changes nothing (the original hole)", () => {
  const tampered = user({ metadata: { provider_id: "discord-victim", sub: "discord-victim" } });
  assert.equal(toApplicantIdentity(tampered).discordId, "discord-attacker");
});

test("rewriting metadata to an organizer's id does not make you one", () => {
  const tampered = user({ metadata: { provider_id: "discord-organizer" } });
  assert.notEqual(toApplicantIdentity(tampered).discordId, "discord-organizer");
});

test("no Discord identity means no id — no fallback to metadata or the Supabase id", () => {
  const noDiscord = user({ identities: [], metadata: { provider_id: "discord-victim" } });
  assert.equal(toApplicantIdentity(noDiscord).discordId, null);

  const otherProvider = user({ identities: [{ provider: "github", identity_data: { sub: "gh-1" } }] });
  assert.equal(verifiedDiscordId(otherProvider), null);
});

test("a blank or non-string identity sub is rejected", () => {
  assert.equal(verifiedDiscordId(user({ identities: [{ provider: "discord", identity_data: { sub: "  " } }] })), null);
  assert.equal(verifiedDiscordId(user({ identities: [{ provider: "discord", identity_data: { sub: 123 } }] })), null);
  assert.equal(verifiedDiscordId(user({ identities: [{ provider: "discord" }] })), null);
});

test("display fields still come from metadata — editing them only changes what you see", () => {
  const identity = toApplicantIdentity(user({ metadata: { preferred_username: "mreyes#0", avatar_url: "a.png" } }));
  assert.equal(identity.username, "mreyes");
  assert.equal(identity.avatarUrl, "a.png");
});

// ---- the organizer gate ----

function loadOrganizer(roleByDiscordId) {
  const lookups = [];
  const exports = load("src/lib/organizer.ts", {
    "next/navigation": {
      notFound: () => { throw new Error("NOT_FOUND"); },
      redirect: (url) => { throw new Error(`REDIRECT:${url}`); },
    },
    "@/lib/prisma": { prisma: { person: { findUnique: async ({ where }) => {
      lookups.push(where.discordId);
      const role = roleByDiscordId[where.discordId];
      return role ? { role } : null;
    } } } },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: currentUser } }) } }) },
    "@/lib/supabase/user": { toApplicantIdentity },
  });
  return { ...exports, lookups };
}
let currentUser = null;

test("a missing id is never an organizer, and isn't even looked up", async () => {
  const { isOrganizer, lookups } = loadOrganizer({ "discord-organizer": "ORGANIZER" });
  assert.equal(await isOrganizer(null), false);
  assert.equal(lookups.length, 0);
});

test("requireOrganizer ignores a metadata claim to be an organizer", async () => {
  const { requireOrganizer, lookups } = loadOrganizer({ "discord-organizer": "ORGANIZER" });
  currentUser = user({ metadata: { provider_id: "discord-organizer" } });
  await assert.rejects(requireOrganizer(), /NOT_FOUND/);
  assert.deepEqual(lookups, ["discord-attacker"]);
});

test("a real organizer still gets in", async () => {
  const { requireOrganizer } = loadOrganizer({ "discord-organizer": "ORGANIZER" });
  currentUser = user({ realId: "discord-organizer" });
  const identity = await requireOrganizer();
  assert.equal(identity.discordId, "discord-organizer");
});

test("signed-out visitors are sent to sign in", async () => {
  const { requireOrganizer } = loadOrganizer({});
  currentUser = null;
  await assert.rejects(requireOrganizer(), /REDIRECT:\/auth\/signin/);
});

// ---- nothing reads the id from metadata anywhere ----

test("no code derives the Discord id from user_metadata", () => {
  const source = readFileSync("src/lib/supabase/user.ts", "utf8");
  assert.doesNotMatch(source, /pick\(meta,\s*"provider_id"/);
  assert.match(source, /discordId:\s*verifiedDiscordId\(user\)/);
});
