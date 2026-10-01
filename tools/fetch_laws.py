"""Stáhne aktuální znění citovaných předpisů a vyřízne citované paragrafy a přílohy.

Zdroje:
  * e-Sbírka – veřejná cache portálu https://e-sbirka.gov.cz/sbr-cache (bez registrace)
  * nařízení (EU) č. 305/2011 – Úřad pro publikace EU (CELLAR), české znění

Surová data se ukládají do cache/ (není v gitu), výsledek do data/laws.json.
Spuštění:  python tools/fetch_laws.py            (použije cache)
           python tools/fetch_laws.py --refresh  (stáhne znovu metadata i texty)
"""
import html
import json
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request
from html.parser import HTMLParser

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from laws import CITATION_FIXES, EXTRA_REFS, LAWS, parse_citation  # noqa: E402

# Řádky tabulek z příloh, na které odkazuje EXTRA_REFS:
# klíč → (číslo přílohy, regulární výraz prvního sloupce, popisek)
TABLE_ROWS = {
    "sb/2008/278": {
        "p2-provadeni-staveb": ("2", r"^Provádění staveb, jejich změn a odstraňování$", "Příloha č. 2 – živnost vázaná"),
        "p4-70": ("4", r"^70\. ", "Příloha č. 4 – živnost volná, obor činnosti č. 70"),
    },
}


def table_units(frags, rows):
    """Vybrané řádky tabulek příloh jako samostatná „ustanovení“."""
    units = {}
    for key, (annex, first_col, label) in rows.items():
        for fr in frags:
            if not (fr["eli"] or "").split("/dokument", 1)[-1].startswith(f"/prilohy/priloha_{annex}/"):
                continue
            for tr in re.findall(r"<tr.*?</tr>", fr["xhtml"] or "", re.S):
                cells = [clean(c) for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, re.S)]
                plain = [html.unescape(re.sub(r"<[^>]+>", "", c)).strip() for c in cells]
                if len(cells) >= 2 and re.search(first_col, plain[0]):
                    # po větách, aby šla zvýraznit jen citovaná věta
                    sentences = re.split(r"(?<=\.)\s+(?=[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ])", cells[1])
                    units[f"row:{key}"] = {"label": label, "heading": plain[0],
                                           "parts": [["text", "", 1, s] for s in sentences if s.strip()]}
                    break
        if f"row:{key}" not in units:
            print(f"  ! řádek tabulky {key} nenalezen")
    return units

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / "cache"
OUT = ROOT / "data" / "laws.json"
BASE = "https://e-sbirka.gov.cz/sbr-cache"
PORTAL = "https://e-sbirka.gov.cz"
UA = "autorizace-vs/1.0 (studijni pomucka k autorizacni zkousce)"
PAUSE = 1.0
CPR_URL = "http://publications.europa.eu/resource/celex/32011R0305"


def http_get(url, accept="application/json", lang=None):
    headers = {"Accept": accept, "User-Agent": UA}
    if lang:
        headers["Accept-Language"] = lang
    last = None
    for attempt in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=90) as r:
                return r.read()
        except Exception as e:  # síť, 429, 5xx – zkusit znovu s odstupem
            last = e
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"{url}: {last}")


def esb(path, **params):
    url = BASE + path + ("?" + urllib.parse.urlencode(params) if params else "")
    data = json.loads(http_get(url))
    time.sleep(PAUSE)
    return data


def q(stale):
    return urllib.parse.quote(stale, safe="")


def fetch_meta(key, refresh):
    f = CACHE / "meta" / (key.replace("/", "_") + ".json")
    if f.exists() and not refresh:
        return json.loads(f.read_text(encoding="utf-8"))
    meta = esb("/dokumenty-sbirky/" + q("/" + key))
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    return meta


def fetch_fragments(stale, refresh):
    f = CACHE / "fragmenty" / (stale.strip("/").replace("/", "_") + ".json")
    if f.exists() and not refresh:
        return json.loads(f.read_text(encoding="utf-8"))
    frags, page, pages = [], 0, 1
    while page < pages:
        d = esb("/dokumenty-sbirky/" + q(stale) + "/fragmenty", cisloStranky=page)
        pages = d["pocetStranek"]
        for x in d["seznam"]:
            frags.append({k: x.get(k) for k in ("eli", "kodTypuFragmentu", "xhtml")})
        print(f"    strana {page + 1}/{pages}", flush=True)
        page += 1
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(frags, ensure_ascii=False), encoding="utf-8")
    return frags


