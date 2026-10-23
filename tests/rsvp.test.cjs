// Run with: node --test tests/rsvp.test.cjs
// Real crypto/helper code, mocked Prisma, and a fixed server clock. No DB access.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const crypto = require("node:crypto");
const vm = require("node:vm");
const ts = require("typescript");

const source = readFileSync("src/lib/rsvp.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const NOW = Date.parse("2026-10-23T12:00:00Z");
const EVENT_START = new Date("2026-11-01T12:00:00Z");
const plain = (value) => JSON.parse(JSON.stringify(value));
const app = (id = "app-a", status = "ACCEPTED") => ({
  id, status, rsvpStatus: "PENDING", rsvpRespondedAt: null,
  event: { startDate: new Date(EVENT_START) },
});

function setup({ applications = [app()], lookupError = null } = {}) {
  const db = { applications: new Map(applications.map((a) => [a.id, a])), tokens: [] };
  const clock = { milliseconds: NOW };
  const calls = { randomBytes: [], writes: [], lookups: [], updates: [], locks: [], transactions: 0, serverOnly: false };
  class ServerDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.milliseconds])); }
    static now() { return clock.milliseconds; }
  }

  const tables = {
    application: {
      findUnique: async ({ where }) => db.applications.get(where.id) ?? null,
    },
    rsvpToken: {
      create: async ({ data }) => {
        calls.writes.push({ ...data });
        // The hash, application link and expiry are the only supplied columns.
        assert.deepEqual(Object.keys(data).sort(), ["applicationId", "expiresAt", "tokenHash"]);
        assert.ok(!db.tokens.some((row) => row.tokenHash === data.tokenHash), "Duplicate token hash");
        const row = { id: `invitation-${db.tokens.length + 1}`, createdAt: new Date(clock.milliseconds), revokedAt: null, ...data };
        db.tokens.push(row);
        return { id: row.id };
      },
      findUnique: async (query) => {
        calls.lookups.push(query);
        if (lookupError) throw lookupError;
        const row = db.tokens.find((token) => token.tokenHash === query.where.tokenHash);
        if (!row) return null;
        const application = db.applications.get(row.applicationId);
        return {
          expiresAt: row.expiresAt,
          revokedAt: row.revokedAt,
          application: { id: application.id, status: application.status, rsvpStatus: application.rsvpStatus },
        };
      },
      updateMany: async ({ where, data }) => {
        calls.updates.push({ where, data });
        assert.deepEqual(Object.keys(data), ["revokedAt"]);
        let count = 0;
        for (const row of db.tokens) {
          if (row.applicationId === where.applicationId && row.revokedAt === where.revokedAt && row.expiresAt > where.expiresAt.gt) {
            row.revokedAt = data.revokedAt;
            count++;
          }
        }
        return { count };
      },
    },
  };

  // Model the shared application-row lock so concurrent issue/revoke calls
  // interleave at await boundaries without sleeps or a real database.
  const lockTails = new Map();
  const prisma = {
    ...tables,
    $transaction: async (run) => {
      calls.transactions++;
      const releases = new Map();
      const tx = {
        ...tables,
        $queryRaw: async (strings, ...values) => {
          assert.ok(Array.isArray(strings) && strings.join("?").includes("FOR UPDATE"), "Expected a parameterized row lock");
          assert.equal(values.length, 1);
          const id = values[0];
          calls.locks.push(id);
          if (!releases.has(id)) {
            const previous = lockTails.get(id) ?? Promise.resolve();
            let release;
            const next = new Promise((resolve) => { release = resolve; });
            lockTails.set(id, next);
            await previous;
            releases.set(id, release);
          }
          return db.applications.has(id) ? [{ id }] : [];
        },
      };
      try { return await run(tx); }
      finally { for (const release of releases.values()) release(); }
    },
  };
  const modules = {
    "server-only": {},
    "node:crypto": {
      createHash: crypto.createHash,
      randomBytes: (size) => { calls.randomBytes.push(size); return crypto.randomBytes(size); },
    },
    "@/lib/prisma": { prisma },
  };
  const context = {
    exports: {}, Date: ServerDate,
    console: { log: () => assert.fail("Helper must not log credentials"), error: () => assert.fail("Helper must not log credentials"), warn: () => assert.fail("Helper must not log credentials") },
    require: (name) => {
      assert.ok(name in modules, `Unexpected dependency: ${name}`);
      if (name === "server-only") calls.serverOnly = true;
      return modules[name];
    },
  };
  vm.runInNewContext(compiled, context);
  return { ...context.exports, db, calls, clock, transaction: prisma.$transaction };
}

test("the module is server-only and never loads real Prisma or auth clients", () => {
  assert.equal(setup().calls.serverOnly, true);
});

test("generation requests 32 crypto bytes and produces distinct URL-safe credentials", () => {
  const { generateRsvpToken, calls } = setup();
  const tokens = Array.from({ length: 16 }, () => generateRsvpToken());
  assert.equal(new Set(tokens).size, tokens.length);
  assert.ok(tokens.every((token) => /^[A-Za-z0-9_-]{43}$/.test(token)), "Unexpected token format");
  assert.ok(tokens.every((token) => Buffer.from(token, "base64url").length === 32), "Unexpected token size");
  assert.ok(calls.randomBytes.every((size) => size === 32));
});

