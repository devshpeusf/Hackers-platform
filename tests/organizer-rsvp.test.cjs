// Run with: node --test tests/organizer-rsvp.test.cjs
// Real actions, RSVP helper, worker and pages. In-memory Prisma/Auth/provider only.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const crypto = require("node:crypto");
const React = require("react");
const jsx = require("react/jsx-runtime");
const { renderToStaticMarkup } = require("react-dom/server");
const NOW = Date.parse("2026-10-23T12:00:00Z");
const plain = (value) => JSON.parse(JSON.stringify(value));
const compiled = new Map();
const noLogs = Object.fromEntries(["log", "error", "warn", "info", "debug"].map((name) => [name, () => assert.fail("Unexpected credential/error logging")]));

function load(path, modules, globals = {}) {
  if (!compiled.has(path)) compiled.set(path, ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText);
  const context = { exports: {}, console: noLogs, ...globals, require: (name) => {
    assert.ok(Object.hasOwn(modules, name), `Unexpected dependency: ${name}`);
    return modules[name];
  } };
  vm.runInNewContext(compiled.get(path), context);
  return context.exports;
}
const decisions = load("src/lib/decisions.ts", {});
const userLib = load("src/lib/supabase/user.ts", {});
const siteUrl = load("src/lib/site-url.ts", {}, { URL });
const statuses = load("src/app/admin/applications/status.ts", {});
const clsx = load("src/lib/clsx.ts", {});
const portal = load("src/lib/portal-access.ts", {});
const link = { __esModule: true, default: ({ children, ...props }) => jsx.jsx("a", { ...props, children }) };
const card = { __esModule: true, default: ({ children, className }) => jsx.jsx("div", { className, children }) };
const chip = { __esModule: true, default: ({ children }) => jsx.jsx("span", { children }) };

const app = (id = "app-a", status = "ACCEPTED", rsvpStatus = "CONFIRMED", eventId = "event-now") => ({
  badgeToken: status === "ACCEPTED" ? crypto.randomBytes(32).toString("base64url") : null,
  id, status, rsvpStatus, eventId, personId: `person-${id}`, decidedAt: new Date(NOW - 60_000),
  rsvpRespondedAt: rsvpStatus === "PENDING" ? null : new Date(NOW - 1000), createdAt: new Date(NOW - 100_000),
  dateOfBirth: new Date("2000-01-01"), agreementsAt: new Date(NOW - 100_000), graduation: "2027-05",
  person: { firstName: id, lastName: "Applicant", email: `${id}@example.invalid`, resume: null },
  event: { name: "Current Event", startDate: new Date(NOW + 86_400_000), organizerHqUrl: "https://example.invalid/mlh" },
  school: "School", levelOfStudy: "University", decidedBy: null,
});
const email = (applicationId = "app-a", status = "SENT", emailType = "ACCEPTED") => ({
  id: `mail-${applicationId}-${emailType}`, applicationId, emailType, status, attempts: 0, lastError: null,
  sentAt: status === "SENT" ? new Date(NOW - 5000) : null, createdAt: new Date(NOW - 10_000),
});
function project(row, select) {
  if (!row) return null;
  if (Array.isArray(row)) return row.map((item) => project(item, select));
  return Object.fromEntries(Object.entries(select).map(([key, selection]) => [key,
    selection === true ? row[key] : project(row[key], selection.select),
  ]));
}
const matches = (value, condition) => condition === undefined || (typeof condition === "object" && condition !== null
  ? (condition.in ? condition.in.includes(value) : value !== condition.not) : value === condition);

