// Live feeds: RPC (block, gas), DefiLlama (chain TVL), DexScreener (pairs).
// Each feed publishes into one small store; the UI subscribes and never fetches.
import { REGISTER } from '../data/registry.js';
import { hrefOf, hexToInt } from '../lib/register.js';
import { ms } from '../lib/clock.js';

const listeners = new Set();
export const state = {
  rpc: { status: 'connecting', block: null, gwei: null, at: 0 },
  tvl: { status: 'connecting', series: [], at: 0 },
  dex: { status: 'connecting', pairs: [], volume: null, liquidity: null, at: 0 },
};
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const publish = (key) => listeners.forEach((fn) => fn(key, state));

async function json(url, init) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function loop(key, fn, every) {
  let fails = 0;
  const tick = async () => {
    try {
      await fn();
      fails = 0;
    } catch {
      fails += 1;
      state[key].status = fails > 1 || state[key].at === 0 ? 'offline' : state[key].status;
      publish(key);
    }
    setTimeout(tick, ms(every) * Math.min(4, 1 + fails));
  };
  tick();
}

async function readRpc() {
  const url = hrefOf(REGISTER.rpc);
  const rows = await json(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify([
      { jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] },
      { jsonrpc: '2.0', id: 2, method: 'eth_gasPrice', params: [] },
    ]),
  });
  const by = Object.fromEntries(rows.map((r) => [r.id, r.result]));
  const block = hexToInt(by[1]);
  const wei = hexToInt(by[2]);
  if (!Number.isFinite(block) || !Number.isFinite(wei)) throw new Error('bad rpc');
  Object.assign(state.rpc, { status: 'live', block, gwei: wei / 1e9, at: Date.now() });
  publish('rpc');
}

async function readTvl() {
  const key = encodeURIComponent(REGISTER.llamaChain.value);
  const rows = await json(`https://api.llama.fi/v2/historicalChainTvl/${key}`);
  const series = rows.filter((r) => Number.isFinite(r.tvl)).map((r) => ({ t: r.date, v: r.tvl }));
  if (!series.length) throw new Error('empty tvl');
  Object.assign(state.tvl, { status: 'live', series, at: Date.now() });
  publish('tvl');
}

const DEX_QUERIES = ['robinhood', 'WETH robinhood', 'USDC robinhood', 'ETH robinhood'];

async function readDex() {
  const slug = REGISTER.dexChain.value;
  const batches = await Promise.all(
    DEX_QUERIES.map((q) => json(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`).catch(() => null)),
  );
  if (batches.every((b) => !b)) throw new Error('dex down');
  const seen = new Map();
  for (const b of batches) {
    for (const p of b?.pairs ?? []) {
      if (p.chainId === slug && !seen.has(p.pairAddress)) seen.set(p.pairAddress, p);
    }
  }
  const pairs = [...seen.values()]
    .map((p) => ({
      id: p.pairAddress,
      url: typeof p.url === 'string' && p.url.startsWith('https://') ? p.url : null,
      symbol: p.baseToken?.symbol ?? '?',
      name: p.baseToken?.name ?? '',
      quote: p.quoteToken?.symbol ?? '',
      image: typeof p.info?.imageUrl === 'string' && p.info.imageUrl.startsWith('https://') ? p.info.imageUrl : null,
      price: Number(p.priceUsd),
      volume: Number(p.volume?.h24 ?? 0),
      liquidity: Number(p.liquidity?.usd ?? 0),
      buys: Number(p.txns?.h24?.buys ?? 0),
      sells: Number(p.txns?.h24?.sells ?? 0),
    }))
    .sort((a, b) => b.volume - a.volume);
  Object.assign(state.dex, {
    status: 'live',
    pairs: pairs.slice(0, 8),
    count: pairs.length,
    volume: pairs.reduce((s, p) => s + p.volume, 0),
    liquidity: pairs.reduce((s, p) => s + p.liquidity, 0),
    at: Date.now(),
  });
  publish('dex');
}

export function startFeeds() {
  loop('rpc', readRpc, 3000);
  loop('tvl', readTvl, 300000);
  loop('dex', readDex, 45000);
}