test("hashing is deterministic SHA-256 with no salt", () => {
  const { hashRsvpToken } = setup();
  const expected = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
  assert.equal(hashRsvpToken("abc"), expected);
  assert.equal(hashRsvpToken("abc"), setup().hashRsvpToken("abc"));
});

test("different credentials produce different lookup hashes", () => {
  const { generateRsvpToken, hashRsvpToken } = setup();
  assert.notEqual(hashRsvpToken(generateRsvpToken()), hashRsvpToken(generateRsvpToken()));
});

test("issuance returns only a raw credential, stores only its hash, and uses event start", async () => {
  const { issueRsvpToken, hashRsvpToken, db, calls } = setup();
  const before = plain([...db.applications.values()]);
  const raw = await issueRsvpToken("app-a");
  assert.ok(typeof raw === "string" && /^[A-Za-z0-9_-]{43}$/.test(raw));
  assert.equal(calls.writes.length, 1);
  assert.equal(calls.writes[0].tokenHash, hashRsvpToken(raw));
  assert.ok(calls.writes[0].tokenHash !== raw, "Raw credential must not be stored");
  assert.ok(!JSON.stringify(db.tokens).includes(raw), "Raw credential leaked into stored data");
  assert.equal(calls.writes[0].applicationId, "app-a");
  assert.equal(calls.writes[0].expiresAt.getTime(), EVENT_START.getTime());
  assert.deepEqual(plain([...db.applications.values()]), before);
});

test("missing applications cannot receive invitations", async () => {
  const { issueRsvpToken, calls } = setup({ applications: [] });
  await assert.rejects(issueRsvpToken("missing"), /not found/);
  assert.equal(calls.writes.length, 0);
  assert.equal(calls.randomBytes.length, 0);
});

for (const status of ["SUBMITTED", "WAITLISTED", "REJECTED"]) {
  test(`issuance rejects a currently ${status} application`, async () => {
    const { issueRsvpToken, calls } = setup({ applications: [app("app-a", status)] });
    await assert.rejects(issueRsvpToken("app-a"), /Only accepted/);
    assert.equal(calls.writes.length, 0);
    assert.equal(calls.randomBytes.length, 0);
  });
}

test("retry invitations preserve previous valid tokens for the same application", async () => {
  const { issueRsvpToken, resolveRsvpToken, db } = setup();
  const first = await issueRsvpToken("app-a");
  const second = await issueRsvpToken("app-a");
  assert.ok(first !== second, "Retries must receive fresh credentials");
  assert.equal(db.tokens.length, 2);
  assert.ok(db.tokens.every((row) => row.revokedAt === null));
  for (const raw of [first, second]) assert.equal((await resolveRsvpToken(raw)).status, "VALID");
});

test("valid lookup uses only the credential hash and returns a minimal server-side scope", async () => {
  const { issueRsvpToken, resolveRsvpToken, hashRsvpToken, calls } = setup();
  const raw = await issueRsvpToken("app-a");
  const result = await resolveRsvpToken(raw);
  assert.deepEqual(plain(result), { status: "VALID", applicationId: "app-a", rsvpStatus: "PENDING" });
  assert.deepEqual(plain(calls.lookups[0].where), { tokenHash: hashRsvpToken(raw) });
  assert.deepEqual(Object.keys(calls.lookups[0].select.application.select).sort(), ["id", "rsvpStatus", "status"]);
});

test("an unknown but well-formed credential is INVALID", async () => {
  const { generateRsvpToken, resolveRsvpToken } = setup();
  assert.deepEqual(plain(await resolveRsvpToken(generateRsvpToken())), { status: "INVALID" });
});

test("malformed inputs fail closed before hashing or database lookup", async () => {
  const { resolveRsvpToken, calls } = setup();
  const malformed = [
    undefined, null, 0, [], {}, { applicationId: "app-a" }, "", "app-a",
    "x".repeat(42), "x".repeat(44), "x".repeat(100000), "x".repeat(43) + "\n",
    "x".repeat(43) + "\r\n", "/".repeat(43), "+".repeat(43), " ".repeat(43),
    "?".repeat(43), "é".repeat(43),
  ];
  for (const value of malformed) assert.equal((await resolveRsvpToken(value)).status, "INVALID");
  assert.equal(calls.lookups.length, 0);
});

test("server-time expiry is exclusive: valid just before, expired at and after the boundary", async () => {
  const { issueRsvpToken, resolveRsvpToken, clock } = setup();
  const raw = await issueRsvpToken("app-a");
  for (const [offset, expected] of [[-1, "VALID"], [0, "EXPIRED"], [1, "EXPIRED"]]) {
    clock.milliseconds = EVENT_START.getTime() + offset;
    assert.equal((await resolveRsvpToken(raw)).status, expected);
  }
});

