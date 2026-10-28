// Run with: node --test tests/broadcast.test.cjs
// Announcements (/admin/email): formatting, audiences, the recipient
// snapshot, the sender's quota handling, and organizer-only actions.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(path, modules = {}) {
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const context = { exports: {}, setTimeout, require: (name) => {
    assert.ok(name in modules, `Unexpected dependency: ${name}`);
    return modules[name];
  } };
  vm.runInNewContext(compiled, context);
  return context.exports;
}
const plain = (x) => JSON.parse(JSON.stringify(x));
const fmt = load("src/lib/broadcast-format.ts");

// ---- formatting ----

test("bold, bullets, links and paragraphs parse into plain data", () => {
  const blocks = plain(fmt.parseMessage("Hi **all**\nline two\n\n- one\n- **two**\n\nSee https://discord.gg/x."));
  assert.equal(blocks.length, 3);
  assert.deepEqual(blocks[0], { kind: "paragraph", lines: [[{ kind: "text", text: "Hi " }, { kind: "bold", text: "all" }], [{ kind: "text", text: "line two" }]] });
  assert.deepEqual(blocks[1], { kind: "list", items: [[{ kind: "text", text: "one" }], [{ kind: "bold", text: "two" }]] });
  assert.deepEqual(blocks[2].lines[0], [{ kind: "text", text: "See " }, { kind: "link", href: "https://discord.gg/x" }, { kind: "text", text: "." }]);
});

test("HTML stays text and only http(s) links are made clickable", () => {
  const blocks = plain(fmt.parseMessage('<script>alert(1)</script> <a href="x">x</a> javascript:alert(1) data:text/html,hi'));
  const runs = blocks[0].lines[0];
  assert.ok(runs.every((r) => r.kind === "text"), "nothing became a link or markup");
  assert.match(runs.map((r) => r.text).join(""), /<script>/);
});

test("subject and message are required and capped", () => {
  assert.equal(fmt.validateMessage("", "x").ok, false);
  assert.equal(fmt.validateMessage("Hi", "  ").ok, false);
  assert.equal(fmt.validateMessage("x".repeat(fmt.SUBJECT_MAX + 1), "x").ok, false);
  assert.equal(fmt.validateMessage("Hi", "x".repeat(fmt.BODY_MAX + 1)).ok, false);
  assert.deepEqual(plain(fmt.validateMessage("  Parking   update ", " body ")), { ok: true, subject: "Parking update", body: "body" });
});

// ---- audiences & the snapshot ----

function broadcastLib(apps, { eventId = "ev-26" } = {}) {
  const created = { broadcasts: [], recipients: [] };
  const matches = (a, where) =>
    a.eventId === where.eventId &&
    (where.status === undefined || a.status === where.status) &&
    (where.source === undefined || a.source === where.source) &&
    (where.rsvpStatus === undefined || (typeof where.rsvpStatus === "string" ? a.rsvpStatus === where.rsvpStatus : where.rsvpStatus.in.includes(a.rsvpStatus))) &&
    (where.teamId === undefined || a.teamId != null);
  const client = {
    application: {
      count: async ({ where }) => apps.filter((a) => matches(a, where)).length,
      findMany: async ({ where }) => apps.filter((a) => matches(a, where)).map((a) => ({ id: a.id })),
    },
    broadcast: { create: async ({ data }) => { created.broadcasts.push(data); return { id: "b1" }; } },
    broadcastRecipient: { createMany: async ({ data }) => { created.recipients.push(...data); return { count: data.length }; } },
  };
  const prisma = { ...client, event: { findFirst: async () => (eventId ? { id: eventId } : null) }, $transaction: (fn) => fn(client) };
  return { created, lib: load("src/lib/broadcast.ts", { "server-only": {}, "@/lib/prisma": { prisma } }) };
}

const A = (id, extra) => ({ id, eventId: "ev-26", status: "ACCEPTED", rsvpStatus: "PENDING", source: "ONLINE", teamId: null, ...extra });
const people = [
  A("pending"),
  A("confirmed", { rsvpStatus: "CONFIRMED", teamId: "t1" }),
  A("declined", { rsvpStatus: "DECLINED" }),
  A("waitlisted", { status: "WAITLISTED" }),
  A("walkin", { source: "WALK_IN", status: "SUBMITTED" }),
  A("last-year", { eventId: "ev-25" }),
];

