// Run with: node --test tests/bulk-decide.test.cjs
// Bulk deciding: the selection rule, and the real server action against an
// in-memory fake database. No credentials or DB writes.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(path, modules) {
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  // Web globals the real server runtime provides.
  const context = { exports: {}, URLSearchParams, require: (name) => {
    assert.ok(name in modules, `Unexpected dependency: ${name}`);
    return modules[name];
  } };
  vm.runInNewContext(compiled, context);
  return context.exports;
}

// Arrays built inside the vm sandbox fail strict deepEqual against this
// realm's arrays even when identical, so compare plain copies.
const plain = (x) => JSON.parse(JSON.stringify(x));

const decisions = load("src/lib/decisions.ts", {});
const userLib = load("src/lib/supabase/user.ts", {});

const sent = (type) => [{ emailType: type, status: "SENT", sentAt: new Date() }];

// ---- the rule ----

test("planBulkDecision splits a selection into change / unchanged / locked", () => {
  const plan = decisions.planBulkDecision(
    [
      { id: "new", status: "SUBMITTED", emailQueue: [] },
      { id: "same", status: "ACCEPTED", emailQueue: [] },
      { id: "emailed", status: "REJECTED", emailQueue: sent("REJECTED") },
      { id: "decided-not-emailed", status: "WAITLISTED", emailQueue: [] },
      { id: "failed-send", status: "REJECTED", emailQueue: [{ emailType: "REJECTED", status: "FAILED", sentAt: null }] },
    ],
    "ACCEPTED",
  );
  assert.deepEqual(plain(plan.toChange.map((a) => a.id)), ["new", "decided-not-emailed", "failed-send"]);
  assert.deepEqual(plain(plan.unchanged.map((a) => a.id)), ["same"]);
  assert.deepEqual(plain(plan.locked.map((a) => a.id)), ["emailed"]);
});

test("an email mid-send locks the row too", () => {
  const plan = decisions.planBulkDecision(
    [{ id: "sending", status: "ACCEPTED", emailQueue: [{ emailType: "ACCEPTED", status: "SENDING", sentAt: null }] }],
    "REJECTED",
  );
  assert.deepEqual(plain(plan.locked.map((a) => a.id)), ["sending"]);
});

// ---- the action ----

function setup({ organizer = true, apps } = {}) {
  const db = {
    event: { id: "event-now" },
    people: { "discord-org": { id: "person-org", role: organizer ? "ORGANIZER" : "APPLICANT" } },
    apps: apps ?? [],
  };
  const log = { transactions: 0, updateWhere: null, updateData: null, redirect: null, findWhere: null };

  const prisma = {
    person: { findUnique: async ({ where }) => db.people[where.discordId] ?? null },
    event: { findFirst: async () => db.event },
    application: {
      findMany: async ({ where }) => {
        log.findWhere = where;
        return db.apps.filter((a) => where.id.in.includes(a.id) && a.eventId === where.eventId);
      },
      updateMany: async ({ where, data }) => {
        log.updateWhere = where;
        log.updateData = data;
        let count = 0;
        for (const a of db.apps) {
          if (where.id.in.includes(a.id) && a.eventId === where.eventId && a.status !== where.status.not) {
            Object.assign(a, data);
            count++;
          }
        }
        return { count };
      },
    },
    $transaction: async (fn) => { log.transactions++; return fn(prisma); },
  };

  const actions = load("src/app/admin/applications/actions.ts", {
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": { redirect: (url) => { log.redirect = url; throw new Error("REDIRECT"); } },
    "@/lib/prisma": { prisma },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: {
      id: "sb-1",
      user_metadata: {},
      identities: [{ provider: "discord", identity_data: { sub: "discord-org" } }],
    } } }) } }) },
    "@/lib/supabase/user": userLib,
    "@/lib/decisions": decisions,
  });
  return { actions, db, log };
}

function form(fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const item of [].concat(v)) fd.append(k, item);
  return fd;
}

async function run(actions, fields) {
  try { await actions.decideApplications(form(fields)); } catch (e) { if (e.message !== "REDIRECT") throw e; }
}

const app = (id, status = "SUBMITTED", emailQueue = [], eventId = "event-now") => ({ id, status, emailQueue, eventId });

