#!/usr/bin/env python3
"""Файлы профилей: api/profiles/<имя>.json — разбор, версии, запись для GET /kinds и таблица для людей.

Модуль чистый: читает только папку профилей, git не трогает. Его используют tools/build_api.py
(сборка раздела profiles в demo.json и таблиц) и tools/check_api.py (проверка профилей); самопроверка —
tools/check_profile_files.py.

Формат файла: ключи id, version, label, owner, reviewers, uses, properties, status (необязательный),
apis (необязательный), changes. Версия — «M.m», M равно номеру после «/» в id. В строке changes
необязателен ключ removed — список снятых полей (решение владельца О2).
"""
import json
import os
import re

PROFILES_DIR = "profiles"
FILE_KEYS = ("id", "version", "label", "owner", "reviewers", "uses", "properties", "status", "apis", "changes")
REQUIRED_KEYS = tuple(k for k in FILE_KEYS if k not in ("status", "apis"))
SERVICE_KEYS = ("_file",)
FIELD_KEYS = ("schema", "meaning", "since")
CHANGE_KEYS = ("version", "what", "removed")

_VERSION = re.compile(r"^[0-9]+\.[0-9]+$")
_ID = re.compile(r"^[A-Za-z0-9_.-]+/[0-9]+$")


def parse_version(v):
    """«1.5» → (1, 5). Всё, кроме «M.m», — ValueError."""
    if not isinstance(v, str) or not _VERSION.match(v):
        raise ValueError(f"версия {v!r} — нужно M.m, например 1.5")
    major, minor = v.split(".")
    return int(major), int(minor)


def major_of(pid):
    """«vms.camera/1» → 1."""
    return int(pid.rsplit("/", 1)[1])


def profile_name(pid):
    """«vms.camera/1» → «vms.camera»."""
    return pid.rsplit("/", 1)[0]


def load_profiles(api_dir):
    """Все *.json папки <api_dir>/profiles по имени файла; в каждом документе ключ _file — имя файла.
    Нет папки — пустой список. Сломанный файл — ValueError с его именем."""
    folder = os.path.join(api_dir, PROFILES_DIR)
    if not os.path.isdir(folder):
        return []
    docs = []
    for name in sorted(os.listdir(folder)):
        if not name.endswith(".json"):
            continue
        path = os.path.join(folder, name)
        try:
            with open(path, encoding="utf-8") as f:
                doc = json.load(f)
        except ValueError as e:
            raise ValueError(f"{PROFILES_DIR}/{name}: не читается как JSON — {e}") from e
        if not isinstance(doc, dict):
            raise ValueError(f"{PROFILES_DIR}/{name}: в файле должен быть объект")
        doc["_file"] = name
        docs.append(doc)
    return docs


def _str(v):
    return isinstance(v, str) and v.strip() != ""


def _ver(v):
    try:
        return parse_version(v)
    except ValueError:
        return None


def _field_problems(section, name, field, version, major, versions):
    where = f"{section}.{name}"
    if not isinstance(field, dict):
        return [f"{where}: нужен объект {{schema, meaning, since}}"]
    out = []
    extra = sorted(set(field) - set(FIELD_KEYS))
    missing = [k for k in FIELD_KEYS if k not in field]
    if extra:
        out.append(f"{where}: незнакомые ключи {', '.join(extra)}")
    if missing:
        out.append(f"{where}: нет ключей {', '.join(missing)}")
    sch = field.get("schema")
    if "schema" in field and not (isinstance(sch, dict) and "type" in sch):
        out.append(f"{where}: schema — объект с type")
    if "meaning" in field and not _str(field["meaning"]):
        out.append(f"{where}: meaning пустой")
    if "since" in field:
        since = _ver(field["since"])
        if since is None:
            out.append(f"{where}: since {field['since']!r} — нужно M.m")
        else:
            if major is not None and since[0] != major:
                out.append(f"{where}: since {field['since']} — старшая версия не {major}")
            if version is not None and since > version:
                out.append(f"{where}: since {field['since']} новее version {version[0]}.{version[1]}")
            if field["since"] not in versions:
                out.append(f"{where}: since {field['since']}, а строки с такой версией в changes нет")
    return out


