// Brand pipeline: reads every file in brand/ and reference/, reports container facts,
// samples the palette (k-means -> snapped to a real pixel), writes src/styles/tokens.css,
// and builds the favicon / icon / og / hero assets from real logo pixels.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (...p) => path.join(ROOT, ...p);

const SRC = {
  logoAlpha: 'brand/LOGO ANALYZA PNG...png',
  logoOpaque: 'brand/LOGO ANALYZA PNG.png',
  slide: 'reference/ANALYZA 1.jpg.jpeg',
  cover: 'reference/SAMPUL ANALYZA JPG.jpg.jpeg',
};

const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

async function load(file) {
  const { data, info } = await sharp(rel(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}
const px = (img, x, y) => {
  const i = (y * img.w + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
};

// ---------- 1. container report ----------
function report() {
  const rows = [];
  for (const dir of ['brand', 'reference']) {
    for (const f of fs.readdirSync(rel(dir))) {
      const b = fs.readFileSync(rel(dir, f));
      const isPng = b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
      rows.push({
        file: `${dir}/${f}`,
        kind: isPng ? 'png' : 'jpeg',
        ihdr: isPng ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20), depth: b[24], colortype: b[25] } : null,
      });
    }
  }
  return rows;
}

async function alphaHistogram(img) {
  const h = { zero: 0, low: 0, mid: 0, high: 0, full: 0, zeroBlack: 0 };
  for (let i = 0; i < img.data.length; i += 4) {
    const a = img.data[i + 3];
    if (a === 0) {
      h.zero++;
      if (!img.data[i] && !img.data[i + 1] && !img.data[i + 2]) h.zeroBlack++;
    } else if (a < 64) h.low++;
    else if (a < 192) h.mid++;
    else if (a < 255) h.high++;
    else h.full++;
  }
  return h;
}

// ---------- 2. k-means (deterministic farthest-point init) ----------
function kmeans(pts, k, iters = 25) {
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const cs = [pts[0].slice()];
  while (cs.length < k) {
    let best = 0, bd = -1;
    for (let i = 0; i < pts.length; i += 7) {
      let d = Infinity;
      for (const c of cs) d = Math.min(d, d2(pts[i], c));
      if (d > bd) { bd = d; best = i; }
    }
    cs.push(pts[best].slice());
  }
  let cnt = new Array(k).fill(0);
  for (let it = 0; it < iters; it++) {
    const s = cs.map(() => [0, 0, 0]);
    cnt = new Array(k).fill(0);
    for (const p of pts) {
      let b = 0, bd = Infinity;
      for (let j = 0; j < k; j++) { const d = d2(p, cs[j]); if (d < bd) { bd = d; b = j; } }
      s[b][0] += p[0]; s[b][1] += p[1]; s[b][2] += p[2]; cnt[b]++;
    }
    for (let j = 0; j < k; j++) if (cnt[j]) cs[j] = s[j].map((v) => v / cnt[j]);
  }
  return cs.map((c, j) => ({ c, n: cnt[j] }));
}

function snap(img, c) {
  let bd = Infinity, bx = 0, by = 0;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const i = (y * img.w + x) * 4;
      if (img.data[i + 3] < 255) continue;
      const d = (img.data[i] - c[0]) ** 2 + (img.data[i + 1] - c[1]) ** 2 + (img.data[i + 2] - c[2]) ** 2;
      if (d < bd) { bd = d; bx = x; by = y; }
    }
  }
  return { x: bx, y: by, rgb: px(img, bx, by).slice(0, 3) };
}

function opaquePoints(img, stride) {
  const pts = [];
  for (let i = 0; i < img.data.length; i += 4 * stride) {
    if (img.data[i + 3] === 255) pts.push([img.data[i], img.data[i + 1], img.data[i + 2]]);
  }
  return pts;
}

async function samplePalette() {
  const tokens = [];
  const add = (name, file, img, c, n, k) => {
    const s = snap(img, c);
    tokens.push({ name, file, x: s.x, y: s.y, hex: hex(s.rgb), n, k });
  };

  const logo = await load(SRC.logoAlpha);
  const logoK = kmeans(opaquePoints(logo, 1), 3).sort((a, b) => b.n - a.n);
  add('c-logo', SRC.logoAlpha, logo, logoK[0].c, logoK[0].n, 3);
  add('c-trace', SRC.logoAlpha, logo, logoK[1].c, logoK[1].n, 3);

  const opaque = await load(SRC.logoOpaque);
  tokens.push({ name: 'c-bg', file: SRC.logoOpaque, x: 0, y: 0, hex: hex(px(opaque, 0, 0).slice(0, 3)), n: opaque.w * opaque.h, k: 0 });

  const slide = await load(SRC.slide);
  const sk = kmeans(opaquePoints(slide, 3), 10)
    .filter((o) => lum(o.c) > 6) // drop the pure-black canvas cluster
    .sort((a, b) => lum(a.c) - lum(b.c));
  const names = ['c-void', 'c-line', 'c-deep', 'c-teal', 'c-blue', 'c-aqua', 'c-cyan', 'c-glow', 'c-ice'];
  names.forEach((nm, i) => add(nm, SRC.slide, slide, sk[i].c, sk[i].n, 10));
  return tokens;
}