test("decides the selected applicants and records who and when", async () => {
  const { actions, db, log } = setup({ apps: [app("a"), app("b")] });
  await run(actions, { ids: ["a", "b"], decision: "ACCEPTED" });
  assert.deepEqual(plain(db.apps.map((a) => a.status)), ["ACCEPTED", "ACCEPTED"]);
  assert.equal(log.updateData.decidedById, "person-org");
  // A Date from the sandbox fails instanceof against this realm's Date.
  assert.equal(Object.prototype.toString.call(log.updateData.decidedAt), "[object Date]");
  assert.ok(Math.abs(log.updateData.decidedAt.getTime() - Date.now()) < 5000);
  assert.equal(log.transactions, 1);
  assert.match(log.redirect, /bulk=accepted&changed=2/);
});

test("non-organizers change nothing", async () => {
  const { actions, db, log } = setup({ organizer: false, apps: [app("a")] });
  await run(actions, { ids: ["a"], decision: "ACCEPTED" });
  assert.equal(db.apps[0].status, "SUBMITTED");
  assert.equal(log.transactions, 0);
});

test("ids from another event are ignored and reported", async () => {
  const { actions, db, log } = setup({ apps: [app("mine"), app("other", "SUBMITTED", [], "event-old")] });
  await run(actions, { ids: ["mine", "other"], decision: "REJECTED" });
  assert.equal(log.findWhere.eventId, "event-now");
  assert.equal(db.apps[1].status, "SUBMITTED");
  assert.match(log.redirect, /changed=1/);
  assert.match(log.redirect, /ignored=1/);
});

test("already-emailed applicants are skipped and reported, never overridden", async () => {
  const { actions, db, log } = setup({ apps: [app("fresh"), app("told", "ACCEPTED", sent("ACCEPTED"))] });
  await run(actions, { ids: ["fresh", "told"], decision: "REJECTED", override: "true" });
  assert.equal(db.apps[1].status, "ACCEPTED");
  assert.deepEqual(plain(log.updateWhere.id.in), ["fresh"]);
  assert.match(log.redirect, /skipped=1/);
});

test("the write re-checks the email lock for every decision, against a race", async () => {
  const { actions, log } = setup({ apps: [app("a")] });
  await run(actions, { ids: ["a"], decision: "WAITLISTED" });
  const guarded = log.updateWhere.NOT.OR.map((c) => c.status);
  assert.deepEqual(plain(guarded.sort()), ["ACCEPTED", "REJECTED", "WAITLISTED"]);
  for (const c of log.updateWhere.NOT.OR) {
    assert.deepEqual(plain(c.emailQueue.some.status.in), ["SENT", "SENDING"]);
    assert.equal(c.emailQueue.some.emailType, c.status);
  }
});

test("applicants already at that decision are left alone", async () => {
  const { actions, log } = setup({ apps: [app("same", "ACCEPTED")] });
  await run(actions, { ids: ["same"], decision: "ACCEPTED" });
  assert.equal(log.updateWhere, null);
  assert.match(log.redirect, /changed=0&unchanged=1/);
});

test("duplicate ids count once", async () => {
  const { actions, log } = setup({ apps: [app("a")] });
  await run(actions, { ids: ["a", "a", "a"], decision: "ACCEPTED" });
  assert.deepEqual(plain(log.updateWhere.id.in), ["a"]);
});

test("junk input changes nothing: bad decision, no ids, or over the limit", async () => {
  for (const fields of [
    { ids: ["a"], decision: "SUBMITTED" },
    { ids: ["a"], decision: "DELETE" },
    { decision: "ACCEPTED" },
    { ids: Array.from({ length: decisions.BULK_LIMIT + 1 }, (_, i) => `id-${i}`), decision: "ACCEPTED" },
  ]) {
    const { actions, db, log } = setup({ apps: [app("a")] });
    await run(actions, fields);
    assert.equal(log.transactions, 0, JSON.stringify(fields).slice(0, 60));
    assert.equal(db.apps[0].status, "SUBMITTED");
  }
});

test("returnTo can't send the organizer off-site", async () => {
  const { actions, log } = setup({ apps: [app("a")] });
  await run(actions, { ids: ["a"], decision: "ACCEPTED", returnTo: "https://evil.example/admin/applications" });
  assert.match(log.redirect, /^\/admin\/applications\?/);
});
