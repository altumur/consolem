#!/usr/bin/env python3
"""Слои контракта: что в api/openapi.json делает каждый бэкенд (механизм), а что нужно только тому,
кто объявил профиль подсистемы.

Слой пишется расширением x-layer:
  - у схемы components.schemas.<Имя> целиком;
  - у пути paths.<путь> целиком;
  - у поля общей (непомеченной) схемы — в KNOWN_LEAKS, пока часть 04 не вынесет поле в схему вида.
Значение — id профиля из набора (vms.pos/1…), «video» (просмотр, архив, выгрузка — будущий API видео)
или «vms» (часть VMS без своего профиля). Нет пометки — механизм.

Модуль статический: читает контракт и файлы профилей, git не трогает. Клиент пропускает x-layer, как
любой ключ x-*. Проверку границы вызывает tools/check_api.py, проверку самого модуля —
tools/check_layers.py.
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

LAYER_EXTRA = ("video", "vms")
DEFAULT_OWNER = "mockup"
DEFAULT_REVIEWERS = ["w2c"]

# Поля подсистем в общих схемах: путь поля (как в check_api.schema_removed) → кто его выносит.
# Список только сокращается, как PENDING в check_api.py: новое поле подсистемы в общей схеме — не сюда,
# а в схему вида.
KNOWN_LEAKS = {
    "AssistEvent.export": "API видео",
    "AssistFoundFilter.noDetector": "часть 04",
    "AssistFoundFilter.noRecord": "часть 04",
    "Reference.analyticsConflicts": "часть 04",
    "Reference.cloudProviders": "часть 04",
    "Reference.deviceModels": "часть 04",
    "Reference.export": "API видео",
    "Reference.layouts": "часть 04",
    "Reference.limits.defaultServerPort": "часть 04",
    "Reference.limits.ipScanMax": "часть 04",
    "Reference.monitors": "часть 04",
    "Reference.recordModes": "часть 04",
    "Reference.scenarioKinds": "часть 04",
    "Reference.serverLabels": "часть 04",
    "Reference.serviceTypes": "часть 04",
    "Reference.supportLevels": "часть 04",
    "RuleTrigger.match.detector": "часть 04",
    "TestEventRequest.eventId": "часть 04",
    "TestEventRequest.status": "часть 04",
    "TestEventRequest.type": "часть 04",
    "UnitKind.x-archive": "часть 04",
    "UnitMoveRequest.params": "часть 04",
    "UnitStatus.observed.replicaLagSec": "часть 04",
    "UnitStatus.observed.replicationStatus": "часть 04",
    "UnitStatus.observed.webCertificate": "часть 04",
    "UnitStatus.observed.webReservedPorts": "часть 04",
}

# Поля общих схем, где id профиля в описании — пример, а не поле подсистемы: путь поля → почему.
EXAMPLE_MENTIONS = {
    "Profile": "описание схемы называет профиль как пример",
    "Profile.id": "id профиля в описании — пример записи",
    "UnitKind": "описание схемы называет профили как пример",
    "UnitKind.implements": "id профиля в описании — пример значения",
    "UnitKind.apiRights": "id профиля в описании — пример значения",
}

_PROFILE_MENTION = re.compile(r"\bvms\.[a-z][a-z0-9]*/\d+")
_VARIANTS = ("anyOf", "oneOf", "allOf")


def _abs(rel):
    return rel if os.path.isabs(rel) else os.path.join(ROOT, rel)


def _load(rel):
    """JSON-файл; None — файла нет. Сломанный файл — ValueError с его именем: молчаливое умолчание скрыло бы ошибку."""
    path = _abs(rel)
    if not os.path.exists(path):
        return None
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except ValueError as e:
        raise ValueError(f"{rel}: не читается как JSON — {e}") from e


def profile_file(pid, api_dir="api"):
    """«vms.camera/1» → «<api_dir>/profiles/vms.camera.json» (файл профиля — без номера версии)."""
    return f"{api_dir}/profiles/{pid.split('/')[0]}.json"


def profile_ids(api_dir="api"):
    """id профилей: из demo.json (profiles) и из файлов api/profiles/*.json, если они есть."""
    ids = set()
    demo = _load(f"{api_dir}/fixtures/demo.json") or {}
    ids.update(p["id"] for p in demo.get("profiles", []) if isinstance(p, dict) and "id" in p)
    folder = _abs(f"{api_dir}/profiles")
    if os.path.isdir(folder):
        for name in sorted(os.listdir(folder)):
            if name.endswith(".json"):
                data = _load(f"{api_dir}/profiles/{name}")
                if isinstance(data, dict) and "id" in data:
                    ids.add(data["id"])
    return ids


def owner_of(pid, api_dir="api"):
    data = _load(profile_file(pid, api_dir))
    return data["owner"] if isinstance(data, dict) and data.get("owner") else DEFAULT_OWNER


def reviewers_of(pid, api_dir="api"):
    data = _load(profile_file(pid, api_dir))
    if isinstance(data, dict) and isinstance(data.get("reviewers"), list):
        return list(data["reviewers"])
    return list(DEFAULT_REVIEWERS)


def layer_of_schema(spec, name):
    """Слой схемы components.schemas.<name>; None — механизм (или схемы нет)."""
    return ((spec.get("components") or {}).get("schemas") or {}).get(name, {}).get("x-layer")


def layer_of_path(spec, path):
    """Слой пути paths.<path>; None — механизм (или пути нет)."""
    return (spec.get("paths") or {}).get(path, {}).get("x-layer")


def _children(node, path):
    """Узлы схемы под node с путём поля: properties — .имя, items — [], additionalProperties — {}, варианты — |N."""
    for k, v in (node.get("properties") or {}).items():
        yield f"{path}.{k}", v
    if isinstance(node.get("items"), dict):
        yield path + "[]", node["items"]
    if isinstance(node.get("additionalProperties"), dict):
        yield path + "{}", node["additionalProperties"]
    for key in _VARIANTS:
        for i, v in enumerate(node.get(key) or []):
            yield f"{path}|{i}", v


class _Scan:
    """Один обход контракта: пометки полей, упоминания профилей в описаниях, ссылки механизма на подсистему."""

    def __init__(self, spec, valid):
        self.valid = valid
        self.schemas = (spec.get("components") or {}).get("schemas") or {}
        self.marked = {n: s["x-layer"] for n, s in self.schemas.items() if isinstance(s, dict) and "x-layer" in s}
        self.allowed = set()      # id() узлов, где x-layer стоит законно (S1)
        self.leaks = {}           # путь поля → слой (пометки внутри непомеченных схем)
        self.mentions = set()     # пути полей, в описании которых есть id профиля
        self.problems = []
        self._mark(spec)

    def _value(self, where, node):
        self.allowed.add(id(node))
        v = node["x-layer"]
        if not isinstance(v, str) or v not in self.valid:
            self.problems.append(f"{where}: x-layer {v} — нет такого профиля")

    def _mark(self, spec):
        for name, schema in self.schemas.items():
            if not isinstance(schema, dict):
                continue
            if "x-layer" in schema:
                self._value(name, schema)
            else:
                self._field(schema, name, True)
        for path, item in (spec.get("paths") or {}).items():
            if not isinstance(item, dict):
                continue
            if "x-layer" in item:
                self._value(path, item)
                continue
            self._refs(item.get("parameters"), path)
            for method, op in item.items():
                if method in ("get", "put", "post", "delete", "patch", "options", "head", "trace"):
                    self._refs(op, f"{method.upper()} {path}")
        for group, items in (spec.get("components") or {}).items():
            if group != "schemas" and isinstance(items, dict):
                for name, node in items.items():
                    self._refs(node, f"components.{group}.{name}")

    def _field(self, node, path, root=False):
        """Узел непомеченной схемы: пометка поля, ссылка на схему подсистемы, id профиля в описании, вглубь."""
        if not isinstance(node, dict):
            return
        if not root and "x-layer" in node:
            self._value(path, node)
            self.leaks[path] = node["x-layer"]
            return
        ref = node.get("$ref")
        if isinstance(ref, str) and ref.rsplit("/", 1)[-1] in self.marked:
            self._ref_problem(path, ref.rsplit("/", 1)[-1])
        desc = node.get("description")
        if isinstance(desc, str) and _PROFILE_MENTION.search(desc):
            self.mentions.add(path)
            if path not in EXAMPLE_MENTIONS:
                self.problems.append(f"{path}: в описании {_PROFILE_MENTION.search(desc).group(0)} — пометь поле x-layer или внеси в EXAMPLE_MENTIONS")
        for child_path, child in _children(node, path):
            self._field(child, child_path)

    def _refs(self, node, where):
        """Путь или раздел components механизма: любой $ref на схему подсистемы — отказ."""
        if isinstance(node, dict):
            ref = node.get("$ref")
            if isinstance(ref, str) and ref.rsplit("/", 1)[-1] in self.marked:
                self._ref_problem(where, ref.rsplit("/", 1)[-1])
            for v in node.values():
                self._refs(v, where)
        elif isinstance(node, list):
            for v in node:
                self._refs(v, where)

    def _ref_problem(self, where, name):
        self.problems.append(f"{where} ссылается на схему подсистемы {name} (x-layer {self.marked[name]}): вынеси поле в схему вида или пометь его x-layer")


def _scan(spec, ids):
    return _Scan(spec, set(ids) | set(LAYER_EXTRA))


def leak_marks(spec):
    """Пометки x-layer внутри непомеченных схем: путь поля (Схема.поле.подполе, [] — items, {} — additionalProperties,
    |N — вариант anyOf/oneOf/allOf) → слой."""
    return dict(_scan(spec, set()).leaks)


def _unplaced(node, where, allowed, out, names=False):
    """S1: любой x-layer (какого угодно типа) вне допустимых мест. names — node это перечень properties: его ключи — имена полей."""
    if isinstance(node, dict):
        if not names and "x-layer" in node and id(node) not in allowed:
            out.append(f"{where}: x-layer только у схемы, пути или поля общей схемы")
        for k, v in node.items():
            _unplaced(v, f"{where}.{k}" if where else k, allowed, out, names=(k == "properties" and isinstance(v, dict) and not names))
    elif isinstance(node, list):
        for i, v in enumerate(node):
            _unplaced(v, f"{where}[{i}]", allowed, out)


def static_problems(spec, ids):
    """Границу слоёв проверяет по контракту: S1 — где стоит x-layer, S2 — значение, S3 — механизм не ссылается
    на подсистему, S4 — пометки полей = KNOWN_LEAKS, S5 — id профиля в описании поля общей схемы.
    Пустой список — граница цела."""
    scan = _scan(spec, ids)
    out = list(scan.problems)
    _unplaced(spec, "", scan.allowed, out)
    for path in sorted(set(scan.leaks) - set(KNOWN_LEAKS)):
        out.append(f"{path}: новое поле подсистемы в общей схеме — его нет в KNOWN_LEAKS")
    for path in sorted(set(KNOWN_LEAKS) - set(scan.leaks)):
        out.append(f"{path}: в KNOWN_LEAKS, а пометки нет — убери из KNOWN_LEAKS")
    for path in sorted(set(EXAMPLE_MENTIONS) - scan.mentions):
        out.append(f"{path}: в EXAMPLE_MENTIONS, а id профиля в описании нет — убери из EXAMPLE_MENTIONS")
    return out


# ── таблица версий по слоям ──

_VERSION = r"\d+\.\d+\.\d+"
_README_VERSION = re.compile(rf"^## (?:Что добавлено|Ломающие изменения) в ({_VERSION})\s*$", re.M)
_ROW = re.compile(rf"^\|\s*({_VERSION})\s*\|(.*)$", re.M)


def versions_table_problems(readme, table_md, current, ids):
    """Таблица docs/contract-layers/versions-by-layer.md: строка у каждой версии README и у текущей,
    в столбце «Слой» — «механизм» или значение x-layer в обратных кавычках (id профиля из ids, video, vms)."""
    problems = []
    want = set(_README_VERSION.findall(readme)) | {current}
    rows = {}
    for m in _ROW.finditer(table_md):
        ver, cells = m.group(1), [c.strip() for c in m.group(2).split("|")]
        if ver in rows:
            problems.append(f"версия {ver}: строка есть дважды")
        if len(cells) < 3:
            problems.append(f"версия {ver}: в строке меньше четырёх столбцов")
            continue
        rows[ver] = cells[1]
    for ver in sorted(want - rows.keys(), key=lambda v: [int(x) for x in v.split(".")]):
        problems.append(f"версия {ver}: нет строки в таблице версий по слоям")
    for ver in sorted(rows.keys() - want, key=lambda v: [int(x) for x in v.split(".")]):
        problems.append(f"версия {ver}: строка есть, а раздела в api/README.md и текущей версии с таким номером нет")
    for ver, layer in rows.items():
        for tok in (t.strip() for t in layer.split(";")):
            val = tok[1:-1] if len(tok) > 2 and tok.startswith("`") and tok.endswith("`") else None
            if tok == "механизм" or val in LAYER_EXTRA or val in ids:
                continue
            if val is not None:
                problems.append(f"версия {ver}: слой `{val}` — нет такого профиля, video и vms")
            else:
                problems.append(f"версия {ver}: слой «{tok}» — нужно «механизм» или значение x-layer в обратных кавычках")
    return problems
