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
  const result = guide.parseGuideForm(form({ parkingInfo: "  ", whatToBring: "" }));
  assert.equal(result.ok, true);
  assert.deepEqual(plain(result.data), {
    parkingInfo: null, wifiInfo: null, whatToBring: [], codeOfConductUrl: null,
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
  assert.equal(guide.parseGuideForm(form({ parkingInfo: "x".repeat(601) })).ok, false);
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
    // actions.ts also holds the schedule save (tests/event-schedule.test.cjs).
    "@/lib/event-schedule": load("src/lib/event-schedule.ts"),
  });
  return { ...actions, log };
}

test("an organizer saves the guide to the current event", async () => {
  const { saveEventGuide, log } = setup();
  const result = await saveEventGuide({ status: "idle" }, form({ parkingInfo: "Lot 18", wifiInfo: "eduroam" }));
  assert.equal(result.status, "saved");
  assert.equal(log.updates[0].where.id, "event-current");
  assert.equal(log.updates[0].data.parkingInfo, "Lot 18");
  assert.ok(log.revalidated.includes("/guide"));
});

test("non-organizers can't save anything", async () => {
  const { saveEventGuide, log } = setup({ organizer: false });
  const result = await saveEventGuide({ status: "idle" }, form({ parkingInfo: "Hacked" }));
  assert.equal(result.status, "denied");
  assert.equal(log.updates.length, 0);
});

test("the form can't choose which event gets edited", async () => {
  const { saveEventGuide, log } = setup();
  await saveEventGuide({ status: "idle" }, form({ id: "event-other", eventId: "event-other", parkingInfo: "X" }));
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

// ---- locations ----

test("locations read back in order; hand-edited typos are skipped, never fatal", () => {
  assert.deepEqual(plain(guide.parseLocations("nope")), []);
  const rows = guide.parseLocations([
    { label: "Main venue", place: "ENB", note: "Hacking, food and workshops happen here" },
    { label: "Ceremonies", place: "CMC", note: "Opening & closing ceremonies", address: "  " },
    { label: "No place" },
    null,
    { place: "No label" },
  ]);
  assert.deepEqual(plain(rows), [
    { label: "Main venue", place: "ENB", note: "Hacking, food and workshops happen here", address: null },
    { label: "Ceremonies", place: "CMC", note: "Opening & closing ceremonies", address: null },
  ]);
  assert.equal(guide.mainVenue(rows), "ENB");
  assert.equal(guide.mainVenue([]), null);
});

function locForm(rows) {
  const fd = new FormData();
  for (const [label, place, note = "", address = ""] of rows) {
    fd.append("locLabel", label);
    fd.append("locPlace", place);
    fd.append("locNote", note);
    fd.append("locAddress", address);
  }
  return fd;
}

test("the locations form keeps order, drops blank blocks, and needs label + place", () => {
  const ok = guide.parseLocationsForm(locForm([["Main venue", "ENB", "Hacking"], ["", "", "", ""], ["Ceremonies", "CMC"]]));
  assert.equal(ok.ok, true);
  assert.deepEqual(plain(ok.rows.map((r) => r.place)), ["ENB", "CMC"]);
  assert.equal(ok.rows[1].note, null);

  const half = guide.parseLocationsForm(locForm([["Main venue", "ENB"], ["Ceremonies", ""]]));
  assert.equal(half.ok, false);
  assert.match(half.error, /Location 2/);

  assert.equal(guide.parseLocationsForm(locForm([["x".repeat(41), "ENB"]])).ok, false);
  assert.equal(guide.parseLocationsForm(locForm(Array.from({ length: 11 }, (_, i) => [`L${i}`, "P"]))).ok, false);
});

test("an organizer saves locations to the current event; others can't", async () => {
  const { saveEventLocations, log } = setup();
  const result = await saveEventLocations({ status: "idle" }, locForm([["Main venue", "ENB"]]));
  assert.equal(result.status, "saved");
  assert.equal(log.updates[0].where.id, "event-current");
  assert.deepEqual(plain(log.updates[0].data), { locations: [{ label: "Main venue", place: "ENB", note: null, address: null }] });

  const denied = setup({ organizer: false });
  assert.equal((await denied.saveEventLocations({ status: "idle" }, locForm([["Main venue", "ENB"]]))).status, "denied");
  assert.equal(denied.log.updates.length, 0);
});

test("the guide renders one row per location, and parking says 'To be announced' when empty", () => {
  const page = readFileSync("src/app/(app)/guide/page.tsx", "utf8");
  assert.match(page, /parseLocations\(event\.locations\)/);
  assert.match(page, /To be announced/);
});
