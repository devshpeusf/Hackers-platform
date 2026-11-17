// Run with: node --test tests/profile.test.cjs
// Profile editing: the application's own rules, only the hacker's own record,
// and email/school can't be changed from the form.
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
const plain = (x) => JSON.parse(JSON.stringify(x));

const schema = load("src/lib/application-schema.ts", { zod: require("zod") });
const profile = load("src/lib/profile.ts", { zod: require("zod"), "@/lib/application-schema": schema });

const nextYear = new Date().getFullYear() + 1;
const valid = {
  firstName: " Ana ", lastName: "Garcia", phone: "(813) 555-0100", gender: "Woman",
  major: "Computer Science", graduation: `${nextYear}-05`, shirtSize: "M",
};
const form = (over = {}) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ ...valid, ...over })) if (v !== undefined) fd.set(k, v);
  return fd;
};

test("a valid profile parses, trimmed, with only the editable fields", () => {
  const result = profile.parseProfileForm(form({ email: "evil@example.com", school: "Elsewhere" }), `${nextYear}-05`);
  assert.equal(result.ok, true);
  assert.deepEqual(plain(result.data), { ...valid, firstName: "Ana" });
});

test("bad values are rejected per field, with the application's messages", () => {
  const result = profile.parseProfileForm(form({ firstName: "  ", phone: "call me", shirtSize: "XXXXL", gender: "Robot" }), null);
  assert.equal(result.ok, false);
  assert.deepEqual(Object.keys(result.errors).sort(), ["firstName", "gender", "phone", "shirtSize"]);
  assert.equal(result.errors.phone, "Enter a valid phone number");
});

test("gender is optional; empty means not answered", () => {
  const result = profile.parseProfileForm(form({ gender: "" }), `${nextYear}-05`);
  assert.equal(result.ok, true);
  assert.equal(result.data.gender, null);
});

test("an unchanged past graduation still saves; a changed one must be in the future", () => {
  assert.equal(profile.parseProfileForm(form({ graduation: "2020-05" }), "2020-05").ok, true);
  const changed = profile.parseProfileForm(form({ graduation: "2020-06" }), "2020-05");
  assert.equal(changed.errors.graduation, "That date is in the past");
  assert.equal(profile.parseProfileForm(form({ graduation: "" }), "2020-05").errors.graduation, "Pick a month and year");
  assert.equal(profile.parseProfileForm(form({ graduation: "2030" }), null).errors.graduation, "Pick a month and year");
});

test("email and school are not editable fields", () => {
  assert.deepEqual(plain(profile.PROFILE_FIELDS), ["firstName", "lastName", "phone", "gender", "major", "graduation", "shirtSize"]);
});

function loadAction({ updateError = null } = {}) {
  const writes = [];
  const revalidated = [];
  const actions = load("src/app/(app)/profile/actions.ts", {
    "next/cache": { revalidatePath: (p) => revalidated.push(p) },
    "@/lib/prisma": { prisma: { application: { update: async (args) => {
      if (updateError) throw updateError;
      writes.push(plain(args));
      return {};
    } } } },
    "@/lib/current-hacker": { getCurrentHacker: async () => ({ application: { id: "own-app", graduation: `${nextYear}-05` } }) },
    "@/lib/profile": profile,
  });
  return { ...actions, writes, revalidated };
}

test("saving writes only the session's own application and person", async () => {
  const s = loadAction();
  const state = await s.saveProfile({ status: "idle" }, form({ applicationId: "someone-else", personId: "x", email: "evil@example.com" }));
  assert.equal(state.status, "saved");
  assert.deepEqual(s.writes, [{
    where: { id: "own-app" },
    data: {
      gender: "Woman", major: "Computer Science", graduation: `${nextYear}-05`, shirtSize: "M",
      person: { update: { firstName: "Ana", lastName: "Garcia", phoneNum: "(813) 555-0100" } },
    },
  }]);
  assert.deepEqual(plain(s.revalidated), ["/profile", "/dashboard"]);
});

test("invalid input saves nothing and says which fields", async () => {
  const s = loadAction();
  const state = plain(await s.saveProfile({ status: "idle" }, form({ major: "" })));
  assert.equal(state.status, "invalid");
  assert.deepEqual(Object.keys(state.errors), ["major"]);
  assert.equal(s.writes.length, 0);
});

test("a database failure is reported, not thrown", async () => {
  const s = loadAction({ updateError: new Error("db down") });
  const original = console.error;
  console.error = () => {};
  try {
    assert.equal((await s.saveProfile({ status: "idle" }, form())).status, "error");
  } finally {
    console.error = original;
  }
});
