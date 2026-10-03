// Contract slot, social icons and the live status pill. All driven by the register.
import { REGISTER } from '../data/registry.js';
import { caOf, hrefOf, handleOf } from '../lib/register.js';
import { ICON_COPY, ICON_GITHUB, ICON_X } from './icons.js';
import { ms } from '../lib/clock.js';
import { fmtInt } from '../lib/format.js';

const GHOST = `0x${'·'.repeat(40)}`;

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

let toastTimer = 0;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-on'), ms(1800) + 400);
}

export function renderCa() {
  const root = document.getElementById('ca');
  const addr = caOf(REGISTER.ca);
  if (!addr) {
    root.className = 'ca is-inert';
    root.innerHTML = `
      <div class="ca__in wrap">
        <span class="ca__label">Contract</span>
        <span class="ca__ghost" aria-hidden="true">${GHOST}</span>
        <span class="ca__status">Not announced yet</span>
      </div>`;
    root.setAttribute('aria-disabled', 'true');
    return;
  }
  root.className = 'ca is-live';
  root.removeAttribute('aria-disabled');
  root.innerHTML = `
    <div class="ca__in wrap">
      <span class="ca__label">Contract</span>
      <button class="ca__btn" type="button" aria-label="Copy the contract ${addr}">
        <span class="ca__addr">${addr}</span>
        <span class="ca__copy">${ICON_COPY}<span class="ca__hint">Copy</span></span>
      </button>
    </div>`;
  const btn = root.querySelector('.ca__btn');
  btn.addEventListener('click', async () => {
    const ok = await copyText(addr);
    btn.classList.add('is-copied');
    btn.querySelector('.ca__hint').textContent = ok ? 'Copied' : 'Press Ctrl+C';
    toast(ok ? 'Contract address copied' : 'Select the address and copy it');
    setTimeout(() => {
      btn.classList.remove('is-copied');
      btn.querySelector('.ca__hint').textContent = 'Copy';
    }, ms(1800) + 400);
  });
}

function social(rec, icon, name) {
  const href = hrefOf(rec);
  if (!href) {
    return `<span class="icon-btn is-inert" role="img" aria-label="${name}, not published yet" title="${name}: not published yet">${icon}</span>`;
  }
  const handle = handleOf(rec, { at: name === 'X' });
  return `<a class="icon-btn" href="${href}" target="_blank" rel="noopener noreferrer" aria-label="${name} ${handle}" title="${name} ${handle}">${icon}</a>`;
}

export function renderSocials() {
  document.getElementById('socials').innerHTML =
    social(REGISTER.x, ICON_X, 'X') + social(REGISTER.github, ICON_GITHUB, 'GitHub');
}

// pill: connecting | live | offline
export function bindPill(state, subscribe) {
  const pill = document.getElementById('pill');
  const label = pill.querySelector('.pill__txt');
  const paint = () => {
    const s = state.rpc.status;
    pill.dataset.state = s;
    label.textContent = s === 'live' ? `Live · block ${fmtInt(state.rpc.block)}` : s === 'offline' ? 'Reconnecting' : 'Connecting';
  };
  subscribe((k) => k === 'rpc' && paint());
  paint();
}
