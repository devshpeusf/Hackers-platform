// Run with: node --test tests/check-in.test.cjs
// The badge scanner: who gets through, "already scanned", meals and workshops
// only after check-in, and that the database (not a read) stops double scans.
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

const rules = load("src/lib/scan-rules.ts");
const { evaluateScan } = rules;

const subject = (over = {}) => ({
  sameEvent: true, status: "ACCEPTED", rsvpStatus: "CONFIRMED", isMinor: false, checkedInAt: null, alreadyAt: null, ...over,
});
const T = new Date("2026-11-21T14:00:00Z");

// --- The rules ---------------------------------------------------------------

test("check-in: an accepted, confirmed adult goes straight through", () => {
  assert.deepEqual(plain(evaluateScan("CHECK_IN", subject())), { outcome: "ok", warnings: [] });
});

test("check-in: unknown, other-event, not accepted and declined badges are blocked", () => {
  assert.equal(evaluateScan("CHECK_IN", null).reason, "unknown");
  assert.equal(evaluateScan("CHECK_IN", subject({ sameEvent: false })).reason, "other_event");
  for (const status of ["SUBMITTED", "WAITLISTED", "REJECTED"]) {
    assert.equal(evaluateScan("CHECK_IN", subject({ status })).reason, "not_accepted", status);
  }
  assert.equal(evaluateScan("CHECK_IN", subject({ rsvpStatus: "DECLINED" })).reason, "declined");
});

test("check-in: minors and missing RSVPs get a warning, not a block", () => {
  assert.deepEqual(plain(evaluateScan("CHECK_IN", subject({ isMinor: true }))), { outcome: "warning", warnings: ["minor"] });
  assert.deepEqual(plain(evaluateScan("CHECK_IN", subject({ rsvpStatus: "PENDING" }))), { outcome: "warning", warnings: ["no_rsvp"] });
});

test("a second scan is blocked as already scanned", () => {
  assert.equal(evaluateScan("CHECK_IN", subject({ checkedInAt: T, alreadyAt: T })).reason, "already_scanned");
  assert.equal(evaluateScan("MEAL", subject({ checkedInAt: T, alreadyAt: T })).reason, "already_scanned");
});

test("meals and workshops need check-in first, and don't repeat door warnings", () => {
  for (const target of ["MEAL", "WORKSHOP"]) {
    assert.equal(evaluateScan(target, subject()).reason, "not_checked_in", target);
    assert.deepEqual(plain(evaluateScan(target, subject({ checkedInAt: T, isMinor: true, rsvpStatus: "PENDING" }))), { outcome: "ok", warnings: [] });
  }
});

test("status is checked before anything else, so a revoked hacker can't eat", () => {
  assert.equal(evaluateScan("MEAL", subject({ status: "REJECTED", checkedInAt: T })).reason, "not_accepted");
});

test("only real badge tokens are looked up", () => {
  assert.equal(rules.looksLikeBadgeToken("A".repeat(43)), true);
  assert.equal(rules.looksLikeBadgeToken("abc_-".repeat(8) + "xyz"), true);
  assert.equal(rules.looksLikeBadgeToken("A".repeat(42)), false);
  assert.equal(rules.looksLikeBadgeToken("https://example.com/" + "A".repeat(23)), false);
  assert.equal(rules.looksLikeBadgeToken(""), false);
});

test("checkpoint names and kinds are validated", () => {
  assert.equal(rules.parseCheckpointName("  Saturday   lunch "), "Saturday lunch");
  assert.equal(rules.parseCheckpointName("   "), null);
  assert.equal(rules.parseCheckpointName("x".repeat(61)), null);
  assert.equal(rules.parseCheckpointName(null), null);
  assert.equal(rules.parseCheckpointKind("MEAL"), "MEAL");
  assert.equal(rules.parseCheckpointKind("WORKSHOP"), "WORKSHOP");
  assert.equal(rules.parseCheckpointKind("CHECK_IN"), null);
});

// --- scan(), against a fake database ----------------------------------------

class KnownError extends Error {
  constructor(message, { code }) { super(message); this.code = code; }
}

const TOKEN = "B".repeat(43);

