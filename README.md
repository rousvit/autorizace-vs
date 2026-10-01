# Autorizace VS – trenažér k písemné zkoušce ČKAIT

Neoficiální webová aplikace (PWA) pro přípravu na písemnou část zkoušky odborné způsobilosti ČKAIT,
obor **Stavby vodního hospodářství a krajinného inženýrství (VS)**. Běží v prohlížeči, dá se nainstalovat
na plochu telefonu a funguje i offline.

## Co umí

- **Kartičky** s opakováním v rozestupech (Leitnerovy přihrádky): otázka → odpověď → „nevím / váhám / vím“.
- **Procvičování a/b/c** ve formátu testu, hned s vysvětlením a citovaným paragrafem.
- **Zkouška nanečisto** podle [Pokynů AR ČKAIT k testům](https://www.ckait.cz/sites/default/files/2025-07/Pokyny%20AR%20k%20pou%C5%BE%C3%ADv%C3%A1n%C3%AD%20test%C5%AF%20revize%206-25.pdf):
  30 otázek (20 obecných + 10 oborových), 30 minut, hodnocení každé části zvlášť (≥ 80 % vyhověl,
  51–79 % doplňující otázky, ≤ 50 % nevyhověl).
- **Okruhy A–R** s postupem, vyhledávání, hvězdičky, chybované otázky.
- **Předpisy**: text každého citovaného ustanovení v aktuálním znění z e-Sbírky (zvýrazněná citovaná část),
  odkazy do e-Sbírky.
- Postup se ukládá v zařízení (localStorage), záloha a obnova přes soubor.

## Zdroje dat

- Otázky a správné odpovědi: *Otázky k písemné části zkoušky odborné způsobilosti ČKAIT*, 2. vydání, V4
  (30. 7. 2026), kapitola VS – 460 otázek. Rozdělení na obecné (357) a oborové (103) otázky PDF neuvádí;
  odvozeno z porovnání kapitol: otázka obsažená ve ≥ 13 ze 14 kapitol je obecná.
- Chybné varianty a/b/c **nejsou oficiální** – vytvořila je AI a byly kontrolovány proti textu předpisů.
- Texty předpisů: otevřená data [e-Sbírky](https://e-sbirka.gov.cz) (veřejná cache portálu),
  nařízení (EU) č. 305/2011 z Úřadu pro publikace EU (CELLAR).

## Struktura

```
docs/                 aplikace (GitHub Pages servíruje tuto složku)
  index.html, app.css, sw.js, manifest.webmanifest, icons/
  js/                 moduly aplikace (bez sestavovacího kroku, čisté ES moduly)
  data/               questions.json a laws.json – generuje tools/build.py
data/
  questions.json      otázky vytažené z PDF
  laws.json           citovaná ustanovení předpisů
  distractors/        chybné varianty a/b/c po dávkách
  notes.json          ověřené poznámky k otázkám (nesoulad s aktuálním zněním apod.)
tools/                skripty pro přípravu dat
```

## Aktualizace dat

```bash
python tools/extract_questions.py   # PDF → data/questions.json (PDF musí ležet v kořeni repozitáře)
python tools/fetch_laws.py          # e-Sbírka → data/laws.json (--refresh = stáhnout znovu)
python tools/distractor_batches.py  # podklady pro tvorbu variant a/b/c
python tools/build.py               # → docs/data/*.json + nová verze service workeru
```

Lokální spuštění: `python tools/devserver.py` a otevřít <http://127.0.0.1:8765/>.
Na localhostu se service worker neregistruje (offline režim jde vyzkoušet přes `?sw`).

Aplikace je studijní pomůcka; právně závazné je znění předpisů ve Sbírce zákonů a oficiální materiály ČKAIT.
