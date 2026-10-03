// Pair board from DexScreener. Built with DOM nodes (never innerHTML) because every string is third-party.
// Rows are keyed by pair id and updated in place, so a hovered row never gets torn out from under the pointer.
import { fmtPrice, fmtUsd, fmtAge } from '../lib/format.js';
import { flash } from './motion.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

function mark(p) {
  const box = el('span', 'pair__logo');
  if (p.image) {
    const img = new Image();
    img.alt = '';
    img.width = 32;
    img.height = 32;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.src = p.image;
    img.addEventListener('error', () => {
      img.remove();
      box.textContent = p.symbol.slice(0, 1).toUpperCase();
    }, { once: true });
    box.append(img);
  } else {
    box.textContent = p.symbol.slice(0, 1).toUpperCase();
  }
  return box;
}

function build(p) {
  const row = p.url ? el('a', 'pair') : el('div', 'pair');
  if (p.url) {
    row.href = p.url;
    row.target = '_blank';
    row.rel = 'noopener noreferrer';
  }
  row.setAttribute('role', 'listitem');
  const id = el('span', 'pair__id');
  const sym = el('span', 'pair__sym', p.symbol);
  sym.append(el('small', '', ` / ${p.quote}`));
  id.append(sym, el('span', 'pair__name', p.name));
  const flow = el('span', 'pair__flow');
  flow.append(el('i'));
  row.append(mark(p), id, el('span', 'pair__px'), el('span', 'pair__vol'), el('span', 'pair__liq'), flow);
  return row;
}

function fill(row, p) {
  const vol = row.querySelector('.pair__vol');
  const next = fmtUsd(p.volume);
  const changed = vol.textContent && vol.textContent !== next;
  row.querySelector('.pair__px').textContent = fmtPrice(p.price);
  vol.textContent = next;
  row.querySelector('.pair__liq').textContent = fmtUsd(p.liquidity);
  const total = p.buys + p.sells;
  const flow = row.querySelector('.pair__flow');
  flow.title = `${p.buys} buys, ${p.sells} sells in 24h`;
  flow.firstChild.style.setProperty('--buy', total ? `${((p.buys / total) * 100).toFixed(0)}%` : '50%');
  if (changed) flash(vol);
}

export function bindPairs(state, subscribe) {
  const list = document.getElementById('pairs');
  const stamp = document.getElementById('pairs-age');
  const rows = new Map();

  function render() {
    const d = state.dex;
    list.setAttribute('aria-busy', 'false');
    list.classList.remove('is-loading');
    if (!d.pairs.length) {
      rows.clear();
      list.replaceChildren(el('p', 'pairs__empty', 'No pairs are being reported for this chain right now.'));
      return;
    }
    const ids = d.pairs.map((p) => p.id);
    const sameSet = ids.length === rows.size && ids.every((id) => rows.has(id));
    if (!sameSet) {
      rows.clear();
      list.replaceChildren();
      for (const p of d.pairs) {
        const row = build(p);
        rows.set(p.id, row);
        list.append(row);
      }
    }
    d.pairs.forEach((p, i) => {
      const row = rows.get(p.id);
      fill(row, p);
      if (list.children[i] !== row) list.insertBefore(row, list.children[i]);
    });
  }

  subscribe((key) => {
    if (key !== 'dex') return;
    if (state.dex.status === 'offline' && !state.dex.at) {
      rows.clear();
      list.setAttribute('aria-busy', 'false');
      list.classList.remove('is-loading');
      list.replaceChildren(el('p', 'pairs__empty', 'The pair feed is unreachable. Retrying in the background.'));
      return;
    }
    render();
  });

  setInterval(() => {
    if (state.dex.at) stamp.textContent = `Updated ${fmtAge((Date.now() - state.dex.at) / 1000)}`;
  }, 1000);
}
