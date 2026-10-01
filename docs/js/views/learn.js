// Učení: výběr rozsahu, kartičky (otázka → odpověď → sebehodnocení) a procvičování a/b/c.

import * as data from '../data.js';
import * as store from '../store.js';
import * as srs from '../srs.js';
import { emptyState, noteBlock, progressBar, qMeta, questionRow, sourceBlock, starButton } from '../components.js';
import { navigate, setFocusMode, setTitle } from '../nav.js';
import { add, fill, count, h, icon, pct } from '../util.js';

const LETTERS = ['a', 'b', 'c'];

// --- výběr režimu a rozsahu ------------------------------------------------------------------

export function menu(view) {
  setTitle('Učení');
  let current = store.settings().lastScope || 'all';
  if (!data.scopes().some((s) => s.key === current)) current = 'all';

  const startCards = h('a', { class: 'btn primary block' }, icon('cards'), 'Začít kartičky');
  const startAbc = h('a', { class: 'btn ok block' }, icon('abc'), 'Začít procvičování');
  const scopeName = h('b', null);
  const update = () => {
    startCards.href = `#/karticky?s=${encodeURIComponent(current)}`;
    startAbc.href = `#/procvicovani?s=${encodeURIComponent(current)}`;
    scopeName.textContent = data.scopeLabel(current);
    list.querySelectorAll('[data-key]').forEach((el) => {
      const on = el.dataset.key === current;
      el.setAttribute('aria-pressed', String(on));
      el.style.background = on ? 'var(--primary-soft)' : '';
    });
  };

  const list = h('div', { class: 'list' }, data.scopes().map((s) => {
    const qs = data.scope(s.key);
    const b = srs.breakdown(qs);
    return h('button', {
      class: 'row-link', 'data-key': s.key, 'aria-pressed': 'false',
      onclick: () => { current = s.key; store.setSetting('lastScope', current); update(); },
    },
      h('span', { class: 'txt' },
        h('span', { class: 't' }, s.label),
        h('span', { class: 's' }, `${count(qs.length, 'otázka', 'otázky', 'otázek')}${b.due ? ` · ${b.due} k opakování` : ''}${s.sub ? ` · ${s.sub}` : ''}`),
        qs.length ? h('div', { style: 'margin-top:6px' }, progressBar(b)) : null));
  }));

  add(view, 
    h('section', { class: 'card' },
      h('div', { class: 'row', style: 'margin-bottom:8px' }, h('span', { class: 'okruh-letter' }, icon('cards')), h('h2', { style: 'margin:0' }, 'Kartičky')),
      h('p', { class: 'muted small' }, 'Přečti si otázku, zkus si odpověď vybavit a pak ji odkryj. Podle toho, jak dobře ji znáš, se otázka vrátí dřív, nebo později. Takhle se učivo dostane do dlouhodobé paměti.'),
      startCards),
    h('section', { class: 'card' },
      h('div', { class: 'row', style: 'margin-bottom:8px' }, h('span', { class: 'okruh-letter', style: 'background:var(--ok-soft);color:var(--ok)' }, icon('abc')), h('h2', { style: 'margin:0' }, 'Procvičování a/b/c')),
      h('p', { class: 'muted small' }, 'Stejný formát jako písemný test: ze tří odpovědí je správná jen jedna. Po každé otázce hned uvidíš vysvětlení a citovaný paragraf.'),
      startAbc),
    h('div', { class: 'section-label' }, h('span', null, 'Rozsah: '), scopeName),
    list,
  );
  update();
}

// --- kartičky ------------------------------------------------------------------------------

function intervalLabel(ms) {
  const min = ms / 60000;
  if (min < 60) return 'znovu teď';
  const hours = min / 60;
  if (hours < 24) return `za ${Math.round(hours)} h`;
  const days = Math.round(hours / 24);
  return `za ${count(days, 'den', 'dny', 'dní')}`;
}

function previews(id) {
  const p = store.progress(id);
  const isNew = !p || !p.n;
  const b = p ? p.b : 0;
  const okBox = isNew ? 2 : Math.min(5, b + 1);
  const midBox = Math.max(1, Math.min(b, 2));
  return ['znovu v tomto kole', intervalLabel(srs.INTERVALS[midBox] / 2), intervalLabel(srs.INTERVALS[okBox])];
}

