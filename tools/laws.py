"""Registr předpisů citovaných v otázkách a parser citací zdrojů.

parse_citation("§ 213 písm. a) a § 214 odst. 1 písm. a) stavebního zákona")
→ [{"law": "sb/2021/283", "kind": "par", "id": "213", "detail": "písm. a)"},
   {"law": "sb/2021/283", "kind": "par", "id": "214", "detail": "odst. 1 písm. a)"}]
"""
import re

# key: (typ, krátký název, úplný název, okruhy, regulární výrazy aliasů v citacích)
LAWS = {
    "sb/2021/283": ("zákon", "stavební zákon", "Zákon č. 283/2021 Sb., stavební zákon", "AB",
                    [r"(?:nového )?stavebního zákona", r"ke stavebnímu zákonu", r"zákona č\. 283/2021 Sb\.(?:, stavební zákon)?"]),
    "sb/2024/146": ("vyhláška", "vyhláška o požadavcích na výstavbu", "Vyhláška č. 146/2024 Sb., o požadavcích na výstavbu", "B",
                    [r"\bPV\b", r"vyhlášky o požadavcích na výstavbu", r"vyhlášky č\. 146/2024 Sb\."]),
    "sb/1992/360": ("zákon", "autorizační zákon", "Zákon č. 360/1992 Sb., o výkonu povolání autorizovaných architektů a o výkonu povolání autorizovaných inženýrů a techniků činných ve výstavbě", "C",
                    [r"autorizačního zákona", r"zákona č\. 360/1992 Sb\."]),
    "sb/2012/89": ("zákon", "občanský zákoník", "Zákon č. 89/2012 Sb., občanský zákoník", "DK",
                   [r"občanského zákoníku"]),
    "sb/2009/40": ("zákon", "trestní zákoník", "Zákon č. 40/2009 Sb., trestní zákoník", "D",
                   [r"trestního zákoníku"]),
    "sb/2011/418": ("zákon", "zákon o trestní odpovědnosti právnických osob", "Zákon č. 418/2011 Sb., o trestní odpovědnosti právnických osob a řízení proti nim", "D",
                    [r"zákona č\. 418/2011 Sb\.(?:, o trestní odpovědnosti právnických osob a řízení proti nim)?"]),
    "sb/2016/134": ("zákon", "zákon o zadávání veřejných zakázek", "Zákon č. 134/2016 Sb., o zadávání veřejných zakázek", "E",
                    [r"zákona o zadávání veřejných zakázek"]),
    "sb/2016/169": ("vyhláška", "vyhláška o dokumentaci veřejné zakázky", "Vyhláška č. 169/2016 Sb., o stanovení rozsahu dokumentace veřejné zakázky na stavební práce a soupisu stavebních prací, dodávek a služeb s výkazem výměr", "E",
                    [r"vyhlášky č\. 169/2016 Sb\."]),
    "sb/1991/455": ("zákon", "živnostenský zákon", "Zákon č. 455/1991 Sb., o živnostenském podnikání (živnostenský zákon)", "F",
                    [r"živnostenského zákona"]),
    "sb/2008/278": ("nařízení vlády", "nařízení o obsahových náplních živností", "Nařízení vlády č. 278/2008 Sb., o obsahových náplních jednotlivých živností", "F",
                    [r"nařízení vlády č\. 278/2008 Sb\."]),
    "sb/2001/254": ("zákon", "vodní zákon", "Zákon č. 254/2001 Sb., o vodách a o změně některých zákonů (vodní zákon)", "GM",
                    [r"vodního zákona"]),
    "sb/2001/274": ("zákon", "zákon o vodovodech a kanalizacích", "Zákon č. 274/2001 Sb., o vodovodech a kanalizacích pro veřejnou potřebu (zákon o vodovodech a kanalizacích)", "GM",
                    [r"zákona o vodovodech a kanalizacích"]),
    "sb/2020/541": ("zákon", "zákon o odpadech", "Zákon č. 541/2020 Sb., o odpadech", "G",
                    [r"zákona o odpadech", r"zákona č\. 541/2020 Sb\.(?:, o odpadech)?"]),
    "sb/2001/100": ("zákon", "zákon o posuzování vlivů na životní prostředí", "Zákon č. 100/2001 Sb., o posuzování vlivů na životní prostředí", "G",
                    [r"zákona o posuzov[aá]ní vlivů na životní prostředí"]),
    "sb/1992/114": ("zákon", "zákon o ochraně přírody a krajiny", "Zákon č. 114/1992 Sb., o ochraně přírody a krajiny", "G",
                    [r"zákona o ochraně přírody a krajiny"]),
    "sb/2012/201": ("zákon", "zákon o ochraně ovzduší", "Zákon č. 201/2012 Sb., o ochraně ovzduší", "G",
                    [r"zákona o ochraně ovzduší"]),
    "sb/2012/73": ("zákon", "zákon o regulovaných a F-plynech", "Zákon č. 73/2012 Sb., o látkách, které poškozují ozonovou vrstvu, a o fluorovaných skleníkových plynech", "G",
                   [r"zákona č\. 73/2012 Sb\.(?:, o látkách, které poškozují ozonovou vrstvu a fluorovaných skleníkových plynech)?"]),
    "sb/2012/383": ("zákon", "zákon o povolenkách na emise", "Zákon č. 383/2012 Sb., o podmínkách obchodování s povolenkami na emise skleníkových plynů", "G",
                    [r"zákona č\. 383/2012 Sb\."]),
    "sb/2002/76": ("zákon", "zákon o integrované prevenci", "Zákon č. 76/2002 Sb., o integrované prevenci a o omezování znečištění", "G",
                   [r"zákona č\. 76/2002 Sb\."]),
    "sb/2008/25": ("zákon", "zákon o integrovaném registru znečišťování", "Zákon č. 25/2008 Sb., o integrovaném registru znečišťování životního prostředí", "G",
                   [r"zákona č\. 25/2008 Sb\."]),
    "sb/1997/22": ("zákon", "zákon o technických požadavcích na výrobky", "Zákon č. 22/1997 Sb., o technických požadavcích na výrobky", "H",
                   [r"zákona č\. 22/1997 Sb\."]),
    "sb/2002/163": ("nařízení vlády", "nařízení o vybraných stavebních výrobcích", "Nařízení vlády č. 163/2002 Sb., kterým se stanoví technické požadavky na vybrané stavební výrobky", "H",
                    [r"nařízení vlády č\. 163/2002 Sb\."]),
    "sb/2016/90": ("zákon", "zákon o posuzování shody stanovených výrobků", "Zákon č. 90/2016 Sb., o posuzování shody stanovených výrobků při jejich dodávání na trh", "H",
                   [r"zákona č\. 90/2016 Sb\."]),
    "eu/2011/305": ("nařízení EU", "nařízení CPR", "Nařízení Evropského parlamentu a Rady (EU) č. 305/2011, kterým se stanoví harmonizované podmínky pro uvádění stavebních výrobků na trh (CPR)", "H",
                    [r"nařízení EP a Rady \(EU\) č\. 305/2011"]),
    "sb/2006/262": ("zákon", "zákoník práce", "Zákon č. 262/2006 Sb., zákoník práce", "I",
                    [r"zákoníku práce"]),
    "sb/2006/309": ("zákon", "zákon o zajištění dalších podmínek BOZP", "Zákon č. 309/2006 Sb., o zajištění dalších podmínek bezpečnosti a ochrany zdraví při práci", "I",
                    [r"zákona č\. 309/2006 Sb\."]),
    "sb/2005/251": ("zákon", "zákon o inspekci práce", "Zákon č. 251/2005 Sb., o inspekci práce", "I",
                    [r"zákona č\. 251/2005 Sb\."]),
    "sb/2021/250": ("zákon", "zákon o vyhrazených technických zařízeních", "Zákon č. 250/2021 Sb., o bezpečnosti práce v souvislosti s provozem vyhrazených technických zařízení", "I",
                    [r"zákona č\. 250/2021 Sb\."]),
    "sb/2021/390": ("nařízení vlády", "nařízení o OOPP", "Nařízení vlády č. 390/2021 Sb., o bližších podmínkách poskytování osobních ochranných pracovních prostředků", "I",
                    [r"nařízení vlády č\. 390/2021 Sb\."]),
    "sb/2005/101": ("nařízení vlády", "nařízení o pracovištích", "Nařízení vlády č. 101/2005 Sb., o podrobnějších požadavcích na pracoviště a pracovní prostředí", "I",
                    [r"nařízení vlády č\. 101/2005 Sb\."]),
    "sb/2005/362": ("nařízení vlády", "nařízení o práci ve výškách", "Nařízení vlády č. 362/2005 Sb., o bližších požadavcích na bezpečnost a ochranu zdraví při práci na pracovištích s nebezpečím pádu z výšky nebo do hloubky", "I",
                    [r"nařízení vlády č\. 362/2005 Sb\.(?:, o bližších požadavcích na bezpečnost a ochranu zdraví při práci na pracovištích s nebezpečím pádu z výšky nebo do hloubky)?"]),
    "sb/2006/591": ("nařízení vlády", "nařízení o BOZP na staveništích", "Nařízení vlády č. 591/2006 Sb., o bližších minimálních požadavcích na bezpečnost a ochranu zdraví při práci na staveništích", "I",
                    [r"nařízení vlády č\. 591/2006 Sb\."]),
    "sb/2007/361": ("nařízení vlády", "nařízení o ochraně zdraví při práci", "Nařízení vlády č. 361/2007 Sb., kterým se stanoví podmínky ochrany zdraví při práci", "I",
                    [r"nařízení vlády č\. 361/2007 Sb\."]),
    "sb/2022/190": ("nařízení vlády", "nařízení o elektrických VTZ", "Nařízení vlády č. 190/2022 Sb., o vyhrazených technických elektrických zařízeních", "I",
                    [r"nařízení vlády č\. 190/2022 Sb\."]),
    "sb/2022/191": ("nařízení vlády", "nařízení o plynových VTZ", "Nařízení vlády č. 191/2022 Sb., o vyhrazených technických plynových zařízeních", "I",
                    [r"nařízení vlády č\. 191/2022 Sb\."]),
    "sb/2022/192": ("nařízení vlády", "nařízení o tlakových VTZ", "Nařízení vlády č. 192/2022 Sb., o vyhrazených technických tlakových zařízeních", "I",
                    [r"nařízení vlády č\. 192/2022 Sb\."]),
    "sb/2022/193": ("nařízení vlády", "nařízení o zdvihacích VTZ", "Nařízení vlády č. 193/2022 Sb., o vyhrazených technických zdvihacích zařízeních", "I",
                    [r"nařízení vlády č\. 193/2022 Sb\."]),
    "sb/2022/194": ("nařízení vlády", "nařízení o odborné způsobilosti v elektrotechnice", "Nařízení vlády č. 194/2022 Sb., o požadavcích na odbornou způsobilost k výkonu činnosti na elektrických zařízeních", "I",
                    [r"nařízení vlády č\. 194/2022 Sb\."]),
    "sb/1985/133": ("zákon", "zákon o požární ochraně", "Zákon č. 133/1985 Sb., o požární ochraně", "J",
                    [r"zákona č\. 133/1985 Sb\.(?:, o požární ochraně)?"]),
    "sb/2001/246": ("vyhláška", "vyhláška o požární prevenci", "Vyhláška č. 246/2001 Sb., o stanovení podmínek požární bezpečnosti a výkonu státního požárního dozoru (vyhláška o požární prevenci)", "J",
                    [r"vyhlášky č\. 246/2001 Sb\.(?:, o stanovení podmínek požární bezpečnosti a výkonu státního požárního dozoru \(vyhláška o požární prevenci\))?"]),
    "sb/2008/23": ("vyhláška", "vyhláška o technických podmínkách požární ochrany staveb", "Vyhláška č. 23/2008 Sb., o technických podmínkách požární ochrany staveb", "J",
                   [r"vyhlášky č\. 23/2008 Sb\.(?:, o technických podmínkách požární ochrany staveb)?"]),
    "sb/2021/460": ("vyhláška", "vyhláška o kategorizaci staveb", "Vyhláška č. 460/2021 Sb., o kategorizaci staveb z hlediska požární bezpečnosti a ochrany obyvatelstva", "J",
                    [r"[Vv]yhlášk[ay] č\. 460/2021 Sb\.(?:, o kategorizaci staveb(?:,)? z hlediska(?: požární bezpečnosti a ochrany obyvatelstva)?)?"]),
    "sb/2013/256": ("zákon", "katastrální zákon", "Zákon č. 256/2013 Sb., o katastru nemovitostí (katastrální zákon)", "K",
                    [r"katastrálního zákona"]),
    "sb/1994/200": ("zákon", "zákon o zeměměřictví", "Zákon č. 200/1994 Sb., o zeměměřictví", "K",
                    [r"zákona č\. 200/1994 Sb\."]),
    "sb/1988/62": ("zákon", "zákon o geologických pracích", "Zákon č. 62/1988 Sb., o geologických pracích", "N",
                   [r"zákona o geologických pracích"]),
    "sb/1988/44": ("zákon", "horní zákon", "Zákon č. 44/1988 Sb., o ochraně a využití nerostného bohatství (horní zákon)", "N",
                   [r"horního zákona"]),
    "sb/1988/61": ("zákon", "zákon o hornické činnosti", "Zákon č. 61/1988 Sb., o hornické činnosti, výbušninách a o státní báňské správě", "N",
                   [r"zákona č\. 61/1988 Sb\.", r"zákona o hornické činnosti"]),
    "sb/1996/55": ("vyhláška", "vyhláška ČBÚ o činnosti v podzemí", "Vyhláška Českého báňského úřadu č. 55/1996 Sb., o požadavcích k zajištění bezpečnosti a ochrany zdraví při práci a bezpečnosti provozu při činnosti prováděné hornickým způsobem v podzemí", "N",
                   [r"vyhlášky ČBÚ č\. 55/1996 Sb\."]),
    "sb/2005/127": ("zákon", "zákon o elektronických komunikacích", "Zákon č. 127/2005 Sb., o elektronických komunikacích", "P",
                    [r"zákona č\. 127/2005 Sb\."]),
    "sb/2009/416": ("zákon", "zákon o urychlení výstavby infrastruktury", "Zákon č. 416/2009 Sb., o urychlení výstavby strategicky významné infrastruktury", "P",
                    [r"zákona č\. 416/2009 Sb\."]),
    "sb/2000/406": ("zákon", "zákon o hospodaření energií", "Zákon č. 406/2000 Sb., o hospodaření energií", "R",
                    [r"zákona o hospodaření energií"]),
    "sb/1999/137": ("vyhláška", "vyhláška o seznamu vodárenských nádrží", "Vyhláška č. 137/1999 Sb., kterou se stanoví seznam vodárenských nádrží a zásady pro stanovení a změny ochranných pásem vodních zdrojů", "M",
                    [r"vyhláška č\. 137/1999 Sb\.(?:, kterou se stanoví seznam vodárenských nádrží)?"]),
}

