// Run with: node --test tests/roles.test.cjs
// Real authorization helpers with mocked Prisma and Supabase; no DB writes.
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

const userLib = load("src/lib/supabase/user.ts");

function user(discordId = "discord-me") {
  return {
    id: "supabase-me",
    user_metadata: {},
    identities: [{ provider: "discord", identity_data: { sub: discordId } }],
  };
}

function setup({ role = "APPLICANT", currentUser = user(), authError = null } = {}) {
  const lookups = [];
  const modules = {
    "next/navigation": {
      notFound: () => { throw new Error("NOT_FOUND"); },
      redirect: (url) => { throw new Error(`REDIRECT:${url}`); },
    },
    "@/lib/prisma": { prisma: { person: { findUnique: async (args) => {
      lookups.push(JSON.parse(JSON.stringify(args)));
      return role === null ? null : { role };
    } } } },
    "@/lib/supabase/server": { createClient: async () => ({ auth: {
      getUser: async () => ({ data: { user: currentUser }, error: authError }),
    } }) },
    "@/lib/supabase/user": userLib,
  };
  return {
    ...load("src/lib/organizer.ts", modules),
    ...load("src/lib/volunteer.ts", modules),
    lookups,
  };
}

for (const [role, organizer, volunteer] of [
  ["APPLICANT", false, false],
  ["VOLUNTEER", false, true],
  ["ORGANIZER", true, true],
]) {
  test(`${role}: organizer=${organizer}, volunteer-or-above=${volunteer}`, async () => {
    const s = setup({ role });
    assert.equal(await s.isOrganizer("discord-me"), organizer);
    assert.equal(await s.isVolunteerOrAbove("discord-me"), volunteer);
    assert.deepEqual(s.lookups, [
      { where: { discordId: "discord-me" }, select: { role: true } },
      { where: { discordId: "discord-me" }, select: { role: true } },
    ]);
  });
}

for (const discordId of [null, ""]) {
  test(`missing identity (${JSON.stringify(discordId)}) denies both helpers without a lookup`, async () => {
    const s = setup({ role: "ORGANIZER" });
    assert.equal(await s.isOrganizer(discordId), false);
    assert.equal(await s.isVolunteerOrAbove(discordId), false);
    assert.equal(s.lookups.length, 0);
  });
}

test("a Discord identity without a Person row has no staff access", async () => {
  const s = setup({ role: null });
  assert.equal(await s.isOrganizer("discord-me"), false);
  assert.equal(await s.isVolunteerOrAbove("discord-me"), false);
});

test("a role lookup failure propagates instead of granting access", async () => {
  const modules = { "@/lib/prisma": { prisma: { person: {
    findUnique: async () => { throw new Error("DATABASE_UNAVAILABLE"); },
  } } } };
  const { isVolunteerOrAbove } = load("src/lib/volunteer.ts", modules);
  await assert.rejects(isVolunteerOrAbove("discord-me"), /DATABASE_UNAVAILABLE/);
});

for (const role of ["APPLICANT", "VOLUNTEER"]) {
  test(`requireOrganizer rejects ${role} with the same 404`, async () => {
    const s = setup({ role });
    await assert.rejects(s.requireOrganizer(), /NOT_FOUND/);
    assert.deepEqual(s.lookups, [
      { where: { discordId: "discord-me" }, select: { role: true } },
    ]);
  });
}

test("requireOrganizer still admits an organizer", async () => {
  const s = setup({ role: "ORGANIZER" });
  assert.equal((await s.requireOrganizer()).discordId, "discord-me");
});

test("requireOrganizer redirects a signed-out user or failed authentication", async () => {
  for (const options of [{ currentUser: null }, { authError: new Error("AUTH_FAILED") }]) {
    const s = setup({ role: "ORGANIZER", ...options });
    await assert.rejects(s.requireOrganizer(), /REDIRECT:\/auth\/signin/);
    assert.equal(s.lookups.length, 0);
  }
});

test("missing provider identity cannot use a metadata claim for staff access", async () => {
  const currentUser = {
    id: "supabase-me",
    identities: [],
    user_metadata: { provider_id: "discord-organizer", role: "ORGANIZER" },
  };
  const s = setup({ role: "ORGANIZER", currentUser });
  const identity = userLib.toApplicantIdentity(currentUser);
  assert.equal(await s.isOrganizer(identity.discordId), false);
  assert.equal(await s.isVolunteerOrAbove(identity.discordId), false);
  await assert.rejects(s.requireOrganizer(), /NOT_FOUND/);
  assert.equal(s.lookups.length, 0);
});

test("volunteer access follows the verified Discord identity, ignoring edited metadata", async () => {
  const currentUser = user();
  currentUser.user_metadata = { provider_id: "discord-organizer", role: "ORGANIZER" };
  const s = setup({ role: "APPLICANT", currentUser });
  assert.equal(await s.isVolunteerOrAbove(userLib.toApplicantIdentity(currentUser).discordId), false);
  assert.equal(s.lookups[0].where.discordId, "discord-me");
});