export function flashcards(view, params) {
  setTitle('Kartičky');
  setFocusMode(true);
  const scopeKey = params.get('s') || 'all';
  const extra = params.get('x') === '1';
  const pool = data.scope(scopeKey);
  const s = store.settings();
  const built = srs.buildQueue(pool, { size: s.sessionSize, newLimit: s.newPerDay, extra });
  const queue = built.queue.slice();
  const requeued = new Map();
  const tally = [0, 0, 0];
  let idx = 0;
  let revealed = false;

  if (!queue.length) {
    const more = built.fresh + built.ahead;
    add(view, h('section', { class: 'card center' },
      emptyState(pool.length ? 'V tomto rozsahu máš pro dnešek hotovo. Výborně!' : 'V tomto rozsahu zatím nejsou žádné otázky.', 'check'),
      h('div', { class: 'btn-col' },
        more ? h('a', { class: 'btn primary', href: `#/karticky?s=${encodeURIComponent(scopeKey)}&x=1` }, 'Učit se navíc') : null,
        h('a', { class: 'btn outline', href: `#/procvicovani?s=${encodeURIComponent(scopeKey)}` }, 'Procvičit a/b/c'),
        h('a', { class: 'btn ghost', href: '#/uceni' }, 'Zpět na učení'))));
    return undefined;
  }

  const draw = () => {
    if (idx >= queue.length) return finish();
    const q = queue[idx];
    const total = queue.length;
    const card = h('section', { class: 'card flashcard' },
      h('div', { class: 'row between' }, qMeta(q), starButton(q.id)),
      h('p', { class: 'q-text' }, q.q));
    if (revealed) {
      add(card, 
        h('div', { class: 'answer' }, h('div', { class: 'lbl' }, 'Správná odpověď'), q.a),
        sourceBlock(q),
        noteBlock(q));
    }
    const pv = previews(q.id);
    const actions = revealed
      ? h('div', { class: 'sticky-actions' }, h('div', { class: 'grades', style: 'width:100%' },
        h('button', { class: 'btn g-bad', onclick: () => answer(0) }, 'Nevím', h('small', null, pv[0])),
        h('button', { class: 'btn g-mid', onclick: () => answer(1) }, 'Váhám', h('small', null, pv[1])),
        h('button', { class: 'btn g-ok', onclick: () => answer(2) }, 'Vím', h('small', null, pv[2]))))
      : h('div', { class: 'sticky-actions' }, h('button', { class: 'btn primary', onclick: reveal }, 'Ukázat odpověď'));
    fill(view, 
      h('div', { class: 'row between small muted', style: 'margin-bottom:6px' },
        h('span', null, data.scopeLabel(scopeKey)), h('span', null, `${Math.min(idx + 1, total)} / ${total}`)),
      h('div', { class: 'progress-line' }, h('i', { style: `width:${(100 * idx) / total}%` })),
      card,
      actions,
      h('p', { class: 'kbd-hint note center', style: 'margin-top:12px' }, revealed ? 'Klávesy 1 / 2 / 3 – nevím / váhám / vím' : 'Mezerník – ukázat odpověď'));
  };

  const reveal = () => { revealed = true; draw(); };
  const answer = (g) => {
    const q = queue[idx];
    srs.grade(q.id, g);
    tally[g]++;
    if (g === 0 && (requeued.get(q.id) || 0) < 2) {
      requeued.set(q.id, (requeued.get(q.id) || 0) + 1);
      queue.push(q);
    }
    idx++;
    revealed = false;
    draw();
    window.scrollTo(0, 0);
  };

  const finish = () => {
    setFocusMode(false);
    const done = tally[0] + tally[1] + tally[2];
    fill(view, h('section', { class: 'card center' },
      h('div', { class: 'okruh-letter', style: 'margin:6px auto 10px;background:var(--ok-soft);color:var(--ok)' }, icon('check')),
      h('h2', null, 'Kolo dokončeno'),
      h('p', { class: 'muted' }, `Zopakováno ${count(done, 'kartička', 'kartičky', 'kartiček')}.`),
      h('div', { class: 'grid-2', style: 'grid-template-columns:repeat(3,1fr);margin-bottom:14px' },
        stat('Vím', tally[2], 'ok'), stat('Váhám', tally[1], 'warn'), stat('Nevím', tally[0], 'bad')),
      h('div', { class: 'btn-col' },
        h('button', { class: 'btn primary', onclick: () => navigate(location.hash) }, 'Další kolo'),
        h('a', { class: 'btn outline', href: `#/procvicovani?s=${encodeURIComponent(scopeKey)}` }, 'Procvičit a/b/c'),
        h('a', { class: 'btn ghost', href: '#/' }, 'Přehled'))));
  };

  const onKey = (e) => {
    if (e.target.closest('input, textarea, select') || document.querySelector('.sheet')) return;
    if (idx >= queue.length) return;
    if (!revealed && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); reveal(); }
    else if (revealed && ['1', '2', '3'].includes(e.key)) { e.preventDefault(); answer(Number(e.key) - 1); }
  };
  document.addEventListener('keydown', onKey);
  draw();
  return () => document.removeEventListener('keydown', onKey);
}

function stat(label, n, cls) {
  return h('div', { class: 'score-part' }, h('b', { style: `color:var(--${cls})` }, String(n)), h('span', { class: 'small muted' }, label));
}

// --- procvičování a/b/c ----------------------------------------------------------------------

function weightedPick(pool, n) {
  // Efraimidis–Spirakis: přednost mají otázky, které ještě neumíš
  return pool
    .map((q) => ({ q, k: Math.random() ** (1 / Math.max(0.05, 1.15 - srs.pCorrect(q.id))) }))
    .sort((a, b) => b.k - a.k)
    .slice(0, n)
    .map((x) => x.q);
}

