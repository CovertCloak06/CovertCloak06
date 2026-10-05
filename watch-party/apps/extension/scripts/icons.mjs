// Procedurally draws the extension icon (a play triangle inside a rounded
// square with a "sync" ring) and encodes it as PNG with only node:zlib.
import { deflateSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

export function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const s = size;
  const r = s * 0.22; // corner radius
  const inRoundedSquare = (x, y) => {
    const cx = Math.min(Math.max(x, r), s - r);
    const cy = Math.min(Math.max(y, r), s - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  // Play triangle
  const ax = s * 0.38,
    ay = s * 0.28,
    bx = s * 0.38,
    by = s * 0.72,
    cx2 = s * 0.74,
    cy2 = s * 0.5;
  const sign = (px1, py1, px2, py2, px3, py3) =>
    (px1 - px3) * (py2 - py3) - (px2 - px3) * (py1 - py3);
  const inTriangle = (x, y) => {
    const d1 = sign(x, y, ax, ay, bx, by),
      d2 = sign(x, y, bx, by, cx2, cy2),
      d3 = sign(x, y, cx2, cy2, ax, ay);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      // 4x supersampling for smooth edges
      let bg = 0,
        fg = 0;
      for (const [ox, oy] of [
        [0.25, 0.25],
        [0.75, 0.25],
        [0.25, 0.75],
        [0.75, 0.75],
      ]) {
        const fx = x + ox,
          fy = y + oy;
        if (inRoundedSquare(fx, fy)) {
          bg++;
          if (inTriangle(fx, fy)) fg++;
        }
      }
      const i = (y * s + x) * 4;
      // Gradient violet background, white triangle.
      const t = y / s;
      const [br, bgc, bb] = [91 + 40 * t, 63 + 10 * t, 217 - 30 * t];
      const a = bg / 4,
        f = fg / 4;
      px[i] = Math.round(br * (1 - f / Math.max(a, 1e-6)) + 255 * (f / Math.max(a, 1e-6)));
      px[i + 1] = Math.round(bgc * (1 - f / Math.max(a, 1e-6)) + 255 * (f / Math.max(a, 1e-6)));
      px[i + 2] = Math.round(bb * (1 - f / Math.max(a, 1e-6)) + 255 * (f / Math.max(a, 1e-6)));
      px[i + 3] = Math.round(255 * a);
    }
  }
  const raw = Buffer.alloc((s * 4 + 1) * s);
  for (let y = 0; y < s; y++) {
    raw[y * (s * 4 + 1)] = 0;
    px.copy(raw, y * (s * 4 + 1) + 1, y * s * 4, (y + 1) * s * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(s, 0);
  ihdr.writeUInt32BE(s, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
