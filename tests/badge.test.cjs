// Run with: node --test tests/badge.test.cjs
// Real issuance, QR rendering and dashboard with mocked DB/Auth, no shared writes.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const crypto = require("node:crypto");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const jsx = require("react/jsx-runtime");
const { renderToStaticMarkup } = require("react-dom/server");

const compiled = new Map();
function load(path, modules) {
  if (!compiled.has(path)) compiled.set(path, ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText);
  const context = { exports: {}, console: { log: () => assert.fail("Unexpected log"), error: () => assert.fail("Unexpected error log") }, require: (name) => {
    assert.ok(Object.hasOwn(modules, name), "Unexpected dependency: " + name);
    return modules[name];
  } };
  vm.runInNewContext(compiled.get(path), context);
  return context.exports;
}
const portal = load("src/lib/portal-access.ts", {});
const row = (badgeToken = null, status = "ACCEPTED", rsvpStatus = "PENDING") => ({ badgeToken, status, rsvpStatus });

function setup(rows = {}, { writeError = null, randomError = null, updateCount = 1 } = {}) {
  const db = new Map(Object.entries(rows));
  const calls = { randomBytes: [], reads: [], writes: [] };
  const findUnique = async (query) => { calls.reads.push(query); return db.get(query.where.id) ?? null; };
  const tx = { application: {
    findUnique,
    updateMany: async ({ where, data }) => {
      calls.writes.push({ where, data });
      if (writeError) throw writeError(data.badgeToken);
      const application = db.get(where.id);
      if (updateCount && application?.status === where.status && application.badgeToken === where.badgeToken) {
        Object.assign(application, data);
        return { count: 1 };
      }
      return { count: 0 };
    },
  } };
  const prisma = { application: { findUnique, updateMany: () => assert.fail("Dashboard cannot write or issuance escape its transaction") } };
  const badge = load("src/lib/badge.ts", {
    "server-only": {},
    "node:crypto": { randomBytes: (size) => {
      calls.randomBytes.push(size);
      if (randomError) throw randomError;
      return crypto.randomBytes(size);
    } },
    qrcode: require("qrcode"), "@/lib/prisma": { prisma }, "@/lib/portal-access": portal,
  });
  return { ...badge, db, calls, tx };
}

test("32-byte cryptographic randomness is base64url and independent of Application/Person IDs", async () => {
  const tokens = new Set();
  for (let i = 0; i < 16; i++) {
    const s = setup({ "application-fixed": { ...row(), personId: "person-fixed" } });
    await s.ensureBadgeToken("application-fixed", s.tx);
    const token = s.db.get("application-fixed").badgeToken;
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(Buffer.from(token, "base64url").length, 32);
    assert.doesNotMatch(token, /application-fixed|person-fixed/);
    assert.deepEqual(s.calls.randomBytes, [32]);
    assert.equal(s.calls.writes[0].where.badgeToken, null);
    assert.equal(s.calls.writes[0].where.status, "ACCEPTED");
    tokens.add(token);
  }
  assert.equal(tokens.size, 16, "Identical IDs still produce independent credentials");
});

test("existing credentials are preserved without randomness or writes", async () => {
  const s = setup({ own: row("existing-credential") });
  await s.ensureBadgeToken("own", s.tx);
  await s.ensureBadgeToken("own", s.tx);
  assert.equal(s.db.get("own").badgeToken, "existing-credential");
  assert.equal(s.calls.randomBytes.length, 0);
  assert.equal(s.calls.writes.length, 0);
});

for (const status of ["SUBMITTED", "WAITLISTED", "REJECTED"]) {
  test(status + " applications cannot issue a badge", async () => {
    const s = setup({ own: row(null, status) });
    await assert.rejects(s.ensureBadgeToken("own", s.tx), /Acceptance was not saved/);
    assert.equal(s.db.get("own").badgeToken, null);
    assert.equal(s.calls.randomBytes.length, 0);
    assert.equal(s.calls.writes.length, 0);
  });
}

test("missing applications, zero-row assignments and entropy failures are fatal", async () => {
  for (const [rows, options] of [[{}, {}], [{ own: row() }, { updateCount: 0 }], [{ own: row() }, { randomError: new Error("Entropy unavailable") }]]) {
    const s = setup(rows, options);
    await assert.rejects(s.ensureBadgeToken("own", s.tx), /Acceptance was not saved/);
    assert.equal(s.db.get("own")?.badgeToken ?? null, null);
  }
});

test("uniqueness failures propagate without credential-bearing errors or causes", async () => {
  const s = setup({ own: row() }, { writeError: (token) => Object.assign(new Error("Conflict on " + token), { code: "P2002" }) });
  await assert.rejects(s.ensureBadgeToken("own", s.tx), (error) => {
    assert.equal(error.message, "Badge issuance failed. Acceptance was not saved.");
    assert.equal(error.cause, undefined);
    assert.ok(!error.stack.includes(s.calls.writes[0].data.badgeToken));
    return true;
  });
  assert.equal(s.db.get("own").badgeToken, null);
});