function setup({ applications = [app()], emails = [], organizer = true, signedIn = true, authError = null, revokeError = false, beforeDecisionWrite, failBadgeWriteAt = 0 } = {}) {
  const db = { apps: new Map(applications.map((a) => [a.id, structuredClone(a)])), queue: structuredClone(emails), tokens: [] };
  const clock = { now: NOW };
  const calls = { locks: [], writes: [], revocations: [], queueWrites: [], transactions: 0, queries: [], sends: [], emailProps: [], logs: [], badgeRandomBytes: [], badgeWrites: [], commits: [] };
  class ServerDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now; }
  }
  const env = { RSVP_URL: "https://example.invalid/rsvp", CRON_SECRET: "mock-cron" };
  const user = signedIn ? { identities: [{ provider: "discord", identity_data: { sub: "verified-organizer" } }], user_metadata: { provider_id: "untrusted" } } : null;
  const auth = { createClient: async () => ({ auth: { getUser: async () => ({ data: { user }, error: authError }) } }) };
  const fullApp = (a) => a ? { ...a, emailQueue: db.queue.filter((e) => e.applicationId === a.id), rsvpTokens: db.tokens.filter((t) => t.applicationId === a.id) } : null;
  const matchesApp = (a, where) => matches(a.id, where.id) && matches(a.eventId, where.eventId) && matches(a.status, where.status) &&
    matches(a.badgeToken, where.badgeToken) &&
    matches(a.rsvpStatus, where.rsvpStatus) && !(where.NOT?.OR ?? []).some((rule) => rule.status === a.status &&
      db.queue.some((e) => e.applicationId === a.id && e.emailType === rule.emailQueue.some.emailType && rule.emailQueue.some.status.in.includes(e.status))) &&
    (!where.rsvpTokens || db.tokens.some((t) => t.applicationId === a.id && t.tokenHash === where.rsvpTokens.some.tokenHash &&
      t.revokedAt === null && t.expiresAt > where.rsvpTokens.some.expiresAt.gt));
  const changeApplications = async (query) => {
    if (query.data.badgeToken) {
      calls.badgeWrites.push(query);
      if (calls.badgeWrites.length === failBadgeWriteAt) {
        throw Object.assign(new Error(`Synthetic uniqueness failure: ${query.data.badgeToken}`), { code: "P2002" });
      }
      assert.ok(![...db.apps.values()].some((a) => a.badgeToken === query.data.badgeToken), "Distinct badge credentials");
    }
    if (beforeDecisionWrite && query.data.status) await beforeDecisionWrite({ db });
    calls.writes.push(query);
    const changed = [];
    for (const a of db.apps.values()) if (matchesApp(a, query.where)) { Object.assign(a, query.data); changed.push({ id: a.id }); }
    return changed;
  };
  const tables = {
    person: { findUnique: async ({ where }) => {
      assert.equal(where.discordId, "verified-organizer");
      return { id: "organizer", role: organizer ? "ORGANIZER" : "APPLICANT" };
    } },
    event: { findFirst: async (query) => { calls.queries.push(["event", query]); return { id: "event-now", name: "Current Event" }; } },
    application: {
      findUnique: async (query) => { const a = fullApp(db.apps.get(query.where.id)); return query.select ? project(a, query.select) : a; },
      findMany: async (query) => {
        calls.queries.push(["applications", query]);
        return [...db.apps.values()].filter((a) => matchesApp(a, query.where)).map((a) => project(fullApp(a), query.select));
      },
      groupBy: async (query) => {
        calls.queries.push(["counts", query]);
        assert.deepEqual(plain(query.by), ["status", "rsvpStatus"]);
        const groups = new Map();
        for (const a of db.apps.values()) if (a.eventId === query.where.eventId) {
          const key = `${a.status}/${a.rsvpStatus}`;
          if (!groups.has(key)) groups.set(key, { status: a.status, rsvpStatus: a.rsvpStatus, _count: { _all: 0 } });
          groups.get(key)._count._all++;
        }
        return [...groups.values()];
      },
      updateMany: async (query) => ({ count: (await changeApplications(query)).length }),
      updateManyAndReturn: changeApplications,
    },
    rsvpToken: {
      create: async ({ data }) => {
        assert.deepEqual(Object.keys(data).sort(), ["applicationId", "expiresAt", "tokenHash"]);
        const row = { id: `invitation-${db.tokens.length}`, createdAt: new Date(clock.now), revokedAt: null, ...data };
        db.tokens.push(row);
        return { id: row.id };
      },
      findUnique: async ({ where, select }) => {
        const token = db.tokens.find((t) => t.tokenHash === where.tokenHash);
        return token ? project({ ...token, application: fullApp(db.apps.get(token.applicationId)) }, select) : null;
      },
      updateMany: async ({ where, data }) => {
        calls.revocations.push({ where, data });
        if (revokeError) throw new Error("Synthetic revocation failure");
        let count = 0;
        for (const t of db.tokens) if (matches(t.applicationId, where.applicationId) && t.revokedAt === null && t.expiresAt > where.expiresAt.gt) {
          Object.assign(t, data); count++;
        }
        return { count };
      },
    },
    emailQueue: {
      updateMany: async ({ where, data }) => {
        calls.queueWrites.push({ where, data });
        let count = 0;
        for (const e of db.queue) if (matches(e.applicationId, where.applicationId) && matches(e.emailType, where.emailType) && matches(e.status, where.status)) {
          Object.assign(e, data); count++;
        }
        return { count };
      },
      update: async ({ where, data }) => { const e = db.queue.find((row) => row.id === where.id); Object.assign(e, data); return e; },
      findMany: async ({ where }) => db.queue.filter((e) => where.id.in.includes(e.id)).map((e) => ({ ...e, application: fullApp(db.apps.get(e.applicationId)) })),
      count: async ({ where }) => db.queue.filter((e) => e.status === where.status).length,
    },
  };
  // Serialize mocked transactions, with full rollback on failure. The tests
  // separately assert that production code takes explicit application locks.
  let tail = Promise.resolve();
  const prisma = { ...tables, $transaction: async (run) => {
    const previous = tail;
    let release;
    tail = new Promise((resolve) => { release = resolve; });
    await previous;
    calls.transactions++;
    const saved = structuredClone(db);
    const tx = { ...tables, $queryRaw: async (strings, ...values) => {
      const sql = strings.join("?");
      assert.match(sql, /FOR UPDATE/);
      calls.locks.push({ sql, values });
      const ids = Array.isArray(values[0]) ? values[0] : [values[0]];
      if (Array.isArray(values[0])) assert.match(sql, /ORDER BY "id" FOR UPDATE/);
      return ids.filter((id) => db.apps.has(id) && (!values[1] || db.apps.get(id).eventId === values[1])).map((id) => ({ id }));
    } };
    try {
      const result = await run(tx);
      calls.commits.push(structuredClone([...db.apps.values()]));
      return result;
    }
    catch (error) { Object.assign(db, saved); throw error; }
    finally { release(); }
  }, $queryRaw: async (strings, limit) => {
    assert.match(strings.join("?"), /FOR UPDATE SKIP LOCKED/);
    const rows = db.queue.filter((e) => e.status === "PENDING").slice(0, limit);
    for (const e of rows) e.status = "SENDING";
    return rows.map(({ id }) => ({ id }));
  } };
  const rsvp = load("src/lib/rsvp.ts", { "server-only": {}, "node:crypto": crypto, "@/lib/prisma": { prisma } }, { Date: ServerDate });
  const badge = load("src/lib/badge.ts", {
    "server-only": {}, "qrcode": require("qrcode"), "@/lib/prisma": { prisma }, "@/lib/portal-access": portal,
    "node:crypto": { randomBytes: (size) => { calls.badgeRandomBytes.push(size); return crypto.randomBytes(size); } },
  });
  const actions = load("src/app/admin/applications/actions.ts", {
    "@/lib/prisma": { prisma }, "@/lib/rsvp": rsvp, "@/lib/badge": badge, "@/lib/site-url": siteUrl, "@/lib/decisions": decisions,
    "@/lib/supabase/server": auth, "@/lib/supabase/user": userLib,
    "next/cache": { revalidatePath: () => {} }, "next/navigation": { redirect: (url) => { throw new Error(`REDIRECT:${url}`); } },
  }, { process: { env }, Date: ServerDate, URLSearchParams });
  const runAction = async (name, fields) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) for (const item of [].concat(value)) form.append(key, item);
    try { await actions[name](form); return null; }
    catch (e) { if (e.message.startsWith("REDIRECT:")) return e.message.slice(9); throw e; }
  };
  const pageModules = {
    "react/jsx-runtime": jsx, "next/link": link, "@/lib/prisma": { prisma }, "@/lib/clsx": clsx,
    "@/lib/decisions": decisions, "@/components/ui/PixelCard": card, "@/components/ui/PixelChip": chip,
    "@/lib/organizer": load("src/lib/organizer.ts", {
      "@/lib/prisma": { prisma }, "@/lib/supabase/server": auth, "@/lib/supabase/user": userLib,
      "next/navigation": {
        redirect: () => { throw new Error("ORGANIZER_REQUIRED"); },
        notFound: () => { throw new Error("ORGANIZER_REQUIRED"); },
      },
    }),
  };
  const admin = load("src/app/admin/applications/page.tsx", {
    ...pageModules, "./status": statuses, "./actions": actions, "./search-box": { __esModule: true, default: () => null },
    "./bulk-decide": { BulkDecideBar: () => null, SelectAll: () => null }, "./bulk-form": { BULK_FORM_ID: "bulk-form" },
  }, { URLSearchParams });
  const accepted = { __esModule: true, default: (props) => { calls.emailProps.push(props); return jsx.jsx("div", { children: "Accepted" }); } };
  const other = { __esModule: true, default: () => jsx.jsx("div", {}) };
  const worker = load("src/app/api/jobs/send-queued/route.ts", {
    "@/lib/prisma": { prisma }, "@/lib/rsvp": rsvp, "@/lib/site-url": siteUrl,
    "@/lib/email": { sendEmail: async (args) => { calls.sends.push(args); return { id: "mock-delivery" }; } },
    "@emails/AcceptedEmail": accepted, "@emails/ConfirmationEmail": other, "@emails/WaitlistedEmail": other, "@emails/RejectedEmail": other,
    "next/server": { NextResponse: { json: (body) => body } },
  }, { process: { env }, Date: ServerDate, setTimeout: (fn) => fn(), console: { ...noLogs, error: (...args) => calls.logs.push(args) } });
  const runWorker = () => worker.POST({ headers: new Headers({ authorization: "Bearer mock-cron" }) });
  const renderAdmin = async (filters = {}) => renderToStaticMarkup(await admin.default({ searchParams: Promise.resolve(filters) }));
  return { db, clock, env, calls, rsvp, actions, runAction, runWorker, renderAdmin, prisma, auth, pageModules };
}

