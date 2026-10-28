// Run with: node --test tests/admin-hub.test.cjs
// The staff hub: who sees which tools, and that every linked tool really
// exists and guards itself (the hub only links — it isn't access control).
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
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
const plain = (x) => JSON.parse(JSON.stringify(x));

const tools = load("src/lib/admin-tools.ts");

test("volunteers see only the door tools; organizers see everything", () => {
  const volunteer = plain(tools.toolsFor("VOLUNTEER").map((t) => t.href));
  assert.deepEqual(volunteer, ["/admin/walk-in", "/admin/check-in"]);
  assert.equal(tools.toolsFor("ORGANIZER").length, tools.ADMIN_TOOLS.length);
});

test("every live tool has a page that checks the right role itself", () => {
  for (const tool of tools.ADMIN_TOOLS.filter((t) => !t.soon)) {
    const file = `src/app${tool.href}/page.tsx`;
    assert.ok(existsSync(file), `${tool.href} is linked but ${file} doesn't exist`);
    const page = readFileSync(file, "utf8");
    if (tool.access === "organizer") {
      assert.match(page, /await requireOrganizer\(\)/, `${tool.href} must be organizer-only`);
    } else {
      assert.match(page, /await require(VolunteerOrAbove|Organizer|StaffRole)\(\)/, `${tool.href} must check staff access`);
    }
  }
});

test("'coming soon' tools aren't linked from the nav bar", () => {
  const layout = readFileSync("src/app/admin/layout.tsx", "utf8");
  assert.match(layout, /\.filter\(\(t\) => !t\.soon\)/);
});

test("the hub itself is staff-only, and the bar only renders for staff", () => {
  assert.match(readFileSync("src/app/admin/page.tsx", "utf8"), /await requireStaffRole\(\)/);
  assert.match(readFileSync("src/app/admin/layout.tsx", "utf8"), /\{role && <AdminNav items=\{items\} \/>\}/);
});

// ---- the role lookup ----

function staff({ role, identities = [{ provider: "discord", identity_data: { sub: "discord-me" } }], signedIn = true }) {
  const lookups = [];
  const lib = load("src/lib/staff.ts", {
    "server-only": {},
    "next/navigation": {
      notFound: () => { throw new Error("NOT_FOUND"); },
      redirect: (url) => { throw new Error(`REDIRECT:${url}`); },
    },
    "@/lib/prisma": { prisma: { person: { findUnique: async ({ where }) => {
      lookups.push(where.discordId);
      return where.discordId === "discord-me" && role ? { role } : null;
    } } } },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: signedIn ? {
      id: "sb", user_metadata: { provider_id: "discord-organizer" }, identities,
    } : null } }) } }) },
    "@/lib/supabase/user": load("src/lib/supabase/user.ts"),
  });
  return { ...lib, lookups };
}

test("organizers and volunteers get their role; applicants get nothing", async () => {
  assert.equal(await staff({ role: "ORGANIZER" }).getStaffRole(), "ORGANIZER");
  assert.equal(await staff({ role: "VOLUNTEER" }).getStaffRole(), "VOLUNTEER");
  assert.equal(await staff({ role: "APPLICANT" }).getStaffRole(), null);
});

test("the role comes from the verified Discord id, never edited metadata", async () => {
  const s = staff({ role: "ORGANIZER", identities: [] });
  assert.equal(await s.getStaffRole(), null);
  assert.equal(s.lookups.length, 0);
});

test("the hub gate: signed out -> sign in, not staff -> 404", async () => {
  await assert.rejects(staff({ role: "ORGANIZER", signedIn: false }).requireStaffRole(), /REDIRECT:\/auth\/signin/);
  await assert.rejects(staff({ role: "APPLICANT" }).requireStaffRole(), /NOT_FOUND/);
  assert.equal(await staff({ role: "VOLUNTEER" }).requireStaffRole(), "VOLUNTEER");
});
