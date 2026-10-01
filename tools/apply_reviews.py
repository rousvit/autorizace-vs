"""Zapracuje opravy z kontroly variant (data/distractors/review_*.json) do dávek batch_*.json.

Formát kontroly: [{"id": "A12", "i": 0, "problem": "...", "reason": "...", "replacement": "..."}]
Skript je idempotentní – už provedenou náhradu přeskočí.
"""
import collections
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIR = ROOT / "data" / "distractors"


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    batches = {}
    where = {}
    for f in sorted(DIR.glob("batch_*.json")):
        items = json.loads(f.read_text(encoding="utf-8"))
        batches[f] = items
        for it in items:
            where[it["id"]] = it

    stats, changed = collections.Counter(), 0
    for rf in sorted(DIR.glob("review_*.json")):
        for r in json.loads(rf.read_text(encoding="utf-8")):
            it = where.get(r["id"])
            rep = (r.get("replacement") or "").strip()
            if not it or r.get("i") not in (0, 1) or not rep:
                print(f"  ! přeskočeno {rf.name}: {r}")
                continue
            stats[r.get("problem", "?")] += 1
            if it["d"][r["i"]] == rep:
                continue
            other = it["d"][1 - r["i"]]
            if rep == other:
                print(f"  ! {r['id']}: náhrada je shodná s druhou variantou – přeskočeno")
                continue
            it["d"][r["i"]] = rep
            changed += 1

    for f, items in batches.items():
        f.write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"nalezené problémy: {dict(stats)}; nahrazeno {changed} variant")


if __name__ == "__main__":
    main()
