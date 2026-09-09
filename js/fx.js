// Transient visual effects. Every node is created, animated and removed here;
// nothing else in the app touches the effect layer.

import { playAnim } from './sprites.js';

const $ = (id) => document.getElementById(id);

let layer = null;
let arena = null;
let bannerEl = null;
let toastEl = null;
let toastTimer = 0;
const toastQueue = [];

export function init() {
  layer = $('fx-layer');
  arena = $('arena');
  bannerEl = $('level-banner');
  toastEl = $('toast');
}

const reduceMotion = () =>
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function spawn(node, ms) {
  if (!layer) return;
  layer.appendChild(node);
  const remove = () => { if (node.parentNode) node.parentNode.removeChild(node); };
  node.addEventListener('animationend', remove);
  setTimeout(remove, ms);
}

// Where an element sits inside the effect layer, in percent.
function anchorOf(el) {
  if (!el || !layer) return { x: 50, y: 45 };
  const a = el.getBoundingClientRect();
  const b = layer.getBoundingClientRect();
  if (!b.width || !b.height) return { x: 50, y: 45 };
  return {
    x: ((a.left + a.width / 2 - b.left) / b.width) * 100,
    y: ((a.top + a.height / 2 - b.top) / b.height) * 100,
  };
}

const RATING_TEXT = {
  excellent: 'EXZELLENT!',
  perfect: 'PERFEKT!',
  good: 'GUT!',
  slow: 'GESCHAFFT',
  wrong: 'FALSCH',
  timeout: 'ZEIT!',
};

export function ratingPopup(kind) {
  const node = document.createElement('div');
  node.className = 'rating-popup ' + kind;
  node.textContent = RATING_TEXT[kind] || kind;
  spawn(node, 1200);
}

export function damageNumber(amount, targetEl) {
  const pos = anchorOf(targetEl);
  const node = document.createElement('div');
  node.className = 'dmg-number' + (amount > 0 ? ' d' + amount : ' zero');
  node.textContent = amount > 0 ? '-' + amount : '0';
  node.style.left = pos.x + '%';
  node.style.top = pos.y + '%';
  spawn(node, 1000);
}

export function burst(targetEl, color, count) {
  if (reduceMotion()) return;
  const pos = anchorOf(targetEl);
  const n = count || 12;
  for (let i = 0; i < n; i++) {
    const node = document.createElement('div');
    node.className = 'particle';
    const angle = (Math.PI * 2 * i) / n + Math.random() * 0.4;
    const dist = 26 + Math.random() * 34;
    node.style.left = pos.x + '%';
    node.style.top = pos.y + '%';
    node.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
    node.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
    node.style.setProperty('--c', color || '#ffd45e');
    node.style.setProperty('--dur', 420 + Math.random() * 320 + 'ms');
    spawn(node, 900);
  }
}

export function shake(strength) {
  if (!arena || reduceMotion()) return;
  const cls = 'shake-' + Math.max(1, Math.min(3, strength));
  arena.classList.remove('shake-1', 'shake-2', 'shake-3');
  void arena.offsetWidth;
  arena.classList.add(cls);
  setTimeout(() => arena.classList.remove(cls), 420);
}

export const hitSprite = (el) => playAnim(el, 'hit', 500);
export const attackSprite = (el) => playAnim(el, 'attack', 450);

export function dieSprite(enemyEl) {
  if (!enemyEl) return Promise.resolve();
  enemyEl.classList.add('dying');
  return new Promise((resolve) => setTimeout(resolve, 900));
}

export function banner(text, sub, kind) {
  if (!bannerEl) return;
  bannerEl.className = kind ? kind : '';
  bannerEl.innerHTML = '';
  bannerEl.appendChild(document.createTextNode(text));
  if (sub) {
    const small = document.createElement('span');
    small.className = 'sub';
    small.textContent = sub;
    bannerEl.appendChild(small);
  }
  bannerEl.classList.remove('hidden');
  void bannerEl.offsetWidth;
  bannerEl.classList.add('show');
  setTimeout(() => {
    bannerEl.classList.remove('show');
    bannerEl.classList.add('hidden');
  }, 1800);
}

export function cardEffect(cardEl, cls, ms) {
  if (!cardEl) return;
  cardEl.classList.remove(cls);
  void cardEl.offsetWidth;
  cardEl.classList.add(cls);
  setTimeout(() => cardEl.classList.remove(cls), ms || 500);
}

export function tfStamp(cardEl, ok) {
  if (!cardEl) return;
  const node = document.createElement('div');
  node.className = 'tf-stamp ' + (ok ? 'ok' : 'no');
  node.textContent = ok ? '✓' : '✗';
  cardEl.appendChild(node);
  setTimeout(() => { if (node.parentNode) node.parentNode.removeChild(node); }, 800);
}

export function heartBreak(heartEl) {
  if (!heartEl) return;
  heartEl.classList.add('breaking');
  setTimeout(() => heartEl.classList.remove('breaking'), 700);
}

// Toasts queue up so two achievements at once are both readable.
function showNextToast() {
  if (!toastEl || toastQueue.length === 0) return;
  const item = toastQueue.shift();
  toastEl.innerHTML = '';
  const icon = document.createElement('div');
  icon.className = 'icon';
  icon.textContent = item.icon || '🏆';
  const body = document.createElement('div');
  const title = document.createElement('div');
  title.className = 't-title';
  title.textContent = item.title;
  const desc = document.createElement('div');
  desc.className = 't-desc';
  desc.textContent = item.desc;
  body.appendChild(title);
  body.appendChild(desc);
  toastEl.appendChild(icon);
  toastEl.appendChild(body);
  toastEl.classList.remove('hidden', 'leaving');
  void toastEl.offsetWidth;
  toastEl.classList.add('show');
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
    toastEl.classList.add('leaving');
    setTimeout(() => {
      toastEl.classList.add('hidden');
      toastEl.classList.remove('leaving');
      showNextToast();
    }, 300);
  }, 2600);
}

export function toast(item) {
  toastQueue.push(item);
  if (toastEl && toastEl.classList.contains('hidden')) showNextToast();
}

export function clearToasts() {
  toastQueue.length = 0;
  clearTimeout(toastTimer);
  if (toastEl) toastEl.classList.add('hidden');
}
