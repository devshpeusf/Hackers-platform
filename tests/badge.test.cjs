// Run with: node --test tests/badge.test.cjs
// Exercises the real badge helper against an in-memory fake Prisma — no DB.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const source = readFileSync("src/lib/badge.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;

function setup(rows) {
  const db = new Map(Object.entries(rows));
  const writes = [];
  const modules = {
    "server-only": {},
    "node:crypto": require("node:crypto"),
    qrcode: require("qrcode"),
    "@/lib/prisma": { prisma: { application: {
      findUnique: async ({ where }) => (db.has(where.id) ? { badgeToken: db.get(where.id) } : null),
      updateMany: async ({ where, data }) => {
        writes.push({ where, data });
        // Mirrors Postgres: only rows matching every condition change.
        if (db.has(where.id) && db.get(where.id) === where.badgeToken) {
          db.set(where.id, data.badgeToken);
          return { count: 1 };
        }
        return { count: 0 };
      },
    } } },
  };
  const context = { exports: {}, require: (name) => {
    assert.ok(name in modules, `Unexpected dependency: ${name}`);
    return modules[name];
  } };
  vm.runInNewContext(compiled, context);
  return { ...context.exports, db, writes };
}

test("a first visit creates a random, opaque token", async () => {
  const { getOrCreateBadgeToken, db } = setup({ "app-a": null });
  const token = await getOrCreateBadgeToken("app-a");
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(db.get("app-a"), token);
  assert.doesNotMatch(token, /app-a/);
});

test("later visits reuse the same token without writing", async () => {
  const { getOrCreateBadgeToken, writes } = setup({ "app-a": "existing-token" });
  assert.equal(await getOrCreateBadgeToken("app-a"), "existing-token");
  assert.equal(writes.length, 0);
});

test("the write only lands while the column is still empty", async () => {
  const { getOrCreateBadgeToken, writes } = setup({ "app-a": null });
  await getOrCreateBadgeToken("app-a");
  assert.equal(writes[0].where.badgeToken, null);
});

test("two tabs loading at once end up with one shared token", async () => {
  const { getOrCreateBadgeToken } = setup({ "app-a": null });
  const [first, second] = await Promise.all([getOrCreateBadgeToken("app-a"), getOrCreateBadgeToken("app-a")]);
  assert.equal(first, second);
});

test("different hackers get different tokens", async () => {
  const { getOrCreateBadgeToken } = setup({ "app-a": null, "app-b": null });
  assert.notEqual(await getOrCreateBadgeToken("app-a"), await getOrCreateBadgeToken("app-b"));
});

test("an unknown application id never creates a token", async () => {
  const { getOrCreateBadgeToken, writes } = setup({});
  await assert.rejects(getOrCreateBadgeToken("app-x"), /not found/);
  assert.equal(writes.length, 0);
});

test("the badge renders as a dark-on-white SVG", async () => {
  const { getBadgeSvg } = setup({ "app-a": null });
  const svg = await getBadgeSvg("app-a");
  assert.match(svg, /^<svg/);
  assert.match(svg, /fill="#ffffff"/i);
  assert.match(svg, /fill="#120f1f"/i);
});

test("the same token always draws the same badge", () => {
  const { renderBadgeSvg } = setup({});
  assert.equal(renderBadgeSvg("token-a"), renderBadgeSvg("token-a"));
  assert.notEqual(renderBadgeSvg("token-a"), renderBadgeSvg("token-b"));
});

test("no page or route accepts a token or id to render someone's badge", () => {
  const page = readFileSync("src/app/(app)/dashboard/page.tsx", "utf8");
  assert.match(page, /await getCurrentHacker\(\)/);
  assert.match(page, /getBadgeSvg\(application\.id\)/);
  assert.doesNotMatch(page, /searchParams|params/);
});
