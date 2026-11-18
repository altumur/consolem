#!/usr/bin/env python3
"""Самопроверка tools/mechanism.py: раскладки дерева в наборах (L1–L7) и граница механизма (B5).

Каждый случай — копия живого набора или контракта с одной порчей: проверка обязана её назвать. Живые наборы
и живой контракт обязаны проходить без отказов.

Запуск из корня репозитория, после правки tools/mechanism.py:
  python3 tools/check_mechanism.py
Код выхода 1, если хоть одна проверка не прошла.
"""
import copy
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from mechanism import VMS_WORDS, border_problems, layout_problems  # noqa: E402

failed = 0


def ok(cond, what):
    global failed
    print(("PASS " if cond else "FAIL ") + what)
    if not cond:
        failed += 1


def load(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
        return json.load(f)


dup = copy.deepcopy


def layout(fx, lid):
    return next(x for x in fx["layouts"] if x["id"] == lid)


def servers(fx):
    return layout(fx, "servers")


def folders(fx):
    return layout(fx, "folders")


def models(fx):
    return layout(fx, "agent.models")


demo = load("api/fixtures/demo.json")
agents = load("api/fixtures/agents.json")
spec = load("api/openapi.json")

live = layout_problems(demo) + layout_problems(agents)
ok(live == [], "живые наборы: раскладки целы" + ("" if not live else ": " + "; ".join(live)))
for name in ("one-domain", "large"):
    got = layout_problems(load(f"api/fixtures/{name}.json"), name)
    ok(got == [], f"собранный набор {name}: раскладки целы" + ("" if not got else ": " + "; ".join(got)))

x = dup(demo); x["layouts"].append(dict(x["layouts"][0]))
ok(any("folders" in p and "повтор" in p for p in layout_problems(x)), "L1: повтор id")
x = dup(demo); servers(x)["place"][1]["group"] = "нет"
ok(any("нет" in p and "groups" in p for p in layout_problems(x)), "L2: группа не объявлена")
x = dup(demo); servers(x)["place"][2].pop("ref")
ok(any("ref" in p for p in layout_problems(x)), "L3: by ref без ref")
x = dup(demo); servers(x)["place"][1].pop("group")
ok(any("group" in p for p in layout_problems(x)), "L3: by group без group")
x = dup(demo); servers(x)["place"][0]["where"]["property"] = "нетТакого"
ok(any("нетТакого" in p for p in layout_problems(x)), "L4: свойства нет у вида")
x = dup(agents); models(x)["place"][1]["ref"] = {"kinds": ["agent.нет"]}
ok(any("agent.нет" in p for p in layout_problems(x)), "L5: вид не объявлен")
x = dup(demo); folders(x)["hide"] = {"implements": ["vms.нет/1"]}
ok(any("vms.нет/1" in p for p in layout_problems(x)), "L5: профиль не объявлен")
x = dup(demo); folders(x)["place"] = [p for p in folders(x)["place"] if p["by"] != "folders"]
ok(any("folders" in p and "by: folders" in p for p in layout_problems(x)), "L6: папки без правила папок")
x = dup(demo); x["layouts"] = []
ok(any("getTreeChildren" in p for p in layout_problems(x)), "L7: дерево объявлено, раскладок нет")
x = dup(demo); del x["layouts"]
ok(any("getTreeChildren" in p for p in layout_problems(x)), "L7: дерево объявлено, раздела layouts нет")
x = dup(demo); x["layouts"] = []
x["reference"]["capabilities"]["operations"].remove("getTreeChildren")
ok(layout_problems(x) == [], "L7: без getTreeChildren раскладки не нужны")
x = dup(demo); servers(x)["place"][1]["group"] = "нет"
got = layout_problems(x, "one-domain")
ok(got and all(p.startswith("one-domain: раскладка servers: ") for p in got), "отказ называет набор и раскладку")

s = dup(spec); s["components"]["schemas"]["TreeLayout"]["description"] += " Камеры"
ok(any("TreeLayout" in p and "камер" in p for p in border_problems(s)), "B5: слово VMS в механизме")
s = dup(spec); s["components"]["schemas"]["PlaceRule"]["properties"]["by"]["description"] += " под сервером"
ok(any("PlaceRule" in p and "сервер" in p for p in border_problems(s)), "B5: слово VMS во вложенном описании")
s = dup(spec); s["paths"]["/tree/paths"]["get"]["description"] += " и хранилищ"
ok(any("/tree/paths" in p and "хранилищ" in p for p in border_problems(s)), "B5: слово VMS в описании пути /tree/*")
s = dup(spec); s["paths"]["/tree/children"]["get"]["parameters"][0]["description"] += " VMS"
ok(any("/tree/children" in p and "VMS" in p for p in border_problems(s)), "B5: слово VMS в параметре пути")
ok(VMS_WORDS == ("камер", "сервер", "видео", "архив", "детектор", "хранилищ", "VMS"), "B5: список слов VMS")
got = border_problems(spec)
ok(got == [], "живой контракт: B5 цела" + ("" if not got else ": " + "; ".join(got)))

print(f"RESULT {'fail' if failed else 'pass'}")
sys.exit(1 if failed else 0)