function setup({ app: appOver = {}, checkpoints = [{ id: "lunch", eventId: "ev", kind: "MEAL" }], scans = [] } = {}) {
  const app = {
    id: "app-1", eventId: "ev", status: "ACCEPTED", rsvpStatus: "CONFIRMED", isMinor: false,
    checkedInAt: null, checkedInById: null, school: "USF", diet: null, badgeToken: TOKEN,
    person: { firstName: "Ana", lastName: "Garcia", discordUsername: "ana" }, ...appOver,
  };
  const staff = { s1: "Sam", s2: "Lee" };
  const db = { app, scans: [...scans], lookups: [] };
  const prisma = {
    event: { findFirst: async () => ({ id: "ev", name: "HackJam" }) },
    checkpoint: { findFirst: async ({ where }) => checkpoints.find((c) => c.id === where.id && c.eventId === where.eventId) ?? null },
    application: {
      findUnique: async ({ where }) => {
        db.lookups.push(plain(where));
        const match = (where.badgeToken && where.badgeToken === app.badgeToken) || where.id === app.id;
        if (!match) return null;
        return { ...app, checkedInBy: app.checkedInById ? { firstName: staff[app.checkedInById] } : null };
      },
      updateMany: async ({ where, data }) => {
        if (where.id !== app.id || app.checkedInAt !== null) return { count: 0 };
        Object.assign(app, data);
        return { count: 1 };
      },
    },
    scan: {
      findUnique: async ({ where }) => {
        const { checkpointId, applicationId } = where.checkpointId_applicationId;
        const row = db.scans.find((s) => s.checkpointId === checkpointId && s.applicationId === applicationId);
        return row ? { createdAt: row.createdAt, scannedBy: { firstName: staff[row.scannedById] } } : null;
      },
      create: async ({ data }) => {
        if (db.scans.some((s) => s.checkpointId === data.checkpointId && s.applicationId === data.applicationId)) {
          throw new KnownError("Unique constraint", { code: "P2002" });
        }
        db.scans.push({ ...data, createdAt: new Date() });
        return {};
      },
    },
  };
  const lib = load("src/lib/check-in.ts", {
    "server-only": {}, "@/lib/prisma": { prisma },
    "@/generated/prisma/client": { Prisma: { PrismaClientKnownRequestError: KnownError } },
    "@/lib/scan-rules": rules,
  });
  return { ...lib, db, prisma };
}

test("scan: checking in records who and when, and shows the hacker", async () => {
  const s = setup();
  const result = plain(await s.scan({ mode: "CHECK_IN", badge: ` ${TOKEN}\n`, staffId: "s1" }));
  assert.equal(result.outcome, "ok");
  assert.deepEqual(result.hacker, { name: "Ana Garcia", discordUsername: "ana", school: "USF", diet: null });
  assert.ok(!Number.isNaN(new Date(s.db.app.checkedInAt).getTime()), "check-in time recorded");
  assert.equal(s.db.app.checkedInById, "s1");
});

test("scan: the same badge twice says already scanned, with when and by whom", async () => {
  const s = setup();
  await s.scan({ mode: "CHECK_IN", badge: TOKEN, staffId: "s1" });
  const again = plain(await s.scan({ mode: "CHECK_IN", badge: TOKEN, staffId: "s2" }));
  assert.equal(again.outcome, "blocked");
  assert.equal(again.reason, "already_scanned");
  assert.equal(again.previous.by, "Sam");
  assert.equal(s.db.app.checkedInById, "s1", "the first scan stands");
});

test("scan: two volunteers at the same moment get one success and one already scanned", async () => {
  const s = setup();
  const [a, b] = await Promise.all([
    s.scan({ mode: "CHECK_IN", badge: TOKEN, staffId: "s1" }),
    s.scan({ mode: "CHECK_IN", badge: TOKEN, staffId: "s2" }),
  ]);
  assert.deepEqual([a.outcome, b.outcome].sort(), ["blocked", "ok"]);
  assert.equal([a, b].find((r) => r.outcome === "blocked").reason, "already_scanned");
});

