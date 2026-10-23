// Run with: node --test tests/rsvp-public.test.cjs
// Real helper, action, React rendering and proxy; mocked Prisma/Auth. No DB access.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const crypto = require("node:crypto");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const ROOT = "src/app/rsvp/[token]";
const NOW = Date.parse("2026-10-23T12:00:00Z");
const plain = (value) => JSON.parse(JSON.stringify(value));
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const unavailable = { status: "UNAVAILABLE" };
const compiled = new Map();
const noLogs = Object.fromEntries(["log", "error", "warn", "info", "debug"].map((name) => [
  name, () => assert.fail("RSVP code must not log credentials or database errors"),
]));

function load(path, modules, globals = {}) {
  if (!compiled.has(path)) compiled.set(path, ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    },
  }).outputText);
  const context = { exports: {}, console: noLogs, ...globals, require: (name) => {
    assert.ok(Object.hasOwn(modules, name), `Unexpected dependency: ${name}`);
    return modules[name];
  } };
  vm.runInNewContext(compiled.get(path), context);
  return context.exports;
}

function project(row, select) {
  if (!row) return null;
  return Object.fromEntries(Object.entries(select).map(([key, selection]) => [
    key, selection === true ? row[key] : project(row[key], selection.select),
  ]));
}

function setup({ beforeLock, beforeUpdate, databaseError } = {}) {
  const clock = { now: NOW };
  class ServerDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now; }
  }
  const applications = new Map(["app-a", "app-b"].map((id) => [id, {
    id, personId: `person-${id}`, status: "ACCEPTED", rsvpStatus: "PENDING", rsvpRespondedAt: null,
    event: { name: "Test Hackathon", startDate: new Date(NOW + 86_400_000) },
    person: { email: "private@example.invalid", phoneNum: "private-phone" }, whyAttend: "private-answer",
  }]));
  const raw = crypto.randomBytes(32).toString("base64url");
  const retry = crypto.randomBytes(32).toString("base64url");
  const tokens = [raw, retry].map((credential, i) => ({
    id: `invitation-${i}`, tokenHash: hash(credential), applicationId: "app-a",
    expiresAt: new Date(NOW + 86_400_000), revokedAt: null,
  }));
  const db = { applications, tokens };
  const calls = { tokenReads: [], applicationReads: [], updates: [], transitions: [], locks: [], transactions: 0 };
  const tables = {
    application: {
      findUnique: async (query) => {
        calls.applicationReads.push(query);
        const application = applications.get(query.where.id);
        return !application || (query.where.status && application.status !== query.where.status)
          ? null : project(application, query.select);
      },
      updateMany: async (query) => {
        calls.updates.push(query);
        if (beforeUpdate) await beforeUpdate({ db, clock });
        const { where, data } = query;
        assert.deepEqual(Object.keys(data).sort(), ["rsvpRespondedAt", "rsvpStatus"]);
        const application = applications.get(where.id);
        const credential = where.rsvpTokens.some;
        const activeToken = tokens.some((row) => row.applicationId === where.id &&
          row.tokenHash === credential.tokenHash && row.revokedAt === credential.revokedAt &&
          row.expiresAt > credential.expiresAt.gt);
        if (!application || application.status !== where.status || application.rsvpStatus !== where.rsvpStatus || !activeToken) {
          return { count: 0 };
        }
        Object.assign(application, data);
        calls.transitions.push({ ...data });
        return { count: 1 };
      },
    },
    rsvpToken: {
      findUnique: async (query) => {
        calls.tokenReads.push(query);
        if (databaseError) throw databaseError;
        const token = tokens.find((row) => row.tokenHash === query.where.tokenHash);
        return token ? project({ ...token, application: applications.get(token.applicationId) }, query.select) : null;
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const token of tokens) {
          if (token.applicationId === where.applicationId && token.revokedAt === where.revokedAt && token.expiresAt > where.expiresAt.gt) {
            Object.assign(token, data);
            count++;
          }
        }
        return { count };
      },
    },
  };
  // Simulate PostgreSQL's per-application lock across await boundaries, with
  // deterministic hooks to change eligibility while a request waits. No sleeps.
  const lockTails = new Map();
  const prisma = { ...tables, $transaction: async (run) => {
    calls.transactions++;
    const releases = new Map();
    const tx = { ...tables, $queryRaw: async (strings, ...values) => {
      assert.match(strings.join("?"), /SELECT "id" FROM "Application" WHERE "id" = \? FOR UPDATE/);
      assert.equal(values.length, 1);
      const id = values[0];
      calls.locks.push(id);
      if (beforeLock) await beforeLock({ db, clock });
      if (!releases.has(id)) {
        const previous = lockTails.get(id) ?? Promise.resolve();
        let release;
        const next = new Promise((resolve) => { release = resolve; });
        lockTails.set(id, next);
        await previous;
        releases.set(id, release);
      }
      return applications.has(id) ? [{ id }] : [];
    } };
    try { return await run(tx); }
    finally { for (const release of releases.values()) release(); }
  } };
  const helper = load("src/lib/rsvp.ts", { "server-only": {}, "node:crypto": crypto, "@/lib/prisma": { prisma } }, { Date: ServerDate });
  const actions = load(`${ROOT}/actions.ts`, { "@/lib/rsvp": helper });
  const jsx = require("react/jsx-runtime");
  const response = load(`${ROOT}/rsvp-response.tsx`, { react: React, "react/jsx-runtime": jsx, "./actions": actions });
  const clsx = load("src/lib/clsx.ts", {});
  const card = load("src/components/ui/PixelCard.tsx", { "react/jsx-runtime": jsx, "@/lib/clsx": clsx });
  const page = load(`${ROOT}/page.tsx`, {
    "react/jsx-runtime": jsx, "@/lib/prisma": { prisma }, "@/lib/rsvp": helper,
    "@/components/ui/PixelCard": card, "./rsvp-response": response,
  });
  const render = async (credential = raw) => renderToStaticMarkup(await page.default({ params: Promise.resolve({ token: credential }) }));
  const submit = async (choice, credential = raw, fields = {}) => {
    const form = new FormData();
    if (credential !== null) form.set("token", credential);
    if (choice !== null) form.set("choice", choice);
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    return actions.respondToRsvp({ status: "PENDING" }, form);
  };
  return { db, clock, raw, retry, calls, helper, actions, page, render, submit };
}

