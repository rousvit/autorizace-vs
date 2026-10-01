"""Sestaví data aplikace do docs/data/ a přepíše verzi a seznam souborů v docs/sw.js.

Vstupy:
  data/questions.json         otázky z PDF (tools/extract_questions.py)
  data/laws.json              texty citovaných ustanovení (tools/fetch_laws.py)
  data/distractors/batch_*.json   chybné varianty a/b/c
  data/notes.json             (volitelně) ověřené poznámky k otázkám {id: "text"}

Spuštění:  python tools/build.py
"""
import datetime
import hashlib
import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from laws import CITATION_FIXES, EXTRA_REFS, LAW_NOTES, LAWS, parse_citation  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
DATA = ROOT / "data"


def norm(s):
    return re.sub(r"[\s.,;:]+", " ", s.lower()).strip()


def load_distractors():
    out = {}
    for f in sorted((DATA / "distractors").glob("batch_*.json")):
        for item in json.loads(f.read_text(encoding="utf-8")):
            out[item["id"]] = item
    return out


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    src = json.loads((DATA / "questions.json").read_text(encoding="utf-8"))
    laws = json.loads((DATA / "laws.json").read_text(encoding="utf-8"))
    distractors = load_distractors()
    notes_file = DATA / "notes.json"
    notes = json.loads(notes_file.read_text(encoding="utf-8")) if notes_file.exists() else {}

    warnings, missing = [], []
    questions = []
    for q in src["questions"]:
        refs, unresolved = parse_citation(q["src"])
        if unresolved:
            warnings.append(f"{q['id']}: nerozpoznaná citace {unresolved}")
        if q["id"] in CITATION_FIXES:
            for fr in parse_citation(CITATION_FIXES[q["id"]])[0]:
                same = next((r for r in refs if (r["law"], r["kind"], r["id"]) == (fr["law"], fr["kind"], fr["id"])), None)
                if same:
                    same.update(detail=fr["detail"], hl=fr["hl"])
                else:
                    fr["fix"] = True
                    refs.append(fr)
        for extra in EXTRA_REFS.get(q["id"], []):
            refs.append({"detail": "", "hl": {}, **extra})
        for r in refs:
            if r["law"]:
                r["short"] = LAWS[r["law"]][1]
                if r["kind"] in ("par", "annex", "art", "row") and f"{r['kind']}:{r['id']}" not in laws.get(r["law"], {}).get("units", {}):
                    warnings.append(f"{q['id']}: chybí text {r['law']} {r['kind']}:{r['id']}")
        item = {k: q[k] for k in ("id", "okruh", "num", "part", "q", "a", "src", "page")}
        item["refs"] = refs
        dd = distractors.get(q["id"])
        if dd and len(dd.get("d", [])) == 2 and all(x.strip() for x in dd["d"]):
            d = [x.strip() for x in dd["d"]]
            if norm(d[0]) == norm(d[1]) or norm(q["a"]) in (norm(d[0]), norm(d[1])):
                warnings.append(f"{q['id']}: varianty se shodují mezi sebou nebo se správnou odpovědí")
            for x in d:
                ratio = len(x) / max(1, len(q["a"]))
                if len(q["a"]) > 25 and not 0.45 <= ratio <= 2.2:
                    warnings.append(f"{q['id']}: nápadně jiná délka varianty ({ratio:.1f}×): {x[:60]}")
            item["d"] = d
        else:
            missing.append(q["id"])
        if notes.get(q["id"]):
            item["note"] = notes[q["id"]]
        questions.append(item)

    fetched = max((v.get("zneni") or "") for v in laws.values() if re.match(r"\d{4}-", v.get("zneni") or ""))
    payload = {
        "source": src["source"],
        "field": src["field"],
        "okruhy": src["okruhy"],
        "lawsFetched": datetime.date.today().strftime("%-d. %-m. %Y") if sys.platform != "win32" else datetime.date.today().strftime("%#d. %#m. %Y"),
        "latestLaw": fetched,
        "questions": questions,
    }
    out_dir = DOCS / "data"
    out_dir.mkdir(parents=True, exist_ok=True)
    compact = {"ensure_ascii": False, "separators": (",", ":")}
    for key, note in LAW_NOTES.items():
        if key in laws:
            laws[key]["note"] = note
    (out_dir / "laws.json").write_text(json.dumps(laws, **compact), encoding="utf-8")

    # verze = otisk všech souborů aplikace (kromě sw.js)
    payload["version"] = "pending"
    (out_dir / "questions.json").write_text(json.dumps(payload, **compact), encoding="utf-8")
    assets = sorted(
        p.relative_to(DOCS).as_posix() for p in DOCS.rglob("*")
        if p.is_file() and p.name not in ("sw.js", ".nojekyll", "robots.txt") and not p.name.startswith(".")
    )
    digest = hashlib.sha1()
    for a in assets:
        if a == "data/questions.json":
            continue
        digest.update(a.encode())
        digest.update((DOCS / a).read_bytes())
    digest.update(json.dumps(questions, ensure_ascii=False).encode())
    version = f"{datetime.date.today():%Y%m%d}-{digest.hexdigest()[:8]}"
    payload["version"] = version
    (out_dir / "questions.json").write_text(json.dumps(payload, **compact), encoding="utf-8")

    sw = (DOCS / "sw.js").read_text(encoding="utf-8")
    sw = re.sub(r"const VERSION = '[^']*';", f"const VERSION = '{version}';", sw)
    sw = re.sub(r"const ASSETS = \[[^\]]*\];", "const ASSETS = [" + ", ".join(f"'{a}'" for a in ["./"] + assets) + "];", sw)
    (DOCS / "sw.js").write_text(sw, encoding="utf-8")

    size = lambda p: f"{(out_dir / p).stat().st_size / 1024:.0f} kB"  # noqa: E731
    print(f"verze {version}: {len(questions)} otázek ({size('questions.json')}), předpisy {size('laws.json')}, {len(assets)} souborů v mezipaměti")
    print(f"varianty a/b/c: {len(questions) - len(missing)}/{len(questions)}" + (f" – chybí {len(missing)}: {' '.join(missing[:30])}{' …' if len(missing) > 30 else ''}" if missing else ""))
    for w in warnings:
        print("  !", w)


if __name__ == "__main__":
    main()
