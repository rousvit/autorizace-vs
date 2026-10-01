// Nastavení: termín zkoušky, rozsah kol, motiv, záloha postupu, informace o aplikaci.

import * as data from '../data.js';
import * as store from '../store.js';
import { installPrompt, isStandalone, navigate, setTitle } from '../nav.js';
import { add, fill, confirmBox, download, h, icon, todayKey, toast } from '../util.js';

export function render(view) {
  setTitle('Nastavení');
  const s = store.settings();
  const D = data.db();

  const date = h('input', { type: 'date', id: 'exam-date', value: s.examDate || '', min: todayKey() });
  date.addEventListener('change', () => { store.setSetting('examDate', date.value); toast(date.value ? 'Datum zkoušky uloženo' : 'Datum zkoušky smazáno'); });

  const select = (id, key, values, suffix) => {
    const el = h('select', { id }, values.map((v) => h('option', { value: v, selected: Number(s[key]) === v }, `${v} ${suffix}`)));
    el.addEventListener('change', () => store.setSetting(key, Number(el.value)));
    return el;
  };

  const theme = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Motiv' });
  for (const [v, label] of [['auto', 'Podle systému'], ['light', 'Světlý'], ['dark', 'Tmavý']]) {
    theme.append(h('button', {
      class: s.theme === v ? 'on' : '', role: 'radio', 'aria-checked': String(s.theme === v),
      onclick: () => { store.setSetting('theme', v); dispatchEvent(new Event('settings-changed')); navigate('#/nastaveni', true); },
    }, label));
  }

  const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    try {
      const text = await f.text();
      if (!(await confirmBox('Obnovit zálohu?', 'Současný postup v tomto zařízení se nahradí obsahem zálohy.', 'Obnovit'))) return;
      store.importData(text);
      dispatchEvent(new Event('settings-changed'));
      toast('Záloha obnovena');
      navigate('#/', true);
    } catch (e) {
      toast(e.message || 'Zálohu se nepodařilo načíst.');
    } finally {
      file.value = '';
    }
  });

  const answered = Object.values(store.get().progress).filter((p) => p.n).length;
  const install = installPrompt();

  add(view, 
    h('section', { class: 'card' },
      h('div', { class: 'field' }, h('label', { for: 'exam-date' }, 'Datum zkoušky'), date,
        h('span', { class: 'tiny muted' }, 'Na přehledu pak uvidíš odpočet dní.')),
      h('div', { class: 'field' }, h('label', { for: 'new-per-day' }, 'Nových kartiček denně'),
        select('new-per-day', 'newPerDay', [10, 15, 20, 25, 30, 40, 50, 75, 100], 'otázek'),
        h('span', { class: 'tiny muted' }, `Při 25 denně projdeš všech ${D.questions.length} otázek zhruba za ${Math.ceil(D.questions.length / 25)} dní.`)),
      h('div', { class: 'field' }, h('label', { for: 'session-size' }, 'Délka kola kartiček'),
        select('session-size', 'sessionSize', [10, 15, 20, 30, 50], 'kartiček')),
      h('div', { class: 'field', style: 'margin-bottom:0' }, h('label', { for: 'practice-size' }, 'Otázek v procvičování a/b/c'),
        select('practice-size', 'practiceSize', [10, 20, 30, 50, 100], 'otázek'))),

    h('div', { class: 'section-label' }, 'Vzhled'),
    h('section', { class: 'card' }, theme),

    h('div', { class: 'section-label' }, 'Záloha postupu'),
    h('section', { class: 'card' },
      h('p', { class: 'small muted' }, `Postup se ukládá jen v tomto zařízení (zatím ${answered} procvičených otázek). Zálohu můžeš uložit do souboru a obnovit třeba v novém telefonu.`),
      h('div', { class: 'btn-col' },
        h('button', { class: 'btn outline', onclick: () => download(`autorizace-vs-zaloha-${todayKey()}.json`, store.exportData()) }, icon('download'), 'Uložit zálohu do souboru'),
        h('button', { class: 'btn outline', onclick: () => file.click() }, icon('upload'), 'Obnovit ze zálohy'),
        h('button', { class: 'btn danger', onclick: async () => {
          if (await confirmBox('Smazat postup?', 'Smaže se historie učení, hvězdičky i výsledky zkoušek. Nastavení zůstane.', 'Smazat', true)) {
            store.reset(); toast('Postup smazán'); navigate('#/', true);
          }
        } }, icon('trash'), 'Smazat postup')),
      file),

    isStandalone() ? null : h('div', { class: 'section-label' }, 'Instalace do telefonu'),
    isStandalone() ? null : h('section', { class: 'card' },
      install ? h('button', { class: 'btn primary block', style: 'margin-bottom:10px', onclick: async () => { install.prompt(); await install.userChoice; } }, 'Nainstalovat aplikaci') : null,
      h('p', { class: 'small', style: 'margin-bottom:6px' }, h('b', null, 'Android (Chrome): '), 'menu ⋮ → Přidat na plochu / Nainstalovat aplikaci.'),
      h('p', { class: 'small', style: 'margin:0' }, h('b', null, 'iPhone (Safari): '), 'tlačítko Sdílet → Přidat na plochu.'),
      h('p', { class: 'note', style: 'margin:8px 0 0' }, 'Po instalaci se aplikace otevírá na celou obrazovku a funguje i bez internetu.')),

    h('div', { class: 'section-label' }, 'O aplikaci'),
    h('section', { class: 'card small' },
      h('p', null, h('b', null, 'Autorizace VS'), ' je neoficiální studijní pomůcka k písemné části zkoušky odborné způsobilosti ČKAIT pro obor Stavby vodního hospodářství a krajinného inženýrství.'),
      h('p', null, `Otázky a správné odpovědi: ${D.source} (${D.questions.length} otázek oboru VS – ${D.general.length} obecných, ${D.specific.length} oborových). Rozdělení na obecné a oborové otázky odvodila aplikace z porovnání kapitol všech oborů.`),
      h('p', null, 'Chybné varianty a/b/c nejsou oficiální – vytvořila je umělá inteligence a byly kontrolovány proti textu předpisů. U zkoušky budou jiné.'),
      h('p', null, `Texty předpisů: otevřená data e-Sbírky (stav ke dni ${D.lawsFetched || 'sestavení'}), nařízení (EU) č. 305/2011 z Úředního věstníku EU. Právně závazné je znění publikované ve Sbírce zákonů.`),
      h('p', { style: 'margin:0' }, h('a', { href: 'https://www.ckait.cz/content/autorizace-ckait-1', target: '_blank', rel: 'noopener' }, 'Informace ČKAIT k autorizaci'), ' · ',
        h('a', { href: 'https://www.ckait.cz/sites/default/files/2025-07/Pokyny%20AR%20k%20pou%C5%BE%C3%ADv%C3%A1n%C3%AD%20test%C5%AF%20revize%206-25.pdf', target: '_blank', rel: 'noopener' }, 'Pokyny AR k testům')),
      h('p', { class: 'tiny muted', style: 'margin:10px 0 0' }, `Verze dat ${D.version || ''}`)),
  );
}