class Sanitizer(HTMLParser):
    """Propustí jen bezpečné značky; <var> (označení odstavce) převede na <b>."""

    KEEP = {"b", "strong", "i", "em", "u", "sup", "sub", "br", "table", "thead", "tbody", "tr", "td", "th"}
    MAP = {"var": "b"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out = []

    def handle_starttag(self, tag, attrs):
        tag = self.MAP.get(tag, tag)
        if tag == "img":
            self.out.append("<i>[obrázek – zobrazíte v e-Sbírce]</i>")
        elif tag == "p":
            self.out.append(" ")
        elif tag in self.KEEP:
            keep = "".join(f' {k}="{html.escape(v or "")}"' for k, v in attrs if k in ("colspan", "rowspan") and tag in ("td", "th"))
            self.out.append(f"<{tag}{keep}>" if tag != "br" else "<br>")

    def handle_endtag(self, tag):
        tag = self.MAP.get(tag, tag)
        if tag in self.KEEP and tag != "br":
            self.out.append(f"</{tag}>")

    def handle_data(self, data):
        self.out.append(html.escape(data.replace(" ", " "), quote=False))


def clean(xhtml):
    s = Sanitizer()
    s.feed(xhtml or "")
    s.close()
    text = "".join(s.out)
    text = re.sub(r"[ \t\r\n]+", " ", text).strip()
    return text


PART_TYPES = {"Odstavec_Dc": "odst", "Pismeno_Lb": "pism", "Nadpis_pod": "nadpis", "Nadpis_nad": "nadpis",
              "Nadpis": "nadpis", "Cast": "cast", "Tabulka": "tab"}


def part_type(kod):
    if kod in PART_TYPES:
        return PART_TYPES[kod]
    if kod.startswith("Bod"):
        return "bod"
    return "text"


def build_units(frags, wanted):
    """wanted: {"par:55", "annex:8", ...} → {unit: {label, heading, parts}}"""
    units, done = {}, set()
    current = None
    for fr in frags:
        path = (fr["eli"] or "").split("/dokument", 1)[-1]
        kod = fr["kodTypuFragmentu"] or ""
        unit, rel = None, []
        m = re.match(r"(/norma(?:/[^/]+)*?)/par_([0-9a-z]+)(/.*)?$", path)
        if m:
            unit, rel = f"par:{m.group(2)}", (m.group(3) or "").strip("/").split("/")
        else:
            m = re.match(r"/prilohy/priloha_?([0-9a-z]*)(/.*)?$", path)
            if m:
                unit, rel = f"annex:{m.group(1)}", (m.group(2) or "").strip("/").split("/")
        if unit != current and current is not None:
            done.add(current)
        current = unit
        if unit is None or unit not in wanted or (unit in done and unit in units):
            continue
        rel = [r for r in rel if r]
        u = units.setdefault(unit, {"parts": []})
        if kod in ("Paragraf", "Hlavicka_priloha") and not rel:
            u["label"] = clean(fr["xhtml"]).replace("<b>", "").replace("</b>", "")
            continue
        body = clean(fr["xhtml"])
        if not body:
            continue
        depth = sum(1 for r in rel if re.match(r"(odst|pism|bod|cast)_", r))
        num = ""
        if rel and re.match(r"(odst|pism|bod|cast)_", rel[-1]):
            num = rel[-1].split("_", 1)[1]
        typ = part_type(kod)
        if typ == "nadpis" and not rel[:-1] and "heading" not in u:
            u["heading"] = body
            continue
        # číslo části (cast_3) a bodu (bod_1 v cast_3 → „3.1“) pro zvýraznění
        path_nums = [r.split("_", 1)[1] for r in rel if re.match(r"(cast|bod)_", r)]
        u["parts"].append([typ, num, depth, body] + ([".".join(path_nums)] if path_nums else []))
    return units


# --- nařízení EU (CELLAR) -----------------------------------------------------------------

class Flatten(HTMLParser):
    """Článek CPR: <p> mimo tabulku = odstavec, řádek tabulky = bod (číslo + text)."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.lines, self.buf, self.in_row, self.cells = [], [], 0, []

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self.in_row += 1
            self.cells = []
        elif tag == "td":
            self.buf = []
        elif tag == "p" and not self.in_row:
            self.buf = []
        elif tag == "span" and ("class", "oj-super") in attrs:
            self.buf.append("<sup>")

    def handle_endtag(self, tag):
        if tag == "td":
            self.cells.append(" ".join("".join(self.buf).split()))
            self.buf = []
        elif tag == "tr":
            self.in_row -= 1
            row = " ".join(c for c in self.cells if c)
            if row:
                self.lines.append(row)
        elif tag == "p" and not self.in_row:
            t = " ".join("".join(self.buf).split())
            if t:
                self.lines.append(t)
            self.buf = []

    def handle_data(self, data):
        self.buf.append(html.escape(data, quote=False))


def cpr_units(wanted):
    f = CACHE / "cpr_32011R0305_cs.xhtml"
    if not f.exists():
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_bytes(http_get(CPR_URL, accept="application/xhtml+xml", lang="ces"))
    doc = f.read_text(encoding="utf-8")
    units = {}
    for art in sorted({w.split(":")[1] for w in wanted}, key=int):
        m = re.search(rf'<div class="eli-subdivision" id="art_{art}">(.*?)(?=<div class="eli-subdivision" id="art_\d+">|<div class="eli-container"|$)', doc, re.S)
        if not m:
            print(f"  ! CPR čl. {art} nenalezen")
            continue
        block = m.group(1)
        title = re.search(r'class="oj-sti-art">(.*?)</p>', block, re.S)
        block = re.sub(r'<p[^>]*class="oj-ti-art"[^>]*>.*?</p>', "", block, flags=re.S)
        block = re.sub(r'<div class="eli-title".*?</div>', "", block, flags=re.S)
        fl = Flatten()
        fl.feed(block)
        lines = [ln.replace("<sup>", "") for ln in fl.lines]
        parts = []
        for ln in lines:
            mm = re.match(r"^(\d+)\.\s", html.unescape(ln))
            parts.append(["bod" if mm else "text", mm.group(1) if mm else "", 1, ln])
        units[f"art:{art}"] = {"label": f"Článek {art}", "heading": html.unescape(re.sub(r"<[^>]+>", "", title.group(1))).strip() if title else "", "parts": parts}
    return units


# ------------------------------------------------------------------------------------------

def main():
    sys.stdout.reconfigure(encoding="utf-8")
    refresh = "--refresh" in sys.argv
    qs = json.loads((ROOT / "data" / "questions.json").read_text(encoding="utf-8"))["questions"]
    wanted = {}
    for qn in qs:
        refs, _ = parse_citation(qn["src"])
        if qn["id"] in CITATION_FIXES:
            refs += parse_citation(CITATION_FIXES[qn["id"]])[0]
        refs += EXTRA_REFS.get(qn["id"], [])
        for r in refs:
            if r["law"]:
                wanted.setdefault(r["law"], set())
                if r["kind"] in ("par", "annex", "art", "row"):
                    wanted[r["law"]].add(f"{r['kind']}:{r['id']}")

    only = sys.argv[sys.argv.index("--only") + 1].split(",") if "--only" in sys.argv else None
    out = json.loads(OUT.read_text(encoding="utf-8")) if only and OUT.exists() else {}
    for key in sorted(wanted, key=lambda k: (k.split("/")[0], int(k.split("/")[1]), int(k.split("/")[2]))):
        if only and key not in only:
            continue
        typ, short, title, okruhy, _ = LAWS[key]
        entry = {"type": typ, "short": short, "title": title, "okruhy": okruhy, "units": {}}
        if key.startswith("eu/"):
            entry.update({"code": "(EU) č. 305/2011", "zneni": "původní znění (Úř. věst. L 88, 4. 4. 2011)",
                          "url": "https://eur-lex.europa.eu/legal-content/CS/TXT/?uri=CELEX:32011R0305"})
            entry["units"] = cpr_units(wanted[key])
            out[key] = entry
            print(f"{key}: {len(entry['units'])}/{len(wanted[key])} článků")
            continue
        print(f"{key} {short}", flush=True)
        meta = fetch_meta(key, refresh)
        stale = meta["staleUrl"]
        entry.update({
            "code": meta.get("kodDokumentuSbirky"),
            "zneni": meta.get("datumUcinnostiZneniOd"),
            "typZneni": meta.get("typZneni"),
            "url": f"{PORTAL}/{key}?zalozka=text",
        })
        if meta.get("uplnaCitace"):
            entry["title"] = meta["uplnaCitace"]
        if wanted[key]:
            frags = fetch_fragments(stale, refresh)
            units = build_units(frags, wanted[key])
            if key in TABLE_ROWS:
                units.update(table_units(frags, {k: v for k, v in TABLE_ROWS[key].items() if f"row:{k}" in wanted[key]}))
            # „příloha“ bez čísla = jediná příloha předpisu
            if "annex:" in wanted[key] and "annex:" not in units:
                annexes = sorted({re.match(r"/prilohy/priloha_?([0-9a-z]*)", (f["eli"] or "").split("/dokument", 1)[-1]).group(1)
                                  for f in frags if "/prilohy/priloha" in (f["eli"] or "")})
                if len(annexes) == 1:
                    units.update({"annex:": u for k, u in build_units(frags, {f"annex:{annexes[0]}"}).items()})
                else:
                    print(f"  ! nejednoznačná příloha bez čísla: {annexes}")
            entry["units"] = units
            missing = wanted[key] - set(units)
            if missing:
                print(f"  ! nenalezeno: {sorted(missing)}")
        out[key] = entry

    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=0), encoding="utf-8")
    size = OUT.stat().st_size
    print(f"→ {OUT.relative_to(ROOT)}  ({len(out)} předpisů, {sum(len(v['units']) for v in out.values())} ustanovení, {size / 1024:.0f} kB)")


if __name__ == "__main__":
    main()
