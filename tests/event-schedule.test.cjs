// Run with: node --test tests/event-schedule.test.cjs
// The run of show on the Event row: tolerant reading, form parsing, and the
// organizer-only save. No credentials or DB writes.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(path, modules = {}) {
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const context = { exports: {}, URL, require: (name) => {
    assert.ok(name in modules, `Unexpected dependency: ${name}`);
    return modules[name];
  } };
  vm.runInNewContext(compiled, context);
  return context.exports;
}
const plain = (x) => JSON.parse(JSON.stringify(x));

function form(rows) {
  const fd = new FormData();
  for (const [time, label, highlighted] of rows) {
    fd.append("time", time);
    fd.append("label", label);
    fd.append("highlighted", highlighted ? "true" : "false");
  }
  return fd;
}

const schedule = load("src/lib/event-schedule.ts");

// ---- reading stored JSON ----

test("valid rows read back in order", () => {
  const rows = schedule.parseSchedule([
    { time: "9:00 AM", label: "Check-in", highlighted: false },
    { time: "10:00 AM", label: "Hacking begins", highlighted: true },
  ]);
  assert.deepEqual(plain(rows), [
    { time: "9:00 AM", label: "Check-in", highlighted: false },
    { time: "10:00 AM", label: "Hacking begins", highlighted: true },
  ]);
});

test("a hand-edited typo never breaks the page — bad rows are skipped", () => {
  assert.deepEqual(plain(schedule.parseSchedule(null)), []);
  assert.deepEqual(plain(schedule.parseSchedule("not a list")), []);
  assert.deepEqual(plain(schedule.parseSchedule({ time: "9", label: "x" })), []);
  const rows = schedule.parseSchedule([
    "oops",
    null,
    { time: 900, label: "number time" },
    { time: "9:00 AM" },
    { time: "  ", label: "blank time" },
    { time: "11:00 AM", label: "Lunch", highlighted: "yes" },
  ]);
  assert.deepEqual(plain(rows), [{ time: "11:00 AM", label: "Lunch", highlighted: false }]);
});

test("stored values are trimmed and capped", () => {
  const rows = schedule.parseSchedule(
    Array.from({ length: 50 }, (_, i) => ({ time: ` ${i} `, label: "y".repeat(500) })),
  );
  assert.equal(rows.length, schedule.SCHEDULE_LIMITS.rows);
  assert.equal(rows[0].time, "0");
  assert.equal(rows[0].label.length, schedule.SCHEDULE_LIMITS.label);
});

// ---- the admin form ----

test("the form keeps on-screen order and drops fully blank lines", () => {
  const result = schedule.parseScheduleForm(form([["9:00 AM", "Check-in", false], ["", "", false], ["10:00 AM", "Hacking begins", true]]));
  assert.equal(result.ok, true);
  assert.deepEqual(plain(result.rows), [
    { time: "9:00 AM", label: "Check-in", highlighted: false },
    { time: "10:00 AM", label: "Hacking begins", highlighted: true },
  ]);
});

test("a half-filled row is an error naming the row", () => {
  const result = schedule.parseScheduleForm(form([["9:00 AM", "Check-in", false], ["10:00 AM", "", false]]));
  assert.equal(result.ok, false);
  assert.match(result.error, /Row 2/);
});

test("an empty form saves an empty schedule", () => {
  const result = schedule.parseScheduleForm(form([]));
  assert.equal(result.ok, true);
  assert.equal(result.rows.length, 0);
});

test("misaligned fields and over-limit input are refused", () => {
  const fd = form([["9:00 AM", "Check-in", false]]);
  fd.append("time", "extra");
  assert.equal(schedule.parseScheduleForm(fd).ok, false);
  assert.equal(schedule.parseScheduleForm(form([["x".repeat(25), "Label", false]])).ok, false);
  assert.equal(schedule.parseScheduleForm(form([["9:00", "y".repeat(121), false]])).ok, false);
  assert.equal(schedule.parseScheduleForm(form(Array.from({ length: 41 }, (_, i) => [`${i}`, "x", false]))).ok, false);
});

// ---- saving ----

function setup({ organizer = true } = {}) {
  const log = { updates: [], revalidated: [] };
  const actions = load("src/app/admin/event/actions.ts", {
    "next/cache": { revalidatePath: (p) => log.revalidated.push(p) },
    "@/lib/prisma": { prisma: { event: {
      findFirst: async () => ({ id: "event-current" }),
      update: async (args) => { log.updates.push(args); return {}; },
    } } },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: {
      id: "sb-1", user_metadata: {}, identities: [{ provider: "discord", identity_data: { sub: "discord-me" } }],
    } } }) } }) },
    "@/lib/supabase/user": load("src/lib/supabase/user.ts"),
    "@/lib/organizer": { isOrganizer: async (id) => organizer && id === "discord-me" },
    "@/lib/event-guide": load("src/lib/event-guide.ts"),
    "@/lib/event-schedule": schedule,
  });
  return { ...actions, log };
}

test("an organizer saves the schedule to the current event", async () => {
  const { saveEventSchedule, log } = setup();
  const result = await saveEventSchedule({ status: "idle" }, form([["9:00 AM", "Check-in", false]]));
  assert.equal(result.status, "saved");
  assert.equal(result.count, 1);
  assert.equal(log.updates[0].where.id, "event-current");
  assert.deepEqual(plain(log.updates[0].data), { schedule: [{ time: "9:00 AM", label: "Check-in", highlighted: false }] });
  assert.ok(log.revalidated.includes("/schedule"));
});

test("non-organizers can't save, and the form can't pick the event", async () => {
  const denied = setup({ organizer: false });
  assert.equal((await denied.saveEventSchedule({ status: "idle" }, form([["9", "x", false]]))).status, "denied");
  assert.equal(denied.log.updates.length, 0);

  const ok = setup();
  const fd = form([["9", "x", false]]);
  fd.append("eventId", "event-other");
  await ok.saveEventSchedule({ status: "idle" }, fd);
  assert.equal(ok.log.updates[0].where.id, "event-current");
});

test("invalid input saves nothing", async () => {
  const { saveEventSchedule, log } = setup();
  const result = await saveEventSchedule({ status: "idle" }, form([["9:00 AM", "", false]]));
  assert.equal(result.status, "invalid");
  assert.equal(log.updates.length, 0);
});

// ---- the page ----

test("/schedule reads the hacker's own event, and the placeholder rows are gone", () => {
  const page = readFileSync("src/app/(app)/schedule/page.tsx", "utf8");
  assert.match(page, /await getCurrentHacker\(\)/);
  assert.match(page, /parseSchedule\(application\.event\.schedule\)/);
  assert.doesNotMatch(page, /searchParams|params|scheduleItems/);
  assert.doesNotMatch(readFileSync("src/lib/placeholder-data.ts", "utf8"), /scheduleItems|\[T0\]/);
});
