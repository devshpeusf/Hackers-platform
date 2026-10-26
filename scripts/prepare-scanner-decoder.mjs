import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ZXING_WASM_VERSION, ZXING_WASM_SHA256 } from "barcode-detector/ponyfill";

const require = createRequire(import.meta.url);
const source = require.resolve("zxing-wasm/reader/zxing_reader.wasm");
const bytes = await readFile(source);
if (createHash("sha256").update(bytes).digest("hex") !== ZXING_WASM_SHA256) {
  throw new Error("Scanner decoder checksum mismatch");
}
const output = new URL("../public/scanner-assets/", import.meta.url);
await mkdir(output, { recursive: true });
await writeFile(new URL(`zxing_reader-${ZXING_WASM_VERSION}.wasm`, output), bytes);
await copyFile(resolve(dirname(require.resolve("zxing-wasm/reader")), "../../../LICENSE"),
  fileURLToPath(new URL("LICENSE.zxing-wasm.txt", output)));
await copyFile(resolve(dirname(require.resolve("barcode-detector/ponyfill")), "../../LICENSE"),
  fileURLToPath(new URL("LICENSE.barcode-detector.txt", output)));
console.log(`Prepared same-origin scanner decoder (${ZXING_WASM_VERSION}, ${bytes.byteLength} bytes).`);
