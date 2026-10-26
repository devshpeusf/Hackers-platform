// Run with: node --test tests/auth-return.test.cjs
// Real sign-in/callback handlers, mocked Supabase. No OAuth or database requests.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(path, modules = {}) {
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const context = { exports: {}, URL, process: { env: {} }, require: (name) => {
    assert.ok(Object.hasOwn(modules, name), `Unexpected dependency: ${name}`);
    return modules[name];
  } };
  vm.runInNewContext(compiled, context);
  return context.exports;
}

const returns = load("src/lib/auth-return.ts");
const site = load("src/lib/site-url.ts");
const ORIGIN = "https://apply.example.invalid";
const rejected = [
  undefined, null, 42, {}, [], "", "/", "/dashboard", "/scanner/", "/scanner?next=//evil.example",
  "https://evil.example", "//evil.example", "\\\\evil.example", "/\\evil.example",
  "javascript:alert(1)", "data:text/html,evil", "%2f%2fevil.example", "%252f%252fevil.example",
  "/%2f%2fevil.example", "/scanner/../..//evil.example", "\n/scanner", "/scanner\r\n",
  " https://evil.example", "https:\\evil.example", "\uFF0F\uFF0Fevil.example", "%ZZ",
];

test("only the two known auth return paths are accepted", () => {
  assert.equal(returns.authReturnPath("/scanner"), "/scanner");
  assert.equal(returns.authReturnPath("/apply/form"), "/apply/form");
  for (const value of rejected) assert.equal(returns.authReturnPath(value), "/apply/form");
});

function setup({ signInError = null, exchangeError = null } = {}) {
  const calls = { signIns: [], exchanges: [] };
  const modules = {
    "next/server": { NextResponse: { redirect: (url) => Response.redirect(String(url), 307) } },
    "@/lib/site-url": site,
    "@/lib/auth-return": returns,
    "@/lib/supabase/server": { createClient: async () => ({ auth: {
      signInWithOAuth: async (options) => {
        calls.signIns.push(JSON.parse(JSON.stringify(options)));
        return { data: { url: "https://discord.example.invalid/oauth" }, error: signInError };
      },
      exchangeCodeForSession: async (code) => {
        calls.exchanges.push(code);
        return { error: exchangeError };
      },
    } }) },
  };
  return {
    calls,
    signin: load("src/app/auth/signin/route.ts", modules).GET,
    callback: load("src/app/auth/callback/route.ts", modules).GET,
  };
}

function request(path, params = {}) {
  const url = new URL(path, ORIGIN);
  for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, value);
  return new Request(url);
}

test("scanner sign-in carries its allowlisted return through the unchanged code exchange", async () => {
  const s = setup();
  const response = await s.signin(request("/auth/signin", { next: "/scanner" }));
  assert.equal(response.headers.get("location"), "https://discord.example.invalid/oauth");
  assert.deepEqual(s.calls.signIns, [{ provider: "discord", options: {
    redirectTo: `${ORIGIN}/auth/callback?next=%2Fscanner`, scopes: "guilds.join",
  } }]);
  const callback = new URL(s.calls.signIns[0].options.redirectTo);
  callback.searchParams.set("code", "synthetic-pkce-code");
  const result = await s.callback(new Request(callback));
  assert.equal(result.headers.get("location"), `${ORIGIN}/scanner`);
  assert.deepEqual(s.calls.exchanges, ["synthetic-pkce-code"]);
});

test("default and explicit applicant login retain the existing callback URL and form destination", async () => {
  for (const next of [undefined, "/apply/form"]) {
    const s = setup();
    await s.signin(request("/auth/signin", { next }));
    assert.equal(s.calls.signIns[0].options.redirectTo, `${ORIGIN}/auth/callback`);
    const response = await s.callback(request("/auth/callback", { code: "test-code", next }));
    assert.equal(response.headers.get("location"), `${ORIGIN}/apply/form`);
  }
});

test("external, protocol-relative, encoded and malformed next values cannot redirect off-site", async () => {
  for (const next of rejected.filter((value) => typeof value === "string")) {
    const s = setup();
    await s.signin(request("/auth/signin", { next }));
    assert.equal(s.calls.signIns[0].options.redirectTo, `${ORIGIN}/auth/callback`);
    const response = await s.callback(request("/auth/callback", { code: "test-code", next }));
    assert.equal(response.headers.get("location"), `${ORIGIN}/apply/form`);
  }
  // Exercise query decoding too, instead of only URLSearchParams-escaped inputs.
  for (const next of ["%2F%2Fevil.example", "%252F%252Fevil.example", "%5C%5Cevil.example", "%00%2Fscanner", "%ZZ"]) {
    const s = setup();
    const response = await s.callback(new Request(`${ORIGIN}/auth/callback?code=test&next=${next}`));
    assert.equal(response.headers.get("location"), `${ORIGIN}/apply/form`);
  }
});

test("OAuth cancellation, failed exchange and missing code still use the existing error flow", async () => {
  const s = setup({ exchangeError: { message: "synthetic_exchange_failure" } });
  const denied = await s.callback(request("/auth/callback", { error: "access_denied", next: "/scanner" }));
  assert.equal(denied.headers.get("location"), `${ORIGIN}/apply?error=access_denied`);
  assert.deepEqual(s.calls.exchanges, []);
  const failed = await s.callback(request("/auth/callback", { code: "bad-code", next: "/scanner" }));
  assert.equal(failed.headers.get("location"), `${ORIGIN}/apply?error=synthetic_exchange_failure`);
  const missing = await s.callback(request("/auth/callback", { next: "/scanner" }));
  assert.equal(missing.headers.get("location"), `${ORIGIN}/apply?error=missing_code`);
  const failedSignIn = setup({ signInError: { message: "synthetic_signin_failure" } });
  assert.equal((await failedSignIn.signin(request("/auth/signin"))).headers.get("location"),
    `${ORIGIN}/apply?error=synthetic_signin_failure`);
});
