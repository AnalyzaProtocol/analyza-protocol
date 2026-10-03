// Five-stage read-through. Auto-advances on a 2.6 s beat, pauses on hover/focus/offscreen, click to pick.
import { pixelIcon } from './icons.js';
import { ms, reduced } from '../lib/clock.js';

const STAGES = [
  { icon: 'gather', title: 'Gather', text: 'Pull every transfer a token has ever had, straight from chain logs.', fields: ['address', 'direction', 'amount', 'block'] },
  { icon: 'rebuild', title: 'Rebuild', text: 'Replay each address transaction by transaction to recover cost, proceeds and remaining balance.', fields: ['cost', 'proceeds', 'balance', 'return'] },
  { icon: 'link', title: 'Link', text: 'Match the addresses against the other tokens they hold or have held.', fields: ['tokens touched', 'overlap', 'history length'] },
  { icon: 'rank', title: 'Rank', text: 'Bucket holders by return band, then grade each one by how its earlier calls aged.', fields: ['return band', 'supply share', 'hit rate', 'sample size'] },
  { icon: 'filter', title: 'Filter', text: 'Set the noise aside: tiny balances, free arrivals and contract plumbing stay listed but never move a headline figure.', fields: ['excluded count', 'reason'] },
];

export function initMethod() {
  const tabs = document.getElementById('stages');
  const panel = document.getElementById('stage-panel');
  const rail = document.getElementById('rail');
  tabs.innerHTML = STAGES.map((s, i) => `
    <button class="station" type="button" role="tab" id="st-${i}" aria-controls="stage-panel" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-reveal>
      <span class="station__n">0${i + 1}</span>
      ${pixelIcon(s.icon, 32)}
      <span class="station__t">${s.title}</span>
    </button>`).join('');
  const buttons = [...tabs.querySelectorAll('.station')];
  let cur = -1;
  let hold = 0;
  let inView = true;

  function show(i, user) {
    if (i === cur) return;
    cur = i;
    const s = STAGES[i];
    buttons.forEach((b, j) => {
      b.setAttribute('aria-selected', String(j === i));
      b.tabIndex = j === i ? 0 : -1;
    });
    rail.style.setProperty('--p', String(i / (STAGES.length - 1)));
    rail.style.setProperty('--n', String(i));
    panel.setAttribute('aria-labelledby', `st-${i}`);
    panel.classList.remove('is-swap');
    void panel.offsetWidth;
    panel.classList.add('is-swap');
    panel.innerHTML = `
      <p class="panel__text">${s.text}</p>
      <ul class="panel__fields" aria-label="Fields produced">${s.fields.map((f) => `<li>${f}</li>`).join('')}</ul>`;
    if (user && hold !== Infinity) hold = Date.now() + ms(9000);
  }

  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('.station');
    if (b) show(buttons.indexOf(b), true);
  });
  tabs.addEventListener('keydown', (e) => {
    const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!k) return;
    e.preventDefault();
    const n = (cur + k + STAGES.length) % STAGES.length;
    show(n, true);
    buttons[n].focus();
  });
  ['pointerenter', 'focusin'].forEach((ev) => tabs.parentElement.addEventListener(ev, () => (hold = Infinity)));
  ['pointerleave', 'focusout'].forEach((ev) => tabs.parentElement.addEventListener(ev, () => (hold = Date.now() + ms(1500))));
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((e) => (inView = e[0].isIntersecting), { threshold: 0.2 }).observe(tabs);
  }

  show(0, false);
  setInterval(() => {
    if (reduced() || !inView || document.hidden || Date.now() < hold) return;
    show((cur + 1) % STAGES.length, false);
  }, ms(2600));
}
