#!/usr/bin/env python3
"""Проверки механизма контракта: раскладки дерева и разделы приложения в наборах, граница механизма без слов VMS.

- layout_problems(fx, name) — раскладки дерева набора (KindsList.layouts, раздел layouts набора), правила L1–L7;
- section_problems(fx, name) — разделы приложения набора (reference.capabilities.sections), правила S1–S4;
- border_problems(spec) — описания схем и путей дерева без слов VMS (правило B5).

Пустой список — проверка прошла. Строки отказа: «<набор>: раскладка <id>: …», «<схема или путь>: в описании механизма «<слово>»».
Вызывает tools/check_api.py; самопроверка — tools/check_mechanism.py.
"""

import re

VMS_WORDS = ("камер", "сервер", "видео", "архив", "детектор", "хранилищ", "VMS")

# B5: схемы механизма дерева и пути /tree/*, в описаниях которых нет слов VMS
TREE_SCHEMAS = ("TreeLayout", "PlaceRule", "KindSelector", "TreeGroup", "TreeNode", "TreePath", "TreePathStep", "KindsList", "AppSection")
TREE_PATH_PREFIX = "/tree/"
_TEXT_KEYS = ("description", "summary")


# ── раскладки дерева в наборе ──

def _declared(fx):
    """Коды видов и профили, которые объявил набор: профиль — в разделе profiles или в implements вида."""
    kinds = fx.get("kinds") or []
    codes = {k["kind"] for k in kinds}
    profiles = {p["id"] for p in fx.get("profiles") or []} | {i for k in kinds for i in k.get("implements") or []}
    return codes, profiles


def _matches(sel, kind):
    """KindSelector как x-ref: вид подходит по коду или по профилю; пустой селектор — любой вид."""
    if not sel or (not sel.get("kinds") and not sel.get("implements")):
        return True
    return kind["kind"] in (sel.get("kinds") or []) or bool(set(sel.get("implements") or []) & set(kind.get("implements") or []))


def _selectors(lay):
    """Все селекторы раскладки: (где, селектор)."""
    for key in ("show", "hide"):
        if lay.get(key):
            yield key, lay[key]
    for i, rule in enumerate(lay.get("place") or []):
        for key in ("what", "ref"):
            if rule.get(key):
                yield f"place[{i}].{key}", rule[key]


def _operations(fx):
    return ((fx.get("reference") or {}).get("capabilities") or {}).get("operations") or []


def layout_problems(fx, name="набор"):
    """Раскладки набора против его видов: L1 id уникальны; L2 group правила есть в groups; L3 у by: ref — ref, у by: group — group;
    L4 where.property есть в схеме вида под what; L5 коды и профили селекторов объявлены; L6 у folders — правило by: folders;
    L7 getTreeChildren объявлена — раскладок не меньше одной."""
    out = []
    layouts = fx.get("layouts")
    if "getTreeChildren" in _operations(fx) and not layouts:
        out.append(f"{name}: раскладка —: getTreeChildren объявлена, а раскладок нет (раздел layouts)")
    codes, profiles = _declared(fx)
    kinds = fx.get("kinds") or []
    seen = set()
    for lay in layouts or []:
        lid = lay.get("id")
        say = lambda text, lid=lid: out.append(f"{name}: раскладка {lid}: {text}")
        if lid in seen:
            say("повтор id")
        seen.add(lid)
        groups = {g.get("id") for g in lay.get("groups") or []}
        for i, rule in enumerate(lay.get("place") or []):
            by = rule.get("by")
            if by == "ref" and not (rule.get("ref") or {}).get("kinds") and not (rule.get("ref") or {}).get("implements"):
                say(f"place[{i}]: by: ref без непустого ref")
            if by == "group" and not rule.get("group"):
                say(f"place[{i}]: by: group без group")
            if rule.get("group") and rule["group"] not in groups:
                say(f"place[{i}]: группы {rule['group']} нет в groups")
            prop = (rule.get("where") or {}).get("property")
            if prop and not any(prop in ((k.get("schema") or {}).get("properties") or {}) for k in kinds if _matches(rule.get("what"), k)):
                say(f"place[{i}].where: свойства {prop} нет в схеме ни одного вида из what")
        for where, sel in _selectors(lay):
            for code in sel.get("kinds") or []:
                if code not in codes:
                    say(f"{where}: вид {code} не объявлен в наборе")
            for pid in sel.get("implements") or []:
                if pid not in profiles:
                    say(f"{where}: профиль {pid} не объявлен в наборе")
        if lid == "folders" and not any(r.get("by") == "folders" for r in lay.get("place") or []):
            say("нет правила by: folders")
    return out


