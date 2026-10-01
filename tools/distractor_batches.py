"""Připraví dávky otázek s textem citovaných ustanovení pro tvorbu chybných variant a/b/c.

Výstup: data/distractors/input/batch_N.json  (vstup pro tvorbu variant)
Hotové varianty se ukládají do data/distractors/batch_N.json ve tvaru
  [{"id": "A1", "d": ["chybná varianta 1", "chybná varianta 2"], "note": ""}]
"""
import html
import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from laws import LAWS, parse_citation  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data" / "distractors" / "input"
MAX_CONTEXT = 3500

BATCHES = [
    ("A", 1, 52), ("A", 53, 999), ("BC", 0, 999), ("DE", 0, 999),
    ("FG", 0, 999), ("HJ", 0, 999), ("IK", 0, 999), ("MNPR", 0, 999),
]


def plain(s):
    s = re.sub(r"<br\s*/?>", "\n", s)
    s = re.sub(r"</t[dh]>", " | ", s)
    s = re.sub(r"</tr>", "\n", s)
    s = re.sub(r"<[^>]+>", "", s)
    return html.unescape(s).strip()


def stems(text):
    return {w[:5] for w in re.findall(r"[^\W\d_]{4,}", text.lower())}


def relevant(lines, query, limit):
    """Řádky nejvíce se překrývající s otázkou a odpovědí, v původním pořadí."""
    qs = stems(query)
    scored = sorted(range(len(lines)), key=lambda i: -len(qs & stems(lines[i])))
    chosen, total = set(), 0
    for i in scored:
        if total + len(lines[i]) > limit:
            continue
        chosen.add(i)
        total += len(lines[i]) + 1
    return "\n".join(lines[i] for i in sorted(chosen))


def unit_text(unit, hl, query=""):
    """Celé ustanovení, nebo – je-li dlouhé – zvýrazněné či nejrelevantnější části."""
    parts = unit["parts"]
    lines = [("  " * max(0, p[2] - 1)) + plain(p[3]) for p in parts]
    full = "\n".join(lines)
    if len(full) <= MAX_CONTEXT:
        return full
    if not hl:
        return relevant(lines, query, MAX_CONTEXT)
    keep, cur_odst = [], None
    for p, line in zip(parts, lines):
        typ, num = p[0], p[1]
        if typ == "odst":
            cur_odst = num
        path = p[4] if len(p) > 4 else ""
        hit = (
            ("odst" in hl and cur_odst in hl["odst"] and ("pism" not in hl or typ != "pism" or num in hl["pism"]))
            or ("pism" in hl and "odst" not in hl and typ == "pism" and num in hl["pism"])
            or ("bod" in hl and (path == hl["bod"][0] or path.startswith(hl["bod"][0] + ".") or (not path and num == hl["bod"][0])))
            or ("cast" in hl and (path == hl["cast"][0] or path.startswith(hl["cast"][0] + ".")))
        )
        if hit:
            keep.append(line)
    text = "\n".join(keep) if keep else relevant(lines, query, MAX_CONTEXT)
    return text[:MAX_CONTEXT]


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    qs = json.loads((ROOT / "data" / "questions.json").read_text(encoding="utf-8"))["questions"]
    laws = json.loads((ROOT / "data" / "laws.json").read_text(encoding="utf-8"))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for n, (okruhy, lo, hi) in enumerate(BATCHES, 1):
        items = []
        for q in qs:
            if q["okruh"] not in okruhy or not (lo <= q["num"] <= hi):
                continue
            refs, _ = parse_citation(q["src"])
            ctx = []
            for r in refs:
                if not r["law"]:
                    continue
                law = laws.get(r["law"], {})
                name = f"{LAWS[r['law']][1]} ({law.get('code', '')}, znění od {law.get('zneni', '?')})"
                unit = law.get("units", {}).get(f"{r['kind']}:{r['id']}")
                if unit:
                    ctx.append(f"### {unit.get('label', '')} – {name}\n{unit_text(unit, r['hl'], q['q'] + ' ' + q['a'])}")
                else:
                    ctx.append(f"### {name} (text ustanovení není k dispozici)")
            items.append({
                "id": q["id"], "part": q["part"], "question": q["q"], "correct": q["a"],
                "source": q["src"], "law_text": "\n\n".join(ctx)[: MAX_CONTEXT * 2],
            })
        f = OUT_DIR / f"batch_{n}.json"
        f.write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{f.relative_to(ROOT)}: {len(items)} otázek ({okruhy} {lo}–{hi if hi < 999 else 'konec'}), {f.stat().st_size // 1024} kB")


if __name__ == "__main__":
    main()