test("valid pending GET renders only event name, credential and two RSVP choices", async () => {
  const s = setup();
  const html = await s.render();
  assert.match(html, /Test Hackathon/);
  assert.match(html, /Confirm attendance/);
  assert.match(html, />Decline<\/button>/);
  assert.match(html, /<button(?=[^>]*name="choice")(?=[^>]*value="CONFIRMED")[^>]*>/);
  assert.match(html, /<button(?=[^>]*name="choice")(?=[^>]*value="DECLINED")[^>]*>/);
  assert.match(html, /name="token"/);
  assert.doesNotMatch(html, /app-a|person-app|private@example|private-phone|private-answer|applicationId|personId|eventId/);
  assert.deepEqual(plain(s.calls.applicationReads[0].select), { rsvpStatus: true, event: { select: { name: true } } });
  assert.equal(s.calls.transactions, 0);
  assert.equal(s.calls.updates.length, 0);
  assert.equal(s.db.applications.get("app-a").rsvpStatus, "PENDING");
  assert.equal(s.db.applications.get("app-a").rsvpRespondedAt, null);
  assert.equal(s.db.tokens.length, 2);
  assert.ok(s.db.tokens.every((row) => row.revokedAt === null));
});

for (const status of ["CONFIRMED", "DECLINED"]) {
  test(`${status} GET shows a receipt with no response controls and performs no mutation`, async () => {
    const s = setup();
    s.db.applications.get("app-a").rsvpStatus = status;
    const html = await s.render();
    assert.match(html, status === "CONFIRMED" ? /attendance is confirmed/ : /declined attendance/);
    assert.doesNotMatch(html, /<form|<button|type="hidden"/);
    assert.equal(s.calls.updates.length, 0);
    assert.equal(s.calls.transactions, 0);
    assert.equal(s.db.tokens.length, 2);
  });
}

for (const status of ["INVALID", "EXPIRED", "REVOKED", "NO_LONGER_ACCEPTED"]) {
  test(`${status} GET renders the same generic unavailable page without private details`, async () => {
    const s = setup();
    const generic = await s.render("malformed");
    if (status === "INVALID") s.db.tokens.length = 0;
    if (status === "EXPIRED") s.db.tokens[0].expiresAt = new Date(NOW);
    if (status === "REVOKED") s.db.tokens[0].revokedAt = new Date(NOW - 1);
    if (status === "NO_LONGER_ACCEPTED") s.db.applications.get("app-a").status = "WAITLISTED";
    const html = await s.render();
    assert.equal(html, generic);
    assert.match(html, /RSVP link unavailable/);
    assert.ok(!html.includes(s.raw));
    assert.doesNotMatch(html, /Test Hackathon|app-a|person-app|private|<button|<form/);
    assert.equal(s.calls.applicationReads.length, 0);
    assert.equal(s.calls.updates.length, 0);
    assert.equal(s.calls.transactions, 0);
  });
}