test("each audience reaches exactly who it says, on the current event only", async () => {
  const { lib } = broadcastLib(people);
  const counts = plain(await lib.audienceCounts());
  assert.deepEqual(counts, {
    ACCEPTED_ALL: 2, // declined excluded
    ACCEPTED_CONFIRMED: 1,
    ACCEPTED_PENDING_RSVP: 1,
    WAITLISTED: 1,
    ALL_APPLICANTS: 5, // last year's excluded
    WALK_INS: 1,
    ON_A_TEAM: 1,
  });
});

test("sending snapshots the recipients and records who sent it", async () => {
  const { lib, created } = broadcastLib(people);
  const result = await lib.createBroadcast({ sentById: "org", audience: "ACCEPTED_ALL", subject: "S", body: "B" });
  assert.equal(result.recipients, 2);
  assert.deepEqual(plain(created.recipients.map((r) => r.applicationId)).sort(), ["confirmed", "pending"]);
  assert.equal(created.broadcasts[0].sentById, "org");
  assert.equal(created.broadcasts[0].eventId, "ev-26");
});

test("an empty audience creates nothing", async () => {
  const { lib, created } = broadcastLib([A("x", { status: "SUBMITTED" })]);
  const result = await lib.createBroadcast({ sentById: "org", audience: "WAITLISTED", subject: "S", body: "B" });
  assert.equal(result.ok, false);
  assert.equal(created.broadcasts.length, 0);
});

test("only real audience names are accepted", () => {
  const { lib } = broadcastLib([]);
  assert.equal(lib.parseAudience("ACCEPTED_ALL"), "ACCEPTED_ALL");
  for (const bad of ["EVERYONE", "accepted_all", "", null]) assert.equal(lib.parseAudience(bad), null);
});

// ---- the sender ----

function sender(rows, sendBehavior) {
  const db = new Map(rows.map((r) => [r.id, { status: "PENDING", attempts: 0, lastError: null, ...r }]));
  const sentTo = [];
  const prisma = {
    $queryRaw: async () => [...db.values()].filter((r) => r.status === "PENDING").map((r) => { r.status = "SENDING"; return { id: r.id }; }),
    broadcastRecipient: {
      count: async () => [...db.values()].filter((r) => r.status === "PENDING").length,
      findMany: async ({ where }) => where.id.in.map((id) => {
        const r = db.get(id);
        return { id, attempts: r.attempts, broadcast: { subject: "S", body: "B", event: { name: "HackJam '26" } }, application: { person: { firstName: "M", email: `${id}@x.test` } } };
      }),
      update: async ({ where, data }) => Object.assign(db.get(where.id), data),
      updateMany: async ({ where, data }) => { for (const id of where.id.in) Object.assign(db.get(id), data); },
    },
  };
  const lib = load("src/lib/broadcast-sender.ts", {
    "server-only": {},
    "@/lib/prisma": { prisma },
    "@/lib/email": { sendEmail: async ({ to }) => { sentTo.push(to); await sendBehavior(to); } },
    "@emails/AnnouncementEmail": { __esModule: true, default: () => null },
  });
  return { db, sentTo, lib };
}

test("sends, marks SENT, and reports what's left", async () => {
  const { db, lib } = sender([{ id: "r1" }, { id: "r2" }], async () => {});
  const result = await lib.sendBroadcastBatch(10);
  assert.equal(result.sent, 2);
  assert.equal(db.get("r1").status, "SENT");
  assert.equal(result.remaining, 0);
});

test("hitting the daily cap stops the run and releases the rest without using attempts", async () => {
  const { db, lib, sentTo } = sender([{ id: "r1" }, { id: "r2" }, { id: "r3" }], async (to) => {
    if (to.startsWith("r2")) throw { name: "daily_quota_exceeded", message: "cap" };
  });
  const result = await lib.sendBroadcastBatch(10);
  assert.equal(result.quotaHit, true);
  assert.equal(db.get("r1").status, "SENT");
  assert.equal(db.get("r2").status, "PENDING");
  assert.equal(db.get("r3").status, "PENDING");
  assert.equal(db.get("r2").attempts, 0);
  assert.equal(sentTo.length, 2, "r3 was never attempted");
});

