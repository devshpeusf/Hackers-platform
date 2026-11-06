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
const guard = context.exports;
const { isBackgroundRequest, browserKind, hasCodeVerifier, signInProblem, classifyProviderError } = guard;

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

test("Supabase's errors are told apart by code and message, not just error=", () => {
  assert.equal(classifyProviderError("server_error", "provider_email_needs_verification", "Unverified email with discord."), "verify_email");
  assert.equal(classifyProviderError("access_denied", null, "Unverified email with discord. A confirmation email has been sent"), "verify_email");
  assert.equal(classifyProviderError("server_error", "unexpected_failure", "Error getting user email from external provider"), "no_email");
  assert.equal(classifyProviderError("access_denied", null, "The resource owner or authorization server denied the request"), "cancelled");
  assert.equal(classifyProviderError("access_denied", "access_denied", null), "cancelled");
  assert.equal(classifyProviderError("server_error", "unexpected_failure", "Database error saving new user"), "failed");
});

test("/apply picks the message from ?error=, then ?signin=required", () => {
  assert.equal(signInProblem(undefined), null);
  assert.equal(signInProblem(""), null);
  assert.equal(signInProblem("verify_email"), "verify_email");
  assert.equal(signInProblem("no_email"), "no_email");
  assert.equal(signInProblem("cancelled"), "cancelled");
  assert.equal(signInProblem("access_denied"), "cancelled");
  assert.equal(signInProblem("failed"), "failed");
  assert.equal(signInProblem("provider_disabled"), "failed");
  assert.equal(signInProblem(["verify_email", "x"]), "verify_email");
  assert.equal(signInProblem(undefined, "required"), "signin_required");
  assert.equal(signInProblem("failed", "required"), "failed");
  assert.equal(signInProblem(undefined, "other"), null);
});

test("every message /apply can pick has copy", () => {
  const copy = readFileSync("src/lib/placeholder-data.ts", "utf8");
  for (const key of ["verify_email", "no_email", "signin_required", "failed", "cancelled"]) {
    assert.match(copy, new RegExp(`\\b${key}: \\{\\s*title:`), key);
  }
});

test("the sign-in button is a plain <a>, never a prefetching <Link>", () => {
  const page = readFileSync("src/app/(apply)/apply/page.tsx", "utf8");
  assert.match(page, /<a\s+href="\/auth\/signin"/);
  assert.doesNotMatch(page, /<Link[^>]*href="\/auth\/signin"/);
  assert.match(page, /signInProblem\(error, signin\)/);
});

test("/auth/signin turns away background requests before touching cookies", () => {
  const route = readFileSync("src/app/auth/signin/route.ts", "utf8");
  const guard = route.indexOf("isBackgroundRequest(request.headers)");
  assert.ok(guard > -1, "guard present");
  assert.ok(guard < route.indexOf("createClient()"), "guard runs before the Supabase client");
});

test("a retry asks Discord to skip the approval screen; a first try doesn't", () => {
  const route = readFileSync("src/app/auth/signin/route.ts", "utf8");
  assert.match(route, /searchParams\.get\("retry"\) === "1" \? \{ queryParams: \{ prompt: "none" \} \} : \{\}/);
});

// --- The callback, run for real against fakes -------------------------------

