const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(modules = {}, globals = {}) {
  const output = ts.transpileModule(readFileSync("src/lib/scanner-detector.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const context = { exports: {}, ...globals, require: (name) => {
    assert.ok(Object.hasOwn(modules, name), `Unexpected dependency: ${name}`);
    return modules[name];
  } };
  vm.runInNewContext(output, context);
  return context.exports;
}

test("native QR capability selects a QR-only detector without loading fallback", async () => {
  const calls = [];
  const frame = {};
  class Native {
    static async getSupportedFormats() { return ["qr_code"]; }
    constructor(options) { calls.push(JSON.parse(JSON.stringify(options))); }
    async detect(input) { assert.equal(input, frame); return [{ rawValue: "native-raw" }]; }
  }
  const detector = await load().createQrDetector(Native, () => assert.fail("Native must stay lazy"));
  assert.deepEqual(calls, [{ formats: ["qr_code"] }]);
  assert.deepEqual(Array.from(await detector.detect(frame)), ["native-raw"]);
});

for (const reason of ["missing", "no-qr", "no-formats-api", "probe-error", "constructor-error"]) {
  test(`${reason} selects the explicit fallback`, async () => {
    class Native {
      static async getSupportedFormats() {
        if (reason === "probe-error") throw new Error("private-error");
        return reason === "no-qr" ? ["ean_13"] : ["qr_code"];
      }
      constructor() { if (reason === "constructor-error") throw new Error("private-error"); }
    }
    if (reason === "no-formats-api") Native.getSupportedFormats = undefined;
    let loads = 0;
    const fallback = { detect: async () => ["fallback-raw"] };
    const detector = await load().createQrDetector(reason === "missing" ? undefined : Native, async () => { loads++; return fallback; });
    assert.equal(detector, fallback);
    assert.equal(loads, 1);
  });
}

test("a native detect failure switches once and uses the same frame/interface", async () => {
  let nativeCalls = 0, loads = 0;
  const frame = {};
  class Native {
    static async getSupportedFormats() { return ["qr_code"]; }
    async detect() { nativeCalls++; throw new Error("unusable"); }
  }
  const detector = await load().createQrDetector(Native, async () => {
    loads++;
    return { detect: async (input) => { assert.equal(input, frame); return ["fallback"]; } };
  });
  assert.deepEqual(Array.from(await detector.detect(frame)), ["fallback"]);
  await detector.detect(frame);
  assert.equal(nativeCalls, 1);
  assert.equal(loads, 1);
});

test("empty native frames stay native", async () => {
  class Native {
    static async getSupportedFormats() { return ["qr_code"]; }
    async detect() { return []; }
  }
  const detector = await load().createQrDetector(Native, () => assert.fail("Empty frames are normal"));
  assert.deepEqual(Array.from(await detector.detect({})), []);
});

test("fallback loads lazily, fetches only local WASM and initializes before video detection", async () => {
  const calls = [];
  const binary = new ArrayBuffer(8);
  const frame = {};
  const api = {
    ZXING_WASM_VERSION: "test-version",
    prepareZXingModule: async (options) => {
      assert.equal(options.fireImmediately, true);
      assert.equal(options.overrides.wasmBinary, binary);
      assert.equal(options.overrides.locateFile("anything"), "/scanner-assets/zxing_reader-test-version.wasm");
      calls.push("initialized");
    },
    BarcodeDetector: class {
      constructor(options) { assert.deepEqual(Array.from(options.formats), ["qr_code"]); }
      async detect(input) { assert.equal(input, frame); return [{ rawValue: "raw-value" }]; }
    },
  };
  const { loadFallbackDetector } = load({ "barcode-detector/ponyfill": api }, {
    fetch: async (url, options) => {
      assert.equal(url, "/scanner-assets/zxing_reader-test-version.wasm");
      assert.equal(options.mode, "same-origin");
      assert.equal(options.redirect, "error");
      calls.push("fetched");
      return { ok: true, arrayBuffer: async () => binary };
    },
  });
  assert.deepEqual(calls, []);
  const detector = await loadFallbackDetector();
  assert.deepEqual(calls, ["fetched", "initialized"]);
  assert.deepEqual(Array.from(await detector.detect(frame)), ["raw-value"]);
});

test("failed local WASM fetch rejects without trying the CDN or initialization", async () => {
  let fetches = 0;
  const api = { ZXING_WASM_VERSION: "test", prepareZXingModule: () => assert.fail("No WASM"), BarcodeDetector: class {} };
  const detector = load({ "barcode-detector/ponyfill": api }, { fetch: async () => { fetches++; return { ok: false }; } });
  await assert.rejects(detector.loadFallbackDetector(), /Scanner decoder unavailable/);
  assert.equal(fetches, 1);
});

test("the actual pinned WASM reader decodes the existing rounded badge SVG", async () => {
  const { prepareZXingModule, readBarcodes } = await import("zxing-wasm/reader");
  await prepareZXingModule({ overrides: { wasmBinary: readFileSync(require.resolve("zxing-wasm/reader/zxing_reader.wasm")) }, fireImmediately: true });
  const code = ts.transpileModule(readFileSync("src/lib/badge.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const modules = { "server-only": {}, "node:crypto": require("node:crypto"), qrcode: require("qrcode"),
    "@/lib/prisma": {}, "@/lib/portal-access": {} };
  const context = { exports: {}, require: (name) => { assert.ok(name in modules); return modules[name]; } };
  vm.runInNewContext(code, context);
  const token = require("node:crypto").randomBytes(32).toString("base64url");
  const svg = context.exports.renderBadgeSvg(token);
  for (const size of [240, 600]) {
    const { data, info } = await require("sharp")(Buffer.from(svg)).resize(size, size).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const values = await readBarcodes({ data: new Uint8ClampedArray(data), width: info.width, height: info.height }, { formats: ["QRCode"] });
    assert.equal(values[0]?.text, token);
  }
});
