// Run with: node --test tests/event-guide.test.cjs
// The hacker guide from the Event row: parsing/validation of the admin form,
// the organizer-only save, and the page reading the hacker's own event.
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

function form(fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

const guide = load("src/lib/event-guide.ts");

// ---- parsing the admin form ----

test("empty fields save as empty, so the guide shows TBA", () => {
  const result = guide.parseGuideForm(form({ venueName: "  ", whatToBring: "" }));
  assert.equal(result.ok, true);
  assert.deepEqual(plain(result.data), {
    venueName: null, venueAddress: null, parkingInfo: null, wifiInfo: null, whatToBring: [], codeOfConductUrl: null,
    hackerGuideUrl: null,
  });
});

test("what to bring is one item per line, ignoring blanks and bullets", () => {
  const result = guide.parseGuideForm(form({ whatToBring: "Laptop\r\n\r\n- Charger\n• Student ID\n[ ] Water bottle\n  " }));
  assert.deepEqual(plain(result.data.whatToBring), ["Laptop", "Charger", "Student ID", "Water bottle"]);
});

test("wifi instructions keep their line breaks", () => {
  const result = guide.parseGuideForm(form({ wifiInfo: "eduroam: school login\r\nUSF-Guest: open" }));
  assert.equal(result.data.wifiInfo, "eduroam: school login\nUSF-Guest: open");
});

test("the code of conduct link must be a real https link", () => {
  for (const bad of ["http://mlh.io/coc", "javascript:alert(1)", "banana", "https://localhost", "mlh.io/code-of-conduct"]) {
    const result = guide.parseGuideForm(form({ codeOfConductUrl: bad }));
    assert.equal(result.ok, false, bad);
    assert.ok(result.errors.codeOfConductUrl, bad);
  }
  assert.equal(guide.parseGuideForm(form({ codeOfConductUrl: "https://mlh.io/code-of-conduct" })).ok, true);
});

test("the full guide link follows the same https-only rule", () => {
  for (const bad of ["http://notion.so/guide", "javascript:alert(1)", "notion.so/guide", "https://intranet"]) {
    const result = guide.parseGuideForm(form({ hackerGuideUrl: bad }));
    assert.equal(result.ok, false, bad);
    assert.ok(result.errors.hackerGuideUrl, bad);
  }
  const ok = guide.parseGuideForm(form({ hackerGuideUrl: "https://shpeusf.notion.site/hackjam-26-guide" }));
  assert.equal(ok.ok, true);
  assert.equal(ok.data.hackerGuideUrl, "https://shpeusf.notion.site/hackjam-26-guide");
});

test("overlong fields and lists are refused, nothing half-saved", () => {
  assert.equal(guide.parseGuideForm(form({ venueName: "x".repeat(121) })).ok, false);
  assert.equal(guide.parseGuideForm(form({ whatToBring: Array.from({ length: 21 }, (_, i) => `item ${i}`).join("\n") })).ok, false);
  assert.equal(guide.parseGuideForm(form({ whatToBring: "y".repeat(101) })).ok, false);
});

test("the address becomes a safely encoded Maps link", () => {
  assert.equal(
    guide.mapsUrl("4103 USF Cedar Cir, Tampa & more"),
    "https://www.google.com/maps/search/?api=1&query=4103%20USF%20Cedar%20Cir%2C%20Tampa%20%26%20more",
  );
});

// ---- saving: organizer-only, current event only ----

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
    "@/lib/event-guide": guide,
  });
  return { ...actions, log };
}

test("an organizer saves the guide to the current event", async () => {
  const { saveEventGuide, log } = setup();
  const result = await saveEventGuide({ status: "idle" }, form({ venueName: "Marshall Center", wifiInfo: "eduroam" }));
  assert.equal(result.status, "saved");
  assert.equal(log.updates[0].where.id, "event-current");
  assert.equal(log.updates[0].data.venueName, "Marshall Center");
  assert.ok(log.revalidated.includes("/guide"));
});

test("non-organizers can't save anything", async () => {
  const { saveEventGuide, log } = setup({ organizer: false });
  const result = await saveEventGuide({ status: "idle" }, form({ venueName: "Hacked" }));
  assert.equal(result.status, "denied");
  assert.equal(log.updates.length, 0);
});

test("the form can't choose which event gets edited", async () => {
  const { saveEventGuide, log } = setup();
  await saveEventGuide({ status: "idle" }, form({ id: "event-other", eventId: "event-other", venueName: "X" }));
  assert.equal(log.updates[0].where.id, "event-current");
  assert.equal("id" in log.updates[0].data, false);
  assert.equal("eventId" in log.updates[0].data, false);
});

test("invalid input saves nothing and says which field", async () => {
  const { saveEventGuide, log } = setup();
  const result = await saveEventGuide({ status: "idle" }, form({ codeOfConductUrl: "javascript:alert(1)" }));
  assert.equal(result.status, "invalid");
  assert.ok(result.errors.codeOfConductUrl);
  assert.equal(log.updates.length, 0);
});

// ---- reading ----

test("the guide page reads the signed-in hacker's own event, no ids from the URL", () => {
  const page = readFileSync("src/app/(app)/guide/page.tsx", "utf8");
  assert.match(page, /await getCurrentHacker\(\)/);
  assert.match(page, /application\.event/);
  assert.doesNotMatch(page, /searchParams|params|guideCards/);
});

test("the guide links the full document when set, and shows 'in progress' when not", () => {
  const page = readFileSync("src/app/(app)/guide/page.tsx", "utf8");
  assert.match(page, /event\.hackerGuideUrl \? <FullGuideLink url=\{event\.hackerGuideUrl\} \/> : <FullGuideInProgress \/>/);
  assert.match(page, /rel="noopener noreferrer"/);
});

test("the editor page is organizer-only", () => {
  assert.match(readFileSync("src/app/admin/event/page.tsx", "utf8"), /await requireOrganizer\(\)/);
});
