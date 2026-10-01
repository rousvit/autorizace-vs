// Sdílené části rozhraní: štítky otázky, zdroj s odkazy na předpisy, text ustanovení.

import * as data from './data.js';
import * as store from './store.js';
import * as srs from './srs.js';
import { h, icon, sheet, toast } from './util.js';

export function partChip(q) {
  return q.part === 'oborova'
    ? h('span', { class: 'chip primary' }, 'oborová VS')
    : h('span', { class: 'chip' }, 'obecná');
}

export function statusChip(id) {
  const st = srs.status(id);
  const cls = { new: '', learning: 'warn', known: 'primary', mastered: 'ok' }[st];
  return h('span', { class: `chip ${cls}` }, srs.STATUS_LABEL[st]);
}

export function qMeta(q, { status = true } = {}) {
  const okruh = data.db().okruhy[q.okruh] || '';
  return h('div', { class: 'q-meta' },
    h('span', { class: 'chip primary', title: okruh }, q.id),
    h('span', { class: 'chip' }, okruh.length > 34 ? `${okruh.slice(0, 32)}…` : okruh),
    partChip(q),
    status ? statusChip(q.id) : null);
}

export function starButton(id, onChange) {
  const btn = h('button', { class: 'icon-btn', 'aria-label': 'Označit hvězdičkou', 'aria-pressed': 'false' });
  const paint = () => {
    const on = !!store.progress(id)?.star;
    btn.replaceChildren(icon(on ? 'starFill' : 'star', on ? 'star-on' : ''));
    btn.setAttribute('aria-pressed', String(on));
    btn.title = on ? 'Odebrat hvězdičku' : 'Označit hvězdičkou';
  };
  btn.addEventListener('click', () => {
    const on = store.toggleStar(id);
    paint();
    toast(on ? 'Otázka označena hvězdičkou' : 'Hvězdička odebrána');
    if (onChange) onChange(on);
  });
  paint();
  return btn;
}

// --- odkazy na předpisy ------------------------------------------------------------------

const KIND_LABEL = { par: (r) => `§ ${r.id}`, annex: (r) => (r.id ? `Příloha č. ${r.id}` : 'Příloha'), art: (r) => `čl. ${r.id}` };

export function refLabel(r) {
  if (r.kind === 'url') return 'Odkaz na web';
  const law = r.short || '';
  if (r.kind === 'whole') return law;
  const base = KIND_LABEL[r.kind](r);
  const det = r.kind === 'par' && r.detail ? ` ${r.detail}` : '';
  return `${base}${det}${law ? ` · ${law}` : ''}`;
}

export function sourceBlock(q) {
  const wrap = h('div', null);
  const chips = h('div', { class: 'src' });
  for (const r of q.refs || []) {
    if (r.kind === 'url') {
      chips.append(h('a', { class: 'src-link', href: r.id, target: '_blank', rel: 'noopener' }, icon('ext'), 'Informace na webu'));
      continue;
    }
    chips.append(h('button', { class: 'src-link', onclick: () => openLaw(r) }, icon('book'), refLabel(r)));
  }
  wrap.append(chips, h('div', { class: 'src-raw' }, `Zdroj: ${q.src}`));
  return wrap;
}

function anchor(law, r) {
  if (r.law?.startsWith('eu/')) return `${law.url}#art_${r.id}`;
  if (r.kind !== 'par') return law.url;
  const odst = r.hl?.odst?.length === 1 ? `-odst_${r.hl.odst[0]}` : '';
  return `${law.url}#par_${r.id}${odst}`;
}

/** Spodní panel s textem citovaného ustanovení. */
export async function openLaw(r) {
  const body = h('div', null, h('div', { class: 'loading' }, h('div', { class: 'spinner' })));
  const s = sheet(refLabel(r), body);
  let laws;
  try {
    laws = await data.loadLaws();
  } catch (e) {
    body.replaceChildren(h('p', null, 'Texty předpisů se nepodařilo načíst. Zkontroluj připojení a zkus to znovu.'));
    return;
  }
  const law = laws[r.law];
  if (!law) {
    body.replaceChildren(h('p', null, 'Předpis není v aplikaci k dispozici.'));
    return;
  }
  const unit = law.units[`${r.kind}:${r.id}`];
  const content = h('div', null,
    h('div', { class: 'law-head' },
      h('div', { class: 't' }, law.title),
      h('div', { class: 'small muted' }, law.zneni ? (/^\d/.test(law.zneni) ? `Znění účinné od ${fmtIso(law.zneni)}` : capitalize(law.zneni)) : '')),
    law.note ? h('div', { class: 'qnote', style: 'margin:0 0 12px' }, icon('info'), h('div', null, law.note)) : null);
  if (unit) {
    content.append(renderUnit(unit, r.hl));
  } else if (r.kind === 'whole') {
    content.append(h('p', null, 'Otázka odkazuje na předpis jako celek. Celý text najdeš v e-Sbírce.'));
  } else {
    content.append(h('p', null, 'Text tohoto ustanovení se nepodařilo dohledat.'));
  }
  content.append(
    h('a', { class: 'btn outline block', href: anchor(law, r), target: '_blank', rel: 'noopener', style: 'margin-top:14px' },
      icon('ext'), r.law.startsWith('eu/') ? 'Otevřít v EUR-Lexu' : 'Otevřít v e-Sbírce'),
    h('p', { class: 'law-note' }, r.law.startsWith('eu/')
      ? 'Text z Úředního věstníku EU (původní znění nařízení).'
      : 'Text z otevřených dat e-Sbírky. Zvýrazněna je citovaná část; právně závazné je znění ve Sbírce zákonů.'));
  const qs = questionsCiting(r);
  if (qs.length > 1) {
    content.append(h('div', { class: 'section-label' }, 'Otázky k tomuto ustanovení'),
      h('div', { class: 'list' }, qs.map((q) => questionRow(q, () => s.close()))));
  }
  body.replaceChildren(content);
  const first = body.querySelector('.hl');
  if (first) requestAnimationFrame(() => first.scrollIntoView({ block: 'center' }));
}

