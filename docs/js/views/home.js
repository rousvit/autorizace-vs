// Přehled: připravenost, odhad výsledku testu, rychlý start.

import * as data from '../data.js';
import * as store from '../store.js';
import * as srs from '../srs.js';
import { legend, progressBar } from '../components.js';
import { setTitle } from '../nav.js';
import { add, fill, count, daysUntil, fmtNum, h, icon, pct, plural, todayKey } from '../util.js';

export function render(view) {
  setTitle('Autorizace VS');
  const D = data.db();
  const s = store.settings();
  const b = srs.breakdown(D.questions);
  const r = srs.readiness(D.general, D.specific);
  const days = daysUntil(s.examDate);
  const q = srs.buildQueue(D.questions, { size: 9999, newLimit: s.newPerDay });
  const todayN = store.get().days[todayKey()]?.n || 0;
  const streak = srs.streak();
  const known = b.known + b.mastered;

  let countdown;
  if (days == null) countdown = h('a', { href: '#/nastaveni', style: 'color:inherit' }, 'Nastav si datum zkoušky →');
  else if (days > 0) countdown = `Zkouška za ${count(days, 'den', 'dny', 'dní')}`;
  else if (days === 0) countdown = 'Zkouška je dnes. Hodně štěstí!';
  else countdown = 'Termín zkoušky už proběhl';

  add(view, 
    h('section', { class: 'card hero' },
      h('div', { class: 'small muted' }, countdown),
      h('div', { class: 'row between', style: 'margin:10px 0 12px;align-items:flex-end' },
        h('div', null,
          h('div', { class: 'hero-num' }, pct(known / b.total)),
          h('div', { class: 'small muted' }, `umíš ${known} z ${b.total} otázek`)),
        h('div', { class: 'center' },
          h('div', { style: 'font-size:1.6rem;font-weight:800' }, pct(r.pass)),
          h('div', { class: 'tiny muted' }, 'odhad úspěchu'))),
      progressBar(b),
      h('div', { class: 'kpis' },
        h('div', { class: 'kpi' }, h('b', null, String(q.due)), h('span', null, 'k opakování')),
        h('div', { class: 'kpi' }, h('b', null, String(todayN)), h('span', null, 'dnes zopakováno')),
        h('div', { class: 'kpi' }, h('b', null, String(streak)), h('span', null, `${plural(streak, 'den', 'dny', 'dní')} v řadě`)))),
  );

  if (b.new === b.total) {
    add(view, h('section', { class: 'card' },
      h('h2', null, 'Jak začít'),
      h('ol', { class: 'rules' },
        h('li', null, h('b', null, 'Kartičky'), ' – každý den projdi nové otázky a ty, které aplikace připraví k opakování (stačí 15–20 minut).'),
        h('li', null, h('b', null, 'Procvičování a/b/c'), ' – zkoušej se ve formátu testu, nejlépe po okruzích.'),
        h('li', null, h('b', null, 'Zkouška nanečisto'), ' – před termínem si ji dej několikrát; cílem je aspoň 16/20 a 8/10.')),
      h('p', { class: 'note', style: 'margin:10px 0 0' }, 'U každé otázky najdeš citovaný paragraf. Klepnutím na něj se otevře text zákona se zvýrazněnou pasáží.')));
  }

  const learnSub = q.due || q.newLeft
    ? `${q.due} k opakování · ${Math.min(q.newLeft, q.fresh)} nových`
    : 'Na dnes hotovo – můžeš pokračovat navíc';
  const exams = store.get().exams;
  const last = exams[exams.length - 1];
  const wrong = data.scope('wrong').length;

  add(view, 
    action('#/karticky?s=all', 'cards', '', 'Pokračovat v učení', learnSub),
    action('#/procvicovani?s=all', 'abc', 'ok', 'Procvičit a/b/c', 'výběr ze tří možností jako u zkoušky'),
    action('#/zkouska', 'exam', 'warn', 'Zkouška nanečisto', last
      ? `poslední: ${last.g}/20 a ${last.s}/10 – ${last.verdictLabel}`
      : '30 otázek, 30 minut, hodnocení jako u ČKAIT'),
    wrong ? action('#/procvicovani?s=wrong', 'redo', '', 'Procvičit chyby', `${count(wrong, 'otázka', 'otázky', 'otázek')} naposledy špatně`) : null,
  );

  add(view, 
    h('div', { class: 'section-label' }, 'Odhad výsledku testu'),
    h('section', { class: 'card' },
      h('div', { class: 'grid-2' },
        estimate('Obecná část', r.expG, 20, 16, r.passG),
        estimate('Oborová část', r.expS, 10, 8, r.passS)),
      h('p', { class: 'note', style: 'margin:10px 0 0' },
        'Orientační odhad podle tvého postupu. U otázek, které ještě neznáš, počítá aplikace s tipem (asi 38 % šance). Pro úspěch je potřeba alespoň 80 % v obou částech.')),
  );

  // nejslabší okruhy
  const rows = Object.entries(D.okruhy).map(([k, name]) => {
    const qs = D.byOkruh[k];
    const bb = srs.breakdown(qs);
    return { k, name, qs, bb, score: (bb.known + bb.mastered) / bb.total };
  }).sort((a, b) => a.score - b.score || b.qs.length - a.qs.length).slice(0, 3);
  add(view, 
    h('div', { class: 'section-label' }, 'Na co se zaměřit'),
    h('div', { class: 'list' }, rows.map((x) => h('a', { class: 'row-link', href: `#/okruh/${x.k}` },
      h('span', { class: 'okruh-letter' }, x.k),
      h('span', { class: 'txt' }, h('span', { class: 't' }, x.name),
        h('span', { class: 's' }, `${pct(x.score)} umíš · ${count(x.qs.length, 'otázka', 'otázky', 'otázek')}`),
        h('div', { style: 'margin-top:6px' }, progressBar(x.bb))),
      icon('chev', 'chev')))),
    legend(),
  );
}

function action(href, ico, cls, title, sub) {
  return h('a', { class: 'action', href },
    h('span', { class: `ico ${cls}` }, icon(ico)),
    h('span', { class: 'grow' }, h('b', null, title), h('span', { class: 'sub' }, sub)),
    icon('chev', 'chev'));
}

function estimate(label, exp, of, need, pass) {
  const ok = exp >= need;
  return h('div', { class: 'score-part' },
    h('div', { class: 'small muted' }, label),
    h('b', { style: `color:var(${ok ? '--ok' : '--text'})` }, `${fmtNum(exp)} / ${of}`),
    h('div', { class: 'tiny muted' }, `potřeba ${need} · šance ${pct(pass)}`));
}
