// Run with: node --test tests/status-card.test.cjs
// The status card (PLAT-45): right content per state, and only ever the
// viewer's own status. No credentials or DB access.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const compiled = ts.transpileModule(readFileSync("src/lib/status-card.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const context = { exports: {}, require: (name) => assert.fail(`Unexpected dependency: ${name}`) };
vm.runInNewContext(compiled, context);
const { getStatusCardContent } = context.exports;

const statusesInSchema = readFileSync("prisma/schema.prisma", "utf8")
  .match(/enum ApplicationStatus \{([^}]*)\}/)[1]
  .split(/\s+/)
  .filter((w) => /^[A-Z_]+$/.test(w));

test("every status in the schema has card content", () => {
  assert.ok(statusesInSchema.length >= 4);
  for (const status of statusesInSchema) {
    const content = getStatusCardContent(status);
    assert.ok(content && content.headline && content.body && content.color, status);
  }
});

test("each state says what it should", () => {
  assert.equal(getStatusCardContent("SUBMITTED").headline, "APPLIED");
  assert.equal(getStatusCardContent("ACCEPTED").headline, "ACCEPTED");
  assert.equal(getStatusCardContent("WAITLISTED").headline, "WAITLISTED");
  assert.equal(getStatusCardContent("REJECTED").headline, "NOT THIS TIME");
});

test("accepted confirmed/declined cards preserve admission while accurately showing attendance", () => {
  for (const rsvpStatus of ["CONFIRMED", "DECLINED"]) {
    const content = getStatusCardContent("ACCEPTED", rsvpStatus);
    assert.equal(content.headline, `ACCEPTED · ${rsvpStatus}`);
    assert.doesNotMatch(content.body, /Watch your email|confirm your spot/);
    assert.match(content.body, /contact the event organizers/);
  }
  assert.match(getStatusCardContent("ACCEPTED", "DECLINED").body, /Portal access is unavailable/);
  assert.equal(getStatusCardContent("ACCEPTED", "PENDING").headline, "ACCEPTED");
  for (const decision of ["SUBMITTED", "WAITLISTED", "REJECTED"]) {
    assert.equal(getStatusCardContent(decision, "CONFIRMED").headline, getStatusCardContent(decision).headline);
  }
});

test("no application prompts to apply", () => {
  const content = getStatusCardContent(null);
  assert.equal(content.headline, "NOT APPLIED YET");
  assert.equal(content.action.href, "/apply/form");
});

test("only the no-application state has a button until RSVP exists", () => {
  for (const status of statusesInSchema) {
    assert.equal(getStatusCardContent(status).action, undefined, status);
  }
  assert.match(getStatusCardContent("ACCEPTED").body, /confirm your spot/);
});

test("the card takes a status, never an id — it can't be pointed at someone else", () => {
  const card = readFileSync("src/components/StatusCard.tsx", "utf8");
  assert.match(card, /status: ApplicationStatus \| null;/);
  // A type import from @/generated/prisma is fine; the database client isn't.
  assert.doesNotMatch(card, /applicationId|personId|discordId|@\/lib\/prisma/);
});

test("both pages feed it from the signed-in session", () => {
  const dashboard = readFileSync("src/app/(app)/dashboard/page.tsx", "utf8");
  assert.match(dashboard, /await getCurrentHacker\(\)/);
  assert.match(dashboard, /status=\{application\.status\}/);
  assert.doesNotMatch(dashboard, /searchParams|params/);

  const statusPage = readFileSync("src/app/(apply)/apply/status/page.tsx", "utf8");
  assert.match(statusPage, /getApplication\(identity\.discordId\)/);
  assert.match(statusPage, /if \(!identity\.discordId\) redirect/);
  assert.match(statusPage, /<StatusCard\s+status=\{application\.status\}/);
  assert.doesNotMatch(statusPage, /searchParams|params\./);
});