// Badge lifecycle: exercise the actual decision actions and issuance helper in
// the same rollback-capable transaction mock used for RSVP consistency.
for (const mode of ["decideApplication", "decideApplications"]) {
  for (const status of ["SUBMITTED", "WAITLISTED", "REJECTED"]) {
    test(`${mode}: ${status} acceptance issues a badge before the transaction completes`, async () => {
      const s = setup({ applications: [app("fresh", status)] });
      assert.equal(s.db.apps.get("fresh").badgeToken, null);
      await s.runAction(mode, { id: "fresh", ids: ["fresh"], decision: "ACCEPTED" });
      const accepted = s.calls.commits.at(-1).find((a) => a.id === "fresh");
      assert.equal(accepted.status, "ACCEPTED");
      assert.match(accepted.badgeToken, /^[A-Za-z0-9_-]{43}$/);
      assert.deepEqual(s.calls.badgeRandomBytes, [32]);
      assert.equal(s.calls.transactions, 1);
      assert.equal(s.calls.locks.length, 1);
      assert.equal(s.db.tokens.length, 0, "Badge and RSVP issuance remain separate");
      assert.equal(s.db.queue.length, 0);
    });
  }

  for (const decision of ["WAITLISTED", "REJECTED"]) {
    test(`${mode}: ${decision} decisions and untouched SUBMITTED applications never issue badges`, async () => {
      const s = setup({ applications: [app("changed", "SUBMITTED"), app("untouched", "SUBMITTED")] });
      await s.runAction(mode, { id: "changed", ids: ["changed"], decision });
      assert.equal(s.db.apps.get("changed").status, decision);
      assert.equal(s.db.apps.get("untouched").status, "SUBMITTED");
      assert.ok([...s.db.apps.values()].every((a) => a.badgeToken === null));
      assert.equal(s.calls.badgeWrites.length, 0);
      assert.equal(s.calls.badgeRandomBytes.length, 0);
    });
  }

  test(`${mode}: withdrawal and re-acceptance preserve the original badge, including no-op acceptance`, async () => {
    for (const decision of ["WAITLISTED", "REJECTED"]) {
      const s = setup();
      const token = s.db.apps.get("app-a").badgeToken;
      await s.runAction(mode, { id: "app-a", ids: ["app-a"], decision });
      assert.equal(s.db.apps.get("app-a").badgeToken, token);
      await s.runAction(mode, { id: "app-a", ids: ["app-a"], decision: "ACCEPTED" });
      await s.runAction(mode, { id: "app-a", ids: ["app-a"], decision: "ACCEPTED" });
      assert.equal(s.db.apps.get("app-a").badgeToken, token);
      assert.equal(s.calls.badgeRandomBytes.length, 0);
      assert.equal(s.calls.badgeWrites.length, 0);
    }
  });

  test(`${mode}: a badge uniqueness failure rolls back admission and response changes without leaking the credential`, async () => {
    const s = setup({ applications: [app("fresh", "WAITLISTED", "DECLINED")], failBadgeWriteAt: 1 });
    const before = plain([...s.db.apps.values()]);
    await assert.rejects(s.runAction(mode, { id: "fresh", ids: ["fresh"], decision: "ACCEPTED" }), (error) => {
      assert.equal(error.message, "Badge issuance failed. Acceptance was not saved.");
      assert.ok(!error.stack.includes(s.calls.badgeWrites[0].data.badgeToken));
      assert.equal(error.cause, undefined);
      return true;
    });
    assert.deepEqual(plain([...s.db.apps.values()]), before);
    assert.equal(s.calls.commits.length, 0);
    assert.equal(s.db.tokens.length, 0);
  });
}

