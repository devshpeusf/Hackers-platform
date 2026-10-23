// Run with: node --test tests/rsvp-signed-in.test.cjs
// RSVP from the status card (PLAT-45): the signed-in counterpart to the
// emailed link. Real code against fakes — no credentials or DB writes.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(path, modules) {
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

// ---- the card ----

const { getStatusCardContent } = load("src/lib/status-card.ts", {});

test("accepted and unanswered shows the RSVP buttons", () => {
  const content = getStatusCardContent("ACCEPTED", "PENDING");
  assert.equal(content.rsvp, true);
  assert.equal(content.headline, "ACCEPTED");
  assert.match(content.body, /Confirm you're coming/);
});

test("no buttons once answered, for any other status, or when RSVP isn't known", () => {
  assert.equal(getStatusCardContent("ACCEPTED", "CONFIRMED").rsvp, undefined);
  assert.equal(getStatusCardContent("ACCEPTED", "DECLINED").rsvp, undefined);
  assert.equal(getStatusCardContent("ACCEPTED").rsvp, undefined);
  for (const status of ["SUBMITTED", "WAITLISTED", "REJECTED"]) {
    assert.equal(getStatusCardContent(status, "PENDING").rsvp, undefined, status);
  }
  assert.equal(getStatusCardContent(null).rsvp, undefined);
});

test("the dashboard passes the RSVP answer, so confirmed hackers see it there too", () => {
  const page = readFileSync("src/app/(app)/dashboard/page.tsx", "utf8");
  assert.match(page, /rsvpStatus=\{application\.rsvpStatus\}/);
  const dashboard = readFileSync("src/app/(app)/dashboard/Dashboard.tsx", "utf8");
  assert.match(dashboard, /<StatusCard status=\{status\} rsvpStatus=\{rsvpStatus\}>/);
});

// ---- recording the answer ----

function rsvpLib(app) {
  const log = { updateWhere: null, updateData: null, locked: false };
  const tx = {
    $queryRaw: async () => { log.locked = true; return app ? [{ id: app.id }] : []; },
    application: {
      updateMany: async ({ where, data }) => {
        log.updateWhere = where;
        log.updateData = data;
        const ok = app && where.id === app.id && app.status === where.status
          && app.rsvpStatus === where.rsvpStatus && app.eventStart > where.event.startDate.gt;
        if (ok) Object.assign(app, data);
        return { count: ok ? 1 : 0 };
      },
      findUnique: async () => (app ? { status: app.status, rsvpStatus: app.rsvpStatus } : null),
    },
  };
  const lib = load("src/lib/rsvp.ts", {
    "server-only": {},
    "node:crypto": require("node:crypto"),
    "@/lib/prisma": { prisma: { $transaction: async (fn) => fn(tx) } },
  });
  return { ...lib, log };
}

const future = () => new Date(Date.now() + 86400000);

test("confirms an accepted, unanswered application, under the row lock", async () => {
  const app = { id: "app-a", status: "ACCEPTED", rsvpStatus: "PENDING", eventStart: future() };
  const { recordSignedInRsvpResponse, log } = rsvpLib(app);
  assert.equal((await recordSignedInRsvpResponse("app-a", "CONFIRMED")).status, "CONFIRMED");
  assert.equal(app.rsvpStatus, "CONFIRMED");
  assert.ok(log.locked);
  assert.equal(Object.prototype.toString.call(log.updateData.rsvpRespondedAt), "[object Date]");
});

test("the write itself requires accepted, pending, and the event not started", async () => {
  const app = { id: "app-a", status: "ACCEPTED", rsvpStatus: "PENDING", eventStart: future() };
  const { recordSignedInRsvpResponse, log } = rsvpLib(app);
  await recordSignedInRsvpResponse("app-a", "DECLINED");
  assert.equal(log.updateWhere.status, "ACCEPTED");
  assert.equal(log.updateWhere.rsvpStatus, "PENDING");
  assert.ok(log.updateWhere.event.startDate.gt);
});

test("the first answer is final, whichever way it came", async () => {
  const app = { id: "app-a", status: "ACCEPTED", rsvpStatus: "CONFIRMED", eventStart: future() };
  const { recordSignedInRsvpResponse } = rsvpLib(app);
  assert.equal((await recordSignedInRsvpResponse("app-a", "DECLINED")).status, "CONFIRMED");
  assert.equal(app.rsvpStatus, "CONFIRMED");
});

test("not accepted, event started, or missing: unavailable and unchanged", async () => {
  for (const app of [
    { id: "app-a", status: "WAITLISTED", rsvpStatus: "PENDING", eventStart: future() },
    { id: "app-a", status: "ACCEPTED", rsvpStatus: "PENDING", eventStart: new Date(Date.now() - 1000) },
  ]) {
    const { recordSignedInRsvpResponse } = rsvpLib(app);
    assert.equal((await recordSignedInRsvpResponse("app-a", "CONFIRMED")).status, "UNAVAILABLE");
    assert.equal(app.rsvpStatus, "PENDING");
  }
  const { recordSignedInRsvpResponse } = rsvpLib(null);
  assert.equal((await recordSignedInRsvpResponse("app-x", "CONFIRMED")).status, "UNAVAILABLE");
});

test("only CONFIRMED or DECLINED are accepted as answers", async () => {
  const app = { id: "app-a", status: "ACCEPTED", rsvpStatus: "PENDING", eventStart: future() };
  const { recordSignedInRsvpResponse, log } = rsvpLib(app);
  for (const choice of ["PENDING", "ACCEPTED", "", null, "confirmed"]) {
    assert.equal((await recordSignedInRsvpResponse("app-a", choice)).status, "INVALID_CHOICE");
  }
  assert.equal(log.updateWhere, null);
});

// ---- the action: whose RSVP comes from the session only ----

function action({ identities, application = { id: "app-own" } }) {
  const log = { findWhere: null, recorded: null };
  const exports = load("src/app/rsvp/signed-in-actions.ts", {
    "next/cache": { revalidatePath: () => {} },
    "@/lib/prisma": { prisma: { application: { findFirst: async ({ where }) => { log.findWhere = where; return application; } } } },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: {
      id: "sb-1", user_metadata: { provider_id: "discord-victim" }, identities,
    } } }) } }) },
    "@/lib/supabase/user": load("src/lib/supabase/user.ts", {}),
    "@/lib/rsvp": { recordSignedInRsvpResponse: async (id, choice) => { log.recorded = { id, choice }; return { status: choice }; } },
  });
  return { ...exports, log };
}

