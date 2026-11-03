// Run with: node --test tests/signin-guard.test.cjs
// Discord sign-in: background requests can't replace the one-time secret,
// a reused callback code doesn't bounce a signed-in user, failures show a
// message on /apply.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const compiled = ts.transpileModule(readFileSync("src/lib/signin-guard.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const context = { exports: {}, require: (n) => assert.fail(`Unexpected dependency: ${n}`) };
vm.runInNewContext(compiled, context);
const { isBackgroundRequest, browserKind, hasCodeVerifier, signInProblem } = context.exports;

const headers = (obj) => ({ get: (name) => obj[name] ?? null });

test("prefetches and preloads count as background requests", () => {
  assert.equal(isBackgroundRequest(headers({ "next-router-prefetch": "1" })), true);
  assert.equal(isBackgroundRequest(headers({ rsc: "1" })), true);
  assert.equal(isBackgroundRequest(headers({ "sec-purpose": "prefetch" })), true);
  assert.equal(isBackgroundRequest(headers({ "sec-purpose": "prefetch;prerender" })), true);
  assert.equal(isBackgroundRequest(headers({ purpose: "prefetch" })), true);
});

test("a normal click is not a background request", () => {
  assert.equal(isBackgroundRequest(headers({})), false);
  assert.equal(isBackgroundRequest(headers({ "user-agent": "Mozilla/5.0", accept: "text/html" })), false);
});

test("browser labels are coarse and spot in-app browsers", () => {
  assert.equal(browserKind("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Discord/250.0"), "ios/discord-app");
  assert.equal(browserKind("Mozilla/5.0 (Linux; Android 14) Instagram 300.0"), "android/instagram-app");
  assert.equal(browserKind("Mozilla/5.0 (iPhone) [FBAN/FBIOS;FBAV/450.0]"), "ios/facebook-app");
  assert.equal(browserKind("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605.1.15"), "desktop/browser");
  assert.equal(browserKind(null), "desktop/browser");
});

test("spots whether the secret cookie came back", () => {
  assert.equal(hasCodeVerifier(["sb-abc-auth-token-code-verifier", "other"]), true);
  assert.equal(hasCodeVerifier(["sb-abc-auth-token"]), false);
  assert.equal(hasCodeVerifier([]), false);
});

test("cancel gets its own message; every other error is a calm retry", () => {
  assert.equal(signInProblem(undefined), null);
  assert.equal(signInProblem(""), null);
  assert.equal(signInProblem("access_denied"), "cancelled");
  assert.equal(signInProblem("signin_failed"), "failed");
  assert.equal(signInProblem("missing_code"), "failed");
  assert.equal(signInProblem(["access_denied", "x"]), "cancelled");
});

test("the sign-in button is a plain <a>, never a prefetching <Link>", () => {
  const page = readFileSync("src/app/(apply)/apply/page.tsx", "utf8");
  assert.match(page, /<a\s+href="\/auth\/signin"/);
  assert.doesNotMatch(page, /<Link[^>]*href="\/auth\/signin"/);
  assert.match(page, /signInProblem\(\(await searchParams\)\.error\)/);
});

test("/auth/signin turns away background requests before touching cookies", () => {
  const route = readFileSync("src/app/auth/signin/route.ts", "utf8");
  const guard = route.indexOf("isBackgroundRequest(request.headers)");
  assert.ok(guard > -1, "guard present");
  assert.ok(guard < route.indexOf("createClient()"), "guard runs before the Supabase client");
});

test("the callback lets an already signed-in user through instead of bouncing", () => {
  const route = readFileSync("src/app/auth/callback/route.ts", "utf8");
  assert.match(route, /exchangeCodeForSession\(code\)/);
  assert.match(route, /if \(user\) return NextResponse\.redirect\(new URL\(next, origin\)\)/);
  assert.match(route, /startsWith\("\/"\) && !next\.startsWith\("\/\/"\)/);
});