test("page metadata disables indexing/referrers and page generation is dynamic", () => {
  const s = setup();
  assert.equal(s.page.dynamic, "force-dynamic");
  assert.equal(s.page.runtime, "nodejs");
  assert.deepEqual(plain(s.page.metadata.robots), { index: false, follow: false });
  assert.equal(s.page.metadata.referrer, "no-referrer");
});

test("event names are escaped and do not become page markup", async () => {
  const s = setup();
  s.db.applications.get("app-a").event.name = "Event <script>unsafe</script>";
  const html = await s.render();
  assert.match(html, /Event &lt;script&gt;unsafe&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>unsafe/);
});

for (const choice of ["CONFIRMED", "DECLINED"]) {
  test(`${choice} POST records exactly one pending response and its server timestamp`, async () => {
    const s = setup();
    assert.deepEqual(plain(await s.submit(choice)), { status: choice });
    const application = s.db.applications.get("app-a");
    assert.equal(application.rsvpStatus, choice);
    assert.equal(application.rsvpRespondedAt.getTime(), NOW);
    assert.equal(application.status, "ACCEPTED");
    assert.equal(s.calls.transitions.length, 1);
    assert.equal(s.calls.tokenReads.length, 2, "Must resolve again after locking");
    assert.deepEqual(s.calls.locks, ["app-a"]);
    const where = plain(s.calls.updates[0].where);
    assert.equal(where.id, "app-a");
    assert.equal(where.status, "ACCEPTED");
    assert.equal(where.rsvpStatus, "PENDING");
    assert.deepEqual(where.rsvpTokens.some, { tokenHash: hash(s.raw), revokedAt: null, expiresAt: { gt: new Date(NOW).toISOString() } });
    assert.equal(s.db.applications.get("app-b").rsvpStatus, "PENDING");
    assert.equal(s.db.tokens.length, 2);
    assert.equal((await s.helper.resolveRsvpToken(s.raw)).status, "VALID");
    assert.match(await s.render(), choice === "CONFIRMED" ? /attendance is confirmed/ : /declined attendance/);
  });

  test(`${choice} cannot be overwritten by the same or opposite response through either retry token`, async () => {
    const s = setup();
    await s.submit(choice);
    const timestamp = s.db.applications.get("app-a").rsvpRespondedAt;
    s.clock.now += 60_000;
    const opposite = choice === "CONFIRMED" ? "DECLINED" : "CONFIRMED";
    for (const credential of [s.raw, s.retry]) {
      assert.deepEqual(plain(await s.submit(choice, credential)), { status: choice });
      assert.deepEqual(plain(await s.submit(opposite, credential)), { status: choice });
    }
    assert.equal(s.db.applications.get("app-a").rsvpRespondedAt, timestamp);
    assert.equal(s.calls.updates.length, 1);
    assert.equal(s.calls.transitions.length, 1);
    assert.equal(s.db.tokens.length, 2);
  });
}

test("arbitrary, missing, and wrongly-typed choices are rejected before credential lookup", async () => {
  const s = setup();
  for (const choice of ["PENDING", "ACCEPTED", "confirmed", "", null]) {
    assert.deepEqual(plain(await s.submit(choice)), { status: "INVALID_CHOICE" });
  }
  for (const choice of [undefined, {}, ["CONFIRMED"], true, 1]) {
    assert.deepEqual(plain(await s.helper.recordRsvpResponse(s.raw, choice)), { status: "INVALID_CHOICE" });
  }
  assert.equal(s.calls.tokenReads.length, 0);
  assert.equal(s.calls.transactions, 0);
  assert.equal(s.calls.updates.length, 0);
});

