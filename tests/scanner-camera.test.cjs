const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const jsx = require("react/jsx-runtime");
const { renderToStaticMarkup } = require("react-dom/server");
const plain = (value) => JSON.parse(JSON.stringify(value));
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const compiled = new Map();

function load(path, modules = {}, globals = {}) {
  if (!compiled.has(path)) compiled.set(path, ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText);
  const context = { exports: {}, AbortController, console: Object.fromEntries(["log", "error", "warn"].map((key) => [key, () => assert.fail("No token/error logging")])),
    ...globals, require: (name) => { assert.ok(Object.hasOwn(modules, name), `Unexpected dependency: ${name}`); return modules[name]; } };
  vm.runInNewContext(compiled.get(path), context);
  return context.exports;
}
const camera = load("src/lib/scanner-session.ts");
const lookup = load("src/lib/scanner-lookup.ts");

class Clock {
  time = 0;
  id = 0;
  jobs = new Map();
  schedule = (callback, delay) => { const id = ++this.id; this.jobs.set(id, { callback, at: this.time + delay }); return id; };
  cancel = (id) => this.jobs.delete(id);
  async advance(ms) {
    const end = this.time + ms;
    while (true) {
      const next = [...this.jobs].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      this.time = next[1].at;
      this.jobs.delete(next[0]);
      next[1].callback();
      await flush();
    }
    this.time = end;
    await flush();
  }
}

function setup(overrides = {}) {
  const clock = new Clock();
  const states = [];
  const calls = { camera: 0, detector: 0, frames: 0, lookup: [], stops: 0, pause: 0 };
  const trackEvents = new Set();
  const tracks = [0, 1].map(() => ({ stop: () => calls.stops++,
    addEventListener: (_, callback) => trackEvents.add(callback), removeEventListener: (_, callback) => trackEvents.delete(callback) }));
  const stream = { getTracks: () => tracks };
  const video = { readyState: 2, videoWidth: 640, srcObject: null, play: async () => {}, pause: () => calls.pause++ };
  const frame = { values: [] };
  const deps = {
    requestCamera: async () => { calls.camera++; return stream; },
    createDetector: async () => { calls.detector++; return { detect: async (input) => { assert.equal(input, video); calls.frames++; return frame.values; } }; },
    lookup: async (token, signal) => { calls.lookup.push({ token, signal }); return { kind: "found", name: "Synthetic Attendee" }; },
    schedule: clock.schedule, cancel: clock.cancel, now: () => clock.time,
    ...overrides,
  };
  const session = new camera.ScannerSession(video, deps, (state) => states.push(plain(state)));
  return { session, states, calls, clock, frame, stream, video, trackEvents, state: () => states.at(-1) };
}

test("camera stays off until explicit start; request is video-only with rear preference", async () => {
  const s = setup();
  assert.equal(s.calls.camera, 0);
  assert.equal(s.clock.jobs.size, 0);
  const options = [];
  await camera.requestScannerCamera({ secure: true, devices: { getUserMedia: async (value) => { options.push(plain(value)); return s.stream; } } });
  assert.deepEqual(options, [{ audio: false, video: { facingMode: { ideal: "environment" } } }]);
  await s.session.start();
  assert.equal(s.calls.camera, 1);
  assert.equal(s.video.srcObject, s.stream);
});

test("insecure/unsupported camera environments reject without requesting permission", async () => {
  await assert.rejects(camera.requestScannerCamera({ secure: false, devices: {} }), { name: "InsecureContext" });
  await assert.rejects(camera.requestScannerCamera({ secure: true, devices: {} }), { name: "UnsupportedCamera" });
});