def profile_problems(doc):
    """Формат одного файла профиля. Пустой список — файл в порядке."""
    out = []
    keys = [k for k in doc if k not in SERVICE_KEYS]
    for k in keys:
        if k not in FILE_KEYS:
            out.append(f"ключ {k}: незнакомый, можно {', '.join(FILE_KEYS)}")
    for k in REQUIRED_KEYS:
        if k not in doc:
            out.append(f"нет ключа {k}")
    pid = doc.get("id")
    major = None
    if "id" in doc:
        if not (isinstance(pid, str) and _ID.match(pid)):
            out.append(f"id {pid!r}: нужно <имя>/<старшая версия>, например vms.camera/1")
        else:
            major = major_of(pid)
            if "_file" in doc and doc["_file"] != profile_name(pid) + ".json":
                out.append(f"имя файла {doc['_file']}: для {pid} нужно {profile_name(pid)}.json")
    version = None
    if "version" in doc:
        version = _ver(doc["version"])
        if version is None:
            out.append(f"version {doc['version']!r}: нужно M.m")
        elif major is not None and version[0] != major:
            out.append(f"version {doc['version']}: старшая версия не та, что в id ({major})")
    for k in ("label", "owner"):
        if k in doc and not _str(doc[k]):
            out.append(f"{k}: нужна непустая строка")
    if "reviewers" in doc:
        r = doc["reviewers"]
        if not (isinstance(r, list) and r and all(_str(x) for x in r)):
            out.append("reviewers: нужен непустой список непустых строк")

    versions = set()
    ch = doc.get("changes")
    if "changes" in doc:
        if not (isinstance(ch, list) and ch):
            out.append("changes: нужен непустой список строк {version, what}")
        else:
            prev = None
            for i, row in enumerate(ch):
                w = f"changes[{i}]"
                if not isinstance(row, dict):
                    out.append(f"{w}: нужен объект {{version, what}}")
                    continue
                extra = sorted(set(row) - set(CHANGE_KEYS))
                if extra:
                    out.append(f"{w}: незнакомые ключи {', '.join(extra)}")
                if "version" not in row or "what" not in row:
                    out.append(f"{w}: нужны ключи version и what")
                if "what" in row and not _str(row["what"]):
                    out.append(f"{w}: what пустой")
                if "removed" in row and not (isinstance(row["removed"], list) and all(_str(x) for x in row["removed"])):
                    out.append(f"{w}: removed — список непустых строк")
                v = _ver(row.get("version"))
                if v is None:
                    out.append(f"{w}: version {row.get('version')!r} — нужно M.m")
                    continue
                versions.add(row["version"])
                if prev is not None and not v < prev:
                    out.append(f"changes[{i}]: версии идут строго по убыванию, {row['version']} не меньше предыдущей")
                prev = v
            if _ver(ch[0].get("version") if isinstance(ch[0], dict) else None) is not None and version is not None \
                    and _ver(ch[0]["version"]) != version:
                out.append(f"первая строка changes — {ch[0]['version']}, а version {doc['version']}")

    for section in ("properties", "status"):
        if section in doc:
            if not isinstance(doc[section], dict):
                out.append(f"{section}: нужен объект {{имя: {{schema, meaning, since}}}}")
                continue
            for name, field in doc[section].items():
                out += _field_problems(section, name, field, version, major, versions)

    if "uses" in doc:
        seen = set()
        if not isinstance(doc["uses"], list):
            out.append("uses: нужен список {id, version}")
        else:
            for i, u in enumerate(doc["uses"]):
                w = f"uses[{i}]"
                if not (isinstance(u, dict) and set(u) == {"id", "version"}):
                    out.append(f"{w}: нужен объект ровно с ключами id и version")
                    continue
                uid, uver = u["id"], u["version"]
                if not (isinstance(uid, str) and _ID.match(uid)):
                    out.append(f"{w}: id {uid!r} — нужно <имя>/<старшая версия>")
                    continue
                if uid in seen:
                    out.append(f"{w}: {uid} повтор")
                seen.add(uid)
                if uid == pid:
                    out.append(f"{w}: профиль использует сам себя ({uid})")
                uv = _ver(uver)
                if uv is None:
                    out.append(f"{w}: version {uver!r} — нужно M.m")
                elif uv[0] != major_of(uid):
                    out.append(f"{w}: версия {uver} не из старшей версии {uid}")
    if "apis" in doc:
        a = doc["apis"]
        if not (isinstance(a, list) and all(_str(x) for x in a)):
            out.append("apis: нужен список непустых строк")
        elif len(set(a)) != len(a):
            out.append("apis: повтор")
    return out