for (const status of ["INVALID", "EXPIRED", "REVOKED", "NO_LONGER_ACCEPTED"]) {
  test(`${status} POST is rejected even after a previously valid GET`, async () => {
    const s = setup();
    await s.render();
    if (status === "INVALID") s.db.tokens.length = 0;
    if (status === "EXPIRED") s.clock.now = s.db.tokens[0].expiresAt.getTime();
    if (status === "REVOKED") s.db.tokens[0].revokedAt = new Date(NOW);
    if (status === "NO_LONGER_ACCEPTED") s.db.applications.get("app-a").status = "REJECTED";
    assert.deepEqual(plain(await s.submit("CONFIRMED")), unavailable);
    assert.equal(s.calls.updates.length, 0);
    assert.equal(s.db.applications.get("app-a").rsvpStatus, "PENDING");
    assert.equal(s.db.applications.get("app-a").rsvpRespondedAt, null);
  });
}

test("malformed or missing POST credentials cannot reach Prisma or write", async () => {
  const s = setup();
  for (const credential of [null, "", "invalid", "A".repeat(42) + "\n", "x".repeat(100_000)]) {
    assert.deepEqual(plain(await s.submit("CONFIRMED", credential)), unavailable);
  }
  assert.deepEqual(plain(await s.helper.recordRsvpResponse({ applicationId: "app-a" }, "CONFIRMED")), unavailable);
  assert.equal(s.calls.tokenReads.length, 0);
  assert.equal(s.calls.transactions, 0);
});

test("form IDs, statuses, timestamps and forged previous state cannot retarget a response", async () => {
  const s = setup();
  const form = new FormData();
  for (const [key, value] of Object.entries({
    token: s.raw, choice: "DECLINED", applicationId: "app-b", personId: "person-app-b", eventId: "other-event",
    status: "ACCEPTED", rsvpStatus: "CONFIRMED", rsvpRespondedAt: "2000-01-01", role: "ORGANIZER",
  })) form.set(key, value);
  const result = await s.actions.respondToRsvp({ status: "CONFIRMED", applicationId: "app-b" }, form);
  assert.deepEqual(plain(result), { status: "DECLINED" });
  assert.equal(s.db.applications.get("app-a").rsvpStatus, "DECLINED");
  assert.equal(s.db.applications.get("app-a").rsvpRespondedAt.getTime(), NOW);
  assert.equal(s.db.applications.get("app-b").rsvpStatus, "PENDING");
  assert.equal(s.db.applications.get("app-b").rsvpRespondedAt, null);
  assert.deepEqual(Object.keys(result), ["status"]);
});

for (const change of ["expire", "revoke", "withdraw", "delete", "retarget"]) {
  test(`POST revalidates if eligibility changes while acquiring the application lock: ${change}`, async () => {
    const s = setup({ beforeLock: async ({ db, clock }) => {
      if (change === "expire") clock.now = db.tokens[0].expiresAt.getTime();
      if (change === "revoke") db.tokens[0].revokedAt = new Date(NOW);
      if (change === "withdraw") db.applications.get("app-a").status = "WAITLISTED";
      if (change === "delete") db.applications.delete("app-a");
      if (change === "retarget") db.tokens[0].applicationId = "app-b";
    } });
    assert.deepEqual(plain(await s.submit("CONFIRMED")), unavailable);
    assert.equal(s.calls.updates.length, 0);
    assert.equal(s.calls.transitions.length, 0);
  });
}

for (const first of ["CONFIRMED", "DECLINED"]) {
  test(`concurrent opposite choices through separate credentials have exactly one winner: ${first} first`, async () => {
    const s = setup();
    const second = first === "CONFIRMED" ? "DECLINED" : "CONFIRMED";
    const results = await Promise.all([s.submit(first, s.raw), s.submit(second, s.retry)]);
    assert.deepEqual(plain(results), [{ status: first }, { status: first }]);
    assert.equal(s.calls.transitions.length, 1);
    assert.equal(s.calls.updates.length, 1);
    const application = s.db.applications.get("app-a");
    const respondedAt = application.rsvpRespondedAt;
    assert.equal(application.rsvpStatus, first);
    assert.equal(respondedAt.getTime(), NOW);
    s.clock.now += 1000;
    await s.submit(second);
    assert.equal(application.rsvpRespondedAt, respondedAt);
  });
}

test("a zero-row conditional update rereads the recorded response and preserves its timestamp", async () => {
  const recordedAt = new Date(NOW - 1);
  const s = setup({ beforeUpdate: async ({ db }) => {
    Object.assign(db.applications.get("app-a"), { rsvpStatus: "DECLINED", rsvpRespondedAt: recordedAt });
  } });
  assert.deepEqual(plain(await s.submit("CONFIRMED")), { status: "DECLINED" });
  assert.equal(s.calls.transitions.length, 0);
  assert.equal(s.calls.tokenReads.length, 3);
  assert.equal(s.db.applications.get("app-a").rsvpRespondedAt, recordedAt);
});

