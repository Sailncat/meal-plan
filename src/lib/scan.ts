// Barcode reading. Uses the browser's own BarcodeDetector where there is one (Chrome on Android, macOS, ChromeOS);
// elsewhere it loads a WebAssembly reader from the app's own files on first use, so nothing comes from a CDN.

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

export interface Detector {
  detect(source: ImageBitmapSource): Promise<{ rawValue: string }[]>;
}

let detector: Promise<Detector> | null = null;

export function getDetector(): Promise<Detector> {
  detector ??= (async () => {
    const Native = (globalThis as { BarcodeDetector?: any }).BarcodeDetector;
    if (Native) {
      try {
        const supported: string[] = await Native.getSupportedFormats();
        const formats = FORMATS.filter((f) => supported.includes(f));
        if (formats.includes('ean_13')) return new Native({ formats }) as Detector;
      } catch {
        // fall through to the WebAssembly reader
      }
    }
    const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
      import('barcode-detector/ponyfill'),
      import('zxing-wasm/reader/zxing_reader.wasm?url'),
    ]);
    prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) } });
    return new BarcodeDetector({ formats: FORMATS as never }) as unknown as Detector;
  })().catch((e) => {
    detector = null;
    throw e;
  });
  return detector;
}

function checkDigitOk(code: string): boolean {
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** UPC-E is a squeezed UPC-A; its check digit belongs to the full number. */
function upcEToA(e: string): string {
  const [n, a, b, c, d, f, g, check] = e.split('');
  const mid =
    g <= '2' ? `${a}${b}${g}0000${c}${d}${f}` : g === '3' ? `${a}${b}${c}00000${d}${f}` : g === '4' ? `${a}${b}${c}${d}00000${f}` : `${a}${b}${c}${d}${f}0000${g}`;
  return n + mid + check;
}

/** EAN-13, EAN-8, UPC-A (12) and UPC-E (8) all end in a check digit; a misread almost never passes it. */
export function validBarcode(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  if (checkDigitOk(code)) return true;
  return code.length === 8 && /^[01]/.test(code) && checkDigitOk(upcEToA(code));
}

/** True when what was typed looks like a barcode rather than a name. */
export const looksLikeBarcode = (q: string) => /^\d{8,14}$/.test(q.replace(/\s/g, ''));
