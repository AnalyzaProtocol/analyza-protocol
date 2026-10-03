const int = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });

export const fmtInt = (n) => int.format(Math.round(n));
export const fmtUsd = (n) => `$${compact.format(n)}`;
export const fmtGwei = (n) => (n >= 1 ? n.toFixed(2) : n >= 0.01 ? n.toFixed(3) : n.toFixed(4));

export function fmtPrice(n) {
  if (!Number.isFinite(n)) return '-';
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  if (n >= 0.0001) return `$${n.toFixed(6)}`;
  return `$${n.toPrecision(3)}`;
}

export function fmtAge(seconds) {
  if (seconds < 2) return 'just now';
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}
