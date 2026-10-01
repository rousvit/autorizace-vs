// Okruhy A–R, vyhledávání, seznam otázek a detail otázky.

import * as data from '../data.js';
import * as store from '../store.js';
import * as srs from '../srs.js';
import { emptyState, legend, noteBlock, progressBar, qMeta, questionRow, sourceBlock, starButton } from '../components.js';
import { setTitle } from '../nav.js';
import { add, fill, count, fmtDate, h, icon, pct } from '../util.js';

let lastQuery = '';

export function list(view) {
  setTitle('Okruhy');
  const D = data.db();
  const input = h('input', { type: 'search', placeholder: 'Hledat v otázkách, odpovědích, paragrafech…', 'aria-label': 'Hledat', value: lastQuery, enterkeyhint: 'search' });
  const results = h('div');
  const okruhy = h('div');

  const all = srs.breakdown(D.questions);
  okruhy.append(
    h('section', { class: 'card' },
      h('div', { class: 'row between', style: 'margin-bottom:8px' },
        h('b', null, 'Celkem'), h('span', { class: 'small muted' }, `${all.known + all.mastered} / ${all.total} umíš`)),
      progressBar(all), legend()),
    h('div', { class: 'list' }, Object.entries(D.okruhy).map(([k, name]) => {
      const qs = D.byOkruh[k];
      const b = srs.breakdown(qs);
      const gen = qs.filter((q) => q.part === 'obecna').length;
      const spec = qs.length - gen;
      const parts = [gen ? `${gen} obecných` : '', spec ? `${spec} oborových` : ''].filter(Boolean).join(', ');
      return h('a', { class: 'row-link', href: `#/okruh/${k}` },
        h('span', { class: 'okruh-letter' }, k),
        h('span', { class: 'txt' },
          h('span', { class: 't' }, name),
          h('span', { class: 's' }, `${count(qs.length, 'otázka', 'otázky', 'otázek')} (${parts}) · ${pct((b.known + b.mastered) / b.total)} umíš`),
          h('div', { style: 'margin-top:6px' }, progressBar(b))),
        icon('chev', 'chev'));
    })));

  const run = () => {
    lastQuery = input.value;
    const qv = input.value.trim();
    if (qv.length < 2) {
      fill(results);
      okruhy.hidden = false;
      return;
    }
    const found = data.search(qv);
    okruhy.hidden = true;
    results.replaceChildren(
      h('div', { class: 'section-label' }, `Nalezeno: ${count(found.length, 'otázka', 'otázky', 'otázek')}`),
      found.length ? h('div', { class: 'list' }, found.slice(0, 200).map((q) => questionRow(q))) : emptyState('Nic nenalezeno. Zkus jiné slovo nebo číslo paragrafu.', 'search'));
  };
  input.addEventListener('input', run);

  add(view, h('label', { class: 'search' }, icon('search'), input), results, okruhy);
  run();
}

