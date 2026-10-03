// Stat cards: skeleton -> count-up (once visible) -> short tween + flash on every later change.
import { countTo, flash, onceVisible } from './motion.js';
import { fmtInt, fmtGwei, fmtUsd } from '../lib/format.js';

const CARDS = {
  block: { fmt: fmtInt },
  gas: { fmt: fmtGwei },
  tvl: { fmt: fmtUsd },
  vol: { fmt: fmtUsd },
};

const $ = (k) => document.querySelector(`[data-stat="${k}"]`);

function put(key, value, sub) {
  const card = $(key);
  const num = card.querySelector('.stat__num');
  const subEl = card.querySelector('.stat__s');
  card.classList.remove('is-loading', 'is-offline');
  subEl.textContent = sub;
  const { fmt } = CARDS[key];
  if (!card.__ready) {
    card.__target = value;
    if (!card.__armed) {
      card.__armed = true;
      onceVisible(card, () => {
        card.__ready = true;
        countTo(num, card.__target, fmt, { dur: 1500 });
      });
    }
    return;
  }
  if (num.__v !== value) {
    countTo(num, value, fmt, { dur: 420 });
    flash(num);
  }
}

function offline(key) {
  const card = $(key);
  if (card.__ready || card.__armed) return;
  card.classList.remove('is-loading');
  card.classList.add('is-offline');
  card.querySelector('.stat__num').textContent = '-';
  card.querySelector('.stat__s').textContent = 'Source unreachable, retrying';
}

export function bindStats(state, subscribe) {
  let last = null;
  let rate = null;
  const hud = document.getElementById('hud-block');

  subscribe((key) => {
    if (key === 'rpc') {
      const r = state.rpc;
      if (r.status === 'offline' && r.block === null) {
        offline('block');
        offline('gas');
        return;
      }
      if (last && r.at > last.at && r.block >= last.block) {
        const inst = (r.block - last.block) / ((r.at - last.at) / 1000);
        rate = rate === null ? inst : rate * 0.6 + inst * 0.4;
      }
      last = { block: r.block, at: r.at };
      put('block', r.block, rate === null ? 'Sampling block rate' : `About ${rate < 10 ? rate.toFixed(1) : fmtInt(rate)} blocks per second`);
      put('gas', r.gwei, 'Gwei per unit of gas');
      if (hud) hud.textContent = fmtInt(r.block);
    }
    if (key === 'tvl') {
      const s = state.tvl.series;
      if (state.tvl.status === 'offline' && !s.length) return offline('tvl');
      const now = s[s.length - 1].v;
      const prev = s.length > 1 ? s[s.length - 2].v : now;
      const pct = prev ? ((now - prev) / prev) * 100 : 0;
      put('tvl', now, `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}% against the day before`);
    }
    if (key === 'dex') {
      const d = state.dex;
      if (d.status === 'offline' && d.volume === null) return offline('vol');
      put('vol', d.volume, `Across ${d.count} tracked pair${d.count === 1 ? '' : 's'}`);
    }
  });
}