# Opravy citací ve sbírce otázek (ověřeno proti aktuálnímu znění): id otázky → správná citace.
# Ustanovení se přidá k odkazům otázky, případně upřesní zvýraznění u stejného paragrafu.
CITATION_FIXES = {
    "A61": "§ 164 odst. 1 písm. b) stavebního zákona",
    "A82": "§ 221 odst. 3 stavebního zákona",
    "G3": "§ 4 zákona o vodovodech a kanalizacích",
}

# Doplňkové odkazy na řádky tabulek v přílohách (otázka cituje jen celý předpis).
# Klíč „row:…“ vytváří fetch_laws.TABLE_ROWS z textu přílohy.
EXTRA_REFS = {
    "F18": [{"law": "sb/2008/278", "kind": "row", "id": "p2-provadeni-staveb", "label": "Příloha č. 2 – Provádění staveb",
             "hl": {"match": "živností řemeslných"}}],
    "F19": [{"law": "sb/2008/278", "kind": "row", "id": "p2-provadeni-staveb", "label": "Příloha č. 2 – Provádění staveb",
             "hl": {"match": "vedení realizace staveb"}}],
    "F20": [{"law": "sb/2008/278", "kind": "row", "id": "p4-70", "label": "Příloha č. 4 – obor 70",
             "hl": {"match": "technického dozoru"}}],
}