def profile_wire(doc):
    """Запись профиля для GET /kinds и раздела profiles в demo.json."""
    w = {"id": doc["id"], "label": {"key": f"profile.{doc['id']}", "text": doc["label"], "lang": "ru"},
         "version": doc["version"]}
    if doc.get("uses"):
        w["uses"] = [{"id": u["id"], "version": u["version"]} for u in doc["uses"]]
    w["properties"] = list(doc.get("properties") or {})
    if doc.get("status"):
        w["status"] = list(doc["status"])
    if doc.get("apis"):
        w["apis"] = list(doc["apis"])
    return w


def type_sig(schema):
    """Тип поля для сравнения: (множество типов, подпись items или None, x-ref или None)."""
    t = schema.get("type")
    types = frozenset(t if isinstance(t, list) else [t] if t is not None else [])
    items = schema.get("items")
    ref = schema.get("x-ref")
    return (types, type_sig(items) if isinstance(items, dict) else None,
            (tuple(sorted(ref.get("implements") or [])), tuple(sorted(ref.get("kinds") or []))) if isinstance(ref, dict) else None)


def type_text(schema):
    """Тип словами для таблицы."""
    t = schema.get("type")
    types = t if isinstance(t, list) else [t] if t is not None else []
    parts = []
    for x in types:
        if x == "array":
            items = schema.get("items")
            text = "массив " + type_text(items) if isinstance(items, dict) else "массив"
            if "maxItems" in schema:
                text += f", до {schema['maxItems']}"
            parts.append(text)
        else:
            parts.append(x)
    text = " | ".join(parts)
    if schema.get("enum"):
        text += ": " + ", ".join(f"`{v}`" for v in schema["enum"])
    ref = schema.get("x-ref")
    if isinstance(ref, dict):
        if ref.get("implements"):
            text += " — uid (" + ", ".join(f"`{p}`" for p in ref["implements"]) + ")"
        elif ref.get("kinds"):
            text += " — uid (" + ", ".join(ref["kinds"]) + ")"
    if schema.get("readOnly"):
        text += " (только чтение)"
    if schema.get("writeOnly"):
        text += " (секрет)"
    return text


def _cell(s):
    return str(s).replace("|", "\\|").replace("\n", " ")


def _table(fields):
    if not fields:
        return ["Своих свойств нет.", ""]
    rows = ["| Свойство | Тип | Смысл | С версии |", "|---|---|---|---|"]
    for name, f in fields.items():
        rows.append(f"| `{name}` | {_cell(type_text(f['schema']))} | {_cell(f['meaning'])} | {f['since']} |")
    return rows + [""]


def render_md(doc, kinds):
    """Таблица профиля для людей: api/profiles/<имя>.md."""
    pid = doc["id"]
    uses = doc.get("uses") or []
    lines = [f"<!-- Собрано tools/build_api.py из api/profiles/{profile_name(pid)}.json — руками не править -->",
             f"# `{pid}` — {doc['label']}", "",
             f"Версия {doc['version']} · ведёт: {doc['owner']} · смотрят правку: {', '.join(doc['reviewers'])}", "",
             "Использует: " + (", ".join(f"`{u['id']}` с {u['version']}" for u in uses) if uses else "—"), ""]
    kinds_line = "Виды эталонного набора: " + ", ".join(f"`{k}`" for k in kinds) + "."
    if doc.get("apis"):
        kinds_line += " Предметные пути: " + ", ".join(f"`/units/{{uid}}/{a}`" for a in doc["apis"]) + "."
    lines += [kinds_line, "", "## Свойства", ""]
    lines += _table(doc.get("properties") or {})
    lines += ["## Состояние (`status.observed`)", ""]
    lines += _table(doc.get("status") or {})
    lines += ["## Изменения", "", "| Версия | Что |", "|---|---|"]
    for row in doc["changes"]:
        what = row["what"] + (f" Снято: {', '.join(f'`{r}`' for r in row['removed'])}." if row.get("removed") else "")
        lines.append(f"| {row['version']} | {_cell(what)} |")
    return "\n".join(lines) + "\n"