test("decode frequency is five attempts per second with no overlapping slow detections", async () => {
  const s = setup();
  await s.session.start();
  await s.clock.advance(1000);
  assert.equal(s.calls.frames, 5);
  const pending = deferred();
  let count = 0;
  const slow = setup({ createDetector: async () => ({ detect: () => { count++; return pending.promise; } }) });
  await slow.session.start();
  await slow.clock.advance(5000);
  assert.equal(count, 1);
  assert.equal(slow.clock.jobs.size, 0);
  pending.resolve([]);
  await flush();
  await slow.clock.advance(199);
  assert.equal(count, 1);
  await slow.clock.advance(1);
  assert.equal(count, 2);
});

test("a decoded value triggers one lookup and stays paused until Scan Next", async () => {
  const s = setup();
  s.frame.values = ["synthetic-token"];
  await s.session.start();
  await s.clock.advance(200);
  assert.deepEqual(s.state(), { kind: "found", name: "Synthetic Attendee" });
  await s.clock.advance(5000);
  assert.equal(s.calls.lookup.length, 1);
  assert.equal(s.calls.frames, 1);
  assert.ok(!JSON.stringify(s.states).includes("synthetic-token"));
  s.session.scanNext();
  assert.equal(s.state().kind, "rearming");
  await s.clock.advance(999);
  assert.equal(s.calls.frames, 1);
  await s.clock.advance(1);
  await s.clock.advance(2000);
  assert.equal(s.calls.lookup.length, 1, "Continuously visible previous badge is suppressed");
  s.frame.values = ["different-token"];
  await s.clock.advance(200);
  assert.equal(s.calls.lookup.length, 2);
  assert.equal(s.calls.lookup[1].token, "different-token");
});

test("previous badge can scan again only after a sustained absence", async () => {
  const s = setup(); s.frame.values = ["badge"];
  await s.session.start(); await s.clock.advance(200);
  s.session.scanNext(); await s.clock.advance(1000);
  s.frame.values = []; await s.clock.advance(400);
  s.frame.values = ["badge"]; await s.clock.advance(200);
  assert.equal(s.calls.lookup.length, 1, "Brief missed frames must not clear suppression");
  s.frame.values = []; await s.clock.advance(800);
  s.frame.values = ["badge"]; await s.clock.advance(200);
  assert.equal(s.calls.lookup.length, 2);
});

test("pending lookups do not pile up; network retry reuses only the private pending value", async () => {
  const pending = deferred(); let requests = 0;
  const s = setup({ lookup: async () => { requests++; return requests === 1 ? pending.promise : { kind: "found", name: "Retry Name" }; } });
  s.frame.values = ["private-token"];
  await s.session.start(); await s.clock.advance(5000);
  assert.equal(s.state().kind, "verifying"); assert.equal(requests, 1);
  s.session.scanNext(); s.session.retryLookup();
  assert.equal(requests, 1);
  pending.resolve({ kind: "verify-error" }); await flush();
  assert.equal(s.state().kind, "verify-error");
  s.session.retryLookup(); s.session.retryLookup(); await flush();
  assert.equal(requests, 2);
  assert.deepEqual(s.state(), { kind: "found", name: "Retry Name" });
  assert.ok(!JSON.stringify(s.states).includes("private-token"));
});

test("lookup transport sends only raw decoded value in a no-store same-origin POST", async () => {
  const controller = new AbortController();
  const value = await lookup.lookupScannerBadge("https://random.example/qr", controller.signal, async (url, options) => {
    assert.equal(url, "/api/scanner/lookup");
    assert.equal(options.method, "POST"); assert.equal(options.cache, "no-store");
    assert.equal(options.mode, "same-origin"); assert.equal(options.redirect, "error");
    assert.equal(options.signal, controller.signal);
    assert.deepEqual(JSON.parse(options.body), { token: "https://random.example/qr" });
    return Response.json({ name: "Only Name" });
  });
  assert.deepEqual(plain(value), { kind: "found", name: "Only Name" });
});

