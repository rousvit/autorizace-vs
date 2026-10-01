"""Vytáhne otázky oboru VS z PDF ČKAIT do data/questions.json.

Rozpoznávání stojí na typografii PDF (ověřeno na 2. vydání V4):
  otázka  = Calibri-Bold 10 (řádek začíná kódem, např. „A12“)
  odpověď = Calibri 10 za odrážkou ▪ (Wingdings)
  zdroj   = Calibri-BoldItalic 9 za pomlčkou (CourierNew)
Horní indexy (m²) mají velikost 6,5 a příznak superscript.

Obecné vs. oborové otázky PDF nevyznačuje. Obecná = kód se vyskytuje
v alespoň 13 ze 14 kapitol (obory i specializace), ostatní jsou oborové.

Spuštění:  python tools/extract_questions.py
"""
import collections
import json
import pathlib
import re
import sys

import fitz  # PyMuPDF

ROOT = pathlib.Path(__file__).resolve().parent.parent
PDF = ROOT / "OTAZKY-ke-zkouskam-vydání_2-2026.pdf"
OUT = ROOT / "data" / "questions.json"

# První strana každé kapitoly podle obsahu (tištěné číslo = číslo strany PDF).
CHAPTERS = {
    "PS": 7, "TZS": 52, "TPS": 92, "DS": 131, "VS": 171, "MIK": 208, "SaD": 245,
    "PBS": 274, "GE": 307, "MI": 337, "LS": 374, "ZaD": 406, "EA": 435, "PBSS": 466,
}
END_PAGE = 502  # poslední strana s otázkami
FIELD = "VS"
GENERAL_MIN_CHAPTERS = 13

OKRUHY = {
    "A": "Stavební zákon, prováděcí vyhlášky a související předpisy",
    "B": "Požadavky na výstavbu",
    "C": "Autorizace ve výstavbě",
    "D": "Soukromé a trestní právo",
    "E": "Zadávání veřejných zakázek",
    "F": "Živnostenský zákon",
    "G": "Životní prostředí",
    "H": "Technické normy a požadavky na výrobky",
    "I": "Bezpečnost práce",
    "J": "Požární bezpečnost",
    "K": "Katastr nemovitostí a zeměměřictví",
    "L": "Dopravní a mostní stavby",
    "M": "Vodní díla",
    "N": "Geologické a horní právo",
    "O": "Energetický zákon",
    "P": "Elektronické komunikace",
    "R": "Hospodaření energií",
}

CODE_RE = re.compile(r"^\s*(J\+|[A-R])(\d{1,3})(?=\s|$)")
SUPERSCRIPT = str.maketrans("0123456789", "⁰¹²³⁴⁵⁶⁷⁸⁹")
WORD_RE = re.compile(r"[^\W\d_]+(?:-[^\W\d_]+)*", re.UNICODE)


def chapter_ranges():
    keys = list(CHAPTERS)
    for i, k in enumerate(keys):
        last = CHAPTERS[keys[i + 1]] - 1 if i + 1 < len(keys) else END_PAGE
        yield k, CHAPTERS[k], last


def body_lines(page):
    """Řádky těla strany v pořadí čtení (dva sloupce na šířku), bez záhlaví a zápatí."""
    half = page.rect.width / 2
    out = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            spans = [s for s in line["spans"] if s["text"].strip() or s["text"] == " "]
            spans = [s for s in spans if s["text"]]
            if not spans:
                continue
            x0, y0 = line["bbox"][0], line["bbox"][1]
            if y0 < 50 or y0 > 540:
                continue
            out.append((0 if x0 < half else 1, y0, x0, spans))
    out.sort(key=lambda t: (t[0], round(t[1], 1), t[2]))
    return out


def span_kind(span):
    font, size, flags = span["font"], span["size"], span["flags"]
    if "Wingdings" in font:
        return "bullet"
    if "Courier" in font:
        return "dash"
    if flags & 1 and size < 8:
        return "sup"
    if "BoldItalic" in font:
        return "src"
    if "Bold" in font and size >= 12:
        return "title"
    if "Bold" in font:
        return "q"
    return "a"


def build_vocabulary(doc):
    """Slova, která se v dokumentu vyskytují uvnitř řádku (ne na jeho konci s rozdělením)."""
    plain, hyphenated = collections.Counter(), collections.Counter()
    for page in doc:
        for raw in page.get_text().split("\n"):
            line = raw.strip()
            words = WORD_RE.findall(line)
            if line.endswith("-") and words:
                words = words[:-1]
            for w in words:
                (hyphenated if "-" in w else plain)[w.lower()] += 1
    return plain, hyphenated


class Joiner:
    """Spojuje zalomené řádky a rozhoduje o dělení slov na konci řádku."""

    def __init__(self, plain, hyphenated):
        self.plain, self.hyphenated = plain, hyphenated
        self.log = []

    def join(self, lines):
        text = ""
        for line in lines:
            line = line.strip()
            if not line:
                continue
            if not text:
                text = line
                continue
            m = re.search(r"([^\W\d_]+)-$", text)
            in_url = "/" in text.rsplit(" ", 1)[-1]
            if m and in_url:
                text = text + line
            elif m and not text.endswith(" -"):
                head = m.group(1)
                tail_m = re.match(r"[^\W\d_]+", line)
                tail = tail_m.group(0) if tail_m else ""
                joined = (head + tail).lower()
                if tail and joined in self.plain:
                    text = text[:-1] + line
                elif tail and f"{head}-{tail}".lower() in self.hyphenated:
                    text = text + line
                    self.log.append(("ponechán spojovník", f"{head}-{tail}"))
                elif not tail:
                    text = text + " " + line
                else:
                    text = text[:-1] + line
                    self.log.append(("spojeno bez opory ve slovníku", head + tail))
            else:
                text = text + " " + line
        text = text.replace("‑", "-").replace(" ", " ")
        text = re.sub(r"\s+", " ", text).strip()
        text = re.sub(r"\s+([,.;:)])", r"\1", text)
        text = re.sub(r"\(\s+", "(", text)
        return text


