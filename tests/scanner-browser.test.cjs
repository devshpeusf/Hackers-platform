// Optional real-browser integration with local canvas video and a fake lookup server.
// No physical camera, shared database, authentication service or external network.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { spawn } = require("node:child_process");
const vm = require("node:vm");
const ts = require("typescript");
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

test("browser manifest, local video fallback, pause/rearm, offline failure and cleanup", {
  skip: !fs.existsSync(edge) || typeof WebSocket !== "function", timeout: 30000,
}, async () => {
  const root = path.resolve(__dirname, "..");
  const tokens = [0, 1].map(() => require("node:crypto").randomBytes(32).toString("base64url"));
  const modules = { "server-only": {}, "node:crypto": require("node:crypto"), qrcode: require("qrcode"), "@/lib/prisma": {}, "@/lib/portal-access": {} };
  const badge = { exports: {}, require: (name) => modules[name] };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, "src/lib/badge.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, badge);
  const requests = [];
  const html = `<!doctype html><html><head><link rel="manifest" href="/scanner.webmanifest"></head><body><video muted playsinline autoplay></video><p id="result">idle</p>
    <script type="importmap">{"imports":{"barcode-detector/ponyfill":"/packages/barcode-detector/ponyfill.js","zxing-wasm/reader":"/packages/zxing-wasm/reader/index.js"}}</script>
    <script type="module">
      import { createQrDetector } from '/source/scanner-detector.js';
      import { ScannerSession } from '/source/scanner-session.js';
      import { lookupScannerBadge } from '/source/scanner-lookup.js';
      const check = (condition) => { if (!condition) throw Error('Browser scanner assertion failed'); };
      const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
      async function until(checker) { for (let i=0;i<100;i++) { if(checker()) return; await wait(50); } throw Error('Scanner timed out'); }
      try {
        document.body.dataset.stage='images';
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 600;
        const context = canvas.getContext('2d');
        const images = await Promise.all([0,1].map(async i => { const image = new Image(); image.src='/badge-'+i+'.svg'; await image.decode(); return image; }));
        context.drawImage(images[0],0,0,600,600);
        const stream = canvas.captureStream(10);
        const video = document.querySelector('video');
        let state = {kind:'idle'}, cameraRequests=0, lookups=0, wasmFetches=0, offline=false;
        const originalFetch = window.fetch.bind(window);
        window.fetch = (input, options) => {
          const url = new URL(input, location.href); check(url.origin === location.origin);
          if(offline && url.pathname==='/api/scanner/lookup') return Promise.reject(new TypeError('Offline test'));
          if(url.pathname.endsWith('.wasm')) wasmFetches++;
          return originalFetch(input, options);
        };
        const session = new ScannerSession(video, {
          requestCamera: async () => { cameraRequests++; return stream; },
          createDetector: () => createQrDetector(class { static async getSupportedFormats(){return [];} }),
          lookup: async (token,signal) => { lookups++; return lookupScannerBadge(token,signal); },
          schedule: (callback,delay) => setTimeout(callback,delay), cancel: clearTimeout, now: () => performance.now()
        }, next => { state=next; document.body.dataset.state=next.kind; document.querySelector('#result').textContent = next.kind === 'found' ? next.name : next.kind; });
        check(cameraRequests===0 && wasmFetches===0);
        document.body.dataset.stage='start';
        await session.start(); document.body.dataset.stage='first-scan'; await until(() => state.kind==='found');
        check(cameraRequests===1 && lookups===1 && wasmFetches===1 && state.name==='Synthetic Attendee');
        await wait(400); check(lookups===1);
        document.body.dataset.stage='rearm';
        session.scanNext(); await wait(1600); check(lookups===1 && state.kind==='scanning');
        document.body.dataset.stage='second-scan';
        context.drawImage(images[1],0,0,600,600); await until(() => state.kind==='found');
        check(lookups===2);
        document.body.dataset.stage='offline-failure';
        offline=true; session.scanNext(); await wait(1100);
        context.drawImage(images[0],0,0,600,600); await until(() => state.kind==='verify-error');
        check(lookups===3);
        check(!navigator.serviceWorker || (await navigator.serviceWorker.getRegistrations()).length===0);
        session.dispose(); check(stream.getTracks().every(track => track.readyState==='ended'));
        document.body.dataset.result='passed';
      } catch (error) { document.body.dataset.result='failed'; document.body.dataset.error=error.name; }
    </script></body></html>`;
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/scanner") { res.setHeader("Content-Type", "text/html"); res.end(html); return; }
      if (url.pathname === "/scanner.webmanifest") {
        res.setHeader("Content-Type", "application/manifest+json"); res.end(fs.readFileSync(path.join(root, "public/scanner.webmanifest"))); return;
      }
      if (/^\/badge-[01]\.svg$/.test(url.pathname)) {
        res.setHeader("Content-Type", "image/svg+xml"); res.end(badge.exports.renderBadgeSvg(tokens[Number(url.pathname[7])])); return;
      }
      if (url.pathname === "/api/scanner/lookup") {
        let body = ""; for await (const chunk of req) body += chunk;
        requests.push({ body: JSON.parse(body), method: req.method });
        res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ name: "Synthetic Attendee" })); return;
      }
      const mappings = [
        ["/packages/barcode-detector/", "node_modules/barcode-detector/dist/es/"],
        ["/packages/zxing-wasm/", "node_modules/zxing-wasm/dist/es/"],
        ["/scanner-assets/", "public/scanner-assets/"],
        ["/scanner-icons/", "public/scanner-icons/"],
      ];
      if (url.pathname.startsWith("/source/") && /^scanner-(detector|session|lookup)\.js$/.test(url.pathname.slice(8))) {
        const source = fs.readFileSync(path.join(root, "src/lib", url.pathname.slice(8).replace(/\.js$/, ".ts")), "utf8");
        res.setHeader("Content-Type", "application/javascript");
        res.end(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2020 } }).outputText); return;
      }
      const mapping = mappings.find(([prefix]) => url.pathname.startsWith(prefix));
      if (!mapping) { res.writeHead(404).end(); return; }
      const directory = path.resolve(root, mapping[1]);
      const file = path.resolve(directory, url.pathname.slice(mapping[0].length));
      if (!file.startsWith(directory + path.sep)) { res.writeHead(403).end(); return; }
      res.setHeader("Content-Type", file.endsWith(".wasm") ? "application/wasm" : file.endsWith(".png") ? "image/png" : "application/javascript");
      res.end(fs.readFileSync(file));
    } catch { res.writeHead(500).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const tempRoot = path.resolve(os.tmpdir());
  const profile = fs.mkdtempSync(path.join(tempRoot, "hackjam-scanner-browser-"));
  let browser, socket, command;
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  try {
    browser = spawn(edge, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
      `--user-data-dir=${profile}`, "--remote-debugging-port=0", "about:blank"], { windowsHide: true });
    browser.stdout.resume(); browser.stderr.resume();
    let startupError;
    browser.on("error", error => { startupError = error; });
    const portFile = path.join(profile, "DevToolsActivePort");
    for (let i = 0; i < 200 && !fs.existsSync(portFile) && !startupError && browser.exitCode === null; i++) await sleep(25);
    assert.ok(fs.existsSync(portFile), "Local headless browser could not start");
    const [port, socketPath] = fs.readFileSync(portFile, "utf8").trim().split(/\r?\n/);
    socket = new WebSocket(`ws://127.0.0.1:${port}${socketPath}`);
    await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
    const pending = new Map(); let id = 0;
    socket.addEventListener("message", event => {
      const response = JSON.parse(event.data);
      const call = pending.get(response.id);
      if (call) { pending.delete(response.id); clearTimeout(call.timer); response.error ? call.reject(new Error("Browser protocol failure")) : call.resolve(response.result); }
    });
    command = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const callId = ++id;
      const timer = setTimeout(() => { pending.delete(callId); reject(new Error("Browser protocol timed out")); }, 18000);
      pending.set(callId, { resolve, reject, timer });
      socket.send(JSON.stringify({ id: callId, method, params, sessionId }));
    });
    const { targetId } = await command("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await command("Target.attachToTarget", { targetId, flatten: true });
    await command("Page.enable", {}, sessionId);
    await command("Page.bringToFront", {}, sessionId);
    await command("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/scanner` }, sessionId);
    // Real time matters for video frame delivery; virtual-time dump-dom can finish
    // before a canvas stream delivers its first frame under parallel test load.
    const evaluated = await command("Runtime.evaluate", {
      expression: `(async () => { const end=Date.now()+15000; while(!document.body?.dataset.result && Date.now()<end) await new Promise(r=>setTimeout(r,25)); return {status:document.body?.dataset.result,stage:document.body?.dataset.stage,state:document.body?.dataset.state,html:document.body?.innerHTML}; })()`,
      awaitPromise: true, returnByValue: true,
    }, sessionId);
    const result = evaluated.result.value;
    assert.equal(result?.status, "passed", `Real browser scanner did not complete at ${result?.stage}/${result?.state}`);
    const appManifest = await command("Page.getAppManifest", {}, sessionId);
    assert.deepEqual(appManifest.errors, []);
    assert.equal(JSON.parse(appManifest.data).start_url, "/scanner");
    const installability = await command("Page.getInstallabilityErrors", {}, sessionId);
    assert.deepEqual(installability.installabilityErrors, [], "Chromium installability checks must pass without a service worker");
    assert.deepEqual(requests, tokens.map(token => ({ body: { token }, method: "POST" })));
    assert.ok(!result.html.includes(tokens[0]) && !result.html.includes(tokens[1]), "DOM must never contain raw tokens");
  } finally {
    if (command && socket?.readyState === WebSocket.OPEN) await Promise.race([command("Browser.close").catch(() => {}), sleep(1000)]);
    socket?.close();
    for (let i = 0; i < 40 && browser?.exitCode === null; i++) await sleep(50);
    if (browser?.exitCode === null) browser.kill();
    await new Promise(resolve => server.close(resolve));
    // Delete only this test's verified, uniquely named temporary browser profile.
    if (path.resolve(profile).startsWith(tempRoot + path.sep + "hackjam-scanner-browser-")) {
      for (let i = 0; ; i++) {
        try { fs.rmSync(profile, { recursive: true, force: true }); break; }
        catch (error) { if (i >= 30) throw error; await sleep(100); }
      }
    }
  }
});
