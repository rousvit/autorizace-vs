// Zkouška nanečisto: 20 obecných + 10 oborových otázek a/b/c, 30 minut, hodnocení podle pokynů AR ČKAIT.

import * as data from '../data.js';
import * as store from '../store.js';
import * as srs from '../srs.js';
import { emptyState, qMeta } from '../components.js';
import { navigate, setFocusMode, setTitle } from '../nav.js';
import { add, fill, confirmBox, count, fmtDateTime, fmtDuration, h, icon, shuffle, toast } from '../util.js';

const LIMIT = 30 * 60 * 1000;
const LETTERS = ['a', 'b', 'c'];
const PARTS = [
  { key: 'obecna', label: 'Obecná část', n: 20, pass: 16, mid: 11 },
  { key: 'oborova', label: 'Oborová část', n: 10, pass: 8, mid: 6 },
];
const VERDICT = {
  ok: { label: 'Vyhověl', cls: 'ok', text: 'Písemná část by byla splněna a zkouška by pokračovala ústní částí.' },
  mid: { label: 'Doplňující otázky', cls: 'warn', text: 'Výsledek 51–79 %: před komisí by následovaly doplňující ústní otázky z oblastí, kde byly chyby.' },
  bad: { label: 'Nevyhověl', cls: 'bad', text: 'Výsledek 50 % a méně v některé části: písemná část by nebyla splněna a zkouška by skončila.' },
};

/** Poměrné rozdělení počtu otázek mezi okruhy (každý větší okruh aspoň jednou). */
function allocate(pool, n) {
  const groups = {};
  for (const q of pool) (groups[q.okruh] ||= []).push(q);
  const keys = Object.keys(groups);
  const total = pool.length;
  const quota = Object.fromEntries(keys.map((k) => [k, (groups[k].length / total) * n]));
  const alloc = Object.fromEntries(keys.map((k) => [k, Math.floor(quota[k])]));
  for (const k of keys) if (alloc[k] === 0 && groups[k].length >= 5) alloc[k] = 1;
  let used = Object.values(alloc).reduce((a, b) => a + b, 0);
  const byRemainder = shuffle(keys).sort((a, b) => (quota[b] - Math.floor(quota[b])) - (quota[a] - Math.floor(quota[a])));
  for (const k of byRemainder) {
    if (used >= n) break;
    if (alloc[k] < groups[k].length && quota[k] - alloc[k] > 0) { alloc[k]++; used++; }
  }
  while (used > n) {
    const k = keys.filter((x) => alloc[x] > 1).sort((a, b) => alloc[b] - alloc[a])[0];
    alloc[k]--; used--;
  }
  while (used < n) {
    const k = shuffle(keys).find((x) => alloc[x] < groups[x].length);
    alloc[k]++; used++;
  }
  const picked = [];
  for (const k of keys) picked.push(...shuffle(groups[k]).slice(0, alloc[k]));
  const order = Object.keys(data.db().okruhy);
  return picked.sort((a, b) => order.indexOf(a.okruh) - order.indexOf(b.okruh) || a.num - b.num);
}

function ready() {
  const D = data.db();
  const usable = (qs) => qs.filter((q) => q.d && q.d.length >= 2).length;
  return usable(D.general) >= 20 && usable(D.specific) >= 10;
}

export function newExam() {
  const D = data.db();
  const usable = (qs) => qs.filter((q) => q.d && q.d.length >= 2);
  const items = [
    ...allocate(usable(D.general), 20).map((q) => ({ id: q.id, part: 'obecna', order: data.randomOrder() })),
    ...allocate(usable(D.specific), 10).map((q) => ({ id: q.id, part: 'oborova', order: data.randomOrder() })),
  ];
  return { started: Date.now(), limit: LIMIT, items, answers: {}, flags: {}, cur: 0 };
}

export function evaluate(exam) {
  const parts = {};
  for (const p of PARTS) parts[p.key] = 0;
  exam.items.forEach((it, i) => {
    const q = data.question(it.id);
    const a = exam.answers[i];
    if (q && a != null && it.order[a] === 0) parts[it.part]++;
  });
  const partVerdict = (score, p) => (score >= p.pass ? 'ok' : score >= p.mid ? 'mid' : 'bad');
  const vg = partVerdict(parts.obecna, PARTS[0]);
  const vs = partVerdict(parts.oborova, PARTS[1]);
  const verdict = vg === 'bad' || vs === 'bad' ? 'bad' : vg === 'mid' || vs === 'mid' ? 'mid' : 'ok';
  return { g: parts.obecna, s: parts.oborova, vg, vs, verdict };
}

