#!/usr/bin/env python3
"""Проверка модуля слоёв контракта (tools/layers.py): ловит ли он нарушения границы «механизм или
подсистема» и верно ли называет слой, владельца и проверяющих.

Каждый случай берёт копию живого api/openapi.json, делает в ней одну правку и вызывает
layers.static_problems. Так проверка видит и отказ там, где граница нарушена, и тишину там, где
правка законна. Отдельные строки проверяют функции, на которые опираются другие проверки
(layer_of_schema, layer_of_path, profile_ids, profile_file, owner_of, reviewers_of, leak_marks).

Запуск из корня репозитория, после правки tools/layers.py:
  python3 tools/check_layers.py
Код выхода 1, если хоть одна проверка не прошла.
"""
import copy
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import layers  # noqa: E402

failed = 0


def ok(cond, what):
    global failed
    print(("PASS " if cond else "FAIL ") + what)
    if not cond:
        failed += 1


def skip(what):
    print("SKIP " + what)


with open(os.path.join(ROOT, "api", "openapi.json"), encoding="utf-8") as f:
    SPEC = json.load(f)
IDS = layers.profile_ids()
POS = "vms.pos/1"
POS_PATH = "/units/{uid}/pos/raw"


def base():
    """Свежая копия контракта, где схемы и путь vms.pos/1 помечены (если разметка ещё не стоит)."""
    s = copy.deepcopy(SPEC)
    sch = s["components"]["schemas"]
    for name in ("PosRawLine", "PosRawLines"):
        sch[name].setdefault("x-layer", POS)
    s["paths"][POS_PATH].setdefault("x-layer", POS)
    return s


def problems(s):
    return layers.static_problems(s, IDS)


def node_at(s, path):
    """Узел схемы по пути записи check_api.schema_removed: Схема.поле.подполе, [] — items, {} — additionalProperties, |N — вариант."""
    name, rest = re.match(r"^([^.\[{|]+)(.*)$", path).groups()
    node = s["components"]["schemas"][name]
    for tok in re.findall(r"\[\]|\{\}|\|\d+|\.[^.\[{|]+", rest):
        if tok == "[]":
            node = node["items"]
        elif tok == "{}":
            node = node["additionalProperties"]
        elif tok[0] == "|":
            node = next(node[k][int(tok[1:])] for k in ("anyOf", "oneOf", "allOf") if k in node)
        else:
            node = node["properties"][tok[1:]]
    return node


def drop_mark(s, path):
    del node_at(s, path)["x-layer"]


# ── живой контракт ──
ok(problems(SPEC) == [], "живой контракт: граница цела")
ok(problems(base()) == [], "base(): контракт с разметкой vms.pos/1 цел")

