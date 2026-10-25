// Run with: node --test tests/portal-access.test.cjs
// Who gets the portal, and where each kind of applicant lands after signing in.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const compiled = ts.transpileModule(readFileSync("src/lib/portal-access.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const context = { exports: {}, require: (n) => assert.fail(`Unexpected dependency: ${n}`) };
vm.runInNewContext(compiled, context);
const { canEnterPortal, landingFor } = context.exports;

const app = (status, rsvpStatus = "PENDING") => ({ status, rsvpStatus });

test("only accepted hackers who haven't declined get the portal", () => {
  assert.equal(canEnterPortal(app("ACCEPTED", "PENDING")), true);
  assert.equal(canEnterPortal(app("ACCEPTED", "CONFIRMED")), true);
  assert.equal(canEnterPortal(app("ACCEPTED", "DECLINED")), false);
  for (const status of ["SUBMITTED", "WAITLISTED", "REJECTED"]) {
    for (const rsvp of ["PENDING", "CONFIRMED", "DECLINED"]) {
      assert.equal(canEnterPortal(app(status, rsvp)), false, `${status}/${rsvp}`);
    }
  }
});

test("each kind of applicant lands in the right place", () => {
  assert.equal(landingFor(null), "/apply/form");
  assert.equal(landingFor(app("SUBMITTED")), "/apply/applied");
  assert.equal(landingFor(app("ACCEPTED", "PENDING")), "/dashboard");
  assert.equal(landingFor(app("ACCEPTED", "CONFIRMED")), "/dashboard");
  assert.equal(landingFor(app("ACCEPTED", "DECLINED")), "/apply/status");
  assert.equal(landingFor(app("WAITLISTED")), "/apply/status");
  assert.equal(landingFor(app("REJECTED")), "/apply/status");
});

test("landing on the dashboard always means being allowed in — no bounce loop", () => {
  for (const status of ["SUBMITTED", "ACCEPTED", "WAITLISTED", "REJECTED"]) {
    for (const rsvp of ["PENDING", "CONFIRMED", "DECLINED"]) {
      const a = app(status, rsvp);
      assert.equal(landingFor(a) === "/dashboard", canEnterPortal(a), `${status}/${rsvp}`);
    }
  }
});

test("the portal gate and every sign-in landing page use the shared rule", () => {
  assert.match(readFileSync("src/lib/current-hacker.ts", "utf8"), /if \(!canEnterPortal\(application\)\) redirect\("\/apply\/status"\)/);
  assert.match(readFileSync("src/app/(apply)/apply/page.tsx", "utf8"), /redirect\(landingFor\(await getApplication\(discordId\)\)\)/);
  assert.match(readFileSync("src/app/(apply)/apply/form/page.tsx", "utf8"), /if \(application\) redirect\(landingFor\(application\)\)/);
  assert.match(readFileSync("src/app/(apply)/apply/applied/page.tsx", "utf8"), /if \(landing !== "\/apply\/applied"\) redirect\(landing\)/);
});

test("/apply/status shows the dashboard button only to portal-eligible viewers", () => {
  const page = readFileSync("src/app/(apply)/apply/status/page.tsx", "utf8");
  assert.match(page, /\{canEnterPortal\(application\) && \(\s*<Link\s+href="\/dashboard"/);
});
