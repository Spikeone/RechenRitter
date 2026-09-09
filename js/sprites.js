// Turns a manifest entry into a DOM element. The 32rogues sheets have no
// animation frames, so a sprite is one tile of a sheet shown via
// background-position; all motion comes from the CSS classes in effects.css.

import { SHEETS, TILE, PLAYERS, ENEMIES } from '../assets/sprites/manifest.js';

const failedSheets = new Set();

// Placeholder tint per sprite id, so a missing sheet still gives distinct blocks.
function tintFor(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) % 360;
  return 'hsl(' + hash + ', 55%, 55%)';
}

// Warms the browser cache and detects a missing sheet once, up front.
export function preloadSheets() {
  return Promise.all(Object.keys(SHEETS).map((key) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => { failedSheets.add(key); resolve(false); };
    img.src = SHEETS[key].file;
  })));
}

export function createSprite(id, options) {
  const opts = options || {};
  const def = opts.def || PLAYERS[id] || ENEMIES[id] || null;
  const el = document.createElement('div');
  el.className = 'sprite';
  el.dataset.sprite = id;

  const sheet = def ? SHEETS[def.sheet] : null;
  if (!def || !sheet || failedSheets.has(def.sheet)) {
    el.classList.add('placeholder');
    el.style.setProperty('--c', tintFor(id || 'x'));
  } else {
    // The element is as big as the drawn sprite and the sheet is scaled with it.
    // Using transform: scale() instead would leave a 32px layout box, and the
    // sprite would spill over the name and health bar around it.
    el.style.backgroundImage = 'url("' + sheet.file + '")';
    el.style.backgroundSize = 'calc(' + (sheet.cols * TILE) + 'px * var(--sprite-scale)) '
      + 'calc(' + (sheet.rows * TILE) + 'px * var(--sprite-scale))';
    el.style.backgroundPosition = 'calc(' + (-def.col * TILE) + 'px * var(--sprite-scale)) '
      + 'calc(' + (-def.row * TILE) + 'px * var(--sprite-scale))';
    // Enemies stand on the right and must look left; sheets differ in the
    // direction their art already faces.
    const wantsLeft = opts.faceLeft === true;
    if (wantsLeft !== !!sheet.facesLeft) el.classList.add('flip');
  }

  if (opts.idle !== false) el.classList.add('anim-idle');
  return el;
}

// Plays a one-shot class and resolves when it is over, so callers can sequence.
export function playAnim(el, name, fallbackMs) {
  if (!el) return Promise.resolve();
  const cls = 'anim-' + name;
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.classList.remove(cls);
      el.removeEventListener('animationend', onEnd);
      resolve();
    };
    const onEnd = (ev) => { if (ev.target === el) finish(); };
    el.classList.remove(cls);
    // Force a reflow so replaying the same class restarts the animation.
    void el.offsetWidth;
    el.addEventListener('animationend', onEnd);
    el.classList.add(cls);
    setTimeout(finish, fallbackMs || 700);
  });
}

export const displayName = (id) => {
  const def = PLAYERS[id] || ENEMIES[id];
  return def ? def.name : id;
};