test("individual acceptance overrides retain the email guard and issue a badge only after explicit override", async () => {
  const s = setup({ applications: [app("fresh", "REJECTED")], emails: [email("fresh", "SENT", "REJECTED")] });
  assert.match(await s.runAction("decideApplication", { id: "fresh", decision: "ACCEPTED" }), /decision=locked/);
  assert.equal(s.calls.badgeRandomBytes.length, 0);
  await s.runAction("decideApplication", { id: "fresh", decision: "ACCEPTED", override: "true" });
  assert.match(s.db.apps.get("fresh").badgeToken, /^[A-Za-z0-9_-]{43}$/);
});

test("bulk acceptance issues distinct badges only for changed, unlocked applications in the current event", async () => {
  const s = setup({ applications: [app("a", "SUBMITTED"), app("b", "WAITLISTED"), app("same"), app("locked", "REJECTED"), app("old", "SUBMITTED", "PENDING", "event-old")],
    emails: [email("locked", "SENT", "REJECTED")] });
  const existing = s.db.apps.get("same").badgeToken;
  await s.runAction("decideApplications", { ids: ["a", "b", "same", "locked", "old"], decision: "ACCEPTED", override: "true" });
  const tokens = ["a", "b", "same"].map((id) => s.db.apps.get(id).badgeToken);
  assert.ok(tokens.every((token) => /^[A-Za-z0-9_-]{43}$/.test(token)));
  assert.equal(new Set(tokens).size, 3);
  assert.equal(s.db.apps.get("same").badgeToken, existing);
  assert.equal(s.db.apps.get("locked").badgeToken, null);
  assert.equal(s.db.apps.get("old").badgeToken, null);
  assert.equal(s.calls.badgeWrites.length, 2);
});

