// TVL area chart in plain SVG: range switch, draw-in on first view, crosshair + readout on pointer.
import { onceVisible } from './motion.js';
import { fmtUsd } from '../lib/format.js';

const NS = 'http://www.w3.org/2000/svg';
const H = 240;
const PAD = { t: 16, r: 8, b: 26, l: 8 };
const RANGES = { '30': 30, '90': 90, all: Infinity };

export function bindChart(state, subscribe) {
  const host = document.getElementById('tvl-chart');
  const readout = document.getElementById('tvl-readout');
  const segs = [...document.querySelectorAll('[data-range]')];
  let range = '90';
  let drawn = false;
  let seen = false;

  const slice = () => {
    const s = state.tvl.series;
    const n = RANGES[range];
    return n === Infinity ? s : s.slice(-n);
  };

  function render() {
    const pts = slice();
    if (pts.length < 2) return;
    const W = Math.max(280, host.clientWidth);
    const lo = Math.min(...pts.map((p) => p.v));
    const hi = Math.max(...pts.map((p) => p.v));
    const span = hi - lo || 1;
    const x = (i) => PAD.l + (i / (pts.length - 1)) * (W - PAD.l - PAD.r);
    const y = (v) => PAD.t + (1 - (v - lo) / span) * (H - PAD.t - PAD.b);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`).join('');
    const area = `${line}L${x(pts.length - 1).toFixed(1)} ${H - PAD.b}L${x(0).toFixed(1)} ${H - PAD.b}Z`;
    const grid = [0, 0.5, 1].map((k) => {
      const gy = PAD.t + k * (H - PAD.t - PAD.b);
      return `<line class="ch__grid" x1="0" x2="${W}" y1="${gy}" y2="${gy}"/><text class="ch__tick" x="${W - 4}" y="${gy - 5}" text-anchor="end">${fmtUsd(hi - k * span)}</text>`;
    }).join('');
    host.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Chain TVL, last ${range === 'all' ? 'full history' : range + ' days'}">
        <defs><linearGradient id="tvlfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style="stop-color:var(--c-cyan);stop-opacity:.38"/><stop offset="1" style="stop-color:var(--c-cyan);stop-opacity:0"/>
        </linearGradient></defs>
        ${grid}
        <path class="ch__area" d="${area}" fill="url(#tvlfill)"/>
        <path class="ch__line" d="${line}" pathLength="1"/>
        <g class="ch__cross" hidden><line y1="${PAD.t}" y2="${H - PAD.b}"/><circle r="4.5"/></g>
        <text class="ch__tick" x="${PAD.l + 2}" y="${H - 8}">${range === 'all' ? 'start' : `-${pts.length - 1}d`}</text>
        <text class="ch__tick" x="${W - PAD.r - 2}" y="${H - 8}" text-anchor="end">now</text>
      </svg>`;
    const svg = host.querySelector('svg');
    const cross = svg.querySelector('.ch__cross');
    const vline = cross.querySelector('line');
    const dot = cross.querySelector('circle');
    if (!drawn) host.classList.remove('is-drawn');
    if (seen) host.classList.add('is-drawn');

    const move = (ev) => {
      const r = svg.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(pts.length - 1, Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (pts.length - 1))));
      cross.hidden = false;
      vline.setAttribute('x1', x(i)); vline.setAttribute('x2', x(i));
      dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(pts[i].v));
      const ago = pts.length - 1 - i;
      readout.textContent = `${fmtUsd(pts[i].v)} · ${ago === 0 ? 'latest' : `${ago}d back`}`;
    };
    const leave = () => {
      cross.hidden = true;
      const last = pts[pts.length - 1];
      readout.textContent = `${fmtUsd(last.v)} · latest`;
    };
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerleave', leave);
    leave();
  }

  segs.forEach((b) => b.addEventListener('click', () => {
    range = b.dataset.range;
    segs.forEach((s) => s.setAttribute('aria-pressed', String(s === b)));
    drawn = false;
    render();
    requestAnimationFrame(() => host.classList.add('is-drawn'));
  }));

  subscribe((key) => {
    if (key !== 'tvl' || state.tvl.status !== 'live') return;
    host.classList.remove('is-loading');
    render();
    if (!drawn) {
      drawn = true;
      onceVisible(host, () => {
        seen = true;
        host.classList.add('is-drawn');
      });
    }
  });

  let t = 0;
  window.addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(() => state.tvl.series.length && render(), 120);
  });
}