# Poznámky k celým předpisům (zobrazí se u textu předpisu v aplikaci).
LAW_NOTES = {
    "eu/2011/305": "Nařízení (EU) 2024/3110 (nové nařízení o stavebních výrobcích) postupně nahrazuje nařízení č. 305/2011 "
                   "s přechodným obdobím. Otázky ve sbírce ČKAIT vycházejí z nařízení č. 305/2011.",
}

_ALIASES = [(k, p) for k, v in LAWS.items() for p in v[4]]
ALIAS_RE = re.compile("|".join(f"(?P<k{i}>{p})" for i, (_, p) in enumerate(_ALIASES)))
_ALIAS_KEYS = [k for k, _ in _ALIASES]

NUM = r"\d+[a-z]{0,2}"
TOKEN_RE = re.compile(rf"§|odst(?:\.|avec)|písm\.|příloh[aeyu]?|Příloh[aeyu]?|čl\.|bod|část|věta|až|a\)|[b-z]\)|{NUM}\.?\)?|,|\ba\b|\S+")


def _law_spans(src):
    for m in ALIAS_RE.finditer(src):
        idx = next(int(name[1:]) for name, val in m.groupdict().items() if val is not None)
        yield m.start(), m.end(), _ALIAS_KEYS[idx]


def _refs_in_segment(seg, law):
    """Rozebere úsek citace patřící jednomu předpisu."""
    refs = []
    # přílohy
    for m in re.finditer(r"[Pp]říloh[aeyu]?(?:\s+č\.\s*((?:\d+[a-z]?)(?:\s*(?:,|a)\s*\d+[a-z]?)*))?(?P<detail>(?:\s+(?:bod|část|písm\.)\s*[\w.]+\)?)*)", seg):
        nums = re.findall(r"\d+[a-z]?", m.group(1) or "") or [""]
        detail = (m.group("detail") or "").strip()
        before = seg[:m.start()]
        # „odst. 1 písm. c) přílohy č. 2“ — detail stojí před slovem příloha
        pre = re.search(r"(odst(?:\.|avec)\s*\d+[^§]*?)\s*$", before)
        if pre and "§" not in before[pre.start():]:
            detail = (pre.group(1) + " " + detail).strip()
        for n in nums:
            refs.append({"law": law, "kind": "annex", "id": n, "detail": detail})
    seg_wo_annex = re.split(r"[Pp]říloh", seg)[0] if "§" not in seg else seg
    # články (nařízení EU)
    for m in re.finditer(r"čl\.\s*(\d+)(?P<detail>\s+bod\s*\d+\.?)?", seg):
        refs.append({"law": law, "kind": "art", "id": m.group(1), "detail": (m.group("detail") or "").strip()})
    # paragrafy
    for m in re.finditer(r"§\s*(.*?)(?=§|[Pp]říloh|$)", seg_wo_annex):
        body = m.group(1)
        body = re.split(r"\b(?:a\s+)?(?:odst(?:\.|avec)\s*\d+\s*písm\.[^§]*?)?přílo", body)[0]
        refs.extend(_parse_par_list(body, law))
    return refs


