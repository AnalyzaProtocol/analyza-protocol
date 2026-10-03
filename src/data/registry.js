// REGISTER PATTERN: every external fact is one record.
//   { id, label, state: 'stated' | 'absent' | 'unconfirmed', value?, url? }
// A record may only carry a value/url when its state is 'stated'.
// Handles are never stored; they are derived from the url (see lib/register.js).
import { FIXTURE } from './registry.fixture.js';

const record = (id, label, state, extra = {}) => ({ id, label, state, ...extra });

const PRODUCTION = {
  domain: record('domain', 'Domain', 'stated', { value: 'analyza.fun', url: 'https://analyza.fun' }),
  chainId: record('chainId', 'Chain id', 'stated', { value: 4663 }),
  chainName: record('chainName', 'Chain name', 'stated', { value: 'Robinhood Chain' }),
  rpc: record('rpc', 'RPC endpoint', 'stated', { url: 'https://rpc.mainnet.chain.robinhood.com' }),
  llamaChain: record('llamaChain', 'DefiLlama chain key', 'stated', { value: 'Robinhood Chain' }),
  dexChain: record('dexChain', 'DexScreener chain slug', 'stated', { value: 'robinhood' }),
  phase: record('phase', 'Build phase', 'stated', { value: 'in build' }),
  ca: { id: 'ca', label: 'Contract address', state: 'absent', value: null },
  x: record('x', 'X profile', 'absent'),
  github: record('github', 'GitHub repository', 'absent'),
  launch: record('launch', 'Launch date', 'absent'),
  explorer: record('explorer', 'Block explorer', 'unconfirmed'),
};

export const REGISTER = import.meta.env.MODE === 'fixture' ? { ...PRODUCTION, ...FIXTURE } : PRODUCTION;