function form(fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

test("answers for the signed-in hacker's own application", async () => {
  const { respondToRsvpSignedIn, log } = action({ identities: [{ provider: "discord", identity_data: { sub: "discord-me" } }] });
  const result = await respondToRsvpSignedIn({ status: "PENDING" }, form({ choice: "CONFIRMED" }));
  assert.equal(result.status, "CONFIRMED");
  assert.equal(log.findWhere.person.discordId, "discord-me");
  assert.deepEqual(plain(log.recorded), { id: "app-own", choice: "CONFIRMED" });
});

test("ids or tokens in the form are ignored, and edited metadata doesn't pick the person", async () => {
  const { respondToRsvpSignedIn, log } = action({ identities: [{ provider: "discord", identity_data: { sub: "discord-me" } }] });
  await respondToRsvpSignedIn({ status: "PENDING" }, form({ choice: "DECLINED", applicationId: "app-victim", token: "x" }));
  assert.equal(log.findWhere.person.discordId, "discord-me");
  assert.equal(log.recorded.id, "app-own");
});

test("no verified identity: nothing is looked up or recorded", async () => {
  const { respondToRsvpSignedIn, log } = action({ identities: [] });
  const result = await respondToRsvpSignedIn({ status: "PENDING" }, form({ choice: "CONFIRMED" }));
  assert.equal(result.status, "UNAVAILABLE");
  assert.equal(log.findWhere, null);
  assert.equal(log.recorded, null);
});
