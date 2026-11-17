// Run with: node --test tests/walk-in.test.cjs
// Registering and admitting at the door: whoever is admitted there is also
// confirmed and checked in, so the scanner shows them green straight away.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(path, modules = {}) {
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const context = { exports: {}, URLSearchParams, require: (name) => {
    assert.ok(name in modules, `Unexpected dependency: ${name}`);
    return modules[name];
  } };
  vm.runInNewContext(compiled, context);
  return context.exports;
}
const plain = (x) => JSON.parse(JSON.stringify(x));

const walkIns = load("src/lib/walk-ins.ts", { "node:crypto": require("node:crypto") });
const NOW = new Date("2026-11-21T14:00:00Z");
const EARLIER = new Date("2026-11-21T13:00:00Z");

// --- The rules ---------------------------------------------------------------

test("admitting at the door accepts, confirms and checks in", () => {
  assert.deepEqual(plain(walkIns.admitAtDoorChanges({ status: "REJECTED", rsvpStatus: "PENDING", checkedInAt: null }, "staff", NOW)), {
    status: "ACCEPTED", decidedById: "staff", decidedAt: NOW.toISOString(),
    rsvpStatus: "CONFIRMED", rsvpRespondedAt: NOW.toISOString(),
    checkedInAt: NOW.toISOString(), checkedInById: "staff",
  });
});

test("someone who declined but showed up is confirmed, so the scanner won't block them", () => {
  const changes = plain(walkIns.admitAtDoorChanges({ status: "ACCEPTED", rsvpStatus: "DECLINED", checkedInAt: null }, "staff", NOW));
  assert.equal(changes.rsvpStatus, "CONFIRMED");
  assert.equal(changes.status, undefined, "an existing acceptance keeps its original decider");
});

test("an earlier check-in keeps its time and volunteer; nothing left means no write", () => {
  const changes = plain(walkIns.admitAtDoorChanges({ status: "ACCEPTED", rsvpStatus: "PENDING", checkedInAt: EARLIER }, "staff", NOW));
  assert.deepEqual(Object.keys(changes), ["rsvpStatus", "rsvpRespondedAt"]);
  assert.equal(walkIns.admitAtDoorChanges({ status: "ACCEPTED", rsvpStatus: "CONFIRMED", checkedInAt: EARLIER }, "staff", NOW), null);
});

test("fully admitted means accepted, confirmed, checked in and badged", () => {
  const done = { status: "ACCEPTED", rsvpStatus: "CONFIRMED", checkedInAt: EARLIER, badgeToken: "t" };
  assert.equal(walkIns.fullyAdmitted(done), true);
  assert.equal(walkIns.fullyAdmitted({ ...done, checkedInAt: null }), false);
  assert.equal(walkIns.fullyAdmitted({ ...done, rsvpStatus: "DECLINED" }), false);
  assert.equal(walkIns.fullyAdmitted({ ...done, badgeToken: null }), false);
  assert.equal(walkIns.fullyAdmitted({ ...done, status: "WAITLISTED" }), false);
});

// --- The actions, against a fake database ------------------------------------

function setup({ staff = true, people = [], applications = [] } = {}) {
  const db = { people: [...people], applications: [...applications], badges: [], redirect: null };
  let n = 0;
  const tx = {
    person: {
      create: async ({ data }) => { const row = { id: `person-${++n}`, ...data }; db.people.push(row); return { id: row.id }; },
    },
    application: {
      create: async ({ data }) => { const row = { id: `app-${++n}`, ...data }; db.applications.push(row); return { id: row.id }; },
      findUnique: async ({ where }) => db.applications.find((a) => a.id === where.id) ?? null,
      update: async ({ where, data }) => Object.assign(db.applications.find((a) => a.id === where.id), data),
    },
  };
  const prisma = {
    ...tx,
    person: {
      findUnique: async ({ where }) => {
        if (where.discordId) return where.discordId === "discord-staff" ? { id: "staff-1" } : null;
        const person = db.people.find((p) => p.email === where.email);
        return person && { id: person.id, applications: db.applications.filter((a) => a.personId === person.id).map((a) => ({ id: a.id, eventId: a.eventId })) };
      },
    },
    event: { findFirst: async () => ({ id: "ev" }) },
    $transaction: async (fn) => fn(tx),
  };
  const actions = load("src/app/admin/walk-in/actions.ts", {
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": { redirect: (url) => { db.redirect = url; throw new Error("REDIRECT"); } },
    "@/lib/prisma": { prisma },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u" } } }) } }) },
    "@/lib/supabase/user": { toApplicantIdentity: () => ({ discordId: "discord-staff" }) },
    "@/lib/volunteer": { isVolunteerOrAbove: async () => staff },
    "@/lib/badge": { ensureBadgeToken: async (id) => { db.badges.push(id); } },
    "@/lib/walk-ins": walkIns,
  });
  return { ...actions, db };
}