test("failure on the second bulk badge rolls back the first badge and every acceptance", async () => {
  const s = setup({ applications: [app("a", "SUBMITTED"), app("b", "WAITLISTED")], failBadgeWriteAt: 2 });
  const before = plain([...s.db.apps.values()]);
  await assert.rejects(s.runAction("decideApplications", { ids: ["a", "b"], decision: "ACCEPTED" }), /Acceptance was not saved/);
  assert.equal(s.calls.badgeWrites.length, 2);
  assert.deepEqual(plain([...s.db.apps.values()]), before);
  assert.equal(s.calls.commits.length, 0);
});

for (const decision of ["WAITLISTED", "REJECTED"]) {
  test(`individual ACCEPTED to ${decision} revokes every active retry link and retains the recorded response`, async () => {
    const s = setup();
    const first = await s.rsvp.issueRsvpToken("app-a");
    const retry = await s.rsvp.issueRsvpToken("app-a");
    const before = plain(s.db.apps.get("app-a"));
    await s.runAction("decideApplication", { id: "app-a", decision });
    assert.equal(s.db.apps.get("app-a").status, decision);
    assert.equal(s.db.apps.get("app-a").rsvpStatus, before.rsvpStatus);
    assert.equal(s.db.apps.get("app-a").rsvpRespondedAt.toISOString(), before.rsvpRespondedAt);
    for (const raw of [first, retry]) assert.equal((await s.rsvp.resolveRsvpToken(raw)).status, "REVOKED");
    assert.ok(s.calls.locks.length >= 4);
    assert.equal(s.calls.sends.length, 0);
  });
}

test("ACCEPTED no-op preserves response, timestamps and credentials; SUBMITTED target remains unsupported", async () => {
  const s = setup();
  const raw = await s.rsvp.issueRsvpToken("app-a");
  const before = plain(s.db.apps.get("app-a"));
  await s.runAction("decideApplication", { id: "app-a", decision: "ACCEPTED" });
  await s.runAction("decideApplication", { id: "app-a", decision: "SUBMITTED" });
  assert.deepEqual(plain(s.db.apps.get("app-a")), before);
  assert.equal((await s.rsvp.resolveRsvpToken(raw)).status, "VALID");
  assert.equal(s.calls.revocations.length, 0);
});

for (const previousResponse of ["CONFIRMED", "DECLINED"]) for (const withdrawnStatus of ["WAITLISTED", "REJECTED"]) {
  test(`${previousResponse} withdrawal to ${withdrawnStatus}, re-acceptance, explicit resend and a new public response form one fresh cycle`, async () => {
    const s = setup({ applications: [app("app-a", "ACCEPTED", previousResponse)], emails: [email()] });
    const old = await s.rsvp.issueRsvpToken("app-a");
    await s.runAction("decideApplication", { id: "app-a", decision: withdrawnStatus, override: "true" });
    const revokedAt = s.db.tokens[0].revokedAt.getTime();
    s.clock.now += 1000;
    await s.runAction("decideApplication", { id: "app-a", decision: "ACCEPTED" });
    assert.equal(s.db.apps.get("app-a").rsvpStatus, "PENDING");
    assert.equal(s.db.apps.get("app-a").rsvpRespondedAt, null);
    assert.equal(s.db.queue[0].status, "SENT", "Re-acceptance itself must not queue another email");
    assert.equal((await s.rsvp.resolveRsvpToken(old)).status, "REVOKED");
    assert.match(await s.runAction("queueRsvpInvitation", { id: "app-a" }), /invitation=queued/);
    assert.equal(s.db.queue.length, 1);
    assert.equal(s.db.queue[0].id, "mail-app-a-ACCEPTED");
    assert.equal(s.db.queue[0].status, "PENDING");
    assert.equal(s.db.tokens.length, 1, "Queueing itself must not issue a credential");
    assert.match(await s.runAction("queueRsvpInvitation", { id: "app-a" }), /invitation=unchanged/);
    await s.runWorker();
    assert.equal(s.calls.sends.length, 1);
    const fresh = new URL(s.calls.emailProps[0].rsvpUrl).pathname.split("/").at(-1);
    assert.notEqual(fresh, old);
    assert.equal(s.db.tokens.length, 2);
    assert.deepEqual(plain(await s.rsvp.recordRsvpResponse(fresh, previousResponse === "CONFIRMED" ? "DECLINED" : "CONFIRMED")),
      { status: previousResponse === "CONFIRMED" ? "DECLINED" : "CONFIRMED" });
    assert.equal((await s.rsvp.resolveRsvpToken(old)).status, "REVOKED");
    assert.equal(s.db.tokens[0].revokedAt.getTime(), revokedAt);
    assert.ok(!JSON.stringify(s.calls.logs).includes(fresh));
  });
}