def _parse_par_list(body, law):
    """„2620 až 2622“, „1089, 1091 a 1095“, „143 odst. 2 a 273“, „13 písm. i) a l)“."""
    out, cur, category = [], None, "par"
    tokens = re.findall(rf"odst(?:\.|avec)|písm\.|bod|věta\s+\w+|až|násl\.|[a-z]\)|{NUM}|,|\ba\b", body)
    pending_range = False
    for tok in tokens:
        if tok in ("odst.", "odstavec"):
            category = "odst"
            continue
        if tok == "písm.":
            category = "pism"
            continue
        if tok == "bod":
            category = "bod"
            continue
        if tok.startswith("věta"):
            if cur:
                cur["detail"] = (cur["detail"] + " " + tok).strip()
            continue
        if tok == "až":
            pending_range = True
            continue
        if tok in (",", "a", "násl."):
            continue
        if re.fullmatch(r"[a-z]\)", tok):
            if cur:
                if "písm." not in cur["detail"]:
                    cur["detail"] = (cur["detail"] + " písm. " + tok).strip()
                else:
                    cur["detail"] += (" až " if pending_range else ", ") + tok
            pending_range = False
            continue
        if re.fullmatch(NUM, tok):
            is_par = category == "par" or (category == "odst" and int(re.match(r"\d+", tok).group(0)) > 30)
            if is_par:
                if pending_range and cur and cur["id"].isdigit() and tok.isdigit():
                    for n in range(int(cur["id"]) + 1, int(tok) + 1):
                        out.append({"law": law, "kind": "par", "id": str(n), "detail": ""})
                    cur = out[-1]
                else:
                    cur = {"law": law, "kind": "par", "id": tok, "detail": ""}
                    out.append(cur)
                category = "par"
            elif cur:
                label = {"odst": "odst.", "bod": "bod"}[category] if category in ("odst", "bod") else ""
                if category == "odst":
                    if "odst." in cur["detail"]:
                        cur["detail"] += (" až " if pending_range else ", ") + tok
                    else:
                        cur["detail"] = (cur["detail"] + f" odst. {tok}").strip()
                elif category == "bod":
                    cur["detail"] = (cur["detail"] + f" bod {tok}").strip()
                elif label:
                    cur["detail"] = (cur["detail"] + f" {label} {tok}").strip()
            pending_range = False
    return out


