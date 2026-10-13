// Run with: node --test tests/current-hacker.test.cjs
// Exercise the real helper with mocked Auth/Prisma, without credentials or DB writes.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const source = readFileSync("src/lib/current-hacker.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function setup(overrides = {}) {
  const calls = [];
  const state = {
    user: {
      id: "auth-user-a",
      user_metadata: { provider_id: "discord-user-b" },
      identities: [{ provider: "discord", identity_data: { sub: "discord-user-a" } }],
    },
    error: null,
    person: { id: "person-a", firstName: "Alex", lastName: "Smith", email: "alex@example.test", phoneNum: "555" },
    application: { status: "ACCEPTED", school: "School", major: "Major", graduation: "2027-05", shirtSize: "M", gender: null, diet: "No restriction" },
    ...overrides,
  };
  const modules = {
    "server-only": {},
    // React's actual request cache is provided by the Server Component runtime.
    react: { cache: (fn) => fn },
    "next/navigation": { redirect: (url) => { throw new Error(`REDIRECT:${url}`); } },
    "@/lib/supabase/server": { createClient: async () => ({ auth: {
      getUser: async () => ({ data: { user: state.user }, error: state.error }),
    } }) },
    "@/lib/supabase/user": { toApplicantIdentity: () => ({ username: "alex" }) },
    "@/lib/prisma": { prisma: {
      person: { findUnique: async (query) => { calls.push(["person", query]); return state.person; } },
      application: { findFirst: async (query) => { calls.push(["application", query]); return state.application; } },
    } },
  };
  const context = { exports: {}, require: (name) => {
    assert.ok(name in modules, `Unexpected dependency: ${name}`);
    return modules[name];
  } };
  vm.runInNewContext(compiled, context);
  return { getCurrentHacker: context.exports.getCurrentHacker, state, calls };
}

test("signed-out requests redirect before any database query", async () => {
  const { getCurrentHacker, calls } = setup({ user: null });
  await assert.rejects(getCurrentHacker(), /REDIRECT:\/apply\?signin=required/);
  assert.equal(calls.length, 0);
});

test("Auth errors fail closed even if a user was returned", async () => {
  const { getCurrentHacker, calls } = setup({ error: new Error("Auth failed") });
  await assert.rejects(getCurrentHacker(), /REDIRECT:\/apply\?signin=required/);
  assert.equal(calls.length, 0);
});

test("missing Discord provider identity cannot fall back to editable metadata", async () => {
  const { getCurrentHacker, calls } = setup({ user: {
    id: "auth-user-a", user_metadata: { provider_id: "discord-user-b" }, identities: [],
  } });
  await assert.rejects(getCurrentHacker(), /REDIRECT:\/apply\?signin=required/);
  assert.equal(calls.length, 0);
});

test("ownership comes from verified Discord identity and server-resolved Person", async () => {
  const { getCurrentHacker, calls } = setup();
  // A supplied argument has no influence; the helper accepts no ID input.
  const result = await getCurrentHacker("person-b");
  assert.equal(calls[0][1].where.discordId, "discord-user-a");
  assert.equal(calls[1][1].where.personId, "person-a");
  assert.equal(result.fullName, "Alex Smith");
  assert.equal(result.application.diet, "No restriction");
  assert.equal(result.username, "alex");
  assert.equal("id" in result.person, false);
  assert.equal("raw" in result, false);
});

test("users without a Person are sent to the application form", async () => {
  const { getCurrentHacker, calls } = setup({ person: null });
  await assert.rejects(getCurrentHacker(), /REDIRECT:\/apply\/form/);
  assert.equal(calls.length, 1);
});

test("users without an application are sent to the application form", async () => {
  const { getCurrentHacker } = setup({ application: null });
  await assert.rejects(getCurrentHacker(), /REDIRECT:\/apply\/form/);
});

for (const status of ["SUBMITTED", "WAITLISTED", "REJECTED"]) {
  test(`${status} applicants cannot enter the portal`, async () => {
    const { getCurrentHacker } = setup({ application: { status } });
    await assert.rejects(getCurrentHacker(), /REDIRECT:\/apply\/status/);
  });
}

test("separate users resolve separate Person/application scopes", async () => {
  const first = setup();
  const second = setup({
    user: { identities: [{ provider: "discord", identity_data: { sub: "discord-user-b" } }] },
    person: { id: "person-b", firstName: "Casey", lastName: "Jones" },
  });
  await Promise.all([first.getCurrentHacker(), second.getCurrentHacker()]);
  assert.equal(first.calls[1][1].where.personId, "person-a");
  assert.equal(second.calls[1][1].where.personId, "person-b");
});

test("every portal page checks access independently of the shared layout", () => {
  for (const route of ["dashboard", "profile", "team", "guide", "schedule", "help"]) {
    const page = readFileSync(`src/app/(app)/${route}/page.tsx`, "utf8");
    assert.match(page, /await getCurrentHacker\(\)/, route);
    assert.doesNotMatch(page, /searchParams|params\.personId|params\.applicationId/, route);
  }
});
