export interface QrDetector {
  detect(frame: HTMLVideoElement): Promise<string[]>;
}

interface BarcodeReader {
  detect(frame: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

export interface NativeQrConstructor {
  new(options: { formats: string[] }): BarcodeReader;
  getSupportedFormats?: () => Promise<readonly string[]>;
}

/** Only imported after native QR capability fails. No browser globals are patched. */
export async function loadFallbackDetector(): Promise<QrDetector> {
  const { BarcodeDetector, prepareZXingModule, ZXING_WASM_VERSION } = await import("barcode-detector/ponyfill");
  const asset = `/scanner-assets/zxing_reader-${ZXING_WASM_VERSION}.wasm`;
  // Prefetch explicitly so a failed local fetch can never try the package's default CDN.
  const response = await fetch(asset, { mode: "same-origin", credentials: "same-origin", redirect: "error" });
  if (!response.ok) throw new Error("Scanner decoder unavailable");
  await prepareZXingModule({
    overrides: { wasmBinary: await response.arrayBuffer(), locateFile: () => asset },
    fireImmediately: true,
  });
  const detector = new BarcodeDetector({ formats: ["qr_code"] });
  return { detect: async (frame) => (await detector.detect(frame)).map((code) => code.rawValue) };
}

/** One interface and one scan loop, with a one-way switch when native detection fails. */
export async function createQrDetector(
  native = (globalThis as { BarcodeDetector?: NativeQrConstructor }).BarcodeDetector,
  loadFallback: () => Promise<QrDetector> = loadFallbackDetector,
): Promise<QrDetector> {
  let reader: BarcodeReader | undefined;
  try {
    if (native?.getSupportedFormats && (await native.getSupportedFormats()).includes("qr_code")) {
      reader = new native({ formats: ["qr_code"] });
    }
  } catch {
    // Missing/broken native support is a normal fallback case.
  }
  if (!reader) return loadFallback();

  let fallback: QrDetector | undefined;
  return {
    async detect(frame) {
      if (fallback) return fallback.detect(frame);
      try {
        return (await reader.detect(frame)).map((code) => code.rawValue);
      } catch {
        fallback = await loadFallback();
        return fallback.detect(frame);
      }
    },
  };
}
