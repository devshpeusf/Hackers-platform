// Opt in after a production build: SCANNER_RUNTIME_TEST=1 node --test tests/scanner-runtime.test.cjs
// Fresh anonymous requests only; dummy database URLs, no real OAuth exchange.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { createHash } = require("node:crypto");

test("built scanner serves installation assets and keeps fresh-session page/API authorization", {
  skip: process.env.SCANNER_RUNTIME_TEST !== "1", timeout: 30000,
}, async () => {
  const root = path.resolve(__dirname, "..");
  assert.ok(fs.existsSync(path.join(root, ".next/BUILD_ID")), "Run npm run build first");
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root, windowsHide: true,
    env: { ...process.env, NODE_ENV: "production", VERCEL_ENV: "development",
      DATABASE_URL: "postgresql://validation:validation@127.0.0.1:1/validation",
      DIRECT_URL: "postgresql://validation:validation@127.0.0.1:1/validation",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:1", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "validation-publishable-key" },
  });
  server.stdout.resume(); server.stderr.resume();
  let startupError;
  server.on("error", error => { startupError = error; });
  const closed = new Promise(resolve => server.once("close", resolve));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const request = (route, options = {}) => fetch(origin + route, { ...options, redirect: "manual", signal: AbortSignal.timeout(5000) });
  try {
    let ready = false;
    for (let i = 0; i < 100 && !startupError && server.exitCode === null; i++) {
      try { const response = await request("/scanner.webmanifest"); if (response.ok) { ready = true; break; } } catch {}
      await sleep(50);
    }
    assert.ok(ready, "Built Next.js server did not become ready");
    const manifestResponse = await request("/scanner.webmanifest");
    assert.equal(manifestResponse.status, 200);
    assert.match(manifestResponse.headers.get("content-type"), /manifest\+json/);
    assert.equal(manifestResponse.headers.get("set-cookie"), null, "Public manifest must bypass session refresh");
    const manifest = await manifestResponse.json();
    assert.equal(manifest.start_url, "/scanner"); assert.equal(manifest.display, "standalone");
    for (const asset of [...manifest.icons.map(icon => icon.src), "/scanner-icons/apple-touch-icon.png"]) {
      const response = await request(asset);
      assert.equal(response.status, 200, asset);
      assert.match(response.headers.get("content-type"), /image\/png/);
      assert.equal(response.headers.get("set-cookie"), null);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), fs.readFileSync(path.join(root, "public", asset)));
    }
    const wasmPath = "/scanner-assets/zxing_reader-3.1.6.wasm";
    const wasm = await request(wasmPath);
    assert.equal(wasm.status, 200); assert.match(wasm.headers.get("content-type"), /application\/wasm/);
    assert.equal(wasm.headers.get("set-cookie"), null);
    const digest = bytes => createHash("sha256").update(bytes).digest("hex");
    assert.equal(digest(Buffer.from(await wasm.arrayBuffer())), digest(fs.readFileSync(path.join(root, "public", wasmPath))));

    // Installed apps may have a separate cookie jar: start with no cookies.
    const scanner = await request("/scanner");
    assert.equal(scanner.status, 307);
    const signin = new URL(scanner.headers.get("location"), origin);
    assert.equal(signin.pathname, "/auth/signin"); assert.equal(signin.searchParams.get("next"), "/scanner");
    const html = await scanner.text();
    assert.match(html, /HackJam Scanner/);
    assert.match(html, /scanner\.webmanifest/);
    assert.match(html, /apple-mobile-web-app-capable/);
    assert.match(html, /scanner-icons\/apple-touch-icon\.png/);

    const unauthorized = await request("/api/scanner/lookup", {
      method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ token: "A".repeat(43) }),
    });
    assert.equal(unauthorized.status, 401);
    assert.deepEqual(await unauthorized.json(), { error: "UNAUTHORIZED" });
    assert.equal(unauthorized.headers.get("cache-control"), "private, no-store, max-age=0");
    assert.equal(unauthorized.headers.get("access-control-allow-origin"), null);

    const oauth = await request("/auth/signin?next=/scanner");
    assert.equal(oauth.status, 307);
    const provider = new URL(oauth.headers.get("location"));
    const callback = new URL(provider.searchParams.get("redirect_to"));
    assert.equal(callback.pathname, "/auth/callback"); assert.equal(callback.searchParams.get("next"), "/scanner");
    assert.ok(provider.searchParams.get("code_challenge"));
    assert.match(oauth.headers.get("set-cookie"), /code-verifier/);
    const badReturn = await request("/auth/signin?next=https%3A%2F%2Fevil.example");
    const safeCallback = new URL(new URL(badReturn.headers.get("location")).searchParams.get("redirect_to"));
    assert.equal(safeCallback.pathname, "/auth/callback"); assert.equal(safeCallback.searchParams.get("next"), null);
    const denied = await request("/auth/callback?next=%2F%2Fevil.example&error=access_denied");
    const deniedLocation = new URL(denied.headers.get("location"));
    assert.notEqual(deniedLocation.hostname, "evil.example"); assert.equal(deniedLocation.pathname, "/apply");

    const portal = await request("/");
    assert.doesNotMatch(await portal.text(), /rel="manifest"[^>]*scanner\.webmanifest/);
  } finally {
    server.kill();
    await Promise.race([closed, sleep(2000)]);
  }
});