test("a revoked credential is REVOKED and returns no application scope", async () => {
  const { issueRsvpToken, resolveRsvpToken, db } = setup();
  const raw = await issueRsvpToken("app-a");
  db.tokens[0].revokedAt = new Date(NOW - 1);
  assert.deepEqual(plain(await resolveRsvpToken(raw)), { status: "REVOKED" });
});

for (const status of ["SUBMITTED", "WAITLISTED", "REJECTED"]) {
  test(`lookup rechecks admission after the application becomes ${status}`, async () => {
    const { issueRsvpToken, resolveRsvpToken, db } = setup();
    const raw = await issueRsvpToken("app-a");
    db.applications.get("app-a").status = status;
    assert.deepEqual(plain(await resolveRsvpToken(raw)), { status: "NO_LONGER_ACCEPTED" });
  });
}

test("lookup cannot be retargeted through an application or person ID", async () => {
  const { issueRsvpToken, resolveRsvpToken, db } = setup({ applications: [app(), app("app-b")] });
  const raw = await issueRsvpToken("app-a");
  assert.equal((await resolveRsvpToken(raw, "app-b", "person-b")).applicationId, "app-a");
  assert.equal((await resolveRsvpToken({ token: raw, applicationId: "app-b" })).status, "INVALID");
  assert.equal(db.tokens.length, 1);
});

test("already-recorded responses can be read without changing RSVP or consuming tokens", async () => {
  const { issueRsvpToken, resolveRsvpToken, db, calls } = setup();
  const raw = await issueRsvpToken("app-a");
  for (const status of ["CONFIRMED", "DECLINED"]) {
    db.applications.get("app-a").rsvpStatus = status;
    const before = plain([...db.applications.values()]);
    for (let click = 0; click < 2; click++) assert.equal((await resolveRsvpToken(raw)).rsvpStatus, status);
    assert.deepEqual(plain([...db.applications.values()]), before);
  }
  assert.equal(calls.writes.length, 1);
  assert.equal(calls.updates.length, 0);
  assert.equal(db.tokens[0].revokedAt, null);
  assert.equal(db.tokens[0].expiresAt.getTime(), EVENT_START.getTime());
});

test("revocation is scoped, soft, and idempotent; expired/revoked rows keep their history", async () => {
  const { issueRsvpToken, resolveRsvpToken, revokeRsvpTokens, hashRsvpToken, db, clock } = setup({ applications: [app(), app("app-b")] });
  const first = await issueRsvpToken("app-a");
  const second = await issueRsvpToken("app-a");
  const other = await issueRsvpToken("app-b");
  const oldRevocation = new Date(NOW - 1000);
  const oldRows = [
    { applicationId: "app-a", tokenHash: hashRsvpToken("expired-fixture"), expiresAt: new Date(NOW), revokedAt: null },
    { applicationId: "app-a", tokenHash: hashRsvpToken("revoked-fixture"), expiresAt: EVENT_START, revokedAt: oldRevocation },
  ];
  db.tokens.push(...oldRows);
  const applicationsBefore = plain([...db.applications.values()]);
  assert.equal(await revokeRsvpTokens("app-a"), 2);
  const firstRevocation = db.tokens[0].revokedAt.getTime();
  assert.equal(firstRevocation, NOW);
  clock.milliseconds += 5000;
  assert.equal(await revokeRsvpTokens("app-a"), 0);
  assert.equal(db.tokens[0].revokedAt.getTime(), firstRevocation);
  assert.equal(db.tokens.length, 5);
  assert.equal(oldRows[0].revokedAt, null);
  assert.equal(oldRows[1].revokedAt, oldRevocation);
  for (const raw of [first, second]) assert.equal((await resolveRsvpToken(raw)).status, "REVOKED");
  assert.equal((await resolveRsvpToken(other)).status, "VALID");
  assert.deepEqual(plain([...db.applications.values()]), applicationsBefore);
});

test("revoking an unknown application is a harmless no-op", async () => {
  const { revokeRsvpTokens, calls } = setup({ applications: [] });
  assert.equal(await revokeRsvpTokens("missing"), 0);
  assert.equal(calls.updates.length, 0);
});

test("revocation can join a caller's transaction without opening a nested transaction", async () => {
  const { issueRsvpToken, revokeRsvpTokens, transaction, calls } = setup();
  await issueRsvpToken("app-a");
  const before = calls.transactions;
  const count = await transaction((tx) => revokeRsvpTokens("app-a", tx));
  assert.equal(count, 1);
  assert.equal(calls.transactions, before + 1);
});

test("concurrent issue then revoke cannot leave that new invitation unrevoked", async () => {
  const { issueRsvpToken, revokeRsvpTokens, resolveRsvpToken } = setup();
  const [raw, count] = await Promise.all([issueRsvpToken("app-a"), revokeRsvpTokens("app-a")]);
  assert.equal(count, 1);
  assert.equal((await resolveRsvpToken(raw)).status, "REVOKED");
});

test("database failures are not silently presented as invalid credentials", async () => {
  const failure = new Error("Synthetic database failure");
  const { generateRsvpToken, resolveRsvpToken } = setup({ lookupError: failure });
  await assert.rejects(resolveRsvpToken(generateRsvpToken()), (error) => error === failure);
});