def _expand(items, letters=False):
    """['1', 'až', '3'] → ['1', '2', '3'];  ['a', 'až', 'c'] → ['a', 'b', 'c']."""
    out, i = [], 0
    while i < len(items):
        if items[i] == "až" and out and i + 1 < len(items):
            a, b = out[-1], items[i + 1]
            if letters and len(a) == 1 and len(b) == 1:
                out.extend(chr(c) for c in range(ord(a) + 1, ord(b) + 1))
            elif a.isdigit() and b.isdigit():
                out.extend(str(n) for n in range(int(a) + 1, int(b) + 1))
            else:
                out.append(b)
            i += 2
            continue
        out.append(items[i])
        i += 1
    return out


def targets(detail):
    """Z „odst. 1 písm. a) až c)“ odvodí, co v textu předpisu zvýraznit."""
    t = {}
    m = re.search(r"odst(?:\.|avec)\s*([\d\s,až]+)", detail)
    if m:
        t["odst"] = _expand(re.findall(r"\d+|až", m.group(1)))
    m = re.search(r"písm\.\s*((?:[a-z]\)|\s|,|až)+)", detail)
    if m:
        t["pism"] = _expand(re.findall(r"([a-z])\)|(až)", m.group(1)) and
                            [x or y for x, y in re.findall(r"([a-z])\)|(až)", m.group(1))], letters=True)
    m = re.search(r"\bbod\s*(\d+(?:\.\d+)*)", detail)
    if m:
        t["bod"] = [m.group(1).rstrip(".")]
    m = re.search(r"\bčást\s*(\d+)", detail)
    if m:
        t["cast"] = [m.group(1)]
    return t