def parse_range(doc, first, last):
    """Vrátí seznam otázek: {code, q_lines, answers: [lines], src_lines, page}."""
    questions, cur, field = [], None, None
    for pno in range(first - 1, last):
        for _col, _y, _x, spans in body_lines(doc[pno]):
            line_kinds = [span_kind(s) for s in spans]
            line_text = "".join(s["text"] for s in spans)
            first_kind = next((k for k, s in zip(line_kinds, spans) if s["text"].strip()), None)
            if first_kind == "title":
                continue
            m = CODE_RE.match(line_text) if first_kind == "q" else None
            if m and (cur is None or field in ("a", "src")):
                cur = {"code": m.group(1) + m.group(2), "q": [], "a": [], "src": [], "page": pno + 1}
                questions.append(cur)
                field = "q"
                rest = line_text[m.end():]
                cur["q"].append(rest)
                continue
            if cur is None:
                continue
            # Řádek skládáme po spanech, horní index připojíme k předchozímu poli.
            buf, buf_kind = "", None
            def flush():
                nonlocal buf, buf_kind, field
                if buf_kind is None:
                    return
                target = {"q": "q", "a": "a", "src": "src"}[buf_kind]
                if target == "a":
                    if not cur["a"]:
                        cur["a"].append([])
                    cur["a"][-1].append(buf)
                else:
                    cur[target].append(buf)
                field = target
                buf, buf_kind = "", None
            for kind, s in zip(line_kinds, spans):
                t = s["text"]
                if kind == "bullet":
                    flush()
                    cur["a"].append([])
                    field = "a"
                    continue
                if kind == "dash":
                    flush()
                    field = "src"
                    continue
                if kind == "sup":
                    if buf_kind is None:
                        # horní index na začátku řádku patří k poslednímu poli
                        target = field or "a"
                        if target == "a" and cur["a"] and cur["a"][-1]:
                            cur["a"][-1][-1] = cur["a"][-1][-1].rstrip() + t.translate(SUPERSCRIPT)
                        elif cur.get(target):
                            cur[target][-1] = cur[target][-1].rstrip() + t.translate(SUPERSCRIPT)
                    else:
                        buf = buf.rstrip() + t.translate(SUPERSCRIPT)
                    continue
                if kind == "title":
                    continue
                if t.strip() == "" and buf_kind is None:
                    continue
                if buf_kind not in (None, kind) and t.strip():
                    flush()
                if t.strip():
                    buf_kind = kind
                buf += t
            flush()
    return questions


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    doc = fitz.open(PDF)
    plain, hyphenated = build_vocabulary(doc)
    joiner = Joiner(plain, hyphenated)

    presence = collections.defaultdict(set)
    parsed = {}
    for key, first, last in chapter_ranges():
        qs = parse_range(doc, first, last)
        parsed[key] = qs
        for q in qs:
            presence[q["code"]].add(key)

    out = []
    for q in parsed[FIELD]:
        code = q["code"]
        okruh = "J+" if code.startswith("J+") else code[0]
        answers = [joiner.join(lines) for lines in q["a"]]
        answers = [a for a in answers if a]
        src = joiner.join(q["src"])
        src = re.sub(r'^"\s*|\s*"$', "", src).strip()
        if not src and answers:
            # D31: zdroj je v PDF obyčejným písmem bez pomlčky, přilepený za odpovědí
            m = re.search(r"\s(§\s?\d.*)$", answers[-1])
            if m:
                src = m.group(1).strip()
                answers[-1] = answers[-1][:m.start()].strip()
        out.append({
            "id": code,
            "okruh": okruh,
            "num": int(code[len(okruh):]),
            "part": "obecna" if len(presence[code]) >= GENERAL_MIN_CHAPTERS else "oborova",
            "q": joiner.join(q["q"]),
            "a": " ".join(answers),
            "src": src,
            "page": q["page"],
        })

    problems = [x["id"] for x in out if not (x["q"] and x["a"] and x["src"])]
    dupes = [k for k, v in collections.Counter(x["id"] for x in out).items() if v > 1]
    payload = {
        "source": "Otázky k písemné části zkoušky odborné způsobilosti ČKAIT, 2. vydání, V4 (30. 7. 2026)",
        "field": "Stavby vodního hospodářství a krajinného inženýrství (VS)",
        "okruhy": {k: v for k, v in OKRUHY.items() if any(x["okruh"] == k for x in out)},
        "questions": out,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")

    parts = collections.Counter(x["part"] for x in out)
    print(f"{len(out)} otázek → {OUT.relative_to(ROOT)}  ({dict(parts)})")
    print("po okruzích:", dict(collections.Counter(x["okruh"] for x in out)))
    if problems:
        print("NEÚPLNÉ:", problems)
    if dupes:
        print("DUPLICITY:", dupes)
    for kind, word in sorted(set(joiner.log)):
        print(f"  [{kind}] {word}")


if __name__ == "__main__":
    main()