function submit(exam, reason) {
  const ev = evaluate(exam);
  const now = Date.now();
  const entry = {
    at: exam.started,
    dur: Math.min(now - exam.started, exam.limit),
    g: ev.g, s: ev.s, vg: ev.vg, vs: ev.vs,
    verdict: ev.verdict, verdictLabel: VERDICT[ev.verdict].label,
    timeout: reason === 'timeout',
    items: exam.items.map((it, i) => ({ id: it.id, part: it.part, order: it.order, a: exam.answers[i] ?? null })),
  };
  // zkouška se počítá i do opakování: správně = vím, špatně nebo bez odpovědi = nevím
  entry.items.forEach((it) => srs.grade(it.id, it.a != null && it.order[it.a] === 0 ? srs.GRADE.OK : srs.GRADE.BAD, 'exam'));
  const st = store.get();
  st.exams.push(entry);
  if (st.exams.length > 60) st.exams.splice(0, st.exams.length - 60);
  st.exam = null;
  store.save(true);
  return st.exams.length - 1;
}

// --- úvod a historie --------------------------------------------------------------------------

export function start(view) {
  setTitle('Zkouška nanečisto');
  const st = store.get();
  if (st.exam && Date.now() - st.exam.started >= st.exam.limit) {
    const idx = submit(st.exam, 'timeout');
    toast('Čas rozpracované zkoušky vypršel – zkouška byla vyhodnocena.');
    navigate(`#/zkouska/vysledek/${idx}`, true);
    return;
  }
  if (st.exam) {
    const left = st.exam.limit - (Date.now() - st.exam.started);
    const answered = Object.keys(st.exam.answers).length;
    add(view, h('section', { class: 'card', style: 'border-color:var(--warn)' },
      h('h2', null, 'Rozpracovaná zkouška'),
      h('p', { class: 'muted' }, `Zodpovězeno ${answered} z ${st.exam.items.length}, zbývá ${fmtDuration(left)} min. Čas běží i při zavřené aplikaci.`),
      h('div', { class: 'grid-2' },
        h('button', { class: 'btn outline', onclick: async () => {
          if (await confirmBox('Zahodit zkoušku?', 'Rozpracovaná zkouška se smaže bez vyhodnocení.', 'Zahodit', true)) {
            st.exam = null; store.save(true); navigate('#/zkouska', true);
          }
        } }, 'Zahodit'),
        h('a', { class: 'btn primary', href: '#/zkouska/test' }, 'Pokračovat'))));
  }

  add(view, h('section', { class: 'card' },
    h('h2', null, 'Jako u písemné části zkoušky'),
    h('ul', { class: 'rules' },
      h('li', null, h('b', null, '30 otázek'), ': 20 z obecné části a 10 z oborové části VS'),
      h('li', null, 'u každé tři možnosti a/b/c, správná je vždy jen jedna'),
      h('li', null, h('b', null, 'časový limit 30 minut'), ', během testu se správné odpovědi neukazují'),
      h('li', null, 'každá část se hodnotí zvlášť: aspoň ', h('b', null, '80 %'), ' (16/20 a 8/10) = vyhověl, 51–79 % = doplňující ústní otázky, 50 % a méně = nevyhověl')),
    h('p', { class: 'note', style: 'margin:10px 0 14px' }, 'Otázky se losují z každého okruhu poměrně podle jeho velikosti, aby test pokryl co nejvíc právních oborů – podobně jako to dělá zkušební komise. Chybné varianty jsou neoficiální.'),
    st.exam ? null : ready() ? h('button', { class: 'btn primary block', onclick: () => {
      st.exam = newExam(); store.save(true); navigate('#/zkouska/test');
    } }, icon('clock'), 'Začít zkoušku') : h('p', { class: 'chip warn' }, 'Varianty a/b/c zatím nejsou k dispozici.')));

  const exams = st.exams;
  if (!exams.length) {
    add(view, h('div', { class: 'section-label' }, 'Historie'), h('div', { class: 'card flat' }, emptyState('Zatím žádná zkouška. První pokus ti ukáže, kde přidat.', 'exam')));
    return;
  }
  const passed = exams.filter((e) => e.verdict === 'ok').length;
  const avgG = exams.reduce((s, e) => s + e.g, 0) / exams.length;
  const avgS = exams.reduce((s, e) => s + e.s, 0) / exams.length;
  add(view, 
    h('div', { class: 'section-label' }, 'Historie'),
    h('section', { class: 'card' }, h('div', { class: 'grid-2', style: 'grid-template-columns:repeat(3,1fr)' },
      h('div', { class: 'score-part' }, h('b', null, `${passed}/${exams.length}`), h('span', { class: 'tiny muted' }, 'vyhověl')),
      h('div', { class: 'score-part' }, h('b', null, avgG.toFixed(1).replace('.', ',')), h('span', { class: 'tiny muted' }, 'průměr z 20')),
      h('div', { class: 'score-part' }, h('b', null, avgS.toFixed(1).replace('.', ',')), h('span', { class: 'tiny muted' }, 'průměr z 10')))),
    h('div', { class: 'list' }, exams.map((e, i) => ({ e, i })).reverse().map(({ e, i }) => h('a', { class: 'row-link', href: `#/zkouska/vysledek/${i}` },
      h('span', { class: 'txt' },
        h('span', { class: 't' }, `${e.g}/20 · ${e.s}/10`),
        h('span', { class: 's' }, `${fmtDateTime(e.at)} · ${fmtDuration(e.dur)} min${e.timeout ? ' · vypršel čas' : ''}`)),
      h('span', { class: `chip ${VERDICT[e.verdict].cls}` }, VERDICT[e.verdict].label),
      icon('chev', 'chev')))));
}