test("invalid badges share one result; network/server/unexpected responses stay distinct", async () => {
  for (const status of [400, 404, 413, 415]) {
    assert.deepEqual(plain(await lookup.lookupScannerBadge("raw", new AbortController().signal, async () => Response.json({ error: "private" }, { status }))), { kind: "not-found" });
  }
  for (const fetcher of [async () => { throw new Error("private-network"); }, async () => Response.json({ error: "private" }, { status: 503 }),
    async () => Response.json({ name: "Name", email: "private" }), async () => new Response("bad-json"), async () => Response.json({})]) {
    assert.deepEqual(plain(await lookup.lookupScannerBadge("raw", new AbortController().signal, fetcher)), { kind: "verify-error" });
  }
});

for (const [name, problem] of [["NotAllowedError", "permission"], ["SecurityError", "permission"], ["NotFoundError", "missing"],
  ["NotReadableError", "busy"], ["InsecureContext", "insecure"], ["UnsupportedCamera", "unsupported"]]) {
  test(`${name} has a recoverable safe camera state`, async () => {
    const s = setup({ requestCamera: async () => { throw { name, message: "private technical stack" }; } });
    await s.session.start();
    assert.deepEqual(s.state(), { kind: "camera-error", problem });
    assert.equal(s.clock.jobs.size, 0);
    await s.session.start();
    assert.ok(!JSON.stringify(s.states).includes("private"));
  });
}

test("decoder initialization/runtime failures stop camera and produce safe retry state", async () => {
  for (const createDetector of [async () => { throw new Error("private-wasm"); }, async () => ({ detect: async () => { throw new Error("private-decode"); } })]) {
    const s = setup({ createDetector });
    await s.session.start(); await s.clock.advance(200);
    assert.deepEqual(s.state(), { kind: "camera-error", problem: "decoder" });
    assert.equal(s.calls.stops, 2); assert.equal(s.video.srcObject, null);
    assert.equal(s.clock.jobs.size, 0);
  }
});

test("stop/dispose stops every track, cancels timers and ignores stale decode results", async () => {
  const pending = deferred();
  const s = setup({ createDetector: async () => ({ detect: () => pending.promise }) });
  await s.session.start(); await s.clock.advance(200);
  s.session.dispose(); const count = s.states.length;
  assert.equal(s.calls.stops, 2); assert.equal(s.video.srcObject, null);
  assert.equal(s.clock.jobs.size, 0);
  pending.resolve(["late-token"]); await flush(); await s.clock.advance(5000);
  assert.equal(s.states.length, count); assert.equal(s.calls.lookup.length, 0);
  await s.session.start(); assert.equal(s.calls.camera, 1);
  const rearm = setup(); rearm.frame.values = ["badge"];
  await rearm.session.start(); await rearm.clock.advance(200);
  rearm.session.scanNext(); rearm.session.stop(); await rearm.clock.advance(1000);
  assert.equal(rearm.state().kind, "idle"); assert.equal(rearm.clock.jobs.size, 0);
});

test("late camera grant stops its tracks after navigation and cannot update state", async () => {
  const pending = deferred();
  const s = setup({ requestCamera: () => pending.promise });
  const start = s.session.start(); s.session.dispose();
  pending.resolve(s.stream); await start;
  assert.equal(s.calls.stops, 2); assert.equal(s.video.srcObject, null);
  assert.equal(s.calls.detector, 0);
});

test("camera interruption stops capture, removes listeners and offers retry", async () => {
  const s = setup(); await s.session.start();
  for (const callback of [...s.trackEvents]) callback();
  assert.deepEqual(s.state(), { kind: "camera-error", problem: "busy" });
  assert.equal(s.calls.stops, 2); assert.equal(s.trackEvents.size, 0);
  assert.equal(s.clock.jobs.size, 0);
});

