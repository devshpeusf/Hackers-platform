const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const jsx = require("react/jsx-runtime");
const { renderToStaticMarkup } = require("react-dom/server");
const { unstable_doesMiddlewareMatch } = require("next/experimental/testing/server");

function load(file, modules = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const context = { exports: {}, require: name => { assert.ok(Object.hasOwn(modules, name), `Unexpected import: ${name}`); return modules[name]; } };
  vm.runInNewContext(code, context);
  return context.exports;
}
const manifest = JSON.parse(fs.readFileSync("public/scanner.webmanifest", "utf8"));
const layout = load("src/app/scanner/layout.tsx");

test("scanner manifest has a stable standalone launch target and narrow scope", () => {
  assert.equal(manifest.name, "HackJam Scanner");
  assert.ok(manifest.short_name);
  assert.equal(manifest.start_url, "/scanner");
  assert.equal(manifest.id, "/scanner");
  assert.equal(manifest.scope, "/scanner");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.prefer_related_applications, false);
  assert.equal(manifest.theme_color, layout.viewport.themeColor);
  assert.equal(manifest.background_color, "#07060d");
  assert.deepEqual(manifest.icons.filter(icon => icon.purpose === "any").map(icon => icon.sizes), ["192x192", "512x512"]);
  assert.deepEqual(manifest.icons.filter(icon => icon.purpose === "maskable").map(icon => icon.sizes), ["192x192", "512x512"]);
});

test("scanner metadata links its own manifest and Apple icon without changing portal metadata", () => {
  assert.equal(layout.metadata.title, manifest.name);
  assert.equal(layout.metadata.description, manifest.description);
  assert.equal(layout.metadata.manifest, "/scanner.webmanifest");
  assert.equal(layout.metadata.appleWebApp.capable, true);
  assert.equal(layout.metadata.other["apple-mobile-web-app-capable"], "yes");
  assert.equal(layout.metadata.appleWebApp.title, manifest.name);
  assert.equal(layout.metadata.icons.apple[0].url, "/scanner-icons/apple-touch-icon.png");
  assert.equal(layout.default({ children: "scanner-content" }), "scanner-content");
  const fonts = { Press_Start_2P: () => ({ variable: "pixel" }), Space_Mono: () => ({ variable: "body" }) };
  const root = load("src/app/layout.tsx", { "next/font/google": fonts, "./globals.css": {}, "react/jsx-runtime": jsx });
  assert.equal(root.metadata.title, "HackJam '26");
  assert.equal(root.metadata.manifest, undefined);
});

test("real PNGs match every declared size; maskable artwork stays in the safe circle", async () => {
  const sharp = require("sharp");
  const icons = [...manifest.icons, { src: layout.metadata.icons.apple[0].url, sizes: "180x180" }];
  for (const icon of icons) {
    assert.ok(icon.src.startsWith("/scanner-icons/") && !icon.src.includes(".."));
    const file = path.join("public", icon.src);
    const metadata = await sharp(file).metadata();
    const size = Number(icon.sizes.split("x")[0]);
    assert.equal(metadata.width, size); assert.equal(metadata.height, size);
    assert.equal(metadata.format, "png");
    if (icon.purpose !== "maskable") continue;
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let artworkPixels = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const index = (y * size + x) * info.channels;
      assert.equal(data[index + 3], 255, "Maskable icon background must be opaque");
      if (data[index] === 7 && data[index + 1] === 6 && data[index + 2] === 13) continue;
      artworkPixels++;
      assert.ok(Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) <= size * 0.4, "Artwork must survive circular masking");
    }
    assert.ok(artworkPixels > size * size * 0.1, "Icon must contain recognizable artwork");
  }
});

test("install instructions use native menus, remain collapsed and hide in standalone mode", () => {
  const help = load("src/app/scanner/InstallHelp.tsx", { "react/jsx-runtime": jsx });
  const html = renderToStaticMarkup(jsx.jsx(help.default, {}));
  assert.match(html, /<details/); assert.doesNotMatch(html, /<details[^>]* open/);
  assert.match(html, /Add to Home Screen/); assert.match(html, /Open as Web App/);
  assert.match(html, /Install app/); assert.match(html, /internet connection is required/);
  assert.match(html, /display-mode:standalone/);
});

test("only public installation/decoder assets bypass session proxy; scanner and API remain matched", () => {
  const { config } = load("src/proxy.ts", { "next/server": {}, "@/lib/supabase/middleware": {} });
  const matches = url => unstable_doesMiddlewareMatch({ config, nextConfig: {}, url });
  for (const url of ["/scanner.webmanifest", "/scanner.webmanifest?v=1", "/scanner-icons/icon-192.png",
    "/scanner-icons/maskable-512.png", "/scanner-icons/apple-touch-icon.png", "/scanner-assets/zxing_reader-3.1.6.wasm"]) {
    assert.equal(matches(url), false, url);
  }
  for (const url of ["/scanner", "/scanner/child", "/api/scanner/lookup", "/admin/applications",
    "/scanner.webmanifest/extra", "/api/scanner.webmanifest", "/scanner-assets-private/test", "/auth/callback"]) {
    assert.equal(matches(url), true, url);
  }
});
