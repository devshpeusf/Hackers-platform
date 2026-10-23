// Run with: node --test tests/send-queued.test.cjs
// Real worker, token helper and templates; mocked Prisma/provider, no live DB/email.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const crypto = require("node:crypto");
const vm = require("node:vm");
const ts = require("typescript");
const { render } = require("@react-email/render");
const jsx = require("react/jsx-runtime");

const NOW = Date.parse("2026-10-23T12:00:00Z");
const plain = (value) => JSON.parse(JSON.stringify(value));
const compiled = new Map();
const noLogs = Object.fromEntries(["log", "error", "warn", "info", "debug"].map((name) => [
  name, () => assert.fail("Unexpected credential/error logging"),
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

const siteUrl = load("src/lib/site-url.ts", {}, { URL });
const shared = load("emails/_shared.tsx", { "react/jsx-runtime": jsx, "@react-email/components": require("@react-email/components") });
const templates = Object.fromEntries(["Confirmation", "Accepted", "Waitlisted", "Rejected"].map((name) => [
  `@emails/${name}Email`, load(`emails/${name}Email.tsx`, {
    "react/jsx-runtime": jsx, "@react-email/components": require("@react-email/components"), "./_shared": shared,
  }),
]));

function project(row, select) {
  if (!row) return null;
  return Object.fromEntries(Object.entries(select).map(([key, selection]) => [
    key, selection === true ? row[key] : project(row[key], selection.select),
  ]));
}

function setup({ types = ["ACCEPTED"], afterSnapshot, beforeTokenLock, afterTokenCreated, tokenError, sendFailure } = {}) {
  const applications = new Map(types.map((_, i) => [`app-${i}`, {
    id: `app-${i}`, status: "ACCEPTED", decidedAt: new Date(NOW - 1000), rsvpStatus: "PENDING", rsvpRespondedAt: null,
    person: { firstName: `Applicant ${i}`, email: `applicant-${i}@example.invalid` },
    event: { name: "Test Event", organizerHqUrl: "https://example.invalid/mlh", startDate: new Date(NOW + 86_400_000) },
  }]));
  const queue = types.map((emailType, i) => ({
    id: `queue-${i}`, applicationId: `app-${i}`, emailType, status: "PENDING", attempts: 0,
    lastError: null, sentAt: null, createdAt: new Date(NOW + i),
  }));
  const db = { applications, queue, tokens: [], transactionDepth: 0 };
  const env = { CRON_SECRET: "mock-scheduler", EMAIL_BATCH_SIZE: "20", RSVP_URL: "https://apply.example.invalid/rsvp" };
  const calls = { claims: [], reads: [], creates: [], generated: [], sends: [], logs: [], sleeps: [], acceptedProps: [], transactions: 0 };
  class ServerDate extends Date {
    constructor(...args) { super(...(args.length ? args : [NOW])); }
    static now() { return NOW; }
  }
  const tables = {
    application: { findUnique: async (query) => {
      calls.reads.push(query);
      return project(applications.get(query.where.id), query.select);
    } },
    rsvpToken: {
      create: async ({ data }) => {
        assert.equal(db.transactionDepth, 1, "Token persistence must be transactional");
        assert.deepEqual(Object.keys(data).sort(), ["applicationId", "expiresAt", "tokenHash"]);
        if (tokenError) throw tokenError;
        calls.creates.push({ ...data });
        const row = { id: `invitation-${db.tokens.length}`, revokedAt: null, createdAt: new Date(NOW), ...data };
        db.tokens.push(row);
        if (afterTokenCreated) await afterTokenCreated({ db });
        return { id: row.id };
      },
      findUnique: async ({ where, select }) => {
        const row = db.tokens.find((token) => token.tokenHash === where.tokenHash);
        return row ? project({ ...row, application: applications.get(row.applicationId) }, select) : null;
      },
      updateMany: () => assert.fail("Sending/retrying must not revoke existing invitations"),
    },
  };
  const lockTails = new Map();
  const prisma = {
    ...tables,
    $queryRaw: async (strings, ...values) => {
      const sql = strings.join("?");
      calls.claims.push(sql);
      assert.match(sql, /UPDATE "EmailQueue"[\s\S]*SET status = 'SENDING'/);
      assert.match(sql, /WHERE status = 'PENDING'[\s\S]*ORDER BY "createdAt" ASC[\s\S]*LIMIT \?[\s\S]*FOR UPDATE SKIP LOCKED/);
      const pending = queue.filter((row) => row.status === "PENDING").slice(0, values[0]);
      // Claim synchronously before yielding, like one atomic SQL statement.
      for (const row of pending) row.status = "SENDING";
      return pending.map(({ id }) => ({ id }));
    },
    $transaction: async (run) => {
      calls.transactions++;
      const releases = [];
      const tx = { ...tables, $queryRaw: async (strings, ...values) => {
        assert.match(strings.join("?"), /FROM "Application" WHERE "id" = \? FOR UPDATE/);
        const id = values[0];
        if (beforeTokenLock) await beforeTokenLock({ db });
        const previous = lockTails.get(id) ?? Promise.resolve();
        let release;
        lockTails.set(id, new Promise((resolve) => { release = resolve; }));
        await previous;
        releases.push(release);
        return applications.has(id) ? [{ id }] : [];
      } };
      db.transactionDepth++;
      try { return await run(tx); }
      finally { db.transactionDepth--; for (const release of releases) release(); }
    },
    emailQueue: {
      findMany: async ({ where }) => {
        const rows = queue.filter((row) => where.id.in.includes(row.id)).map((row) => ({
          ...row, application: applications.has(row.applicationId) ? { ...applications.get(row.applicationId) } : null,
        }));
        if (afterSnapshot) await afterSnapshot({ db });
        return rows;
      },
      update: async ({ where, data }) => {
        const row = queue.find((item) => item.id === where.id);
        assert.equal(row.status, "SENDING", "Only the claimed row may be completed");
        Object.assign(row, data);
        return row;
      },
      count: async ({ where }) => queue.filter((row) => row.status === where.status).length,
    },
  };
  const helper = load("src/lib/rsvp.ts", {
    "server-only": {}, "@/lib/prisma": { prisma },
    "node:crypto": { ...crypto, randomBytes: (size) => {
      const bytes = crypto.randomBytes(size);
      calls.generated.push(bytes.toString("base64url"));
      return bytes;
    } },
  }, { Date: ServerDate });
  const accepted = templates["@emails/AcceptedEmail"].default;
  const sendEmail = async (args) => {
    assert.equal(db.transactionDepth, 0, "External send must happen after the token transaction commits");
    calls.sends.push(args);
    if (args.subject.startsWith("You're in")) {
      const props = calls.acceptedProps.at(-1);
      const raw = new URL(props.rsvpUrl).pathname.split("/").at(-1);
      const digest = helper.hashRsvpToken(raw);
      assert.ok(db.tokens.some((row) => row.tokenHash === digest), "Credential must be persisted before email dispatch");
    }
    if (sendFailure) await sendFailure({ args, index: calls.sends.length - 1, props: calls.acceptedProps.at(-1), db });
    return { id: "mock-delivery" };
  };
  const worker = load("src/app/api/jobs/send-queued/route.ts", {
    ...templates,
    "@emails/AcceptedEmail": { __esModule: true, default: (props) => { calls.acceptedProps.push(props); return accepted(props); } },
    "next/server": { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
    "@/lib/prisma": { prisma }, "@/lib/email": { sendEmail }, "@/lib/rsvp": helper, "@/lib/site-url": siteUrl,
  }, {
    process: { env }, Date: ServerDate,
    console: { ...noLogs, error: (...args) => calls.logs.push(args) },
    setTimeout: (callback, delay) => { calls.sleeps.push(delay); callback(); },
  });
  const run = async (authorization = "Bearer mock-scheduler") => {
    const result = await worker.POST({
      headers: new Headers({ authorization, "x-forwarded-host": "attacker.invalid", "x-forwarded-proto": "http" }),
      url: "https://attacker.invalid/api/jobs/send-queued?applicationId=app-other",
    });
    const surfaces = JSON.stringify({ queue: db.queue, logs: calls.logs, response: result });
    for (const raw of calls.generated) assert.ok(!surfaces.includes(raw), "Raw credential leaked to a database row, log, or response");
    return result;
  };
  return { db, env, calls, helper, run };
}

test("accepted dispatch issues a persisted hash and delivers the unique URL in both email links", async () => {
  const s = setup();
  s.db.queue[0].lastError = "previous failure";
  assert.deepEqual(plain((await s.run()).body), { attempted: 1, sent: 1, failed: 0, remaining: 0 });
  assert.equal(s.calls.generated.length, 1);
  assert.equal(s.db.tokens.length, 1);
  const props = s.calls.acceptedProps[0];
  const url = new URL(props.rsvpUrl);
  assert.equal(url.origin, "https://apply.example.invalid");
  assert.equal(url.pathname, `/rsvp/${s.calls.generated[0]}`);
  assert.equal(url.search, "");
  assert.equal(url.hash, "");
  assert.equal(s.db.tokens[0].tokenHash, s.helper.hashRsvpToken(s.calls.generated[0]));
  assert.equal(s.db.tokens[0].applicationId, "app-0");
  assert.equal(s.db.tokens[0].expiresAt.getTime(), NOW + 86_400_000);
  assert.equal(s.calls.sends[0].to, "applicant-0@example.invalid");
  assert.equal(s.db.queue[0].status, "SENT");
  assert.equal(s.db.queue[0].lastError, null);
  const html = await render(s.calls.sends[0].react);
  assert.equal(html.split(`href="${props.rsvpUrl}"`).length - 1, 2, "Button and plain fallback must use the same URL");
  assert.ok(!html.includes(s.db.tokens[0].tokenHash));
  assert.doesNotMatch(html, /applicationId|personId|app-0|invitation-0/);
  assert.deepEqual(Object.keys(props).sort(), ["eventName", "firstName", "organizerHqUrl", "rsvpUrl"]);
  assert.equal(s.calls.reads.length, 3, "Pre-issuance, locked issuance, and pre-dispatch reads are required");
});

test("different applications receive distinct credentials scoped to their own queue relation", async () => {
  const s = setup({ types: ["ACCEPTED", "ACCEPTED"] });
  await s.run();
  assert.equal(new Set(s.calls.generated).size, 2);
  for (let i = 0; i < 2; i++) {
    const raw = new URL(s.calls.acceptedProps[i].rsvpUrl).pathname.split("/").at(-1);
    assert.equal((await s.helper.resolveRsvpToken(raw)).applicationId, `app-${i}`);
    assert.equal(s.calls.sends[i].to, `applicant-${i}@example.invalid`);
  }
});

test("ambiguous provider failure retries with a fresh token while preserving both usable invitations", async () => {
  const s = setup({ sendFailure: async ({ index, props }) => {
    if (index === 0) throw { name: "application_error", message: `Ambiguous delivery ${props.rsvpUrl}`, cause: { url: props.rsvpUrl } };
  } });
  await s.run();
  assert.equal(s.db.queue[0].status, "PENDING");
  assert.equal(s.db.queue[0].attempts, 1);
  assert.equal(s.db.tokens.length, 1);
  await s.run();
  assert.equal(s.db.queue[0].status, "SENT");
  assert.equal(s.db.tokens.length, 2);
  assert.equal(new Set(s.db.tokens.map((row) => row.tokenHash)).size, 2);
  assert.ok(s.db.tokens.every((row) => row.revokedAt === null));
  for (const raw of s.calls.generated) assert.equal((await s.helper.resolveRsvpToken(raw)).status, "VALID");
});

for (const status of ["SUBMITTED", "WAITLISTED", "REJECTED", "MISSING"]) {
  test(`stale ACCEPTED batch snapshots never issue or send when the current application is ${status}`, async () => {
    const s = setup({ afterSnapshot: async ({ db }) => {
      if (status === "MISSING") db.applications.delete("app-0");
      else db.applications.get("app-0").status = status;
    } });
    s.db.queue[0].attempts = 1;
    assert.deepEqual(plain((await s.run()).body), { attempted: 1, sent: 0, failed: 1, remaining: 0 });
    assert.equal(s.calls.generated.length, 0);
    assert.equal(s.calls.sends.length, 0);
    assert.equal(s.db.queue[0].status, "FAILED");
    assert.equal(s.db.queue[0].sentAt, null);
    assert.equal(s.db.queue[0].attempts, 1);
    assert.match(s.db.queue[0].lastError, /Review the decision before retrying/);
    assert.equal((await s.run()).body.attempted, 0, "Stale rows require organizer review rather than automatic retries");
  });
}

test("a missing included application is also handled without a token or send", async () => {
  const s = setup();
  s.db.applications.delete("app-0");
  await s.run();
  assert.equal(s.db.queue[0].status, "FAILED");
  assert.equal(s.calls.generated.length, 0);
  assert.equal(s.calls.sends.length, 0);
});

test("a decision change while acquiring the issuance lock becomes a stale row without a token", async () => {
  const s = setup({ beforeTokenLock: async ({ db }) => { db.applications.get("app-0").status = "WAITLISTED"; } });
  await s.run();
  assert.equal(s.db.queue[0].status, "FAILED");
  assert.equal(s.db.queue[0].attempts, 0);
  assert.equal(s.calls.generated.length, 0);
  assert.equal(s.calls.sends.length, 0);
});

test("a decision changed after persistence but before dispatch prevents sending; the retained token is unusable", async () => {
  const s = setup({ afterTokenCreated: async ({ db }) => { db.applications.get("app-0").status = "REJECTED"; } });
  await s.run();
  assert.equal(s.db.queue[0].status, "FAILED");
  assert.equal(s.calls.sends.length, 0);
  assert.equal(s.db.tokens.length, 1);
  assert.equal((await s.helper.resolveRsvpToken(s.calls.generated[0])).status, "NO_LONGER_ACCEPTED");
});

test("token persistence failure prevents delivery and follows the existing failure retry policy", async () => {
  const s = setup({ tokenError: new Error("Synthetic database failure") });
  await s.run();
  assert.equal(s.calls.sends.length, 0);
  assert.equal(s.db.tokens.length, 0);
  assert.equal(s.db.queue[0].status, "PENDING");
  assert.equal(s.db.queue[0].attempts, 1);
  assert.doesNotMatch(s.db.queue[0].lastError, /Synthetic database failure/);
});

test("a previous-cycle send cannot proceed with a revoked token after re-acceptance", async () => {
  const s = setup({ afterTokenCreated: async ({ db }) => {
    db.tokens[0].revokedAt = new Date(NOW);
  } });
  await s.run();
  assert.equal(s.calls.sends.length, 0);
  assert.equal(s.db.queue[0].status, "FAILED");
});

test("withdrawal and re-acceptance during preparation make the old acceptance snapshot stale", async () => {
  const s = setup({ afterTokenCreated: async ({ db }) => {
    db.applications.get("app-0").decidedAt = new Date(NOW);
    db.tokens[0].revokedAt = new Date(NOW);
  } });
  await s.run();
  assert.equal(s.calls.sends.length, 0);
  assert.equal(s.db.queue[0].status, "FAILED");
});

test("a provider failure from an old acceptance cycle cannot schedule an automatic invitation in a new cycle", async () => {
  for (const name of ["daily_quota_exceeded", "application_error"]) {
    const s = setup({ sendFailure: async ({ db, props }) => {
      // Model a withdrawal followed by re-acceptance while the provider call
      // was in flight: admission is ACCEPTED again, but the old cycle ended.
      db.applications.get("app-0").decidedAt = new Date(NOW);
      db.tokens[0].revokedAt = new Date(NOW);
      throw { name, message: `Provider echoed ${props.rsvpUrl}` };
    } });
    await s.run();
    assert.equal(s.db.queue[0].status, "FAILED");
    assert.equal(s.db.queue[0].attempts, name === "daily_quota_exceeded" ? 0 : 1);
    assert.equal(s.db.tokens.length, 1);
    assert.equal((await s.run()).body.attempted, 0);
    assert.equal(s.calls.sends.length, 1);
  }
});

test("three ordinary provider failures park the row in FAILED while keeping all retry credentials", async () => {
  const s = setup({ sendFailure: async () => { throw new Error("Synthetic send failure"); } });
  for (let i = 0; i < 3; i++) await s.run();
  assert.equal(s.db.queue[0].status, "FAILED");
  assert.equal(s.db.queue[0].attempts, 3);
  assert.equal(s.calls.sends.length, 3);
  assert.equal(s.db.tokens.length, 3);
  assert.ok(s.db.tokens.every((row) => row.revokedAt === null));
  assert.equal((await s.run()).body.attempted, 0);
});

for (const name of ["rate_limit_exceeded", "daily_quota_exceeded", "monthly_quota_exceeded"]) {
  test(`${name} preserves PENDING and its attempt budget, and retains the token issued before the response`, async () => {
    const s = setup({ sendFailure: async ({ props }) => { throw { name, message: `Provider echoed ${props.rsvpUrl}` }; } });
    s.db.queue[0].attempts = 2;
    await s.run();
    assert.equal(s.db.queue[0].status, "PENDING");
    assert.equal(s.db.queue[0].attempts, 2);
    assert.equal(s.db.tokens.length, 1);
    assert.equal(s.db.tokens[0].revokedAt, null);
    assert.equal(s.calls.sends.length, 1);
    assert.match(s.db.queue[0].lastError, /rate limit or quota/);
    assert.equal((await s.helper.resolveRsvpToken(s.calls.generated[0])).status, "VALID");
  });
}

test("invalid RSVP base configuration fails safely before generating credentials", async () => {
  for (const configured of [undefined, "", "/rsvp", "https://example.invalid", "https://example.invalid/rsvp/already-a-token", "https://user:secret@example.invalid/rsvp", "javascript:secret", "https://example.invalid/rsvp?secret=yes"]) {
    const s = setup();
    s.env.RSVP_URL = configured;
    await s.run();
    assert.equal(s.calls.generated.length, 0);
    assert.equal(s.calls.sends.length, 0);
    assert.equal(s.db.queue[0].status, "PENDING");
    assert.doesNotMatch(s.db.queue[0].lastError, /secret|user:/);
  }
});

test("RSVP bases normalize trailing slashes, enforce the route, and allow loopback HTTP only", () => {
  for (const base of ["https://apply.example.invalid/rsvp", "https://apply.example.invalid/rsvp/", "https://apply.example.invalid/rsvp///", " https://apply.example.invalid/rsvp "]) {
    assert.equal(siteUrl.getRsvpBaseUrl(base), "https://apply.example.invalid/rsvp");
  }
  for (const host of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000"]) {
    assert.equal(siteUrl.getRsvpBaseUrl(`http://${host}/rsvp/`), `http://${host}/rsvp`);
  }
  for (const base of ["//example.invalid/rsvp", "ftp://example.invalid/rsvp", "http://example.invalid/rsvp", "https://example.invalid/rsvp#secret", "https://example.invalid/RSVP", "https://example.invalid/rsvp%2fsecret", "https://example.invalid/rsvp?secret", "https://user:secret@example.invalid/rsvp", "https://[bad-secret/rsvp", "https://exa\nmple.invalid/rsvp"]) {
    assert.throws(() => siteUrl.getRsvpBaseUrl(base), (error) => {
      assert.match(error.message, /^RSVP_URL must be an absolute HTTPS URL/);
      assert.doesNotMatch(error.message, /secret/);
      assert.deepEqual(Object.keys(error), []);
      return true;
    });
  }
});

test("other email types still send with no RSVP configuration and never create credentials", async () => {
  const s = setup({ types: ["CONFIRMATION", "WAITLISTED", "REJECTED"] });
  delete s.env.RSVP_URL;
  assert.deepEqual(plain((await s.run()).body), { attempted: 3, sent: 3, failed: 0, remaining: 0 });
  assert.equal(s.calls.generated.length, 0);
  assert.equal(s.calls.transactions, 0);
  assert.equal(s.calls.reads.length, 0);
  assert.equal(s.calls.acceptedProps.length, 0);
  assert.ok(s.db.queue.every((row) => row.status === "SENT"));
  assert.deepEqual(s.calls.sleeps, [500, 500, 500]);
});

test("ordinary and quota failures for non-acceptance emails retain existing retry semantics", async () => {
  for (const name of ["application_error", "daily_quota_exceeded"]) {
    const s = setup({ types: ["CONFIRMATION", "WAITLISTED", "REJECTED"], sendFailure: async () => { throw { name, message: "Synthetic provider failure" }; } });
    await s.run();
    assert.ok(s.db.queue.every((row) => row.status === "PENDING"));
    assert.ok(s.db.queue.every((row) => row.attempts === (name === "application_error" ? 1 : 0)));
    assert.equal(s.calls.generated.length, 0);
  }
});

test("empty queues, unauthorized calls and overlapping claims never generate duplicate sends", async () => {
  const s = setup();
  assert.equal((await s.run("Bearer wrong")).status, 401);
  assert.equal(s.calls.claims.length, 0);
  const results = await Promise.all([s.run(), s.run()]);
  assert.deepEqual(results.map((result) => result.body.attempted).sort(), [0, 1]);
  assert.equal(s.calls.sends.length, 1);
  assert.equal(s.calls.generated.length, 1);
  assert.equal((await s.run()).body.attempted, 0);
});

test("batch limits leave unclaimed rows pending without issuing credentials for them", async () => {
  const s = setup({ types: ["ACCEPTED", "ACCEPTED"] });
  s.env.EMAIL_BATCH_SIZE = "1";
  assert.deepEqual(plain((await s.run()).body), { attempted: 1, sent: 1, failed: 0, remaining: 1 });
  assert.equal(s.calls.generated.length, 1);
  assert.equal(s.db.queue[1].status, "PENDING");
});

test("acceptance provider payloads, stacks and nested causes never reach queue errors or logs", async () => {
  const s = setup({ sendFailure: async ({ props }) => {
    const error = new Error(`Provider payload ${props.rsvpUrl}`);
    error.stack = `Synthetic stack ${props.rsvpUrl}`;
    error.cause = { secret: "mock-secret-value", rsvpUrl: props.rsvpUrl };
    throw error;
  } });
  await s.run();
  assert.equal(s.calls.sends.length, 1);
  assert.equal(s.calls.logs.length, 1);
  const errors = JSON.stringify({ logs: s.calls.logs, lastError: s.db.queue[0].lastError });
  assert.doesNotMatch(errors, /Provider payload|Synthetic stack|mock-secret-value|https:/);
});

test("all email previews render without any database/provider dependency; acceptance uses a fake URL", async () => {
  const env = { NODE_ENV: "development", RSVP_URL: "https://must-not-appear.example.invalid/rsvp" };
  const preview = load("src/app/api/preview-email/route.tsx", {
    ...templates, "react/jsx-runtime": jsx, "@react-email/render": { render },
  }, { process: { env }, Response });
  for (const type of ["confirmation", "accepted", "waitlisted", "rejected"]) {
    const response = await preview.GET({ nextUrl: new URL(`http://localhost/api/preview-email?type=${type}`) });
    assert.equal(response.status, 200);
    const html = await response.text();
    if (type === "accepted") {
      assert.match(html, /https:\/\/example\.invalid\/rsvp\/preview-not-a-credential/);
      assert.doesNotMatch(html, /must-not-appear/);
    }
  }
  env.NODE_ENV = "production";
  assert.equal((await preview.GET({ nextUrl: new URL("http://localhost/api/preview-email?type=accepted") })).status, 404);
});

test("queueing an acceptance only inserts an EmailQueue row, without issuing a credential", async () => {
  let queued = null;
  const decisions = load("src/lib/decisions.ts", {});
  const user = load("src/lib/supabase/user.ts", {});
  const actions = load("src/app/admin/applications/actions.ts", {
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": { redirect: () => { throw new Error("REDIRECT"); } },
    "@/lib/prisma": { prisma: {
      person: { findUnique: async () => ({ id: "organizer", role: "ORGANIZER" }) },
      application: { findMany: async () => [{ id: "app-a", status: "ACCEPTED", emailQueue: [] }] },
      emailQueue: { createMany: async ({ data }) => { queued = data; return { count: data.length }; } },
    } },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: {
      identities: [{ provider: "discord", identity_data: { sub: "organizer" } }],
    } } }) } }) },
    "@/lib/supabase/user": user, "@/lib/decisions": decisions,
    "@/lib/rsvp": { revokeRsvpTokens: () => assert.fail("Queueing must not revoke or issue credentials") },
    "@/lib/site-url": siteUrl,
  }, { process: { env: { RSVP_URL: "https://example.invalid/rsvp" } }, URLSearchParams });
  const form = new FormData();
  form.set("id", "app-a");
  await assert.rejects(actions.queueDecisionEmails(form), /REDIRECT/);
  assert.deepEqual(plain(queued), [{ applicationId: "app-a", emailType: "ACCEPTED" }]);
});