test("pending old acceptance emails are parked for review and cannot auto-send on re-acceptance", async () => {
  const s = setup({ emails: [email("app-a", "PENDING")] });
  await s.runAction("decideApplication", { id: "app-a", decision: "WAITLISTED" });
  assert.equal(s.db.queue[0].status, "FAILED");
  assert.equal(s.db.queue[0].attempts, 0);
  await s.runAction("decideApplication", { id: "app-a", decision: "ACCEPTED" });
  await s.runWorker();
  assert.equal(s.calls.sends.length, 0);
});

test("sent/sending locks require individual override; bulk never overrides", async () => {
  for (const status of ["SENT", "SENDING"]) {
    const s = setup({ emails: [email("app-a", status)] });
    const raw = await s.rsvp.issueRsvpToken("app-a");
    assert.match(await s.runAction("decideApplication", { id: "app-a", decision: "REJECTED" }), /decision=locked/);
    await s.runAction("decideApplications", { ids: ["app-a"], decision: "REJECTED", override: "true" });
    assert.equal(s.db.apps.get("app-a").status, "ACCEPTED");
    assert.equal(s.calls.revocations.length, 0);
    await s.runAction("decideApplication", { id: "app-a", decision: "REJECTED", override: "true" });
    assert.equal((await s.rsvp.resolveRsvpToken(raw)).status, "REVOKED");
  }
});

for (const mode of ["decideApplication", "decideApplications"]) {
  test(`${mode} rolls back admission, responses and credentials if revocation fails`, async () => {
    const s = setup({ revokeError: true });
    const raw = await s.rsvp.issueRsvpToken("app-a");
    const before = plain([...s.db.apps.values()]);
    await assert.rejects(s.runAction(mode, { id: "app-a", ids: ["app-a"], decision: "WAITLISTED" }), /Synthetic revocation failure/);
    assert.deepEqual(plain([...s.db.apps.values()]), before);
    assert.equal((await s.rsvp.resolveRsvpToken(raw)).status, "VALID");
  });
}

test("bulk changes revoke only changed ACCEPTED rows in one write and keep other events untouched", async () => {
  const s = setup({ applications: [app("a"), app("b"), app("c", "WAITLISTED"), app("old", "ACCEPTED", "CONFIRMED", "event-old")] });
  const raws = await Promise.all([s.rsvp.issueRsvpToken("a"), s.rsvp.issueRsvpToken("b"), s.rsvp.issueRsvpToken("old")]);
  await s.runAction("decideApplications", { ids: ["a", "b", "c", "old"], decision: "REJECTED" });
  assert.equal(s.calls.revocations.length, 1);
  assert.deepEqual(plain(s.calls.revocations[0].where.applicationId.in).sort(), ["a", "b"]);
  assert.equal((await s.rsvp.resolveRsvpToken(raws[0])).status, "REVOKED");
  assert.equal((await s.rsvp.resolveRsvpToken(raws[1])).status, "REVOKED");
  assert.equal((await s.rsvp.resolveRsvpToken(raws[2])).status, "VALID");
  assert.equal(s.db.apps.get("old").status, "ACCEPTED");
  assert.match(s.calls.locks.at(-1).sql, /ORDER BY "id" FOR UPDATE/);
});

test("bulk writes that lose the email-lock race cannot revoke skipped rows", async () => {
  const s = setup({ applications: [app("a"), app("b")], beforeDecisionWrite: async ({ db }) => {
    if (!db.queue.length) db.queue.push(email("b", "SENDING"));
  } });
  await s.rsvp.issueRsvpToken("a");
  const protectedRaw = await s.rsvp.issueRsvpToken("b");
  await s.runAction("decideApplications", { ids: ["a", "b"], decision: "WAITLISTED" });
  assert.equal(s.db.apps.get("b").status, "ACCEPTED");
  assert.deepEqual(plain(s.calls.revocations[0].where.applicationId.in), ["a"]);
  assert.equal((await s.rsvp.resolveRsvpToken(protectedRaw)).status, "VALID");
});

test("individual writes also recheck a newly SENDING email before changing admission or revoking", async () => {
  const s = setup({ beforeDecisionWrite: async ({ db }) => { db.queue.push(email("app-a", "SENDING")); } });
  const raw = await s.rsvp.issueRsvpToken("app-a");
  assert.match(await s.runAction("decideApplication", { id: "app-a", decision: "REJECTED" }), /decision=locked/);
  assert.equal(s.db.apps.get("app-a").status, "ACCEPTED");
  assert.equal(s.calls.revocations.length, 0);
  assert.equal((await s.rsvp.resolveRsvpToken(raw)).status, "VALID");
});

