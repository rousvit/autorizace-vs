// Opakování v rozestupech (Leitnerovy přihrádky 0–5) a odhad připravenosti.

import * as store from './store.js';
import { todayKey } from './util.js';

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
// přihrádka → za jak dlouho otázku znovu zopakovat
export const INTERVALS = [2 * MIN, 1 * DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY];
// přihrádka → odhad pravděpodobnosti správné odpovědi v testu a/b/c
const P_BOX = [0.45, 0.62, 0.76, 0.86, 0.93, 0.97];
const P_NEW = 0.38;

export const GRADE = { BAD: 0, MID: 1, OK: 2 };

function fuzz(ms) {
  return ms < DAY ? ms : Math.round(ms * (0.9 + Math.random() * 0.2));
}

/**
 * Zaznamená odpověď. g: 0 = nevím / špatně, 1 = váhám, 2 = vím / správně.
 * source: 'card' (kartička – vybavení z hlavy), 'abc' nebo 'exam' (výběr ze tří, mohl to být tip).
 */
export function grade(id, g, source = 'card') {
  const now = Date.now();
  const p = { b: 0, n: 0, ok: 0, bad: 0, mid: 0, ...(store.progress(id) || {}) };
  const isNew = !p.n;
  if (source === 'card' && !p.fc) p.fc = now;
  if (g === GRADE.OK) {
    p.b = isNew ? (source === 'card' ? 2 : 1) : Math.min(5, p.b + 1);
    p.due = now + fuzz(INTERVALS[p.b]);
    p.ok++;
  } else if (g === GRADE.MID) {
    p.b = Math.max(1, Math.min(p.b, 2));
    p.due = now + fuzz(INTERVALS[p.b] / 2);
    p.mid++;
  } else {
    p.b = 0;
    p.due = now + INTERVALS[0];
    p.bad++;
  }
  if (isNew) p.first = now;
  p.n++;
  p.last = now;
  p.lastG = g;
  store.setProgress(id, p);

  const days = store.get().days;
  const key = todayKey();
  const d = days[key] || (days[key] = { n: 0, ok: 0 });
  d.n++;
  if (g === GRADE.OK) d.ok++;
  store.save();
  return p;
}

export function status(id) {
  const p = store.progress(id);
  if (!p || !p.n) return 'new';
  if (p.b >= 4) return 'mastered';
  if (p.b >= 2) return 'known';
  return 'learning';
}

export const STATUS_LABEL = { new: 'Nové', learning: 'Učím se', known: 'Umím', mastered: 'Zvládnuto' };

export function isDue(id, now = Date.now()) {
  const p = store.progress(id);
  return !!(p && p.n && (p.due || 0) <= now);
}

export function breakdown(questions) {
  const r = { new: 0, learning: 0, known: 0, mastered: 0, total: questions.length, due: 0 };
  const now = Date.now();
  for (const q of questions) {
    r[status(q.id)]++;
    if (isDue(q.id, now)) r.due++;
  }
  return r;
}

/** Kolik nových kartiček už dnes přibylo (do denního limitu se počítají jen kartičky). */
export function newSeenToday() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  let n = 0;
  for (const p of Object.values(store.get().progress)) if (p.fc && p.fc >= start.getTime() && p.first >= start.getTime()) n++;
  return n;
}

/** Fronta kartiček: nejdřív otázky k opakování, pak nové (s denním limitem). */
export function buildQueue(questions, { size, newLimit, extra = false }) {
  const now = Date.now();
  const due = [];
  const fresh = [];
  const ahead = [];
  for (const q of questions) {
    const p = store.progress(q.id);
    if (!p || !p.n) fresh.push(q);
    else if ((p.due || 0) <= now) due.push(q);
    else ahead.push(q);
  }
  due.sort((a, b) => (store.progress(a.id).due || 0) - (store.progress(b.id).due || 0));
  const newLeft = Math.max(0, newLimit - newSeenToday());
  const queue = due.slice(0, size);
  const takeNew = extra ? size - queue.length : Math.min(size - queue.length, newLeft);
  queue.push(...fresh.slice(0, Math.max(0, takeNew)));
  if (extra && queue.length < size) {
    ahead.sort((a, b) => store.progress(a.id).b - store.progress(b.id).b || (store.progress(a.id).due || 0) - (store.progress(b.id).due || 0));
    queue.push(...ahead.slice(0, size - queue.length));
  }
  return { queue, due: due.length, fresh: fresh.length, newLeft, ahead: ahead.length };
}

export function pCorrect(id) {
  const p = store.progress(id);
  if (!p || !p.n) return P_NEW;
  return P_BOX[Math.max(0, Math.min(5, p.b))];
}

function binomAtLeast(n, p, k) {
  // P(X >= k) pro X ~ Bi(n, p)
  let sum = 0;
  let c = 1;
  for (let i = 0; i <= n; i++) {
    if (i > 0) c = (c * (n - i + 1)) / i;
    if (i >= k) sum += c * p ** i * (1 - p) ** (n - i);
  }
  return sum;
}

/** Odhad výsledku testu: 20 obecných (≥ 16) + 10 oborových (≥ 8). */
export function readiness(general, specific) {
  const avg = (qs) => (qs.length ? qs.reduce((s, q) => s + pCorrect(q.id), 0) / qs.length : 0);
  const pg = avg(general);
  const ps = avg(specific);
  const passG = binomAtLeast(20, pg, 16);
  const passS = binomAtLeast(10, ps, 8);
  return { pg, ps, expG: 20 * pg, expS: 10 * ps, passG, passS, pass: passG * passS };
}

/** Počet dní v řadě, kdy bylo něco zopakováno (dnešek se počítá, i když ještě nezačal). */
export function streak() {
  const days = store.get().days;
  let n = 0;
  const d = new Date();
  if (!days[todayKey(d)]) d.setDate(d.getDate() - 1);
  while (days[todayKey(d)] && days[todayKey(d)].n > 0) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