def parse_citation(src):
    """Vrátí seznam odkazů a seznam nerozpoznaných úseků."""
    refs, unresolved = [], []
    url = re.search(r"https?://\S+", src)
    if url:
        refs.append({"law": None, "kind": "url", "id": url.group(0).rstrip(".,"), "detail": ""})
        src = src[:url.start()]
    spans = list(_law_spans(src))
    prev_end = 0
    for start, end, law in spans:
        seg = src[prev_end:start]
        found = _refs_in_segment(seg, law)
        if not found:
            # samostatně uvedený předpis bez paragrafu
            found = [{"law": law, "kind": "whole", "id": "", "detail": ""}]
        refs.extend(found)
        prev_end = end
    tail = src[prev_end:].strip(" ,.;")
    if tail and re.search(r"§|čl\.|příloh", tail):
        unresolved.append(tail)
    if not spans and not url:
        unresolved.append(src)
    # odstranit duplicity při zachování pořadí
    seen, uniq = set(), []
    for r in refs:
        k = (r["law"], r["kind"], r["id"])
        if k in seen:
            for u in uniq:
                if (u["law"], u["kind"], u["id"]) == k and r["detail"] and r["detail"] not in u["detail"]:
                    u["detail"] = (u["detail"] + "; " + r["detail"]).strip("; ")
            continue
        seen.add(k)
        uniq.append(r)
    for r in uniq:
        r["hl"] = targets(r["detail"])
    return uniq, unresolved


if __name__ == "__main__":
    import json
    import pathlib
    import sys

    sys.stdout.reconfigure(encoding="utf-8")
    root = pathlib.Path(__file__).resolve().parent.parent
    qs = json.loads((root / "data" / "questions.json").read_text(encoding="utf-8"))["questions"]
    bad = 0
    for q in qs:
        refs, unresolved = parse_citation(q["src"])
        flag = "!!" if unresolved or not refs else "  "
        if unresolved or not refs:
            bad += 1
        shown = "; ".join(f"{r['law']} {r['kind']} {r['id']} [{r['detail']}]" for r in refs)
        print(f"{flag} {q['id']:5} {q['src'][:80]:80} → {shown} {unresolved if unresolved else ''}")
    print("nerozpoznané:", bad)