# ── функции интерфейса ──
ok(layers.layer_of_schema(SPEC, "Unit") is None, "layer_of_schema: у схемы механизма слоя нет")
ok(layers.layer_of_schema(SPEC, "PosRawLines") == POS, "layer_of_schema: схема vms.pos/1")
ok(layers.layer_of_schema(SPEC, "Нет такой") is None, "layer_of_schema: схемы нет — None")
ok(layers.layer_of_path(SPEC, "/units") is None, "layer_of_path: у пути механизма слоя нет")
ok(layers.layer_of_path(SPEC, POS_PATH) == POS, "layer_of_path: путь vms.pos/1")
ok(layers.layer_of_path(SPEC, "/нет/такого") is None, "layer_of_path: пути нет — None")
ok("vms.camera/1" in layers.profile_ids(), "profile_ids: профиль из demo.json")
ok(set(layers.LAYER_EXTRA) == {"video", "vms"} and not (set(layers.LAYER_EXTRA) & layers.profile_ids()), "LAYER_EXTRA: video и vms — не профили")
ok(layers.profile_file("vms.camera/1") == "api/profiles/vms.camera.json", "profile_file: vms.camera/1")
ok(layers.profile_file("vms.camera/1", "x/api") == "x/api/profiles/vms.camera.json", "profile_file: свой каталог API")
ok(layers.owner_of("vms.camera/1") == layers.DEFAULT_OWNER == "mockup", "owner_of: файла профиля нет — mockup")
ok(layers.reviewers_of("vms.camera/1") == layers.DEFAULT_REVIEWERS == ["w2c"], "reviewers_of: файла профиля нет — w2c")
ok(layers.reviewers_of("vms.camera/1") is not layers.DEFAULT_REVIEWERS, "reviewers_of: отдаёт копию, а не общий список")
marks = layers.leak_marks(SPEC)
ok(isinstance(marks, dict) and set(marks) == set(layers.KNOWN_LEAKS), "leak_marks: пометки полей живого контракта = KNOWN_LEAKS")
s = base()
s["components"]["schemas"]["Unit"]["properties"]["posRaw"] = {"type": "string", "x-layer": POS}
ok(layers.leak_marks(s).get("Unit.posRaw") == POS, "leak_marks: пометка поля — путь Схема.поле")
s = base()
s["components"]["schemas"]["Unit"]["properties"]["tags"] = {"type": "array", "items": {"type": "string", "x-layer": POS}}
ok(layers.leak_marks(s).get("Unit.tags[]") == POS, "leak_marks: элемент массива — []")
s = base()
s["components"]["schemas"]["Unit"]["properties"]["tags"] = {"type": "object", "additionalProperties": {"type": "string", "x-layer": POS}}
ok(layers.leak_marks(s).get("Unit.tags{}") == POS, "leak_marks: additionalProperties — {}")
s = base()
s["components"]["schemas"]["Unit"]["properties"]["tags"] = {"anyOf": [{"type": "null"}, {"type": "string", "x-layer": POS}]}
ok(layers.leak_marks(s).get("Unit.tags|1") == POS, "leak_marks: вариант anyOf — |N")
ok("PosRawLines" not in "".join(layers.leak_marks(base())), "leak_marks: помеченная схема целиком — не пометка поля")

# ── S2: значение ──
s = base()
s["components"]["schemas"]["PosRawLine"]["x-layer"] = "vms.nope/1"
ok(any("vms.nope/1" in p and "PosRawLine" in p for p in problems(s)), "S2: незнакомый слой")
for extra in layers.LAYER_EXTRA:
    s = base()
    s["components"]["schemas"]["PosRawLine"]["x-layer"] = extra
    ok(not any("PosRawLine:" in p for p in problems(s)), f"S2: слой {extra} разрешён")
s = base()
s["paths"][POS_PATH]["x-layer"] = "vms.nope/1"
ok(any("vms.nope/1" in p and POS_PATH in p for p in problems(s)), "S2: незнакомый слой у пути")

# ── S1: где стоит пометка ──
s = base()
s["paths"]["/units"]["get"]["x-layer"] = "vms"
ok(any("/units" in p and "x-layer только" in p for p in problems(s)), "S1: x-layer в операции")
s = base()
s["paths"]["/units"]["get"]["parameters"][0]["x-layer"] = "vms"
ok(any("/units" in p and "x-layer только" in p for p in problems(s)), "S1: x-layer в параметре")
s = base()
s["components"]["schemas"]["PosRawLines"]["properties"]["items"]["x-layer"] = POS
ok(any("PosRawLines" in p and "x-layer только" in p for p in problems(s)), "S1: вложенная пометка в помеченной схеме")
s = base()
s["paths"][POS_PATH]["get"]["x-layer"] = POS
ok(any(POS_PATH in p and "x-layer только" in p for p in problems(s)), "S1: x-layer в операции помеченного пути")
s = base()
s["components"]["schemas"]["Unit"]["properties"]["a"] = {"type": "object", "x-layer": POS, "properties": {"b": {"type": "string", "x-layer": POS}}}
ok(any("Unit.properties.a.properties.b" in p and "x-layer только" in p for p in problems(s)), "S1: пометка внутри помеченного поля")