test("eligibility is also repeated in the conditional write, including the exact expiry boundary", async () => {
  for (const change of ["expire", "revoke", "withdraw"]) {
    const s = setup({ beforeUpdate: async ({ db, clock }) => {
      if (change === "expire") db.tokens[0].expiresAt = new Date(clock.now);
      if (change === "revoke") db.tokens[0].revokedAt = new Date(clock.now);
      if (change === "withdraw") db.applications.get("app-a").status = "REJECTED";
    } });
    assert.deepEqual(plain(await s.submit("CONFIRMED")), unavailable);
    assert.equal(s.calls.transitions.length, 0);
    assert.equal(s.db.applications.get("app-a").rsvpRespondedAt, null);
  }
});

test("revocation and POST use the same lock: a preceding revocation prevents the response", async () => {
  const s = setup();
  const [revoked, response] = await Promise.all([
    s.helper.revokeRsvpTokens("app-a"), s.submit("CONFIRMED"),
  ]);
  assert.equal(revoked, 2);
  assert.deepEqual(plain(response), unavailable);
  assert.equal(s.calls.transitions.length, 0);
});

test("database failures produce safe UI/action states without logging or returning error details", async () => {
  const s = setup({ databaseError: new Error("sensitive database connection details") });
  const html = await s.render();
  assert.match(html, /RSVP link unavailable/);
  assert.doesNotMatch(html, /sensitive|connection|app-a|private/);
  assert.deepEqual(plain(await s.submit("CONFIRMED")), { status: "ERROR" });
  assert.equal(s.calls.transitions.length, 0);
});

test("client action states show receipts, generic failures, validation/retry feedback, and pending controls", () => {
  const jsx = require("react/jsx-runtime");
  for (const status of ["CONFIRMED", "DECLINED", "UNAVAILABLE", "INVALID_CHOICE", "ERROR", "PENDING"]) {
    const response = load(`${ROOT}/rsvp-response.tsx`, {
      react: { ...React, useActionState: () => [{ status }, () => {}, status === "PENDING"] },
      "react/jsx-runtime": jsx, "./actions": { respondToRsvp: async () => ({ status }) },
    });
    const html = renderToStaticMarkup(React.createElement(response.default, { token: "synthetic", initialStatus: "PENDING" }));
    if (status === "CONFIRMED") assert.match(html, /attendance is confirmed/);
    if (status === "DECLINED") assert.match(html, /declined attendance/);
    if (status === "UNAVAILABLE") assert.match(html, /RSVP link unavailable/);
    if (["CONFIRMED", "DECLINED", "UNAVAILABLE"].includes(status)) assert.doesNotMatch(html, /<form|<button/);
    if (status === "INVALID_CHOICE") assert.match(html, /Please choose Confirm attendance or Decline/);
    if (status === "ERROR") assert.match(html, /could not save your response/);
    if (status === "PENDING") {
      assert.match(html, /Saving your response/);
      assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
    }
  }
});

test("RSVP requests bypass Supabase Auth and receive privacy headers; other route gates remain in place", async () => {
  const calls = [];
  const gateResponse = { gated: true };
  const proxy = load("src/proxy.ts", {
    "next/server": { NextResponse: { next: () => ({ headers: new Headers() }) } },
    "@/lib/supabase/middleware": { updateSession: async (request) => { calls.push(request.nextUrl.pathname); return gateResponse; } },
  });
  for (const pathname of ["/rsvp", "/rsvp/opaque", "/rsvp/unavailable"]) {
    const response = await proxy.proxy({ nextUrl: { pathname } });
    assert.match(response.headers.get("Cache-Control"), /private.*no-store/);
    assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
    assert.equal(response.headers.get("X-Robots-Tag"), "noindex, nofollow");
  }
  assert.equal(calls.length, 0);
  for (const pathname of ["/dashboard", "/admin/applications", "/apply/form", "/rsvp-other"]) {
    assert.equal(await proxy.proxy({ nextUrl: { pathname } }), gateResponse);
  }
  assert.deepEqual(calls, ["/dashboard", "/admin/applications", "/apply/form", "/rsvp-other"]);
});