test("concurrent explicit resend submissions reuse the old row exactly once without issuing tokens", async () => {
  const s = setup({ applications: [app("app-a", "ACCEPTED", "PENDING")], emails: [email()] });
  s.db.apps.get("app-a").decidedAt = new Date(NOW);
  const results = await Promise.all([
    s.runAction("queueRsvpInvitation", { id: "app-a" }), s.runAction("queueRsvpInvitation", { id: "app-a" }),
  ]);
  assert.equal(results.filter((url) => url.endsWith("invitation=queued")).length, 1);
  assert.equal(results.filter((url) => url.endsWith("invitation=unchanged")).length, 1);
  assert.equal(s.db.queue.length, 1);
  assert.equal(s.calls.queueWrites.length, 1);
  assert.equal(s.db.tokens.length, 0);
});

test("non-accepted changes do not revoke tokens, and fresh bulk acceptance resets only changed rows", async () => {
  const s = setup({ applications: [app("a", "WAITLISTED", "DECLINED"), app("b", "ACCEPTED", "CONFIRMED")] });
  await s.runAction("decideApplications", { ids: ["a"], decision: "REJECTED" });
  assert.equal(s.calls.revocations.length, 0);
  await s.runAction("decideApplications", { ids: ["a", "b"], decision: "ACCEPTED" });
  assert.equal(s.db.apps.get("a").rsvpStatus, "PENDING");
  assert.equal(s.db.apps.get("a").rsvpRespondedAt, null);
  assert.equal(s.db.apps.get("b").rsvpStatus, "CONFIRMED");
  assert.notEqual(s.db.apps.get("b").rsvpRespondedAt, null);
});

test("expired/revoked history is retained and concurrent public responses cannot outlive withdrawal", async () => {
  const s = setup({ applications: [app("app-a", "ACCEPTED", "PENDING")] });
  const raw = await s.rsvp.issueRsvpToken("app-a");
  s.db.tokens.push({ applicationId: "app-a", tokenHash: "expired-fixture", expiresAt: new Date(NOW), revokedAt: null });
  s.db.tokens.push({ applicationId: "app-a", tokenHash: "revoked-fixture", expiresAt: new Date(NOW + 1000), revokedAt: new Date(NOW - 100) });
  await Promise.all([
    s.runAction("decideApplication", { id: "app-a", decision: "REJECTED" }),
    s.rsvp.recordRsvpResponse(raw, "CONFIRMED"),
  ]);
  assert.equal((await s.rsvp.resolveRsvpToken(raw)).status, "REVOKED");
  assert.equal(s.db.tokens[1].revokedAt, null);
  assert.equal(s.db.tokens[2].revokedAt.getTime(), NOW - 100);
});

test("fresh invitation controls reject active/current-cycle links, nonpending responses and in-flight queue rows", async () => {
  const s = setup({ applications: [app("app-a", "ACCEPTED", "PENDING")], emails: [email()] });
  await s.rsvp.issueRsvpToken("app-a");
  assert.match(await s.runAction("queueRsvpInvitation", { id: "app-a" }), /invitation=unchanged/);
  for (const status of ["PENDING", "SENDING"]) {
    s.db.queue[0].status = status;
    assert.match(await s.runAction("queueRsvpInvitation", { id: "app-a" }), /invitation=unchanged/);
  }
  s.db.queue[0].status = "FAILED";
  s.db.apps.get("app-a").rsvpStatus = "DECLINED";
  assert.match(await s.runAction("queueRsvpInvitation", { id: "app-a" }), /invitation=unchanged/);
  delete s.env.RSVP_URL;
  assert.match(await s.runAction("queueRsvpInvitation", { id: "app-a" }), /invitation=blocked/);
  assert.equal(s.calls.queueWrites.length, 0);
});

test("counts and row labels use only current-event accepted responses, even under decision filtering", async () => {
  const s = setup({ applications: [
    app("pending-a", "ACCEPTED", "PENDING"), app("pending-b", "ACCEPTED", "PENDING"),
    app("confirmed", "ACCEPTED", "CONFIRMED"), app("declined", "ACCEPTED", "DECLINED"),
    app("waiting", "WAITLISTED", "CONFIRMED"), app("rejected", "REJECTED", "DECLINED"),
    app("old", "ACCEPTED", "CONFIRMED", "event-old"),
  ] });
  for (const filters of [{}, { status: "WAITLISTED" }]) {
    const html = await s.renderAdmin(filters);
    const section = html.match(/<section aria-label="Accepted applicant RSVPs"[\s\S]*?<\/section>/)[0];
    const values = Object.fromEntries([...section.matchAll(/<dt[^>]*>([^<]+)<\/dt><dd[^>]*>(\d+)<\/dd>/g)].map((m) => [m[1], Number(m[2])]));
    assert.deepEqual(values, { "Accepted offers": 4, "Awaiting RSVP": 2, Confirmed: 1, Declined: 1 });
    assert.equal(values["Accepted offers"], values["Awaiting RSVP"] + values.Confirmed + values.Declined);
    const list = html.match(/<ul>[\s\S]*?<\/ul>/)[0];
    if (filters.status) assert.doesNotMatch(list, /RSVP PENDING|>CONFIRMED<|>DECLINED</);
    else assert.match(list, /RSVP PENDING/);
    assert.doesNotMatch(list, /old@/);
  }
  assert.ok(s.calls.queries.filter(([kind]) => kind === "counts").every(([, query]) => query.where.eventId === "event-now"));
});

