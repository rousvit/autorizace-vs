// Postup učení v localStorage (jen v tomto zařízení), se zálohou do souboru.

const KEY = 'avs.v1';
const SCHEMA = 1;

const DEFAULTS = () => ({
  v: SCHEMA,
  created: Date.now(),
  progress: {},   // id otázky → { b, due, n, ok, bad, mid, last, first, star }
  days: {},       // 'yyyy-mm-dd' → { n, ok }
  exams: [],      // historie zkoušek nanečisto
  exam: null,     // rozpracovaná zkouška
  settings: { theme: 'auto', examDate: '', newPerDay: 25, sessionSize: 20, practiceSize: 20 },
});

let state = DEFAULTS();
let available = true;
let timer = null;
const listeners = new Set();

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = merge(JSON.parse(raw));
  } catch (e) {
    available = false;
  }
  return state;
}

function merge(saved) {
  const base = DEFAULTS();
  if (!saved || typeof saved !== 'object') return base;
  return {
    ...base,
    ...saved,
    progress: saved.progress && typeof saved.progress === 'object' ? saved.progress : {},
    days: saved.days && typeof saved.days === 'object' ? saved.days : {},
    exams: Array.isArray(saved.exams) ? saved.exams : [],
    settings: { ...base.settings, ...(saved.settings || {}) },
  };
}

export const isAvailable = () => available;
export const get = () => state;
export const settings = () => state.settings;

export function save(immediate = false) {
  clearTimeout(timer);
  const write = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      available = true;
    } catch (e) {
      available = false;
    }
    listeners.forEach((fn) => fn());
  };
  if (immediate) write();
  else timer = setTimeout(write, 250);
}

export function onSave(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Uložit včas i při zavření nebo uspání aplikace.
addEventListener('pagehide', () => save(true));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(true); });

export function progress(id) {
  return state.progress[id];
}

export function setProgress(id, p) {
  state.progress[id] = p;
  save();
}

export function toggleStar(id) {
  const p = state.progress[id] || { b: 0, n: 0, ok: 0, bad: 0, mid: 0 };
  p.star = !p.star;
  state.progress[id] = p;
  save();
  return p.star;
}

export function setSetting(key, value) {
  state.settings[key] = value;
  save();
}

export function exportData() {
  return JSON.stringify({ app: 'autorizace-vs', exported: new Date().toISOString(), data: state }, null, 1);
}

export function importData(text) {
  const parsed = JSON.parse(text);
  const data = parsed && parsed.app === 'autorizace-vs' ? parsed.data : parsed;
  if (!data || typeof data !== 'object' || typeof data.progress !== 'object') {
    throw new Error('Soubor neobsahuje zálohu postupu z této aplikace.');
  }
  state = merge(data);
  save(true);
}

export function reset() {
  const keep = state.settings;
  state = DEFAULTS();
  state.settings = keep;
  save(true);
}

export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch (e) { /* nepodstatné */ }
}