export function practice(view, params) {
  setTitle('Procvičování a/b/c');
  setFocusMode(true);
  const scopeKey = params.get('s') || 'all';
  const n = Number(params.get('n')) || store.settings().practiceSize;
  const pool = data.scope(scopeKey).filter((q) => q.d && q.d.length >= 2);
  if (!pool.length) {
    setFocusMode(false);
    add(view, h('section', { class: 'card' }, emptyState(scopeKey === 'wrong'
      ? 'Žádné chybované otázky. Paráda!'
      : 'V tomto rozsahu nejsou žádné otázky.', 'check'),
      h('a', { class: 'btn outline block', href: '#/uceni' }, 'Zpět na učení')));
    return undefined;
  }
  const items = (scopeKey.startsWith('ids:') ? pool : weightedPick(pool, Math.min(n, pool.length)))
    .map((q) => ({ q, opts: data.options(q) }));
  let idx = 0;
  let chosen = null;
  let score = 0;
  const mistakes = [];

  const draw = () => {
    if (idx >= items.length) return finish();
    const { q, opts } = items[idx];
    const answered = chosen !== null;
    const optionEls = opts.map((o, i) => {
      let cls = 'option';
      if (answered) {
        if (o.correct) cls += ' correct';
        else if (i === chosen) cls += ' wrong';
        else cls += ' dim';
      }
      return h('button', { class: cls, disabled: answered, onclick: () => pick(i) },
        h('span', { class: 'letter' }, LETTERS[i]), h('span', null, o.text));
    });
    const card = h('section', { class: 'card' },
      h('div', { class: 'row between' }, qMeta(q), starButton(q.id)),
      h('p', { class: 'q-text' }, q.q),
      h('div', { class: 'options' }, optionEls));
    if (answered) {
      const ok = opts[chosen].correct;
      add(card, 
        h('div', { class: `feedback ${ok ? 'ok' : 'bad'}` }, icon(ok ? 'check' : 'x'), ok ? 'Správně' : 'Špatně'),
        sourceBlock(q),
        noteBlock(q),
        h('p', { class: 'note', style: 'margin:10px 0 0' }, 'Chybné varianty nejsou oficiální – vytvořila je aplikace, aby šlo trénovat formát a/b/c.'));
    }
    fill(view, 
      h('div', { class: 'row between small muted', style: 'margin-bottom:6px' },
        h('span', null, data.scopeLabel(scopeKey)), h('span', null, `${idx + 1} / ${items.length} · ${score} správně`)),
      h('div', { class: 'progress-line' }, h('i', { style: `width:${(100 * idx) / items.length}%` })),
      card,
      answered ? h('div', { class: 'sticky-actions' }, h('button', { class: 'btn primary', onclick: next }, idx + 1 < items.length ? 'Další otázka' : 'Výsledek')) : null,
      h('p', { class: 'kbd-hint note center', style: 'margin-top:12px' }, answered ? 'Enter – další otázka' : 'Klávesy A / B / C nebo 1 / 2 / 3'));
  };

  const pick = (i) => {
    if (chosen !== null) return;
    chosen = i;
    const { q, opts } = items[idx];
    const ok = opts[i].correct;
    srs.grade(q.id, ok ? srs.GRADE.OK : srs.GRADE.BAD, 'abc');
    if (ok) score++;
    else mistakes.push(q);
    draw();
  };
  const next = () => { idx++; chosen = null; draw(); window.scrollTo(0, 0); };

  const finish = () => {
    setFocusMode(false);
    const total = items.length;
    fill(view, 
      h('section', { class: `card verdict ${score / total >= 0.8 ? 'ok' : score / total > 0.5 ? 'warn' : 'bad'}` },
        h('div', { class: 'small muted' }, data.scopeLabel(scopeKey)),
        h('div', { class: 'big' }, `${score} / ${total}`),
        h('div', null, `${pct(score / total)} správně`)),
      mistakes.length ? h('div', { class: 'section-label' }, 'Chyby k zopakování') : null,
      mistakes.length ? h('div', { class: 'list' }, mistakes.map((q) => questionRow(q))) : null,
      h('div', { class: 'btn-col' },
        mistakes.length ? h('a', { class: 'btn primary', href: `#/procvicovani?s=${encodeURIComponent(`ids:${mistakes.map((q) => q.id).join(',')}`)}` }, icon('redo'), 'Procvičit chyby znovu') : null,
        h('button', { class: `btn ${mistakes.length ? 'outline' : 'primary'}`, onclick: () => navigate(location.hash) }, 'Nové kolo'),
        h('a', { class: 'btn ghost', href: '#/uceni' }, 'Zpět na učení')));
  };

  const onKey = (e) => {
    if (e.target.closest('input, textarea, select') || document.querySelector('.sheet')) return;
    if (idx >= items.length) return;
    const k = e.key.toLowerCase();
    if (chosen === null) {
      const i = { a: 0, b: 1, c: 2, 1: 0, 2: 1, 3: 2 }[k];
      if (i !== undefined) { e.preventDefault(); pick(i); }
    } else if (k === 'enter' || k === ' ') { e.preventDefault(); next(); }
  };
  document.addEventListener('keydown', onKey);
  draw();
  return () => document.removeEventListener('keydown', onKey);
}
