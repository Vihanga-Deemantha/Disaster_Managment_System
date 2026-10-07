// Generates the PWA icons (frontend/public/icons/*.png) from the shield design in favicon.svg.
// Dependency-free: it rasterises the shapes with 3x3 supersampling and writes PNG files by hand.
// Run with `node scripts/generate-icons.mjs` after changing the design.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../frontend/public/icons/', import.meta.url));
const NAVY = [15, 29, 54];
const BROWN = [169, 109, 56];
const WHITE = [255, 255, 255];

/** Cubic Bezier sampled into points, for the curved lower half of the shield. */
const bezier = (p0, p1, p2, p3, steps = 24) =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const u = 1 - t;
    return [0, 1].map(
      (k) => u ** 3 * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t ** 3 * p3[k],
    );
  });

// Shield outline in the 64x64 design space of favicon.svg.
const SHIELD = [
  [32, 9],
  [12, 17],
  [12, 31],
  ...bezier([12, 31], [12, 43.4], [20.3, 51.3], [32, 55]),
  ...bezier([32, 55], [43.7, 51.3], [52, 43.4], [52, 31]),
  [52, 17],
];
const CHECK = [
  [25, 32],
  [30, 37],
  [40, 26],
];
const CHECK_HALF_WIDTH = 2.25;

function insidePolygon([x, y], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToSegment([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const onCheck = (point) =>
  CHECK.slice(1).some((end, i) => distanceToSegment(point, CHECK[i], end) <= CHECK_HALF_WIDTH);

/** Colour at a point of the 64x64 design space, drawn at `scale` around the centre. */
function colourAt(x, y, scale) {
  const point = [(x - 32) / scale + 32, (y - 32) / scale + 32];
  if (onCheck(point)) return WHITE;
  return insidePolygon(point, SHIELD) ? BROWN : NAVY;
}

function render(size, scale) {
  const samples = 3;
  const pixels = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const sum = [0, 0, 0];
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const colour = colourAt(
            ((px + (sx + 0.5) / samples) / size) * 64,
            ((py + (sy + 0.5) / samples) / size) * 64,
            scale,
          );
          sum[0] += colour[0];
          sum[1] += colour[1];
          sum[2] += colour[2];
        }
      }
      const offset = (py * size + px) * 4;
      for (let c = 0; c < 3; c += 1) pixels[offset + c] = Math.round(sum[c] / samples ** 2);
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buffer) => {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

function png(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    pixels.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
// "maskable" icons are cropped to a circle by some launchers, so the shield stays in the central safe zone.
for (const [name, size, scale] of [
  ['icon-192.png', 192, 1.05],
  ['icon-512.png', 512, 1.05],
  ['maskable-512.png', 512, 0.72],
]) {
  writeFileSync(`${OUT}${name}`, png(size, render(size, scale)));
  process.stdout.write(`wrote frontend/public/icons/${name}\n`);
}