# ── разделы приложения в наборе ──

# Код раздела → операции, без которых раздел показать нельзя. Порядок — порядок рельса. Раздел «vms.export» — слой VMS
SECTION_OPS = {
    "objects": ["listKinds", "listUnits", "getTreeChildren"],
    "automation": ["listRules"],
    "access": ["getAccess"],
    "settings": ["getSettings"],
    "vms.export": ["listExports"],
    "journal": ["listJournal"],
}
SECTION_ID = re.compile(r"^[a-z][A-Za-z0-9_.-]*$")


def section_problems(fx, name="набор"):
    """Разделы набора (reference.capabilities.sections): S1 id уникальны; S2 у раздела из SECTION_OPS объявлены все его
    операции; S3 id по шаблону; S4 demo объявляет все коды SECTION_OPS. Нет поля sections — проверять нечего (клиент выводит
    разделы из операций)."""
    caps = (fx.get("reference") or {}).get("capabilities") or {}
    if "sections" not in caps:
        return [f"{name}: нет поля sections (demo объявляет все коды SECTION_OPS)"] if name == "demo" else []
    ops = set(caps.get("operations") or [])
    out, seen = [], set()
    for sec in caps["sections"]:
        sid = sec.get("id")
        if sid in seen:
            out.append(f"{name}: раздел {sid}: повтор id")
        seen.add(sid)
        if not isinstance(sid, str) or not SECTION_ID.match(sid):
            out.append(f"{name}: раздел {sid}: id не по шаблону {SECTION_ID.pattern}")
        lack = [o for o in SECTION_OPS.get(sid, []) if o not in ops]
        if lack:
            out.append(f"{name}: раздел {sid} без операций {', '.join(lack)}")
    if name == "demo":
        out += [f"{name}: нет раздела {code} (demo объявляет все коды SECTION_OPS)" for code in SECTION_OPS if code not in seen]
    return out


# ── граница механизма: без слов VMS ──

def _texts(node, where):
    """Тексты описаний под узлом: (где, текст). Ключ properties — перечень полей, их имена в путь."""
    if isinstance(node, dict):
        for k, v in node.items():
            if k in _TEXT_KEYS and isinstance(v, str):
                yield where, v
            elif k == "properties" and isinstance(v, dict):
                for field, sub in v.items():
                    yield from _texts(sub, f"{where}.{field}")
            elif isinstance(v, (dict, list)):
                yield from _texts(v, where)
    elif isinstance(node, list):
        for v in node:
            yield from _texts(v, where)


def border_problems(spec):
    """B5: описания схем дерева (TREE_SCHEMAS) и операций путей /tree/* без слов VMS_WORDS, регистр не важен."""
    schemas = (spec.get("components") or {}).get("schemas") or {}
    places = [(n, schemas[n]) for n in TREE_SCHEMAS if n in schemas]
    # Capabilities в целом слов VMS не избегает; B5 — только описание поля sections
    sec = (((schemas.get("Capabilities") or {}).get("properties") or {}).get("sections"))
    if sec:
        places.append(("Capabilities.sections", sec))
    places += [(p, item) for p, item in (spec.get("paths") or {}).items() if p.startswith(TREE_PATH_PREFIX)]
    out = []
    for name, node in places:
        for where, text in _texts(node, name):
            low = text.lower()
            for word in VMS_WORDS:
                if word.lower() in low:
                    out.append(f"{where}: в описании механизма «{word}»")
    return out


if __name__ == "__main__":
    import json
    import os
    import sys
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    with open(os.path.join(root, "api", "openapi.json"), encoding="utf-8") as f:
        problems = border_problems(json.load(f))
    for n in ("demo", "one-domain", "large", "agents"):
        with open(os.path.join(root, "api", "fixtures", f"{n}.json"), encoding="utf-8") as f:
            fxn = json.load(f)
        problems += layout_problems(fxn, n) + section_problems(fxn, n)
    print("\n".join(problems) or "ok")
    sys.exit(1 if problems else 0)
