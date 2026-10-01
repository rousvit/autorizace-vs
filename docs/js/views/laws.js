// Předpisy: přehled citovaných předpisů a jejich ustanovení s texty.

import * as data from '../data.js';
import { emptyState, openLaw, questionsCiting } from '../components.js';
import { setTitle } from '../nav.js';
import { add, fill, count, h, icon } from '../util.js';

const slug = (key) => key.replace(/\//g, '-');
const unslug = (s) => s.replace(/-/g, '/');

function fmtIso(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '';
  const [y, m, d] = iso.split('-');
  return `${Number(d)}. ${Number(m)}. ${y}`;
}

function loadingInto(view, render) {
  const box = h('div', { class: 'loading' }, h('div', { class: 'spinner' }), h('p', null, 'Načítám předpisy…'));
  add(view, box);
  data.loadLaws().then((laws) => { box.remove(); render(laws); }).catch(() => {
    box.replaceChildren(h('p', null, 'Předpisy se nepodařilo načíst. Při prvním otevření je potřeba internet.'));
  });
}

export function list(view) {
  setTitle('Předpisy');
  add(view, h('p', { class: 'muted small' },
    'Předpisy, ze kterých vycházejí otázky oboru VS. U každého ustanovení je text v aktuálním znění z e-Sbírky – otevřeš ho i offline. Zvýrazněné pasáže uvidíš po kliknutí na zdroj u otázky.'));
  loadingInto(view, (laws) => {
    const D = data.db();
    const groups = {};
    for (const [key, law] of Object.entries(laws)) {
      const letter = (law.okruhy || '?')[0];
      (groups[letter] ||= []).push([key, law]);
    }
    for (const letter of Object.keys(D.okruhy)) {
      const items = groups[letter];
      if (!items) continue;
      add(view, h('div', { class: 'section-label' }, `${letter} – ${D.okruhy[letter]}`),
        h('div', { class: 'list' }, items.map(([key, law]) => {
          const n = Object.keys(law.units).length;
          return h('a', { class: 'row-link', href: `#/predpis/${slug(key)}` },
            h('span', { class: 'txt' },
              h('span', { class: 't' }, capitalize(law.short)),
              h('span', { class: 's' }, `${law.code || ''}${law.zneni && /^\d/.test(law.zneni) ? ` · znění od ${fmtIso(law.zneni)}` : ''} · ${n ? count(n, 'citované ustanovení', 'citovaná ustanovení', 'citovaných ustanovení') : 'odkaz na celý předpis'}`)),
            icon('chev', 'chev'));
        })));
    }
  });
}

const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function unitSort([a], [b]) {
  const rank = (k) => ({ par: 0, art: 1, annex: 2 }[k.split(':')[0]] ?? 3);
  const num = (k) => parseInt(k.split(':')[1], 10) || 0;
  return rank(a) - rank(b) || num(a) - num(b) || a.localeCompare(b, 'cs');
}

export function detail(view, s) {
  const key = unslug(s);
  setTitle('Předpis');
  loadingInto(view, (laws) => {
    const law = laws[key];
    if (!law) { add(view, emptyState('Předpis nenalezen.')); return; }
    setTitle(capitalize(law.short));
    add(view, h('section', { class: 'card' },
      h('h2', null, law.title),
      h('p', { class: 'small muted' }, law.zneni ? (/^\d/.test(law.zneni) ? `Aktuální znění účinné od ${fmtIso(law.zneni)}` : capitalize(law.zneni)) : ''),
      law.note ? h('div', { class: 'qnote', style: 'margin:0 0 12px' }, icon('info'), h('div', null, law.note)) : null,
      h('a', { class: 'btn outline block', href: law.url, target: '_blank', rel: 'noopener' }, icon('ext'), key.startsWith('eu/') ? 'Celý text v EUR-Lexu' : 'Celý text v e-Sbírce')));
    const units = Object.entries(law.units).sort(unitSort);
    if (!units.length) {
      add(view, h('div', { class: 'card flat' }, emptyState('Otázky odkazují na předpis jako celek. Text najdeš v e-Sbírce.', 'book')));
      return;
    }
    add(view, h('div', { class: 'section-label' }, 'Citovaná ustanovení'),
      h('div', { class: 'list' }, units.map(([ukey, u]) => {
        const [kind, id] = ukey.split(':');
        const ref = { law: key, kind, id, detail: '', hl: {}, short: law.short, label: kind === 'row' ? u.heading : undefined };
        const n = questionsCiting(ref).length;
        return h('button', { class: 'row-link', onclick: () => openLaw(ref) },
          h('span', { class: 'code', style: 'min-width:64px' }, codeLabel(kind, id, u)),
          h('span', { class: 'txt' },
            h('span', { class: 't' }, u.heading || firstText(u)),
            h('span', { class: 's' }, count(n, 'otázka', 'otázky', 'otázek'))),
          icon('chev', 'chev'));
      })));
  });
}

function codeLabel(kind, id, u) {
  if (kind === 'par') return `§ ${id}`;
  if (kind === 'art') return `čl. ${id}`;
  const n = (u.label || '').match(/Příloha č\. (\w+)/);
  if (kind === 'annex') return id ? `Příl. ${id}` : 'Příloha';
  return n ? `Příl. ${n[1]}` : 'Příloha';
}

function firstText(u) {
  const p = u.parts.find((x) => x[3]);
  if (!p) return '';
  const t = p[3].replace(/<[^>]+>/g, '').replace(/^\(\d+\)\s*/, '');
  return t.length > 110 ? `${t.slice(0, 108)}…` : t;
}
