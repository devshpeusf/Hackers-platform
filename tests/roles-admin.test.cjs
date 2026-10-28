// Run with: node --test tests/roles-admin.test.cjs
// /admin/roles: organizer-only role changes, no self-changes, real roles only,
// and every change records who made it. No real DB.
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

function fakePeople(people) {
  const db = new Map(people.map((p) => [p.id, { roleChangedAt: null, roleChangedById: null, ...p }]));
  const prisma = { person: {
    findUnique: async ({ where }) => {
      const p = where.id ? db.get(where.id) : [...db.values()].find((x) => x.discordId === where.discordId);
      return p ? { id: p.id, role: p.role } : null;
    },
    update: async ({ where, data }) => Object.assign(db.get(where.id), data),
  } };
  return { db, prisma };
}

function rolesLib(people) {
  const { db, prisma } = fakePeople(people);
  return { db, roles: load("src/lib/roles.ts", { "server-only": {}, "@/lib/prisma": { prisma } }) };
}

const org = { id: "org", discordId: "discord-org", role: "ORGANIZER" };
const vol = { id: "vol", discordId: "discord-vol", role: "VOLUNTEER" };
const app = { id: "app", discordId: "discord-app", role: "APPLICANT" };

test("an organizer can promote and demote, and the change is recorded", async () => {
  const { db, roles } = rolesLib([org, app]);
  const result = await roles.setPersonRole("org", "app", "VOLUNTEER");
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.equal(db.get("app").role, "VOLUNTEER");
  assert.equal(db.get("app").roleChangedById, "org");
  assert.equal(Object.prototype.toString.call(db.get("app").roleChangedAt), "[object Date]");

  await roles.setPersonRole("org", "app", "APPLICANT");
  assert.equal(db.get("app").role, "APPLICANT");
});

test("nobody can change their own role, so an organizer always remains", async () => {
  const { db, roles } = rolesLib([org]);
  const result = await roles.setPersonRole("org", "org", "APPLICANT");
  assert.equal(result.error, "SELF");
  assert.equal(db.get("org").role, "ORGANIZER");
});

test("only the three real roles, and only people who exist", async () => {
  const { db, roles } = rolesLib([org, app]);
  for (const bad of ["ADMIN", "organizer", "", null, "SUPERUSER"]) {
    assert.equal((await roles.setPersonRole("org", "app", bad)).error, "INVALID_ROLE", String(bad));
  }
  assert.equal(db.get("app").role, "APPLICANT");
  assert.equal((await roles.setPersonRole("org", "ghost", "VOLUNTEER")).error, "NOT_FOUND");
});

test("setting the same role again is a no-op that doesn't overwrite the audit trail", async () => {
  const { db, roles } = rolesLib([org, { ...vol, roleChangedById: "someone-else" }]);
  const result = await roles.setPersonRole("org", "vol", "VOLUNTEER");
  assert.equal(result.changed, false);
  assert.equal(db.get("vol").roleChangedById, "someone-else");
});

// ---- the action: organizer check from the verified identity ----

function action(actorDiscordId, people = [org, vol, app]) {
  const { db, prisma } = fakePeople(people);
  const roles = load("src/lib/roles.ts", { "server-only": {}, "@/lib/prisma": { prisma } });
  const exports = load("src/app/admin/roles/actions.ts", {
    "next/cache": { revalidatePath: () => {} },
    "@/lib/prisma": { prisma },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: actorDiscordId ? {
      id: "sb", user_metadata: { provider_id: "discord-org" },
      identities: [{ provider: "discord", identity_data: { sub: actorDiscordId } }],
    } : null } }) } }) },
    "@/lib/supabase/user": load("src/lib/supabase/user.ts"),
    "@/lib/roles": roles,
  });
  return { ...exports, db };
}

function form(fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

test("volunteers, applicants and signed-out visitors can't change roles", async () => {
  for (const actor of ["discord-vol", "discord-app", null]) {
    const a = action(actor);
    const result = await a.changeRoleAction({ status: "idle" }, form({ personId: "app", role: "ORGANIZER" }));
    assert.equal(result.status, "error", String(actor));
    assert.equal(a.db.get("app").role, "APPLICANT");
  }
});

test("claiming to be an organizer through edited metadata doesn't work", async () => {
  // The fake user's metadata says discord-org, but the verified identity is the applicant.
  const a = action("discord-app");
  await a.changeRoleAction({ status: "idle" }, form({ personId: "app", role: "ORGANIZER" }));
  assert.equal(a.db.get("app").role, "APPLICANT");
});

test("an organizer's change goes through and is attributed to them", async () => {
  const a = action("discord-org");
  const result = await a.changeRoleAction({ status: "idle" }, form({ personId: "app", role: "VOLUNTEER" }));
  assert.equal(result.status, "ok");
  assert.equal(a.db.get("app").role, "VOLUNTEER");
  assert.equal(a.db.get("app").roleChangedById, "org");
});

test("the roles page is organizer-only and listed for organizers only", () => {
  assert.match(readFileSync("src/app/admin/roles/page.tsx", "utf8"), /await requireOrganizer\(\)/);
  const tools = load("src/lib/admin-tools.ts");
  assert.ok(tools.toolsFor("ORGANIZER").some((t) => t.href === "/admin/roles"));
  assert.ok(!tools.toolsFor("VOLUNTEER").some((t) => t.href === "/admin/roles"));
});
