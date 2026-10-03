// Gates: 30 checks, synthetic fixtures only, fast clock (the gates builds scale every timer by 0.08).
// Needs `npm run build` first (dist/). Builds a fixture variant into .gates/dist itself.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import sharp from 'sharp';
import puppeteer from 'puppeteer-core';
import { build } from 'vite';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (...p) => path.join(ROOT, ...p);
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
const WIDTHS = [360, 390, 430, 1366, 1440];
const T0 = Date.now();
for (const ev of ['uncaughtException', 'unhandledRejection']) process.on(ev, (e) => { console.log('FATAL', e?.stack || e); process.exit(1); });

const results = [];
async function gate(name, fn) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY).test(name)) return;
  const t = Date.now();
  try {
    const note = await fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}${note ? '  ' + note : ''}  (${Date.now() - t}ms)`);
  } catch (e) {
    results.push({ name, ok: false });
    console.log(`FAIL  ${name}\n      ${String(e.message || e).split('\n').join('\n      ')}`);
  }
}
const ok = (c, m) => { if (!c) throw new Error(m); };
const sleep = (n) => new Promise((r) => setTimeout(r, n));

// ---------- fs helpers ----------
function walk(dir, skip = []) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (skip.includes(e.name)) continue;
    if (e.isDirectory()) out.push(...walk(p, skip));
    else out.push(p);
  }
  return out;
}
const TEXT = /\.(js|mjs|css|html|json|md|txt|webmanifest|svg)$/i;
const SKIP = ['node_modules', 'dist', '.gates', 'out', 'package-lock.json'];
const projectText = () => walk(ROOT, SKIP).filter((f) => TEXT.test(f)).map((f) => [f, fs.readFileSync(f, 'utf8')]);
const srcFiles = () => walk(R('src')).map((f) => [f, fs.readFileSync(f, 'utf8')]);

// ---------- static server + network stubs ----------
function serve(dir) {
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const f = path.join(dir, p);
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, origin: `http://127.0.0.1:${srv.address().port}` })));
}

// Synthetic network: window.fetch is replaced in the page, so there are no per-request interception round trips.
// ctl lives on window.__ctl; hold keeps every response pending until release().
const STUB = `(() => {
  const ctl = (window.__ctl = { block: 4000000, dexCalls: 0, rpcFail: false, blocked: [], hold: null, release: null });
  window.__copied = null;
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__copied = t; } }, configurable: true });
  const series = Array.from({ length: 120 }, (_, i) => ({ date: 1700000000 + i * 86400, tvl: 5e8 + i * 4e6 + (i % 7) * 1e6 })).concat([{ date: 1700000000 + 120 * 86400, tvl: 1e9 }]);
  const mk = (n, vol, liq, sym) => ({
    chainId: 'robinhood', pairAddress: '0x' + n.toString(16).padStart(64, 'a'), url: 'https://dexscreener.com/robinhood/fixture-' + n,
    baseToken: { symbol: sym, name: 'Fixture ' + sym }, quoteToken: { symbol: 'ETH' }, priceUsd: String(0.001 * n),
    txns: { h24: { buys: 10 * n, sells: 5 * n } }, volume: { h24: vol + (ctl.dexCalls % 2) * 1000 }, liquidity: { usd: liq },
    info: { imageUrl: 'https://fixture.invalid/' + n + '.png' },
  });
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const real = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith(location.origin)) return real(input, init);
    if (ctl.hold) await ctl.hold;
    if (url.startsWith('https://rpc.mainnet.chain.robinhood.com')) {
      if (ctl.rpcFail) return reply({ error: 'down' }, 500);
      const body = JSON.parse(init.body);
      ctl.block += 7;
      return reply(body.map((c) => ({ jsonrpc: '2.0', id: c.id, result: c.method === 'eth_blockNumber' ? '0x' + ctl.block.toString(16) : '0x1ecfb20' })));
    }
    if (url.startsWith('https://api.llama.fi/v2/historicalChainTvl/')) return reply(series);
    if (url.startsWith('https://api.dexscreener.com/latest/dex/search')) {
      ctl.dexCalls += 1;
      return reply({ pairs: [mk(1, 2000000, 900000, 'AAA'), mk(2, 1000000, 400000, 'BBB'), mk(3, 500000, 100000, 'CCC'), Object.assign(mk(9, 9e9, 9e9, 'OFF'), { chainId: 'other' })] });
    }
    ctl.blocked.push(url);
    throw new TypeError('blocked by gates: ' + url);
  };
})();`;

const allErrors = [];
const allBlocked = [];

async function open(browser, origin, { width = 1440, height = 900, reduce = false, hold = false, scroll = true } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  if (reduce) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.evaluateOnNewDocument(STUB);
  if (hold) await page.evaluateOnNewDocument('window.__ctl.hold = new Promise((r) => (window.__ctl.release = r));');
  page.on('console', (m) => m.type() === 'error' && allErrors.push(`console: ${m.text()}`));
  page.on('pageerror', (e) => allErrors.push(`pageerror: ${e.message}`));
  await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#pill');
  if (!hold && scroll) await settle(page);
  const ctl = {
    release: () => page.evaluate(() => window.__ctl.release()),
    fail: (v) => page.evaluate((x) => (window.__ctl.rpcFail = x), v),
    blocked: async () => { allBlocked.push(...(await page.evaluate(() => window.__ctl.blocked))); },
  };
  return { page, ctl };
}async function settle(page) {
  await page.waitForFunction(() => document.getElementById('pill').dataset.state === 'live', { timeout: 25000 });
  await page.waitForFunction(() => document.querySelector('#pairs a.pair'), { timeout: 25000 });
  await page.waitForFunction(() => document.querySelector('#tvl-chart svg'), { timeout: 25000 });
}
async function scrollThrough(page) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y <= h; y += 700) { await page.evaluate((v) => window.scrollTo(0, v), y); await sleep(40); }
  await sleep(250);
}
const matrixY = (t) => (t && t !== 'none' ? Number(t.match(/matrix\(([^)]+)\)/)[1].split(',')[5]) : 0);