function walkInForm(over = {}) {
  const fd = new FormData();
  const fields = {
    firstName: "Sam", lastName: "Rivera", email: " Sam@Example.com ", phoneNum: "8135550100", school: "USF",
    isMinor: "no", agreedCodeOfConduct: "on", agreedDataSharing: "on", ...over,
  };
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) fd.set(k, v);
  return fd;
}

test("a new walk-in is admitted, confirmed, checked in and badged by the volunteer", async () => {
  const s = setup();
  await assert.rejects(s.registerWalkIn(walkInForm()), /REDIRECT/);
  const [app] = s.db.applications;
  assert.equal(app.source, "WALK_IN");
  assert.equal(app.status, "ACCEPTED");
  assert.equal(app.rsvpStatus, "CONFIRMED");
  assert.equal(app.checkedInById, "staff-1");
  assert.ok(app.checkedInAt);
  assert.deepEqual(plain(s.db.badges), [app.id]);
  assert.equal(s.db.people[0].email, "sam@example.com");
  assert.match(s.db.people[0].discordId, /^walkin:/);
  assert.equal(s.db.redirect, `/admin/walk-in?registered=${app.id}`);
});

test("missing consent registers nobody", async () => {
  const s = setup();
  await assert.rejects(s.registerWalkIn(walkInForm({ agreedDataSharing: undefined })), /REDIRECT/);
  assert.equal(s.db.applications.length, 0);
  assert.equal(s.db.redirect, "/admin/walk-in?error=invalid");
});

test("someone already on file isn't duplicated; ADMIT fixes their record instead", async () => {
  const s = setup({
    people: [{ id: "p1", email: "sam@example.com" }],
    applications: [{ id: "a1", personId: "p1", eventId: "ev", status: "ACCEPTED", rsvpStatus: "DECLINED", checkedInAt: null }],
  });
  await assert.rejects(s.registerWalkIn(walkInForm()), /REDIRECT/);
  assert.equal(s.db.redirect, "/admin/walk-in?found=a1");
  assert.equal(s.db.applications.length, 1);

  const fd = new FormData();
  fd.set("applicationId", "a1");
  await assert.rejects(s.admitExisting(fd), /REDIRECT/);
  const app = s.db.applications[0];
  assert.equal(app.rsvpStatus, "CONFIRMED");
  assert.equal(app.checkedInById, "staff-1");
  assert.deepEqual(plain(s.db.badges), ["a1"]);
  assert.equal(s.db.redirect, "/admin/walk-in?admitted=a1");
});

test("ADMIT ignores an application from another event", async () => {
  const s = setup({ applications: [{ id: "old", personId: "p1", eventId: "old-event", status: "REJECTED", rsvpStatus: "PENDING", checkedInAt: null }] });
  const fd = new FormData();
  fd.set("applicationId", "old");
  await s.admitExisting(fd);
  assert.equal(s.db.applications[0].status, "REJECTED");
  assert.equal(s.db.badges.length, 0);
  assert.equal(s.db.redirect, null);
});

test("non-staff can't register or admit", async () => {
  const s = setup({ staff: false, applications: [{ id: "a1", personId: "p1", eventId: "ev", status: "REJECTED", rsvpStatus: "PENDING", checkedInAt: null }] });
  await s.registerWalkIn(walkInForm());
  const fd = new FormData();
  fd.set("applicationId", "a1");
  await s.admitExisting(fd);
  assert.equal(s.db.applications.length, 1);
  assert.equal(s.db.applications[0].status, "REJECTED");
});