function loadCallback({ exchangeError = null, user = null } = {}) {
  const recorded = [];
  const compiled = ts.transpileModule(readFileSync("src/app/auth/callback/route.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const redirect = (url) => {
    const res = { location: String(url), set: {}, deleted: [] };
    res.cookies = { set: (name, value, options) => { res.set[name] = { value, options }; }, delete: (name) => res.deleted.push(name) };
    return res;
  };
  const modules = {
    "next/server": { NextResponse: { redirect } },
    "@/lib/supabase/server": { createClient: async () => ({ auth: {
      exchangeCodeForSession: async () => ({ error: exchangeError }),
      getUser: async () => ({ data: { user } }),
    } }) },
    "@/lib/site-url": { getSiteOrigin: () => "https://apply.example.com" },
    "@/lib/signin-guard": guard,
    "@/lib/signin-failures": { recordSignInFailure: async (row) => { recorded.push(row); } },
  };
  const ctx = { exports: {}, URL, require: (n) => { assert.ok(n in modules, `Unexpected dependency: ${n}`); return modules[n]; } };
  vm.runInNewContext(compiled, ctx);
  return { GET: ctx.exports.GET, recorded };
}

function request(query, { cookies = [], ua = "Mozilla/5.0 (iPhone) Instagram 300.0" } = {}) {
  const jar = cookies.map((name) => ({ name, value: "x" }));
  return {
    url: `https://apply.example.com/auth/callback${query}`,
    headers: { get: (n) => (n === "user-agent" ? ua : null) },
    cookies: { getAll: () => jar, has: (n) => jar.some((c) => c.name === n) },
  };
}

const VERIFIER = "sb-ref-auth-token-code-verifier";
const plain = (x) => JSON.parse(JSON.stringify(x));

test("callback: success goes to the form and clears any retry marker", async () => {
  const { GET, recorded } = loadCallback();
  const res = await GET(request("?code=abc", { cookies: [VERIFIER] }));
  assert.equal(res.location, "https://apply.example.com/apply/form");
  assert.deepEqual(plain(res.deleted), ["signin_retry"]);
  assert.equal(recorded.length, 0);
});

test("callback: ?next= only allows same-site paths", async () => {
  const { GET } = loadCallback();
  assert.equal((await GET(request("?code=abc&next=/dashboard"))).location, "https://apply.example.com/dashboard");
  assert.equal((await GET(request("?code=abc&next=//evil.example"))).location, "https://apply.example.com/apply/form");
  assert.equal((await GET(request("?code=abc&next=https://evil.example"))).location, "https://apply.example.com/apply/form");
});

test("callback: an unverified Discord email is recorded and shown as such", async () => {
  const { GET, recorded } = loadCallback();
  const res = await GET(request("?error=server_error&error_code=provider_email_needs_verification&error_description=Unverified+email+with+discord", { cookies: [VERIFIER] }));
  assert.equal(res.location, "https://apply.example.com/apply?error=verify_email");
  assert.deepEqual(plain(recorded), [{
    reason: "verify_email", code: "provider_email_needs_verification", description: "Unverified email with discord",
    browser: "ios/instagram-app", verifier: true,
  }]);
});

test("callback: a reused code doesn't bounce someone already signed in", async () => {
  const { GET, recorded } = loadCallback({ exchangeError: { code: "flow_state_not_found", message: "invalid flow state" }, user: { id: "u" } });
  const res = await GET(request("?code=abc", { cookies: [VERIFIER] }));
  assert.equal(res.location, "https://apply.example.com/apply/form");
  assert.equal(recorded.length, 0);
});

test("callback: a missing cookie retries once in this browser, then shows the message", async () => {
  const exchangeError = { code: "bad_code_verifier", message: "code verifier missing" };
  const first = loadCallback({ exchangeError });
  const res = await first.GET(request("?code=abc"));
  assert.equal(res.location, "https://apply.example.com/auth/signin?retry=1");
  assert.equal(res.set.signin_retry.value, "1");
  assert.equal(res.set.signin_retry.options.httpOnly, true);
  assert.equal(first.recorded[0].reason, "missing_verifier");
  assert.equal(first.recorded[0].retried, true);

  const second = loadCallback({ exchangeError });
  const again = await second.GET(request("?code=def", { cookies: ["signin_retry"] }));
  assert.equal(again.location, "https://apply.example.com/apply?error=failed");
  assert.equal(second.recorded[0].reason, "missing_verifier");
  assert.ok(!second.recorded[0].retried);
});

test("callback: a wrong (not missing) secret doesn't retry", async () => {
  const { GET, recorded } = loadCallback({ exchangeError: { code: "bad_code_verifier", message: "mismatch" } });
  const res = await GET(request("?code=abc", { cookies: [VERIFIER] }));
  assert.equal(res.location, "https://apply.example.com/apply?error=failed");
  assert.equal(recorded[0].reason, "failed");
});

test("callback: no code at all is recorded", async () => {
  const { GET, recorded } = loadCallback();
  assert.equal((await GET(request(""))).location, "https://apply.example.com/apply?error=failed");
  assert.equal(recorded[0].reason, "missing_code");
});
