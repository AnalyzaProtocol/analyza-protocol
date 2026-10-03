// Every timer in the app goes through here so the gates build can run on a fast clock.
// Gates builds ('fixture' = synthetic records, 'fast' = production records) run every timer at 0.08x.
const SCALE = ['fixture', 'fast'].includes(import.meta.env.MODE) ? 0.08 : 1;
export const ms = (n) => Math.max(1, Math.round(n * SCALE));
export const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