function fmtIso(iso) {
  const [y, m, d] = iso.split('-');
  return `${Number(d)}. ${Number(m)}. ${y}`;
}

const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function questionsCiting(r) {
  return data.db().questions.filter((q) => (q.refs || []).some((x) => x.law === r.law && x.kind === r.kind && x.id === r.id));
}

function hlFlags(parts, hl) {
  const keys = hl ? Object.keys(hl) : [];
  if (!keys.length) return parts.map(() => false);
  let curOdst = null;
  let curPism = null;
  return parts.map(([typ, num, , , path = '']) => {
    if (typ === 'odst') { curOdst = num; curPism = null; }
    if (typ === 'pism') curPism = num;
    const odstOk = !hl.odst || hl.odst.includes(curOdst);
    const pismOk = !hl.pism || hl.pism.includes(curPism);
    if (hl.cast) return path === hl.cast[0] || path.startsWith(`${hl.cast[0]}.`);
    if (hl.bod && !hl.pism && !hl.odst) {
      const b = hl.bod[0];
      return path === b || path.startsWith(`${b}.`) || (!path && typ === 'bod' && num === b);
    }
    if (hl.bod) return odstOk && pismOk && typ === 'bod' && num === hl.bod[0];
    if (hl.pism) return odstOk && pismOk && curPism !== null && (typ === 'pism' || typ === 'bod');
    if (hl.odst) return odstOk && curOdst !== null && typ !== 'nadpis';
    return false;
  });
}

export function renderUnit(unit, hl) {
  const flags = hlFlags(unit.parts, hl);
  const box = h('div', { class: 'law-unit' },
    h('h3', null, unit.label || ''),
    unit.heading ? h('div', { class: 'heading' }, unit.heading) : null);
  const text = h('div', { class: 'law-text' });
  unit.parts.forEach((p, i) => {
    const [typ, , depth, html] = p;
    text.append(h('div', { class: `lp d${Math.min(4, Math.max(1, depth))} ${typ}${flags[i] ? ' hl' : ''}`, html }));
  });
  box.append(text);
  return box;
}

export function questionRow(q, onClick) {
  const st = srs.status(q.id);
  const star = store.progress(q.id)?.star;
  return h('a', { class: 'row-link', href: `#/otazka/${encodeURIComponent(q.id)}`, onclick: onClick },
    h('span', { class: 'code' }, q.id),
    h('span', { class: 'txt' }, h('span', { class: 't' }, q.q), h('span', { class: 's' }, q.a.length > 90 ? `${q.a.slice(0, 88)}…` : q.a)),
    star ? icon('starFill', 'star-on') : null,
    h('span', { class: `dot ${st}`, title: srs.STATUS_LABEL[st] }));
}

export function progressBar(b) {
  const w = (n) => `${b.total ? (100 * n) / b.total : 0}%`;
  return h('div', { class: 'bar', role: 'img', 'aria-label': `Zvládnuto ${b.mastered}, umím ${b.known}, učím se ${b.learning}, nové ${b.new}` },
    h('i', { class: 'm', style: `width:${w(b.mastered)}` }),
    h('i', { class: 'k', style: `width:${w(b.known)}` }),
    h('i', { class: 'l', style: `width:${w(b.learning)}` }));
}

export function legend() {
  return h('div', { class: 'legend' },
    h('span', null, h('i', { style: 'background:var(--seg-mastered)' }), 'zvládnuto'),
    h('span', null, h('i', { style: 'background:var(--seg-known)' }), 'umím'),
    h('span', null, h('i', { style: 'background:var(--seg-learning)' }), 'učím se'),
    h('span', null, h('i', { style: 'background:var(--seg-new)' }), 'nové'));
}

/** Ověřená poznámka k otázce (nesoulad s aktuálním zněním, chybná citace). */
export function noteBlock(q) {
  if (!q.note) return null;
  const isCitation = q.note.startsWith('Citace:');
  const text = q.note.replace(/^(Citace|Aktuální znění):\s*/, '');
  return h('div', { class: 'qnote', role: 'note' }, icon('warn'),
    h('div', null, h('b', null, isCitation ? 'Oprava citace' : 'Poznámka k aktuálnímu znění'), h('br'), text[0].toUpperCase() + text.slice(1),
      h('div', { class: 'tiny muted', style: 'margin-top:4px' }, 'U zkoušky se hodnotí odpověď ze sbírky ČKAIT.')));
}

export function emptyState(text, iconName = 'info') {
  return h('div', { class: 'empty' }, icon(iconName), h('p', null, text));
}
