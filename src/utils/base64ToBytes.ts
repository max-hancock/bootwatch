/**
 * Pure-JS base64 → Uint8Array. Avoids relying on Hermes' `atob`, which can be
 * inconsistent in release builds (same approach as ReportSightingModal).
 */
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function base64ToUint8Array(input: string): Uint8Array {
  const clean = input.replace(/[^A-Za-z0-9+/=]/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const byteLen = (clean.length / 4) * 3 - padding;
  const out = new Uint8Array(byteLen);
  let outIdx = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c1 = BASE64_CHARS.indexOf(clean[i]!);
    const c2 = BASE64_CHARS.indexOf(clean[i + 1]!);
    const c3 = BASE64_CHARS.indexOf(clean[i + 2]!);
    const c4 = BASE64_CHARS.indexOf(clean[i + 3]!);
    const triplet = (c1 << 18) | (c2 << 12) | ((c3 & 0x3f) << 6) | (c4 & 0x3f);
    if (outIdx < byteLen) out[outIdx++] = (triplet >> 16) & 0xff;
    if (outIdx < byteLen) out[outIdx++] = (triplet >> 8) & 0xff;
    if (outIdx < byteLen) out[outIdx++] = triplet & 0xff;
  }
  return out;
}

export function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const u8 = base64ToUint8Array(b64);
  const out = new ArrayBuffer(u8.byteLength);
  new Uint8Array(out).set(u8);
  return out;
}
