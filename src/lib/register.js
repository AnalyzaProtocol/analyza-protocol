// LINK RULE: store the url, derive the handle, and never emit an href for a record that is not stated.
const STATES = new Set(['stated', 'absent', 'unconfirmed']);

export const isStated = (r) => !!r && r.state === 'stated';
export const validState = (r) => !!r && STATES.has(r.state);

export function hrefOf(r) {
  if (!isStated(r) || typeof r.url !== 'string') return null;
  try {
    const u = new URL(r.url);
    return u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

export function handleOf(r, { at = false } = {}) {
  const href = hrefOf(r);
  if (!href) return null;
  const parts = new URL(href).pathname.split('/').filter(Boolean);
  if (!parts.length) return null;
  return at ? `@${parts[0]}` : parts.join('/');
}

// 20-byte EVM address: the 0x prefix plus 40 hex digits, any casing. Format only.
// (Checksum casing is not enforced, and 0x-prefixed hex in general is never rejected here:
// block numbers, chain ids and quantities share the prefix and are parsed elsewhere.)
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
export const isAddress = (s) => typeof s === 'string' && ADDRESS.test(s);

export function caOf(r) {
  return isStated(r) && isAddress(r.value) ? r.value : null;
}

export const hexToInt = (h) => parseInt(h, 16);
