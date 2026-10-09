import { deflateSync } from 'node:zlib';
import type { ReportHazardType } from '../../modules/hazard-reports/domain/types';

/**
 * Stand-in photographs for the demo reports: small PNG pictures drawn here, so the seed needs no image
 * files and no download. They are obviously drawings (sky, ground and the hazard), different for each
 * hazard type and each report, and pass the same checks as a real upload.
 */
export const PHOTO_WIDTH = 320;
export const PHOTO_HEIGHT = 200;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let bit = 0; bit < 8; bit += 1)
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[n] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = (CRC_TABLE[(value ^ byte) & 0xff] as number) ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

/** A PNG file from raw 8-bit RGB rows (`width * height * 3` bytes). */
export function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const from = y * width * 3;
    rows.set(rgb.subarray(from, from + width * 3), y * (width * 3 + 1) + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8 bits, RGB, no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

type Rgb = readonly [number, number, number];

/** A small deterministic generator, so the same variant always draws the same picture. */
function random(seed: number): () => number {
  let state = (seed * 2654435761) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

class Canvas {
  readonly pixels = new Uint8Array(PHOTO_WIDTH * PHOTO_HEIGHT * 3);

  fill(painter: (x: number, y: number) => Rgb): void {
    for (let y = 0; y < PHOTO_HEIGHT; y += 1) {
      for (let x = 0; x < PHOTO_WIDTH; x += 1) this.set(x, y, painter(x, y));
    }
  }

  set(x: number, y: number, [r, g, b]: Rgb): void {
    if (x < 0 || y < 0 || x >= PHOTO_WIDTH || y >= PHOTO_HEIGHT) return;
    const at = (y * PHOTO_WIDTH + x) * 3;
    this.pixels[at] = r;
    this.pixels[at + 1] = g;
    this.pixels[at + 2] = b;
  }

  rect(x: number, y: number, width: number, height: number, colour: Rgb): void {
    for (let row = y; row < y + height; row += 1) {
      for (let column = x; column < x + width; column += 1) this.set(column, row, colour);
    }
  }

  disc(cx: number, cy: number, radius: number, colour: Rgb): void {
    for (let y = -radius; y <= radius; y += 1) {
      for (let x = -radius; x <= radius; x += 1) {
        if (x * x + y * y <= radius * radius) this.set(cx + x, cy + y, colour);
      }
    }
  }
}

const mix = (a: Rgb, b: Rgb, amount: number): Rgb => [
  Math.round(a[0] + (b[0] - a[0]) * amount),
  Math.round(a[1] + (b[1] - a[1]) * amount),
  Math.round(a[2] + (b[2] - a[2]) * amount),
];

const SKY_TOP: Rgb = [112, 150, 196];
const SKY_LOW: Rgb = [204, 220, 232];
const HORIZON = Math.round(PHOTO_HEIGHT * 0.42);

function sky(canvas: Canvas, rand: () => number): void {
  canvas.fill((_, y) => mix(SKY_TOP, SKY_LOW, Math.min(1, y / HORIZON)));
  for (let cloud = 0; cloud < 3; cloud += 1) {
    const cx = Math.round(rand() * PHOTO_WIDTH);
    const cy = Math.round(12 + rand() * 40);
    for (let part = 0; part < 4; part += 1)
      canvas.disc(cx + part * 14, cy, 10 + part, [240, 244, 248]);
  }
}

function houses(canvas: Canvas, rand: () => number, sunk: number): void {
  for (let n = 0; n < 4; n += 1) {
    const x = 18 + n * 74 + Math.round(rand() * 14);
    const height = 34 + Math.round(rand() * 14);
    const top = HORIZON + 6 - height + sunk;
    canvas.rect(x, top, 46, height, [176, 168, 156]);
    canvas.rect(x - 4, top - 10, 54, 11, [122, 62, 44]);
    canvas.rect(x + 18, top + height - 18, 10, 18, [86, 70, 58]);
  }
}

function flood(canvas: Canvas, rand: () => number): void {
  canvas.fill((x, y) => {
    if (y < HORIZON) return mix(SKY_TOP, SKY_LOW, y / HORIZON);
    const ripple = Math.sin(x / 9 + y / 3) * 0.06 + (y - HORIZON) / PHOTO_HEIGHT;
    return mix([122, 96, 62], [74, 92, 112], Math.min(1, 0.45 + ripple));
  });
  houses(canvas, rand, 14);
  canvas.rect(0, HORIZON + 14, PHOTO_WIDTH, PHOTO_HEIGHT - HORIZON - 14, [96, 104, 104]);
  canvas.fill((x, y) => {
    const at = (y * PHOTO_WIDTH + x) * 3;
    const base: Rgb = [
      canvas.pixels[at] as number,
      canvas.pixels[at + 1] as number,
      canvas.pixels[at + 2] as number,
    ];
    return y > HORIZON + 14
      ? mix(base, [96, 120, 140], 0.55 + Math.sin(x / 7 + y / 2) * 0.1)
      : base;
  });
}

function landslide(canvas: Canvas, rand: () => number): void {
  canvas.fill((x, y) => {
    if (y < HORIZON - 10) return mix(SKY_TOP, SKY_LOW, y / HORIZON);
    const slope = HORIZON - 10 + (x / PHOTO_WIDTH) * 70;
    if (y < slope) return mix([58, 98, 56], [38, 74, 44], rand() * 0.5);
    return mix([112, 82, 56], [84, 58, 40], (y - slope) / PHOTO_HEIGHT + rand() * 0.15);
  });
  for (let n = 0; n < 40; n += 1) {
    const x = Math.round(rand() * PHOTO_WIDTH);
    const y = Math.round(HORIZON + 20 + rand() * (PHOTO_HEIGHT - HORIZON - 24));
    canvas.disc(x, y, 2 + Math.round(rand() * 6), mix([108, 104, 98], [70, 66, 62], rand()));
  }
  for (let n = 0; n < 5; n += 1) {
    const y = Math.round(HORIZON + 30 + rand() * 90);
    canvas.rect(Math.round(rand() * 200), y, 70 + Math.round(rand() * 50), 4, [64, 44, 30]);
  }
}

function roadBlockage(canvas: Canvas, rand: () => number): void {
  canvas.fill((x, y) => {
    if (y < HORIZON) return mix(SKY_TOP, SKY_LOW, y / HORIZON);
    const middle = PHOTO_WIDTH / 2;
    const half = 30 + (y - HORIZON) * 1.15;
    return Math.abs(x - middle) < half
      ? mix([92, 94, 96], [60, 62, 64], (y - HORIZON) / 120)
      : [72, 112, 62];
  });
  for (let n = 0; n < 6; n += 1) {
    const x = 70 + n * 30;
    canvas.rect(x, HORIZON + 60, 26, 10, n % 2 === 0 ? [232, 112, 36] : [244, 244, 240]);
  }
  canvas.rect(40 + Math.round(rand() * 30), HORIZON + 96, 230, 14, [74, 52, 34]);
  for (let n = 0; n < 7; n += 1) {
    canvas.disc(48 + n * 34 + Math.round(rand() * 8), HORIZON + 94, 12, [52, 104, 52]);
  }
}

function other(canvas: Canvas, rand: () => number): void {
  canvas.fill((x, y) =>
    y < HORIZON
      ? mix(SKY_TOP, SKY_LOW, y / HORIZON)
      : mix([86, 130, 70], [66, 108, 54], rand() * 0.6),
  );
  canvas.rect(0, HORIZON + 40, PHOTO_WIDTH, 34, [132, 130, 124]);
  canvas.rect(90, HORIZON + 46, 140, 22, [58, 58, 60]);
  canvas.disc(120 + Math.round(rand() * 80), HORIZON + 96, 22, [78, 108, 132]);
}

const SCENES: Record<ReportHazardType, (canvas: Canvas, rand: () => number) => void> = {
  FLOOD: flood,
  LANDSLIDE: landslide,
  ROAD_BLOCKAGE: roadBlockage,
  OTHER: other,
};

/** A deterministic placeholder photograph for a hazard type. `variant` makes each report's picture its own. */
export function placeholderPhoto(hazardType: ReportHazardType, variant: number): Buffer {
  const rand = random(variant * 7919 + hazardType.length);
  const canvas = new Canvas();
  sky(canvas, rand);
  SCENES[hazardType](canvas, rand);
  return encodePng(PHOTO_WIDTH, PHOTO_HEIGHT, canvas.pixels);
}