export function okruh(view, letter, params) {
  const D = data.db();
  const name = D.okruhy[letter];
  if (!name) { add(view, emptyState('Okruh nenalezen.')); return; }
  setTitle(`Okruh ${letter}`);
  const qs = D.byOkruh[letter];
  let filter = params.get('f') || 'all';
  const hasBoth = qs.some((q) => q.part === 'obecna') && qs.some((q) => q.part === 'oborova');

  const listBox = h('div');
  const seg = h('div', { class: 'seg', role: 'tablist' });
  const draw = () => {
    const shown = qs.filter((q) => filter === 'all' || q.part === filter);
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.f === filter));
    listBox.replaceChildren(h('div', { class: 'list' }, shown.map((q) => questionRow(q))));
  };
  if (hasBoth) {
    for (const [f, label] of [['all', 'Vše'], ['obecna', 'Obecné'], ['oborova', 'Oborové VS']]) {
      seg.append(h('button', { 'data-f': f, role: 'tab', onclick: () => { filter = f; draw(); } }, label));
    }
  }
  const b = srs.breakdown(qs);
  const scopeKey = encodeURIComponent(`okruh:${letter}`);
  add(view, 
    h('section', { class: 'card' },
      h('div', { class: 'row', style: 'margin-bottom:10px' }, h('span', { class: 'okruh-letter' }, letter), h('h2', { style: 'margin:0' }, name)),
      progressBar(b),
      h('div', { class: 'small muted', style: 'margin-top:8px' },
        `${count(qs.length, 'otázka', 'otázky', 'otázek')} · zvládnuto ${b.mastered} · umím ${b.known} · učím se ${b.learning} · nové ${b.new}`),
      h('div', { class: 'grid-2', style: 'margin-top:12px' },
        h('a', { class: 'btn primary', href: `#/karticky?s=${scopeKey}` }, icon('cards'), 'Kartičky'),
        h('a', { class: 'btn ok', href: `#/procvicovani?s=${scopeKey}` }, icon('abc'), 'a/b/c'))),
    hasBoth ? h('div', { style: 'margin-bottom:12px' }, seg) : null,
    listBox);
  draw();
}

export function detail(view, id) {
  const q = data.question(id);
  if (!q) { setTitle('Otázka'); add(view, emptyState('Otázka nenalezena.')); return; }
  setTitle(`Otázka ${q.id}`);
  const p = store.progress(q.id);
  const okruhQs = data.db().byOkruh[q.okruh];
  const pos = okruhQs.indexOf(q);
  const prev = okruhQs[pos - 1];
  const next = okruhQs[pos + 1];

  const distractors = h('details', { class: 'card flat', style: 'padding:12px 16px' },
    h('summary', { style: 'cursor:pointer;font-weight:650' }, 'Varianty pro test a/b/c'),
    h('div', { style: 'margin-top:10px' },
      h('div', { class: 'option correct', style: 'margin-bottom:8px;cursor:default' }, h('span', { class: 'letter' }, icon('check')), h('span', null, q.a)),
      (q.d || []).map((d) => h('div', { class: 'option wrong', style: 'margin-bottom:8px;cursor:default' }, h('span', { class: 'letter' }, icon('x')), h('span', null, d))),
      h('p', { class: 'note', style: 'margin:4px 0 0' }, 'Chybné varianty nejsou oficiální, vytvořila je aplikace. Při zkoušce budou jiné.')));

  add(view, 
    h('section', { class: 'card' },
      h('div', { class: 'row between' }, qMeta(q), starButton(q.id)),
      h('p', { class: 'q-text' }, q.q),
      h('div', { class: 'answer' }, h('div', { class: 'lbl' }, 'Správná odpověď'), q.a),
      sourceBlock(q),
      noteBlock(q)),
    q.d && q.d.length ? distractors : null,
    h('section', { class: 'card flat' },
      h('div', { class: 'small muted' }, p && p.n
        ? `Opakováno ${p.n}× · správně ${p.ok}× · špatně ${p.bad}× · naposledy ${fmtDate(p.last)}${p.due ? ` · další opakování ${fmtDate(p.due)}` : ''}`
        : 'Tato otázka ještě nebyla opakována.'),
      h('div', { class: 'small muted', style: 'margin-top:4px' }, `Strana ${q.page} sbírky otázek ČKAIT (2. vydání, V4).`)),
    h('div', { class: 'grid-2' },
      prev ? h('a', { class: 'btn outline', href: `#/otazka/${encodeURIComponent(prev.id)}` }, `← ${prev.id}`) : h('span'),
      next ? h('a', { class: 'btn outline', href: `#/otazka/${encodeURIComponent(next.id)}` }, `${next.id} →`) : h('span')),
    h('a', { class: 'btn ghost block', style: 'margin-top:10px', href: `#/procvicovani?s=${encodeURIComponent(`ids:${q.id}`)}` }, icon('abc'), 'Vyzkoušet jako a/b/c'));
}
