'use strict';
// Generates "Poole Party.ico": a water-drop mark on a rounded, gradient tile, matching the
// app's brand (public/common.js's brandMark() SVG and the deep-water palette in style.css).
// Pure Node, no image deps: hand-rolled PNG encoder (zlib for the DEFLATE stream) wrapped
// in a minimal ICO container. Windows (Vista+) accepts a PNG-compressed 256x256 ICO entry.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'Poole Party.ico');
const SIZE = 256;
const SS = 2; // supersample factor for cheap anti-aliasing
const W = SIZE * SS;

// ---- tiny PNG encoder -------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

// ---- shape math --------------------------------------------------------------
// Colors lifted from public/style.css's :root palette.
const BG2 = [6, 64, 90], BG = [4, 42, 60], DEEP = [2, 26, 38];
const WAVE = [45, 212, 212]; // --wave (the droplet fill)
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];

function roundedSquareCoverage(x, y, w, h, r) {
  // signed-distance-ish coverage (0..1) for a rounded square, for soft edges
  const dx = Math.max(Math.abs(x - w / 2) - (w / 2 - r), 0);
  const dy = Math.max(Math.abs(y - h / 2) - (h / 2 - r), 0);
  const d = Math.sqrt(dx * dx + dy * dy) - r;
  return d <= 0 ? 1 : 0;
}
// Droplet: a circle (the bulb) unioned with a triangle (the pointed top), matching the
// proportions of the app's own droplet SVG (viewBox 64x64: circle cx=32 cy=44 r=19, apex 32,5).
function dropletCoverage(x, y, scale, ox, oy) {
  const px = (x - ox) / scale, py = (y - oy) / scale; // back into the 64x64 design space
  const cx = 32, cy = 44, r = 19;
  const dcx = px - cx, dcy = py - cy;
  if (dcx * dcx + dcy * dcy <= r * r) return true;
  // triangle apex(32,5) - (13,44) - (51,44)
  const ax = 32, ay = 5, bx = 13, by = 44, cxp = 51, cyp = 44;
  const sign = (x1, y1, x2, y2, x3, y3) => (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
  const d1 = sign(px, py, ax, ay, bx, by);
  const d2 = sign(px, py, bx, by, cxp, cyp);
  const d3 = sign(px, py, cxp, cyp, ax, ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

const rgba = Buffer.alloc(W * W * 4);
const radius = W * 0.22;
const dropScale = W / 64 * 0.72; // droplet is ~72% of the tile, centered
const dropOx = W * 0.5 - 32 * dropScale;
const dropOy = W * 0.5 - 44 * dropScale + W * 0.04;

for (let y = 0; y < W; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const inTile = roundedSquareCoverage(x, y, W, W, radius);
    if (!inTile) { rgba[i + 3] = 0; continue; }
    const t = (x + y) / (2 * W); // top-left to bottom-right gradient, like the app background
    let [r, g, b] = mix(BG2, t < 0.5 ? BG : DEEP, t < 0.5 ? t * 2 : (t - 0.5) * 2);
    if (dropletCoverage(x, y, dropScale, dropOx, dropOy)) {
      [r, g, b] = WAVE;
      // a soft highlight, upper-left of the bulb, like the SVG's curved white stroke
      const hlx = (x - (dropOx + 22 * dropScale)) / dropScale;
      const hly = (y - (dropOy + 34 * dropScale)) / dropScale;
      const hlDist = Math.sqrt(hlx * hlx + hly * hly);
      if (hlDist < 7) {
        const amt = (1 - hlDist / 7) * 0.55;
        [r, g, b] = mix([r, g, b], [255, 255, 255], amt);
      }
    }
    rgba[i] = Math.round(r); rgba[i + 1] = Math.round(g); rgba[i + 2] = Math.round(b); rgba[i + 3] = 255;
  }
}

// ---- downsample WxW -> SIZExSIZE (box filter) ---------------------------------
const out = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const si = ((y * SS + sy) * W + (x * SS + sx)) * 4;
        r += rgba[si]; g += rgba[si + 1]; b += rgba[si + 2]; a += rgba[si + 3];
      }
    }
    const n = SS * SS;
    const oi = (y * SIZE + x) * 4;
    out[oi] = Math.round(r / n); out[oi + 1] = Math.round(g / n); out[oi + 2] = Math.round(b / n); out[oi + 3] = Math.round(a / n);
  }
}

const png = encodePNG(SIZE, SIZE, out);

// ---- wrap as .ico (single 256x256 PNG-compressed entry) ----------------------
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
const entry = Buffer.alloc(16);
entry[0] = 0; entry[1] = 0; // 0 means 256px
entry[2] = 0; entry[3] = 0;
entry.writeUInt16LE(1, 4); // planes
entry.writeUInt16LE(32, 6); // bit count
entry.writeUInt32LE(png.length, 8);
entry.writeUInt32LE(header.length + entry.length, 12); // offset

fs.writeFileSync(OUT, Buffer.concat([header, entry, png]));
console.log(`Wrote ${OUT} (${png.length.toLocaleString()} bytes)`);