test("stale initialization and detections cannot overwrite a restarted camera session", async () => {
  const pending = deferred(); let decodes = 0;
  const s = setup({ createDetector: async () => ({ detect: async () => { decodes++; return decodes === 1 ? pending.promise : []; } }) });
  await s.session.start(); await s.clock.advance(200);
  s.session.stop(); await s.session.start(); await s.clock.advance(400);
  assert.equal(decodes, 1, "Restart must not overlap a still-pending old decode");
  pending.resolve(["stale-badge"]); await flush(); await s.clock.advance(200);
  assert.equal(s.state().kind, "scanning"); assert.equal(s.calls.lookup.length, 0);
  assert.equal(decodes, 2);
  const initialization = deferred();
  const next = setup({ createDetector: () => initialization.promise });
  const start = next.session.start(); await flush(); next.session.dispose();
  initialization.resolve({ detect: () => assert.fail("Stale detector must never run") }); await start;
  assert.equal(next.clock.jobs.size, 0); assert.equal(next.calls.stops, 2);
});

test("cleanup aborts lookup and stale name cannot render after restart", async () => {
  const pending = deferred(); let signal;
  const s = setup({ lookup: async (_, input) => { signal = input; return pending.promise; } });
  s.frame.values = ["badge"]; await s.session.start(); await s.clock.advance(200);
  s.session.stop(); assert.equal(signal.aborted, true);
  pending.resolve({ kind: "found", name: "Stale Name" }); await flush();
  assert.equal(s.state().kind, "idle"); assert.ok(!JSON.stringify(s.states).includes("Stale Name"));
});

test("expiring auth stops capture rather than exposing an attendee result", async () => {
  for (const status of [401, 403]) {
    const result = await lookup.lookupScannerBadge("raw", new AbortController().signal, async () => Response.json({}, { status }));
    const s = setup({ lookup: async () => result }); s.frame.values = ["badge"];
    await s.session.start(); await s.clock.advance(200);
    assert.deepEqual(s.state(), { kind: "access-error", signedOut: status === 401 });
    assert.equal(s.calls.stops, 2);
  }
});

const primitives = { "react/jsx-runtime": jsx, "@/lib/clsx": load("src/lib/clsx.ts") };
const ui = load("src/app/scanner/Scanner.tsx", {
  react: React, "react/jsx-runtime": jsx,
  "@/components/ui/PixelButton": load("src/components/ui/PixelButton.tsx", primitives),
  "@/components/ui/PixelCard": load("src/components/ui/PixelCard.tsx", primitives),
  "@/lib/scanner-detector": {}, "@/lib/scanner-lookup": lookup, "@/lib/scanner-session": camera,
  "./InstallHelp": load("src/app/scanner/InstallHelp.tsx", { "react/jsx-runtime": jsx }),
});

test("initial SSR renders camera off and explicit Start Camera without browser APIs", () => {
  const html = renderToStaticMarkup(jsx.jsx(ui.default, {}));
  assert.match(html, /START CAMERA|CAMERA OFF/);
  assert.match(html, /playsInline|playsinline/); assert.match(html, /muted/);
  assert.doesNotMatch(html, /SCAN NEXT|Synthetic Attendee/);
});

test("accessible result UI shows only name, generic errors and correct recovery actions", () => {
  const html = (state) => renderToStaticMarkup(jsx.jsx(ui.ScannerStatus, { state, onStart() {}, onNext() {}, onRetry() {} }));
  const found = html({ kind: "found", name: "Synthetic Attendee" });
  assert.match(found, /BADGE FOUND/); assert.match(found, /Synthetic Attendee/); assert.match(found, /SCAN NEXT/);
  assert.match(found, /aria-live="polite"/);
  assert.match(html({ kind: "not-found" }), /BADGE NOT FOUND/);
  const network = html({ kind: "verify-error" });
  assert.match(network, /UNABLE TO VERIFY BADGE/); assert.match(network, /TRY AGAIN/); assert.doesNotMatch(network, /BADGE NOT FOUND/);
  const permission = html({ kind: "camera-error", problem: "permission" });
  assert.match(permission, /permission is required/); assert.match(permission, /RETRY CAMERA/);
});
