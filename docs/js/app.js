// Start aplikace, směrování podle #hash, horní lišta, spodní navigace, service worker.

import * as data from './data.js';
import * as store from './store.js';
import { navigate, setFocusMode, setInstallEvent } from './nav.js';
import { closeSheet, h, toast } from './util.js';
import * as home from './views/home.js';
import * as learn from './views/learn.js';
import * as exam from './views/exam.js';
import * as topics from './views/topics.js';
import * as lawsView from './views/laws.js';
import * as settings from './views/settings.js';

const view = document.getElementById('view');
const backBtn = document.getElementById('back-btn');
const settingsBtn = document.getElementById('settings-btn');
let cleanup = null;
let navCount = 0;

// cesta → [vykreslení, záložka, nadřazená cesta]
const ROUTES = [
  [/^\/?$/, home.render, 'home', null],
  [/^\/uceni$/, learn.menu, 'learn', null],
  [/^\/karticky$/, learn.flashcards, 'learn', '#/uceni'],
  [/^\/procvicovani$/, learn.practice, 'learn', '#/uceni'],
  [/^\/zkouska$/, exam.start, 'exam', null],
  [/^\/zkouska\/test$/, exam.run, 'exam', '#/zkouska'],
  [/^\/zkouska\/vysledek\/(\d+)$/, exam.result, 'exam', '#/zkouska'],
  [/^\/okruhy$/, topics.list, 'topics', null],
  [/^\/okruh\/([A-Z+]+)$/, topics.okruh, 'topics', '#/okruhy'],
  [/^\/otazka\/([^/]+)$/, topics.detail, 'topics', '#/okruhy'],
  [/^\/predpisy$/, lawsView.list, 'laws', null],
  [/^\/predpis\/([^/]+)$/, lawsView.detail, 'laws', '#/predpisy'],
  [/^\/nastaveni$/, settings.render, null, '#/'],
];

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  return { path: decodeURIComponent(path), params: new URLSearchParams(qs || '') };
}

function route() {
  navCount++;
  closeSheet();
  if (cleanup) { try { cleanup(); } catch (e) { /* ignore */ } cleanup = null; }
  setFocusMode(false);
  const { path, params } = parseHash();
  let match = null;
  for (const [re, fn, tab, parent] of ROUTES) {
    const m = path.match(re);
    if (m) { match = { fn, tab, parent, args: m.slice(1) }; break; }
  }
  if (!match) match = { fn: home.render, tab: 'home', parent: null, args: [] };

  document.querySelectorAll('.tabbar a').forEach((a) => {
    const on = a.dataset.tab === match.tab;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  backBtn.hidden = !match.parent;
  backBtn.onclick = () => {
    if (navCount > 1) history.back();
    else navigate(match.parent, true);
  };
  settingsBtn.hidden = path === '/nastaveni';

  view.replaceChildren();
  window.scrollTo(0, 0);
  try {
    const res = match.fn(view, ...match.args, params);
    if (typeof res === 'function') cleanup = res;
  } catch (e) {
    console.error(e);
    view.replaceChildren(h('div', { class: 'card' }, h('h2', null, 'Něco se pokazilo'), h('p', { class: 'muted' }, String(e.message || e))));
  }
  view.focus({ preventScroll: true });
}

export function applyTheme() {
  const t = store.settings().theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  // při vývoji na localhostu mezipaměť překáží; offline režim jde zkusit přes ?sw
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !location.search.includes('sw')) return;
  let refreshing = false;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // při úplně první instalaci se nic nemění, obnovujeme jen po aktualizaci
    if (refreshing || !hadController) return;
    refreshing = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const offer = (worker) => toast('Je k dispozici nová verze aplikace.', {
      label: 'Aktualizovat',
      run: () => worker.postMessage('skipWaiting'),
    });
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
      });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(() => { /* bez service workeru jen nepojede offline */ });
}

async function boot() {
  store.load();
  applyTheme();
  addEventListener('settings-changed', applyTheme);
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); setInstallEvent(e); });
  try {
    await data.loadQuestions();
  } catch (e) {
    view.replaceChildren(h('div', { class: 'card' },
      h('h2', null, 'Otázky se nepodařilo načíst'),
      h('p', { class: 'muted' }, 'Při prvním spuštění je potřeba připojení k internetu. Potom už aplikace funguje i offline.'),
      h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Zkusit znovu')));
    return;
  }
  if (!store.isAvailable()) toast('Prohlížeč nepovoluje ukládání – postup se po zavření ztratí.');
  store.requestPersistence();
  addEventListener('hashchange', route);
  route();
  registerSW();
  // texty předpisů načíst na pozadí, ať jsou po ruce i offline
  setTimeout(() => data.loadLaws().catch(() => {}), 1500);
}

boot();
