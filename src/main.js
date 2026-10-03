import '@fontsource/tiny5/latin-400.css';
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow-semi-condensed/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/motion.css';

import { REGISTER } from './data/registry.js';
import { isStated } from './lib/register.js';
import { startFeeds, state, subscribe } from './live/feeds.js';
import { renderCa, renderSocials, bindPill } from './ui/header.js';
import { bindStats } from './ui/stats.js';
import { bindChart } from './ui/chart.js';
import { bindPairs } from './ui/pairs.js';
import { initMethod } from './ui/method.js';
import { initReveal, initScroll } from './ui/motion.js';
import { pixelIcon } from './ui/icons.js';

const CARDS = [
  { icon: 'pyramid', title: 'Who holds the bag', text: 'Concentration first: how much float is held by a handful of addresses, and for how long they have been parked there.' },
  { icon: 'arrow', title: 'Ahead or behind', text: 'Place each holder on one return scale, built from cost, proceeds and whatever position is still open.' },
  { icon: 'trail', title: 'Follow the wallet trail', text: 'Carry an address through all the tokens it has touched, so its past is on the table before its next move.' },
  { icon: 'bars', title: 'Weigh the evidence', text: 'A figure means little without its footing. Every figure lists the count of addresses behind it.' },
];

document.getElementById('cards').innerHTML = CARDS.map((c) => `
  <article class="card q" data-reveal>
    <span class="q__icon">${pixelIcon(c.icon, 40)}</span>
    <h3 class="q__t">${c.title}</h3>
    <p class="q__p">${c.text}</p>
  </article>`).join('');

const phase = document.getElementById('phase');
if (isStated(REGISTER.phase)) phase.textContent = REGISTER.phase.value;

renderCa();
renderSocials();
bindPill(state, subscribe);
bindStats(state, subscribe);
bindChart(state, subscribe);
bindPairs(state, subscribe);
initMethod();
initReveal();
initScroll();
startFeeds();