test("scan: a meal needs check-in, then works once and shows the diet", async () => {
  const s = setup({ app: { diet: "Vegetarian" } });
  assert.equal((await s.scan({ mode: "lunch", badge: TOKEN, staffId: "s1" })).reason, "not_checked_in");
  assert.equal(s.db.scans.length, 0);

  await s.scan({ mode: "CHECK_IN", badge: TOKEN, staffId: "s1" });
  const lunch = plain(await s.scan({ mode: "lunch", badge: TOKEN, staffId: "s2" }));
  assert.equal(lunch.outcome, "ok");
  assert.equal(lunch.hacker.diet, "Vegetarian");
  assert.equal(s.db.scans.length, 1);

  const seconds = plain(await s.scan({ mode: "lunch", badge: TOKEN, staffId: "s1" }));
  assert.equal(seconds.reason, "already_scanned");
  assert.equal(seconds.previous.by, "Lee");
  assert.equal(s.db.scans.length, 1);
});

test("scan: a meal with no diet listed says so instead of hiding it", async () => {
  const s = setup({ app: { checkedInAt: T, checkedInById: "s1" } });
  assert.equal((await s.scan({ mode: "lunch", badge: TOKEN, staffId: "s1" })).hacker.diet, "");
});

test("scan: a meal lost to a simultaneous scan becomes already scanned", async () => {
  const s = setup({ app: { checkedInAt: T, checkedInById: "s1" } });
  const original = s.prisma.scan.findUnique;
  let first = true;
  // The rules read "not scanned yet", then someone else's scan lands first.
  s.prisma.scan.findUnique = async (args) => {
    if (first) {
      first = false;
      s.db.scans.push({ checkpointId: "lunch", applicationId: "app-1", scannedById: "s2", createdAt: T });
      return null;
    }
    return original(args);
  };
  const result = plain(await s.scan({ mode: "lunch", badge: TOKEN, staffId: "s1" }));
  assert.equal(result.reason, "already_scanned");
  assert.equal(result.previous.by, "Lee");
});

test("scan: junk QR text never reaches the database, and says not recognised", async () => {
  const s = setup();
  const result = plain(await s.scan({ mode: "CHECK_IN", badge: "https://example.com/not-a-badge", staffId: "s1" }));
  assert.equal(result.reason, "unknown");
  assert.equal(result.hacker, null);
  assert.equal(s.db.lookups.length, 0);
});

test("scan: another event's badge reveals nobody", async () => {
  const s = setup({ app: { eventId: "old-event" } });
  const result = plain(await s.scan({ mode: "CHECK_IN", badge: TOKEN, staffId: "s1" }));
  assert.equal(result.reason, "other_event");
  assert.equal(result.hacker, null);
  assert.equal(s.db.app.checkedInAt, null);
});

test("scan: a checkpoint from another event (or deleted) is refused", async () => {
  const s = setup({ checkpoints: [{ id: "lunch", eventId: "old-event", kind: "MEAL" }] });
  assert.equal((await s.scan({ mode: "lunch", badge: TOKEN, staffId: "s1" })).outcome, "error");
});

test("scan: name search picks by application id and follows the same rules", async () => {
  const s = setup({ app: { status: "WAITLISTED" } });
  const result = plain(await s.scan({ mode: "CHECK_IN", applicationId: "app-1", staffId: "s1" }));
  assert.equal(result.reason, "not_accepted");
  assert.equal(s.db.app.checkedInAt, null);
});

// --- Who can use it ----------------------------------------------------------

test("every scanner action re-checks staff access", () => {
  const actions = readFileSync("src/app/admin/check-in/actions.ts", "utf8");
  assert.match(actions, /^"use server";/);
  for (const name of ["scanBadgeAction", "scanApplicationAction", "searchHackersAction", "overviewAction"]) {
    const body = actions.slice(actions.indexOf(`export async function ${name}`));
    const end = body.indexOf("\nexport ", 1);
    assert.match(end > 0 ? body.slice(0, end) : body, /currentStaffId\(\)/, `${name} must check staff`);
  }
  assert.match(actions, /isVolunteerOrAbove\(discordId\)/);
});

test("checkpoint editing is organizer-only and scoped to the current event", () => {
  const actions = readFileSync("src/app/admin/event/actions.ts", "utf8");
  for (const name of ["addCheckpoint", "renameCheckpoint", "deleteCheckpoint"]) {
    const body = actions.slice(actions.indexOf(`export async function ${name}`));
    assert.match(body.slice(0, body.indexOf("\n}\n")), /await organizerEventId\(\)/, name);
  }
  assert.match(actions, /deleteMany\(\{ where: \{ id, eventId, scans: \{ none: \{\} \} \} \}\)/);
  assert.match(actions, /updateMany\(\{ where: \{ id, eventId \}/);
});