for (const denied of [{ organizer: false }, { signedIn: false }, { authError: new Error("Synthetic auth error") }]) {
  test(`organizer data and decision/resend actions fail closed: ${Object.keys(denied)[0]}`, async () => {
    const s = setup(denied);
    await assert.rejects(s.renderAdmin(), /ORGANIZER_REQUIRED/);
    for (const name of ["decideApplication", "decideApplications", "queueRsvpInvitation"]) {
      await s.runAction(name, { id: "app-a", ids: ["app-a"], decision: "REJECTED" });
    }
    assert.equal(s.calls.queries.length, 0);
    assert.equal(s.calls.transactions, 0);
  });
}

test("the application status surface passes only the session-owned RSVP state to the accurate card", async () => {
  const statusContent = load("src/lib/status-card.ts", {});
  const statusCard = load("src/components/StatusCard.tsx", {
    "react/jsx-runtime": jsx, "next/link": link, "@/components/ui/PixelCard": card, "@/lib/status-card": statusContent,
    // Signed-in RSVP buttons (PLAT-45): only rendered for ACCEPTED + PENDING,
    // which this test doesn't cover. Covered in tests/rsvp-signed-in.test.cjs.
    "@/components/RsvpButtons": { __esModule: true, default: () => null },
  });
  for (const rsvpStatus of ["CONFIRMED", "DECLINED"]) {
    const s = setup();
    const application = app("own", "ACCEPTED", rsvpStatus);
    const page = load("src/app/(apply)/apply/status/page.tsx", {
      "react/jsx-runtime": jsx, "next/link": link, "next/image": { __esModule: true, default: () => null },
      "next/navigation": { redirect: () => assert.fail("Signed-in viewer should reach their status") },
      "@/lib/clsx": clsx, "@/lib/supabase/server": s.auth, "@/lib/supabase/user": userLib,
      "@/lib/applications": { getApplication: async (id) => { assert.equal(id, "verified-organizer"); return application; } },
      "@/components/ui/PixelCard": card, "@/components/ui/Field": { __esModule: true, default: () => null },
      "@/components/StatusCard": statusCard,
      // Dashboard button on /apply/status (only for portal-eligible viewers).
      "@/lib/portal-access": load("src/lib/portal-access.ts", {}),
      "@/lib/placeholder-data": { mlhRegistration: {}, applicationCopy: { questions: ["why", "build", "fact"] } },
      "../../_shared": { STARFIELD: "" },
    });
    const html = renderToStaticMarkup(await page.default());
    assert.match(html, new RegExp(`ACCEPTED · ${rsvpStatus}`));
    assert.doesNotMatch(html, /Watch your email for the link/);
  }
});

test("the organizer detail page exposes the explicit fresh-cycle control and hides it once queued", async () => {
  const s = setup({ applications: [app("app-a", "ACCEPTED", "PENDING")], emails: [email()] });
  await s.rsvp.issueRsvpToken("app-a");
  await s.runAction("decideApplication", { id: "app-a", decision: "WAITLISTED", override: "true" });
  await s.runAction("decideApplication", { id: "app-a", decision: "ACCEPTED" });
  const detail = load("src/app/admin/applications/[id]/page.tsx", {
    ...s.pageModules, "../status": statuses, "../actions": s.actions,
    "next/navigation": { notFound: () => assert.fail("Fixture application exists") },
    "@/lib/placeholder-data": { applicationCopy: { questions: ["why", "build", "fact"] } },
    "@/components/ui/Field": { __esModule: true, default: () => null },
  }, { process: { env: s.env } });
  const renderDetail = async () => renderToStaticMarkup(await detail.default({
    params: Promise.resolve({ id: "app-a" }), searchParams: Promise.resolve({}),
  }));
  const before = await renderDetail();
  assert.match(before, /QUEUE NEW RSVP INVITATION/);
  assert.match(before, /RSVP PENDING/);
  assert.ok(!before.includes(s.db.tokens[0].tokenHash));
  await s.runAction("queueRsvpInvitation", { id: "app-a" });
  assert.doesNotMatch(await renderDetail(), /QUEUE NEW RSVP INVITATION/);
});