# ── S3: механизм не ссылается на подсистему ──
s = base()
s["components"]["schemas"]["Unit"]["properties"]["posRaw"] = {"$ref": "#/components/schemas/PosRawLines"}
ok(any("Unit.posRaw" in p and "PosRawLines" in p for p in problems(s)), "S3: ссылка механизма на подсистему")
s = base()
s["components"]["schemas"]["Unit"]["properties"]["posRaw"] = {"type": "array", "items": {"$ref": "#/components/schemas/PosRawLine"}}
ok(any("Unit.posRaw[]" in p and "PosRawLine" in p for p in problems(s)), "S3: ссылка из элемента массива")
s = base()
s["paths"]["/units"]["get"]["responses"]["200"]["content"]["application/json"]["schema"] = {"$ref": "#/components/schemas/PosRawLines"}
ok(any("/units" in p and "PosRawLines" in p and "ссылается" in p for p in problems(s)), "S3: путь механизма ссылается на подсистему")

# ── S4: пометка поля и KNOWN_LEAKS ──
s = base()
s["components"]["schemas"]["Unit"]["properties"]["posRaw"] = {"$ref": "#/components/schemas/PosRawLines", "x-layer": POS}
ok(any("Unit.posRaw" in p and "KNOWN_LEAKS" in p for p in problems(s)), "S4: новое поле подсистемы")
ok(not any("ссылается на схему подсистемы" in p and "Unit.posRaw" in p for p in problems(s)), "S4: помеченное поле S3 не пропускает дважды")

# ── S4: устаревшая строка KNOWN_LEAKS ──
saved_leaks = dict(layers.KNOWN_LEAKS)
try:
    layers.KNOWN_LEAKS["Unit.нет.такого"] = "часть 04"
    ok(any("Unit.нет.такого" in p and "убери из KNOWN_LEAKS" in p for p in problems(base())), "S4: строка KNOWN_LEAKS без пометки")
finally:
    layers.KNOWN_LEAKS.clear()
    layers.KNOWN_LEAKS.update(saved_leaks)
if layers.KNOWN_LEAKS:
    first = sorted(layers.KNOWN_LEAKS)[0]
    s = base()
    drop_mark(s, first)
    ok(any(first in p and "убери из KNOWN_LEAKS" in p for p in problems(s)), f"S4: пометку {first} сняли, а KNOWN_LEAKS помнит")
else:
    skip("S4: устаревшая строка KNOWN_LEAKS — KNOWN_LEAKS пуст")

# ── S5: id профиля в описании общего поля ──
s = base()
s["components"]["schemas"]["Unit"]["properties"]["foo"] = {"type": "string", "description": "Поле vms.camera/1"}
ok(any("Unit.foo" in p and "vms.camera/1" in p for p in problems(s)), "S5: профиль в описании")
s = base()
s["components"]["schemas"]["Unit"]["properties"]["foo"] = {"type": "string", "description": "Поле vms.camera/1", "x-layer": "vms.camera/1"}
ok(not any("в описании" in p and "Unit.foo" in p for p in problems(s)), "S5: помеченное поле описание не проверяет")
saved_ex = dict(layers.EXAMPLE_MENTIONS)
try:
    s = base()
    s["components"]["schemas"]["Unit"]["properties"]["foo"] = {"type": "string", "description": "Например vms.camera/1"}
    layers.EXAMPLE_MENTIONS["Unit.foo"] = "пример"
    ok(not any("в описании" in p and "Unit.foo" in p for p in problems(s)), "S5: пример из EXAMPLE_MENTIONS")
    ok(any("Unit.foo" in p and "EXAMPLE_MENTIONS" in p for p in problems(base())), "S5: строка EXAMPLE_MENTIONS без упоминания")
finally:
    layers.EXAMPLE_MENTIONS.clear()
    layers.EXAMPLE_MENTIONS.update(saved_ex)

# ── законно ──
s = base()
s["components"]["schemas"]["PosRawLines"]["properties"]["unit"] = {"$ref": "#/components/schemas/Unit"}
ok(problems(s) == problems(base()), "помеченная схема ссылается на механизм — можно")
s = base()
s["paths"][POS_PATH]["get"]["responses"]["200"]["description"] = "vms.camera/1 в описании пути — это не поле схемы"
ok(problems(s) == problems(base()), "описание операции S5 не трогает")

print(f"RESULT {'fail' if failed else 'pass'}")
sys.exit(1 if failed else 0)
