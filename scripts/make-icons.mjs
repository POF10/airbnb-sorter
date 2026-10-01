// Draws the extension icons (a white ↕ on a dark rounded square, like the launcher button) and writes
// src/extension/icons/{16,32,48,128}.png. No dependencies: shapes are rasterized with supersampling and
// encoded as PNG by hand. Run once with `node scripts/make-icons.mjs`; the PNGs are committed.
import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';

const SIZES = [16, 32, 48, 128];
const OUT = 'src/extension/icons';
const SAMPLES = 8; // supersampling grid per pixel
const BG = [0x22, 0x22, 0x22];
const FG = [0xff, 0xff, 0xff];

// All shapes live in the unit square.
const RADIUS = 0.22;
const inRoundedSquare = (x, y) => {
  const dx = Math.max(RADIUS - x, x - (1 - RADIUS), 0);
  const dy = Math.max(RADIUS - y, y - (1 - RADIUS), 0);
  return dx * dx + dy * dy <= RADIUS * RADIUS;
};
const inTriangle = (x, y, [ax, ay], [bx, by], [cx, cy]) => {
  const side = (px, py, qx, qy) => (x - qx) * (py - qy) - (px - qx) * (y - qy);
  const d1 = side(ax, ay, bx, by);
  const d2 = side(bx, by, cx, cy);
  const d3 = side(cx, cy, ax, ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};
const inArrow = (x, y) =>
  (Math.abs(x - 0.5) <= 0.05 && y >= 0.35 && y <= 0.65) // shaft
  || inTriangle(x, y, [0.5, 0.14], [0.3, 0.37], [0.7, 0.37]) // up head
  || inTriangle(x, y, [0.5, 0.86], [0.3, 0.63], [0.7, 0.63]); // down head

function render(size) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let inside = 0;
      let arrow = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = (px + (sx + 0.5) / SAMPLES) / size;
          const y = (py + (sy + 0.5) / SAMPLES) / size;
          if (!inRoundedSquare(x, y)) continue;
          inside++;
          if (inArrow(x, y)) arrow++;
        }
      }
      const offset = (py * size + px) * 4;
      const mix = inside ? arrow / inside : 0;
      for (let c = 0; c < 3; c++) pixels[offset + c] = Math.round(BG[c] + (FG[c] - BG[c]) * mix);
      pixels[offset + 3] = Math.round((inside / (SAMPLES * SAMPLES)) * 255);
    }
  }
  return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
// 8-bit RGBA, no interlace; every scanline uses filter 0.
function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

await mkdir(OUT, { recursive: true });
for (const size of SIZES) {
  await writeFile(`${OUT}/${size}.png`, encodePng(size, render(size)));
  console.log(`${OUT}/${size}.png`);
}
