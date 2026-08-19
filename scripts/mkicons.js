/* Minimal PNG writer + supersampled rasteriser for the app icons.
   Keeps the repo dependency-free: no image tooling required. */
const zlib = require('zlib'), fs = require('fs');

const CRC = (() => { const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return b => { let c = -1; for (let i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))
  ]);
}

const hex = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
const mix = (a, b, t) => [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];

/* Three climbing holds on a diagonal, the way a route reads on a wall. */
function scene(u, v, opts) {
  // u,v in 0..1 over the icon box
  const rounded = opts.rounded;
  const R = opts.radius;
  if (rounded) {
    const dx = Math.max(Math.abs(u - .5) - (.5 - R), 0), dy = Math.max(Math.abs(v - .5) - (.5 - R), 0);
    if (Math.hypot(dx, dy) > R) return null;                 // outside the squircle
  }
  // background: subtle top-lit slate
  let col = mix(hex('#151c25'), hex('#080b10'), v);
  // faint strata so it reads as rock
  const band = Math.sin(v * 26 + Math.sin(u * 7) * .6);
  col = mix(col, hex('#232c38'), Math.max(0, band) * .10);

  const holds = [
    { x: .30, y: .74, r: .105, c: '#4b7fc4', l: '#7ea9dd' },   // jug, low left
    { x: .63, y: .52, r: .082, c: '#c0563f', l: '#e08a72' },   // crimp, mid right
    { x: .37, y: .30, r: .095, c: '#4fa07a', l: '#83c8a8' }    // pinch, high left
  ];
  for (const h of holds) {
    const d = Math.hypot(u - h.x, v - h.y);
    if (d < h.r * 1.30) {                                       // contact shadow
      const s = 1 - d / (h.r * 1.30);
      col = mix(col, [0, 0, 0], s * .40);
    }
  }
  for (const h of holds) {
    const dx = u - h.x, dy = v - h.y, d = Math.hypot(dx, dy);
    if (d <= h.r) {
      // radial shade, lit from upper left
      const lit = 1 - Math.hypot(dx + h.r * .34, dy + h.r * .40) / (h.r * 1.7);
      let c = mix(hex(h.c), hex(h.l), Math.max(0, lit) * .95);
      c = mix(c, [0, 0, 0], Math.pow(d / h.r, 3) * .45);
      // bolt
      if (d < h.r * .20) c = mix(hex('#20262c'), hex('#cfd6de'), Math.max(0, 1 - d / (h.r * .20)) * .35);
      col = c;
    } else if (d < h.r + .006) {
      col = mix(col, hex('#0b0f14'), .8);                       // crisp edge
    }
  }
  // chalk tick at the top: you topped out
  const tx = Math.abs(u - .68), ty = Math.abs(v - .17);
  if (tx < .075 && ty < .012) col = mix(col, hex('#f4f1ea'), .85);
  return col;
}

function render(w, h, opts) {
  const SS = 3, out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const px = (x + (sx + .5) / SS) / w, py = (y + (sy + .5) / SS) / h;
      const asp = opts.wide ? w / h : 1;
      const u = (px - .5) * asp / (opts.zoom || 1) + .5;
      const v = (py - .5) / (opts.zoom || 1) + .5;
      let c = (u < 0 || u > 1 || v < 0 || v > 1) ? null : scene(u, v, opts);
      if (c) { r += c[0]; g += c[1]; b += c[2]; a += 255; }
      else if (opts.bleed) { const bg = mix(hex('#0a0d12'), hex('#060809'), py); r += bg[0]; g += bg[1]; b += bg[2]; a += 255; }
    }
    const n = SS * SS, i = (y * w + x) * 4;
    out[i] = Math.round(r / n); out[i+1] = Math.round(g / n); out[i+2] = Math.round(b / n); out[i+3] = Math.round(a / n);
  }
  return png(w, h, out);
}

fs.writeFileSync('icon-180.png', render(180, 180, { rounded: true, radius: .21 }));
fs.writeFileSync('icon-512.png', render(512, 512, { rounded: true, radius: .21 }));
fs.writeFileSync('og.png',       render(1200, 630, { rounded: false, bleed: true, wide: true, zoom: 1.55 }));
console.log('wrote icon-180.png icon-512.png og.png');