// --- průběh zkoušky ---------------------------------------------------------------------------

export function run(view) {
  const st = store.get();
  const exam = st.exam;
  if (!exam) { navigate('#/zkouska', true); return undefined; }
  setTitle('Zkouška');
  let timerId = null;
  let finished = false;

  const timeLeft = () => exam.limit - (Date.now() - exam.started);
  const end = (reason) => {
    if (finished) return;
    finished = true;
    clearInterval(timerId);
    const idx = submit(exam, reason);
    if (reason === 'timeout') toast('Čas vypršel – zkouška byla odevzdána.');
    navigate(`#/zkouska/vysledek/${idx}`, true);
  };
  if (timeLeft() <= 0) { end('timeout'); return undefined; }
  setFocusMode(true);

  const timerEl = h('span', { class: 'timer', role: 'timer', 'aria-label': 'Zbývající čas' });
  const paintTimer = () => {
    const left = timeLeft();
    timerEl.textContent = fmtDuration(left);
    timerEl.classList.toggle('low', left < 5 * 60 * 1000);
  };
  const tick = () => {
    if (finished) return;
    paintTimer();
    if (timeLeft() <= 0) end('timeout');
  };

  const finish = async () => {
    const unanswered = exam.items.length - Object.keys(exam.answers).length;
    const text = unanswered
      ? `Nezodpovězeno: ${count(unanswered, 'otázka', 'otázky', 'otázek')}. Ty se počítají jako špatně.`
      : 'Všechny otázky jsou zodpovězené.';
    if (!(await confirmBox('Odevzdat zkoušku?', text, 'Odevzdat'))) return;
    end('submit');
  };

  const go = (i) => {
    exam.cur = Math.max(0, Math.min(exam.items.length - 1, i));
    store.save();
    draw();
    window.scrollTo(0, 0);
  };

  const draw = () => {
    const i = exam.cur;
    const it = exam.items[i];
    const q = data.question(it.id);
    const opts = data.options(q, it.order);
    const part = PARTS.find((p) => p.key === it.part);
    const grid = h('div', { class: 'navgrid', role: 'navigation', 'aria-label': 'Přehled otázek' });
    exam.items.forEach((x, j) => {
      if (j === 0 || exam.items[j - 1].part !== x.part) {
        grid.append(h('div', { class: 'sep' }, PARTS.find((p) => p.key === x.part).label));
      }
      const cls = [exam.answers[j] != null ? 'ans' : '', j === i ? 'cur' : '', exam.flags[j] ? 'flag' : ''].join(' ');
      grid.append(h('button', { class: cls, onclick: () => go(j), 'aria-label': `Otázka ${j + 1}` }, String(j + 1)));
    });
    const flagBtn = h('button', { class: 'btn small outline', onclick: () => { exam.flags[i] = !exam.flags[i]; store.save(); draw(); } },
      icon('flag'), exam.flags[i] ? 'Označeno' : 'Označit');
    fill(view, 
      h('div', { class: 'exam-bar' },
        h('span', { class: 'grow small muted' }, `Otázka ${i + 1} / ${exam.items.length} · ${part.label}`),
        timerEl,
        h('button', { class: 'btn small primary', onclick: finish }, 'Odevzdat')),
      grid,
      h('section', { class: 'card' },
        h('div', { class: 'row between' }, qMeta(q, { status: false }), flagBtn),
        h('p', { class: 'q-text' }, q.q),
        h('div', { class: 'options' }, opts.map((o, k) => h('button', {
          class: `option${exam.answers[i] === k ? ' sel' : ''}`,
          'aria-pressed': String(exam.answers[i] === k),
          onclick: () => {
            if (exam.answers[i] === k) delete exam.answers[i];
            else exam.answers[i] = k;
            store.save();
            draw();
          },
        }, h('span', { class: 'letter' }, LETTERS[k]), h('span', null, o.text))))),
      h('div', { class: 'sticky-actions' },
        h('button', { class: 'btn outline', disabled: i === 0, onclick: () => go(i - 1) }, 'Předchozí'),
        i < exam.items.length - 1
          ? h('button', { class: 'btn primary', onclick: () => go(i + 1) }, 'Další')
          : h('button', { class: 'btn primary', onclick: finish }, 'Odevzdat')),
      h('p', { class: 'kbd-hint note center', style: 'margin-top:12px' }, 'A / B / C – odpověď · šipky – předchozí / další'));
    paintTimer();
  };

  const onKey = (e) => {
    if (finished || e.target.closest('input, textarea, select') || document.querySelector('.sheet')) return;
    const k = e.key.toLowerCase();
    const map = { a: 0, b: 1, c: 2 };
    if (k in map) {
      e.preventDefault();
      const i = exam.cur;
      if (exam.answers[i] === map[k]) delete exam.answers[i]; else exam.answers[i] = map[k];
      store.save();
      draw();
    } else if (k === 'arrowright') { e.preventDefault(); go(exam.cur + 1); }
    else if (k === 'arrowleft') { e.preventDefault(); go(exam.cur - 1); }
  };

  document.addEventListener('keydown', onKey);
  draw();
  timerId = setInterval(tick, 1000);
  return () => { clearInterval(timerId); document.removeEventListener('keydown', onKey); store.save(true); };
}