// ---------- 3. tokens.css ----------
function writeTokens(tokens) {
  const prov = tokens
    .map((t) => `  ${t.name.padEnd(8)} ${t.hex}  ${t.file} @ (${t.x},${t.y})  k=${t.k} n=${t.n}`)
    .join('\n');
  const decl = tokens.map((t) => `  --${t.name}: ${t.hex};`).join('\n');
  const css = `/*
 * GENERATED by scripts/brand.mjs - edit the script, not this file.
 * This is the only file in src/ that may hold a colour literal.
 *
 * PALETTE PROVENANCE
 * Each colour is a k-means cluster centre snapped to the nearest real, fully
 * opaque pixel of the named source file. "@ (x,y)" is that pixel; the gates
 * re-read it and compare. c-bg is read directly from pixel (0,0).
 *
${prov}
 */
:root {
${decl}

  /* roles */
  --bg: var(--c-bg);
  --panel: var(--c-void);
  --edge: var(--c-line);
  --edge-hot: var(--c-deep);
  --ink: var(--c-ice);
  --ink-soft: var(--c-logo);
  --ink-dim: var(--c-teal);
  --accent: var(--c-cyan);
  --accent-hot: var(--c-glow);
  --accent-cool: var(--c-blue);
  --trace: var(--c-trace);

  /* alpha steps (mixes of sampled colours only) */
  --glow-1: color-mix(in srgb, var(--c-cyan) 14%, transparent);
  --glow-2: color-mix(in srgb, var(--c-cyan) 5%, transparent);
  --glow-3: color-mix(in srgb, var(--c-glow) 45%, transparent);
  --wash: color-mix(in srgb, var(--c-cyan) 8%, transparent);
  --wash-hot: color-mix(in srgb, var(--c-cyan) 16%, transparent);
  --veil: color-mix(in srgb, var(--c-bg) 86%, transparent);
  --grid-dot: color-mix(in srgb, var(--c-deep) 40%, transparent);

  /* type */
  --font-pixel: 'Tiny5', 'Courier New', monospace;
  --font-display: 'Barlow Semi Condensed', 'Arial Narrow', sans-serif;
  --font-body: 'Barlow', system-ui, sans-serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, Consolas, monospace;

  /* geometry */
  --tap: 48px;
  --gutter: 16px;
  --wrap: 1180px;
  --radius: 2px;

  /* motion */
  --ease-out: cubic-bezier(0.2, 0.7, 0.2, 1);
  --ease-io: cubic-bezier(0.65, 0, 0.35, 1);
  --t-fast: 140ms;
  --t-mid: 280ms;
  --t-slow: 720ms;

  /* layers */
  --z-bar: 100;
  --z-ca: 90;
  --z-toast: 110;
}

@media (min-width: 720px) {
  :root { --gutter: 24px; }
}
`;
  fs.writeFileSync(rel('src/styles/tokens.css'), css);
  fs.writeFileSync(rel('scripts/palette.json'), JSON.stringify(Object.fromEntries(tokens.map((t) => [t.name, t.hex])), null, 2));
}

// ---------- 4. assets from real logo pixels ----------
function premultiply(img) {
  const out = Buffer.alloc(img.data.length);
  for (let i = 0; i < img.data.length; i += 4) {
    const a = img.data[i + 3] / 255;
    out[i] = Math.round(img.data[i] * a);
    out[i + 1] = Math.round(img.data[i + 1] * a);
    out[i + 2] = Math.round(img.data[i + 2] * a);
    out[i + 3] = img.data[i + 3];
  }
  return out;
}