test("the nullable unique field and original migration remain the collision guarantee", () => {
  assert.match(readFileSync("prisma/schema.prisma", "utf8"), /badgeToken\s+String\?\s+@unique/);
  assert.match(readFileSync("prisma/migrations/20261014185341_add_badge_token/migration.sql", "utf8"),
    /CREATE UNIQUE INDEX "Application_badgeToken_key" ON "Application"\("badgeToken"\)/);
});

test("dashboard reads the existing token as a dark-on-white QR without issuance", async () => {
  const token = crypto.randomBytes(32).toString("base64url");
  const s = setup({ own: row(token) });
  const svg = await s.getBadgeSvg("own");
  assert.equal(svg, s.renderBadgeSvg(token));
  assert.match(svg, /^<svg/);
  assert.match(svg, /fill="#ffffff"/i);
  assert.match(svg, /fill="#120f1f"/i);
  assert.ok(!svg.includes(token));
  assert.equal(await s.getBadgeSvg("own"), svg);
  assert.equal(s.calls.randomBytes.length, 0);
  assert.equal(s.calls.writes.length, 0);
});

test("a missing badge returns unavailable without repairing it on a dashboard visit", async () => {
  const s = setup({ own: row() });
  assert.equal(await s.getBadgeSvg("own"), null);
  assert.equal(s.db.get("own").badgeToken, null);
  assert.equal(s.calls.randomBytes.length, 0);
  assert.equal(s.calls.writes.length, 0);
});

test("QR reads recheck current eligibility, including withdrawal and declined RSVP", async () => {
  for (const application of [row("token", "SUBMITTED"), row("token", "WAITLISTED"), row("token", "REJECTED"), row("token", "ACCEPTED", "DECLINED"), null]) {
    const s = setup(application ? { own: application } : {});
    await assert.rejects(s.getBadgeSvg("own"), /Badge unavailable/);
    assert.equal(s.calls.writes.length, 0);
  }
});

test("the same credential draws the same QR", () => {
  const s = setup();
  assert.equal(s.renderBadgeSvg("token-a"), s.renderBadgeSvg("token-a"));
  assert.notEqual(s.renderBadgeSvg("token-a"), s.renderBadgeSvg("token-b"));
});

test("URL/form/query IDs cannot replace the session owner's badge; only SVG crosses to the client", async () => {
  const s = setup({ own: row("owner-credential"), other: row("other-credential") });
  let props;
  const page = load("src/app/(app)/dashboard/page.tsx", {
    "react/jsx-runtime": jsx,
    "@/lib/current-hacker": { getCurrentHacker: async () => ({ fullName: "Owner", application: {
      id: "own", status: "ACCEPTED", rsvpStatus: "PENDING", diet: "No restriction",
      event: { name: "Event", startDate: new Date(), endDate: new Date(), locations: [] },
    } }) },
    "@/lib/badge": s, "@/lib/event-guide": { mainVenue: () => null, parseLocations: () => [] },
    "./Dashboard": { __esModule: true, default: (value) => { props = value; return null; } },
  });
  renderToStaticMarkup(await page.default({ params: { id: "other" }, searchParams: { applicationId: "other" }, formData: { id: "other" } }));
  assert.equal(props.badgeSvg, s.renderBadgeSvg("owner-credential"));
  assert.equal(s.calls.reads[0].where.id, "own");
  for (const key of ["id", "applicationId", "personId", "badgeToken", "application"]) assert.ok(!(key in props));
  assert.ok(!JSON.stringify(props).includes("owner-credential"));
  assert.ok(!JSON.stringify(props).includes("other-credential"));
});

test("dashboard visibly reports missing issuance without displaying an empty QR", () => {
  const wrapper = { __esModule: true, default: ({ children }) => jsx.jsx("div", { children }) };
  const dashboard = load("src/app/(app)/dashboard/Dashboard.tsx", {
    "react/jsx-runtime": jsx, react: React, "next/image": { __esModule: true, default: () => null }, "next/link": wrapper,
    "@/components/ui/PixelCard": wrapper, "@/components/ui/PixelChip": wrapper,
    "@/components/ui/TerminalWindow": wrapper, "@/components/StatusCard": wrapper,
    "@/lib/status-card": { formatEventDates: () => "Event dates" },
    "@/lib/placeholder-data": { dashboardStatus: {}, contactLog: [] },
  }).default;
  const props = { fullName: "Owner", status: "ACCEPTED", rsvpStatus: "PENDING", event: { startDate: new Date(), endDate: new Date() }, diet: "No restriction" };
  const html = renderToStaticMarkup(jsx.jsx(dashboard, { ...props, badgeSvg: null }));
  assert.match(html, /role="status"/);
  assert.match(html, /Your badge is unavailable/);
  assert.match(html, /contact an organizer/);
  assert.doesNotMatch(html, /Your check-in QR code|Show this at check-in/);
  const ready = renderToStaticMarkup(jsx.jsx(dashboard, { ...props, badgeSvg: setup().renderBadgeSvg("owner-credential") }));
  assert.match(ready, /Your check-in QR code/);
  assert.doesNotMatch(ready, /Your badge is unavailable|owner-credential/);
});
