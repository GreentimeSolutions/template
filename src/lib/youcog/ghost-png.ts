/**
 * Server-safe Ghost Lab PNG: same 32x32 paint path as the canvas, encoded
 * with a built-in zlib PNG writer (no native canvas dependency).
 */
import { deflateSync } from "node:zlib";
import { CONTRACT_SLOT_COUNTS, traitsToOutfit } from "./ghost-lab-core";
import { LAB_GHOST_BG, LAB_SAVE_PX, paintBackground, paintGhost, type Outfit } from "./ghost-wardrobe";

export { LAB_GHOST_BG, LAB_SAVE_PX };

const PNG_SIG = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}

function crc32(parts: Uint8Array[]): number {
  let c = 0xffffffff;
  for (const p of parts) {
    for (let i = 0; i < p.length; i++) c = CRC_TABLE[(c ^ p[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u32(n: number): Uint8Array {
  return Uint8Array.of((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typ = new TextEncoder().encode(type);
  const crc = u32(crc32([typ, data]));
  const out = new Uint8Array(12 + data.length);
  out.set(u32(data.length), 0);
  out.set(typ, 4);
  out.set(data, 8);
  out.set(crc, 8 + data.length);
  return out;
}

function parseHex(col: string): [number, number, number] {
  const h = col.startsWith("#") ? col.slice(1) : col;
  if (h.length !== 6) return [0, 0, 0];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** RGBA buffer of a 32x32 ghost scaled by px (t = 0 is the save frame). */
export function renderGhostRgba(
  outfit: Outfit,
  opts: { px?: number; t?: number; background?: string } = {},
): { width: number; height: number; rgba: Uint8Array } {
  const px = opts.px ?? LAB_SAVE_PX;
  const t = opts.t ?? 0;
  const bg = opts.background ?? LAB_GHOST_BG;
  const width = 32 * px;
  const height = 32 * px;
  const rgba = new Uint8Array(width * height * 4);
  const [br, bgc, bb] = parseHex(bg);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = br;
    rgba[i + 1] = bgc;
    rgba[i + 2] = bb;
    rgba[i + 3] = 255;
  }
  const stamp = (x: number, y: number, w: number, h: number, col: string, bob: number) => {
    const [r, g, b] = parseHex(col);
    const x0 = x * px;
    const y0 = (y + bob) * px;
    for (let yy = 0; yy < h * px; yy++) {
      const row = y0 + yy;
      if (row < 0 || row >= height) continue;
      for (let xx = 0; xx < w * px; xx++) {
        const colx = x0 + xx;
        if (colx < 0 || colx >= width) continue;
        const i = (row * width + colx) * 4;
        rgba[i] = r;
        rgba[i + 1] = g;
        rgba[i + 2] = b;
        rgba[i + 3] = 255;
      }
    }
  };
  paintBackground((x, y, w, h, col) => stamp(x, y, w, h, col, 0), outfit, t);
  const bob = Math.round(Math.sin(t / 400));
  paintGhost((x, y, w, h, col) => stamp(x, y, w, h, col, bob), outfit, t);
  return { width, height, rgba };
}

/** Uncompressed-filter PNG (filter 0 per row) of 8-bit RGBA. */
export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  if (rgba.length !== width * height * 4) throw new Error("RGBA size mismatch");
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const o = y * (width * 4 + 1);
    raw[o] = 0;
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), o + 1);
  }
  const ihdr = new Uint8Array(13);
  ihdr.set(u32(width), 0);
  ihdr.set(u32(height), 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = deflateSync(raw, { level: 9 });
  const parts = [PNG_SIG, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array())];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function renderGhostPng(
  outfit: Outfit,
  opts: { px?: number; t?: number; background?: string } = {},
): Uint8Array {
  const { width, height, rgba } = renderGhostRgba(outfit, opts);
  return encodePng(width, height, rgba);
}

export function renderTraitsPng(
  traits: readonly number[],
  opts: { px?: number; t?: number; background?: string } = {},
): Uint8Array {
  return renderGhostPng(traitsToOutfit(traits), opts);
}

/** Allow 1–16 so a portrait can be served at an integer pixel scale. */
export function parseGhostPx(raw: string | null | undefined, fallback = LAB_SAVE_PX): number {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 16) return fallback;
  return n;
}

export function isValidTraits(traits: readonly number[]): boolean {
  return traits.length === CONTRACT_SLOT_COUNTS.length && traits.every((v, i) => Number.isInteger(v) && v >= 0 && v <= CONTRACT_SLOT_COUNTS[i]);
}