function bbox(img) {
  let x0 = img.w, y0 = img.h, x1 = 0, y1 = 0;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (img.data[(y * img.w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// Square crop of the logo (centred on its bbox) with padding, as premultiplied RGBA.
function squareCrop(img, pre, padPct) {
  const b = bbox(img);
  const side = Math.round(Math.max(b.w, b.h) * (1 + padPct * 2));
  const cx = Math.round(b.x0 + b.w / 2), cy = Math.round(b.y0 + b.h / 2);
  const left = cx - Math.floor(side / 2), top = cy - Math.floor(side / 2);
  const out = Buffer.alloc(side * side * 4); // zeros = transparent
  for (let y = 0; y < side; y++) {
    const sy = top + y;
    if (sy < 0 || sy >= img.h) continue;
    for (let x = 0; x < side; x++) {
      const sx = left + x;
      if (sx < 0 || sx >= img.w) continue;
      pre.copy(out, (y * side + x) * 4, (sy * img.w + sx) * 4, (sy * img.w + sx) * 4 + 4);
    }
  }
  return { buf: out, side };
}

const premulSharp = (crop) =>
  sharp(crop.buf, { raw: { width: crop.side, height: crop.side, channels: 4, premultiplied: true } });

function ico(pngs) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const dirs = [];
  for (const { size, buf } of pngs) {
    const d = Buffer.alloc(16);
    d[0] = size; d[1] = size; d.writeUInt16LE(1, 4); d.writeUInt16LE(32, 6);
    d.writeUInt32LE(buf.length, 8); d.writeUInt32LE(offset, 12);
    offset += buf.length; dirs.push(d);
  }
  return Buffer.concat([head, ...dirs, ...pngs.map((p) => p.buf)]);
}

async function buildAssets(tokens) {
  const pub = rel('public');
  fs.mkdirSync(pub, { recursive: true });
  const bg = tokens.find((t) => t.name === 'c-bg').hex;

  const logo = await load(SRC.logoAlpha);
  const pre = premultiply(logo);

  // Tight crop for 16/32/48 and the header mark.
  const tight = squareCrop(logo, pre, 0.04);
  const sizes = [16, 32, 48];
  const pngs = [];
  for (const s of sizes) {
    const buf = await premulSharp(tight).resize(s, s, { kernel: 'lanczos3' }).png().toBuffer();
    pngs.push({ size: s, buf });
    if (s === 32) fs.writeFileSync(path.join(pub, 'favicon-32.png'), buf);
    if (s === 16) fs.writeFileSync(path.join(pub, 'favicon-16.png'), buf);
  }
  fs.writeFileSync(path.join(pub, 'favicon.ico'), ico(pngs));
  await premulSharp(tight).resize(160, 160, { kernel: 'lanczos3' }).png().toFile(path.join(pub, 'logo-mark.png'));

  // Tiles on the brand ground for touch icons.
  const roomy = squareCrop(logo, pre, 0.22);
  for (const [name, s] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
    const mark = await premulSharp(roomy).resize(s, s, { kernel: 'lanczos3' }).png().toBuffer();
    await sharp({ create: { width: s, height: s, channels: 4, background: bg } })
      .composite([{ input: mark }]).png().toFile(path.join(pub, name));
  }

  // Hero art: right-hand illustration from the first reference slide (text lives at x < 730).
  await sharp(rel(SRC.slide)).extract({ left: 730, top: 180, width: 870, height: 720 })
    .webp({ quality: 88 }).toFile(path.join(pub, 'hero-art.webp'));

  // Social card: cover banner centred on a field of its own corner colour.
  const cover = await load(SRC.cover);
  const cornerRgb = px(cover, 0, 0).slice(0, 3);
  const banner = await sharp(rel(SRC.cover)).resize(1200, 400).png().toBuffer();
  await sharp({ create: { width: 1200, height: 630, channels: 3, background: { r: cornerRgb[0], g: cornerRgb[1], b: cornerRgb[2] } } })
    .composite([{ input: banner, top: 115, left: 0 }]).png({ compressionLevel: 9 }).toFile(path.join(pub, 'og.png'));

  fs.writeFileSync(path.join(pub, 'site.webmanifest'), JSON.stringify({
    name: 'Analyza', short_name: 'Analyza', start_url: '/', display: 'standalone',
    background_color: bg, theme_color: bg,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  }, null, 2));
}

// ---------- run ----------
const files = report();
const alphaImg = await load(SRC.logoAlpha);
const hist = await alphaHistogram(alphaImg);
const logoFile = files.find((f) => f.file === SRC.logoAlpha);
const needsPremul = logoFile.ihdr?.colortype === 6 && hist.zeroBlack > 0;

const tokens = await samplePalette();
writeTokens(tokens);
await buildAssets(tokens);

const out = { files, logoAlphaHistogram: hist, premultipliedResize: needsPremul, tokens };
fs.mkdirSync(rel('scripts/out'), { recursive: true });
fs.writeFileSync(rel('scripts/out/brand-report.json'), JSON.stringify(out, null, 2));
console.log(`brand: ${files.length} files read, ${tokens.length} palette tokens, premultiplied resize ${needsPremul ? 'ON' : 'off'}`);
for (const t of tokens) console.log(' ', t.name.padEnd(8), t.hex, `${t.file} @(${t.x},${t.y})`);