// --- výsledek ---------------------------------------------------------------------------------

export function result(view, idxStr) {
  setTitle('Výsledek zkoušky');
  const e = store.get().exams[Number(idxStr)];
  if (!e) { add(view, h('div', { class: 'card' }, emptyState('Výsledek nenalezen.'))); return; }
  const v = VERDICT[e.verdict];
  const partBox = (p, score, pv) => h('div', { class: 'score-part' },
    h('div', { class: 'small muted' }, p.label),
    h('b', { style: `color:var(--${VERDICT[pv].cls})` }, `${score} / ${p.n}`),
    h('div', { class: 'tiny muted' }, `${Math.round((100 * score) / p.n)} % · ${VERDICT[pv].label.toLowerCase()}`));
  add(view, 
    h('section', { class: `card verdict ${v.cls}` },
      h('div', { class: 'small muted' }, `${fmtDateTime(e.at)} · ${fmtDuration(e.dur)} min${e.timeout ? ' · vypršel čas' : ''}`),
      h('div', { class: 'big' }, v.label),
      h('p', { style: 'margin:6px 0 14px' }, v.text),
      h('div', { class: 'score-parts' }, partBox(PARTS[0], e.g, e.vg), partBox(PARTS[1], e.s, e.vs))));

  const wrong = e.items.filter((it) => !(it.a != null && it.order[it.a] === 0)).map((it) => it.id);
  add(view, h('div', { class: 'btn-col', style: 'margin-bottom:8px' },
    wrong.length ? h('a', { class: 'btn primary', href: `#/procvicovani?s=${encodeURIComponent(`ids:${wrong.join(',')}`)}` }, icon('redo'), `Procvičit chyby (${wrong.length})`) : null,
    h('a', { class: `btn ${wrong.length ? 'outline' : 'primary'}`, href: '#/zkouska' }, 'Nová zkouška')));

  for (const p of PARTS) {
    add(view, h('div', { class: 'section-label' }, p.label));
    const list = h('div', { class: 'list' });
    e.items.forEach((it, i) => {
      if (it.part !== p.key) return;
      const q = data.question(it.id);
      if (!q) return;
      const opts = data.options(q, it.order);
      const ok = it.a != null && it.order[it.a] === 0;
      list.append(h('a', { class: 'row-link', href: `#/otazka/${encodeURIComponent(q.id)}` },
        h('span', { class: 'code', style: `color:var(--${ok ? 'ok' : 'bad'})` }, icon(ok ? 'check' : 'x')),
        h('span', { class: 'txt' },
          h('span', { class: 't' }, `${i + 1}. ${q.q}`),
          ok ? h('span', { class: 's' }, `✓ ${q.a}`) : h('span', { class: 's' },
            h('span', { style: 'color:var(--bad)' }, it.a == null ? 'bez odpovědi' : `✗ ${LETTERS[it.a]}) ${opts[it.a].text}`),
            h('br'), h('span', { style: 'color:var(--ok)' }, `✓ ${q.a}`))),
        icon('chev', 'chev')));
    });
    add(view, list);
  }
}