// ---------- run ----------
console.log(`gates: browser ${EDGE ? path.basename(EDGE) : 'NOT FOUND'}`);
ok(EDGE, 'no Edge/Chrome binary found');
ok(fs.existsSync(R('dist/index.html')), 'dist/ missing: run npm run build first');

await build({ root: ROOT, mode: 'fixture', logLevel: 'error', build: { outDir: '.gates/dist', emptyOutDir: true } });
await build({ root: ROOT, mode: 'fast', logLevel: 'error', build: { outDir: '.gates/fast', emptyOutDir: true } });

// ===== static gates =====
await gate('01 dist integrity: every referenced asset exists', () => {
  const html = fs.readFileSync(R('dist/index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="(\/[^"#?]+)"/g)].map((m) => m[1]).filter((p) => !p.startsWith('//'));
  const missing = refs.filter((p) => !fs.existsSync(R('dist', p)));
  ok(refs.length >= 8, `only ${refs.length} refs`);
  ok(!missing.length, `missing: ${missing.join(', ')}`);
  return `${refs.length} refs`;
});

await gate('02 repo hygiene: no CLAUDE.md, no .claude/, no AI attribution', () => {
  const bad = [];
  if (walk(ROOT, ['node_modules', '.gates', 'dist']).some((f) => /(^|[\\/])CLAUDE\.md$/i.test(f))) bad.push('CLAUDE.md present');
  if (fs.existsSync(R('.claude'))) bad.push('.claude/ present');
  const needles = [['co', 'authored', 'by'].join('-'), ['generated', 'with'].join(' '), ['clau', 'de'].join(''), ['anthro', 'pic'].join('')];
  for (const [f, t] of projectText().filter(([f]) => !f.endsWith('gates.mjs'))) for (const n of needles) if (t.toLowerCase().includes(n)) bad.push(`${path.relative(ROOT, f)} mentions "${n}"`);
  ok(!bad.length, bad.join('; '));
});

await gate('03 palette rule: colour literals live only in tokens.css', () => {
  const lit = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3,4}\b(?![-\w])|\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklch|oklab)\(/;
  const files = [...srcFiles().filter(([f]) => !f.endsWith('tokens.css')), [R('index.html'), fs.readFileSync(R('index.html'), 'utf8')]];
  const hits = [];
  for (const [f, t] of files) for (const [i, line] of t.split('\n').entries()) if (lit.test(line)) hits.push(`${path.relative(ROOT, f)}:${i + 1}`);
  ok(!hits.length, `literals outside tokens: ${hits.join(', ')}`);
  ok(/#[0-9a-f]{6}/.test(fs.readFileSync(R('src/styles/tokens.css'), 'utf8')), 'tokens.css has no palette');
});

await gate('04 palette provenance: every token matches its real source pixel', async () => {
  const css = fs.readFileSync(R('src/styles/tokens.css'), 'utf8');
  const rows = [...css.matchAll(/^\s+(c-\w+)\s+(#[0-9a-f]{6})\s+(.+?) @ \((\d+),(\d+)\)/gm)];
  ok(rows.length >= 10, `${rows.length} provenance rows`);
  for (const [, name, hex, file, x, y] of rows) {
    const { data, info } = await sharp(R(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const i = (Number(y) * info.width + Number(x)) * 4;
    const got = '#' + [data[i], data[i + 1], data[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
    ok(got === hex, `${name}: file pixel ${got} != token ${hex}`);
    ok(new RegExp(`--${name}: ${hex};`).test(css), `${name} declaration missing`);
  }
  return `${rows.length} tokens`;
});

await gate('05 brand pixels: RGBA logo handled premultiplied, favicon set intact, no dark halo', async () => {
  const rep = JSON.parse(fs.readFileSync(R('scripts/out/brand-report.json'), 'utf8'));
  const logo = rep.files.find((f) => f.file.endsWith('PNG...png'));
  ok(logo.ihdr.colortype === 6, `colortype ${logo.ihdr.colortype}`);
  ok(rep.logoAlphaHistogram.zeroBlack > 1e6 && rep.premultipliedResize === true, 'pure-black transparent region not flagged');
  const ico = fs.readFileSync(R('public/favicon.ico'));
  ok(ico.readUInt16LE(2) === 1 && ico.readUInt16LE(4) === 3, 'ico must hold 3 images');
  for (const [f, s] of [['favicon-16.png', 16], ['favicon-32.png', 32], ['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512], ['og.png', 1200]]) {
    const m = await sharp(R('public', f)).metadata();
    ok(m.width === s, `${f} width ${m.width}`);
  }
  const { data } = await sharp(R('public/favicon-32.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let edge = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 0 && data[i + 3] < 255) { edge++; ok(data[i + 2] >= 0x60, `dark fringe pixel rgb(${data[i]},${data[i + 1]},${data[i + 2]}) a=${data[i + 3]}`); }
  ok(edge > 10, 'no antialiased edge pixels sampled');
  return `${edge} edge px clean`;
});

await gate('06 no ch units anywhere (css, html, inline js styles, built css)', () => {
  const ch = /(?<![\w-])-?\d*\.?\d+ch\b/;
  const files = [...srcFiles(), [R('index.html'), fs.readFileSync(R('index.html'), 'utf8')], ...walk(R('dist', 'assets')).filter((f) => f.endsWith('.css')).map((f) => [f, fs.readFileSync(f, 'utf8')])];
  const hits = files.filter(([, t]) => ch.test(t)).map(([f]) => path.relative(ROOT, f));
  ok(!hits.length, `ch unit in ${hits.join(', ')}`);
});

const regSrc = fs.readFileSync(R('src/data/registry.js'), 'utf8');
// The ca record may legitimately be absent or stated (e.g. a dry-run address); every gate handles both branches.
const caLine = regSrc.split('\n').find((l) => /^\s+ca: /.test(l)) || '';
const CA = { stated: /state: 'stated'/.test(caLine), value: (caLine.match(/value: '(0x[0-9a-fA-F]{40})'/) || [])[1] || null };
const stripCa = (s) => (CA.value ? s.split(CA.value).join('') : s);
await gate('07 register pattern: every external fact is one record with a legal state', async () => {
  const lib = await import(pathToFileURL(R('src/lib/register.js')).href);
  const fix = fs.readFileSync(R('src/data/registry.fixture.js'), 'utf8');
  const recs = [...regSrc.matchAll(/record\('(\w+)', '([^']+)', '(\w+)'(?:, (\{[^}]*\}))?\)/g)].map((m) => ({ id: m[1], state: m[3], extra: m[4] || '' }));
  // plain-object records: { id, label, state, value: null } (value null = carries no data)
  for (const m of regSrc.matchAll(/^\s+\w+: \{ id: '(\w+)', label: '[^']+', state: '(\w+)', value: (null|[^}]+) \},/gm)) {
    recs.push({ id: m[1], state: m[2], extra: m[3].trim() === 'null' ? '' : `value: ${m[3]}` });
  }
  ok(recs.length >= 10, `${recs.length} records`);
  const ids = new Set();
  for (const r of recs) {
    ok(lib.validState(r), `${r.id}: illegal state ${r.state}`);
    ok(!ids.has(r.id), `duplicate ${r.id}`); ids.add(r.id);
    if (r.state !== 'stated') ok(!r.extra, `${r.id} is ${r.state} but carries data`);
    else ok(/value|url/.test(r.extra), `${r.id} stated without value/url`);
  }
  for (const id of ['x', 'github', 'launch']) ok(recs.find((r) => r.id === id)?.state === 'absent', `${id} must be absent`);
  const caRec = recs.find((r) => r.id === 'ca');
  if (CA.stated) ok(caRec?.state === 'stated' && lib.isAddress(CA.value), 'ca stated needs a well-formed 0x address value');
  else ok(caRec?.state === 'absent' && !caRec.extra, 'ca absent must carry no value');
  for (const id of ['ca', 'x', 'github']) ok(new RegExp(`${id}: \\{[^}]*state: 'stated'`).test(fix), `fixture lacks stated ${id}`);
  return `${recs.length} records`;
});

await gate('08 link rule: store url, derive handle, no href unless stated', async () => {
  const { hrefOf, handleOf } = await import(pathToFileURL(R('src/lib/register.js')).href);
  const x = { state: 'stated', url: 'https://x.com/synthetic_a' };
  ok(hrefOf(x) === 'https://x.com/synthetic_a', 'stated href');
  ok(handleOf(x, { at: true }) === '@synthetic_a', 'derived @handle');
  ok(handleOf({ state: 'stated', url: 'https://github.com/org/repo' }) === 'org/repo', 'derived repo path');
  for (const s of ['absent', 'unconfirmed']) ok(hrefOf({ state: s, url: 'https://x.com/leak' }) === null && handleOf({ state: s, url: 'https://x.com/leak' }) === null, `${s} leaked an href`);
  ok(hrefOf({ state: 'stated', url: 'javascript:alert(1)' }) === null && hrefOf({ state: 'stated', url: 'http://x.com/a' }) === null, 'non-https href accepted');
  ok(!/handle:\s*['"]/.test(regSrc), 'handles must not be stored');
});

await gate('09 gate warning: 0x validator accepts real hex forms, rejects only malformed addresses', async () => {
  const { isAddress, hexToInt, caOf } = await import(pathToFileURL(R('src/lib/register.js')).href);
  const hex40 = 'a1b2c3d4e5'.repeat(4);
  ok(isAddress(`0x${hex40}`) && isAddress(`0x${hex40.toUpperCase()}`) && isAddress('0xA1b2C3d4E5F60718293a4B5c6D7e8F9012345678'), 'valid addresses rejected');
  ok(!isAddress(`0x${hex40.slice(1)}`) && !isAddress(`0x${hex40}0`) && !isAddress(hex40) && !isAddress(`0x${'g'.repeat(40)}`) && !isAddress(null), 'malformed accepted');
  ok(hexToInt('0x1237') === 4663 && hexToInt('0x4acfc8e') === Number('0x4acfc8e'), '0x quantities must still parse');
  ok(caOf({ state: 'absent', value: `0x${hex40}` }) === null, 'absent record produced an address');
  const addrScan = /0x[0-9a-fA-F]{40}\b/;
  ok(!addrScan.test('0x1237') && addrScan.test(`0x${hex40}`), 'scan regex must key on length, not on the 0x prefix');
  ok(srcFiles().some(([f, t]) => !f.includes('fixture') && /0x/.test(t)), 'sources should legitimately use 0x');
  const hard = srcFiles().filter(([f, t]) => !f.includes('fixture') && addrScan.test(stripCa(t))).map(([f]) => path.relative(ROOT, f));
  ok(!hard.length, `hard-coded address in ${hard.join(', ')}`);
});

await gate('10 production dist carries no fixture data, no contract, no x/github links', () => {
  const files = walk(R('dist')).filter((f) => /\.(js|html|css)$/.test(f)).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  ok(!/0x[0-9a-fA-F]{40}\b/.test(stripCa(files)), 'unexpected address-shaped string in prod dist');
  ok(CA.stated || !/0x[0-9a-fA-F]{40}\b/.test(files), 'ca is absent but dist holds an address');
  for (const s of ['fixture_handle', 'fixture-repo', 'fixture-org', 'A1b2C3d4E5F6']) ok(!files.includes(s), `fixture leak: ${s}`);
  ok(!/https:\/\/(?:x|twitter|github)\.com\//.test(files), 'social url in prod dist');
  ok(!/href="#"/.test(files), 'placeholder href="#"');
});

// ===== browser gates =====
const prod = await serve(R('dist'));
const fix = await serve(R('.gates/dist'));
const fast = await serve(R('.gates/fast'));
const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, protocolTimeout: 60000, args: ['--no-sandbox', '--disable-gpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-features=CalculateNativeWinOcclusion'] });

// words and 2-grams
const norm = (s) => s.toLowerCase().replace(/robinhood chain/g, 'robinhoodchain').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
const bigrams = (w) => new Set(w.slice(1).map((x, i) => `${w[i]} ${x}`));
const DISTINCT = ['bones', 'xray', 'scanner', 'ledger', 'tracer', 'auditor', 'sorter', 'flagger', 'verdict', 'healthy', 'cracked', 'shattered', 'skeleton', 'agents', 'film', 'marrow', 'femur', 'pons', 'winrate', 'underwater', 'blockscout'];

let P; // prod page, loaded once for the content gates
try {
  P = await open(browser, fast.origin, { width: 1440, hold: true });
  const pg = P.page;

  await gate('11 copy originality: zero shared 2-grams and zero distinctive words vs the reference', async () => {
    const html = fs.readFileSync(R('index.html'), 'utf8');
    const meta = [...html.matchAll(/(?:content|title)="([^"]+)"|<title>([^<]+)<\/title>/g)].map((m) => m[1] || m[2]).join(' ');
    const strings = ['src/main.js', 'src/ui/method.js'].flatMap((f) => [...fs.readFileSync(R(f), 'utf8').matchAll(/(?:title|text|fields): ?['\[]([^\n]{12,})/g)].map((m) => m[1]));
    const rendered = await pg.evaluate(() => document.body.innerText);
    const ours = norm(`${meta} ${strings.join(' ')} ${rendered}`);
    const theirs = norm(fs.readFileSync(R('scripts/fixtures/ref-copy.txt'), 'utf8'));
    const tb = bigrams(theirs);
    const shared = [...bigrams(ours)].filter((b) => tb.has(b));
    ok(!shared.length, `shared 2-grams: ${shared.join(' | ')}`);
    const words = DISTINCT.filter((d) => ours.includes(d));
    ok(!words.length, `distinctive words reused: ${words.join(', ')}`);
    return `${ours.length} words checked`;
  });

  await gate('12 no date when absent: launch record absent and no date shown', async () => {
    ok(/launch: record\('launch', 'Launch date', 'absent'\)/.test(regSrc), 'launch record not absent');
    const t = await pg.evaluate(() => document.body.innerText + document.title);
    ok(!/\b(19|20)\d\d\b/.test(t.replace(/4663/g, '')), 'year in rendered text');
    ok(!/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d/i.test(t) && !/\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}/.test(t), 'date-like text');
    ok(!(await pg.$('time')), '<time> element present');
  });

  await gate('13 skeletons: every live region shows one before data arrives', async () => {
    await sleep(500);
    const r = await pg.evaluate(() => ({
      stats: [...document.querySelectorAll('.stat')].map((s) => s.classList.contains('is-loading') && s.querySelector('.stat__v .sk').offsetWidth > 0),
      chart: document.getElementById('tvl-chart').classList.contains('is-loading') && document.querySelector('.sk--chart').offsetHeight > 0,
      pairs: document.getElementById('pairs').classList.contains('is-loading') && document.querySelectorAll('.pair--sk .sk').length >= 8,
      busy: document.getElementById('pairs').getAttribute('aria-busy'),
      pill: document.getElementById('pill').dataset.state,
      shimmer: getComputedStyle(document.querySelector('.sk'), '::after').animationName,
    }));
    ok(r.stats.length === 4 && r.stats.every(Boolean), `stat skeletons ${r.stats}`);
    ok(r.chart && r.pairs && r.busy === 'true', 'chart/pairs skeleton missing');
    ok(r.pill === 'connecting', `pill ${r.pill}`);
    ok(r.shimmer === 'shimmer', 'skeleton shimmer not animating');
  });

  await gate('14 count-up: block figure animates through intermediate values to the live value', async () => {
    await pg.evaluate(() => {
      window.__seen = [];
      const n = document.querySelector('[data-stat="block"] .stat__num');
      new MutationObserver(() => window.__seen.push(n.textContent)).observe(n, { childList: true, characterData: true, subtree: true });
    });
    await P.ctl.release();
    await pg.evaluate(() => window.scrollTo(0, 600));
    await pg.waitForFunction(() => !document.querySelector('.stat.is-loading'), { timeout: 8000 });
    await sleep(900);
    const r = await pg.evaluate(() => ({ seen: [...new Set(window.__seen)], text: document.querySelector('[data-stat="block"] .stat__num').textContent }));
    ok(r.seen.length >= 3, `only ${r.seen.length} distinct values: ${r.seen.slice(0, 5)}`);
    ok(/^\d{1,3}(,\d{3})+$/.test(r.text) && Number(r.text.replace(/,/g, '')) >= 4_000_007, `final ${r.text}`);
    return `${r.seen.length} distinct frames`;
  });

  await gate('15 live data lands: tvl, volume, gas, pairs, chart, pill', async () => {
    const r = await pg.evaluate(() => ({
      tvl: document.querySelector('[data-stat="tvl"] .stat__num').textContent,
      vol: document.querySelector('[data-stat="vol"] .stat__num').textContent,
      gas: document.querySelector('[data-stat="gas"] .stat__num').textContent,
      sub: document.querySelector('[data-stat="vol"] .stat__s').textContent,
      rows: document.querySelectorAll('#pairs a.pair').length,
      path: document.querySelector('.ch__line')?.getAttribute('d')?.length,
      pill: document.querySelector('.pill__txt').textContent,
      off: [...document.querySelectorAll('#pairs .pair__sym')].some((n) => n.textContent.startsWith('OFF')),
    }));
    ok(r.tvl === '$1B' && r.vol === '$3.5M' && r.gas === '0.032', `values ${r.tvl} ${r.vol} ${r.gas}`);
    ok(r.sub.includes('3 tracked pairs') && r.rows === 3 && !r.off, `pairs ${r.rows} / ${r.sub}`);
    ok(r.path > 200 && /^Live \u00b7 block [\d,]+$/.test(r.pill), `chart ${r.path} pill ${r.pill}`);
  });

  await gate('16 flash on change: a new block value flashes and tweens', async () => {
    await pg.evaluate(() => {
      window.__flash = 0;
      const n = document.querySelector('[data-stat="block"] .stat__num');
      new MutationObserver(() => n.classList.contains('flash') && window.__flash++).observe(n, { attributes: true, attributeFilter: ['class'] });
    });
    await pg.waitForFunction(() => window.__flash > 0, { timeout: 4000 });
  });

  await gate('17 status pill: live dot pulses, drops to reconnecting on RPC loss, recovers', async () => {
    const live = await pg.evaluate(() => {
      const dot = document.querySelector('.pill__dot');
      return { a: getComputedStyle(dot).animationName, ring: getComputedStyle(dot, '::after').animationName, st: document.getElementById('pill').dataset.state };
    });
    ok(live.st === 'live' && live.a === 'pulse' && live.ring === 'ring', `live dot ${JSON.stringify(live)}`);
    await P.ctl.fail(true);
    await pg.waitForFunction(() => document.getElementById('pill').dataset.state === 'offline', { timeout: 5000 }).catch(async () => { throw new Error('pill never went offline: ' + JSON.stringify(await pg.evaluate(() => ({ st: document.getElementById('pill').dataset.state, fail: window.__ctl.rpcFail, block: window.__ctl.block, t: document.querySelector('.pill__txt').textContent })))); });
    ok((await pg.$eval('.pill__txt', (n) => n.textContent)) === 'Reconnecting', 'offline label');
    await P.ctl.fail(false);
    await pg.waitForFunction(() => document.getElementById('pill').dataset.state === 'live', { timeout: 8000 });
  });

  await gate('18 scroll progress bar tracks the page', async () => {
    const at = async (f) => {
      await pg.evaluate((k) => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * k), f);
      await sleep(180);
      return pg.$eval('#progress > i', (n) => matrixScale(getComputedStyle(n).transform));
    };
    await pg.evaluate(() => { window.matrixScale = (t) => (t === 'none' ? 1 : Number(t.match(/matrix\(([^,]+)/)[1])); });
    const [a, b, c] = [await at(0), await at(0.5), await at(1)];
    ok(a < 0.02 && Math.abs(b - 0.5) < 0.08 && c > 0.985, `progress ${a.toFixed(2)} / ${b.toFixed(2)} / ${c.toFixed(2)}`);
    return `${a.toFixed(2)} ${b.toFixed(2)} ${c.toFixed(2)}`;
  });

  await gate('23 contract slot, nothing stated: inert, sticky, full-width ghost; socials inert top-right', async () => {
    await pg.evaluate(() => window.scrollTo(0, 0));
    await sleep(150);
    const r = await pg.evaluate(() => {
      const ca = document.getElementById('ca');
      const icons = [...document.querySelectorAll('#socials .icon-btn')].map((i) => { const b = i.getBoundingClientRect(); return { inert: i.classList.contains('is-inert'), tag: i.tagName, href: i.getAttribute('href'), l: b.left, t: b.top, w: b.width, h: b.height, label: i.getAttribute('aria-label') }; });
      return { btn: !!ca.querySelector('button, a'), aria: ca.getAttribute('aria-disabled'), text: ca.textContent, ghost: ca.querySelector('.ca__ghost')?.getAttribute('aria-hidden'), icons, vw: innerWidth, links: [...document.querySelectorAll('a[href^="http"]')].map((a) => a.href) };
    });
    if (CA.stated) ok(r.btn && r.aria === null && r.text.includes(CA.value) && !r.ghost, 'stated ca slot should be a live button with the full address');
    else ok(!r.btn && r.aria === 'true' && /Not announced yet/.test(r.text) && r.ghost === 'true', 'ca slot not inert');
    ok(r.icons.length === 2 && r.icons.every((i) => i.inert && i.tag === 'SPAN' && !i.href && i.w >= 48 && i.h >= 48), `socials ${JSON.stringify(r.icons)}`);
    ok(r.icons.every((i) => i.l > r.vw / 2 && i.t < 120), 'socials not top-right');
    ok(!r.links.some((l) => /x\.com|github\.com/.test(l)), 'social href leaked');
    if (!CA.stated) {
      await pg.click('#ca .ca__in');
      await sleep(250);
      ok(!(await pg.$eval('#toast', (t) => t.classList.contains('is-on'))) && (await pg.evaluate(() => window.__copied)) === null, 'inert slot reacted to click');
    }
    await pg.evaluate(() => window.scrollTo(0, 2400));
    await sleep(200);
    const top = await pg.$eval('#ca', (n) => { const b = n.getBoundingClientRect(); return [b.top, b.height]; });
    ok(top[0] === 0 && top[1] >= 48, `slot not pinned: ${top}`);
  });

  await gate('19 scroll reveal: below-fold blocks start hidden, then enter with rising stagger', async () => {
    const q = await open(browser, fast.origin, { width: 1440, scroll: false });
    const before = await q.page.$eval('.foot', (n) => ({ o: getComputedStyle(n).opacity, c: n.classList.contains('is-in') }));
    ok(before.o === '0' && !before.c, `foot visible before scroll: ${JSON.stringify(before)}`);
    await scrollThrough(q.page);
    await sleep(900);
    const after = await q.page.evaluate(() => ({
      foot: getComputedStyle(document.querySelector('.foot')).opacity,
      d: [...document.querySelectorAll('.stat')].map((s) => parseFloat(getComputedStyle(s).transitionDelay)),
    }));
    ok(after.foot === '1', 'foot never revealed');
    ok(after.d.every((v, i) => i === 0 || v > after.d[i - 1]), `stagger not increasing: ${after.d}`);
    await q.page.close();
    return `delays ${after.d.map((d) => d.toFixed(2)).join(' ')}`;
  });

  await gate('20 parallax: depth layers translate with scroll', async () => {
    await pg.evaluate(() => window.scrollTo(0, 0));
    await sleep(100);
    await pg.evaluate(() => window.scrollTo(0, 300));
    await sleep(250);
    const r = await pg.evaluate(() => ({ g: getComputedStyle(document.querySelector('.bg--glow')).transform, f: getComputedStyle(document.querySelector('.art__frame')).transform }));
    ok(Math.abs(matrixY(r.g) - 48) < 3 && Math.abs(matrixY(r.f) - 30) < 3, `glow ${matrixY(r.g)} frame ${matrixY(r.f)}`);
  });

  await gate('24 method rail: auto-advances, click selects, arrow keys walk the stages', async () => {
    await pg.evaluate(() => document.getElementById('method').scrollIntoView());
    await sleep(300);
    const sel = () => pg.$$eval('.station', (b) => b.findIndex((x) => x.getAttribute('aria-selected') === 'true'));
    const first = await sel();
    await pg.waitForFunction((f) => [...document.querySelectorAll('.station')].findIndex((x) => x.getAttribute('aria-selected') === 'true') !== f, { timeout: 4000 }, first);
    await pg.click('.station:nth-child(4)');
    ok((await sel()) === 3, 'click did not select stage 4');
    ok((await pg.$eval('#stage-panel', (p) => p.textContent)).includes('return band'), 'panel not swapped');
    await pg.focus('.station:nth-child(4)');
    await pg.keyboard.press('ArrowRight');
    ok((await sel()) === 4, 'arrow key did not advance');
    const p = await pg.$eval('.rail__packet', (n) => getComputedStyle(n).left);
    ok(parseFloat(p) > 0, 'packet not positioned');
  });

  await gate('25 chart: draws in, range switch redraws, crosshair readout follows the pointer', async () => {
    await pg.evaluate(() => document.getElementById('pulse').scrollIntoView());
    await sleep(500);
    const d = () => pg.$eval('.ch__line', (n) => n.getAttribute('d'));
    const d90 = await d();
    await pg.waitForFunction(() => parseFloat(getComputedStyle(document.querySelector('.ch__line')).strokeDashoffset) < 0.001, { timeout: 15000 }).catch(() => { throw new Error('line never finished drawing'); });
    await pg.click('[data-range="30"]');
    const d30 = await d();
    await pg.click('[data-range="all"]');
    const dAll = await d();
    ok(d30 !== d90 && dAll !== d30, 'range buttons did not redraw');
    ok((await pg.$eval('[data-range="all"]', (b) => b.getAttribute('aria-pressed'))) === 'true', 'aria-pressed not updated');
    const box = await (await pg.$('#tvl-chart svg')).boundingBox();
    const idle = await pg.$eval('#tvl-readout', (n) => n.textContent);
    await pg.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
    await sleep(120);
    const hov = await pg.evaluate(() => ({ t: document.getElementById('tvl-readout').textContent, h: document.querySelector('.ch__cross').hidden }));
    ok(!hov.h && hov.t !== idle && /back/.test(hov.t), `crosshair ${JSON.stringify(hov)}`);
  });

  await gate('30 console and network clean: no errors, only the stubbed image host blocked, fallback glyph shown', async () => {
    const glyph = await pg.$$eval('#pairs .pair__logo', (l) => l.map((n) => n.textContent.trim()));
    ok(glyph.length === 3 && glyph.every((g) => /^[A-C]$/.test(g)), `fallback glyphs ${glyph}`);
    await P.ctl.blocked();
    ok(!allErrors.filter((e) => !/fixture\.invalid|ERR_NAME_NOT_RESOLVED|Failed to load resource/.test(e)).length, allErrors.join('\n'));
    ok(!allBlocked.length, `unexpected external requests: ${allBlocked.join(', ')}`);
  });
} finally {
  if (P) await P.page.close().catch(() => {});
}

// ----- reduced motion -----
await gate('21 reduced motion: everything lands instantly, nothing animates', async () => {
  const q = await open(browser, fast.origin, { width: 1440, reduce: true, hold: true });
  const pg = q.page;
  await pg.evaluate(() => {
    window.__seen = [];
    const n = document.querySelector('[data-stat="block"] .stat__num');
    new MutationObserver(() => window.__seen.push(n.textContent)).observe(n, { childList: true, characterData: true, subtree: true });
  });
  await q.ctl.release();
  await settle(pg);
  await pg.evaluate(() => window.scrollTo(0, 600));
  await pg.waitForFunction(() => /\d/.test(document.querySelector('[data-stat="block"] .stat__num').textContent), { timeout: 20000 });
  await sleep(600);
  const r = await pg.evaluate(() => ({
    hidden: [...document.querySelectorAll('[data-reveal]')].filter((e) => getComputedStyle(e).opacity !== '1' || getComputedStyle(e).transform !== 'none').length,
    anims: document.getAnimations().length,
    glow: getComputedStyle(document.querySelector('.bg--glow')).transform,
    seen: [...new Set(window.__seen)].filter((s) => s !== '-').map((s) => Number(s.replace(/,/g, ''))),
    word: getComputedStyle(document.querySelector('.w > span')).animationName,
    line: getComputedStyle(document.querySelector('.ch__line')).strokeDashoffset,
  }));
  await pg.close();
  ok(r.hidden === 0, `${r.hidden} reveal blocks still hidden`);
  ok(r.anims === 0, `${r.anims} animations running`);
  ok(r.glow === 'none' || matrixY(r.glow) === 0, `parallax active: ${r.glow}`);
  ok(r.seen.length >= 1 && r.seen.every((v) => (v - 4_000_000) % 7 === 0), `count-up tweened through intermediate values: ${r.seen.slice(0, 6)}`);
  ok(r.word === 'none' && parseFloat(r.line) === 0, 'headline/chart not at rest state');
});

// ----- hover, CA stated, breakpoints -----
const FX = await open(browser, fix.origin, { width: 1440 });
await gate('22 hover states: every interactive family visibly responds', async () => {
  const pg = FX.page;
  await scrollThrough(pg);
  const sels = ['.btn--solid', '.btn--ghost', '.nav a', 'a.icon-btn', '.brand', '.station:not([aria-selected="true"])', '.seg button:not([aria-pressed="true"])', 'a.pair', '.stat', '.q', '.ca__btn'];
  const snap = (s) => pg.$eval(s, (n) => [n, ...[...n.querySelectorAll('*')].slice(0, 6)].map((e) => { const c = getComputedStyle(e); return [c.color, c.backgroundColor, c.borderColor, c.boxShadow, c.transform, c.filter].join('|'); }).join('||'));
  const dead = [];
  for (const s of sels) {
    const h = await pg.$(s); // one fixed element per family, so auto-advance cannot swap the target
    ok(h, `no element for ${s}`);
    const snapH = () => h.evaluate((n) => [n, ...[...n.querySelectorAll('*')].slice(0, 6)].map((e) => { const c = getComputedStyle(e); return [c.color, c.backgroundColor, c.borderColor, c.boxShadow, c.transform, c.filter].join('|'); }).join('||'));
    await h.evaluate((n) => n.scrollIntoView({ block: 'center' }));
    await pg.mouse.move(2, 2);
    await sleep(380);
    const a = await snapH();
    await h.hover();
    let b = a;
    for (let i = 0; i < 9 && b === a; i++) { await sleep(300); b = await snapH(); }
    if (a === b) dead.push(s);
    await pg.mouse.move(2, 2);
  }
  ok(!dead.length, `no hover change: ${dead.join(', ')}`);
  return `${sels.length} families`;
});

await gate('26 contract slot, stated (synthetic): full address, one line, click copies, links derived', async () => {
  const pg = FX.page;
  const ADDR = '0xA1b2C3d4E5F60718293a4B5c6D7e8F9012345678';
  for (const w of WIDTHS) {
    await pg.setViewport({ width: w, height: 900 });
    await sleep(200);
    const r = await pg.$eval('.ca__addr', (n) => { const s = getComputedStyle(n); return { text: n.textContent, h: n.getBoundingClientRect().height, lh: parseFloat(s.lineHeight), over: n.scrollWidth > n.clientWidth }; });
    ok(r.text === ADDR && r.text.length === 42, `address text ${r.text}`);
    ok(!r.over && r.h < r.lh * 1.5, `address wraps or clips at ${w}px (h ${r.h}, lh ${r.lh})`);
  }
  await pg.setViewport({ width: 1440, height: 900 });
  await pg.evaluate(() => window.scrollTo(0, 2400));
  await sleep(200);
  ok(await pg.$eval('#ca', (n) => n.getBoundingClientRect().top === 0), 'stated slot not pinned');
  await pg.evaluate(() => {
    window.__toast = false;
    const t = document.getElementById('toast');
    new MutationObserver(() => { if (t.classList.contains('is-on') && /copied/i.test(t.textContent)) window.__toast = true; }).observe(t, { attributes: true, childList: true, characterData: true, subtree: true });
  });
  await pg.click('.ca__btn');
  await pg.waitForFunction(() => window.__copied !== null, { timeout: 10000 });
  ok((await pg.evaluate(() => window.__copied)) === ADDR, 'clipboard did not receive the full address');
  ok(await pg.evaluate(() => window.__toast), 'no copy toast');
  const links = await pg.$$eval('#socials a', (a) => a.map((x) => ({ href: x.href, label: x.getAttribute('aria-label'), t: x.target, rel: x.rel })));
  ok(links.length === 2 && links[0].href === 'https://x.com/fixture_handle' && links[0].label === 'X @fixture_handle', `x link ${JSON.stringify(links[0])}`);
  ok(links[1].href === 'https://github.com/fixture-org/fixture-repo' && links[1].label === 'GitHub fixture-org/fixture-repo', `gh link ${JSON.stringify(links[1])}`);
  ok(links.every((l) => l.t === '_blank' && /noopener/.test(l.rel)), 'links not noopener');
});

const probe = (pg) => pg.evaluate(() => {
  const vw = innerWidth;
  const clipped = (el) => { for (let n = el.parentElement; n; n = n.parentElement) { const o = getComputedStyle(n).overflowX; if (o !== 'visible') return true; } return false; };
  const wide = [...document.querySelectorAll('body *')].filter((el) => { const b = el.getBoundingClientRect(); return b.width && (b.right > vw + 0.5 || b.left < -0.5) && !clipped(el); }).map((el) => `${el.tagName}.${el.className}`);
  const taps = [...document.querySelectorAll('a[href], button, [role="tab"]')].filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== 'hidden'; })
    .map((el) => { const b = el.getBoundingClientRect(); return { n: `${el.tagName}.${el.className}`, w: b.width, h: b.height }; });
  return { vw, sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, wide, taps };
});

const sweep = {};
for (const [label, origin] of [['prod', prod.origin], ['fixture', fix.origin]]) {
  const q = label === 'fixture' ? FX : await open(browser, origin, { width: 1440 });
  sweep[label] = {};
  for (const w of WIDTHS) {
    await q.page.setViewport({ width: w, height: 900 });
    await sleep(250);
    await scrollThrough(q.page);
    sweep[label][w] = await probe(q.page);
  }
  if (label !== 'fixture') await q.page.close();
}

await gate('27 five breakpoints (360/390/430/1366/1440), both builds: zero horizontal overflow', () => {
  const rows = [];
  for (const [label, by] of Object.entries(sweep)) for (const [w, r] of Object.entries(by)) {
    rows.push(`${label}@${w}: scrollWidth ${r.sw}/${r.vw}`);
    ok(r.sw <= r.vw && r.bw <= r.vw, `${label}@${w} overflows: scrollWidth ${r.sw} > ${r.vw}`);
    ok(!r.wide.length, `${label}@${w} elements outside viewport: ${r.wide.slice(0, 4).join(', ')}`);
  }
  return `\n      ${rows.join('\n      ')}`;
});

await gate('28 five breakpoints, both builds: every tap target is at least 48 x 48', () => {
  const rows = [];
  for (const [label, by] of Object.entries(sweep)) for (const [w, r] of Object.entries(by)) {
    const small = r.taps.filter((t) => t.w < 47.99 || t.h < 47.99);
    rows.push(`${label}@${w}: ${r.taps.length} targets, min ${Math.min(...r.taps.map((t) => Math.min(t.w, t.h))).toFixed(1)}px`);
    ok(r.taps.length >= 6 && !small.length, `${label}@${w} small targets: ${small.slice(0, 4).map((t) => `${t.n} ${t.w.toFixed(0)}x${t.h.toFixed(0)}`).join(', ')}`);
  }
  return `\n      ${rows.join('\n      ')}`;
});

await gate('29 fixture build is isolated: synthetic ca/x/github appear only in the gates build', async () => {
  const f = walk(R('.gates/dist')).filter((p) => p.endsWith('.js')).map((p) => fs.readFileSync(p, 'utf8')).join('');
  ok(f.includes('fixture_handle') && /0x[0-9a-fA-F]{40}/.test(f), 'fixture build lost its synthetic records');
  const p = walk(R('dist')).filter((x) => x.endsWith('.js')).map((x) => fs.readFileSync(x, 'utf8')).join('');
  ok(!p.includes('fixture_handle'), 'fixture leaked into dist');
});

console.log(`  phases done at ${((Date.now() - T0) / 1000).toFixed(0)}s`);
browser.process()?.kill();
prod.srv.close();
fix.srv.close();
fast.srv.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length} gates, ${results.length - failed.length} passed, ${failed.length} failed, ${((Date.now() - T0) / 1000).toFixed(1)}s`);
if (results.length > 30) console.log('too many gates');
process.exit(failed.length || results.length > 30 ? 1 : 0);