test("a real failure uses an attempt, and the third one marks it FAILED", async () => {
  const { db, lib } = sender([{ id: "r1", attempts: 2 }], async () => { throw new Error("bad address"); });
  await lib.sendBroadcastBatch(10);
  assert.equal(db.get("r1").status, "FAILED");
  assert.equal(db.get("r1").attempts, 3);
});

test("a batch of zero sends nothing", async () => {
  const { lib, sentTo } = sender([{ id: "r1" }], async () => {});
  await lib.sendBroadcastBatch(0);
  assert.equal(sentTo.length, 0);
});

test("the send job gives announcements only what transactional email leaves, and nothing after a cap hit", () => {
  const route = readFileSync("src/app/api/jobs/send-queued/route.ts", "utf8");
  assert.match(route, /if \(rateOrQuota\) quotaHit = true;/);
  assert.match(route, /quotaHit\s*\?\s*await sendBroadcastBatch\(0\)\s*:\s*await sendBroadcastBatch\(batchSize - rows\.length\)/);
});

// ---- actions: organizer-only, recipients never from the form ----

function actions(role, email = "me@x.test") {
  const calls = { created: [], sent: [] };
  const exports = load("src/app/admin/email/actions.ts", {
    "next/cache": { revalidatePath: () => {} },
    "@react-email/render": { render: async () => "<html>preview</html>" },
    "@/lib/prisma": { prisma: {
      person: { findUnique: async () => (role ? { id: "me", role, firstName: "Me", email } : null) },
      event: { findFirst: async () => ({ name: "HackJam '26" }) },
    } },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: {
      id: "sb", user_metadata: {}, identities: [{ provider: "discord", identity_data: { sub: "discord-me" } }],
    } } }) } }) },
    "@/lib/supabase/user": load("src/lib/supabase/user.ts"),
    "@/lib/email": { sendEmail: async (args) => { calls.sent.push(args.to); } },
    "@/lib/broadcast": {
      createBroadcast: async (input) => { calls.created.push(input); return { ok: true, recipients: 3 }; },
      parseAudience: (raw) => (raw === "ACCEPTED_ALL" ? raw : null),
    },
    "@/lib/broadcast-format": fmt,
    "@emails/AnnouncementEmail": { __esModule: true, default: () => null },
  });
  return { ...exports, calls };
}

function form(fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

const fields = { audience: "ACCEPTED_ALL", subject: "Parking", body: "Lot 18", to: "victim@evil.test", emails: "a@b.c" };

test("volunteers, applicants and strangers can't preview, test or send", async () => {
  for (const role of ["VOLUNTEER", "APPLICANT", null]) {
    const a = actions(role);
    for (const fn of [a.previewAction, a.sendTestAction, a.sendBroadcastAction]) {
      assert.equal((await fn({ status: "idle" }, form(fields))).status, "error", String(role));
    }
    assert.equal(a.calls.created.length + a.calls.sent.length, 0);
  }
});

test("a test email only ever goes to the organizer's own address", async () => {
  const a = actions("ORGANIZER");
  const result = await a.sendTestAction({ status: "idle" }, form(fields));
  assert.equal(result.status, "ok");
  assert.deepEqual(plain(a.calls.sent), ["me@x.test"]);
});

test("sending queues by audience name; addresses in the form are ignored", async () => {
  const a = actions("ORGANIZER");
  const result = await a.sendBroadcastAction({ status: "idle" }, form(fields));
  assert.equal(result.status, "ok");
  assert.deepEqual(plain(a.calls.created[0]), { sentById: "me", audience: "ACCEPTED_ALL", subject: "Parking", body: "Lot 18" });
  assert.equal(a.calls.sent.length, 0, "nothing sent directly");
});

test("a made-up audience is refused", async () => {
  const a = actions("ORGANIZER");
  const result = await a.sendBroadcastAction({ status: "idle" }, form({ ...fields, audience: "EVERYONE_EVER" }));
  assert.equal(result.status, "error");
  assert.equal(a.calls.created.length, 0);
});

test("the page is organizer-only and its hub card is live", () => {
  assert.match(readFileSync("src/app/admin/email/page.tsx", "utf8"), /await requireOrganizer\(\)/);
  const tools = load("src/lib/admin-tools.ts");
  const card = tools.ADMIN_TOOLS.find((t) => t.href === "/admin/email");
  assert.equal(card.soon, undefined);
  assert.equal(card.access, "organizer");
});
