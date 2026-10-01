// Načtení otázek a předpisů, rozsahy (scope) a vyhledávání.

import * as store from './store.js';
import { norm, shuffle } from './util.js';

let DB = null;
let lawsPromise = null;
let LAWS = null;

export async function loadQuestions() {
  const res = await fetch('data/questions.json');
  if (!res.ok) throw new Error(`Nepodařilo se načíst otázky (${res.status}).`);
  DB = await res.json();
  DB.byId = new Map(DB.questions.map((q) => [q.id, q]));
  DB.general = DB.questions.filter((q) => q.part === 'obecna');
  DB.specific = DB.questions.filter((q) => q.part === 'oborova');
  DB.byOkruh = {};
  for (const q of DB.questions) {
    (DB.byOkruh[q.okruh] ||= []).push(q);
    q._s = norm(`${q.id} ${q.q} ${q.a} ${q.src}`);
  }
  return DB;
}

export const db = () => DB;
export const question = (id) => DB.byId.get(id);

export function loadLaws() {
  if (!lawsPromise) {
    lawsPromise = fetch('data/laws.json')
      .then((r) => { if (!r.ok) throw new Error(`Předpisy se nepodařilo načíst (${r.status}).`); return r.json(); })
      .then((j) => (LAWS = j))
      .catch((e) => { lawsPromise = null; throw e; });
  }
  return lawsPromise;
}
export const laws = () => LAWS;

/** Rozsahy otázek pro učení a procvičování. */
export function scopes() {
  const s = [
    { key: 'all', label: 'Všechny otázky', sub: 'obecná i oborová část' },
    { key: 'obecna', label: 'Obecná část', sub: '20 otázek v testu' },
    { key: 'oborova', label: 'Oborová část VS', sub: '10 otázek v testu' },
  ];
  for (const [k, name] of Object.entries(DB.okruhy)) s.push({ key: `okruh:${k}`, label: `${k} – ${name}`, sub: '' });
  s.push({ key: 'star', label: 'Označené hvězdičkou', sub: '' });
  s.push({ key: 'wrong', label: 'Chybované', sub: 'naposledy špatně nebo „nevím“' });
  return s;
}

export function scopeLabel(key) {
  if (key && key.startsWith('ids:')) return 'Vybrané otázky';
  const s = scopes().find((x) => x.key === key);
  return s ? s.label : 'Všechny otázky';
}

export function scope(key) {
  const all = DB.questions;
  if (!key || key === 'all') return all;
  if (key === 'obecna') return DB.general;
  if (key === 'oborova') return DB.specific;
  if (key.startsWith('okruh:')) return DB.byOkruh[key.slice(6)] || [];
  if (key === 'star') return all.filter((q) => store.progress(q.id)?.star);
  if (key === 'wrong') {
    return all.filter((q) => {
      const p = store.progress(q.id);
      return p && p.n && (p.lastG === 0 || (p.bad > 0 && p.b < 2));
    });
  }
  if (key.startsWith('ids:')) return key.slice(4).split(',').map((id) => DB.byId.get(id)).filter(Boolean);
  return all;
}

// Hrubé „kmenování“ kvůli skloňování: ochranné/ochranná → ochran, pásmo/pásma → pásm.
const stem = (w) => {
  if (w.length >= 7) return w.slice(0, -2);
  if (w.length >= 5 || (w.length === 4 && /[aeiouy]$/.test(w))) return w.slice(0, -1);
  return w;
};

export function search(query) {
  const words = norm(query).split(/\s+/).filter(Boolean).map((w) => (/^\d/.test(w) ? w : stem(w)));
  if (!words.length) return [];
  return DB.questions.filter((q) => words.every((w) => q._s.includes(w)));
}

/** Možnosti a/b/c v náhodném pořadí: [{ text, correct }] */
export function options(q, order) {
  if (!q.d || q.d.length < 2) return null;
  const opts = [{ text: q.a, correct: true }, { text: q.d[0], correct: false }, { text: q.d[1], correct: false }];
  if (order) return order.map((i) => opts[i]);
  return shuffle(opts);
}

export function randomOrder() {
  return shuffle([0, 1, 2]);
}
