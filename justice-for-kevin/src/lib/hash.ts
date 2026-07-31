/**
 * SHA-256 hashing used for attachment integrity. Works in both the browser
 * (Web Crypto) and Node (node:crypto exposes webcrypto as globalThis.crypto
 * on Node 18+), so the same function serves client-side pre-upload hashing
 * and server-side verification.
 */

export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const buffer: ArrayBuffer =
    data instanceof Uint8Array
      ? (data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)
      : data;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return bytesToHex(new Uint8Array(digest));
}

export async function sha256HexOfFile(file: Blob): Promise<string> {
  return sha256Hex(await file.arrayBuffer());
}

export async function sha256HexOfText(text: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(text));
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}
