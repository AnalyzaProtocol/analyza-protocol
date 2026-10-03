import { ms, reduced } from '../lib/clock.js';

const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

// Tween a number into an element. `el.__v` remembers the last shown value so a change
// animates from where the figure actually was.
export function countTo(el, to, format, { dur = 1200 } = {}) {
  const from = el.__v ?? 0;
  el.__v = to;
  cancelAnimationFrame(el.__raf);
  if (reduced() || from === to) {
    el.textContent = format(to);
    return;
  }
  const span = ms(dur);
  const t0 = performance.now();
  const step = (now) => {
    const k = easeOutExpo(Math.min(1, (now - t0) / span));
    el.textContent = format(from + (to - from) * k);
    if (k < 1) el.__raf = requestAnimationFrame(step);
  };
  el.__raf = requestAnimationFrame(step);
}

export function flash(el) {
  if (reduced()) return;
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

export function onceVisible(el, fn, margin = '0px 0px -8% 0px') {
  if (!('IntersectionObserver' in window)) return fn();
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      io.disconnect();
      fn();
    }
  }, { rootMargin: margin });
  io.observe(el);
}

// Scroll reveal with staggering: siblings inside a [data-stagger] group get --i = index.
export function initReveal() {
  document.querySelectorAll('[data-stagger]').forEach((group) => {
    [...group.querySelectorAll(':scope > [data-reveal]')].forEach((el, i) => el.style.setProperty('--i', i));
  });
  const items = [...document.querySelectorAll('[data-reveal]')];
  if (reduced() || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      }
    }
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
  items.forEach((el) => io.observe(el));
}

// Scroll progress bar + parallax share one rAF-throttled scroll handler.
export function initScroll() {
  const bar = document.querySelector('#progress > i');
  const layers = [...document.querySelectorAll('[data-depth]')];
  let queued = false;
  const paint = () => {
    queued = false;
    const y = window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (bar) bar.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
    if (reduced()) {
      layers.forEach((l) => (l.style.transform = ''));
      return;
    }
    for (const l of layers) {
      if (y < window.innerHeight * 1.6) l.style.transform = `translate3d(0, ${(y * Number(l.dataset.depth)).toFixed(1)}px, 0)`;
    }
  };
  const queue = () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(paint);
    }
  };
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue, { passive: true });
  paint();
}
